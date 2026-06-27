import { create } from 'zustand';
import {
  authenticate as doAuth,
  clearSession,
  readSession,
} from '@/features/auth/authService';
import { fetchAppToken, dropAppToken } from '@/lib/api/auth';

interface AuthStore {
  authenticated: boolean;
  username: string;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const initial = readSession();

export const useAuthStore = create<AuthStore>((set) => ({
  authenticated: initial.authenticated,
  username: initial.username,
  login: async (username, password) => {
    const ok = await doAuth(username, password);
    if (ok) {
      // Best-effort: exchange the validated creds for a server JWT used to
      // authorize data calls. Never blocks login if the backend is down.
      await fetchAppToken(username, password);
      set(readSession());
    }
    return ok;
  },
  logout: () => {
    clearSession();
    dropAppToken();
    set({ authenticated: false, username: '' });
  },
}));
