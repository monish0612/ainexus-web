import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AiComposer, imageChipMeta } from './AiComposer';

/**
 * The composer owns three things the feature screens can no longer get wrong:
 * the field grows, Enter/Shift+Enter behave, and every control is a real
 * 44px target with a real accessible name.
 */

/** jsdom has no layout, so `scrollHeight` has to be faked to test auto-grow. */
function stubScrollHeight(px: number) {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => px,
  });
}

function restoreScrollHeight() {
  // Back to jsdom's own always-0 implementation.
  delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight;
}

function field() {
  return screen.getByPlaceholderText('Ask me') as HTMLTextAreaElement;
}

function Harness({
  onSubmit = vi.fn(),
  value = '',
  maxHeight,
  image,
  onRemoveImage,
  busy,
}: {
  onSubmit?: () => void;
  value?: string;
  maxHeight?: number;
  image?: { preview: string; width?: number; height?: number; sizeKb?: number; mediaType?: string } | null;
  onRemoveImage?: () => void;
  busy?: boolean;
}) {
  return (
    <AiComposer
      value={value}
      onValueChange={() => {}}
      onSubmit={onSubmit}
      placeholder="Ask me"
      submitLabel="Send"
      maxHeight={maxHeight}
      image={image}
      onRemoveImage={onRemoveImage}
      busy={busy}
    />
  );
}

afterEach(() => {
  cleanup();
  restoreScrollHeight();
});

describe('AiComposer — auto-grow', () => {
  it('grows the field to its content height and then caps and scrolls', () => {
    stubScrollHeight(72);
    const { rerender } = render(<Harness maxHeight={168} />);
    expect(field().style.height).toBe('72px');
    expect(field().style.overflowY).toBe('hidden');

    // Same field, much taller content: it stops at the cap instead of eating
    // the page, and hands scrolling back to the textarea.
    stubScrollHeight(400);
    rerender(<Harness maxHeight={168} value="a lot of typing" />);
    expect(field().style.height).toBe('168px');
    expect(field().style.overflowY).toBe('auto');
  });

  it('re-measures on every keystroke', () => {
    stubScrollHeight(48);
    render(<Harness maxHeight={168} />);
    expect(field().style.height).toBe('48px');

    stubScrollHeight(96);
    fireEvent.change(field(), { target: { value: 'line one\nline two\nline three' } });
    expect(field().style.height).toBe('96px');
  });

  it('never collapses the field when the height cannot be measured', () => {
    // scrollHeight is 0 in jsdom, in a detached node, and under display:none.
    // Writing "0px" there would make the composer disappear.
    render(<Harness maxHeight={168} />);
    expect(field().style.height).not.toBe('0px');
  });
});

describe('AiComposer — Enter vs Shift+Enter', () => {
  it('submits on Enter', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} value="hello" />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('inserts a newline on Shift+Enter instead of submitting', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} value="hello" />);
    const prevented = !fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    // Default not prevented → the browser puts the newline in for us.
    expect(prevented).toBe(false);
  });

  it('ignores other keys', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} value="hello" />);
    fireEvent.keyDown(field(), { key: 'a' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit on Enter while the send button is disabled', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    expect((screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit on Enter while a request is already in flight', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} value="hello" busy />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('AiComposer — submit control', () => {
  it('exposes submitLabel as the EXACT accessible name (anchored selectors depend on it)', () => {
    render(<Harness value="hi" />);
    // `/^send$/i` is how three suites find this button.
    expect(screen.getByRole('button', { name: /^send$/i })).toBeTruthy();
  });

  it('is disabled with no text and enabled once there is text', () => {
    const { rerender } = render(<Harness />);
    const btn = () => screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    rerender(<Harness value="something" />);
    expect(btn().disabled).toBe(false);
  });

  it('does not fire onSubmit when clicked while disabled', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('AiComposer — image chip', () => {
  const img = { preview: 'blob:x', width: 1024, height: 768, sizeKb: 214, mediaType: 'image/jpeg' };

  it('renders a thumbnail chip with a 44px remove control, not a bare img', () => {
    const onRemoveImage = vi.fn();
    render(<Harness image={img} onRemoveImage={onRemoveImage} />);

    const remove = screen.getByRole('button', { name: /remove image/i });
    // 44px minimum target: h-11/w-11 is 2.75rem.
    expect(remove.className).toContain('h-11');
    expect(remove.className).toContain('w-11');

    fireEvent.click(remove);
    expect(onRemoveImage).toHaveBeenCalledTimes(1);
  });

  it('shows the dimensions · size · format meta line', () => {
    render(<Harness image={img} onRemoveImage={vi.fn()} />);
    expect(screen.getByText('1024×768 · 214 KB · JPEG')).toBeTruthy();
  });

  it('omits the chip entirely when no image is attached', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /remove image/i })).toBeNull();
  });
});

describe('imageChipMeta', () => {
  it('drops the parts it does not know', () => {
    expect(imageChipMeta({ preview: 'x' })).toBe('');
    expect(imageChipMeta({ preview: 'x', sizeKb: 12.4 })).toBe('12 KB');
    expect(imageChipMeta({ preview: 'x', mediaType: 'image/png' })).toBe('PNG');
    expect(imageChipMeta({ preview: 'x', width: 8, height: 6 })).toBe('8×6');
  });

  it('never rounds a real payload down to 0 KB', () => {
    expect(imageChipMeta({ preview: 'x', sizeKb: 0.2 })).toBe('1 KB');
  });
});
