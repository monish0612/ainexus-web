import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2, Minus, Plus, X } from 'lucide-react';
import {
  MIN_SCALE,
  DOUBLE_TAP_SCALE,
  type Point,
  clampScale,
  clampTranslate,
  computeZoomToPoint,
  distance as dist,
  midpoint as mid,
  shouldDismiss,
} from './lightbox.zoom';

interface LightboxProps {
  /** Image URL to show. When null/empty the lightbox is closed. */
  src: string | null;
  alt?: string;
  onClose: () => void;
}

/**
 * Immersive, gesture-driven full-screen image viewer.
 *
 * Article images (often screenshots of dense text) are frequently unreadable at
 * column width. Clicking one opens it here, where the reader can:
 *   • double-click / double-tap to zoom in on that point (again to reset),
 *   • pinch to zoom on touch, scroll-wheel to zoom on desktop,
 *   • drag to pan while zoomed,
 *   • swipe (at 1×) / click the backdrop / press Esc / tap ✕ to close.
 *
 * Self-contained (no extra deps beyond framer-motion) and rendered in a portal
 * so it overlays everything regardless of where the source image lives. All the
 * zoom/pan/dismiss math lives in the pure, unit-tested `./lightbox.zoom` module.
 */
export function Lightbox({ src, alt = '', onClose }: LightboxProps) {
  const open = !!src;
  return createPortal(
    <AnimatePresence>
      {open && src && <LightboxBody src={src} alt={alt} onClose={onClose} />}
    </AnimatePresence>,
    document.body,
  );
}

function LightboxBody({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // Offset while swiping the image away to dismiss (only at 1×).
  const [dismiss, setDismiss] = useState<Point>({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  // Live gesture bookkeeping kept in refs so pointer handlers stay allocation-
  // light and never trip over stale closures across re-renders.
  const pointers = useRef<Map<number, Point>>(new Map());
  const gesture = useRef({
    startDist: 0,
    lastMid: { x: 0, y: 0 } as Point,
    last: { x: 0, y: 0 } as Point,
    dismissStart: { x: 0, y: 0 } as Point,
    mode: 'none' as 'none' | 'pan' | 'pinch' | 'dismiss',
  });
  // Mirror state into a ref so pointer math always reads the latest values.
  const view = useRef({ scale: 1, tx: 0, ty: 0 });
  view.current = { scale, tx, ty };

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '0') reset();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, reset]);

  const centerOf = useCallback((): Point => {
    const img = imgRef.current;
    if (!img) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const rect = img.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const clampToBounds = useCallback((nx: number, ny: number, s: number): Point => {
    const img = imgRef.current;
    if (!img) return { x: nx, y: ny };
    const rect = img.getBoundingClientRect();
    const baseW = rect.width / view.current.scale;
    const baseH = rect.height / view.current.scale;
    return clampTranslate(nx, ny, s, baseW, baseH, window.innerWidth, window.innerHeight);
  }, []);

  /** Zoom toward a screen point, keeping it anchored and staying in-bounds. */
  const zoomTo = useCallback(
    (nextScale: number, cursor: Point) => {
      const next = computeZoomToPoint(view.current, nextScale, cursor, centerOf());
      if (next.scale > MIN_SCALE) {
        const c = clampToBounds(next.tx, next.ty, next.scale);
        next.tx = c.x;
        next.ty = c.y;
      }
      setScale(next.scale);
      setTx(next.tx);
      setTy(next.ty);
    },
    [centerOf, clampToBounds],
  );

  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (view.current.scale > 1.05) reset();
    else zoomTo(DOUBLE_TAP_SCALE, { x: e.clientX, y: e.clientY });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const next = view.current.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
    zoomTo(next, { x: e.clientX, y: e.clientY });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.mode = 'pinch';
      g.startDist = dist(a, b);
      g.lastMid = mid(a, b);
    } else if (pointers.current.size === 1) {
      g.mode = view.current.scale > 1.02 ? 'pan' : 'dismiss';
      g.last = { x: e.clientX, y: e.clientY };
      g.dismissStart = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const curDist = dist(a, b);
      const curMid = mid(a, b);
      if (g.startDist > 0) {
        const target = clampScale(view.current.scale * (curDist / g.startDist));
        // Two-finger pan (midpoint drift), then anchor-zoom to the midpoint.
        setTx((t) => t + (curMid.x - g.lastMid.x));
        setTy((t) => t + (curMid.y - g.lastMid.y));
        g.lastMid = curMid;
        g.startDist = curDist;
        zoomTo(target, curMid);
      }
      return;
    }

    if (g.mode === 'pan') {
      const dx = e.clientX - g.last.x;
      const dy = e.clientY - g.last.y;
      g.last = { x: e.clientX, y: e.clientY };
      const c = clampToBounds(view.current.tx + dx, view.current.ty + dy, view.current.scale);
      setTx(c.x);
      setTy(c.y);
      return;
    }

    if (g.mode === 'dismiss') {
      setDismiss({ x: e.clientX - g.dismissStart.x, y: e.clientY - g.dismissStart.y });
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.mode === 'dismiss') {
      const d = Math.hypot(dismiss.x, dismiss.y);
      if (shouldDismiss(d, 0)) {
        onClose();
        return;
      }
      setDismiss({ x: 0, y: 0 });
    }
    if (pointers.current.size === 0) {
      g.mode = 'none';
    } else if (pointers.current.size === 1) {
      // Dropped from a pinch to a single finger → continue as a pan.
      const [only] = [...pointers.current.values()];
      g.mode = view.current.scale > 1.02 ? 'pan' : 'dismiss';
      g.last = { x: only.x, y: only.y };
      g.dismissStart = { x: only.x, y: only.y };
    }
  };

  const dismissDist = Math.hypot(dismiss.x, dismiss.y);
  const dismissProgress = Math.min(1, dismissDist / 320);
  const backdropOpacity = 1 - dismissProgress * 0.85;
  const dragScale = 1 - dismissProgress * 0.12;
  const idle = gesture.current.mode === 'none';

  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden overscroll-none touch-none select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      {/* Frosted backdrop — click to dismiss. */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      />

      {/* Image stage. */}
      <div
        className="relative flex h-full w-full items-center justify-center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onClick={(e) => e.stopPropagation()}
      >
        {!loaded && (
          <div className="absolute h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
        )}
        {/* Wrapper owns the mount/unmount animation; the inner <img> owns the
            interactive pan/zoom transform so the two never fight over
            `style.transform`. */}
        <motion.div
          className="flex items-center justify-center"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            draggable={false}
            onLoad={() => setLoaded(true)}
            className="max-h-[92vh] max-w-[94vw] object-contain will-change-transform"
            style={{
              transform: `translate3d(${tx + dismiss.x}px, ${ty + dismiss.y}px, 0) scale(${scale * dragScale})`,
              transformOrigin: 'center center',
              opacity: loaded ? 1 : 0,
              cursor: scale > 1 ? 'grab' : 'zoom-in',
              transition: idle
                ? 'transform 0.18s ease-out, opacity 0.2s ease'
                : 'opacity 0.2s ease',
            }}
          />
        </motion.div>
      </div>

      {/* Controls. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-1.5 backdrop-blur">
          <IconBtn
            label="Zoom out"
            onClick={() =>
              zoomTo(view.current.scale / 1.4, {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              })
            }
          >
            <Minus size={17} />
          </IconBtn>
          <span className="min-w-[3ch] text-center text-xs font-semibold tabular-nums text-white/80">
            {Math.round(scale * 100)}%
          </span>
          <IconBtn
            label="Zoom in"
            onClick={() =>
              zoomTo(view.current.scale * 1.4, {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              })
            }
          >
            <Plus size={17} />
          </IconBtn>
          <IconBtn label="Reset zoom" onClick={reset}>
            <Maximize2 size={16} />
          </IconBtn>
        </div>
        <IconBtn label="Close" onClick={onClose} className="pointer-events-auto bg-black/45 backdrop-blur">
          <X size={20} />
        </IconBtn>
      </div>
    </motion.div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      // Sized for real rather than with `tap-44`: these sit shoulder to
      // shoulder, so overlapping invisible hit areas would steal each other's
      // taps.
      className={`flex h-11 w-11 items-center justify-center rounded-full p-2 text-white/85 transition hover:bg-white/15 hover:text-white active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}
