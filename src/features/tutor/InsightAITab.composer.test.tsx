import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Composer-level guarantees for InsightAI, added alongside the existing
 * model-routing suite rather than inside it.
 *
 * Two of these are guard rails for OTHER tests:
 *  • `InsightAITab.test.tsx` picks the follow-up controls with a "last
 *    matching element" helper, which silently targets the wrong control if
 *    the two composers ever swap places. The DOM-order test below fails loudly
 *    instead.
 *  • The submit/send buttons are matched with anchored regexes, so their
 *    accessible names are asserted here too.
 */

const h = vi.hoisted(() => ({
  calls: [] as { url: string; body: Record<string, unknown> }[],
  /** Held open to observe the loading state; released by `release()`. */
  gate: null as null | (() => void),
  /** Makes the next follow-up request reject, to exercise the recovery path. */
  failFollowUp: false,
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
    post: async (url: string, body: Record<string, unknown>) => {
      h.calls.push({ url, body: body || {} });
      if (url === '/ai/article-followup' && h.failFollowUp) {
        throw new Error('network down');
      }
      if (h.gate) {
        await new Promise<void>((resolve) => {
          h.gate = resolve;
        });
      }
      return { data: { answer: 'Answer text', model: 'm', sources: [], searchQueries: [] } };
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

import { ToastViewport } from '@/components/ui/toast';
import { InsightAITab } from './InsightAITab';

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <InsightAITab />
    </QueryClientProvider>,
  );
}

function searchField() {
  return screen.getByPlaceholderText(/get a researched answer/i) as HTMLTextAreaElement;
}

function hold() {
  h.gate = () => {};
}
async function release() {
  const resolve = h.gate;
  h.gate = null;
  resolve?.();
  await waitFor(() => expect(screen.getByText('Answer text')).toBeTruthy());
}

function stubScrollHeight(px: number) {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => px,
  });
}

beforeEach(() => {
  h.calls.length = 0;
  h.gate = null;
  h.failFollowUp = false;
});
afterEach(() => {
  cleanup();
  delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight;
});

describe('InsightAI composer — keyboard contract', () => {
  it('Enter runs the search', async () => {
    renderTab();
    fireEvent.change(searchField(), { target: { value: 'who won?' } });
    fireEvent.keyDown(searchField(), { key: 'Enter' });
    await waitFor(() => expect(h.calls.filter((c) => c.url === '/ai/grounded-search')).toHaveLength(1));
  });

  it('Shift+Enter does not run the search', async () => {
    renderTab();
    fireEvent.change(searchField(), { target: { value: 'who won?' } });
    fireEvent.keyDown(searchField(), { key: 'Enter', shiftKey: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(h.calls).toHaveLength(0);
  });

  it('Enter sends a follow-up from the follow-up field', async () => {
    renderTab();
    fireEvent.change(searchField(), { target: { value: 'topic' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('Answer text');

    const follow = screen.getByPlaceholderText(/ask a follow-up/i);
    fireEvent.change(follow, { target: { value: 'and then?' } });
    fireEvent.keyDown(follow, { key: 'Enter' });
    await waitFor(() =>
      expect(h.calls.filter((c) => c.url === '/ai/article-followup')).toHaveLength(1),
    );
  });
});

describe('InsightAI composer — auto-grow', () => {
  it('grows the search field with its content', () => {
    stubScrollHeight(104);
    renderTab();
    fireEvent.change(searchField(), { target: { value: 'a\nb\nc' } });
    expect(searchField().style.height).toBe('104px');
  });
});

describe('InsightAI composer — DOM order the model-routing suite depends on', () => {
  it('renders the main composer BEFORE the follow-up composer', async () => {
    renderTab();
    fireEvent.change(searchField(), { target: { value: 'topic' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('Answer text');

    const main = screen.getByTestId('insight-composer');
    const follow = screen.getByTestId('insight-followup-composer');
    // eslint-disable-next-line no-bitwise
    const followIsAfterMain =
      (main.compareDocumentPosition(follow) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(followIsAfterMain).toBe(true);
  });

  it('puts the LAST provider/depth radios inside the follow-up composer', async () => {
    renderTab();
    fireEvent.change(searchField(), { target: { value: 'topic' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('Answer text');

    const follow = screen.getByTestId('insight-followup-composer');
    for (const name of [/xGrok/i, /Gemini/i, /^lite$/i, /^deep$/i]) {
      const radios = screen.getAllByRole('radio', { name });
      expect(follow.contains(radios[radios.length - 1])).toBe(true);
    }
  });

  it('keeps Search and Send as their exact accessible names', async () => {
    renderTab();
    expect(screen.getByRole('button', { name: /^search$/i })).toBeTruthy();
    fireEvent.change(searchField(), { target: { value: 'topic' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('Answer text');
    expect(screen.getAllByRole('button', { name: /^send$/i })).toHaveLength(1);
  });
});

describe('InsightAI composer — AiWait is wired to the existing flags', () => {
  it('Lite shows the research signature while the search is in flight', async () => {
    hold();
    renderTab();
    fireEvent.change(searchField(), { target: { value: 'topic' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Searching'));
    await release();
    // The wait surface is gone once loading flips back.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Deep shows the thinking signature instead', async () => {
    hold();
    renderTab();
    fireEvent.click(screen.getByRole('radio', { name: /^deep$/i }));
    fireEvent.change(searchField(), { target: { value: 'topic' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Thinking'));
    await release();
  });

  it('a follow-up in flight announces its own wait', async () => {
    renderTab();
    fireEvent.change(searchField(), { target: { value: 'topic' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('Answer text');

    hold();
    fireEvent.change(screen.getByPlaceholderText(/ask a follow-up/i), {
      target: { value: 'and then?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Searching'));

    const resolve = h.gate;
    h.gate = null;
    resolve?.();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});

describe('InsightAI composer — a failed follow-up leaves nothing stuck', () => {
  it('drops the optimistic bubble, restores the text, toasts, and clears busy', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <InsightAITab />
        <ToastViewport />
      </QueryClientProvider>,
    );

    fireEvent.change(searchField(), { target: { value: 'topic' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByText('Answer text');

    h.failFollowUp = true;
    const follow = screen.getByPlaceholderText(/ask a follow-up/i) as HTMLTextAreaElement;
    fireEvent.change(follow, { target: { value: 'this one fails' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    // The user gets told, in the only channel an AI failure has.
    await screen.findByText('Follow-up failed');
    // The optimistic user bubble is gone… (scoped to the bubble, because the
    // restored text below also lives in the textarea's own text content)
    expect(screen.queryByText('this one fails', { selector: 'p' })).toBeNull();
    // …the typed text is back in the field, not lost…
    expect(
      (screen.getByPlaceholderText(/ask a follow-up/i) as HTMLTextAreaElement).value,
    ).toBe('this one fails');
    // …and the composer is usable again (the `finally` ran, so no dead spinner).
    expect(
      (screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.queryByText('Searching')).toBeNull();
  });
});
