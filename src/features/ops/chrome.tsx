import { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Info, PauseCircle, RefreshCw } from 'lucide-react';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

export const GREEN = '#51CF66';
export const AMBER = '#FCC419';
export const RED = '#FF6B6B';

export function rampFor(pct: number): string {
  if (pct >= 80) return RED;
  if (pct >= 70) return AMBER;
  return GREEN;
}

export function toneColor(tone: Tone): string {
  if (tone === 'good') return GREEN;
  if (tone === 'warn') return AMBER;
  if (tone === 'bad') return RED;
  if (tone === 'info') return '#0D59F2';
  return 'var(--text3)';
}

export function Card({
  title,
  trailing,
  children,
  className,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('card p-4 sm:p-5', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold tracking-tight text-fg">{title}</h3>
        {trailing}
      </div>
      {children}
    </section>
  );
}

export function Chip({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const color = toneColor(tone);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{
        color,
        borderColor: `${color}55`,
        background: `${color}14`,
      }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function StatRow({
  label,
  value,
  icon,
  valueColor,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {icon && <span className="shrink-0 text-fg3">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg3">{label}</span>
      <span
        className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-fg"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function Note({ text, warn = false }: { text: string; warn?: boolean }) {
  return (
    <div
      className={clsx(
        'flex gap-2 rounded-xl px-3 py-2.5 text-[12px] leading-snug',
        warn ? 'bg-amber-500/10 text-amber-200' : 'bg-bg3 text-fg3',
      )}
    >
      {warn ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
      <p>{text}</p>
    </div>
  );
}

export function Banner({
  title,
  message,
  lastSeen,
  fault,
  onRetry,
}: {
  title: string;
  message: string;
  lastSeen?: string;
  fault?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-2 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center',
        fault
          ? 'border-red-500/40 bg-red-500/10'
          : 'border-line bg-bg2',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={clsx('text-sm font-extrabold', fault ? 'text-red-400' : 'text-fg')}>{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-fg3">{message}</p>
        {lastSeen && <p className="mt-1 text-[11px] text-fg4">Last seen {lastSeen}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="tap-44 inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-line px-3 py-2 text-xs font-semibold text-fg2 hover:bg-bg3"
        >
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}

export function Shroud({ offline, children }: { offline: boolean; children: ReactNode }) {
  return (
    <div
      className={clsx('transition duration-700', offline && 'pointer-events-none grayscale')}
      style={offline ? { opacity: 0.45 } : undefined}
    >
      {children}
    </div>
  );
}

export function LiveDot({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
      <span
        className={clsx(
          'inline-block h-2 w-2 rounded-full',
          live ? 'animate-pulse bg-emerald-400' : 'bg-fg4',
        )}
      />
      <span className={live ? 'text-emerald-400' : 'text-fg4'}>{live ? 'Live' : 'Idle'}</span>
    </span>
  );
}

export function StalledNote({ age }: { age: string }) {
  return (
    <Note
      warn
      text={`Your NAS is answering but its readings have stopped moving. The figures below are ${age}.`}
    />
  );
}

export function PauseHint() {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-fg4">
      <PauseCircle size={12} /> Not live
    </p>
  );
}
