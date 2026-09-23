import { Expense } from '@/lib/api/expense';
import { isInvestmentCategory, isLoanCategory, isNonSpendCategory } from '@/lib/constants';
import { safeParseDate } from '@/lib/format';

export type Period = 'today' | '7d' | '1m' | '6m' | 'all';

export const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  '7d': '7D',
  '1m': '1M',
  '6m': '6M',
  all: 'All',
};

/**
 * Inclusive date bounds `[start, end]` for a period. Rolling periods
 * (today/7d/1m/6m) get an upper bound of *end of today* so a future-dated
 * entry — e.g. a next-month credit-card bill logged in advance — never leaks
 * into the current windows (it stays visible in the full tracker list and
 * under "All", where it belongs). `all` has no bounds and includes everything.
 *
 * `now` is injectable purely so the date→period contract can be unit-tested
 * deterministically.
 */
export function periodBounds(
  period: Period,
  now: Date = new Date(),
): { start: Date | null; end: Date | null } {
  if (period === 'all') return { start: null, end: null };
  const start = new Date(now);
  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '1m':
      start.setMonth(start.getMonth() - 1);
      break;
    case '6m':
      start.setMonth(start.getMonth() - 6);
      break;
  }
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Consumption only (drops Investment and Loan repayments). */
export function spendOnly(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !isNonSpendCategory(e.category));
}

/**
 * Phone Tracker "This month" and the Insights budget ring: the calendar
 * month containing [now], spend only. Phone Insights chips stay on their own
 * windows (Week = 7 days, Month = 30 days) and are not this function.
 */
export function calendarMonthSpend(expenses: Expense[], now: Date = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let total = 0;
  for (const e of expenses) {
    if (isNonSpendCategory(e.category)) continue;
    const d = safeParseDate(e.date);
    if (d == null) continue;
    if (d >= start && d < end) total += e.amount;
  }
  return total;
}

export function inPeriod(
  expenses: Expense[],
  period: Period,
  now: Date = new Date(),
): Expense[] {
  const { start, end } = periodBounds(period, now);
  if (!start && !end) return expenses;
  return expenses.filter((e) => {
    const d = safeParseDate(e.date);
    if (d == null) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

export interface Kpis {
  total: number;
  avgPerDay: number;
  count: number;
  biggest: number;
}

export function computeKpis(expenses: Expense[], period: Period): Kpis {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const count = expenses.length;
  const biggest = expenses.reduce((m, e) => Math.max(m, e.amount), 0);
  const days =
    period === 'today'
      ? 1
      : period === '7d'
        ? 7
        : period === '1m'
          ? 30
          : period === '6m'
            ? 180
            : Math.max(1, distinctDays(expenses));
  return { total, count, biggest, avgPerDay: total / days };
}

function distinctDays(expenses: Expense[]): number {
  const set = new Set<string>();
  for (const e of expenses) set.add((e.date || '').slice(0, 10));
  return set.size || 1;
}

export interface NamedTotal {
  name: string;
  value: number;
  count: number;
}

export function byCategory(expenses: Expense[]): NamedTotal[] {
  const map = new Map<string, NamedTotal>();
  for (const e of expenses) {
    const cur = map.get(e.category) ?? { name: e.category, value: 0, count: 0 };
    cur.value += e.amount;
    cur.count += 1;
    map.set(e.category, cur);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function byBank(expenses: Expense[]): NamedTotal[] {
  const map = new Map<string, NamedTotal>();
  for (const e of expenses) {
    const key = e.bank || 'Other';
    const cur = map.get(key) ?? { name: key, value: 0, count: 0 };
    cur.value += e.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export interface TrendPoint {
  label: string;
  value: number;
}

/** Daily (or monthly for 6m/all) spend series, chronologically. */
export function trendSeries(expenses: Expense[], period: Period): TrendPoint[] {
  const monthly = period === '6m' || period === 'all';
  const map = new Map<string, number>();
  for (const e of expenses) {
    const d = safeParseDate(e.date);
    if (!d) continue;
    const key = monthly
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : (e.date || '').slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + e.amount);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({
      label: monthly
        ? new Date(`${key}-01`).toLocaleDateString('en-IN', { month: 'short' })
        : new Date(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      value,
    }));
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dayOfWeekSeries(expenses: Expense[]): TrendPoint[] {
  const totals = new Array(7).fill(0);
  for (const e of expenses) {
    const d = safeParseDate(e.date);
    if (d) totals[d.getDay()] += e.amount;
  }
  // Mon..Sun ordering for a friendlier chart.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((i) => ({ label: DOW[i], value: totals[i] }));
}

export function totalInvestments(expenses: Expense[]): number {
  return expenses
    .filter((e) => isInvestmentCategory(e.category))
    .reduce((s, e) => s + e.amount, 0);
}

export function totalLoans(expenses: Expense[]): number {
  return expenses
    .filter((e) => isLoanCategory(e.category))
    .reduce((s, e) => s + e.amount, 0);
}
