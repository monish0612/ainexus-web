import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { spring, standard } from '@/lib/motion';
import { PresenceBoundary } from './PresenceBoundary';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** 'center' for a desktop dialog, 'sheet' for a mobile bottom-sheet feel. */
  variant?: 'center' | 'sheet';
  maxWidth?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  variant = 'center',
  maxWidth = 'max-w-lg',
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Focus trap + focus restore. A dialog that leaves focus behind on the page
  // underneath is unusable with a keyboard or a screen reader.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const start = items[0];
      const end = items[items.length - 1];
      if (e.shiftKey && document.activeElement === start) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        start.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, pointerEvents: 'auto' }}
          // A dialog on its way out must stop swallowing clicks the moment it
          // starts fading, not when the exit animation finishes — the node is
          // still full-screen and still mounted for the whole slide-out.
          exit={{ opacity: 0, pointerEvents: 'none' }}
          transition={standard.enter}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title != null ? titleId : undefined}
            tabIndex={-1}
            className={`card relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden border-line bg-bg1 shadow-card outline-none ${maxWidth} ${
              variant === 'sheet'
                ? 'rounded-b-none sm:rounded-3xl'
                : 'rounded-3xl'
            }`}
            initial={
              variant === 'sheet'
                ? { y: '100%' }
                : { y: 24, scale: 0.97, opacity: 0 }
            }
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={
              variant === 'sheet'
                ? { y: '100%' }
                : { y: 24, scale: 0.97, opacity: 0 }
            }
            transition={spring.default}
          >
            <PresenceBoundary>
              {title != null && (
                <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                  <h2 id={titleId} className="text-lg font-bold text-fg">
                    {title}
                  </h2>
                  <button
                    type="button"
                    onClick={onClose}
                    className="icon-btn -mr-2 rounded-full"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </PresenceBoundary>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
