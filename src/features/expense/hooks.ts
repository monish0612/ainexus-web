import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BudgetEntry,
  Expense,
  SalaryEntry,
  deleteExpense,
  fetchBudgetHistory,
  fetchExpenses,
  fetchSalaryHistory,
  setBudget,
  setSalary,
  upsertExpense,
} from '@/lib/api/expense';
import { toast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/lib/api/client';

const EXPENSES = ['expenses'];
const BUDGET = ['budget'];
const SALARY = ['salary'];

export function useExpenses() {
  return useQuery({ queryKey: EXPENSES, queryFn: fetchExpenses });
}

export function useBudget() {
  return useQuery({
    queryKey: BUDGET,
    queryFn: fetchBudgetHistory,
    select: (rows: BudgetEntry[]) => {
      if (!rows.length) return 0;
      const sorted = [...rows].sort(
        (a, b) => new Date(b.setAt).getTime() - new Date(a.setAt).getTime(),
      );
      return sorted[0].amount;
    },
  });
}

export function useSalaryHistory() {
  return useQuery({ queryKey: SALARY, queryFn: fetchSalaryHistory });
}

export function useUpsertExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertExpense,
    onMutate: async (e: Expense) => {
      await qc.cancelQueries({ queryKey: EXPENSES });
      const prev = qc.getQueryData<Expense[]>(EXPENSES) ?? [];
      const idx = prev.findIndex((x) => x.id === e.id);
      const next = idx >= 0 ? prev.map((x) => (x.id === e.id ? e : x)) : [e, ...prev];
      next.sort((a, b) => b.date.localeCompare(a.date));
      qc.setQueryData(EXPENSES, next);
      return { prev };
    },
    onError: (err, _e, ctx) => {
      if (ctx?.prev) qc.setQueryData(EXPENSES, ctx.prev);
      toast.error(apiErrorMessage(err, 'Could not save expense'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: EXPENSES }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteExpense,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: EXPENSES });
      const prev = qc.getQueryData<Expense[]>(EXPENSES) ?? [];
      qc.setQueryData(EXPENSES, prev.filter((x) => x.id !== id));
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(EXPENSES, ctx.prev);
      toast.error(apiErrorMessage(err, 'Could not delete expense'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: EXPENSES }),
  });
}

export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setBudget,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BUDGET });
      toast.success('Budget updated');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not set budget')),
  });
}

export function useSetSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, amount }: { month: string; amount: number }) =>
      setSalary(month, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SALARY });
      toast.success('Income updated');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not set income')),
  });
}

export type { Expense, BudgetEntry, SalaryEntry };
