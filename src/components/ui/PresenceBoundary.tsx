import { ReactNode } from 'react';
import { PresenceContext } from 'framer-motion';

/**
 * Keeps an overlay's *content* out of the overlay's own `AnimatePresence`
 * exit pass.
 *
 * framer-motion 11's `usePresence` registers a child with the enclosing
 * `AnimatePresence` and then throws away the deregister callback it is handed
 * back:
 *
 *     useEffect(() => { if (subscribe) register(id) }, [subscribe])
 *     // ^ never returns register()'s cleanup
 *
 * `AnimatePresence` only unmounts a child once *every* registered id has
 * reported exit-complete, so a registration whose component is gone is a
 * permanent block. Every `motion` element with `layout` or `layoutId` renders
 * a `MeasureLayout`, and `MeasureLayout` uses that hook — so simply changing
 * a `Segmented` (its active indicator is a `layoutId` element that unmounts
 * and remounts) poisons the surrounding overlay: it can animate out, but it
 * can never leave the DOM, and a full-viewport `role="dialog"` stays behind.
 *
 * Content inside an overlay has nothing to gain from that exit pass — it goes
 * away with the panel that carries it. A null `PresenceContext` is
 * framer-motion's own "there is no AnimatePresence above me" state, so
 * nothing inside can register, and the decision to unmount stays with the two
 * elements that actually animate out: the backdrop wrapper and the panel.
 */
export function PresenceBoundary({ children }: { children: ReactNode }) {
  return <PresenceContext.Provider value={null}>{children}</PresenceContext.Provider>;
}
