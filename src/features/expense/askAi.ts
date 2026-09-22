import { Expense } from '@/lib/api/expense';
import { ExpenseQuerySpec, ExpenseSort } from '@/lib/api/expenseAi';

/**
 * Runs an AI-produced query spec against the expense rows the client already
 * has — the web equivalent of Android executing the spec against its local
 * Drift DB. No expense data is uploaded to produce this.
 *
 * The filter semantics are copied from `ExpenseRepository._applyRangeFilters`
 * so the same question returns the same rows on both platforms:
 *
 *   • `date >= startIso` and `date < endIso` — the upper bound is EXCLUSIVE.
 *     Dates are compared as strings, exactly like the SQL does, because the
 *     stored value is a naive local ISO and lexical order is chronological.
 *   • `category` is an EXACT match, not a contains.
 *   • `search` is a case-insensitive contains over description / category /
 *     comments (note: not bank), ANDed with everything else.
 *   • `searchTerms` is an OR-group over the same three fields.
 */

function haystack(e: Expense): string {
  return `${e.description ?? ''}\u0000${e.category ?? ''}\u0000${e.comments ?? ''}`.toLowerCase();
}

function matchesTerm(e: Expense, term: string): boolean {
  return haystack(e).includes(term.toLowerCase());
}

const SORTERS: Record<ExpenseSort, (a: Expense, b: Expense) => number> = {
  date_desc: (a, b) => (b.date || '').localeCompare(a.date || ''),
  date_asc: (a, b) => (a.date || '').localeCompare(b.date || ''),
  amount_desc: (a, b) => b.amount - a.amount,
  amount_asc: (a, b) => a.amount - b.amount,
};

export function runExpenseQuerySpec(expenses: Expense[], spec: ExpenseQuerySpec): Expense[] {
  const search = spec.search?.trim() ?? '';
  const cat = spec.category?.trim() ?? '';

  const rows = expenses.filter((e) => {
    const date = e.date || '';
    if (spec.startIso && date < spec.startIso) return false;
    if (spec.endIso && date >= spec.endIso) return false;
    if (cat && (e.category ?? '') !== cat) return false;
    if (search && !matchesTerm(e, search)) return false;
    if (spec.searchTerms.length && !spec.searchTerms.some((t) => matchesTerm(e, t))) return false;
    return true;
  });

  return [...rows].sort(SORTERS[spec.sort] ?? SORTERS.date_desc).slice(0, spec.limit);
}

/**
 * The graceful fallback Android uses when the AI is unavailable: rather than
 * erroring, treat the raw question as a keyword search so results still show.
 * Mirrors the `spec == null` branch of `_ExpenseAiAskSheetState._submit`.
 */
export function keywordFallbackSpec(question: string): ExpenseQuerySpec {
  const q = question.trim();
  return {
    title: q.length > 28 ? `${q.substring(0, 28)}…` : q,
    answer:
      `Showing keyword matches for "${q}" ` +
      '(AI is offline — refine with the search box).',
    startIso: null,
    endIso: null,
    category: null,
    search: q,
    searchTerms: [],
    sort: 'date_desc',
    limit: 500,
    isSummary: false,
    chart: 'none',
    isSalaryTopic: false,
    model: null,
  };
}

export interface AskAiBucket {
  label: string;
  value: number;
}

/** Chart buckets for the `chart` modes the spec can ask for. */
export function bucketsFor(rows: Expense[], chart: ExpenseQuerySpec['chart']): AskAiBucket[] {
  if (chart === 'none') return [];
  const map = new Map<string, number>();
  for (const e of rows) {
    const key =
      chart === 'category'
        ? e.category || 'Others'
        : chart === 'monthly'
          ? (e.date || '').slice(0, 7)
          : (e.date || '').slice(0, 10);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + e.amount);
  }
  const entries = [...map.entries()];
  // Category buckets read best biggest-first; time buckets have to stay in
  // chronological order or the trend is meaningless.
  if (chart === 'category') entries.sort((a, b) => b[1] - a[1]);
  else entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([label, value]) => ({ label, value }));
}

export function sumOf(rows: Expense[]): number {
  return rows.reduce((s, e) => s + e.amount, 0);
}
