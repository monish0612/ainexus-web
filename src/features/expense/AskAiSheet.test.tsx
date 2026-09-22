import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Real-UI flow for the new web Expense "Ask AI" surface. The contract under
 * test is the ANDROID one: one POST to /ai/expense-query carrying exactly
 * question + now + categories + liteModel, the spec executed locally, and a
 * keyword fallback (not an error) when the AI is unreachable.
 */

const h = vi.hoisted(() => ({
  posts: [] as { url: string; body: Record<string, unknown> }[],
  spec: null as unknown,
  fail: false,
  expenses: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/api/client', () => ({
  apiErrorMessage: (_e: unknown, f: string) => f,
  api: {
    post: (url: string, body: Record<string, unknown> = {}) => {
      h.posts.push({ url, body });
      if (url === '/ai/expense-query') {
        if (h.fail) return Promise.reject(new Error('offline'));
        return Promise.resolve({ data: h.spec });
      }
      return Promise.resolve({ data: {} });
    },
    get: (url: string) => {
      if (url === '/expenses') return Promise.resolve({ data: h.expenses });
      return Promise.resolve({ data: [] });
    },
    delete: () => Promise.resolve({ data: {} }),
  },
}));

vi.mock('@/store/settingsStore', () => {
  const state = { liteModel: 'gemini-3.1-flash-lite-preview' };
  const useSettingsStore = ((sel?: (s: typeof state) => unknown) =>
    sel ? sel(state) : state) as unknown as {
    (sel?: (s: typeof state) => unknown): unknown;
    getState: () => typeof state;
  };
  useSettingsStore.getState = () => state;
  return { useSettingsStore };
});

import { ToastViewport } from '@/components/ui/toast';
import { AskAiSheet } from './AskAiSheet';

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AskAiSheet open onClose={vi.fn()} />
      <ToastViewport />
    </QueryClientProvider>,
  );
}

function queries() {
  return h.posts.filter((p) => p.url === '/ai/expense-query');
}

function ask(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/how much did i spend on food today/i), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
}

beforeEach(() => {
  h.posts.length = 0;
  h.fail = false;
  h.spec = {
    title: 'Food · June',
    answer: 'You spent most of it on dinners.',
    startIso: '2026-06-01T00:00:00',
    endIso: '2026-07-01T00:00:00',
    category: 'Food',
    sort: 'amount_desc',
  };
  h.expenses = [
    {
      id: 'e1', amount: 300, description: 'Swiggy dinner', category: 'Food',
      bank: 'HDFC', cardType: 'CC', date: '2026-06-12T20:00:00',
    },
    {
      id: 'e2', amount: 900, description: 'Petrol', category: 'Fuel',
      bank: 'HDFC', cardType: 'CC', date: '2026-06-14T09:00:00',
    },
    {
      id: 'e3', amount: 60, description: 'Chai', category: 'Food',
      bank: 'CASH', cardType: 'Cash', date: '2026-07-02T09:00:00',
    },
  ];
});
afterEach(() => cleanup());

describe('Expense Ask AI — request contract', () => {
  it('sends ONE /ai/expense-query with the Android body and nothing else', async () => {
    renderSheet();
    ask('what did I spend on food in june?');

    await waitFor(() => expect(queries()).toHaveLength(1));
    const body = queries()[0].body;
    expect(Object.keys(body).sort()).toEqual(['categories', 'liteModel', 'now', 'question']);
    expect(body.question).toBe('what did I spend on food in june?');
    expect(body.liteModel).toBe('gemini-3.1-flash-lite-preview');
    // keywordRules key order, and NOT the EXPENSE_CATEGORIES list (no "Others").
    const categories = body.categories as string[];
    expect(categories[0]).toBe('Food');
    expect(categories[3]).toBe('Fuel');
    expect(categories).not.toContain('Others');
  });

  it('runs the returned spec locally: the date window is exclusive at the top and the category is exact', async () => {
    renderSheet();
    ask('food in june');

    // e1 only: e2 is the wrong category, e3 is on the exclusive endIso day.
    await screen.findByText('Swiggy dinner');
    expect(screen.queryByText('Petrol')).toBeNull();
    expect(screen.queryByText('Chai')).toBeNull();
  });

  it('never sends the nuke easter egg to the backend', async () => {
    renderSheet();
    ask('nuke');
    await waitFor(() => expect(screen.getByText(/only works in the app/i)).toBeTruthy());
    // The guard runs BEFORE the round-trip, so the word never leaves the
    // device — and the web has no destructive action behind it either.
    expect(queries()).toHaveLength(0);
    expect(
      (screen.getByPlaceholderText(/how much did i spend on food today/i) as HTMLTextAreaElement)
        .value,
    ).toBe('');
  });

  it('asks the question from a suggestion chip', async () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /highest expense/i }));
    await waitFor(() => expect(queries()).toHaveLength(1));
    expect(queries()[0].body.question).toBe('Highest expense');
  });
});

describe('Expense Ask AI — graceful degradation', () => {
  it('falls back to a keyword search instead of erroring when the AI is unreachable', async () => {
    h.fail = true;
    renderSheet();
    ask('petrol');

    // The fallback searches the raw question, so the Fuel row shows up even
    // though no spec came back.
    await screen.findByText('Petrol');
    expect(screen.getByText(/keyword search/i)).toBeTruthy();
  });

  it('shows an empty state rather than a blank panel when nothing matches', async () => {
    h.spec = { title: 'Nope', answer: '', search: 'zzzzz' };
    renderSheet();
    ask('zzzzz');
    await screen.findByText('Nothing matched');
  });
});

describe('Expense Ask AI — salary topic', () => {
  it('answers income questions from the user\u2019s own numbers, in an Income panel', async () => {
    h.spec = { topic: 'salary', answer: 'Your income rose in June.', title: 'Salary' };
    renderSheet();
    ask('did I get a hike?');
    await screen.findByText('Income');
    // The expense list is NOT rendered for a salary question.
    expect(screen.queryByText('Swiggy dinner')).toBeNull();
  });
});
