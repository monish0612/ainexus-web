import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Expense } from '@/lib/api/expense';

/**
 * Expense "Ask AI" — the request shape is Android's, and the spec is executed
 * with Android's filter semantics. Both halves are asserted here because the
 * whole point of this surface is that the same question gives the same rows on
 * the phone and on the web.
 *
 * Reference:
 *   ai_nexus/lib/data/services/expense_ai_search_service.dart  (request + parse)
 *   ai_nexus/lib/data/repositories/expense_repository.dart     (_applyRangeFilters)
 *   ai_nexus/.../modals/expense_ai_ask_sheet.dart              (_submit, fallback)
 */

const h = vi.hoisted(() => ({
  posts: [] as { url: string; body: Record<string, unknown> }[],
  reply: null as unknown,
  fail: false,
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    post: (url: string, body: Record<string, unknown> = {}) => {
      h.posts.push({ url, body });
      if (h.fail) return Promise.reject(new Error('offline'));
      return Promise.resolve({ data: h.reply });
    },
  },
}));

vi.mock('@/store/settingsStore', () => {
  const state = { liteModel: 'gemini-3.1-flash-lite-preview' };
  const useSettingsStore = (() => state) as unknown as {
    (): typeof state;
    getState: () => typeof state;
  };
  useSettingsStore.getState = () => state;
  return { useSettingsStore };
});

import { expenseAiQuery, parseExpenseQuerySpec } from '@/lib/api/expenseAi';
import { bucketsFor, keywordFallbackSpec, runExpenseQuerySpec, sumOf } from './askAi';

function exp(p: Partial<Expense> & { id: string }): Expense {
  return {
    id: p.id,
    amount: p.amount ?? 100,
    description: p.description ?? 'thing',
    category: p.category ?? 'Food',
    bank: p.bank ?? 'HDFC',
    cardType: p.cardType ?? 'CC',
    date: p.date ?? '2026-06-15T12:00:00',
    comments: p.comments,
  };
}

beforeEach(() => {
  h.posts.length = 0;
  h.reply = null;
  h.fail = false;
});
afterEach(() => vi.useRealTimers());

describe('expenseAiQuery — the exact Android request, nothing more', () => {
  it('posts question + now + categories + liteModel and NO model-routing fields', async () => {
    h.reply = { title: 'Food today', answer: 'You spent a bit.' };
    await expenseAiQuery('food today', {
      categories: ['Food', 'Grocery'],
      liteModel: 'gemini-3.1-flash-lite-preview',
    });

    expect(h.posts).toHaveLength(1);
    expect(h.posts[0].url).toBe('/ai/expense-query');
    const body = h.posts[0].body;
    expect(Object.keys(body).sort()).toEqual(['categories', 'liteModel', 'now', 'question']);
    expect(body.question).toBe('food today');
    expect(body.categories).toEqual(['Food', 'Grocery']);
    expect(body.liteModel).toBe('gemini-3.1-flash-lite-preview');
    // This surface is lite-only on Android. A second model id here would
    // change which model the backend resolver picks.
    expect(body.provider).toBeUndefined();
    expect(body.mode).toBeUndefined();
    expect(body.deepModel).toBeUndefined();
    expect(body.xgrokLiteModel).toBeUndefined();
  });

  it('sends `now` as a naive LOCAL ISO with seconds precision (no Z, no millis)', async () => {
    h.reply = {};
    await expenseAiQuery('anything');
    const now = String(h.posts[0].body.now);
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('omits categories and liteModel when they are empty', async () => {
    h.reply = {};
    await expenseAiQuery('anything', { categories: [], liteModel: '   ' });
    expect(Object.keys(h.posts[0].body).sort()).toEqual(['now', 'question']);
  });

  it('never calls the backend for a blank question', async () => {
    expect(await expenseAiQuery('   ')).toBeNull();
    expect(h.posts).toHaveLength(0);
  });

  it('returns null (not a throw) when the call fails, so the caller can fall back', async () => {
    h.fail = true;
    expect(await expenseAiQuery('food today')).toBeNull();
  });

  it('returns null when the response is not an object', async () => {
    h.reply = ['nope'];
    expect(await expenseAiQuery('food today')).toBeNull();
  });
});

describe('parseExpenseQuerySpec — mirrors ExpenseQuerySpec.fromJson', () => {
  it('maps searchAny → searchTerms, dedupes case-insensitively and caps at 12', () => {
    const spec = parseExpenseQuerySpec({
      searchAny: [
        'Car', 'car', 'CAR ', 'petrol', 'fuel', 'service', 'tyre', 'insurance',
        'parking', 'toll', 'wash', 'rto', 'emi', 'spare', 'garage',
        '', '   ', 42, 'x'.repeat(41),
      ],
    });
    expect(spec.searchTerms).toHaveLength(12);
    expect(spec.searchTerms[0]).toBe('Car');
    expect(spec.searchTerms.filter((t) => t.toLowerCase() === 'car')).toHaveLength(1);
  });

  it('clamps limit into 1..500 and defaults to 500', () => {
    expect(parseExpenseQuerySpec({}).limit).toBe(500);
    expect(parseExpenseQuerySpec({ limit: 0 }).limit).toBe(1);
    expect(parseExpenseQuerySpec({ limit: 9999 }).limit).toBe(500);
    expect(parseExpenseQuerySpec({ limit: '25' }).limit).toBe(25);
    expect(parseExpenseQuerySpec({ limit: 'abc' }).limit).toBe(500);
  });

  it('parses sort with date_desc as the default', () => {
    expect(parseExpenseQuerySpec({ sort: 'amount_desc' }).sort).toBe('amount_desc');
    expect(parseExpenseQuerySpec({ sort: 'date_asc' }).sort).toBe('date_asc');
    expect(parseExpenseQuerySpec({ sort: 'nonsense' }).sort).toBe('date_desc');
    expect(parseExpenseQuerySpec({}).sort).toBe('date_desc');
  });

  it('only produces a chart when mode is chart, and guesses category when the type is unclear', () => {
    expect(parseExpenseQuerySpec({ chartType: 'daily' }).chart).toBe('none');
    expect(parseExpenseQuerySpec({ mode: 'chart', chartType: 'daily' }).chart).toBe('daily');
    expect(parseExpenseQuerySpec({ mode: 'chart', chartType: 'huh' }).chart).toBe('category');
    expect(parseExpenseQuerySpec({ mode: 'summary' }).isSummary).toBe(true);
  });

  it('flags the salary topic and defaults the title', () => {
    expect(parseExpenseQuerySpec({ topic: 'salary' }).isSalaryTopic).toBe(true);
    expect(parseExpenseQuerySpec({}).isSalaryTopic).toBe(false);
    expect(parseExpenseQuerySpec({}).title).toBe('Results');
    expect(parseExpenseQuerySpec({ title: '  ' }).title).toBe('Results');
  });
});

describe('runExpenseQuerySpec — Android filter semantics', () => {
  const rows = [
    exp({ id: '1', date: '2026-06-01T09:00:00', amount: 300, description: 'Swiggy dinner' }),
    exp({ id: '2', date: '2026-06-30T23:59:00', amount: 50, description: 'Chai', category: 'Food' }),
    exp({ id: '3', date: '2026-07-01T00:00:00', amount: 900, description: 'Petrol', category: 'Fuel' }),
    exp({ id: '4', date: '2026-06-15T10:00:00', amount: 120, description: 'Auto', category: 'Transport', bank: 'SCAPIA' }),
    exp({ id: '5', date: '2026-06-20T10:00:00', amount: 700, description: 'Service', category: 'Transport', comments: 'car workshop' }),
  ];

  it('treats endIso as EXCLUSIVE and startIso as inclusive', () => {
    const got = runExpenseQuerySpec(rows, {
      ...keywordFallbackSpec(''),
      search: null,
      startIso: '2026-06-01T00:00:00',
      endIso: '2026-07-01T00:00:00',
    });
    expect(got.map((e) => e.id).sort()).toEqual(['1', '2', '4', '5']);
  });

  it('matches category exactly, not as a contains', () => {
    const got = runExpenseQuerySpec(rows, {
      ...keywordFallbackSpec(''),
      search: null,
      category: 'Food',
    });
    expect(got.map((e) => e.id).sort()).toEqual(['1', '2']);
    expect(
      runExpenseQuerySpec(rows, { ...keywordFallbackSpec(''), search: null, category: 'Foo' }),
    ).toHaveLength(0);
  });

  it('searches description, category and comments — but not bank', () => {
    expect(
      runExpenseQuerySpec(rows, { ...keywordFallbackSpec('swiggy') }).map((e) => e.id),
    ).toEqual(['1']);
    expect(
      runExpenseQuerySpec(rows, { ...keywordFallbackSpec('transport') }).map((e) => e.id).sort(),
    ).toEqual(['4', '5']);
    expect(
      runExpenseQuerySpec(rows, { ...keywordFallbackSpec('workshop') }).map((e) => e.id),
    ).toEqual(['5']);
    // Bank is intentionally not part of the haystack (the SQL doesn't include it).
    expect(runExpenseQuerySpec(rows, { ...keywordFallbackSpec('scapia') })).toHaveLength(0);
  });

  it('treats searchTerms as an OR-group and ANDs it with search', () => {
    const anyCar = runExpenseQuerySpec(rows, {
      ...keywordFallbackSpec(''),
      search: null,
      searchTerms: ['car', 'petrol'],
    });
    expect(anyCar.map((e) => e.id).sort()).toEqual(['3', '5']);

    const both = runExpenseQuerySpec(rows, {
      ...keywordFallbackSpec('service'),
      searchTerms: ['car', 'petrol'],
    });
    expect(both.map((e) => e.id)).toEqual(['5']);
  });

  it('sorts and limits', () => {
    const top = runExpenseQuerySpec(rows, {
      ...keywordFallbackSpec(''),
      search: null,
      sort: 'amount_desc',
      limit: 2,
    });
    expect(top.map((e) => e.id)).toEqual(['3', '5']);

    const oldest = runExpenseQuerySpec(rows, {
      ...keywordFallbackSpec(''),
      search: null,
      sort: 'date_asc',
    });
    expect(oldest[0].id).toBe('1');
  });

  it('does not mutate the caller array', () => {
    const copy = [...rows];
    runExpenseQuerySpec(rows, { ...keywordFallbackSpec(''), search: null, sort: 'amount_asc' });
    expect(rows).toEqual(copy);
  });
});

describe('keywordFallbackSpec — the AI-offline path', () => {
  it('turns the raw question into a keyword search with the Android copy', () => {
    const spec = keywordFallbackSpec('  anything related to my car  ');
    expect(spec.search).toBe('anything related to my car');
    expect(spec.answer).toContain('Showing keyword matches for "anything related to my car"');
    expect(spec.answer).toContain('AI is offline');
    expect(spec.sort).toBe('date_desc');
    expect(spec.isSalaryTopic).toBe(false);
  });

  it('truncates a long question for the title, like the timeframe label does', () => {
    const spec = keywordFallbackSpec('a'.repeat(40));
    expect(spec.title).toBe(`${'a'.repeat(28)}…`);
    expect(keywordFallbackSpec('short').title).toBe('short');
  });
});

describe('bucketsFor / sumOf', () => {
  const rows = [
    exp({ id: '1', date: '2026-06-01T09:00:00', amount: 300, category: 'Food' }),
    exp({ id: '2', date: '2026-06-01T20:00:00', amount: 100, category: 'Fuel' }),
    exp({ id: '3', date: '2026-07-02T09:00:00', amount: 900, category: 'Fuel' }),
  ];

  it('returns nothing when no chart was asked for', () => {
    expect(bucketsFor(rows, 'none')).toEqual([]);
  });

  it('orders category buckets biggest-first', () => {
    expect(bucketsFor(rows, 'category')).toEqual([
      { label: 'Fuel', value: 1000 },
      { label: 'Food', value: 300 },
    ]);
  });

  it('keeps time buckets chronological', () => {
    expect(bucketsFor(rows, 'monthly')).toEqual([
      { label: '2026-06', value: 400 },
      { label: '2026-07', value: 900 },
    ]);
    expect(bucketsFor(rows, 'daily').map((b) => b.label)).toEqual(['2026-06-01', '2026-07-02']);
  });

  it('sums the rows', () => {
    expect(sumOf(rows)).toBe(1300);
    expect(sumOf([])).toBe(0);
  });
});
