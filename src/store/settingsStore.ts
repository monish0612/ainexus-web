import { create } from 'zustand';
import { DEFAULT_BANKS, DEFAULT_MODELS } from '@/lib/constants';
import { applyTheme, ThemeName } from '@/lib/theme';
import { fetchPreferences, pushAppSetting, pushPreferencesBatch } from '@/lib/api/settings';

export type BankCardType = 'DB' | 'CC' | 'Cash';

/**
 * A configured payment instrument: a bank name + a single card type. Credit
 * cards (cardType 'CC') additionally carry their billing cycle — statementDay
 * (day the statement closes) and dueDay (day the bill is due, in the month
 * after it closes). Both are undefined for non-CC cards. Stored as JSON inside
 * the synced `app_banks` preference, so the schema must stay compatible with
 * the Flutter `Bank` model.
 */
export interface Bank {
  id: string;
  name: string;
  color: string;
  cardType?: BankCardType;
  statementDay?: number;
  dueDay?: number;
}

function clampDay(v: unknown): number | undefined {
  const n = typeof v === 'number' ? Math.trunc(v) : parseInt(String(v ?? ''), 10);
  // Missing/garbage → undefined (no cycle); finite values clamp into [1, 31] to
  // stay in lock-step with Flutter's `_clampDay` so the same input round-trips
  // identically on both platforms.
  if (!Number.isFinite(n)) return undefined;
  return Math.min(31, Math.max(1, n));
}

/** Normalizes an arbitrary parsed object into a valid Bank (defensive decode). */
function normalizeBank(raw: unknown): Bank | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null;
  const type = (['DB', 'CC', 'Cash'] as const).includes(o.cardType as BankCardType)
    ? (o.cardType as BankCardType)
    : 'DB';
  const isCc = type === 'CC';
  return {
    id: o.id,
    name: o.name,
    color: typeof o.color === 'string' ? o.color : '#868E96',
    cardType: type,
    statementDay: isCc ? clampDay(o.statementDay) : undefined,
    dueDay: isCc ? clampDay(o.dueDay) : undefined,
  };
}

export type Provider = 'gemini' | 'xgrok';

export interface SettingsState {
  theme: ThemeName;
  banks: Bank[];
  deepModel: string;
  liteModel: string;
  xgrokEnabled: boolean;
  xgrokLiteModel: string;
  xgrokDeepModel: string;
  xgrokThinkingModel: string;
  summarizeOverride: Provider;
  defaultFollowUpProvider: Provider;
  onlineSearchProvider: Provider;
}

interface SettingsStore extends SettingsState {
  hydrated: boolean;
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  addBank: (
    name: string,
    opts?: { cardType?: BankCardType; statementDay?: number; dueDay?: number; color?: string },
  ) => void;
  updateBank: (
    id: string,
    patch: { name?: string; cardType?: BankCardType; statementDay?: number; dueDay?: number; color?: string },
  ) => void;
  deleteBank: (id: string) => void;
  syncFromServer: () => Promise<void>;
}

const LOCAL_KEY = 'nxs_settings_v1';

// Server/pref key  <->  state field (the 11 synced keys).
const KEY_MAP: Record<string, keyof SettingsState> = {
  app_theme: 'theme',
  deep_model: 'deepModel',
  lite_model: 'liteModel',
  xgrok_enabled: 'xgrokEnabled',
  xgrok_lite_model: 'xgrokLiteModel',
  xgrok_deep_model: 'xgrokDeepModel',
  xgrok_thinking_model: 'xgrokThinkingModel',
  summarize_override: 'summarizeOverride',
  default_followup_provider: 'defaultFollowUpProvider',
  online_search_provider: 'onlineSearchProvider',
  app_banks: 'banks',
};
const FIELD_TO_KEY = Object.fromEntries(
  Object.entries(KEY_MAP).map(([k, v]) => [v, k]),
) as Record<keyof SettingsState, string>;

const DEFAULTS: SettingsState = {
  theme: 'dark',
  banks: DEFAULT_BANKS,
  deepModel: DEFAULT_MODELS.deepModel,
  liteModel: DEFAULT_MODELS.liteModel,
  xgrokEnabled: false,
  xgrokLiteModel: DEFAULT_MODELS.xgrokLiteModel,
  xgrokDeepModel: DEFAULT_MODELS.xgrokDeepModel,
  xgrokThinkingModel: DEFAULT_MODELS.xgrokThinkingModel,
  summarizeOverride: 'gemini',
  defaultFollowUpProvider: 'gemini',
  onlineSearchProvider: 'gemini',
};

function encode(field: keyof SettingsState, value: unknown): string {
  if (field === 'banks') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function decode(field: keyof SettingsState, raw: string): unknown {
  if (field === 'banks') {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return DEFAULT_BANKS;
      const banks = arr.map(normalizeBank).filter((b): b is Bank => b !== null);
      return banks.length ? banks : DEFAULT_BANKS;
    } catch {
      return DEFAULT_BANKS;
    }
  }
  if (field === 'xgrokEnabled') return raw === 'true';
  return raw;
}

function loadLocal(): SettingsState {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function persistLocal(state: SettingsState) {
  const snapshot: Record<string, unknown> = {};
  (Object.keys(DEFAULTS) as (keyof SettingsState)[]).forEach((k) => {
    snapshot[k] = state[k];
  });
  localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
}

function pushFields(state: SettingsState, fields: (keyof SettingsState)[]) {
  const entries = fields.map((f) => ({
    key: FIELD_TO_KEY[f],
    value: encode(f, state[f]),
  }));
  pushPreferencesBatch(entries).catch(() => {
    /* fail-safe: local already saved; will re-sync on next change */
  });
}

const initial = loadLocal();
applyTheme(initial.theme);

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...initial,
  hydrated: false,

  set: (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    const state = get();
    persistLocal(state);
    if (key === 'theme') applyTheme(state.theme);
    pushFields(state, [key]);
    // The article-summarize provider also drives a backend pipeline setting.
    if (key === 'summarizeOverride') {
      pushAppSetting(
        'news_summarize_provider',
        value === 'xgrok' ? 'xgrok' : 'litellm',
      ).catch(() => {});
    }
  },

  addBank: (name, opts) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const banks = get().banks;
    const palette = [
      '#0D59F2', '#7C3AED', '#059669', '#DC2626',
      '#D97706', '#0891B2', '#9333EA', '#0F766E', '#BE185D',
    ];
    const color = opts?.color ?? palette[banks.length % palette.length];
    const type: BankCardType = opts?.cardType ?? 'DB';
    const isCc = type === 'CC';
    const bank: Bank = {
      id: `b${Date.now()}`,
      name: trimmed,
      color,
      cardType: type,
      statementDay: isCc ? clampDay(opts?.statementDay) : undefined,
      dueDay: isCc ? clampDay(opts?.dueDay) : undefined,
    };
    set({ banks: [...banks, bank] });
    persistLocal(get());
    pushFields(get(), ['banks']);
  },

  updateBank: (id, patch) => {
    const next = get().banks.map((b) => {
      if (b.id !== id) return b;
      const type: BankCardType = patch.cardType ?? b.cardType ?? 'DB';
      const isCc = type === 'CC';
      return {
        ...b,
        name: patch.name?.trim() ? patch.name.trim() : b.name,
        color: patch.color ?? b.color,
        cardType: type,
        statementDay: isCc ? (clampDay(patch.statementDay) ?? b.statementDay) : undefined,
        dueDay: isCc ? (clampDay(patch.dueDay) ?? b.dueDay) : undefined,
      };
    });
    set({ banks: next });
    persistLocal(get());
    pushFields(get(), ['banks']);
  },

  deleteBank: (id) => {
    set({ banks: get().banks.filter((b) => b.id !== id) });
    persistLocal(get());
    pushFields(get(), ['banks']);
  },

  syncFromServer: async () => {
    try {
      const remote = await fetchPreferences();
      if (remote && Object.keys(remote).length) {
        const patch: Partial<SettingsState> = {};
        for (const [serverKey, field] of Object.entries(KEY_MAP)) {
          const raw = remote[serverKey];
          if (raw != null) {
            (patch as Record<string, unknown>)[field] = decode(field, raw);
          }
        }
        set(patch);
        const state = get();
        persistLocal(state);
        applyTheme(state.theme);
      } else {
        // Empty server — seed it from local.
        pushFields(get(), Object.keys(DEFAULTS) as (keyof SettingsState)[]);
      }
    } catch {
      /* offline — keep local */
    } finally {
      set({ hydrated: true });
    }
  },
}));

export function isDarkTheme(s: SettingsState): boolean {
  return s.theme === 'dark';
}
