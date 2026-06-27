import { api } from './client';
import { setToken, clearToken } from '@/features/auth/token';

// Exchange the typed credentials for a server-signed JWT. Best-effort: the
// client-side gate remains the source of truth for the session, so a backend
// outage here never blocks login (the app still works while auth enforcement is
// off; once enforced, a missing token surfaces as a 401 → re-login).
export async function fetchAppToken(
  username: string,
  password: string,
): Promise<boolean> {
  try {
    const { data } = await api.post('/auth/app-login', { username, password });
    if (data && typeof data.token === 'string' && data.token) {
      setToken(data.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function dropAppToken(): void {
  clearToken();
}
