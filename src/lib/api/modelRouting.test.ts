import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deep, payload-level proof that the model the user PICKS is the model the
 * backend RECEIVES — across every flow the user exercised:
 *   • News article follow-up   (articleFollowUp)
 *   • Insight AI search          (groundedSearch / imageSearch)
 *   • Insight AI follow-up       (searchFollowUp)
 *
 * The backend resolves the LLM purely from { provider, mode, <one model id> }.
 * These tests assert that each call ships EXACTLY the matching model id and
 * NEVER leaks an unrelated one (which is what silently upgraded "lite" → "deep").
 */

const SETTINGS = {
  onlineSearchProvider: 'gemini',
  defaultFollowUpProvider: 'gemini',
  deepModel: 'gemini-3.1-pro-preview',
  liteModel: 'gemini-3.1-flash-lite-preview',
  xgrokLiteModel: 'grok-4-1-fast-non-reasoning',
  xgrokDeepModel: 'grok-4-0709',
  xgrokThinkingModel: 'grok-4-1-fast-reasoning',
};

const post = vi.fn((_url: string, _body?: Record<string, unknown>) =>
  Promise.resolve({ data: { answer: 'ok', model: 'x', sources: [], searchQueries: [] } }),
);

vi.mock('@/lib/api/client', () => ({
  api: {
    post: (url: string, body?: Record<string, unknown>) => post(url, body),
    get: vi.fn(() => Promise.resolve({ data: [] })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: { getState: () => SETTINGS },
}));

import { articleFollowUp } from './news';
import { groundedSearch, imageSearch, searchFollowUp } from './tutor';

function lastBody(): Record<string, unknown> {
  expect(post).toHaveBeenCalled();
  const call = post.mock.calls[post.mock.calls.length - 1];
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

const article = {
  id: 'a1',
  title: 'Test',
  originalUrl: 'https://example.com/a',
} as unknown as Parameters<typeof articleFollowUp>[0]['article'];

beforeEach(() => post.mockClear());
afterEach(() => vi.clearAllMocks());

describe('Model routing — exact wire contract per selection', () => {
  it('Gemini + Lite → liteModel only', async () => {
    await articleFollowUp({ article, question: 'q', history: [], provider: 'gemini', mode: 'lite' });
    const b = lastBody();
    expect(b.provider).toBe('gemini');
    expect(b.mode).toBe('lite');
    expect(b.liteModel).toBe(SETTINGS.liteModel);
    expect(b.deepModel).toBeUndefined();
    expect(b.xgrokLiteModel).toBeUndefined();
    expect(b.xgrokDeepModel).toBeUndefined();
    expect(b.xgrokThinkingModel).toBeUndefined();
  });

  it('Gemini + Deep → deepModel only', async () => {
    await articleFollowUp({ article, question: 'q', history: [], provider: 'gemini', mode: 'deep' });
    const b = lastBody();
    expect(b.provider).toBe('gemini');
    expect(b.mode).toBe('deep');
    expect(b.deepModel).toBe(SETTINGS.deepModel);
    expect(b.liteModel).toBeUndefined();
    expect(b.xgrokLiteModel).toBeUndefined();
  });

  it('xGrok + Lite → xgrokLiteModel only (never a deep/gemini field)', async () => {
    await articleFollowUp({ article, question: 'q', history: [], provider: 'xgrok', mode: 'lite' });
    const b = lastBody();
    expect(b.provider).toBe('xgrok');
    expect(b.mode).toBe('lite');
    expect(b.xgrokLiteModel).toBe(SETTINGS.xgrokLiteModel);
    expect(b.deepModel).toBeUndefined();
    expect(b.liteModel).toBeUndefined();
    expect(b.xgrokDeepModel).toBeUndefined();
    expect(b.xgrokThinkingModel).toBeUndefined();
  });

  it('xGrok + Deep → xgrokDeepModel only', async () => {
    await articleFollowUp({ article, question: 'q', history: [], provider: 'xgrok', mode: 'deep' });
    const b = lastBody();
    expect(b.provider).toBe('xgrok');
    expect(b.mode).toBe('deep');
    expect(b.xgrokDeepModel).toBe(SETTINGS.xgrokDeepModel);
    expect(b.liteModel).toBeUndefined();
    expect(b.deepModel).toBeUndefined();
    expect(b.xgrokLiteModel).toBeUndefined();
  });

  it('xGrok + Thinking → xgrokThinkingModel only', async () => {
    await articleFollowUp({ article, question: 'q', history: [], provider: 'xgrok', mode: 'thinking' });
    const b = lastBody();
    expect(b.provider).toBe('xgrok');
    expect(b.mode).toBe('thinking');
    expect(b.xgrokThinkingModel).toBe(SETTINGS.xgrokThinkingModel);
    expect(b.xgrokLiteModel).toBeUndefined();
    expect(b.xgrokDeepModel).toBeUndefined();
  });

  it('Gemini + Thinking collapses to Deep (thinking is xGrok-only)', async () => {
    await articleFollowUp({ article, question: 'q', history: [], provider: 'gemini', mode: 'thinking' });
    const b = lastBody();
    expect(b.provider).toBe('gemini');
    expect(b.mode).toBe('deep');
    expect(b.deepModel).toBe(SETTINGS.deepModel);
    expect(b.xgrokThinkingModel).toBeUndefined();
  });
});

describe('Multi-turn follow-up — each message carries its own model (no carry-over)', () => {
  it('turn 1 Gemini+Lite, turn 2 xGrok+Lite, turn 3 xGrok+Thinking', async () => {
    // Turn 1
    await articleFollowUp({ article, question: 'q1', history: [], provider: 'gemini', mode: 'lite' });
    let b = lastBody();
    expect(b).toMatchObject({ provider: 'gemini', mode: 'lite', liteModel: SETTINGS.liteModel });
    expect(b.xgrokLiteModel).toBeUndefined();

    // Turn 2 — switch to xGrok+Lite. The critical bug scenario: it must NOT
    // resolve to Gemini Deep.
    await articleFollowUp({
      article,
      question: 'q2',
      history: [{ role: 'user', text: 'q1' }, { role: 'assistant', text: 'a1' }],
      provider: 'xgrok',
      mode: 'lite',
    });
    b = lastBody();
    expect(b).toMatchObject({ provider: 'xgrok', mode: 'lite', xgrokLiteModel: SETTINGS.xgrokLiteModel });
    expect(b.deepModel).toBeUndefined();
    expect(b.liteModel).toBeUndefined();

    // Turn 3 — xGrok+Thinking
    await articleFollowUp({ article, question: 'q3', history: [], provider: 'xgrok', mode: 'thinking' });
    b = lastBody();
    expect(b).toMatchObject({
      provider: 'xgrok',
      mode: 'thinking',
      xgrokThinkingModel: SETTINGS.xgrokThinkingModel,
    });
    expect(b.xgrokLiteModel).toBeUndefined();
  });
});

describe('Insight AI search (groundedSearch / imageSearch) honors picked model', () => {
  it('groundedSearch xGrok+Lite', async () => {
    await groundedSearch('query', 'lite', 'xgrok');
    const b = lastBody();
    expect(b).toMatchObject({ provider: 'xgrok', mode: 'lite', xgrokLiteModel: SETTINGS.xgrokLiteModel });
    expect(b.deepModel).toBeUndefined();
  });

  it('groundedSearch Gemini+Deep', async () => {
    await groundedSearch('query', 'deep', 'gemini');
    const b = lastBody();
    expect(b).toMatchObject({ provider: 'gemini', mode: 'deep', deepModel: SETTINGS.deepModel });
    expect(b.xgrokDeepModel).toBeUndefined();
  });

  it('imageSearch xGrok+Deep', async () => {
    await imageSearch('query', 'data', 'image/png', 'deep', 'xgrok');
    const b = lastBody();
    expect(b).toMatchObject({ provider: 'xgrok', mode: 'deep', xgrokDeepModel: SETTINGS.xgrokDeepModel });
    expect(b.liteModel).toBeUndefined();
  });
});

describe('Insight AI follow-up (searchFollowUp) honors per-message model', () => {
  it('follow-up 1 Gemini+Lite then follow-up 2 xGrok+Lite', async () => {
    await searchFollowUp({ query: 'topic', question: 'q1', history: [], mode: 'lite', provider: 'gemini' });
    let b = lastBody();
    expect(b).toMatchObject({ provider: 'gemini', mode: 'lite', liteModel: SETTINGS.liteModel });

    await searchFollowUp({ query: 'topic', question: 'q2', history: [], mode: 'lite', provider: 'xgrok' });
    b = lastBody();
    expect(b).toMatchObject({ provider: 'xgrok', mode: 'lite', xgrokLiteModel: SETTINGS.xgrokLiteModel });
    expect(b.deepModel).toBeUndefined();
  });
});
