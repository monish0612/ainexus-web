import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, renderHook, fireEvent } from '@testing-library/react';
import { AiWait, useAiWaitStatus } from './AiWait';

// The 2d context comes from `vitest.setup.ts`, which hands out a no-op mock so
// the draw loop really runs. Nulling it here would put the canvas path back
// behind a bail-out.

/** Records every 2d call so a canvas-only visual can still be asserted on. */
function recordingContext(ops: string[]) {
  const noop = (name: string) => (...args: unknown[]) => void ops.push(`${name}:${args.length}`);
  return {
    canvas: null,
    setTransform: noop('setTransform'),
    clearRect: noop('clearRect'),
    beginPath: noop('beginPath'),
    closePath: noop('closePath'),
    moveTo: noop('moveTo'),
    lineTo: noop('lineTo'),
    arc: noop('arc'),
    fill: noop('fill'),
    stroke: noop('stroke'),
    save: noop('save'),
    restore: noop('restore'),
    clip: noop('clip'),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAiWaitStatus — advances once, then holds', () => {
  it('walks Searching → Reading sources → Writing and never wraps back', () => {
    vi.useFakeTimers();
    const steps = ['Searching', 'Reading sources', 'Writing'] as const;
    const { result } = renderHook(() => useAiWaitStatus(steps));

    expect(result.current.label).toBe('Searching');

    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current.label).toBe('Reading sources');

    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current.label).toBe('Writing');
    expect(result.current.isLast).toBe(true);

    // The sequence must hold on the last state. Looping back to "Searching"
    // after "Writing" reads as a stall, not as progress.
    act(() => void vi.advanceTimersByTime(20000));
    expect(result.current.label).toBe('Writing');
  });

  it('does not advance while inactive', () => {
    vi.useFakeTimers();
    const steps = ['Searching', 'Reading sources'] as const;
    const { result } = renderHook(() => useAiWaitStatus(steps, { active: false }));
    act(() => void vi.advanceTimersByTime(10000));
    expect(result.current.label).toBe('Searching');
  });
});

describe('AiWait — every variant announces its wait state as real text', () => {
  it('research exposes the first status step in a live region', () => {
    render(<AiWait variant="research" />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toContain('Searching');
  });

  it('think announces its own copy and accepts an override', () => {
    render(<AiWait variant="think" mode="deep" status="Reasoning deeply" />);
    expect(screen.getByRole('status').textContent).toContain('Reasoning deeply');
  });

  it('vision announces while the thumbnail ring runs', () => {
    render(<AiWait variant="vision" src="/x.png" alt="receipt" progress={0.4} />);
    expect(screen.getByRole('status').textContent).toContain('Analysing image');
    expect(screen.getByAltText('receipt')).toBeTruthy();
  });

  it('list announces even though the skeletons are aria-hidden', () => {
    render(<AiWait variant="list" rows={3} shape="row" />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
  });

  it('sync announces the percentage', () => {
    render(<AiWait variant="sync" progress={0.42} status="Uploading" />);
    const text = screen.getAllByRole('status').map((n) => n.textContent).join(' ');
    expect(text).toContain('Uploading 42%');
  });

  it('result announces success copy', () => {
    render(<AiWait variant="result" state="success" status="Saved" />);
    expect(screen.getByRole('status').textContent).toContain('Saved');
  });
});

describe('AiWait — the rAF loop sleeps when the field is at rest', () => {
  it('drives frames while researching and schedules none once parked', () => {
    const ops: string[] = [];
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 0;

    const realRaf = window.requestAnimationFrame;
    const realCancel = window.cancelAnimationFrame;
    const realRect = Element.prototype.getBoundingClientRect;
    const realGetContext = HTMLCanvasElement.prototype.getContext;

    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      nextId += 1;
      pending.set(nextId, cb);
      return nextId;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => void pending.delete(id)) as typeof window.cancelAnimationFrame;
    Element.prototype.getBoundingClientRect = (() =>
      ({ width: 320, height: 96, top: 0, left: 0, right: 320, bottom: 96, x: 0, y: 0 })) as unknown as typeof Element.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getContext = (() =>
      recordingContext(ops)) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const pump = () => {
      const frames = [...pending.entries()];
      pending.clear();
      act(() => {
        for (const [, cb] of frames) cb(performance.now());
      });
    };

    try {
      const view = render(<AiWait variant="research" active />);
      for (let i = 0; i < 5; i += 1) pump();

      // The field is alive: it painted, and it has the next frame queued.
      expect(ops.length).toBeGreaterThan(0);
      expect(pending.size).toBe(1);

      // Parking the surface must cost zero frames, not a throttled loop.
      view.rerender(<AiWait variant="research" active={false} />);
      expect(pending.size).toBe(0);
      pump();
      expect(pending.size).toBe(0);
    } finally {
      window.requestAnimationFrame = realRaf;
      window.cancelAnimationFrame = realCancel;
      Element.prototype.getBoundingClientRect = realRect;
      HTMLCanvasElement.prototype.getContext = realGetContext;
    }
  });
});

describe('AiWait — error is transient', () => {
  it('reverts after 3000ms', () => {
    vi.useFakeTimers();
    const onRevert = vi.fn();
    render(<AiWait variant="result" state="error" onRevert={onRevert} />);
    expect(onRevert).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(3000));
    expect(onRevert).toHaveBeenCalled();
  });

  it('reverts as soon as the user starts typing again', () => {
    const onRevert = vi.fn();
    render(<AiWait variant="result" state="error" onRevert={onRevert} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onRevert).toHaveBeenCalled();
  });
});
