import { describe, it, expect } from 'vitest';
import { shouldSkipHttpRetry, isRetryableHttpStatus } from './client';
import { downsampleSpots } from '@/features/ops/gauges';

describe('shouldSkipHttpRetry', () => {
  it('skips the 1-second stats poll and its history sibling', () => {
    expect(shouldSkipHttpRetry('/cloud/stats')).toBe(true);
    expect(shouldSkipHttpRetry('/nexusai/api/v1/cloud/stats')).toBe(true);
    expect(shouldSkipHttpRetry('/cloud/stats/history?range=7d')).toBe(true);
    expect(shouldSkipHttpRetry('/cloud/nas/status')).toBe(false);
    expect(shouldSkipHttpRetry('/cloud/quota')).toBe(false);
    expect(shouldSkipHttpRetry('/cloud/stats', true)).toBe(true);
    expect(shouldSkipHttpRetry('/anything', true)).toBe(true);
  });
});

describe('downsampleSpots', () => {
  it('keeps the last point and never exceeds the cap', () => {
    const spots = Array.from({ length: 180 }, (_, i) => ({ t: i, v: i / 2 }));
    const out = downsampleSpots(spots, 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out[0].t).toBe(0);
    expect(out[out.length - 1].t).toBe(179);
  });

  it('downsamples a 30-day 60s series without dropping the ends', () => {
    const n = 30 * 24 * 60;
    const spots = Array.from({ length: n }, (_, i) => ({ t: i, v: i % 100 }));
    const out = downsampleSpots(spots, 360);
    expect(out.length).toBeLessThanOrEqual(360);
    expect(out[0].t).toBe(0);
    expect(out[out.length - 1].t).toBe(n - 1);
  });
});

describe('isRetryableHttpStatus', () => {
  it('retries 5xx and 408, never 429', () => {
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(408)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(false);
    expect(isRetryableHttpStatus(400)).toBe(false);
  });
});
