// Per-bank credit-card billing forecast — a faithful port of
// lib/core/services/credit_card_forecast_engine.dart. Keep the two in sync.
//
// The salary recorded for month `M` is credited on `creditDay` of month `M-1`
// (e.g. the "July" salary lands on June 28). A bill due in month `X` is settled
// from the salary recorded for month `X` when the due day is before the credit
// day (the usual case), otherwise from the following month's salary.

import type { Bank } from '@/store/settingsStore';
import type { Expense, SalaryEntry } from '@/lib/api/expense';
import { safeParseDate } from '@/lib/format';

export const SALARY_CREDIT_DAY = 28;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BankBillingConfig {
  name: string;
  color: string;
  statementDay: number;
  dueDay: number;
}

export interface CardExpense {
  bank: string;
  amount: number;
  date: Date;
  category?: string;
  description?: string;
}

export interface CardStatement {
  bankName: string;
  color: string;
  closeDate: Date;
  dueDate: Date;
  salaryMonthKey: string;
  total: number;
  isOpen: boolean;
  /** The individual charges that make up this statement, newest first. */
  items: CardExpense[];
}

export interface SalaryMonthForecast {
  monthKey: string;
  monthLabel: string;
  salary: number;
  bills: CardStatement[];
  cardBills: number;
  projectedInHand: number;
  hasSalary: boolean;
  isShort: boolean;
}

export interface CreditCardForecast {
  statements: CardStatement[];
  timeline: SalaryMonthForecast[];
  openStatements: CardStatement[];
  unconfiguredBanks: string[];
  hasActivity: boolean;
}

export interface CardBillTiming {
  statementClose: Date;
  dueDate: Date;
  salaryMonthKey: string;
  salaryMonthLabel: string;
}

// ── Date helpers (pure) ────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pad2 = (n: number) => String(n).padStart(2, '0');
const makeDate = (y: number, month1: number, day: number) => new Date(y, month1 - 1, day);
const daysInMonth = (y: number, month1: number) => new Date(y, month1, 0).getDate();

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthKeyLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return makeDate(y, m, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

export function statementCloseDate(expense: Date, statementDay: number): Date {
  const y = expense.getFullYear();
  const m1 = expense.getMonth() + 1;
  const day = expense.getDate();
  const sThis = clamp(statementDay, 1, daysInMonth(y, m1));
  if (day <= sThis) return makeDate(y, m1, sThis);
  const ny = m1 === 12 ? y + 1 : y;
  const nm = m1 === 12 ? 1 : m1 + 1;
  return makeDate(ny, nm, clamp(statementDay, 1, daysInMonth(ny, nm)));
}

export function dueDateFor(close: Date, dueDay: number): Date {
  const y = close.getFullYear();
  const m1 = close.getMonth() + 1;
  const ny = m1 === 12 ? y + 1 : y;
  const nm = m1 === 12 ? 1 : m1 + 1;
  return makeDate(ny, nm, clamp(dueDay, 1, daysInMonth(ny, nm)));
}

export function repayingSalaryMonthKey(due: Date, creditDay = SALARY_CREDIT_DAY): string {
  if (due.getDate() >= creditDay) {
    const y = due.getFullYear();
    const m1 = due.getMonth() + 1;
    const ny = m1 === 12 ? y + 1 : y;
    const nm = m1 === 12 ? 1 : m1 + 1;
    return monthKeyOf(makeDate(ny, nm, 1));
  }
  return monthKeyOf(due);
}

export function currentSalaryMonthKey(now: Date, creditDay = SALARY_CREDIT_DAY): string {
  if (now.getDate() >= creditDay) {
    const y = now.getFullYear();
    const m1 = now.getMonth() + 1;
    const ny = m1 === 12 ? y + 1 : y;
    const nm = m1 === 12 ? 1 : m1 + 1;
    return monthKeyOf(makeDate(ny, nm, 1));
  }
  return monthKeyOf(now);
}

export function cardBillTimingFor(
  expenseDate: Date,
  statementDay: number,
  dueDay: number,
  creditDay = SALARY_CREDIT_DAY,
): CardBillTiming {
  const close = statementCloseDate(expenseDate, statementDay);
  const due = dueDateFor(close, dueDay);
  const salaryMonthKey = repayingSalaryMonthKey(due, creditDay);
  return { statementClose: close, dueDate: due, salaryMonthKey, salaryMonthLabel: monthKeyLabel(salaryMonthKey) };
}

// ── Forecast computation (pure) ─────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase();

export function computeCreditCardForecast(params: {
  ccBanks: BankBillingConfig[];
  ccExpenses: CardExpense[];
  salaryByMonth: Record<string, number>;
  now: Date;
  creditDay?: number;
}): CreditCardForecast {
  const { ccBanks, ccExpenses, salaryByMonth, now } = params;
  const creditDay = params.creditDay ?? SALARY_CREDIT_DAY;
  const configByName = new Map(ccBanks.map((b) => [norm(b.name), b]));

  const buckets = new Map<
    string,
    { config: BankBillingConfig; closeDate: Date; total: number; items: CardExpense[] }
  >();
  const unconfigured = new Set<string>();

  for (const e of ccExpenses) {
    const cfg = configByName.get(norm(e.bank));
    if (!cfg) {
      unconfigured.add(e.bank);
      continue;
    }
    const close = statementCloseDate(e.date, cfg.statementDay);
    const key = `${norm(cfg.name)}|${close.getTime()}`;
    const bucket = buckets.get(key) ?? { config: cfg, closeDate: close, total: 0, items: [] };
    bucket.total += e.amount;
    bucket.items.push(e);
    buckets.set(key, bucket);
  }

  const statements: CardStatement[] = [];
  for (const b of buckets.values()) {
    const due = dueDateFor(b.closeDate, b.config.dueDay);
    const items = [...b.items].sort((x, y) => y.date.getTime() - x.date.getTime());
    statements.push({
      bankName: b.config.name,
      color: b.config.color,
      closeDate: b.closeDate,
      dueDate: due,
      salaryMonthKey: repayingSalaryMonthKey(due, creditDay),
      total: b.total,
      isOpen: now.getTime() <= b.closeDate.getTime(),
      items,
    });
  }
  statements.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  // Forward timeline: current spending month + next two.
  const currentKey = currentSalaryMonthKey(now, creditDay);
  const [cy, cm] = currentKey.split('-').map(Number);
  const timelineKeys = [0, 1, 2].map((d) => monthKeyOf(makeDate(cy, cm + d, 1)));

  const billsByMonth = new Map<string, CardStatement[]>();
  for (const s of statements) {
    const arr = billsByMonth.get(s.salaryMonthKey) ?? [];
    arr.push(s);
    billsByMonth.set(s.salaryMonthKey, arr);
  }

  const timeline: SalaryMonthForecast[] = timelineKeys.map((key) => {
    const salary = salaryByMonth[key] ?? 0;
    const bills = billsByMonth.get(key) ?? [];
    const cardBills = bills.reduce((sum, b) => sum + b.total, 0);
    return {
      monthKey: key,
      monthLabel: monthKeyLabel(key),
      salary,
      bills,
      cardBills,
      projectedInHand: salary - cardBills,
      hasSalary: salary > 0,
      isShort: salary > 0 && cardBills > salary,
    };
  });

  // One open statement per bank.
  const openByBank = new Map<string, CardStatement>();
  for (const s of statements) {
    if (!s.isOpen) continue;
    const k = norm(s.bankName);
    const existing = openByBank.get(k);
    if (!existing || s.closeDate.getTime() < existing.closeDate.getTime()) {
      openByBank.set(k, s);
    }
  }
  const openStatements = [...openByBank.values()].sort(
    (a, b) => a.closeDate.getTime() - b.closeDate.getTime(),
  );

  return {
    statements,
    timeline,
    openStatements,
    unconfiguredBanks: [...unconfigured],
    hasActivity: statements.length > 0,
  };
}

// ── Convenience: build straight from synced web data ────────────────────────────

/** Reduces the configured banks to the CC ones the engine can forecast. */
export function ccBankConfigs(banks: Bank[]): BankBillingConfig[] {
  return banks
    .filter((b) => b.cardType === 'CC' && b.statementDay != null && b.dueDay != null)
    .map((b) => ({
      name: b.name,
      color: b.color,
      statementDay: b.statementDay as number,
      dueDay: b.dueDay as number,
    }));
}

/** Builds the forecast from raw synced expenses + banks + salary history. */
export function buildCreditCardForecast(
  expenses: Expense[],
  banks: Bank[],
  salaries: SalaryEntry[],
  now: Date = new Date(),
): CreditCardForecast {
  const since = new Date(now.getFullYear(), now.getMonth() - 4, 1);
  const ccExpenses: CardExpense[] = [];
  for (const e of expenses) {
    if (e.cardType !== 'CC') continue;
    const d = safeParseDate(e.date);
    if (!d || d.getTime() < since.getTime()) continue;
    ccExpenses.push({
      bank: e.bank,
      amount: e.amount,
      date: d,
      category: e.category,
      description: e.description,
    });
  }
  const salaryByMonth: Record<string, number> = {};
  for (const s of salaries) salaryByMonth[s.month] = s.amount;
  return computeCreditCardForecast({
    ccBanks: ccBankConfigs(banks),
    ccExpenses,
    salaryByMonth,
    now,
  });
}
