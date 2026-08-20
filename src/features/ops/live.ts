import type { HistoryPoint, NasStatsEnvelope, StatMetric } from '@/lib/api/stats';
import { memUsedPct, moviesUsedPct, mainPool, METRIC_META } from '@/lib/api/stats';

export interface LiveSample {
  at: number;
  nasCpu: number | null;
  nasRam: number | null;
  nasDisk: number | null;
  vpsCpu: number | null;
  vpsRam: number | null;
  vpsDisk: number | null;
  vpsSteal: number | null;
}

export function sampleFromEnvelope(env: NasStatsEnvelope, atMs = Date.now()): LiveSample {
  const snap = env.snapshot;
  const vps = env.vpsLive;
  const nasOn = env.online;
  const disk = mainPool(snap)?.usedPct ?? moviesUsedPct(snap?.movies);
  return {
    at: env.at ?? Math.floor(atMs / 1000),
    nasCpu: nasOn ? (snap?.cpu?.pct ?? null) : 0,
    nasRam: nasOn ? memUsedPct(snap?.memory) : 0,
    nasDisk: nasOn ? (disk == null ? null : Number(disk)) : 0,
    vpsCpu: vps?.cpuPct ?? null,
    vpsRam: vps?.memPct ?? null,
    vpsDisk: vps?.diskPct ?? null,
    vpsSteal: vps?.stealPct ?? null,
  };
}

export function valueOf(sample: LiveSample, metric: StatMetric): number | null {
  return sample[metric];
}

export function appendLiveSample(
  prev: LiveSample[],
  next: LiveSample,
  windowS = 180,
  cap = 180,
): LiveSample[] {
  const cut = next.at - windowS;
  const kept = prev.filter((p) => p.at >= cut);
  const last = kept[kept.length - 1];
  if (last && Math.abs(last.at - next.at) < 1) {
    kept[kept.length - 1] = next;
  } else {
    kept.push(next);
  }
  return kept.length <= cap ? kept : kept.slice(kept.length - cap);
}

export function spotsForMetric(live: LiveSample[], metric: StatMetric): { t: number; v: number | null }[] {
  return live.map((s) => ({ t: s.at, v: valueOf(s, metric) }));
}

export function historySpots(
  points: HistoryPoint[],
  metric: StatMetric,
): { t: number; v: number | null }[] {
  const field = METRIC_META[metric].field;
  return points.map((p) => ({ t: p.t, v: p[field] }));
}
