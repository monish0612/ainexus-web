import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cloud, GraduationCap, Newspaper, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { firstName } from '@/features/auth/authService';
import { SettingsDrawer } from '@/features/settings/SettingsDrawer';

const NAV = [
  { to: '/expense', label: 'Expense', icon: Wallet },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/tutor', label: 'Tutor', icon: GraduationCap },
  { to: '/cloud', label: 'Cloud', icon: Cloud },
];

function Avatar({ onClick }: { onClick: () => void }) {
  const username = useAuthStore((s) => s.username);
  const initial = (firstName(username)[0] || 'N').toUpperCase();
  return (
    <button
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white shadow-glow ring-2 ring-accent/30 transition hover:scale-105"
      aria-label="Open settings"
    >
      {initial}
    </button>
  );
}

function Sidebar() {
  const openSettings = useUiStore((s) => s.openSettings);
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-bg1/60 px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 font-black text-white">
          N
        </div>
        <div>
          <p className="text-base font-extrabold tracking-tight text-fg">Nexus AI</p>
          <p className="text-xs text-fg3">All-in-one workspace</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition',
                isActive
                  ? 'bg-bg3 text-fg'
                  : 'text-fg3 hover:bg-bg2 hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="side-active"
                    className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-accent"
                  />
                )}
                <Icon size={20} strokeWidth={2.2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={openSettings}
        className="mt-2 flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-fg3 transition hover:bg-bg2 hover:text-fg"
      >
        <Avatar onClick={openSettings} />
        <span>Settings</span>
      </button>
    </aside>
  );
}

function MobileHeader() {
  const openSettings = useUiStore((s) => s.openSettings);
  const location = useLocation();
  const title = NAV.find((n) => location.pathname.startsWith(n.to))?.label ?? 'Nexus AI';
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-[var(--header-bg)]/90 px-4 backdrop-blur lg:hidden">
      <Avatar onClick={openSettings} />
      <h1 className="text-base font-bold text-fg">{title}</h1>
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-xs font-black text-white">
        N
      </div>
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-40 flex h-16 items-stretch border-t border-line bg-[var(--nav-bg)] backdrop-blur lg:hidden">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              'relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition',
              isActive ? 'text-fg' : 'text-fg4',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
              <span>{label}</span>
              {isActive && (
                <motion.span
                  layoutId="bottom-active"
                  className="absolute bottom-1.5 h-1 w-1 rounded-full bg-accent"
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { settingsOpen, closeSettings } = useUiStore();
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg text-fg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <BottomNav />
      </div>
      <SettingsDrawer open={settingsOpen} onClose={closeSettings} />
    </div>
  );
}
