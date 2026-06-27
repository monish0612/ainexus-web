import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article } from '@/lib/api/news';

// Spy on the read/save mutations without standing up the real react-query layer.
const markReadMutate = vi.fn();
const toggleSaveMutate = vi.fn();
vi.mock('./hooks', () => ({
  useMarkRead: () => ({ mutate: markReadMutate }),
  useToggleSave: () => ({ mutate: toggleSaveMutate }),
}));

// FollowUpChat fetches chats on mount — stub the news API so it's inert.
vi.mock('@/lib/api/news', () => ({
  fetchArticleChats: vi.fn(() => Promise.resolve([])),
  saveArticleChat: vi.fn(() => Promise.resolve()),
  clearArticleChats: vi.fn(() => Promise.resolve()),
  articleFollowUp: vi.fn(() =>
    Promise.resolve({ answer: '', model: '', sources: [], searchQueries: [] }),
  ),
  summarizeArticle: vi.fn(() => Promise.resolve('')),
}));

import { ArticleReader } from './ArticleReader';

function art(p: Partial<Article> & { id: string }): Article {
  return {
    id: p.id,
    title: p.title ?? 'Test headline',
    excerpt: 'excerpt',
    source: 'Source',
    category: p.category ?? 'AI News',
    imageUrl: null,
    readTime: '5 min',
    timeAgo: null,
    date: '2026-06-27T12:00:00.000Z',
    tag: null,
    isFeatured: false,
    isSaved: p.isSaved ?? false,
    isRead: p.isRead ?? false,
    originalUrl: 'https://example.com/a',
    publishedAt: '2026-06-27T12:00:00.000Z',
    isFullContent: false,
    summaryMarkdown: 'Hello body text.',
  };
}

function renderReader(article: Article, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ArticleReader article={article} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  markReadMutate.mockReset();
  toggleSaveMutate.mockReset();
});

afterEach(() => {
  cleanup(); // unmount + clear the portal so renders don't accumulate
});

describe('ArticleReader — read/save wiring (Android parity)', () => {
  it('opening an article does NOT mark it read', () => {
    renderReader(art({ id: 'a1' }));
    // The reader is shown…
    expect(screen.getByRole('button', { name: /mark read/i })).toBeTruthy();
    // …but merely opening it never triggers a read.
    expect(markReadMutate).not.toHaveBeenCalled();
  });

  it('clicking "Mark read" marks it read and then closes', async () => {
    const { onClose } = renderReader(art({ id: 'a1' }));
    fireEvent.click(screen.getByRole('button', { name: /mark read/i }));
    expect(markReadMutate).toHaveBeenCalledWith('a1');
    expect(markReadMutate).toHaveBeenCalledTimes(1);
    // Closes shortly after (mirrors the app's brief "Done" then dismiss).
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('an already-read article shows "Done" and tapping is a no-op', async () => {
    const { onClose } = renderReader(art({ id: 'a2', isRead: true }));
    const btn = screen.getByRole('button', { name: /done/i });
    fireEvent.click(btn);
    expect(markReadMutate).not.toHaveBeenCalled();
    // Give the (non-existent) close timer a chance to fire — it must not.
    await new Promise((r) => setTimeout(r, 350));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clicking "Save" toggles save WITHOUT marking read or closing', async () => {
    const { onClose } = renderReader(art({ id: 'a3' }));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(toggleSaveMutate).toHaveBeenCalledWith('a3');
    expect(markReadMutate).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 350));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a saved article still does not auto-mark read on open', () => {
    renderReader(art({ id: 'a4', isSaved: true }));
    expect(markReadMutate).not.toHaveBeenCalled();
    // Save pill reflects saved state.
    expect(screen.getByRole('button', { name: /saved/i })).toBeTruthy();
  });
});
