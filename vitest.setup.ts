import { vi } from 'vitest';

// jsdom doesn't implement scrollIntoView, but several components call it on
// mount/update (e.g. the article follow-up chat auto-scrolls). Stub it so
// component tests don't crash on the missing API.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// jsdom has no matchMedia. framer-motion's reduced-motion support and our own
// usePrefersReducedMotion both read it on mount, so without this every
// component test throws. Default to "no preference" (matches: false) — the
// reduced-motion paths are opt-in per test.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated, still used by some libraries
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom ships no 2d canvas backend — `getContext('2d')` logs a multi-line
// "Not implemented" every time it is called, and AiWait renders inside several
// feature screens.
//
// Returning null here would silence that noise, but it would also skip the
// whole canvas path: AiWait bails out when there is no context, so its draw
// loop (and the flow-field advection inside it) would never run in ANY test.
// Instead we hand back a no-op 2d context that covers every call AiWait makes,
// so the real loop executes and a throw in it fails a test instead of being
// swallowed. Tests that need to observe the calls (AiWait.test) still install
// their own recording context on top of this.
const CANVAS_2D_METHODS = [
  'arc',
  'arcTo',
  'beginPath',
  'bezierCurveTo',
  'clearRect',
  'clip',
  'closePath',
  'drawImage',
  'ellipse',
  'fill',
  'fillRect',
  'fillText',
  'lineTo',
  'moveTo',
  'putImageData',
  'quadraticCurveTo',
  'rect',
  'resetTransform',
  'restore',
  'rotate',
  'save',
  'scale',
  'setLineDash',
  'setTransform',
  'stroke',
  'strokeRect',
  'strokeText',
  'transform',
  'translate',
] as const;

function mockGradient() {
  return { addColorStop: vi.fn() };
}

function mockContext2d(canvas: HTMLCanvasElement) {
  const ctx: Record<string, unknown> = {
    canvas,
    // Written by the draw loops; plain data properties so assignments stick.
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    lineDashOffset: 0,
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: 'none',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    createLinearGradient: vi.fn(mockGradient),
    createRadialGradient: vi.fn(mockGradient),
    createConicGradient: vi.fn(mockGradient),
    createPattern: vi.fn(() => null),
    getLineDash: vi.fn(() => [] as number[]),
    measureText: vi.fn(() => ({ width: 0 })),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
    isPointInPath: vi.fn(() => false),
  };
  for (const name of CANVAS_2D_METHODS) ctx[name] = vi.fn();
  return ctx as unknown as CanvasRenderingContext2D;
}

const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

HTMLCanvasElement.prototype.getContext = (function (
  this: HTMLCanvasElement,
  kind: string,
) {
  // Only 2d is emulated; a WebGL request still reads as "unsupported".
  if (kind !== '2d') return null;
  const cached = contexts.get(this);
  if (cached) return cached;
  const ctx = mockContext2d(this);
  contexts.set(this, ctx);
  return ctx;
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Neither observer exists in jsdom. Canvas-backed and virtualised surfaces use
// them to size themselves and to park their rAF loop when off-screen.
if (!('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  globalThis.ResizeObserver = window.ResizeObserver;
}

if (!('IntersectionObserver' in window)) {
  class IntersectionObserverStub {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
  globalThis.IntersectionObserver = window.IntersectionObserver;
}
