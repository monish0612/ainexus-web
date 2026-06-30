import type { Bank } from '@/store/settingsStore';

// ── Expense domain (mirrors lib/domain/entities/expense_entities.dart) ─────────

export const EXPENSE_BANKS = ['HDFC', 'ICICI', 'AXIS', 'SCAPIA', 'CASH'] as const;
export const CARD_TYPES = ['DB', 'CC', 'Cash'] as const;
export const CARD_TYPE_LABELS: Record<string, string> = {
  DB: 'Debit',
  CC: 'Credit',
  Cash: 'Cash',
};

export const EXPENSE_CATEGORIES = [
  'Food', 'Grocery', 'Transport', 'Entertainment', 'Shopping', 'Bills',
  'Health', 'Fuel', 'Travel', 'Subscription', 'Electronics', 'Fashion',
  'Medical', 'Education', 'Family', 'Friends', 'Personal', 'Investment',
  'Rent', 'Insurance', 'Gifts', 'Charity', 'Donation', 'Pets', 'Loan', 'Others',
] as const;

export const INVESTMENT_CATEGORY = 'Investment';
export function isInvestmentCategory(c?: string | null): boolean {
  return (c ?? '').trim().toLowerCase() === INVESTMENT_CATEGORY.toLowerCase();
}

export const CATEGORY_COLORS: Record<string, string> = {
  Food: '#FF6B6B', Grocery: '#51CF66', Transport: '#339AF0', Entertainment: '#CC5DE8',
  Shopping: '#FF922B', Bills: '#FCC419', Health: '#F06595', Fuel: '#F76707',
  Travel: '#22B8CF', Subscription: '#845EF7', Electronics: '#4DABF7', Fashion: '#E64980',
  Medical: '#FA5252', Education: '#15AABF', Family: '#FAB005', Friends: '#20C997',
  Personal: '#BE4BDB', Investment: '#12B886', Rent: '#7950F2', Insurance: '#1C7ED6',
  Gifts: '#F783AC', Charity: '#94D82D', Donation: '#66D9E8', Pets: '#FFA94D',
  Loan: '#FF8787', Others: '#868E96',
};

export const CATEGORY_ICONS: Record<string, string> = {
  Food: '🍽️', Grocery: '🛒', Transport: '🚗', Entertainment: '🎬',
  Shopping: '🛍️', Bills: '📄', Health: '💊', Fuel: '⛽',
  Travel: '✈️', Subscription: '🔁', Electronics: '💻', Fashion: '👗',
  Medical: '🏥', Education: '📚', Family: '👨‍👩‍👧', Friends: '🧑‍🤝‍🧑',
  Personal: '🧴', Investment: '📈', Rent: '🏠', Insurance: '🛡️',
  Gifts: '🎁', Charity: '🤝', Donation: '❤️', Pets: '🐾',
  Loan: '🏦', Others: '📦',
};

export function categoryColor(c?: string | null): string {
  return CATEGORY_COLORS[c ?? ''] ?? '#868E96';
}
export function categoryIcon(c?: string | null): string {
  return CATEGORY_ICONS[c ?? ''] ?? '📦';
}

export const BUDGET_PRESETS = [5000, 10000, 20000, 50000];

// ── News domain (mirrors lib/domain/entities/news_entities.dart) ───────────────

export const NEWS_CATEGORIES = ['Finance', 'AI News', 'Movies', 'General'] as const;
export const NEWS_CAT_COLOR: Record<string, string> = {
  Finance: '#10B981',
  'AI News': '#F59E0B',
  Movies: '#EC4899',
  General: '#38BDF8',
};
/** Categories that ship the full article body (no auto AI summary). */
export const NO_SUMMARIZE_CATEGORIES = new Set(['Movies', 'General']);

// ── Tutor: rephrase platforms (mirrors AI_REPHRASE_PLATFORM_META) ─────────────

export interface RephrasePlatform {
  id: string;
  label: string;
  icon: string;
  desc: string;
}
export const REPHRASE_PLATFORMS: RephrasePlatform[] = [
  { id: 'own', label: 'Custom', icon: '✨', desc: 'Your own instruction' },
  { id: 'casual', label: 'Casual', icon: '😎', desc: 'Relaxed & friendly' },
  { id: 'sarcastic', label: 'Sarcastic', icon: '😏', desc: 'Witty & dry' },
  { id: 'email-long', label: 'Email (Long)', icon: '📧', desc: 'Detailed email' },
  { id: 'email-short', label: 'Email (Short)', icon: '✉️', desc: 'Concise email' },
  { id: 'slack', label: 'Slack', icon: '💬', desc: 'Team chat' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '🟢', desc: 'Personal message' },
  { id: 'twitter', label: 'X / Twitter', icon: '🐦', desc: '≤280 chars' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', desc: 'Professional post' },
  { id: 'teams', label: 'Teams', icon: '👥', desc: 'Microsoft Teams' },
  { id: 'zoom', label: 'Zoom', icon: '🎥', desc: 'Meeting chat' },
  { id: 'forum', label: 'Forum', icon: '🗣️', desc: 'Community post' },
];

// ── AI providers / models (mirrors settings_controller.dart) ───────────────────

export const DEFAULT_MODELS = {
  deepModel: 'gemini-3.1-pro-preview',
  liteModel: 'gemini-3.1-flash-lite-preview',
  xgrokLiteModel: 'grok-4-1-fast-non-reasoning',
  xgrokDeepModel: 'grok-4-0709',
  xgrokThinkingModel: 'grok-4-1-fast-reasoning',
};

// Card types a configured bank entry can represent (mirrors CARD_TYPES).
export const BANK_CARD_TYPES = ['DB', 'CC', 'Cash'] as const;

// Seeded to mirror the real payment instruments used in expense entry. Each
// entry is a (bank, cardType) card; CC cards carry their billing cycle
// (statementDay = day the statement closes, dueDay = day the bill is due in the
// following month). Mirror of `_defaultBanks` in settings_controller.dart.
export const DEFAULT_BANKS: Bank[] = [
  { id: 'hdfc_db', name: 'HDFC', color: '#004C8F', cardType: 'DB' },
  { id: 'hdfc_cc', name: 'HDFC', color: '#004C8F', cardType: 'CC', statementDay: 18, dueDay: 9 },
  { id: 'icici_db', name: 'ICICI', color: '#B02A2A', cardType: 'DB' },
  { id: 'axis_db', name: 'AXIS', color: '#97144D', cardType: 'DB' },
  { id: 'axis_cc', name: 'AXIS', color: '#97144D', cardType: 'CC', statementDay: 24, dueDay: 13 },
  { id: 'scapia_cc', name: 'SCAPIA', color: '#6D28D9', cardType: 'CC', statementDay: 26, dueDay: 15 },
  { id: 'cash', name: 'CASH', color: '#868E96', cardType: 'Cash' },
];

export const BANK_PALETTE = [
  '#0D59F2', '#7C3AED', '#059669', '#DC2626',
  '#D97706', '#0891B2', '#9333EA', '#0F766E', '#BE185D',
];
