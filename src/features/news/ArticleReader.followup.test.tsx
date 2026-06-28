import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article } from '@/lib/api/news';

// Stateful in-memory mirror of the backend article-chats store, keyed on
// article id — exactly how the real backend keys it (no "saved" gate).
const h = vi.hoisted(() => ({
  chats: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock('./hooks', () => ({
  useMarkRead: () => ({ mutate: vi.fn() }),
  useToggleSave: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/lib/api/news', () => ({
  fetchArticleChats: vi.fn((id: string) => Promise.resolve(h.chats[id] ?? [])),
  saveArticleChat: vi.fn((m: { articleId: string }) => {
    (h.chats[m.articleId] ??= []).push(m as Record<string, unknown>);
    return Promise.resolve();
  }),
  clearArticleChats: vi.fn((id: string) => {
    delete h.chats[id];
    return Promise.resolve();
  }),
  articleFollowUp: vi.fn(() =>
    Promise.resolve({ answer: 'Because of the monsoon.', model: 'gemini-lite', sources: [], searchQueries: [] }),
  ),
  summarizeArticle: vi.fn(() => Promise.resolve('')),
}));

import { ArticleReader } from './ArticleReader';

function art(p: Partial<Article> & { id: string }): Article {
  return {
    id: p.id,
    title: p.title ?? 'Why is it raining?',
    excerpt: 'excerpt',
    source: 'Source',
    category: 'AI News',
    imageUrl: null,
    readTime: '5 min',
    timeAgo: null,
    date: '2026-06-27T12:00:00.000Z',
    tag: null,
    isFeatured: false,
    isSaved: p.isSaved ?? false,
    isRead: false,
    originalUrl: 'https://example.com/a',
    publishedAt: '2026-06-27T12:00:00.000Z',
    isFullContent: false,
    summaryMarkdown: 'Body text.',
  };
}

function renderReader(article: Article) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ArticleReader article={article} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const k of Object.keys(h.chats)) delete h.chats[k];
});
afterEach(() => cleanup());

describe('ArticleReader — follow-up chat persistence (no save needed, cross-device)', () => {
  it('persists a follow-up turn keyed on the article id even when the article is NOT saved', async () => {
    renderReader(art({ id: 'news-1', isSaved: false }));

    fireEvent.change(screen.getByPlaceholderText(/ask anything about this article/i), {
      target: { value: 'why?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('Because of the monsoon.');
    // Both turns persisted to the server under the article id — unsaved article.
    await waitFor(() => expect(h.chats['news-1']?.length).toBe(2));
    expect(h.chats['news-1'].map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(h.chats['news-1'][0].text).toBe('why?');
  });

  it('loads a previously-persisted chat on open (the other-device → this-device direction)', async () => {
    h.chats['news-2'] = [
      { id: 'c1', article_id: 'news-2', role: 'user', text: 'asked elsewhere', model: '', sources_json: '[]', created_at: '2026-06-28T00:00:00Z' },
      { id: 'c2', article_id: 'news-2', role: 'assistant', text: 'answered elsewhere', model: 'gemini-lite', sources_json: '[]', created_at: '2026-06-28T00:00:30Z' },
    ];
    renderReader(art({ id: 'news-2' }));
    await screen.findByText('asked elsewhere');
    await screen.findByText('answered elsewhere');
  });
});
