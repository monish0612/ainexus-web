import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { Activity, ArrowDownRight, ArrowUpRight, Layers, TrendingUp } from 'lucide-react';
import { formatCurrency, formatCurrencyCompact } from '@/lib/format';
import { categoryColor } from '@/lib/constants';
import { EmptyState, SkeletonCard } from '@/components/ui/primitives';
import { SubTabs } from '@/components/layout/PageHeader';
import { useExpenses } from './hooks';
import { CreditCardForecastCard } from './CreditCardForecastCard';
import {
  PERIOD_LABELS,
  Period,
  byBank,
  byCategory,
  computeKpis,
  dayOfWeekSeries,
  inPeriod,
  spendOnly,
  trendSeries,
} from './insights';

const PERIODS: Period[] = ['today', '7d', '1m', '6m', 'all'];

function KpiCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2 text-fg3">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-xl font-extrabold text-fg">{value}</span>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-sm shadow-card">
      <p className="text-fg3">{label}</p>
      <p className="font-bold text-fg">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

export function InsightsTab() {
  const { data: expenses = [], isLoading } = useExpenses();
  const [period, setPeriod] = useState<Period>('1m');

  const scoped = useMemo(
    () => spendOnly(inPeriod(expenses, period)),
    [expenses, period],
  );
  const kpis = useMemo(() => computeKpis(scoped, period), [scoped, period]);
  const cats = useMemo(() => byCategory(scoped), [scoped]);
  const banks = useMemo(() => byBank(scoped), [scoped]);
  const trend = useMemo(() => trendSeries(scoped, period), [scoped, period]);
  const dow = useMemo(() => dayOfWeekSeries(scoped), [scoped]);

  const delta = useMemo(() => {
    if (trend.length < 2) return 0;
    const mid = Math.floor(trend.length / 2);
    const first = trend.slice(0, mid).reduce((s, p) => s + p.value, 0);
    const second = trend.slice(mid).reduce((s, p) => s + p.value, 0);
    if (first === 0) return second > 0 ? 100 : 0;
    return ((second - first) / first) * 100;
  }, [trend]);

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-content grid-cols-2 gap-3 px-4 py-5 sm:px-6 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-5 px-4 py-5 sm:px-6">
      <SubTabs
        value={period}
        onChange={setPeriod}
        tabs={PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
      />

      {scoped.length === 0 ? (
        <EmptyState
          icon={<Activity size={28} />}
          title="Nothing to analyze yet"
          hint="Add some expenses to see insights for this period."
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total spent" value={formatCurrency(kpis.total)} icon={<TrendingUp size={15} />} />
            <KpiCard label="Avg / day" value={formatCurrency(kpis.avgPerDay)} icon={<Activity size={15} />} />
            <KpiCard label="Transactions" value={String(kpis.count)} icon={<Layers size={15} />} />
            <KpiCard label="Biggest" value={formatCurrency(kpis.biggest)} icon={<ArrowUpRight size={15} />} />
          </div>

          {/* Trend */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-fg">Spending trend</h3>
              <span
                className={`flex items-center gap-1 text-sm font-semibold ${
                  delta > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {delta > 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {Math.abs(delta).toFixed(0)}%
              </span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0D59F2" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#0D59F2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text3)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#0D59F2"
                  strokeWidth={2.5}
                  fill="url(#trendFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Day of week */}
          <div className="card p-4">
            <h3 className="mb-3 font-bold text-fg">Spending by day</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dow} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text3)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg2)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#7C3AED" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By category */}
          <div className="card p-4">
            <h3 className="mb-3 font-bold text-fg">By category</h3>
            <div className="flex flex-col gap-3">
              {cats.map((c) => {
                const pct = kpis.total > 0 ? (c.value / kpis.total) * 100 : 0;
                return (
                  <div key={c.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-fg">
                        {c.name} <span className="text-fg4">· {c.count}</span>
                      </span>
                      <span className="font-semibold text-fg2">{formatCurrency(c.value)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-bg3">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: categoryColor(c.name) }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* By bank */}
          <div className="card p-4">
            <h3 className="mb-3 font-bold text-fg">By source</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {banks.map((b) => {
                const pct = kpis.total > 0 ? (b.value / kpis.total) * 100 : 0;
                return (
                  <div key={b.name} className="rounded-xl bg-bg2 p-3">
                    <p className="text-sm font-semibold text-fg">{b.name}</p>
                    <p className="text-lg font-extrabold text-fg">
                      {formatCurrencyCompact(b.value)}
                    </p>
                    <p className="text-xs text-fg3">{pct.toFixed(0)}% of spend</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Credit-card billing forecast (uses ALL expenses, not period-scoped) */}
          <CreditCardForecastCard expenses={expenses} />
        </>
      )}
    </div>
  );
}
