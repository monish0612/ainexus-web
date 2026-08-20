export const UNKNOWN = '—';

export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes == null) return UNKNOWN;
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const d = unit <= 1 ? 0 : decimals;
  return `${value.toFixed(d)} ${units[unit]}`;
}

export function formatGb(gb: number | null | undefined, decimals = 1): string {
  return gb == null ? UNKNOWN : `${gb.toFixed(decimals)} GB`;
}

export function formatPct(pct: number | null | undefined, decimals = 0): string {
  return pct == null ? UNKNOWN : `${pct.toFixed(decimals)}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return UNKNOWN;
  const s = seconds < 0 ? 0 : seconds;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatAgo(seconds: number | null | undefined): string {
  if (seconds == null) return 'never';
  if (seconds < 5) return 'just now';
  return `${formatDuration(seconds)} ago`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNKNOWN;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeDays(days: number, expiring: boolean): string {
  if (days < 0) {
    const n = -days;
    const unit = n === 1 ? 'day' : 'days';
    return expiring ? `${n} ${unit} overdue` : `the date passed ${n} ${unit} ago`;
  }
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export function priceLabel(sub: {
  renewalPrice: number | null;
  currency: string | null;
  period: number | null;
  periodUnit: string | null;
}): string | null {
  const p = sub.renewalPrice;
  const c = sub.currency;
  if (p == null || c == null) return null;
  const major = (p / 100).toFixed(p % 100 === 0 ? 0 : 2);
  const symbol =
    c.toUpperCase() === 'INR'
      ? '₹'
      : c.toUpperCase() === 'USD'
        ? '$'
        : c.toUpperCase() === 'EUR'
          ? '€'
          : c.toUpperCase() === 'GBP'
            ? '£'
            : '';
  const unit = sub.periodUnit;
  const every =
    unit == null
      ? ''
      : sub.period == null || sub.period === 1
        ? ` / ${unit}`
        : ` / ${sub.period} ${unit}s`;
  return symbol ? `${symbol}${major}${every}` : `${major} ${c}${every}`;
}

export function planSpec(vcpus: number | null, ramMb: number | null, diskMb: number | null): string | null {
  const parts: string[] = [];
  if (vcpus != null) parts.push(`${vcpus} vCPU`);
  if (ramMb != null) parts.push(`${gbFromMb(ramMb)} RAM`);
  if (diskMb != null) parts.push(`${gbFromMb(diskMb)} disk`);
  return parts.length ? parts.join(' · ') : null;
}

function gbFromMb(mb: number): string {
  const gb = mb / 1024;
  return gb >= 10 || gb === Math.round(gb) ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

export function chartTime(epochS: number, range: 'now' | '7d' | '30d'): string {
  const d = new Date(epochS * 1000);
  if (range === 'now') {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (range === '7d') {
    return d.toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
