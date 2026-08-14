import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from 'js-sha256';
import {
  authenticate,
  readSession,
  clearSession,
  expireSession,
  isSessionExpired,
  MAX_SESSION_DAYS,
} from './authService';

const HMAC_KEY = 'nxAi$7kR2_mP9xL4q8W';
const PASSWORD = 'Chennaisuper.23';
const toHex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearSession();
});

describe('authService HTTP (insecure-context) fallback', () => {
  const forceInsecureContext = () => {
    vi.stubGlobal('crypto', { subtle: undefined } as unknown as Crypto);
  };

  it('logs in with the rotated password when crypto.subtle is unavailable', async () => {
    forceInsecureContext();
    await expect(authenticate('monish', PASSWORD)).resolves.toBe(true);
    expect(readSession().authenticated).toBe(true);
    expect(readSession().sessionExpired).toBe(false);
  });

  it('is tolerant of username case + surrounding whitespace', async () => {
    forceInsecureContext();
    await expect(authenticate('  MONISH  ', PASSWORD)).resolves.toBe(true);
  });

  it('rejects the previous rotated password', async () => {
    forceInsecureContext();
    await expect(
      authenticate('monish', 'Tundra-Lantern-Zephyr-20'),
    ).resolves.toBe(false);
    expect(readSession().authenticated).toBe(false);
  });

  it('rejects a wrong password without creating a session', async () => {
    forceInsecureContext();
    await expect(authenticate('monish', 'wrong-pass')).resolves.toBe(false);
    expect(readSession().authenticated).toBe(false);
  });

  it('rejects an unknown username', async () => {
    forceInsecureContext();
    await expect(authenticate('attacker', PASSWORD)).resolves.toBe(false);
  });
});

describe('authService secure-context (HTTPS) path', () => {
  it('logs in with correct credentials when crypto.subtle is present', async () => {
    if (!(globalThis.crypto && globalThis.crypto.subtle)) {
      return;
    }
    await expect(authenticate('monish', PASSWORD)).resolves.toBe(true);
  });
});

describe('45-day session expiry', () => {
  it('isSessionExpired is false just under 45 days and true at 45', () => {
    const start = Date.parse('2026-01-01T10:00:00.000Z');
    expect(isSessionExpired('2026-01-01T10:00:00.000Z', start)).toBe(false);
    expect(
      isSessionExpired(
        '2026-01-01T10:00:00.000Z',
        start + (MAX_SESSION_DAYS - 0.01) * 86_400_000,
      ),
    ).toBe(false);
    expect(
      isSessionExpired(
        '2026-01-01T10:00:00.000Z',
        start + MAX_SESSION_DAYS * 86_400_000,
      ),
    ).toBe(true);
  });

  it('readSession expires a 46-day-old session but keeps the username', async () => {
    await authenticate('monish', PASSWORD);
    const old = new Date(Date.now() - 46 * 86_400_000).toISOString();
    localStorage.setItem('nxs_session_ts', old);
    localStorage.setItem('nxs_jwt', 'stale-jwt');

    const state = readSession();
    expect(state.authenticated).toBe(false);
    expect(state.sessionExpired).toBe(true);
    expect(state.username).toBe('Monish');
    expect(localStorage.getItem('nxs_session_v2')).toBeNull();
    expect(localStorage.getItem('nxs_jwt')).toBeNull();
    expect(localStorage.getItem('nxs_session_expired')).toBe('1');
  });

  it('re-entering the same password after expiry resets the 45-day clock', async () => {
    await authenticate('monish', PASSWORD);
    localStorage.setItem(
      'nxs_session_ts',
      new Date(Date.now() - 46 * 86_400_000).toISOString(),
    );
    expect(readSession().sessionExpired).toBe(true);

    await expect(authenticate('monish', PASSWORD)).resolves.toBe(true);
    const state = readSession();
    expect(state.authenticated).toBe(true);
    expect(state.sessionExpired).toBe(false);
    expect(localStorage.getItem('nxs_session_expired')).toBeNull();
  });

  it('expireSession keeps username; clearSession wipes it', async () => {
    await authenticate('monish', PASSWORD);
    expireSession();
    expect(readSession()).toEqual({
      authenticated: false,
      username: 'Monish',
      sessionExpired: true,
    });
    clearSession();
    expect(readSession()).toEqual({
      authenticated: false,
      username: '',
      sessionExpired: false,
    });
  });
});

describe('pure-JS HMAC matches standard HMAC-SHA256', () => {
  const KNOWN_GOOD_MONISH =
    '3e381f2c83eea5cc93fe174957831af32b2e8e24126c772ee0f92b23333c831d';

  it('double-pass HMAC-SHA256 of "monish" equals the native reference', () => {
    const jsFirst = sha256.hmac.array(HMAC_KEY, 'monish');
    const jsSecond = sha256.hmac.array(HMAC_KEY, new Uint8Array(jsFirst));
    const jsHex = toHex(new Uint8Array(jsSecond));

    expect(jsHex).toBe(KNOWN_GOOD_MONISH);
  });
});
