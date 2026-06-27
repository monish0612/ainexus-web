// Server-issued JWT for the shared data API. Obtained from POST /auth/app-login
// after the client-side credential gate passes, attached to every API request,
// and cleared on logout / 401. Kept in its own tiny module so both the axios
// client and the auth store can touch it without import cycles.

const TOKEN_KEY = 'nxs_jwt';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage disabled — token simply won't persist */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
