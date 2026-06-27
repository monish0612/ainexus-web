import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** 'center' for a desktop dialog, 'sheet' for a mobile bottom-sheet feel. */
  variant?: 'center' | 'sheet';
  maxWidth?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  variant = 'center',
  maxWidth = 'max-w-lg',
}: ModalProps) {
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

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className={`card relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden border-line bg-bg1 ${maxWidth} ${
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
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            {title != null && (
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-lg font-bold text-fg">{title}</h2>
                <button
                  onClick={onClose}
                  className="rounded-full p-1.5 text-fg3 transition hover:bg-bg3 hover:text-fg"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
