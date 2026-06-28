import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Real-UI flow test for Insight AI: run a search with a chosen model, then do
 * multiple follow-ups each with a DIFFERENT provider/depth, and assert every
 * backend request carries exactly the model the user picked.
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

// Avoid importing the heavy pdfjs-backed receipt module in jsdom.
vi.mock('@/features/expense/receipt', () => ({
  imageFileToPayload: vi.fn(() => Promise.resolve({ base64: '', mediaType: 'image/png' })),
}));

import { InsightAITab } from './InsightAITab';

function followups() {
  return h.calls.filter((c) => c.url === '/ai/article-followup');
}
function searches() {
  return h.calls.filter((c) => c.url === '/ai/grounded-search');
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InsightAITab />
    </QueryClientProvider>,
  );
}

function clickLast(name: RegExp) {
  const els = screen.getAllByRole('button', { name });
  fireEvent.click(els[els.length - 1]);
}

beforeEach(() => {
  h.calls.length = 0;
});
afterEach(() => cleanup());

describe('Insight AI — search + multi-model follow-ups', () => {
  it('runs the initial search with the picked model (xGrok + Deep)', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /xGrok/i }));
    fireEvent.click(screen.getByRole('button', { name: /^deep$/i }));

    fireEvent.change(screen.getByPlaceholderText(/get a researched answer/i), {
      target: { value: 'who won?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => expect(searches().length).toBe(1));
    expect(searches()[0].body).toMatchObject({
      provider: 'xgrok',
      mode: 'deep',
      xgrokDeepModel: h.settings.xgrokDeepModel,
    });
    expect(searches()[0].body.deepModel).toBeUndefined();
  });

  it('follow-ups can each switch model independently on top of the result', async () => {
    renderTab();
    // Initial search: Gemini + Lite (defaults).
    fireEvent.change(screen.getByPlaceholderText(/get a researched answer/i), {
      target: { value: 'topic' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('Answer text');
    expect(searches()[0].body).toMatchObject({ provider: 'gemini', mode: 'lite' });

    // Follow-up #1: switch to xGrok + Lite via the follow-up picker.
    clickLast(/xGrok/i);
    clickLast(/^lite$/i);
    fireEvent.change(screen.getByPlaceholderText(/ask a follow-up/i), {
      target: { value: 'verify with grok' },
    });
    clickLast(/^send$/i);
    await waitFor(() => expect(followups().length).toBe(1));
    expect(followups()[0].body).toMatchObject({
      provider: 'xgrok',
      mode: 'lite',
      xgrokLiteModel: h.settings.xgrokLiteModel,
    });
    expect(followups()[0].body.deepModel).toBeUndefined();

    // Follow-up #2: switch to Gemini + Deep.
    clickLast(/Gemini/i);
    clickLast(/^deep$/i);
    fireEvent.change(screen.getByPlaceholderText(/ask a follow-up/i), {
      target: { value: 'now go deep' },
    });
    clickLast(/^send$/i);
    await waitFor(() => expect(followups().length).toBe(2));
    expect(followups()[1].body).toMatchObject({
      provider: 'gemini',
      mode: 'deep',
      deepModel: h.settings.deepModel,
    });
    expect(followups()[1].body.xgrokDeepModel).toBeUndefined();
    expect(followups()[1].body.liteModel).toBeUndefined();
  });
});
