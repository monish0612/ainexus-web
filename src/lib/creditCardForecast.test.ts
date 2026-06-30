import { describe, expect, it } from 'vitest';
import {
  buildCreditCardForecast,
  cardBillTimingFor,
  ccBankConfigs,
  computeCreditCardForecast,
  dueDateFor,
  repayingSalaryMonthKey,
  statementCloseDate,
  type BankBillingConfig,
} from './creditCardForecast';
import type { Bank } from '@/store/settingsStore';
import type { Expense, SalaryEntry } from '@/lib/api/expense';

const hdfc: BankBillingConfig = { name: 'HDFC', color: '#004C8F', statementDay: 18, dueDay: 9 };
const axis: BankBillingConfig = { name: 'AXIS', color: '#97144D', statementDay: 24, dueDay: 13 };

// Local-date helper that matches the engine's makeDate (avoids TZ surprises).
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

describe('statementCloseDate', () => {
  it('charge on/before the statement day closes this month', () => {
    expect(iso(statementCloseDate(d(2026, 6, 10), 18))).toBe('2026-06-18');
    expect(iso(statementCloseDate(d(2026, 6, 18), 18))).toBe('2026-06-18');
  });
  it('charge after the statement day rolls to next month', () => {
    expect(iso(statementCloseDate(d(2026, 6, 19), 18))).toBe('2026-07-18');
    expect(iso(statementCloseDate(d(2026, 6, 25), 18))).toBe('2026-07-18');
  });
  it('rolls across a year boundary', () => {
    expect(iso(statementCloseDate(d(2026, 12, 25), 18))).toBe('2027-01-18');
  });
  it('clamps the statement day to the month length', () => {
    expect(iso(statementCloseDate(d(2026, 2, 10), 31))).toBe('2026-02-28');
  });
});

describe('dueDateFor', () => {
  it('bill is due the month after the statement closes', () => {
    expect(iso(dueDateFor(d(2026, 6, 18), 9))).toBe('2026-07-09');
    expect(iso(dueDateFor(d(2026, 12, 18), 9))).toBe('2027-01-09');
  });
});

describe('repayingSalaryMonthKey', () => {
  it('due before the credit day → that month salary', () => {
    expect(repayingSalaryMonthKey(d(2026, 7, 9))).toBe('2026-07');
  });
  it('due on/after the credit day → next month salary', () => {
    expect(repayingSalaryMonthKey(d(2026, 7, 28))).toBe('2026-08');
    expect(repayingSalaryMonthKey(d(2026, 7, 30))).toBe('2026-08');
  });
});

describe('cardBillTimingFor — HDFC worked example', () => {
  it('Jun 10 → closes Jun 18 → due Jul 9 → July salary', () => {
    const t = cardBillTimingFor(d(2026, 6, 10), 18, 9);
    expect(iso(t.statementClose)).toBe('2026-06-18');
    expect(iso(t.dueDate)).toBe('2026-07-09');
    expect(t.salaryMonthKey).toBe('2026-07');
  });
  it('Jun 25 → closes Jul 18 → due Aug 9 → August salary', () => {
    const t = cardBillTimingFor(d(2026, 6, 25), 18, 9);
    expect(iso(t.statementClose)).toBe('2026-07-18');
    expect(iso(t.dueDate)).toBe('2026-08-09');
    expect(t.salaryMonthKey).toBe('2026-08');
  });
});

describe('computeCreditCardForecast', () => {
  it('buckets per bank into the right statement + salary month', () => {
    const f = computeCreditCardForecast({
      ccBanks: [hdfc, axis],
      ccExpenses: [
        { bank: 'HDFC', amount: 1000, date: d(2026, 6, 10) },
        { bank: 'HDFC', amount: 500, date: d(2026, 6, 15) },
        { bank: 'HDFC', amount: 2000, date: d(2026, 6, 25) },
        { bank: 'AXIS', amount: 800, date: d(2026, 6, 20) },
      ],
      salaryByMonth: { '2026-07': 50000, '2026-08': 50000 },
      now: d(2026, 6, 16),
    });
    expect(f.statements.length).toBe(3);
    const july = f.statements.filter((s) => s.salaryMonthKey === '2026-07');
    expect(july.reduce((a, b) => a + b.total, 0)).toBe(2300);
    const aug = f.statements.filter((s) => s.salaryMonthKey === '2026-08');
    expect(aug.reduce((a, b) => a + b.total, 0)).toBe(2000);
  });

  it('projects in-hand = salary − assigned bills', () => {
    const f = computeCreditCardForecast({
      ccBanks: [hdfc],
      ccExpenses: [{ bank: 'HDFC', amount: 12000, date: d(2026, 6, 10) }],
      salaryByMonth: { '2026-07': 50000 },
      now: d(2026, 6, 16),
    });
    const m = f.timeline.find((x) => x.monthKey === '2026-07')!;
    expect(m.cardBills).toBe(12000);
    expect(m.projectedInHand).toBe(38000);
    expect(m.isShort).toBe(false);
  });

  it('flags a short month when bills exceed salary', () => {
    const f = computeCreditCardForecast({
      ccBanks: [hdfc],
      ccExpenses: [{ bank: 'HDFC', amount: 60000, date: d(2026, 6, 10) }],
      salaryByMonth: { '2026-07': 50000 },
      now: d(2026, 6, 16),
    });
    const m = f.timeline.find((x) => x.monthKey === '2026-07')!;
    expect(m.isShort).toBe(true);
    expect(m.projectedInHand).toBe(-10000);
  });

  it('attaches the contributing charges to each statement, newest first', () => {
    const f = computeCreditCardForecast({
      ccBanks: [hdfc],
      ccExpenses: [
        { bank: 'HDFC', amount: 1000, date: d(2026, 6, 10), description: 'Groceries', category: 'Grocery' },
        { bank: 'HDFC', amount: 500, date: d(2026, 6, 15), description: 'Dinner', category: 'Food' },
      ],
      salaryByMonth: { '2026-07': 50000 },
      now: d(2026, 6, 16),
    });
    expect(f.statements.length).toBe(1);
    const items = f.statements[0].items;
    expect(items.length).toBe(2);
    expect(iso(items[0].date)).toBe('2026-06-15');
    expect(items[0].description).toBe('Dinner');
    expect(items[1].description).toBe('Groceries');
    expect(items.reduce((a, b) => a + b.amount, 0)).toBe(1500);
  });

  it('open statement is the still-accumulating window', () => {
    const f = computeCreditCardForecast({
      ccBanks: [hdfc],
      ccExpenses: [
        { bank: 'HDFC', amount: 1000, date: d(2026, 5, 10) },
        { bank: 'HDFC', amount: 3000, date: d(2026, 6, 12) },
      ],
      salaryByMonth: {},
      now: d(2026, 6, 16),
    });
    expect(f.openStatements.length).toBe(1);
    expect(f.openStatements[0].total).toBe(3000);
    expect(f.openStatements[0].isOpen).toBe(true);
  });

  it('records CC banks without a cycle as unconfigured', () => {
    const f = computeCreditCardForecast({
      ccBanks: [hdfc],
      ccExpenses: [{ bank: 'AMEX', amount: 999, date: d(2026, 6, 12) }],
      salaryByMonth: {},
      now: d(2026, 6, 16),
    });
    expect(f.unconfiguredBanks).toContain('AMEX');
    expect(f.statements.length).toBe(0);
    expect(f.hasActivity).toBe(false);
  });

  it('matches bank names case-insensitively', () => {
    const f = computeCreditCardForecast({
      ccBanks: [hdfc],
      ccExpenses: [{ bank: 'hdfc', amount: 1000, date: d(2026, 6, 10) }],
      salaryByMonth: {},
      now: d(2026, 6, 16),
    });
    expect(f.statements.length).toBe(1);
    expect(f.unconfiguredBanks.length).toBe(0);
  });

  it('empty input yields an inactive forecast with a 3-month timeline', () => {
    const f = computeCreditCardForecast({
      ccBanks: [],
      ccExpenses: [],
      salaryByMonth: {},
      now: d(2026, 6, 16),
    });
    expect(f.hasActivity).toBe(false);
    expect(f.timeline.length).toBe(3);
  });
});

describe('ccBankConfigs', () => {
  it('keeps only credit cards that have both billing days', () => {
    const banks: Bank[] = [
      { id: '1', name: 'HDFC', color: '#000', cardType: 'CC', statementDay: 18, dueDay: 9 },
      { id: '2', name: 'ICICI', color: '#000', cardType: 'DB' },
      { id: '3', name: 'AXIS', color: '#000', cardType: 'CC' }, // dayless → excluded
      { id: '4', name: 'CASH', color: '#000', cardType: 'Cash' },
    ];
    const configs = ccBankConfigs(banks);
    expect(configs.length).toBe(1);
    expect(configs[0].name).toBe('HDFC');
    expect(configs[0].statementDay).toBe(18);
  });
});

describe('buildCreditCardForecast — the real web entry path', () => {
  const banks: Bank[] = [
    { id: '1', name: 'HDFC', color: '#004C8F', cardType: 'CC', statementDay: 18, dueDay: 9 },
  ];
  const exp = (over: Partial<Expense>): Expense => ({
    id: Math.random().toString(),
    amount: 1000,
    description: '',
    category: 'Food',
    bank: 'HDFC',
    cardType: 'CC',
    date: '2026-06-10',
    ...over,
  });

  it('forecasts only recent CC charges, mapping each bill to its salary', () => {
    const now = d(2026, 6, 16);
    const expenses: Expense[] = [
      exp({ amount: 1000, description: 'Coffee', date: '2026-06-10' }),
      // Debit charge → ignored.
      exp({ amount: 5000, description: 'Rent', cardType: 'DB', date: '2026-06-10' }),
      // Older than the ~4-month window → ignored.
      exp({ amount: 9999, description: 'Old', date: '2026-01-01' }),
    ];
    const salaries: SalaryEntry[] = [{ id: 's', month: '2026-07', amount: 50000, setAt: '' }];
    const f = buildCreditCardForecast(expenses, banks, salaries, now);

    expect(f.hasActivity).toBe(true);
    expect(f.statements.length).toBe(1);
    expect(f.statements[0].total).toBe(1000);
    expect(f.statements[0].items[0].description).toBe('Coffee');

    const july = f.timeline.find((m) => m.monthKey === '2026-07')!;
    expect(july.salary).toBe(50000);
    expect(july.cardBills).toBe(1000);
    expect(july.projectedInHand).toBe(49000);
    expect(july.hasSalary).toBe(true);
  });

  it('drops malformed dates without throwing', () => {
    const now = d(2026, 6, 16);
    const expenses: Expense[] = [
      exp({ amount: 1000, date: 'not-a-date' }),
      exp({ amount: 2000, date: '2026-06-12' }),
    ];
    const f = buildCreditCardForecast(expenses, banks, [], now);
    expect(f.statements.reduce((a, b) => a + b.total, 0)).toBe(2000);
  });
});
