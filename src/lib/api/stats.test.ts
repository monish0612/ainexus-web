import { describe, it, expect } from 'vitest';
import {
  parseEnvelope,
  parseHistory,
  memUsedPct,
  moviesUsedPct,
  holdIsMeaningful,
  OFFLINE_MESSAGE,
} from './stats';

const snapshot = {
  at: 1787200000,
  host: 'truenas',
  version: '25.04.2.6',
  uptime_s: 86400,
  api: 1,
  cpu: { cores: 4, pct: 11.1, load1: 0.4, load5: 0.3, load15: 0.2 },
  memory: {
    total_mb: 7363,
    available_mb: 2183,
    free_mb: 1178,
    arc_mb: 1538,
    arc_cap_mb: 1536,
    pressure: 'ok',
  },
  pools: [
    {
      name: 'Storage',
      role: 'main',
      health: 'ONLINE',
      size_bytes: 1e12,
      used_bytes: 4e11,
      free_bytes: 6e11,
      used_pct: 37,
    },
  ],
  movies: {
    dataset: 'Storage/media',
    headline_free_gb: 275,
    used_bytes: 156145754112,
    avail_bytes: 295400484864,
  },
  snapshots: { count_storage: 363, held_bytes: 60880187392 },
  disks: [{ name: 'sda', role: 'Storage', temp_c: 41, ok: true }],
  services: { jellyfin: true, livetv: 'off_by_choice' },
  playback: { count: 0, items: [] },
  health: { stages_ok: 16, stages_total: 16, failing: [] },
};

describe('parseEnvelope', () => {
  it('passes a live snapshot through and keeps unknown numbers as missing', () => {
    const env = parseEnvelope({
      online: true,
      at: 1787200001,
      age_s: 0,
      last_seen_at: 1787200000,
      snapshot,
      vps_live: { cpu_pct: 9.5, steal_pct: 3.3, mem_pct: 26.6, disk_pct: 12.3 },
    });
    expect(env.online).toBe(true);
    expect(env.reason).toBeNull();
    expect(env.snapshot?.host).toBe('truenas');
    expect(env.snapshot?.schema).toBe(1);
    expect(env.snapshot?.cpu?.pct).toBe(11.1);
    expect(env.snapshot?.services?.liveTv).toBe('off_by_choice');
    expect(env.vpsLive?.stealPct).toBe(3.3);
    expect(memUsedPct(env.snapshot!.memory)).toBeCloseTo(70.38, 1);
    expect(moviesUsedPct(env.snapshot!.movies)).toBeGreaterThan(30);
    expect(holdIsMeaningful(env.snapshot!.snapshots)).toBe(true);
  });

  it('an offline envelope drops the snapshot so the UI cannot draw live figures', () => {
    const env = parseEnvelope({
      online: false,
      reason: 'unreachable',
      snapshot,
      vps_live: { cpu_pct: 8 },
    });
    expect(env.online).toBe(false);
    expect(env.reason).toBe('unreachable');
    expect(env.snapshot).toBeNull();
    expect(env.vpsLive?.cpuPct).toBe(8);
    expect(OFFLINE_MESSAGE.unreachable).toMatch(/switched off/i);
  });

  it('junk numbers become null rather than zero', () => {
    const env = parseEnvelope({
      online: true,
      snapshot: { cpu: { pct: 'hot' }, memory: { total_mb: 'nope' } },
    });
    expect(env.snapshot?.cpu?.pct).toBeNull();
    expect(env.snapshot?.memory?.totalMb).toBeNull();
  });
});

describe('parseHistory', () => {
  it('reads NAS and VPS series and falls back a bogus range to now', () => {
    const h = parseHistory({
      range: 'bogus',
      at: 10,
      nas: { online: true, step_s: 1, points: [{ t: 1, cpu: 2, mem: 3, disk: 4 }] },
      vps: { step_s: 1, points: [{ t: 1, cpu: 9, steal: 1.2 }] },
    });
    expect(h.range).toBe('now');
    expect(h.nas).toHaveLength(1);
    expect(h.vps[0].steal).toBe(1.2);
  });
});
