// Pure zoom/pan math for the image Lightbox.
//
// Extracted from the component so the tricky bits — anchored zoom (the tapped
// point stays put, so there is never a jump/scaling glitch) and translate
// clamping (the image can never be lost off-screen) — can be unit-tested
// deterministically, independent of the DOM or any device/viewport size.

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
export const DOUBLE_TAP_SCALE = 2.6;

/** A gesture at 1× dismisses once dragged this far (px) or flung this fast. */
export const DISMISS_DISTANCE = 130;
export const DISMISS_VELOCITY = 700;

export interface Point {
  x: number;
  y: number;
}

export interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const clampScale = (s: number): number => clamp(s, MIN_SCALE, MAX_SCALE);

/**
 * Compute the next {scale, tx, ty} when zooming toward a screen point, keeping
 * that point visually anchored.
 *
 * `center` is the current on-screen centre of the (already transformed) image;
 * `cursor` is the point to zoom toward (double-tap / wheel / pinch midpoint).
 */
export function computeZoomToPoint(
  view: ViewState,
  nextScale: number,
  cursor: Point,
  center: Point,
): ViewState {
  const s = clampScale(nextScale);
  if (s <= MIN_SCALE) {
    // Fully zoomed out always re-centres — no lingering offset.
    return { scale: MIN_SCALE, tx: 0, ty: 0 };
  }
  const dx = cursor.x - center.x;
  const dy = cursor.y - center.y;
  const factor = s / view.scale;
  return {
    scale: s,
    tx: view.tx + dx * (1 - factor),
    ty: view.ty + dy * (1 - factor),
  };
}

/**
 * Clamp a translation so the scaled image can't be dragged completely off the
 * viewport. `baseW/baseH` are the image's on-screen size at scale 1.
 */
export function clampTranslate(
  tx: number,
  ty: number,
  scale: number,
  baseW: number,
  baseH: number,
  viewportW: number,
  viewportH: number,
  slack = 40,
): Point {
  const maxX = Math.max(0, (baseW * scale - viewportW) / 2) + slack;
  const maxY = Math.max(0, (baseH * scale - viewportH) / 2) + slack;
  return { x: clamp(tx, -maxX, maxX), y: clamp(ty, -maxY, maxY) };
}

/** Should a release at 1× with this drag distance/velocity dismiss? */
export function shouldDismiss(distance: number, velocity: number): boolean {
  return distance > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY;
}

export const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
