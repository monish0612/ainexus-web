import { api } from './client';
import { uuid } from '@/lib/format';

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
  const learnings = description
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((keyword) => ({ keyword, category }));
  if (!learnings.length) return;
  await api.post('/category-learnings/batch', { learnings });
}
