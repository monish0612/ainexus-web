import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The main composer and the follow-up composer own SEPARATE provider/mode
 * state.
 *
 * They used to share one `mode`. The follow-up picker is deliberately
 * two-state (Lite/Deep — Thinking stays out of follow-ups), so the moment an
 * answer rendered, its coercion effect fired and dragged the shared value from
 * `thinking` down to `deep`. The main composer silently lost the user's
 * Thinking selection and the NEXT search ran Deep without anyone touching it.
 *
 * These tests assert the two halves of that: Thinking survives an answer
 * rendering AND reaches the next request, and a follow-up can still move
 * provider/mode on its own without dragging the main composer with it.
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
  apiErrorMessage: (_e: unknown, f: string) => f,
  api: {
    post: (url: string, body: Record<string, unknown>) => {
      h.calls.push({ url, body: body || {} });
      return Promise.resolve({
        data: { answer: 'Answer text', model: 'm', sources: [], searchQueries: [] },
      });
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

vi.mock('@/features/expense/receipt', () => ({
  imageFileToPayload: vi.fn(() => Promise.resolve({ base64: '', mediaType: 'image/png' })),
}));

import { InsightAITab } from './InsightAITab';

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InsightAITab />
    </QueryClientProvider>,
  );
}

const searches = () => h.calls.filter((c) => c.url === '/ai/grounded-search');
const followups = () => h.calls.filter((c) => c.url === '/ai/article-followup');

function mainComposer() {
  return screen.getByTestId('insight-composer');
}
function followComposer() {
  return screen.getByTestId('insight-followup-composer');
}

/** The radio with this name inside a specific composer. */
function radioIn(root: HTMLElement, name: RegExp): HTMLElement {
  const match = screen.getAllByRole('radio', { name }).find((el) => root.contains(el));
  if (!match) throw new Error(`no radio ${name} inside ${root.dataset.testid}`);
  return match;
}

async function search(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/get a researched answer/i), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
  await screen.findByText('Answer text');
}

beforeEach(() => {
  h.calls.length = 0;
});
afterEach(() => cleanup());

describe('InsightAI — Thinking survives an answer rendering', () => {
  it('leaves the main composer on Thinking once the follow-up composer mounts', async () => {
    renderTab();
    fireEvent.click(radioIn(mainComposer(), /xGrok/i));
    fireEvent.click(radioIn(mainComposer(), /^thinking$/i));
    await search('who won?');

    // The follow-up composer is on screen now, which is what used to trigger
    // the downgrade.
    expect(followComposer()).toBeTruthy();
    expect(radioIn(mainComposer(), /^thinking$/i).getAttribute('aria-checked')).toBe('true');
    expect(radioIn(mainComposer(), /^deep$/i).getAttribute('aria-checked')).toBe('false');
  });

  it('still sends xgrokThinkingModel on the NEXT search, with nothing else', async () => {
    renderTab();
    fireEvent.click(radioIn(mainComposer(), /xGrok/i));
    fireEvent.click(radioIn(mainComposer(), /^thinking$/i));
    await search('who won?');

    // Second search, without touching a single control in between.
    fireEvent.change(screen.getByPlaceholderText(/get a researched answer/i), {
      target: { value: 'and the runner up?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await waitFor(() => expect(searches()).toHaveLength(2));

    const b = searches()[1].body;
    expect(b).toMatchObject({
      provider: 'xgrok',
      mode: 'thinking',
      xgrokThinkingModel: h.settings.xgrokThinkingModel,
    });
    // Exclusivity: exactly one model-id field on the wire.
    expect(b.xgrokLiteModel).toBeUndefined();
    expect(b.xgrokDeepModel).toBeUndefined();
    expect(b.liteModel).toBeUndefined();
    expect(b.deepModel).toBeUndefined();
  });

  it('never offers Thinking in the follow-up composer', async () => {
    renderTab();
    fireEvent.click(radioIn(mainComposer(), /xGrok/i));
    fireEvent.click(radioIn(mainComposer(), /^thinking$/i));
    await search('who won?');

    const thinking = screen.getAllByRole('radio', { name: /^thinking$/i });
    expect(thinking).toHaveLength(1);
    expect(followComposer().contains(thinking[0])).toBe(false);
  });
});

describe('InsightAI — the follow-up picker moves independently', () => {
  it('switching the follow-up to xGrok + Deep leaves the main composer alone', async () => {
    renderTab();
    await search('topic'); // Gemini + Lite defaults

    fireEvent.click(radioIn(followComposer(), /xGrok/i));
    fireEvent.click(radioIn(followComposer(), /^deep$/i));

    // Main composer untouched.
    expect(radioIn(mainComposer(), /Gemini/i).getAttribute('aria-checked')).toBe('true');
    expect(radioIn(mainComposer(), /^lite$/i).getAttribute('aria-checked')).toBe('true');

    fireEvent.change(screen.getByPlaceholderText(/ask a follow-up/i), {
      target: { value: 'go deeper' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(followups()).toHaveLength(1));

    expect(followups()[0].body).toMatchObject({
      provider: 'xgrok',
      mode: 'deep',
      xgrokDeepModel: h.settings.xgrokDeepModel,
    });
    expect(followups()[0].body.deepModel).toBeUndefined();
    expect(followups()[0].body.liteModel).toBeUndefined();
  });

  it('does not inherit the main composer selection — a Thinking search is followed up on Lite', async () => {
    renderTab();
    fireEvent.click(radioIn(mainComposer(), /xGrok/i));
    fireEvent.click(radioIn(mainComposer(), /^thinking$/i));
    await search('topic');

    fireEvent.change(screen.getByPlaceholderText(/ask a follow-up/i), {
      target: { value: 'and then?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(followups()).toHaveLength(1));

    // The follow-up runs on its OWN defaults (defaultFollowUpProvider + lite),
    // and Gemini never ships a thinking model id.
    expect(followups()[0].body).toMatchObject({
      provider: 'gemini',
      mode: 'lite',
      liteModel: h.settings.liteModel,
    });
    expect(followups()[0].body.xgrokThinkingModel).toBeUndefined();

    // …and the search that produced the answer still went out as Thinking.
    expect(searches()[0].body).toMatchObject({ provider: 'xgrok', mode: 'thinking' });
  });

  it('each follow-up carries its own model, with no carry-over from the previous one', async () => {
    renderTab();
    await search('topic');

    fireEvent.click(radioIn(followComposer(), /xGrok/i));
    fireEvent.change(screen.getByPlaceholderText(/ask a follow-up/i), {
      target: { value: 'q1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(followups()).toHaveLength(1));

    fireEvent.click(radioIn(followComposer(), /Gemini/i));
    fireEvent.click(radioIn(followComposer(), /^deep$/i));
    fireEvent.change(screen.getByPlaceholderText(/ask a follow-up/i), {
      target: { value: 'q2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(followups()).toHaveLength(2));

    expect(followups()[0].body).toMatchObject({
      provider: 'xgrok',
      mode: 'lite',
      xgrokLiteModel: h.settings.xgrokLiteModel,
    });
    expect(followups()[1].body).toMatchObject({
      provider: 'gemini',
      mode: 'deep',
      deepModel: h.settings.deepModel,
    });
    expect(followups()[1].body.xgrokLiteModel).toBeUndefined();
    expect(followups()[1].body.xgrokDeepModel).toBeUndefined();
  });
});
