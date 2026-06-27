// Faithful port of lib/core/auth/auth_service.dart — same credentials, same
// double-pass HMAC-SHA256 verification, same 45-day session, using Web Crypto.
// (Browser secret obfuscation matches the app; this is a single-user gate, not
// a server account — the data APIs are global.)

const SESSION_KEY = 'nxs_session_v2';
const SESSION_TS_KEY = 'nxs_session_ts';
const USERNAME_KEY = 'nxs_username';
const JWT_KEY = 'nxs_jwt';
const HMAC_KEY = 'nxAi$7kR2_mP9xL4q8W';
const MAX_SESSION_DAYS = 45;

// Credential fragments — base64-encoded, split for obfuscation (as in the app).
const UF = ['bW9u', 'aXNo'];
const PF = ['Q2hlbm5h', 'aXN1cGVyLjIz'];

const enc = new TextEncoder();

function b64decode(s: string): string {
  return decodeURIComponent(escape(atob(s)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacRaw(msg: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(HMAC_KEY) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, msg as BufferSource);
  return new Uint8Array(sig);
}

/** Double-pass HMAC-SHA256 (hex), matching the Dart implementation. */
async function hmac(input: string): Promise<string> {
  const first = await hmacRaw(enc.encode(input));
  const second = await hmacRaw(first);
  return toHex(second);
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function titleCase(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

export interface SessionState {
  authenticated: boolean;
  username: string;
}

function isExpired(): boolean {
  const ts = localStorage.getItem(SESSION_TS_KEY);
  if (!ts) return true;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return true;
  const days = (Date.now() - t) / 86_400_000;
  return days >= MAX_SESSION_DAYS;
}

/** Read stored session on load; auto-expire after 45 days. */
export function readSession(): SessionState {
  const token = localStorage.getItem(SESSION_KEY);
  if (!token || isExpired()) {
    if (token) clearSession();
    return { authenticated: false, username: '' };
  }
  return {
    authenticated: true,
    username: localStorage.getItem(USERNAME_KEY) || '',
  };
}

export async function authenticate(
  username: string,
  password: string,
): Promise<boolean> {
  const expectedU = await hmac(b64decode(UF.join('')));
  const expectedP = await hmac(b64decode(PF.join('')));
  const inputU = await hmac(username.trim().toLowerCase());
  const inputP = await hmac(password);

  const validUser = constantTimeEquals(inputU, expectedU);
  const validPass = constantTimeEquals(inputP, expectedP);
  if (!validUser || !validPass) return false;

  const now = new Date();
  const session = await hmac(`session:${now.toISOString()}`);
  const displayName = titleCase(username.trim());
  localStorage.setItem(SESSION_KEY, session);
  localStorage.setItem(SESSION_TS_KEY, now.toISOString());
  localStorage.setItem(USERNAME_KEY, displayName);
  return true;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_TS_KEY);
  localStorage.removeItem(USERNAME_KEY);
  // Expiring the client session must also drop the server token so a stale JWT
  // can't linger after the 45-day gate closes.
  localStorage.removeItem(JWT_KEY);
}

export function firstName(username: string): string {
  return username.trim().split(/\s+/)[0] ?? '';
}
