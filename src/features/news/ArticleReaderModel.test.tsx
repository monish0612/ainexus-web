import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article } from '@/lib/api/news';

/**
 * Real-UI flow test for the News article follow-up: drive the ModelPicker
 * exactly like a user (switch Gemini↔xGrok and Lite↔Deep per message) and
 * assert the request body sent to the backend carries the PICKED model — the
 * crux of the "2nd message used Google Deep" bug.
 */
const h = vi.hoisted(() => ({
  calls: [] as { url: string; body: Record<string, unknown> }[],
  settings: {
    xgrokEnabled: true,
    defaultFollowUpProvider: 'gemini',
    onlineSearchProvider: 'gemini',
    deepModel: 'gemini-3.1-pro-preview',
    liteModel: 'gemini-3.1-flash-lite-preview',
    xgrokLiteModel: 'grok-4-1-fast-non-reasoning',
    xgrokDeepModel: 'grok-4-0709',
    xgrokThinkingModel: 'grok-4-1-fast-reasoning',
  },
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    post: (url: string, body: Record<string, unknown>) => {
      h.calls.push({ url, body: body || {} });
      const b = body || {};
      const model =
        b.xgrokThinkingModel || b.xgrokDeepModel || b.xgrokLiteModel || b.deepModel || b.liteModel || '';
      return Promise.resolve({ data: { answer: 'Answer text', model, sources: [], searchQueries: [] } });
    },
    get: () => Promise.resolve({ data: [] }),
    delete: () => Promise.resolve({ data: {} }),
  },
}));

vi.mock('@/store/settingsStore', () => {
  const useSettingsStore = ((sel?: (s: typeof h.settings) => unknown) =>
    sel ? sel(h.settings) : h.settings) as unknown as {
    (sel?: (s: typeof h.settings) => unknown): unknown;
    getState: () => typeof h.settings;
  };
  useSettingsStore.getState = () => h.settings;
  return { useSettingsStore };
});

vi.mock('./hooks', () => ({
  useMarkRead: () => ({ mutate: vi.fn() }),
  useToggleSave: () => ({ mutate: vi.fn() }),
}));

import { ArticleReader } from './ArticleReader';

function art(): Article {
  return {
    id: 'a1',
    title: 'Test headline',
    excerpt: 'excerpt',
    source: 'Source',
    category: 'AI News',
    imageUrl: null,
    readTime: '5 min',
    timeAgo: null,
    date: '2026-06-27T12:00:00.000Z',
    tag: null,
    isFeatured: false,
    isSaved: false,
    isRead: false,
    originalUrl: 'https://example.com/a',
    publishedAt: '2026-06-27T12:00:00.000Z',
    isFullContent: false,
    summaryMarkdown: 'Body.',
  };
}

function followups() {
  return h.calls.filter((c) => c.url === '/ai/article-followup');
}

function renderReader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ArticleReader article={art()} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

async function ask(text: string) {
  const box = screen.getByPlaceholderText(/ask anything about this article/i);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
}

beforeEach(() => {
  h.calls.length = 0;
});
afterEach(() => cleanup());

describe('Article follow-up — picked model reaches the backend', () => {
  it('default first message is Gemini + Lite', async () => {
    renderReader();
    await ask('q1');
    await waitFor(() => expect(followups().length).toBe(1));
    expect(followups()[0].body).toMatchObject({
      provider: 'gemini',
      mode: 'lite',
      liteModel: h.settings.liteModel,
    });
    expect(followups()[0].body.deepModel).toBeUndefined();
    expect(followups()[0].body.xgrokLiteModel).toBeUndefined();
  });

  it('switching to xGrok + Lite on the 2nd message sends xgrokLiteModel (NOT gemini deep)', async () => {
    renderReader();
    await ask('q1');
    await waitFor(() => expect(followups().length).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: /xGrok/i }));
    await ask('q2');
    await waitFor(() => expect(followups().length).toBe(2));

    const b = followups()[1].body;
    expect(b).toMatchObject({ provider: 'xgrok', mode: 'lite', xgrokLiteModel: h.settings.xgrokLiteModel });
    expect(b.deepModel).toBeUndefined();
    expect(b.liteModel).toBeUndefined();
  });

  it('switching to xGrok + Deep sends xgrokDeepModel only', async () => {
    renderReader();
    fireEvent.click(screen.getByRole('button', { name: /xGrok/i }));
    fireEvent.click(screen.getByRole('button', { name: /^deep$/i }));
    await ask('q1');
    await waitFor(() => expect(followups().length).toBe(1));

    const b = followups()[0].body;
    expect(b).toMatchObject({ provider: 'xgrok', mode: 'deep', xgrokDeepModel: h.settings.xgrokDeepModel });
    expect(b.liteModel).toBeUndefined();
    expect(b.deepModel).toBeUndefined();
    expect(b.xgrokLiteModel).toBeUndefined();
  });

  it('switching back Gemini + Deep sends deepModel only', async () => {
    renderReader();
    // go xGrok then back to Gemini, pick Deep
    fireEvent.click(screen.getByRole('button', { name: /xGrok/i }));
    fireEvent.click(screen.getByRole('button', { name: /Gemini/i }));
    fireEvent.click(screen.getByRole('button', { name: /^deep$/i }));
    await ask('q1');
    await waitFor(() => expect(followups().length).toBe(1));

    const b = followups()[0].body;
    expect(b).toMatchObject({ provider: 'gemini', mode: 'deep', deepModel: h.settings.deepModel });
    expect(b.xgrokDeepModel).toBeUndefined();
    expect(b.liteModel).toBeUndefined();
  });
});
