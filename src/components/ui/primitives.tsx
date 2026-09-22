import { ButtonHTMLAttributes, ReactNode, useId } from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { spring, usePrefersReducedMotion } from '@/lib/motion';

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx('animate-spin', className)} />;
}

/**
 * Active-state identity for one segment. Without it a segment is the plain
 * accent chip it always was; with it the segment carries its own colour AND
 * its own shape, which is what keeps Gemini and xGrok apart in grayscale.
 */
export interface SegmentedTone {
  /** Any CSS background — a flat colour for xGrok, a gradient for Gemini. */
  fill: string;
  /** Border of the active indicator. Use a `*-edge` token: 3:1 on both themes. */
  edge: string;
  /** Active label colour. Must be one of the AA-fixed text tokens. */
  text: string;
  /** Radius utility for the indicator + button. The structural half of identity. */
  radius?: string;
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  tone?: SegmentedTone;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  density = 'bar',
  'aria-label': ariaLabel,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  /**
   * `bar` fills its container and splits the width evenly — the settings-form
   * shape. `chips` hugs its content so several groups share one row, which is
   * what a composer needs: the field is the hero, the options are subordinate.
   */
  density?: 'bar' | 'chips';
  'aria-label'?: string;
}) {
  // One indicator per control instance — a shared layoutId would make two
  // Segmenteds on the same screen fight over the same element.
  const indicatorId = useId();
  const chips = density === 'chips';
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx(
        'inline-flex border border-line bg-bg2 p-1',
        chips ? 'rounded-full' : 'w-full rounded-xl',
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        const tone = o.tone;
        const radius = tone?.radius ?? (chips ? 'rounded-full' : 'rounded-lg');
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'relative flex min-h-[44px] items-center justify-center font-semibold',
              'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-accent/40',
              chips
                ? 'shrink-0 gap-1.5 whitespace-nowrap px-3.5 py-1.5 text-[13px]'
                : 'flex-1 px-3 py-2 text-sm',
              radius,
              active
                ? tone
                  ? undefined
                  : 'text-white'
                : 'text-fg2 hover:text-fg active:scale-[0.97]',
            )}
            style={active && tone ? { color: tone.text } : undefined}
          >
            {active && (
              <motion.span
                layoutId={indicatorId}
                className={clsx(
                  'absolute inset-0 shadow-sm',
                  radius,
                  tone ? 'border' : 'bg-accent',
                )}
                style={tone ? { background: tone.fill, borderColor: tone.edge } : undefined}
                transition={spring.fast}
              />
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'accent' | 'ghost';
  loading?: boolean;
}

export function Button({
  variant = 'accent',
  loading,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(variant === 'accent' ? 'btn-accent' : 'btn-ghost', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-line bg-bg2 text-fg3">
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/10 to-transparent"
        />
        <span className="relative">{icon}</span>
      </div>
      <p className="text-base font-semibold text-fg">{title}</p>
      {hint && <p className="max-w-xs text-sm leading-relaxed text-fg3">{hint}</p>}
    </div>
  );
}

/**
 * Skeleton shapes. These exist so a loading list looks like the list that is
 * about to arrive — same radius, same padding, same avatar diameter, same
 * line count and line-length ratios. A generic grey bar is not a skeleton, it
 * is a spinner with square corners.
 *
 * `block` is the plain filled placeholder (the original behaviour).
 */
export type SkeletonShape = 'block' | 'article' | 'row' | 'stat' | 'tile';

function Bar({ w, h = 10, round = 'rounded-md' }: { w: string; h?: number; round?: string }) {
  return <span className={clsx('block bg-bg3', round)} style={{ width: w, height: h }} />;
}

function ShapeBody({ shape }: { shape: SkeletonShape }) {
  switch (shape) {
    // Mirrors ArticleCard: h-40 image, p-4 body, category chip + source,
    // two title lines, footer meta.
    case 'article':
      return (
        <div className="flex h-full flex-col">
          <span className="block h-40 w-full bg-bg3" />
          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <Bar w="64px" h={16} round="rounded-full" />
              <Bar w="80px" h={10} />
            </div>
            <Bar w="92%" h={14} />
            <Bar w="68%" h={14} />
            <div className="mt-auto pt-1">
              <Bar w="46%" h={10} />
            </div>
          </div>
        </div>
      );
    // Mirrors the expense row: p-3.5, 44px rounded-xl category tile, two
    // lines, right-aligned amount.
    case 'row':
      return (
        <div className="flex items-center gap-3 p-3.5">
          <span className="h-11 w-11 shrink-0 rounded-xl bg-bg3" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Bar w="62%" h={12} />
            <Bar w="40%" h={10} />
          </div>
          <Bar w="64px" h={14} />
        </div>
      );
    case 'stat':
      return (
        <div className="flex flex-col gap-2.5 p-4">
          <Bar w="52%" h={10} />
          <Bar w="74%" h={20} />
        </div>
      );
    case 'tile':
      return (
        <div className="flex h-full flex-col">
          <span className="block flex-1 bg-bg3" />
          <div className="flex flex-col gap-1.5 p-3">
            <Bar w="78%" h={11} />
            <Bar w="44%" h={9} />
          </div>
        </div>
      );
    case 'block':
    default:
      return null;
  }
}

export function SkeletonCard({
  className,
  shape = 'block',
  style,
}: {
  className?: string;
  shape?: SkeletonShape;
  style?: React.CSSProperties;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <div
      aria-hidden
      style={style}
      className={clsx(
        'relative overflow-hidden rounded-2xl border border-line2 bg-bg2',
        reduced && 'opacity-50',
        className,
      )}
    >
      <ShapeBody shape={shape} />
      {!reduced && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      )}
    </div>
  );
}
