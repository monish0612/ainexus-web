import { create } from 'zustand';
import {
  authenticate as doAuth,
  clearSession,
  expireSession,
  readSession,
} from '@/features/auth/authService';
import { fetchAppToken, dropAppToken } from '@/lib/api/auth';

interface AuthStore {
  authenticated: boolean;
  username: string;
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: (opts?: { expired?: boolean }) => void;
}

const initial = readSession();

export const useAuthStore = create<AuthStore>((set) => ({
  authenticated: initial.authenticated,
  username: initial.username,
  sessionExpired: initial.sessionExpired,
  login: async (username, password) => {
    const ok = await doAuth(username, password);
    if (ok) {
      // Best-effort: exchange the validated creds for a server JWT used to
      // authorize data calls. Never blocks login if the backend is down.
      await fetchAppToken(username, password);
      set({ ...readSession(), sessionExpired: false });
    }
    return ok;
  },
  logout: (opts) => {
    if (opts?.expired) {
      expireSession();
      dropAppToken();
      set({
        authenticated: false,
        username: readSession().username,
        sessionExpired: true,
      });
      return;
    }
    clearSession();
    dropAppToken();
    set({ authenticated: false, username: '', sessionExpired: false });
  },
}));
