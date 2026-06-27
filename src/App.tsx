import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';
import { AppShell } from './components/layout/AppShell';
import { ToastViewport } from './components/ui/toast';
import { Spinner } from './components/ui/primitives';

const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const ExpensePage = lazy(() => import('./features/expense/ExpensePage'));
const NewsPage = lazy(() => import('./features/news/NewsPage'));
const TutorPage = lazy(() => import('./features/tutor/TutorPage'));
const CloudPage = lazy(() => import('./features/cloud/CloudPage'));

function PageFallback() {
  return (
    <div className="grid h-full place-items-center text-fg3">
      <Spinner size={28} />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const authed = useAuthStore((s) => s.authenticated);
  if (!authed) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const authed = useAuthStore((s) => s.authenticated);
  const logout = useAuthStore((s) => s.logout);
  const syncFromServer = useSettingsStore((s) => s.syncFromServer);

  useEffect(() => {
    if (authed) syncFromServer();
  }, [authed, syncFromServer]);

  // The axios client fires this when a data call returns 401 (token expired /
  // auth enforcement turned on without a valid token) → return to login.
  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('nxs:unauthorized', onUnauthorized);
    return () => window.removeEventListener('nxs:unauthorized', onUnauthorized);
  }, [logout]);

  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route
            path="/login"
            element={authed ? <Navigate to="/expense" replace /> : <LoginPage />}
          />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/expense/*" element={<ExpensePage />} />
            <Route path="/news/*" element={<NewsPage />} />
            <Route path="/tutor/*" element={<TutorPage />} />
            <Route path="/cloud/*" element={<CloudPage />} />
          </Route>
          <Route path="*" element={<Navigate to={authed ? '/expense' : '/login'} replace />} />
        </Routes>
      </Suspense>
      <ToastViewport />
    </>
  );
}
