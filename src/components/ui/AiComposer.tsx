import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useSpring } from 'framer-motion';
import clsx from 'clsx';
import { Clipboard, CornerDownLeft, ImagePlus, X } from 'lucide-react';
import { spring, standard, usePrefersReducedMotion } from '@/lib/motion';
import { AiWaitMode, useModeColor } from './AiWait';

/**
 * AiComposer — the one input surface every AI ask/search box on the web app
 * uses. It exists because a `<textarea class="input">` next to a spinner is
 * not a composer, and we had four copies of that.
 *
 * What it owns:
 *  • auto-grow field (the caller never sets rows/height)
 *  • origin-aware focus glow, tinted by the ACTIVE MODE colour
 *  • a magnetic submit button on `spring.magnetic`
 *  • attach / paste / clear chips, and the image thumbnail chip
 *  • Enter submits, Shift+Enter newlines
 *
 * What it deliberately does NOT own: when to submit, what to submit, or what
 * "busy" means. Those stay in the feature file so the request contracts are
 * still readable in one place.
 *
 * Accessible-name warning: several suites select the submit control with
 * ANCHORED regexes (`/^send$/i`, `/^search$/i`). `submitLabel` is rendered as
 * the button's only text and is not wrapped in anything that contributes a
 * name, so it is the accessible name verbatim. Do not add a tooltip, a badge
 * or a second word inside that button.
 */

const MODE_EDGE: Record<AiWaitMode, string> = {
  lite: 'var(--mode-lite-edge)',
  deep: 'var(--mode-deep-edge)',
  thinking: 'var(--mode-thinking-edge)',
};

/** Peak travel of the magnetic pull, in px. Past ~6 it reads as a bug. */
const MAGNET_PX = 5;
/** Radius around the button where the pull is felt. */
const MAGNET_FIELD = 140;
/** `spring.magnetic` as a bare SpringOptions — useSpring takes no `type`. */
const MAGNET_SPRING = {
  stiffness: spring.magnetic.stiffness,
  damping: spring.magnetic.damping,
  mass: spring.magnetic.mass,
};

export interface ComposerImage {
  /** Object URL / data URL for the thumbnail. */
  preview: string;
  /** Pixel dimensions, when the decoder gave them to us. */
  width?: number;
  height?: number;
  /** Payload size in KB. */
  sizeKb?: number;
  /** `image/jpeg` → JPEG. */
  mediaType?: string;
}

/** `1024×768 · 214 KB · JPEG` — the same meta line the Android chip shows. */
export function imageChipMeta(image: ComposerImage): string {
  const parts: string[] = [];
  if (image.width && image.height) parts.push(`${image.width}×${image.height}`);
  if (image.sizeKb) parts.push(`${Math.max(1, Math.round(image.sizeKb))} KB`);
  const sub = (image.mediaType ?? '').split('/')[1];
  if (sub) parts.push(sub.toUpperCase());
  return parts.join(' · ');
}

/**
 * Grows the field to fit its content, up to `maxHeight`, then scrolls.
 *
 * `scrollHeight` is 0 in any environment without a layout engine (jsdom, a
 * detached node, `display: none`). Writing `0px` there would collapse the
 * field to nothing, so a zero measurement is treated as "unknown" and the
 * CSS height stays where it was.
 */
export function useAutoGrow(value: string, maxHeight: number) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const content = el.scrollHeight;
    if (!content) return;
    el.style.height = `${Math.min(content, maxHeight)}px`;
    el.style.overflowY = content > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return { ref, resize };
}

/* ------------------------------------------------------------- focus glow */

/**
 * The focus treatment, drawn BEHIND the field bar (the bar paints an opaque
 * background over it), so what survives is a 1.5px gradient edge plus a bloom.
 *
 * Deliberately no `mask-composite` gradient-border trick: an engine that does
 * not support it paints the whole gradient over the field instead of just its
 * edge. Stacking an opaque bar on top of a slightly larger gradient gets the
 * same edge with no feature detection — the same reasoning that kept
 * `color-mix` out of the fill tokens.
 *
 * Everything here animates opacity and transform only, and every layer is
 * pre-painted at full strength so no frame animates a border-width, a colour
 * or a box-shadow.
 */
/** The halo + gradient edge. Painted UNDER the bar's opaque face. */
function FocusEdge({
  focused,
  color,
  reduced,
}: {
  focused: boolean;
  color: string;
  reduced: boolean;
}) {
  return (
    <>
      {/* Soft outer halo. Pre-painted at full strength and revealed with
          opacity — no frame ever animates a box-shadow. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-[1.5px] rounded-[21px]"
        style={{ boxShadow: `0 0 0 4px ${color}1f, 0 16px 40px -16px ${color}99` }}
        initial={false}
        animate={{ opacity: focused ? 1 : 0 }}
        transition={standard.enter}
      />
      {/* Gradient edge, at two angles. Cross-fading the pair is what
          "breathes"; animating background-position would be a paint a frame. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-[1.5px] rounded-[21px]"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}40 52%, ${color}d9)` }}
        initial={false}
        animate={{ opacity: focused ? 1 : 0 }}
        transition={standard.enter}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-[1.5px] rounded-[21px]"
        style={{ background: `linear-gradient(315deg, ${color}, ${color}40 52%, ${color}d9)` }}
        initial={false}
        // Reduced motion keeps the ring — it just stops moving. The static
        // branch is the 135° layer alone, at full strength.
        animate={focused && !reduced ? { opacity: [0, 0.9, 0] } : { opacity: 0 }}
        transition={
          focused && !reduced
            ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
            : standard.enter
        }
      />
    </>
  );
}

/**
 * The origin-aware bloom, painted OVER the bar's face and clipped to it. It
 * grows from wherever the field was actually touched, which is what makes the
 * focus feel caused rather than announced.
 */
function FocusBloom({
  focused,
  color,
  origin,
  reduced,
}: {
  focused: boolean;
  color: string;
  origin: { x: number; y: number };
  reduced: boolean;
}) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[20px]"
      initial={false}
      animate={{ opacity: focused ? 1 : 0 }}
      transition={standard.enter}
    >
      <motion.span
        className="absolute inset-0 block"
        style={{
          background: `radial-gradient(110% 150% at ${origin.x}% ${origin.y}%, ${color}26, transparent 66%)`,
          transformOrigin: `${origin.x}% ${origin.y}%`,
        }}
        initial={false}
        animate={reduced ? { scale: 1 } : { scale: focused ? 1 : 0.82 }}
        transition={reduced ? standard.enter : spring.slow}
      />
    </motion.span>
  );
}

/* ------------------------------------------------------------------ chips */

function ToolChip({
  icon,
  label,
  onClick,
  disabled,
  busy,
  tone,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={label}
      title={label}
      className={clsx(
        // Icon-only and square so several tools plus both model groups fit on
        // ONE control row. The label still reaches assistive tech and the
        // native tooltip — it is the inline text that goes, not the name.
        'tap grid h-11 w-11 shrink-0 place-items-center rounded-full',
        'text-fg3 transition-colors duration-150 hover:bg-bg3 hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:opacity-40 disabled:hover:bg-transparent',
      )}
      style={tone ? { color: tone } : undefined}
    >
      {/* No spinner here on purpose: the surface already has exactly one wait
          signature (AiWait), and a second one inside a chip reads as noise. */}
      <span className={clsx('inline-flex', busy && 'animate-pulse')}>{icon}</span>
    </button>
  );
}

function ImageChip({
  image,
  onRemove,
  color,
  reduced,
}: {
  image: ComposerImage;
  onRemove?: () => void;
  color: string;
  reduced: boolean;
}) {
  const meta = imageChipMeta(image);
  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
      transition={reduced ? standard.enter : spring.default}
      className="flex items-center gap-3 rounded-2xl border border-line bg-bg2 p-2 pr-1"
    >
      <span
        aria-hidden
        className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border"
        style={{ borderColor: `${color}55` }}
      >
        <img src={image.preview} alt="" className="h-full w-full object-cover" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-semibold text-fg">Image attached</span>
        {meta && <span className="truncate font-mono text-[11px] text-fg3">{meta}</span>}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove image"
          className="tap ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-xl text-fg3
            transition-colors duration-150 hover:bg-red-500/15 hover:text-red-400
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <X size={16} />
        </button>
      )}
    </motion.div>
  );
}

/* --------------------------------------------------------------- composer */

export interface AiComposerProps {
  value: string;
  onValueChange: (v: string) => void;
  /** Called on Enter and on the submit control. Never called while `busy`,
   *  and never when the submit control would be disabled. */
  onSubmit: () => void;
  placeholder: string;
  /** Rendered as the submit button's ONLY text — and therefore its accessible name. */
  submitLabel: string;
  submitIcon?: ReactNode;
  /**
   * `icon` = circular button beside the field (label is sr-only).
   * `pill` = the same button beside the field with the label shown, for the
   * hero surface where "Search" needs to be readable.
   * Both sit WITH the field. There is deliberately no full-width bar variant:
   * a full-bleed button under a textarea is the settings-form shape this
   * composer exists to get away from.
   */
  submitVariant?: 'icon' | 'pill';
  /** Drives the glow, the ring and the chip tint. */
  mode?: AiWaitMode;
  busy?: boolean;
  /** Overrides the default "there is trimmed text" rule. */
  canSubmit?: boolean;
  /** Cap for the auto-grow, in px. */
  maxHeight?: number;
  /** Identity row above the field (orb, title, animated intent line). */
  header?: ReactNode;
  /** Model picker / segmented controls, below the field. */
  controls?: ReactNode;
  /** Extra chips, pushed to the right of the tool row. */
  toolbarEnd?: ReactNode;
  onAttach?: () => void;
  attaching?: boolean;
  onPasteText?: (text: string) => void;
  image?: ComposerImage | null;
  onRemoveImage?: () => void;
  autoFocus?: boolean;
  /** Set on the root so DOM-order-sensitive helpers can target explicitly. */
  testId?: string;
  className?: string;
  /** Hides the "Enter to send" hint on cramped surfaces. */
  hideHint?: boolean;
}

export function AiComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder,
  submitLabel,
  submitIcon,
  submitVariant = 'icon',
  mode = 'lite',
  busy = false,
  canSubmit,
  maxHeight = 168,
  header,
  controls,
  toolbarEnd,
  onAttach,
  attaching = false,
  onPasteText,
  image,
  onRemoveImage,
  autoFocus,
  testId,
  className,
  hideHint,
}: AiComposerProps) {
  const reduced = usePrefersReducedMotion();
  const color = useModeColor(mode);
  const [focused, setFocused] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const { ref: textareaRef, resize } = useAutoGrow(value, maxHeight);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const enabled = (canSubmit ?? value.trim().length > 0) && !busy;

  // Magnetic pull. Two springs, not a re-render per mousemove: the pointer
  // writes to motion values and framer drives the transform off-thread.
  const magnetX = useSpring(0, MAGNET_SPRING);
  const magnetY = useSpring(0, MAGNET_SPRING);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (reduced || !enabled) return;
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist > MAGNET_FIELD) {
        magnetX.set(0);
        magnetY.set(0);
        return;
      }
      const pull = (1 - dist / MAGNET_FIELD) * MAGNET_PX;
      magnetX.set((dx / (dist || 1)) * pull);
      magnetY.set((dy / (dist || 1)) * pull);
    },
    [enabled, magnetX, magnetY, reduced],
  );

  const releaseMagnet = useCallback(() => {
    magnetX.set(0);
    magnetY.set(0);
  }, [magnetX, magnetY]);

  // Where the glow blooms from. Captured on pointerdown so a click lights the
  // field up under the finger; keyboard focus falls back to dead centre.
  const captureOrigin = useCallback((e: React.PointerEvent) => {
    const host = shellRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setOrigin({
      x: Math.round(((e.clientX - r.left) / r.width) * 100),
      y: Math.round(((e.clientY - r.top) / r.height) * 100),
    });
  }, []);

  async function pasteFromClipboard() {
    if (!onPasteText) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) onPasteText(text);
    } catch {
      /* clipboard denied / unavailable — silently ignore, the field still works */
    }
  }

  const pill = submitVariant === 'pill';
  const submitButton = (
    <motion.button
      ref={buttonRef}
      type="button"
      onClick={() => enabled && onSubmit()}
      disabled={!enabled}
      className={clsx(
        'relative shrink-0 self-end overflow-hidden rounded-full font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed',
        pill
          ? 'flex h-12 items-center justify-center gap-2 px-5 text-sm'
          : 'grid h-12 w-12 place-items-center',
      )}
      style={{
        x: reduced ? 0 : magnetX,
        y: reduced ? 0 : magnetY,
        background: enabled ? 'var(--accent)' : 'var(--bg3)',
        color: enabled ? '#ffffff' : 'var(--text4)',
        boxShadow: enabled ? `0 10px 26px -12px ${color}b0` : 'none',
      }}
      initial={false}
      animate={
        busy && !reduced
          ? { scale: 0.94, opacity: [1, 0.55, 1] }
          : { scale: enabled ? 1 : 0.94, opacity: 1 }
      }
      whileHover={enabled && !reduced ? { scale: 1.06 } : undefined}
      whileTap={enabled && !reduced ? { scale: 0.93 } : undefined}
      transition={
        busy && !reduced
          ? { opacity: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }, scale: spring.magnetic }
          : reduced
            ? standard.enter
            : spring.magnetic
      }
    >
      {submitIcon ?? <CornerDownLeft size={18} />}
      {pill ? submitLabel : <span className="sr-only">{submitLabel}</span>}
    </motion.button>
  );

  const tools = (
    <>
      {onAttach && (
        <ToolChip
          icon={<ImagePlus size={17} />}
          label="Attach image"
          onClick={onAttach}
          busy={attaching}
        />
      )}
      {onPasteText && (
        <ToolChip icon={<Clipboard size={17} />} label="Paste" onClick={pasteFromClipboard} />
      )}
      {value.trim() && !busy && (
        <ToolChip
          icon={<X size={17} />}
          label="Clear text"
          onClick={() => {
            onValueChange('');
            resize();
          }}
        />
      )}
      {toolbarEnd}
    </>
  );

  const hasTools = !!onAttach || !!onPasteText || !!toolbarEnd || !!value.trim();
  const showControlRow = !!controls || hasTools;

  return (
    <div
      ref={shellRef}
      data-testid={testId}
      onPointerMove={onPointerMove}
      onPointerLeave={releaseMagnet}
      className={clsx(
        'relative flex flex-col gap-3 rounded-[26px] border border-line bg-bg2 p-3 backdrop-blur',
        'transition-colors duration-200 sm:p-3.5',
        className,
      )}
    >
      {header}

      <AnimatePresence initial={false}>
        {image && (
          <ImageChip
            key="image-chip"
            image={image}
            onRemove={onRemoveImage}
            color={color}
            reduced={reduced}
          />
        )}
      </AnimatePresence>

      {/* ── The field bar ────────────────────────────────────────────────
          The hero. The focus treatment is anchored HERE rather than on the
          card so the glow grows out of the field the user actually touched,
          and so the controls below stay visually subordinate. `bg-bg1` is
          opaque on purpose: it is what clips the gradient edge behind it
          down to a 1.5px line. */}
      <div
        onPointerDownCapture={captureOrigin}
        className="relative flex items-end gap-2 rounded-[20px] px-2 py-2"
      >
        <FocusEdge focused={focused} color={color} reduced={reduced} />
        {/* The bar's opaque face. It is what clips the gradient behind it down
            to a 1.5px edge — no `mask-composite`, so no engine can drop the
            declaration and end up painting the gradient over the field. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-[20px] border border-line bg-bg1 transition-colors duration-200"
          style={{ borderColor: focused ? 'transparent' : undefined }}
        />
        <FocusBloom focused={focused} color={color} origin={origin} reduced={reduced} />
        <textarea
          ref={textareaRef}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          rows={1}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onValueChange(e.target.value);
            resize();
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            // Enter submits, Shift+Enter inserts a newline. Every AI surface
            // in the app shares this; do not make one of them different.
            if (e.key === 'Enter' && !e.shiftKey) {
              // The default is prevented either way — Enter is "send" on
              // this field, never a newline — but it only submits when the
              // send button would have, so a disabled or busy composer
              // cannot fire a second request from the keyboard.
              e.preventDefault();
              if (enabled) onSubmit();
            }
          }}
          className="relative min-h-[48px] w-full flex-1 resize-none bg-transparent px-2.5 py-3
            text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg4"
        />
        {submitButton}
      </div>

      {/* ── One control row ──────────────────────────────────────────────
          Model chips on the left, tools on the right. Not two full-width
          segmented bars and a full-bleed button: those read as a settings
          form, which is the complaint this layout answers. */}
      {showControlRow && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {controls}
          {hasTools && (
            // Pushed right only when there are model chips to push against;
            // on a surface with no picker (Expense Ask AI) a lone right-hand
            // icon reads as debris, so it stays under the field instead.
            <div className={clsx('flex items-center gap-0.5', controls && 'ml-auto')}>{tools}</div>
          )}
        </div>
      )}

      {!hideHint && (
        <p className="px-1 text-[11px] text-fg4">
          <kbd className="font-sans font-semibold text-fg3">Enter</kbd> to send ·{' '}
          <kbd className="font-sans font-semibold text-fg3">Shift</kbd>+
          <kbd className="font-sans font-semibold text-fg3">Enter</kbd> for a new line
        </p>
      )}
    </div>
  );
}

/** The mode-tinted edge token, exported so callers can match a surrounding surface. */
export function modeEdge(mode: AiWaitMode): string {
  return MODE_EDGE[mode];
}

export default AiComposer;
