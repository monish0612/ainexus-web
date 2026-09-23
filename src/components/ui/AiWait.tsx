import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { emphasized, spring, standard, usePrefersReducedMotion } from '@/lib/motion';
import { SkeletonCard, SkeletonShape } from './primitives';

/**
 * AiWait — the single waiting primitive for every AI surface.
 *
 * Six variants, one component. Research and think are status text only.
 * The node-link graphic carried no information and ran for the whole search.
 * Vision still draws a ring around the attached image. List, sync, and result
 * keep their own progress.
 *
 * Every variant renders its status copy as real text inside an aria-live
 * region. That text is both the accessibility path and the QA hook.
 */

export type AiWaitVariant = 'research' | 'think' | 'vision' | 'list' | 'sync' | 'result';
export type AiWaitMode = 'lite' | 'deep' | 'thinking';

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ colour */

const MODE_VAR: Record<AiWaitMode, string> = {
  lite: '--mode-lite',
  deep: '--mode-deep',
  thinking: '--mode-thinking',
};

// Dark-theme values. Only used before the first computed-style read, and in
// environments with no layout engine (jsdom).
const MODE_FALLBACK: Record<AiWaitMode, string> = {
  lite: '#22D3EE',
  deep: '#8B5CF6',
  thinking: '#F5B62C',
};

/**
 * The single binding between "which mode is active" and "what colour does the
 * loader draw in". Canvas can't read CSS variables, so we resolve the token to
 * a concrete colour and re-resolve when the theme attribute flips.
 */
export function useModeColor(mode: AiWaitMode = 'lite'): string {
  const [color, setColor] = useState(MODE_FALLBACK[mode]);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const value = getComputedStyle(root).getPropertyValue(MODE_VAR[mode]).trim();
      setColor(value || MODE_FALLBACK[mode]);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => observer.disconnect();
  }, [mode]);
  return color;
}

/**
 * Alpha tuned against #000000 under-inks #FFFFFF. At 0.4 over black you see
 * 40% of the colour's brightness against nothing; at 0.4 over white you see
 * 60% white. The light theme needs more ink for the same perceived weight.
 */
function useInkBoost(): number {
  const [boost, setBoost] = useState(1);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setBoost(root.getAttribute('data-theme') === 'white' ? 1.75 : 1);
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return boost;
}

type Rgb = [number, number, number];

function parseColor(input: string): Rgb {
  const value = input.trim();
  const hex = value.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const parts = value.match(/-?\d+(\.\d+)?/g);
  if (parts && parts.length >= 3) {
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  }
  return [34, 211, 238];
}

function rgba([r, g, b]: Rgb, alpha: number) {
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ------------------------------------------------------------------ status */

const RESEARCH_STEPS = ['Searching', 'Reading sources', 'Writing'] as const;

/**
 * Advances through a status sequence and then HOLDS on the last entry.
 * It must never wrap back to the first step: a search that says "Searching"
 * again after it said "Writing" reads as a stall, not as progress.
 */
export function useAiWaitStatus(
  steps: readonly string[],
  { holdMs = 2000, active = true }: { holdMs?: number; active?: boolean } = {},
) {
  const [index, setIndex] = useState(0);
  const last = steps.length - 1;

  useEffect(() => {
    if (!active || index >= last) return;
    const id = window.setTimeout(() => setIndex((i) => Math.min(i + 1, last)), holdMs);
    return () => window.clearTimeout(id);
  }, [active, index, last, holdMs]);

  return { label: steps[Math.min(index, last)] ?? '', index, isLast: index >= last };
}

function StatusLine({
  label,
  reduced,
  srOnly,
}: {
  label: string;
  reduced: boolean;
  /** For variants whose visual is the wait itself (skeletons, meters) the copy
   *  still has to exist for screen readers and for QA to assert on. */
  srOnly?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        srOnly ? 'sr-only' : 'relative min-h-[1.25rem] text-sm font-medium text-fg3',
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          className="block"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, filter: 'blur(3px)' }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(3px)' }}
          transition={{ duration: 0.15, ease: standard.enter.ease }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- vision */

const TICKS = 48;

function VisionRing({
  src,
  alt,
  progress,
  color,
  reduced,
  ink,
  size,
}: {
  src?: string;
  alt: string;
  progress: number | null;
  color: string;
  reduced: boolean;
  ink: number;
  size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(0);
  const velocityRef = useRef(0);
  const targetRef = useRef(progress ?? 0.18);
  const reducedRef = useRef(reduced);
  const indeterminateRef = useRef(progress === null);
  const rgbRef = useRef<Rgb>(parseColor(color));
  const inkRef = useRef(ink);
  const startRef = useRef(0);
  const lastRef = useRef(0);
  const syncRef = useRef<() => void>(() => {});

  rgbRef.current = useMemo(() => parseColor(color), [color]);
  inkRef.current = ink;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const render = (now: number) => {
      const rgb = rgbRef.current;
      const ink = inkRef.current;
      /** Alpha, corrected for how the active theme composites it. */
      const ia = (v: number) => Math.min(1, v * ink);
      const still = reducedRef.current;
      const t = now - startRef.current;
      const cx = size / 2;
      const cy = size / 2;
      const ringR = size / 2 - 3;
      const innerR = size / 2 - 9;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const level = levelRef.current;
      const indeterminate = indeterminateRef.current;

      // --- liquid front, clipped to the thumbnail circle -----------------
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, TAU);
      ctx.clip();

      // Reduced motion flattens the front: no tilt, no ripple, no tremor —
      // but the front still rises, because the level is information.
      const tilt = still ? 0 : 0.09;
      const rippleA = still ? 0 : Math.min(3.2, innerR * 0.06);
      const tremor = still ? 0 : Math.sin(t * 0.0021) * 0.6;
      const surfaceY = cy + innerR - level * (innerR * 2) + tremor;

      ctx.beginPath();
      ctx.moveTo(cx - innerR, cy + innerR);
      for (let x = -innerR; x <= innerR; x += 2) {
        const ripple = rippleA * Math.sin(x * 0.11 + t * 0.0035);
        ctx.lineTo(cx + x, surfaceY + x * tilt + ripple);
      }
      ctx.lineTo(cx + innerR, cy + innerR);
      ctx.closePath();
      ctx.fillStyle = rgba(rgb, ia(0.22));
      ctx.fill();

      ctx.beginPath();
      for (let x = -innerR; x <= innerR; x += 2) {
        const ripple = rippleA * Math.sin(x * 0.11 + t * 0.0035);
        const y = surfaceY + x * tilt + ripple;
        if (x === -innerR) ctx.moveTo(cx + x, y);
        else ctx.lineTo(cx + x, y);
      }
      ctx.strokeStyle = rgba(rgb, 0.9);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();

      // --- ticks ---------------------------------------------------------
      // Indeterminate + full motion: a comet head sweeps the ring.
      // Indeterminate + reduced motion: the ticks cross-fade in place.
      const sweep = (t * 0.0011) % 1;
      const pulse = 0.5 + 0.5 * Math.cos((t / 1800) * TAU);
      for (let i = 0; i < TICKS; i += 1) {
        const k = i / TICKS;
        const angle = -Math.PI / 2 + k * TAU;
        let alpha = 0.16;
        if (indeterminate) {
          if (still) {
            alpha = 0.14 + 0.22 * (0.5 + 0.5 * Math.cos((k - pulse) * TAU));
          } else {
            let d = Math.abs(k - sweep);
            if (d > 0.5) d = 1 - d;
            alpha = 0.14 + 0.86 * Math.exp(-d * 14);
          }
        } else if (k <= level) {
          alpha = 0.85;
        }
        alpha = ia(alpha);
        const r0 = ringR - (alpha > 0.4 ? 5 : 3.4);
        ctx.strokeStyle = rgba(rgb, alpha);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
        ctx.lineTo(cx + Math.cos(angle) * ringR, cy + Math.sin(angle) * ringR);
        ctx.stroke();
      }

      if (!indeterminate) {
        ctx.strokeStyle = rgba(rgb, 0.9);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + level * TAU);
        ctx.stroke();
      }
    };

    // spring.slow, integrated by hand because this drives a canvas value.
    const STIFFNESS = 200;
    const DAMPING = 22.63;

    const step = (now: number) => {
      const dt = Math.min(0.034, Math.max(0.001, (now - (lastRef.current || now)) / 1000));
      lastRef.current = now;
      const target = targetRef.current;
      if (reducedRef.current) {
        // Same travel, no overshoot.
        levelRef.current += (target - levelRef.current) * Math.min(1, dt * 6);
        velocityRef.current = 0;
      } else {
        const force = (target - levelRef.current) * STIFFNESS - velocityRef.current * DAMPING;
        velocityRef.current += force * dt;
        levelRef.current += velocityRef.current * dt;
      }
      render(now);

      const atRest =
        Math.abs(targetRef.current - levelRef.current) < 0.0008 &&
        Math.abs(velocityRef.current) < 0.0015;
      // An indeterminate ring always has something to draw; a settled
      // determinate ring does not, so it stops.
      if (atRest && !indeterminateRef.current) {
        levelRef.current = targetRef.current;
        render(now);
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    const sync = () => {
      if (document.hidden) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        return;
      }
      if (rafRef.current === null) {
        lastRef.current = 0;
        rafRef.current = requestAnimationFrame(step);
      }
    };
    syncRef.current = sync;

    startRef.current = performance.now();
    render(startRef.current);
    sync();

    const onVisibility = () => sync();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [size]);

  useEffect(() => {
    indeterminateRef.current = progress === null;
    targetRef.current = progress ?? 0.18;
    syncRef.current();
  }, [progress]);

  useEffect(() => {
    reducedRef.current = reduced;
    syncRef.current();
  }, [reduced]);

  useEffect(() => {
    syncRef.current();
  }, [color]);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute overflow-hidden rounded-full border border-line bg-bg3"
        style={{ inset: 9 }}
      >
        {src && <img src={src} alt={alt} className="h-full w-full object-cover" />}
      </div>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0" />
    </div>
  );
}

/* ------------------------------------------------------------------ sync */

function SyncMeter({
  progress,
  color,
  reduced,
  label,
}: {
  progress: number | null;
  color: string;
  reduced: boolean;
  label: string;
}) {
  const determinate = progress !== null;
  const clamped = Math.max(0, Math.min(1, progress ?? 0));
  const percent = Math.round(clamped * 100);
  const digits = String(percent).split('');

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-fg2">{label}</span>
        {determinate && (
          <span className="font-mono text-sm font-semibold tabular-nums text-fg">
            {digits.map((digit, i) => {
              // Digits pop in from the right: the last digit lands last.
              const fromEnd = digits.length - 1 - i;
              const delay = fromEnd === 0 ? 140 : fromEnd === 1 ? 70 : 0;
              return (
                <span
                  key={`${i}-${digit}`}
                  className={clsx('inline-block', !reduced && 'animate-digit-pop')}
                  style={reduced ? undefined : { animationDelay: `${delay}ms` }}
                >
                  {digit}
                </span>
              );
            })}
            <span className="ml-0.5 text-fg3">%</span>
          </span>
        )}
      </div>
      {/* The radius lives on the clipping parent so scaleX can't distort the
          end caps, and the fill animates transform — never width. */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg3">
        <motion.span
          className="block h-full w-full origin-left rounded-full"
          style={{ backgroundColor: color }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: determinate ? clamped : 0.35 }}
          transition={reduced ? standard.enter : spring.default}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- result */

const SHAKE_KEYS = [0, 6, -6, 4, 0];
const SHAKE_TIMES = [0, 0.2857, 0.5714, 0.7857, 1];
const SHAKE_EASE: [number, number, number, number][] = [
  [0.22, 1, 0.36, 1],
  [0.22, 1, 0.36, 1],
  [0.22, 1, 0.36, 1],
  [0.22, 1, 0.36, 1],
];

function ResultMark({
  state,
  message,
  color,
  reduced,
  onRevert,
  size,
}: {
  state: 'success' | 'error';
  message: string;
  color: string;
  reduced: boolean;
  onRevert?: () => void;
  size: number;
}) {
  const revert = useCallback(() => onRevert?.(), [onRevert]);

  // An error is a transient state, not a mode: it clears itself after 3s, or
  // the moment the user starts fixing it.
  useEffect(() => {
    if (state !== 'error' || !onRevert) return;
    const id = window.setTimeout(revert, 3000);
    window.addEventListener('keydown', revert);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', revert);
    };
  }, [state, onRevert, revert]);

  if (state === 'error') {
    return (
      <motion.div
        className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
        initial={{ borderColor: 'rgba(148,163,184,0.25)' }}
        animate={
          reduced
            ? { borderColor: 'rgb(248,113,113)' }
            : { x: SHAKE_KEYS, borderColor: 'rgb(248,113,113)' }
        }
        transition={
          reduced
            ? { duration: 0.15 }
            : {
                x: { duration: 0.28, times: SHAKE_TIMES, ease: SHAKE_EASE },
                borderColor: { duration: 0.15 },
              }
        }
      >
        <span
          aria-hidden
          className="grid shrink-0 place-items-center rounded-full bg-red-500/15 text-red-400"
          style={{ width: size * 0.6, height: size * 0.6 }}
        >
          <svg width={size * 0.34} height={size * 0.34} viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6 L18 18 M18 6 L6 18"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
            />
          </svg>
        </span>
        <motion.span
          className="text-sm font-medium text-fg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {message}
        </motion.span>
      </motion.div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <motion.span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-full"
        style={{ width: size, height: size, backgroundColor: `${color}22`, color }}
        initial={
          reduced
            ? { opacity: 0 }
            : { opacity: 0, rotate: 80, filter: 'blur(10px)', y: -4 }
        }
        animate={
          reduced ? { opacity: 1 } : { opacity: 1, rotate: 0, filter: 'blur(0px)', y: 0 }
        }
        transition={
          reduced
            ? { duration: 0.25 }
            : {
                default: { duration: 0.5, ease: emphasized.enter.ease },
                // The bob overshoots slightly so the icon lands with weight.
                y: { duration: 0.5, ease: [0.34, 1.35, 0.64, 1] },
              }
        }
      >
        <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none">
          <motion.path
            d="M5 12.5 L10 17.5 L19 7"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            // The delay is the point: the icon arrives, *then* the stroke
            // draws. Simultaneous reads as a glitch.
            transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.08 }}
          />
        </svg>
      </motion.span>
      <motion.span
        className="text-sm font-medium text-fg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {message}
      </motion.span>
    </div>
  );
}

/* --------------------------------------------------------------- skeletons */

function SkeletonList({
  rows,
  shape,
  rowClassName,
  reduced,
}: {
  rows: number;
  shape: SkeletonShape;
  rowClassName?: string;
  reduced: boolean;
}) {
  const count = Math.max(1, rows);
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          // Stagger caps at 6 rows: past that the last row would arrive so
          // late it reads as a second load rather than one list.
          transition={{
            duration: reduced ? 0.4 : 0.25,
            delay: Math.min(i, 5) * 0.04,
            ease: standard.enter.ease,
          }}
        >
          <SkeletonCard shape={shape} className={rowClassName} />
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ AiWait */

export interface AiWaitProps {
  variant: AiWaitVariant;
  /** Drives the loader colour through a single binding. */
  mode?: AiWaitMode;
  /** Override the status copy. `research` ignores this while it is cycling. */
  status?: string;
  className?: string;
  /** research/think: false parks the rAF loop. */
  active?: boolean;
  /** research: run the converge-and-land finish. */
  done?: boolean;
  /** vision/sync: 0..1, or null when the total is unknown. */
  progress?: number | null;
  /** vision: thumbnail. */
  src?: string;
  alt?: string;
  /** list: row count and the shape of the card that is about to arrive. */
  rows?: number;
  shape?: SkeletonShape;
  rowClassName?: string;
  /** result. */
  state?: 'success' | 'error';
  onRevert?: () => void;
  size?: number;
}

const DEFAULT_STATUS: Record<Exclude<AiWaitVariant, 'research'>, string> = {
  think: 'Thinking',
  vision: 'Analysing image',
  list: 'Loading',
  sync: 'Syncing',
  result: 'Done',
};

export function AiWait({
  variant,
  mode = 'lite',
  status,
  className,
  active = true,
  done = false,
  progress = null,
  src,
  alt = '',
  rows = 4,
  shape = 'row',
  rowClassName,
  state = 'success',
  onRevert,
  size,
}: AiWaitProps) {
  const reduced = usePrefersReducedMotion();
  const color = useModeColor(mode);
  const ink = useInkBoost();

  const research = useAiWaitStatus(RESEARCH_STEPS, {
    active: variant === 'research' && active && !done,
  });

  if (variant === 'research') {
    return (
      <div className={clsx('flex flex-col gap-2', className)}>
        <StatusLine label={status ?? research.label} reduced={reduced} />
      </div>
    );
  }

  if (variant === 'think') {
    return (
      <div className={clsx('flex flex-col gap-2', className)}>
        <StatusLine label={status ?? DEFAULT_STATUS.think} reduced={reduced} />
      </div>
    );
  }

  if (variant === 'vision') {
    return (
      <div className={clsx('flex items-center gap-3', className)}>
        <VisionRing
          src={src}
          alt={alt}
          progress={progress}
          color={color}
          reduced={reduced}
          ink={ink}
          size={size ?? 88}
        />
        <StatusLine label={status ?? DEFAULT_STATUS.vision} reduced={reduced} />
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className={className}>
        <SkeletonList rows={rows} shape={shape} rowClassName={rowClassName} reduced={reduced} />
        {/* Skeletons are aria-hidden, so the wait itself has to be announced. */}
        <StatusLine label={status ?? DEFAULT_STATUS.list} reduced={reduced} srOnly />
      </div>
    );
  }

  if (variant === 'sync') {
    return (
      <div className={clsx('flex w-full flex-col gap-1.5', className)}>
        <SyncMeter
          progress={progress}
          color={color}
          reduced={reduced}
          label={status ?? DEFAULT_STATUS.sync}
        />
        <StatusLine
          label={
            progress === null
              ? (status ?? DEFAULT_STATUS.sync)
              : `${status ?? DEFAULT_STATUS.sync} ${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`
          }
          reduced={reduced}
          srOnly
        />
      </div>
    );
  }

  const resultMessage =
    status ?? (state === 'error' ? 'Something went wrong' : DEFAULT_STATUS.result);
  return (
    <div className={className} role="status" aria-live="polite">
      <ResultMark
        state={state}
        message={resultMessage}
        color={color}
        reduced={reduced}
        onRevert={onRevert}
        size={size ?? 40}
      />
    </div>
  );
}

export default AiWait;
