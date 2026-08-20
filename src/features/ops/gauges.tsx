import { useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { UNKNOWN, chartTime } from './format';
import { GREEN, rampFor } from './chrome';
import type { HistoryRange } from '@/lib/api/stats';

export function useTween(target: number | null, ms = 700): number | null {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (target == null) {
      current.current = null;
      setShown(null);
      return;
    }
    const from = current.current ?? target;
    const start = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      const v = from + (target - from) * eased;
      current.current = v;
      setShown(v);
      if (t < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, ms]);
  return shown;
}

export function useWide(breakpoint = 720): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= breakpoint,
  );
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= breakpoint);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [breakpoint]);
  return wide;
}

export function FluidGauge({
  value,
  label,
  size = 124,
  subtitle,
  decimals = 0,
  color,
  onClick,
}: {
  value: number | null;
  label: string;
  size?: number;
  subtitle?: string | null;
  decimals?: number;
  color?: string;
  onClick?: () => void;
}) {
  const shown = useTween(value);
  const pct = shown == null ? 0 : Math.max(0, Math.min(100, shown));
  const stroke = color ?? rampFor(pct);
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const display =
    value == null && shown == null
      ? UNKNOWN
      : `${(shown ?? 0).toFixed(decimals)}%`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-1 rounded-2xl p-1 text-center transition hover:bg-bg3/60"
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--bg3)" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.4s' }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-mono text-lg font-extrabold tabular-nums text-fg sm:text-xl">
            {display}
          </span>
        </div>
      </div>
      <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg2">{label}</span>
      {subtitle ? <span className="text-[10.5px] font-medium text-fg3">{subtitle}</span> : null}
    </button>
  );
}

export function FluidBar({ fraction, color, height = 10 }: { fraction: number; color: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="overflow-hidden rounded-full bg-bg3" style={{ height }}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          background: color,
          transition: 'width 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}

export function LiveSparkline({
  spots,
  height = 96,
  interactive = false,
  range = 'now',
  color = GREEN,
}: {
  spots: { t: number; v: number | null }[];
  height?: number;
  interactive?: boolean;
  range?: HistoryRange;
  color?: string;
}) {
  const data = spots.map((s) => ({ t: s.t, v: s.v ?? null }));
  if (data.length < 2) {
    return (
      <div
        className="grid place-items-center rounded-xl border border-dashed border-line text-[12px] text-fg4"
        style={{ height }}
      >
        Collecting samples…
      </div>
    );
  }
  const id = `spark-${color.replace('#', '')}-${height}`;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {interactive && (
            <>
              <XAxis
                dataKey="t"
                tickFormatter={(t) => chartTime(Number(t), range)}
                tick={{ fill: 'var(--text3)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                width={28}
                tick={{ fill: 'var(--text3)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg1)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelFormatter={(t) => chartTime(Number(t), range)}
                formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`, '']}
              />
            </>
          )}
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
            connectNulls={false}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
