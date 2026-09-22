import { ReactNode, useId } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { spring } from '@/lib/motion';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, tabs }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-[var(--header-bg)]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-content flex-col gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-fg sm:text-2xl">
              {title}
            </h1>
            {subtitle && <p className="mt-0.5 truncate text-sm text-fg3">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {tabs}
      </div>
    </div>
  );
}

export function SubTabs<T extends string>({
  value,
  tabs,
  onChange,
  label,
  panelId,
}: {
  value: T;
  tabs: { value: T; label: string }[];
  onChange: (v: T) => void;
  /** Names the tablist for screen readers. */
  label?: string;
  /** Base id of the panel each tab controls, e.g. `news-panel` →
   *  `news-panel-saved`. Omitted when the caller has no panel id to point at. */
  panelId?: string;
}) {
  // Per-instance so two SubTabs on one screen don't share an indicator.
  const groupId = useId();

  const move = (delta: number) => {
    const i = tabs.findIndex((t) => t.value === value);
    if (i < 0) return;
    const next = tabs[(i + delta + tabs.length) % tabs.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 py-0.5"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`${groupId}-${t.value}`}
            aria-selected={active}
            aria-controls={panelId ? `${panelId}-${t.value}` : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={clsx(
              'relative inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 py-2.5 text-sm font-semibold',
              'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-accent/40',
              active ? 'text-bg' : 'bg-bg2 text-fg2 hover:bg-bg3 hover:text-fg active:scale-[0.96]',
            )}
          >
            {active && (
              <motion.span
                layoutId={groupId}
                transition={spring.fast}
                aria-hidden
                className="absolute inset-0 rounded-full bg-fg"
              />
            )}
            <span className="relative z-10">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
