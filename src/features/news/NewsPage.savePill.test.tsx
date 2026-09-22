import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article } from '@/lib/api/news';

/**
 * The reader used to be handed the Article object captured when the card was
 * tapped. `useToggleSave` writes through to the query cache, so that snapshot
 * went stale the moment the user saved: the server call succeeded and the
 * Saved tab was right, but the pill in the open sheet still read "Save".
 */

const ARTICLE: Article = {
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
  summaryMarkdown: 'Hello body text.',
};

vi.mock('@/lib/api/news', () => ({
  fetchNews: vi.fn(),
  refreshNews: vi.fn(() => Promise.resolve({})),
  toggleSave: vi.fn(),
  markRead: vi.fn(() => Promise.resolve()),
  markAllRead: vi.fn(() => Promise.resolve()),
  fetchArticle: vi.fn(),
  summarizeArticle: vi.fn(() => Promise.resolve('')),
  fetchArticleChats: vi.fn(() => Promise.resolve([])),
  saveArticleChat: vi.fn(() => Promise.resolve()),
  clearArticleChats: vi.fn(() => Promise.resolve()),
  articleFollowUp: vi.fn(),
}));

import { fetchNews, toggleSave } from '@/lib/api/news';
import NewsPage from './NewsPage';

const list = fetchNews as unknown as ReturnType<typeof vi.fn>;
const save = toggleSave as unknown as ReturnType<typeof vi.fn>;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NewsPage />
    </QueryClientProvider>,
  );
}

/** The sheet's own Save pill, not the bookmark on the card behind it. */
function pill(name: RegExp) {
  return within(screen.getByRole('dialog')).getByRole('button', { name });
}

beforeEach(() => {
  list.mockReset();
  save.mockReset();
  list.mockResolvedValue([{ ...ARTICLE }]);
  save.mockResolvedValue({ article: { ...ARTICLE, isSaved: true }, saved: true });
});

afterEach(cleanup);

describe('NewsPage → ArticleReader save state', () => {
  it('flips the pill to "Saved" without closing and reopening the reader', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Test headline'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeTruthy();

    fireEvent.click(pill(/^save$/i));

    await waitFor(() => expect(save.mock.calls[0]?.[0]).toBe('a1'));
    await waitFor(() => expect(pill(/^saved$/i)).toBeTruthy());
  });

  it('flips back to "Save" when the article is unsaved from the reader', async () => {
    list.mockResolvedValue([{ ...ARTICLE, isSaved: true }]);
    save.mockResolvedValue({ article: { ...ARTICLE, isSaved: false }, saved: false });

    renderPage();
    // A saved article only appears under the Saved tab — For You is
    // unread-and-unsaved (see `selectNewsFeed`).
    fireEvent.click(await screen.findByRole('tab', { name: /saved/i }));
    fireEvent.click(await screen.findByText('Test headline'));
    await screen.findByRole('dialog');

    fireEvent.click(pill(/^saved$/i));
    await waitFor(() => expect(pill(/^save$/i)).toBeTruthy());
  });
});
