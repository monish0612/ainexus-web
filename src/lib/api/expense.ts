import { api } from './client';
import { uuid } from '@/lib/format';
import { learningKeys } from '@/lib/learningKeys';

export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  bank: string;
  cardType: string;
  date: string; // naive local ISO
  isManualCategory?: boolean;
  comments?: string;
}

export interface BudgetEntry {
  id: string;
  amount: number;
  setAt: string;
}

export interface SalaryEntry {
  id: string;
  month: string; // YYYY-MM
  amount: number;
  setAt: string;
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function fetchExpenses(): Promise<Expense[]> {
  const { data } = await api.get<Expense[]>('/expenses');
  return Array.isArray(data) ? data : [];
}

export interface ExpenseTombstone {
  id: string;
  deletedAt: string;
}

export async function fetchExpenseTombstones(since?: string): Promise<ExpenseTombstone[]> {
  const { data } = await api.get<ExpenseTombstone[]>('/expenses/tombstones', {
    params: since ? { since } : undefined,
  });
  return Array.isArray(data) ? data : [];
}

/** Drop ids the phone (or another browser) already deleted. */
export function applyExpenseTombstones(
  expenses: Expense[],
  tombstones: ExpenseTombstone[],
): Expense[] {
  if (!tombstones.length) return expenses;
  const dead = new Set(tombstones.map((t) => t.id).filter(Boolean));
  return expenses.filter((e) => !dead.has(e.id));
}

export async function upsertExpense(e: Expense): Promise<void> {
  await api.post('/expenses', e);
}

export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/expenses/${id}`);
}

// ── Budget ────────────────────────────────────────────────────────────────────

export async function fetchBudgetHistory(): Promise<BudgetEntry[]> {
  const { data } = await api.get<BudgetEntry[]>('/budget/history');
  return Array.isArray(data) ? data : [];
}

export async function setBudget(amount: number): Promise<void> {
  await api.post('/budget', {
    id: uuid(),
    amount,
    setAt: new Date().toISOString(),
  });
}

// ── Salary ────────────────────────────────────────────────────────────────────

export async function fetchSalaryHistory(): Promise<SalaryEntry[]> {
  const { data } = await api.get<SalaryEntry[]>('/salary/history');
  return Array.isArray(data) ? data : [];
}

export async function setSalary(month: string, amount: number): Promise<void> {
  await api.post('/salary', {
    id: uuid(),
    month,
    amount,
    setAt: new Date().toISOString(),
  });
}

// ── Category learnings ────────────────────────────────────────────────────────

export interface Learning {
  keyword: string;
  category: string;
}

export async function fetchLearnings(): Promise<Learning[]> {
  const { data } = await api.get<Learning[]>('/category-learnings');
  return Array.isArray(data) ? data : [];
}

export async function teachLearnings(description: string, category: string): Promise<void> {
  const cat = category.trim();
  if (!cat || cat === 'Others') return;
  const learnings = learningKeys(description).map((keyword) => ({ keyword, category: cat }));
  if (!learnings.length) return;
  await api.post('/category-learnings/batch', { learnings });
}
