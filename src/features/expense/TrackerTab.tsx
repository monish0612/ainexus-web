import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Search, Trash2, Wallet } from 'lucide-react';
import { formatCurrency, relativeTime } from '@/lib/format';
import { categoryColor, categoryIcon } from '@/lib/constants';
import { Button, EmptyState, SkeletonCard } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { Expense } from '@/lib/api/expense';
import {
  useBudget,
  useDeleteExpense,
  useExpenses,
  useSetBudget,
} from './hooks';
import { inPeriod, spendOnly, totalInvestments } from './insights';

function Ring({ fraction, color }: { fraction: number; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--bg3)" strokeWidth="12" />
      <motion.circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - clamped) }}
        transition={{ type: 'spring', damping: 26, stiffness: 120 }}
      />
    </svg>
  );
}

export function TrackerTab({ onEdit }: { onEdit: (e: Expense) => void }) {
  const { data: expenses = [], isLoading } = useExpenses();
  const { data: budget = 0 } = useBudget();
  const del = useDeleteExpense();
  const [query, setQuery] = useState('');
  const [budgetOpen, setBudgetOpen] = useState(false);

  const thisMonth = useMemo(() => spendOnly(inPeriod(expenses, '1m')), [expenses]);
  const spent = thisMonth.reduce((s, e) => s + e.amount, 0);
  const investments = useMemo(() => totalInvestments(expenses), [expenses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? expenses.filter(
          (e) =>
            e.description.toLowerCase().includes(q) ||
            e.category.toLowerCase().includes(q) ||
            (e.bank || '').toLowerCase().includes(q),
        )
      : expenses;
    return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [expenses, query]);

  const frac = budget > 0 ? spent / budget : 0;
  const over = budget > 0 && spent > budget;
  const ringColor = over ? '#FF6B6B' : frac > 0.75 ? '#FCC419' : '#12B886';

  return (
    <div className="mx-auto flex max-w-content flex-col gap-5 px-4 py-5 sm:px-6">
      {/* Budget summary */}
      <div className="card flex flex-col items-center gap-5 p-6 sm:flex-row sm:gap-8">
        <div className="relative grid place-items-center">
          <Ring fraction={frac} color={ringColor} />
          <div className="absolute flex flex-col items-center">
            <span className="text-xs text-fg3">spent</span>
            <span className="text-lg font-extrabold text-fg">{formatCurrency(spent)}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 text-center sm:text-left">
          <div>
            <p className="text-sm text-fg3">This month</p>
            <p className="text-2xl font-extrabold text-fg">
              {formatCurrency(spent)}
              {budget > 0 && (
                <span className="text-base font-medium text-fg3">
                  {' '}
                  / {formatCurrency(budget)}
                </span>
              )}
            </p>
            {over && (
              <p className="text-sm font-semibold text-red-400">
                Over budget by {formatCurrency(spent - budget)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <Button variant="ghost" onClick={() => setBudgetOpen(true)} className="px-4 py-2 text-sm">
              <Wallet size={16} /> {budget > 0 ? 'Edit budget' : 'Set budget'}
            </Button>
            {investments > 0 && (
              <span className="pill border border-line bg-bg2 text-fg2">
                📈 Invested {formatCurrency(investments)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg4" />
        <input
          className="input pl-11"
          placeholder="Search expenses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="h-16" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Wallet size={28} />}
          title="No expenses yet"
          hint="Add your first expense or scan a receipt to get started."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((e) => (
            <motion.div
              key={e.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="card group flex items-center gap-3 p-3.5"
            >
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg"
                style={{ background: `${categoryColor(e.category)}22` }}
              >
                {categoryIcon(e.category)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">{e.description}</p>
                <p className="truncate text-xs text-fg3">
                  {e.category} · {e.bank} · {relativeTime(e.date)}
                </p>
              </div>
              <span className="shrink-0 font-bold text-fg">{formatCurrency(e.amount)}</span>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() => onEdit(e)}
                  className="rounded-lg p-2 text-fg3 hover:bg-bg3 hover:text-fg"
                  aria-label="Edit"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => del.mutate(e.id)}
                  className="rounded-lg p-2 text-fg3 hover:bg-red-500/15 hover:text-red-400"
                  aria-label="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <BudgetModal open={budgetOpen} onClose={() => setBudgetOpen(false)} current={budget} />
    </div>
  );
}

function BudgetModal({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: number;
}) {
  const setBudget = useSetBudget();
  const [value, setValue] = useState(current ? String(current) : '');
  return (
    <Modal open={open} onClose={onClose} title="Monthly Budget" maxWidth="max-w-md">
      <div className="flex flex-col gap-4 p-5">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-fg3">
            ₹
          </span>
          <input
            className="input py-4 pl-10 text-2xl font-bold"
            inputMode="numeric"
            placeholder="0"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[5000, 10000, 20000, 50000].map((p) => (
            <button
              key={p}
              onClick={() => setValue(String(p))}
              className="pill border border-line bg-bg2 text-fg2"
            >
              {formatCurrency(p)}
            </button>
          ))}
        </div>
        <Button
          loading={setBudget.isPending}
          disabled={!value}
          onClick={async () => {
            await setBudget.mutateAsync(parseInt(value, 10));
            onClose();
          }}
        >
          Save budget
        </Button>
      </div>
    </Modal>
  );
}
