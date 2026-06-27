const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** ₹12,340 — INR, en-IN, 0 decimals (matches the Android app). */
export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0';
  return inr.format(Math.round(amount));
}

/** ₹12.3K — compact INR for tight chart axes / KPI badges. */
export function formatCurrencyCompact(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0';
  return inrCompact.format(amount);
}

/** Tolerant ISO parse — never throws (mirrors safeParseDate in the app). */
export function safeParseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const REL_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 days ago" / "in 2 hours" — guards future dates. */
export function relativeTime(value?: string | null): string {
  const d = safeParseDate(value);
  if (!d) return '';
  const diffSec = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'just now';
  for (const [unit, secs] of REL_UNITS) {
    if (abs >= secs || unit === 'minute') {
      return rtf.format(Math.round(diffSec / secs), unit);
    }
  }
  return 'just now';
}

/** Naive local ISO `YYYY-MM-DDTHH:mm:ss` (no timezone) — the app's date format. */
export function toNaiveLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function formatDateLabel(value?: string | null): string {
  const d = safeParseDate(value);
  if (!d) return '';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Stable UUID for client-generated ids (expenses, budget, etc.). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
