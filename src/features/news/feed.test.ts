import { describe, it, expect } from 'vitest';
import type { Article } from '@/lib/api/news';
import { selectNewsFeed } from './feed';

// Minimal Article factory — only the fields the filter cares about.
function art(p: Partial<Article> & { id: string }): Article {
  return {
    id: p.id,
    title: p.title ?? p.id,
    excerpt: '',
    source: '',
    category: p.category ?? 'AI News',
    imageUrl: null,
    readTime: null,
    timeAgo: null,
    date: null,
    tag: null,
    isFeatured: false,
    isSaved: p.isSaved ?? false,
    isRead: p.isRead ?? false,
    originalUrl: '',
    publishedAt: null,
    isFullContent: false,
    summaryMarkdown: '',
  };
}

const ids = (list: Article[]) => list.map((a) => a.id);

// A representative pool covering every read/saved/category combination.
const pool: Article[] = [
  art({ id: 'ai-unread', category: 'AI News' }),
  art({ id: 'fin-unread', category: 'Finance' }),
  art({ id: 'ai-read', category: 'AI News', isRead: true }),
  art({ id: 'ai-saved', category: 'AI News', isSaved: true }),
  art({ id: 'ai-read-saved', category: 'AI News', isRead: true, isSaved: true }),
  art({ id: 'movie-unread', category: 'Movies' }),
  art({ id: 'general-unread', category: 'General' }),
  art({ id: 'movie-saved', category: 'Movies', isSaved: true }),
];

describe('selectNewsFeed — For You', () => {
  it('All: only unread+unsaved, and hides Movies/General', () => {
    const out = selectNewsFeed(pool, 'foryou', 'All');
    expect(ids(out)).toEqual(['ai-unread', 'fin-unread']);
  });

  it('All: excludes read, saved, and read+saved articles', () => {
    const out = ids(selectNewsFeed(pool, 'foryou', 'All'));
    expect(out).not.toContain('ai-read');
    expect(out).not.toContain('ai-saved');
    expect(out).not.toContain('ai-read-saved');
  });

  it('Movies chip: shows unread+unsaved Movies (full-body feed behind its chip)', () => {
    const out = selectNewsFeed(pool, 'foryou', 'Movies');
    expect(ids(out)).toEqual(['movie-unread']); // movie-saved is excluded
  });

  it('General chip: shows unread+unsaved General', () => {
    expect(ids(selectNewsFeed(pool, 'foryou', 'General'))).toEqual(['general-unread']);
  });

  it('Finance chip: only unread+unsaved Finance', () => {
    expect(ids(selectNewsFeed(pool, 'foryou', 'Finance'))).toEqual(['fin-unread']);
  });

  it('AI News chip: read & saved AI items are filtered out', () => {
    expect(ids(selectNewsFeed(pool, 'foryou', 'AI News'))).toEqual(['ai-unread']);
  });
});

describe('selectNewsFeed — Saved', () => {
  it('All: every saved article regardless of read state, incl. Movies/General', () => {
    expect(ids(selectNewsFeed(pool, 'saved', 'All'))).toEqual([
      'ai-saved',
      'ai-read-saved',
      'movie-saved',
    ]);
  });

  it('chip: saved narrowed by category', () => {
    expect(ids(selectNewsFeed(pool, 'saved', 'Movies'))).toEqual(['movie-saved']);
    expect(ids(selectNewsFeed(pool, 'saved', 'AI News'))).toEqual([
      'ai-saved',
      'ai-read-saved',
    ]);
  });
});

describe('selectNewsFeed — edge cases', () => {
  it('empty input → empty output for both tabs', () => {
    expect(selectNewsFeed([], 'foryou', 'All')).toEqual([]);
    expect(selectNewsFeed([], 'saved', 'All')).toEqual([]);
  });

  it('all read → For You is empty', () => {
    const allRead = pool.map((a) => ({ ...a, isRead: true }));
    expect(selectNewsFeed(allRead, 'foryou', 'All')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const snapshot = ids(pool);
    selectNewsFeed(pool, 'foryou', 'All');
    selectNewsFeed(pool, 'saved', 'All');
    expect(ids(pool)).toEqual(snapshot);
  });
});
