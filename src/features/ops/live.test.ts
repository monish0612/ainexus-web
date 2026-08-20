import { describe, it, expect } from 'vitest';
import { formatDuration, formatAgo, formatBytes, relativeDays, priceLabel } from './format';
import { appendLiveSample, sampleFromEnvelope } from './live';
import type { NasStatsEnvelope } from '@/lib/api/stats';

describe('formatDuration', () => {
  it('stays coarse and never invents a zero for missing', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(12)).toBe('12s');
    expect(formatDuration(90)).toBe('1m');
    expect(formatDuration(3661)).toBe('1h 01m');
    expect(formatDuration(90_000)).toBe('1d 1h');
    expect(formatAgo(2)).toBe('just now');
    expect(formatAgo(null)).toBe('never');
  });
});

describe('formatBytes / billing copy', () => {
  it('does not render an unknown as 0 B', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(relativeDays(3, true)).toBe('in 3 days');
    expect(relativeDays(-2, true)).toBe('2 days overdue');
    expect(
      priceLabel({
        renewalPrice: 209900,
        currency: 'INR',
        period: 1,
        periodUnit: 'month',
      }),
    ).toBe('₹2099 / month');
  });
});

describe('live buffer', () => {
  const env = (online: boolean, cpu: number): NasStatsEnvelope => ({
    online,
    reason: online ? null : 'unreachable',
    at: 1,
    ageS: 0,
    lastSeenAt: 1,
    snapshot: online
      ? {
          at: 1,
          host: 'truenas',
          version: '1',
          uptimeS: 1,
          schema: 1,
          cpu: { cores: 4, pct: cpu, load1: 0.2, load5: 0.2, load15: 0.1 },
          memory: {
            totalMb: 1000,
            availableMb: 400,
            freeMb: 200,
            arcMb: 100,
            arcCapMb: 200,
            pressure: 'ok',
          },
          pools: [],
          movies: null,
          snapshots: null,
          disks: [],
          services: null,
          playback: null,
          health: null,
        }
      : null,
    vpsLive: { cpuPct: 9, cores: 2, load1: 0, load5: 0, load15: 0, memPct: 20, memTotalGb: 8, memFreeGb: 6, diskPct: 12, diskTotalGb: 100, diskFreeGb: 80, uptimeS: 10, state: 'running', stateFrom: 'probe', reachable: true, stealPct: 1, throttled: false, conditions: [], containers: 15, running: 15, ageS: 10, stale: false, planName: null, vcpus: null, planRamMb: null, planDiskMb: null, hostname: null, billing: null },
  });

  it('drops points older than the window and caps length', () => {
    let buf = appendLiveSample([], sampleFromEnvelope(env(true, 10), 1_000), 3, 4);
    buf = appendLiveSample(buf, sampleFromEnvelope(env(true, 20), 2_000), 3, 4);
    buf = appendLiveSample(buf, sampleFromEnvelope(env(true, 30), 6_000), 3, 4);
    expect(buf.map((s) => s.nasCpu)).toEqual([30]);
  });

  it('records NAS zeros when the envelope is offline so the chart matches the gauges', () => {
    const s = sampleFromEnvelope(env(false, 40));
    expect(s.nasCpu).toBe(0);
    expect(s.nasRam).toBe(0);
    expect(s.vpsCpu).toBe(9);
  });
});
