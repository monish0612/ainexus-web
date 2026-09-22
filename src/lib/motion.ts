import { useReducedMotion } from 'framer-motion';
import type { Transition } from 'framer-motion';

/**
 * Nexus motion tokens (Material 3).
 *
 * Two families, and the difference matters:
 *
 *  - SPATIAL springs move things through space. They are under-damped on
 *    purpose and may overshoot — that overshoot is what makes a panel feel
 *    like it has mass.
 *  - EFFECTS springs animate colour and opacity. They sit at damping ratio
 *    1.0 and never overshoot, because alpha bouncing past 100% (or a colour
 *    bouncing past its target) reads as a rendering bug, not as motion.
 *
 * The `damping` numbers below are framer-motion's raw damping *coefficient*,
 * already converted from M3's damping *ratio* via
 *
 *     damping = ratio * 2 * sqrt(stiffness * mass)
 *
 * Do not "simplify" them back to the ratios — framer-motion does not take a
 * ratio, and passing one produces a wildly under-damped spring.
 */

type Bezier = [number, number, number, number];

/** Sub-frame feedback: press states, hover tints. Never for layout moves. */
export const micro = {
  press: { duration: 0.1, ease: [0.2, 0, 0, 1] as Bezier },
  hover: { duration: 0.15, ease: [0.2, 0, 0, 1] as Bezier },
} satisfies Record<string, Transition>;

/** The default for most enter/exit: unremarkable, gets out of the way. */
export const standard = {
  enter: { duration: 0.25, ease: [0, 0, 0, 1] as Bezier },
  exit: { duration: 0.2, ease: [0.3, 0, 1, 1] as Bezier },
} satisfies Record<string, Transition>;

/** For moments that deserve attention: sheets, hero transitions, results. */
export const emphasized = {
  enter: { duration: 0.5, ease: [0.05, 0.7, 0.1, 1] as Bezier },
  exit: { duration: 0.2, ease: [0.3, 0, 0.8, 0.15] as Bezier },
} satisfies Record<string, Transition>;

export const spring = {
  /** SPATIAL — ratio 0.6. Shared-element indicators, small snaps. */
  fast: { type: 'spring', stiffness: 800, damping: 33.94, mass: 1 },
  /** SPATIAL — ratio 0.8. The general-purpose spring. */
  default: { type: 'spring', stiffness: 380, damping: 31.19, mass: 1 },
  /** SPATIAL — ratio 0.8, softer. Large surfaces travelling a long way. */
  slow: { type: 'spring', stiffness: 200, damping: 22.63, mass: 1 },
  /** EFFECTS — ratio 1.0, critically damped. Colour and opacity only. */
  effects: { type: 'spring', stiffness: 1600, damping: 80, mass: 1 },
  /** SPATIAL — ratio 0.5, deliberately under-damped. The send button. */
  magnetic: { type: 'spring', stiffness: 420, damping: 20.49, mass: 1 },
} satisfies Record<string, Transition>;

export const motionTokens = { micro, standard, emphasized, spring };

/**
 * `<MotionConfig reducedMotion="user">` handles motion components for us, but
 * canvas loops, CSS keyframes and hand-rolled rAF work are invisible to it.
 * Use this for those cases.
 *
 * framer-motion's own hook returns `boolean | null` (null until the media
 * query has been read); we normalise to a plain boolean so callers can branch
 * without a tri-state.
 */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() === true;
}

/**
 * Pick between a full-motion and a reduced-motion transition. The reduced
 * variant must keep the same *timing budget* as the full one — only the kind
 * of change collapses to opacity, never the duration or the copy.
 */
export function pickTransition(
  reduced: boolean,
  full: Transition,
  collapsed: Transition = standard.enter,
): Transition {
  return reduced ? collapsed : full;
}
