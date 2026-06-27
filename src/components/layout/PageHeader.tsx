import { ReactNode } from 'react';
import clsx from 'clsx';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, tabs }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-[var(--header-bg)]/85 backdrop-blur">
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
}: {
  value: T;
  tabs: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition',
            value === t.value
              ? 'bg-fg text-bg'
              : 'bg-bg2 text-fg2 hover:bg-bg3 hover:text-fg',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
