import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The drawer is a modal dialog, so it owes the keyboard the same contract the
 * Modal does: Escape closes it, and focus goes back to whatever opened it.
 *
 * It gained `role="dialog"`, `aria-modal` and a Tab trap without gaining an
 * Escape handler — a trap with no keyboard exit, which is how a QA pass ended
 * up navigating by URL to get out of it.
 */

vi.mock('@/lib/api/settings', () => ({
  fetchModels: vi.fn(() => Promise.resolve({ models: [] })),
  fetchPreferences: vi.fn(() => Promise.resolve({})),
  pushPreferencesBatch: vi.fn(() => Promise.resolve()),
  pushAppSetting: vi.fn(() => Promise.resolve()),
}));

import { SettingsDrawer } from './SettingsDrawer';

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <button type="button">Open settings</button>
      <SettingsDrawer open={open} onClose={onClose} />
    </QueryClientProvider>
  );
}

afterEach(() => cleanup());

describe('SettingsDrawer — keyboard dismissal', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still closes on Escape while focus is inside the trap', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const close = screen.getByRole('button', { name: /close settings/i });
    close.focus();

    // The Tab trap returns early for every non-Tab key; this is the assertion
    // that says so out loud.
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores Escape once it is closed', () => {
    const onClose = vi.fn();
    render(<Harness open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hands focus back to the trigger when it closes', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: /open settings/i });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    rerender(<Harness open onClose={onClose} />);
    await waitFor(() => expect(document.activeElement).not.toBe(trigger));

    rerender(<Harness open={false} onClose={onClose} />);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('leaves no overlay intercepting clicks once the drawer has closed', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);
    rerender(<Harness open={false} onClose={onClose} />);

    // AnimatePresence keeps the panel mounted for the slide-out; it must be
    // gone (and not swallowing clicks) by the time the exit finishes.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('still closes after a Segmented inside it has changed value', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);

    // A Segmented's active indicator is a `layoutId` element, so picking the
    // other option unmounts one and mounts another. That used to strand a
    // presence registration nothing could ever complete, and the drawer then
    // animated out but never left the DOM.
    fireEvent.click(screen.getByRole('radio', { name: /white/i }));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /white/i }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );

    rerender(<Harness open={false} onClose={onClose} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
