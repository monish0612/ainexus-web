import { Expense } from '@/lib/api/expense';
import { isInvestmentCategory } from '@/lib/constants';
import { safeParseDate } from '@/lib/format';

export type Period = 'today' | '7d' | '1m' | '6m' | 'all';

export const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  '7d': '7D',
  '1m': '1M',
  '6m': '6M',
  all: 'All',
};

function periodStart(period: Period): Date | null {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case 'today':
      d.setHours(0, 0, 0, 0);
      return d;
    case '7d':
      d.setDate(d.getDate() - 7);
      return d;
    case '1m':
      d.setMonth(d.getMonth() - 1);
      return d;
    case '6m':
      d.setMonth(d.getMonth() - 6);
      return d;
    case 'all':
      return null;
  }
}

/** Consumption only (drops Investment). */
export function spendOnly(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !isInvestmentCategory(e.category));
}

export function inPeriod(expenses: Expense[], period: Period): Expense[] {
  const start = periodStart(period);
  if (!start) return expenses;
  return expenses.filter((e) => {
    const d = safeParseDate(e.date);
    return d != null && d >= start;
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
