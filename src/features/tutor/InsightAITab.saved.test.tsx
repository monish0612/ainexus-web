import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * End-to-end regression for the saved-search ⇄ follow-up sync bug:
 *   1. A follow-up asked BEFORE saving must be flushed to the server on Save.
 *   2. A web save must persist the ANDROID-compatible `grounded` shape (so the
 *      phone renders the answer, not just the query).
 *   3. Reopening a saved search whose `responseJson` is a server OBJECT must
 *      NOT error ("Could not open saved search") and must reload its chat.
 */

interface Posted {
  url: string;
  body: Record<string, unknown>;
}

const h = vi.hoisted(() => ({
  posts: [] as Posted[],
  // Server-side stores, keyed like the real backend.
  searches: [] as Record<string, unknown>[],
  chats: {} as Record<string, Record<string, unknown>[]>,
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
    post: (url: string, body: Record<string, unknown> = {}) => {
      h.posts.push({ url, body });
      if (url === '/saved-searches') {
        h.searches.push({ ...body, responseJson: JSON.parse(String(body.responseJson)) });
        return Promise.resolve({ data: { ok: true, id: body.id } });
      }
      const chatMatch = url.match(/^\/saved-searches\/(.+)\/chat$/);
      if (chatMatch) {
        const id = chatMatch[1];
        (h.chats[id] ??= []).push(body);
        return Promise.resolve({ data: { ok: true } });
      }
      if (url === '/ai/grounded-search') {
        return Promise.resolve({
          data: { answer: 'Chennai is sunny.', model: 'gemini-lite', sources: [], searchQueries: [] },
        });
      }
      if (url === '/ai/article-followup') {
        return Promise.resolve({
          data: { answer: 'Tomorrow: rain.', model: 'gemini-lite', sources: [], searchQueries: [] },
        });
      }
      return Promise.resolve({ data: {} });
    },
    get: (url: string) => {
      if (url === '/saved-searches') {
        // CRITICAL: return responseJson as an OBJECT, exactly like the backend.
        return Promise.resolve({ data: h.searches });
      }
      const chatMatch = url.match(/^\/saved-searches\/(.+)\/chat$/);
      if (chatMatch) return Promise.resolve({ data: h.chats[chatMatch[1]] ?? [] });
      return Promise.resolve({ data: [] });
    },
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

function clickLast(name: RegExp) {
  const els = screen.getAllByRole('button', { name });
  fireEvent.click(els[els.length - 1]);
}

beforeEach(() => {
  h.posts.length = 0;
  h.searches.length = 0;
  for (const k of Object.keys(h.chats)) delete h.chats[k];
});
afterEach(() => cleanup());

describe('InsightAI — saved search + follow-up persistence', () => {
  it('flushes a pre-save follow-up on Save and persists the Android-compatible grounded shape', async () => {
    renderTab();

    // 1. Search.
    fireEvent.change(screen.getByPlaceholderText(/get a researched answer/i), {
      target: { value: 'current weather in chennai' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('Chennai is sunny.');

    // 2. Follow-up BEFORE saving (lives only in memory until Save).
    fireEvent.change(screen.getByPlaceholderText(/ask a follow-up/i), {
      target: { value: 'what about tomorrow?' },
    });
    clickLast(/^send$/i);
    await screen.findByText('Tomorrow: rain.');
    // Nothing persisted yet (no parent row, no chat).
    expect(h.searches).toHaveLength(0);

    // 3. Save.
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // Parent persisted in the grounded shape with the answer embedded.
    await waitFor(() => expect(h.searches).toHaveLength(1));
    const saved = h.searches[0];
    expect(saved.responseType).toBe('grounded');
    expect((saved.responseJson as { answer: string }).answer).toBe('Chennai is sunny.');

    // The pre-save follow-up turns were flushed to the server.
    const id = String(saved.id);
    await waitFor(() => expect(h.chats[id]?.length).toBe(2));
    expect(h.chats[id].map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(h.chats[id][0].text).toBe('what about tomorrow?');
    expect(h.chats[id][1].text).toBe('Tomorrow: rain.');
  });

  it('reopens a saved search with an OBJECT responseJson and reloads its chat', async () => {
    // Seed a server-side saved search (object responseJson) + a persisted chat.
    h.searches.push({
      id: 'srch-1',
      kind: 'query',
      query: 'current weather in chennai',
      title: 'current weather in chennai',
      responseType: 'grounded',
      responseJson: { answer: 'Chennai is sunny.', model: 'gemini-lite', sources: [], searchQueries: [] },
      model: 'gemini-lite',
      provider: 'gemini',
      mode: 'lite',
      pinned: true,
      savedAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
    });
    h.chats['srch-1'] = [
      { id: 'm1', role: 'user', text: 'what about tomorrow?', model: '', sources_json: '[]', created_at: '2026-06-28T00:01:00Z' },
      { id: 'm2', role: 'assistant', text: 'Tomorrow: rain.', model: 'gemini-lite', sources_json: '[]', created_at: '2026-06-28T00:01:30Z' },
    ];

    renderTab();

    // The saved row shows in the list; click it to open.
    const row = await screen.findByText('current weather in chennai');
    fireEvent.click(row);

    // No error toast; the original answer renders…
    await screen.findByText('Chennai is sunny.');
    // …and the persisted follow-up chat is reloaded.
    await screen.findByText('what about tomorrow?');
    await screen.findByText('Tomorrow: rain.');
  });

  it('continues a reopened (cross-device) saved search — new follow-up persists to the SAME id', async () => {
    h.searches.push({
      id: 'srch-cont',
      kind: 'query',
      query: 'current weather in chennai',
      title: 'current weather in chennai',
      responseType: 'grounded',
      responseJson: { answer: 'Chennai is sunny.', model: 'gemini-lite', sources: [], searchQueries: [] },
      model: 'gemini-lite',
      provider: 'gemini',
      mode: 'lite',
      pinned: true,
      savedAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
    });
    h.chats['srch-cont'] = [
      { id: 'm1', role: 'user', text: 'asked on phone', model: '', sources_json: '[]', created_at: '2026-06-28T00:01:00Z' },
      { id: 'm2', role: 'assistant', text: 'phone answer', model: 'gemini-lite', sources_json: '[]', created_at: '2026-06-28T00:01:30Z' },
    ];

    renderTab();
    fireEvent.click(await screen.findByText('current weather in chennai'));
    await screen.findByText('asked on phone'); // existing chat loaded

    // Ask a NEW follow-up on the reopened search.
    fireEvent.change(screen.getByPlaceholderText(/ask a follow-up/i), {
      target: { value: 'and the weekend?' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /^send$/i }).slice(-1)[0]);

    // Both new turns persist to the SAME server id (2 seeded + 2 new = 4).
    await waitFor(() => expect(h.chats['srch-cont'].length).toBe(4));
    const newUser = h.chats['srch-cont'].find((m) => m.text === 'and the weekend?');
    expect(newUser).toBeTruthy();
    expect(h.chats['srch-cont'].some((m) => m.text === 'Tomorrow: rain.')).toBe(true);
  });

  it('opens an Android-shaped summarizer payload (summary → answer) without erroring', async () => {
    h.searches.push({
      id: 'srch-sum',
      kind: 'url',
      query: 'https://example.com/post',
      title: 'example.com/post',
      responseType: 'summarizer',
      // Android summarizer payload uses `summary`, not `answer`.
      responseJson: { summary: 'The post explains X in three points.', model: 'gemini-lite' },
      model: 'gemini-lite',
      provider: 'gemini',
      mode: 'lite',
      pinned: true,
      savedAt: '2026-06-28T00:00:00Z',
      updatedAt: '2026-06-28T00:00:00Z',
    });

    renderTab();
    fireEvent.click(await screen.findByText('example.com/post'));
    // The summarizer body renders as the answer (no "Could not open" toast).
    await screen.findByText('The post explains X in three points.');
  });
});
