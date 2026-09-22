import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { spring } from '@/lib/motion';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  info: (m: string) => useToastStore.getState().push('info', m),
};

const ICONS = {
  success: <CheckCircle2 size={18} className="text-emerald-400" />,
  error: <XCircle size={18} className="text-red-400" />,
  info: <Info size={18} className="text-accent-text" />,
};

export function ToastViewport() {
  const { toasts, dismiss } = useToastStore();
  return (
    // The live region has to exist in the DOM *before* a toast is inserted,
    // otherwise assistive tech never announces it. Toasts are the only error
    // feedback most AI failures get, so this is the whole announcement path.
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={spring.default}
            onClick={() => dismiss(t.id)}
            className="card pointer-events-auto flex max-w-md cursor-pointer items-center gap-3 border-line2 bg-bg1/95 px-4 py-3 shadow-card active:scale-[0.98]"
          >
            <span className="shrink-0">{ICONS[t.kind]}</span>
            <span className="text-sm text-fg">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
