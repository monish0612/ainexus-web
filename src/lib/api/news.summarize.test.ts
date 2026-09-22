import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  api: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
}));

import { api } from './client';
import { NEWS_SUMMARY_CONTENT_LIMIT } from '@/lib/constants';
import { Article, summarizeArticle, truncateForSummary } from './news';

const post = api.post as unknown as ReturnType<typeof vi.fn>;

function article(body: string): Article {
  return {
    id: 'a1',
    title: 'Headline',
    excerpt: 'excerpt',
    source: 'Source',
    category: 'AI News',
    imageUrl: null,
    readTime: null,
    timeAgo: null,
    date: null,
    tag: null,
    isFeatured: false,
    isSaved: false,
    isRead: false,
    originalUrl: 'https://example.com/a',
    publishedAt: null,
    isFullContent: true,
    summaryMarkdown: body,
  };
}

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { summaries: [{ summary: 'ok' }] } });
});

describe('truncateForSummary', () => {
  it('leaves anything within the limit untouched', () => {
    expect(truncateForSummary('short body')).toBe('short body');
  });

  it('never returns more than the limit', () => {
    const long = 'x'.repeat(10_577);
    expect(truncateForSummary(long).length).toBeLessThanOrEqual(
      NEWS_SUMMARY_CONTENT_LIMIT,
    );
  });

  it('cuts on a boundary rather than mid-word', () => {
    const out = truncateForSummary(`${'word '.repeat(2000)}tail`);
    expect(out.length).toBeLessThanOrEqual(NEWS_SUMMARY_CONTENT_LIMIT);
    expect(out.endsWith('word')).toBe(true);
  });

  it('still cuts when the text has no boundary at all', () => {
    expect(truncateForSummary('y'.repeat(9000), 100)).toHaveLength(100);
  });
});

describe('summarizeArticle', () => {
  it('never sends more content than the backend accepts', async () => {
    // The body length that reproduced the live 400.
    await summarizeArticle(article('sentence one. '.repeat(800)));

    const sent = post.mock.calls[0][1].articles[0].content as string;
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThanOrEqual(NEWS_SUMMARY_CONTENT_LIMIT);
  });

  it('sends a short article verbatim', async () => {
    await summarizeArticle(article('A short body.'));
    expect(post.mock.calls[0][1].articles[0].content).toBe('A short body.');
  });

  it('posts to the batch endpoint with the article identity intact', async () => {
    await summarizeArticle(article('body'));
    expect(post.mock.calls[0][0]).toBe('/ai/summarize-articles-batch');
    expect(post.mock.calls[0][1].articles[0]).toMatchObject({
      id: 'a1',
      title: 'Headline',
      source: 'Source',
      category: 'AI News',
    });
  });
});
