import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// framer-motion's AnimatePresence keeps exiting children mounted until an
// animation frame completes, which never happens deterministically in jsdom —
// so closing the lightbox would appear to "not close". Replace it with a
// pass-through (children render when present, vanish when the parent stops
// rendering them) and strip motion-only props so this test asserts the real
// open/close state logic, not animation timing.
vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover',
    'whileFocus', 'whileDrag', 'whileInView', 'layout', 'layoutId', 'drag',
    'variants', 'custom', 'onAnimationComplete',
  ]);
  const clean = (props: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(props)) if (!MOTION_PROPS.has(k)) out[k] = props[k];
    return out;
  };
  const motion = new Proxy(
    {},
    {
      get: (_t, tag: string) =>
        ({ children, ...props }: { children?: unknown } & Record<string, unknown>) =>
          createElement(tag, clean(props), children as never),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: unknown }) => children as never,
  };
});

import { Markdown } from './Markdown';

afterEach(cleanup);

describe('Markdown — inline image → lightbox', () => {
  const md = '![A dense chart](https://cdn.example.com/chart.png)';

  it('renders inline images as a zoomable button', () => {
    render(<Markdown>{md}</Markdown>);
    const img = screen.getByAltText('A dense chart');
    expect(img).toBeTruthy();
    expect(img.getAttribute('role')).toBe('button');
    // Lightbox is closed until interaction.
    expect(screen.queryByLabelText('Close')).toBeNull();
  });

  it('opens the lightbox when the image is clicked', () => {
    render(<Markdown>{md}</Markdown>);
    fireEvent.click(screen.getByAltText('A dense chart'));

    // The lightbox (portal) is now open with its controls.
    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.getByLabelText('Reset zoom')).toBeTruthy();
  });

  it('opens the lightbox via keyboard (Enter) for accessibility', () => {
    render(<Markdown>{md}</Markdown>);
    fireEvent.keyDown(screen.getByAltText('A dense chart'), { key: 'Enter' });
    expect(screen.getByLabelText('Close')).toBeTruthy();
  });

  it('closes the lightbox when Close is pressed', () => {
    render(<Markdown>{md}</Markdown>);
    fireEvent.click(screen.getByAltText('A dense chart'));
    expect(screen.getByLabelText('Close')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByLabelText('Close')).toBeNull();
  });
});
