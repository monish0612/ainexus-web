// Robust fire-and-forget persistence with a bounded retry queue + Telegram
// logging. The web mirror of the Flutter SavedSearchStore's `_RetryItem`
// queue: a chat-message / save POST is attempted immediately (the axios
// client already does network-level exponential backoff), and if it still
// fails it is re-queued and replayed on a timer + on `online` /
// `visibilitychange` events so a transient outage never silently drops a
// user's follow-up. Terminal failures (queue exhausted) are reported to the
// same Telegram channel as the rest of the app via `logClient`.
//
// Design notes:
//   • Tasks are plain `() => Promise<unknown>` thunks so callers keep full
//     control over the request shape — this helper only owns retry+logging.
//   • The queue is bounded (oldest dropped first) so a persistently-offline
//     user can never grow it without limit.
//   • Idempotency is the CALLER's responsibility. Every persistence endpoint
//     used here is an upsert keyed on a client-generated id, so replaying a
//     task is always safe.

import { logClient } from '@/lib/logger';

interface Task {
  label: string;
  run: () => Promise<unknown>;
  attempts: number;
}

const MAX_ATTEMPTS = 6;
const MAX_QUEUE = 200;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30_000;

const queue: Task[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersWired = false;

/**
 * Persist something with automatic retry + Telegram logging on terminal
 * failure. Returns immediately (fire-and-forget). `label` is a short tag
 * used in the Telegram breadcrumb (e.g. `saved-search-chat`).
 */
export function persist(label: string, run: () => Promise<unknown>): void {
  wireListeners();
  void attempt({ label, run, attempts: 0 });
}

async function attempt(task: Task): Promise<void> {
  try {
    await task.run();
  } catch (err) {
    task.attempts += 1;
    if (task.attempts >= MAX_ATTEMPTS) {
      logClient(`persist gave up: ${task.label} (after ${task.attempts} attempts)`, {
        level: 'error',
        context: 'persistQueue',
        stack: err instanceof Error ? err.stack : String(err),
      });
      return;
    }
    enqueue(task);
  }
}

function enqueue(task: Task): void {
  // Bound memory: drop the OLDEST entry first (fresh writes are likelier to
  // still be worth retrying than stale ones).
  while (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(task);
  schedule();
}

function schedule(): void {
  if (timer || queue.length === 0) return;
  // Backoff keyed on the most-retried task currently queued.
  const maxAttempts = queue.reduce((m, t) => Math.max(m, t.attempts), 0);
  const delay = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, maxAttempts - 1), MAX_DELAY_MS);
  const jitter = Math.random() * 0.3 * delay;
  timer = setTimeout(flush, delay + jitter);
}

async function flush(): Promise<void> {
  timer = null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // Offline — re-arm and wait for reconnect / the next tick.
    schedule();
    return;
  }
  const batch = queue.splice(0, queue.length);
  for (const task of batch) {
    await attempt(task);
  }
}

function wireListeners(): void {
  if (listenersWired || typeof window === 'undefined') return;
  listenersWired = true;
  const kick = () => {
    if (queue.length > 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void flush();
    }
  };
  window.addEventListener('online', kick);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
}

/** Test-only: drains the queue synchronously-ish (awaits one flush pass). */
export async function __drainForTests(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await flush();
}

/** Test-only: current queue depth. */
export function __queueLength(): number {
  return queue.length;
}
