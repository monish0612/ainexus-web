import { create } from 'zustand';
import { DEFAULT_BANKS, DEFAULT_MODELS } from '@/lib/constants';
import { applyTheme, ThemeName } from '@/lib/theme';
import { fetchPreferences, pushAppSetting, pushPreferencesBatch } from '@/lib/api/settings';

export interface Bank {
  id: string;
  name: string;
  color: string;
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
  addBank: (name: string) => void;
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
      return Array.isArray(arr) ? arr : DEFAULT_BANKS;
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

  addBank: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const banks = get().banks;
    const palette = [
      '#0D59F2', '#7C3AED', '#059669', '#DC2626',
      '#D97706', '#0891B2', '#9333EA', '#0F766E', '#BE185D',
    ];
    const color = palette[banks.length % palette.length];
    const next = [...banks, { id: `b${Date.now()}`, name: trimmed, color }];
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
