import { useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useSettingsStore } from '@/store/settingsStore';
import {
  buildCreditCardForecast,
  monthKeyLabel,
  type CardExpense,
  type CardStatement,
  type SalaryMonthForecast,
} from '@/lib/creditCardForecast';
import type { Expense } from '@/lib/api/expense';
import { useSalaryHistory } from './hooks';

const VIOLET = '#A78BFA';
const fmtDay = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const itemLabel = (it: CardExpense) =>
  it.description?.trim() || it.category?.trim() || 'Charge';

function LineItems({ items }: { items: CardExpense[] }) {
  if (!items.length) return <p className="text-xs text-fg4">No itemised charges</p>;
  return (
    <div className="border-t border-line pt-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 pt-1.5 text-xs">
          <span className="w-12 shrink-0 font-semibold text-fg4">{fmtDay(it.date)}</span>
          <span className="flex-1 truncate text-fg2">{itemLabel(it)}</span>
          <span className="shrink-0 font-semibold text-fg2">{formatCurrency(it.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function OpenStatement({ s }: { s: CardStatement }) {
  const [open, setOpen] = useState(false);
  const canExpand = s.items.length > 0;
  return (
    <div className="rounded-xl bg-bg2 p-3">
      <button
        type="button"
        disabled={!canExpand}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left disabled:cursor-default"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
        <span className="flex-1 truncate font-bold text-fg">{s.bankName}</span>
        <span className="font-extrabold text-fg">{formatCurrency(s.total)}</span>
        {canExpand && (
          <ChevronDown
            size={16}
            className={`shrink-0 text-fg3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      <p className="mt-1 text-xs text-fg3">
        Closes {fmtDay(s.closeDate)} · due {fmtDay(s.dueDate)}
      </p>
      <p className="text-xs font-bold" style={{ color: VIOLET }}>
        Repaid from your {monthKeyLabel(s.salaryMonthKey)} salary
      </p>
      <div
        className={`grid transition-all duration-200 ease-out ${open ? 'mt-2 grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <LineItems items={s.items} />
        </div>
      </div>
    </div>
  );
}

function BillRow({ b }: { b: CardStatement }) {
  const [open, setOpen] = useState(false);
  const canExpand = b.items.length > 0;
  return (
    <div>
      <button
        type="button"
        disabled={!canExpand}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-left text-xs text-fg3 disabled:cursor-default"
      >
        <CreditCard size={13} className="shrink-0 text-fg4" />
        <span className="flex-1 truncate">
          {b.bankName} · due {fmtDay(b.dueDate)}
        </span>
        <span className="shrink-0 font-bold text-fg2">-{formatCurrency(b.total)}</span>
        {canExpand && (
          <ChevronDown
            size={14}
            className={`shrink-0 text-fg4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${open ? 'mt-1 grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden pl-[19px]">
          <LineItems items={b.items} />
        </div>
      </div>
    </div>
  );
}

function SalaryMonth({ m }: { m: SalaryMonthForecast }) {
  const tone = !m.hasSalary
    ? '#94A3B8'
    : m.isShort
      ? '#FF6B6B'
      : m.cardBills > 0 && m.projectedInHand < m.salary * 0.5
        ? '#FCC419'
        : '#51CF66';
  return (
    <div className="rounded-xl bg-bg2 p-3" style={{ border: `1px solid ${tone}47` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-bold text-fg">{m.monthLabel} salary</span>
        <span className={`font-bold ${m.hasSalary ? 'text-fg2' : 'text-fg4'}`}>
          {m.hasSalary ? formatCurrency(m.salary) : 'Not recorded'}
        </span>
      </div>
      {m.bills.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {m.bills.map((b, i) => (
            <BillRow key={i} b={b} />
          ))}
        </div>
      )}
      <div className="my-2 border-t border-line" />
      {m.hasSalary ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg3">
            {m.cardBills > 0 ? 'Projected in-hand' : 'No card bills this month'}
          </span>
          <span className="text-lg font-extrabold" style={{ color: tone }}>
            {m.projectedInHand < 0
              ? `-${formatCurrency(Math.abs(m.projectedInHand))}`
              : formatCurrency(m.projectedInHand)}
          </span>
        </div>
      ) : m.cardBills > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg3">Card bills due</span>
            <span className="text-lg font-extrabold text-fg">{formatCurrency(m.cardBills)}</span>
          </div>
          <p className="mt-1 text-[11px] font-semibold text-fg3">
            Add this month&apos;s salary to see your in-hand.
          </p>
        </>
      ) : (
        <span className="text-xs font-semibold text-fg3">No card bills this month</span>
      )}
      {m.isShort && (
        <p className="mt-1 text-[11px] font-semibold text-rose-400">
          Card bills exceed this salary — pause card spending.
        </p>
      )}
    </div>
  );
}

export function CreditCardForecastCard({ expenses }: { expenses: Expense[] }) {
  const banks = useSettingsStore((s) => s.banks);
  const { data: salaries = [] } = useSalaryHistory();

  const forecast = useMemo(
    () => buildCreditCardForecast(expenses, banks, salaries),
    [expenses, banks, salaries],
  );

  if (!forecast.hasActivity) return null;

  const timeline = forecast.timeline.filter(
    (m) => m.cardBills > 0 || m === forecast.timeline[0],
  );

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2">
        <CreditCard size={16} style={{ color: VIOLET }} />
        <h3 className="font-bold text-fg">Credit card forecast</h3>
      </div>
      <p className="mb-3 text-xs text-fg3">
        Each card&apos;s bill mapped to the salary that repays it. Tap a card to see its charges.
      </p>

      {forecast.openStatements.length > 0 && (
        <>
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-fg3">
            Open statements
          </p>
          <div className="mb-3 flex flex-col gap-2">
            {forecast.openStatements.map((s, i) => (
              <OpenStatement key={i} s={s} />
            ))}
          </div>
        </>
      )}

      {timeline.length > 0 && (
        <>
          <p className="mb-2 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-fg3">
            <CalendarClock size={12} /> Salary vs card bills
          </p>
          <div className="flex flex-col gap-2">
            {timeline.map((m) => (
              <SalaryMonth key={m.monthKey} m={m} />
            ))}
          </div>
        </>
      )}

      {forecast.unconfiguredBanks.length > 0 && (
        <p className="mt-3 text-xs font-medium text-amber-500">
          No billing cycle set for {forecast.unconfiguredBanks.join(', ')} — add it in Settings ▸
          Banks &amp; Cards to include it here.
        </p>
      )}
    </div>
  );
}
