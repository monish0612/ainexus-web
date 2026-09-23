import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, renderHook, fireEvent } from '@testing-library/react';
import { AiWait, useAiWaitStatus } from './AiWait';

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

describe('AiWait — research and think are status text only', () => {
  it('does not mount a canvas while researching', () => {
    const { container } = render(<AiWait variant="research" active />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Searching');
  });

  it('does not mount a canvas while thinking', () => {
    const { container } = render(<AiWait variant="think" active status="Thinking" />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Thinking');
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
