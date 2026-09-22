import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { Modal } from './Modal';
import { Segmented } from './primitives';

/**
 * A closed modal has to leave the DOM, not just become invisible. It is a
 * `fixed inset-0` overlay, so one left behind covers the whole viewport and
 * keeps `role="dialog" aria-modal="true"` in the accessibility tree.
 *
 * The regression this guards: framer-motion 11's `usePresence` registers with
 * the enclosing `AnimatePresence` but never deregisters, so unmounting any
 * `layout`/`layoutId` element inside an open modal — changing a `Segmented`
 * moves its indicator, which does exactly that — leaves a registration that
 * can never report exit-complete, and `AnimatePresence` waits on it forever.
 *
 * Animations are skipped because framer's timed exits never settle under
 * jsdom, which would make even a healthy modal look stuck. The leak is
 * presence bookkeeping rather than animation timing, so it reproduces
 * identically either way.
 */
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

function Harness({ open }: { open: boolean }) {
  const [mode, setMode] = useState<'manual' | 'scan'>('manual');
  return (
    <Modal open={open} onClose={() => {}} title="Add Expense" variant="sheet">
      <Segmented
        value={mode}
        onChange={setMode}
        aria-label="Entry mode"
        options={[
          { value: 'manual', label: 'Manual' },
          { value: 'scan', label: 'Scan' },
        ]}
      />
    </Modal>
  );
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

/** Every overlay node the modal can leave behind, by either marker. */
const overlays = () =>
  document.querySelectorAll('[role="dialog"], [aria-modal="true"]').length;

const segment = (label: string) => {
  const el = [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!el) throw new Error(`no segment labelled "${label}"`);
  return el;
};

describe('Modal — teardown', () => {
  it('leaves nothing in the DOM when closed untouched', async () => {
    const { rerender } = render(<Harness open />);
    await settle();
    expect(overlays()).toBe(1);

    rerender(<Harness open={false} />);
    await settle();
    expect(overlays()).toBe(0);
  });

  it('leaves nothing in the DOM when closed after a Segmented changed value', async () => {
    const { rerender } = render(<Harness open />);
    await settle();
    fireEvent.click(segment('Scan'));
    await settle();
    expect(segment('Scan').getAttribute('aria-checked')).toBe('true');

    rerender(<Harness open={false} />);
    await settle();
    expect(overlays()).toBe(0);
  });

  it('accumulates no orphan nodes over repeated open/close cycles', async () => {
    const { rerender } = render(<Harness open={false} />);
    for (let cycle = 0; cycle < 5; cycle += 1) {
      rerender(<Harness open />);
      await settle();
      expect(overlays()).toBe(1);

      fireEvent.click(segment(cycle % 2 === 0 ? 'Scan' : 'Manual'));
      await settle();

      rerender(<Harness open={false} />);
      await settle();
      expect(overlays()).toBe(0);
    }
  });
});
