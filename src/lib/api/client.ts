import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { getToken } from '@/features/auth/token';

// All calls are same-origin: the Vite dev proxy / production nginx forward
// `/api/*` to the backend, so there is no CORS or mixed-content problem.
export const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 90_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the server-issued JWT (when present) to every request. Harmless while
// backend auth enforcement is off; required once it is turned on.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token && config.headers && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

function isRetryable(error: AxiosError): boolean {
  if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
    return true;
  }
  const status = error.response?.status;
  return status != null && RETRYABLE_STATUS.has(status);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Exponential backoff with jitter — mirrors the Dio _RetryInterceptor.
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;

    // A 401 means our token is missing/expired/invalid (only possible once the
    // backend enforces auth). Drop it and signal the app to return to login.
    // The login call itself is exempt so a bad-credential 401 doesn't loop.
    if (
      error.response?.status === 401 &&
      !config?.url?.includes('/auth/app-login')
    ) {
      try {
        localStorage.removeItem('nxs_jwt');
        window.dispatchEvent(new CustomEvent('nxs:unauthorized'));
      } catch {
        /* ignore */
      }
      throw error;
    }

    if (!config || !isRetryable(error)) throw error;

    config._retryCount = (config._retryCount ?? 0) + 1;
    if (config._retryCount > MAX_RETRIES) throw error;

    const base = Math.min(500 * 2 ** (config._retryCount - 1), 8000);
    const jitter = Math.random() * 0.3 * base;
    await sleep(base + jitter);
    return api(config);
  },
);

/** Normalize a backend error into a readable message. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    return data?.error || data?.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
