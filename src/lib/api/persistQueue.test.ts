import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture Telegram relay calls without hitting the network.
const logClientMock = vi.fn();
vi.mock('@/lib/logger', () => ({
  logClient: (...args: unknown[]) => logClientMock(...args),
}));

import { persist, __drainForTests, __queueLength } from './persistQueue';

beforeEach(() => {
  vi.useFakeTimers();
  logClientMock.mockReset();
});

afterEach(async () => {
  // Ensure no work leaks into the next test.
  try {
    await __drainForTests();
  } catch {
    /* ignore */
  }
  vi.useRealTimers();
});

describe('persistQueue — robust retry + Telegram on terminal failure', () => {
  it('succeeds on first try without retrying or logging', async () => {
    const run = vi.fn(() => Promise.resolve('ok'));
    persist('happy', run);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(__queueLength()).toBe(0);
    expect(logClientMock).not.toHaveBeenCalled();
  });

  it('retries a transient failure and then succeeds (no Telegram log)', async () => {
    let calls = 0;
    const run = vi.fn(() => {
      calls += 1;
      return calls < 2 ? Promise.reject(new Error('flaky')) : Promise.resolve();
    });
    persist('retry', run);

    // First attempt fails → it gets queued for a backoff retry.
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(__queueLength()).toBe(1);

    // Drive the backoff timer → the retry runs and succeeds.
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(__queueLength()).toBe(0);
    expect(logClientMock).not.toHaveBeenCalled();
  });

  it('gives up after MAX_ATTEMPTS and reports the failure to Telegram', async () => {
    const run = vi.fn(() => Promise.reject(new Error('always down')));
    persist('doomed', run);

    // Drive plenty of backoff cycles (base 2s, capped 30s + jitter).
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
    }

    // Exactly MAX_ATTEMPTS (6) attempts, then a single terminal Telegram log.
    expect(run).toHaveBeenCalledTimes(6);
    expect(logClientMock).toHaveBeenCalledTimes(1);
    const [message, opts] = logClientMock.mock.calls[0];
    expect(String(message)).toContain('doomed');
    expect(opts).toMatchObject({ level: 'error', context: 'persistQueue' });
    expect(__queueLength()).toBe(0);
  });

  it('does not flush while offline, then flushes once back online', async () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const run = vi.fn(() => Promise.reject(new Error('offline first')));
    persist('offline', run);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1); // first immediate attempt

    // While offline, the scheduled flush must NOT run the task again.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(__queueLength()).toBe(1);

    // Back online → next flush retries.
    onLineSpy.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(2);

    onLineSpy.mockRestore();
  });
});
