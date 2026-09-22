import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article } from '@/lib/api/news';

/**
 * Composer-level guarantees for the news follow-up, plus the guard rail for
 * `ArticleReader.test.tsx`: jsdom ignores the `sm:` media query, so the
 * `.hidden sm:inline` label spans are what make the action-bar pills findable
 * by name. If a restyle drops them, THIS test says so.
 */

const h = vi.hoisted(() => ({
  gate: null as null | (() => void),
}));

vi.mock('./hooks', () => ({
  useMarkRead: () => ({ mutate: vi.fn() }),
  useToggleSave: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/lib/api/news', () => ({
  fetchArticleChats: vi.fn(() => Promise.resolve([])),
  saveArticleChat: vi.fn(() => Promise.resolve()),
  clearArticleChats: vi.fn(() => Promise.resolve()),
  articleFollowUp: vi.fn(async () => {
    if (h.gate) {
      await new Promise<void>((resolve) => {
        h.gate = resolve;
      });
    }
    return { answer: 'Because of the monsoon.', model: 'gemini-lite', sources: [], searchQueries: [] };
  }),
  summarizeArticle: vi.fn(() => Promise.resolve('')),
}));

import { articleFollowUp } from '@/lib/api/news';
import { ArticleReader } from './ArticleReader';

function art(): Article {
  return {
    id: 'news-1',
    title: 'Why is it raining?',
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
    summaryMarkdown: 'Body text.',
  };
}

function renderReader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ArticleReader article={art()} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

function field() {
  return screen.getByPlaceholderText(/ask anything about this article/i) as HTMLTextAreaElement;
}

beforeEach(() => {
  h.gate = null;
  vi.mocked(articleFollowUp).mockClear();
});
afterEach(() => {
  cleanup();
  delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight;
});

describe('Article follow-up composer — keyboard contract', () => {
  it('Enter sends the follow-up', async () => {
    renderReader();
    fireEvent.change(field(), { target: { value: 'why?' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(articleFollowUp).toHaveBeenCalledTimes(1));
  });

  it('Shift+Enter does not send', async () => {
    renderReader();
    fireEvent.change(field(), { target: { value: 'why?' } });
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(articleFollowUp).not.toHaveBeenCalled();
  });

  it('grows with its content', () => {
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 88,
    });
    renderReader();
    fireEvent.change(field(), { target: { value: 'a\nb' } });
    expect(field().style.height).toBe('88px');
  });
});

describe('Article follow-up composer — wait state', () => {
  it('announces the wait while the follow-up is in flight and clears it after', async () => {
    h.gate = () => {};
    renderReader();
    fireEvent.change(field(), { target: { value: 'why?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Searching'));

    const resolve = h.gate;
    h.gate = null;
    resolve?.();
    await screen.findByText('Because of the monsoon.');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('ArticleReader action bar — the label spans other tests depend on', () => {
  it('keeps the responsive label spans so the pills stay findable by name', () => {
    renderReader();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /mark read/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /source/i })).toBeTruthy();
    // The label text is inside a `hidden sm:inline` span — visible on desktop,
    // always present in the accessible name.
    const save = screen.getByRole('button', { name: /^save$/i });
    expect(save.querySelector('span.hidden')).toBeTruthy();
  });
});
