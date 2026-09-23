import { describe, it, expect } from 'vitest';
import type { Expense } from '@/lib/api/expense';
import {
  calendarMonthSpend,
  inPeriod,
  spendOnly,
  totalLoans,
  totalInvestments,
  type Period,
} from './insights';

// Fixed "now" away from month edges so the day math is unambiguous.
const NOW = new Date('2026-07-15T10:30:00');

function exp(id: string, date: string, category = 'Food'): Expense {
  return {
    id,
    amount: 100,
    description: id,
    category,
    bank: 'HDFC',
    cardType: 'DB',
    date,
    isManualCategory: false,
    comments: '',
  };
}

const has = (list: Expense[], id: string) => list.some((e) => e.id === id);
const scoped = (all: Expense[], p: Period) => inPeriod(all, p, NOW);

describe('inPeriod — date → period bucketing', () => {
  it('today lands in every rolling window + all, not excluded by upper bound', () => {
    const all = [exp('today', '2026-07-15T09:00:00')];
    for (const p of ['today', '7d', '1m', '6m', 'all'] as Period[]) {
      expect(has(scoped(all, p), 'today')).toBe(true);
    }
  });

  it('a date a few days ago is in 7d/1m/6m/all but not today', () => {
    const all = [exp('d3', '2026-07-12T12:00:00')];
    expect(has(scoped(all, 'today'), 'd3')).toBe(false);
    expect(has(scoped(all, '7d'), 'd3')).toBe(true);
    expect(has(scoped(all, '1m'), 'd3')).toBe(true);
    expect(has(scoped(all, 'all'), 'd3')).toBe(true);
  });

  it('last-month date is in 6m/all but not 7d', () => {
    const all = [exp('lastMonth', '2026-06-15T12:00:00')];
    expect(has(scoped(all, '7d'), 'lastMonth')).toBe(false);
    expect(has(scoped(all, '6m'), 'lastMonth')).toBe(true);
    expect(has(scoped(all, 'all'), 'lastMonth')).toBe(true);
  });

  it('older than 6 months only shows under All', () => {
    const all = [exp('old', '2025-01-05T12:00:00')];
    expect(has(scoped(all, '6m'), 'old')).toBe(false);
    expect(has(scoped(all, 'all'), 'old')).toBe(true);
  });

  it('a NEXT-MONTH bill never leaks into today/7d/1m/6m — only All', () => {
    const all = [exp('nextMonth', '2026-08-01T12:00:00')];
    for (const p of ['today', '7d', '1m', '6m'] as Period[]) {
      expect(has(scoped(all, p), 'nextMonth')).toBe(false);
    }
    expect(has(scoped(all, 'all'), 'nextMonth')).toBe(true);
  });

  it('all-time returns everything regardless of date (incl. future)', () => {
    const all = [
      exp('past', '2024-03-03T12:00:00'),
      exp('now', '2026-07-15T08:00:00'),
      exp('future', '2026-09-20T12:00:00'),
    ];
    const out = scoped(all, 'all');
    expect(out).toHaveLength(3);
  });

  it('malformed dates are dropped from bounded periods, kept in all, never throw', () => {
    const all = [exp('bad', 'not-a-date')];
    expect(() => scoped(all, '1m')).not.toThrow();
    expect(has(scoped(all, '1m'), 'bad')).toBe(false);
    // 'all' short-circuits (no bounds) so it returns the raw list.
    expect(has(scoped(all, 'all'), 'bad')).toBe(true);
  });
});

describe('spendOnly — investments & loans excluded', () => {
  it('drops Investment- and Loan-category rows from spend', () => {
    const all = [
      exp('spend', '2026-07-15T09:00:00'),
      exp('inv', '2026-07-15T09:00:00', 'Investment'),
      exp('loan', '2026-07-15T09:00:00', 'Loan'),
    ];
    const out = spendOnly(all);
    expect(has(out, 'spend')).toBe(true);
    expect(has(out, 'inv')).toBe(false);
    expect(has(out, 'loan')).toBe(false);
  });
});

describe('totalLoans / totalInvestments — separated buckets', () => {
  it('sums only the matching non-spend category', () => {
    const all = [
      exp('spend', '2026-07-15T09:00:00'),
      exp('inv', '2026-07-15T09:00:00', 'Investment'),
      exp('loan', '2026-07-15T09:00:00', 'Loan'),
    ];
    // each row is amount 100
    expect(totalLoans(all)).toBe(100);
    expect(totalInvestments(all)).toBe(100);
  });

  it('a large loan does not leak into the budget spend total', () => {
    const all = [
      { ...exp('food', '2026-07-15T09:00:00'), amount: 10000 },
      { ...exp('homeloan', '2026-07-15T09:00:00', 'Loan'), amount: 50000 },
    ];
    const spent = spendOnly(inPeriod(all, '1m', NOW)).reduce((s, e) => s + e.amount, 0);
    expect(spent).toBe(10000);
    expect(calendarMonthSpend(all, NOW)).toBe(10000);
    expect(totalLoans(all)).toBe(50000);
  });
});

describe('calendarMonthSpend — phone Tracker month, not Insights chips', () => {
  it('counts only this calendar month and drops Investment, Loan, future, and bad dates', () => {
    const all = [
      exp('early', '2026-07-02T12:00:00'),
      exp('prev', '2026-06-20T12:00:00'),
      exp('inv', '2026-07-03T12:00:00', 'Investment'),
      exp('loan', '2026-07-04T12:00:00', 'Loan'),
      exp('future', '2026-08-01T12:00:00'),
      exp('bad', 'not-a-date'),
    ];
    expect(calendarMonthSpend(all, NOW)).toBe(100);
    // Rolling Insights "1m" still includes 20 June. Phone Insights "Month" is
    // its own 30-day chip and is not this Tracker total.
    expect(has(scoped(all, '1m'), 'prev')).toBe(true);
  });
});
