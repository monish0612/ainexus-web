// Browser → backend → Telegram log relay.
//
// The Telegram bot token lives ONLY on the server, so the browser can never
// leak it. This module ships runtime errors the backend can't otherwise see
// (render crashes, unhandled rejections, failed queries) to /api/v1/client-log,
// which forwards them to the same Telegram channel as the backend logger.
//
// Hardened: never throws, deduplicates a burst of identical errors, drops while
// offline, caps payload size, and uses a raw keepalive fetch (NOT the axios
// client) so it bypasses retries/auth and survives page unload — and so a
// logging failure can never recurse back into the logger.

// Derived from the deploy subpath (BASE_URL = '/nexusai/') so it hits the
// same-origin nginx proxy regardless of where the app is mounted.
const ENDPOINT = `${import.meta.env.BASE_URL}api/v1/client-log`.replace(
  /([^:])\/{2,}/g,
  '$1/',
);
const DEDUPE_MS = 10_000;
const MAX_KEYS = 80;

const _recent = new Map<string, number>();

export type ClientLogLevel = 'info' | 'warn' | 'error';

interface LogOptions {
  level?: ClientLogLevel;
  context?: string;
  stack?: string;
}

export function logClient(message: string, opts: LogOptions = {}): void {
  try {
    const msg = (message ?? '').toString().slice(0, 600).trim();
    if (!msg) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const now = Date.now();
    const key = `${opts.context ?? ''}|${msg.slice(0, 140)}`;
    const last = _recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    _recent.set(key, now);
    if (_recent.size > MAX_KEYS) {
      for (const [k, t] of _recent) if (now - t > DEDUPE_MS) _recent.delete(k);
    }

    const body = JSON.stringify({
      level: opts.level ?? 'error',
      message: msg,
      context: opts.context ?? '',
      url: typeof location !== 'undefined' ? location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      stack: opts.stack ?? '',
    });

    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow — logging must never surface an error */
    });
  } catch {
    /* never throw from the logger */
  }
}

/** Wire window-level error + promise-rejection handlers (call once at boot). */
export function installGlobalErrorLogging(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (e: ErrorEvent) => {
    const stack =
      e.error?.stack || `${e.filename ?? ''}:${e.lineno ?? ''}:${e.colno ?? ''}`;
    logClient(e.message || 'Uncaught error', {
      context: 'window.onerror',
      stack,
    });
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    const msg = reason?.message || String(e.reason ?? 'Unhandled rejection');
    logClient(msg, { context: 'unhandledrejection', stack: reason?.stack });
  });
}
