import { api } from './client';
import { useSettingsStore } from '@/store/settingsStore';
import { toNaiveLocalIso } from '@/lib/format';

/**
 * Web port of the Android `ExpenseAiSearchService`
 * (`lib/data/services/expense_ai_search_service.dart`).
 *
 * The wire contract is Android's, field for field. It is NOT re-designed for
 * the web: the backend prompt is written against these exact keys, and the two
 * clients have to be interchangeable.
 *
 *   POST /ai/expense-query
 *   {
 *     question,                       // trimmed free text
 *     now,                            // naive LOCAL ISO, seconds precision
 *     categories?: string[],          // omitted when empty
 *     liteModel?: string              // omitted when empty
 *   }
 *
 * Nothing else. No provider, no mode, no deep/thinking model id — this surface
 * is lite-only on Android and adding a second model field here would change
 * the request the backend resolver sees.
 *
 * The response is a query SPEC, not an answer set: the client runs it against
 * the expense rows it already has, so no expense data is ever uploaded.
 */

export type ExpenseSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
export type ExpenseChart = 'none' | 'daily' | 'monthly' | 'category';

export interface ExpenseQuerySpec {
  title: string;
  answer: string;
  startIso: string | null;
  endIso: string | null;
  category: string | null;
  search: string | null;
  /** Semantic OR-group from query expansion — a row matches ANY of these. */
  searchTerms: string[];
  sort: ExpenseSort;
  limit: number;
  isSummary: boolean;
  chart: ExpenseChart;
  /** Salary/income questions are answered from the user's own numbers. */
  isSalaryTopic: boolean;
  model: string | null;
}

function parseSort(raw: unknown): ExpenseSort {
  switch (typeof raw === 'string' ? raw : '') {
    case 'date_asc':
      return 'date_asc';
    case 'amount_desc':
      return 'amount_desc';
    case 'amount_asc':
      return 'amount_asc';
    default:
      return 'date_desc';
  }
}

function parseChart(mode: unknown, type: unknown): ExpenseChart {
  if (mode !== 'chart') return 'none';
  switch (typeof type === 'string' ? type : '') {
    case 'daily':
      return 'daily';
    case 'monthly':
      return 'monthly';
    case 'category':
      return 'category';
    default:
      return 'category'; // chart requested but type unclear
  }
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/**
 * Sanitize the AI's expanded keyword list: keep non-empty trimmed strings, cap
 * length, dedupe case-insensitively, cap the count. Defensive so a noisy model
 * response can never blow up the query or the UI. (Mirrors `_terms`.)
 */
function terms(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of v) {
    if (typeof e !== 'string') continue;
    const t = e.trim();
    if (!t || t.length > 40) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
    if (out.length >= 12) break;
  }
  return out;
}

function clampLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.trunc(raw) : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return 500;
  return Math.min(500, Math.max(1, n));
}

/** Mirrors `ExpenseQuerySpec.fromJson`. */
export function parseExpenseQuerySpec(m: Record<string, unknown>): ExpenseQuerySpec {
  return {
    title: str(m.title) ?? 'Results',
    answer: str(m.answer) ?? '',
    startIso: str(m.startIso),
    endIso: str(m.endIso),
    category: str(m.category),
    search: str(m.search),
    searchTerms: terms(m.searchAny),
    sort: parseSort(m.sort),
    limit: clampLimit(m.limit),
    isSummary: m.mode === 'summary',
    chart: parseChart(m.mode, m.chartType),
    isSalaryTopic: m.topic === 'salary',
    model: str(m.model),
  };
}

/**
 * Translates a natural-language expense question into an `ExpenseQuerySpec`.
 * Returns `null` on ANY failure so callers fall back to a plain keyword search
 * instead of showing an error — same contract as the Android service.
 */
export async function expenseAiQuery(
  question: string,
  opts: { categories?: string[]; liteModel?: string } = {},
): Promise<ExpenseQuerySpec | null> {
  const q = question.trim();
  if (!q) return null;
  const body: Record<string, unknown> = {
    question: q,
    // Naive local wall-clock, seconds precision — matches how expense
    // timestamps are stored and what Android sends.
    now: toNaiveLocalIso(new Date()),
  };
  if (opts.categories?.length) body.categories = opts.categories;
  const lite = (opts.liteModel ?? '').trim();
  if (lite) body.liteModel = lite;

  try {
    const { data } = await api.post('/ai/expense-query', body);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return parseExpenseQuerySpec(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** The configured Gemini lite model, read the same way every other AI call does. */
export function askAiLiteModel(): string {
  return useSettingsStore.getState().liteModel;
}
