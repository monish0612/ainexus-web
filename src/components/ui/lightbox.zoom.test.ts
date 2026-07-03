import { describe, it, expect } from 'vitest';
import {
  MIN_SCALE,
  MAX_SCALE,
  clampScale,
  clampTranslate,
  computeZoomToPoint,
  distance,
  midpoint,
  shouldDismiss,
} from './lightbox.zoom';

describe('clampScale', () => {
  it('keeps scale within [MIN, MAX]', () => {
    expect(clampScale(0.1)).toBe(MIN_SCALE);
    expect(clampScale(999)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });
});

describe('computeZoomToPoint — anchoring', () => {
  // Fixed layout centre of the (untransformed) image. The CSS transform is
  // `translate(t) scale(s)` about this centre, so the on-screen position of a
  // point p is:  L + t + s * (p - L).  The transformed centre the component
  // passes to computeZoomToPoint is therefore C = L + t.
  const L = { x: 500, y: 400 };
  const screenPos = (v: { scale: number; tx: number; ty: number }, p: { x: number; y: number }) => ({
    x: L.x + v.tx + v.scale * (p.x - L.x),
    y: L.y + v.ty + v.scale * (p.y - L.y),
  });

  it('produces exactly the clamped requested scale', () => {
    const out = computeZoomToPoint({ scale: 1, tx: 0, ty: 0 }, 2.6, L, L);
    expect(out.scale).toBeCloseTo(2.6, 9);
  });

  it('keeps the zoom target point fixed on screen (no jump)', () => {
    // The anchored point is the LOCAL image point currently under the screen
    // cursor; after zooming, that same local point must land back under the
    // same screen cursor. This is the exact property that prevents any jump.
    const screenCursors = [
      { x: 500, y: 400 }, // dead centre
      { x: 120, y: 90 },
      { x: 880, y: 710 },
    ];
    const startStates = [
      { scale: 1, tx: 0, ty: 0 },
      { scale: 2, tx: 30, ty: -45 },
    ];

    for (const start of startStates) {
      const C = { x: L.x + start.tx, y: L.y + start.ty }; // transformed centre
      for (const S of screenCursors) {
        // Local point currently under the screen cursor S.
        const localUnderCursor = {
          x: L.x + (S.x - C.x) / start.scale,
          y: L.y + (S.y - C.y) / start.scale,
        };
        for (const nextScale of [1.5, 2.6, 6]) {
          const next = computeZoomToPoint(start, nextScale, S, C);
          const after = screenPos(next, localUnderCursor);
          expect(after.x).toBeCloseTo(S.x, 6);
          expect(after.y).toBeCloseTo(S.y, 6);
        }
      }
    }
  });

  it('re-centres when zoomed fully out', () => {
    const out = computeZoomToPoint({ scale: 3, tx: 200, ty: -120 }, 1, { x: 10, y: 10 }, L);
    expect(out).toEqual({ scale: MIN_SCALE, tx: 0, ty: 0 });
  });
});

describe('clampTranslate — never lose the image off-screen', () => {
  it('allows no pan when the image fits (scale 1)', () => {
    // baseW/baseH smaller than viewport → only the slack is allowed.
    const c = clampTranslate(9999, 9999, 1, 400, 300, 1000, 800, 40);
    expect(c.x).toBe(40);
    expect(c.y).toBe(40);
  });

  it('allows panning up to the overflow bound when zoomed', () => {
    // baseW=1000 at scale 2 → 2000 wide; viewport 1000 → overflow 1000, half=500 (+40 slack).
    const c = clampTranslate(9999, -9999, 2, 1000, 800, 1000, 800, 40);
    expect(c.x).toBe(540);
    expect(c.y).toBe(-(Math.max(0, (800 * 2 - 800) / 2) + 40));
  });

  it('passes through values that are within bounds', () => {
    const c = clampTranslate(10, -5, 2, 1000, 800, 1000, 800, 40);
    expect(c).toEqual({ x: 10, y: -5 });
  });
});

describe('shouldDismiss', () => {
  it('dismisses on a long drag', () => {
    expect(shouldDismiss(131, 0)).toBe(true);
    expect(shouldDismiss(129, 0)).toBe(false);
  });
  it('dismisses on a fast fling', () => {
    expect(shouldDismiss(5, 701)).toBe(true);
    expect(shouldDismiss(5, 699)).toBe(false);
  });
});

describe('geometry helpers', () => {
  it('distance is euclidean', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it('midpoint averages both axes', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});
