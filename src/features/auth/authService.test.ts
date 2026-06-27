import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from 'js-sha256';
import { authenticate, readSession, clearSession } from './authService';

// Mirror of the private constant in authService for the equivalence check.
const HMAC_KEY = 'nxAi$7kR2_mP9xL4q8W';
const toHex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');

afterEach(() => {
  vi.unstubAllGlobals();
  clearSession();
});

describe('authService HTTP (insecure-context) fallback', () => {
  // Simulate plain-HTTP: crypto.subtle is undefined off a secure context.
  const forceInsecureContext = () => {
    vi.stubGlobal('crypto', { subtle: undefined } as unknown as Crypto);
  };

  it('logs in with correct credentials when crypto.subtle is unavailable', async () => {
    forceInsecureContext();
    await expect(authenticate('monish', 'Chennaisuper.23')).resolves.toBe(true);
    // Session must be persisted so a refresh stays logged in.
    expect(readSession().authenticated).toBe(true);
  });

  it('is tolerant of username case + surrounding whitespace', async () => {
    forceInsecureContext();
    await expect(authenticate('  MONISH  ', 'Chennaisuper.23')).resolves.toBe(
      true,
    );
  });

  it('rejects a wrong password without creating a session', async () => {
    forceInsecureContext();
    await expect(authenticate('monish', 'wrong-pass')).resolves.toBe(false);
    expect(readSession().authenticated).toBe(false);
  });

  it('rejects an unknown username', async () => {
    forceInsecureContext();
    await expect(authenticate('attacker', 'Chennaisuper.23')).resolves.toBe(
      false,
    );
  });
});

describe('authService secure-context (HTTPS) path', () => {
  it('logs in with correct credentials when crypto.subtle is present', async () => {
    if (!(globalThis.crypto && globalThis.crypto.subtle)) {
      // Environment without WebCrypto subtle — fallback path already covered.
      return;
    }
    await expect(authenticate('monish', 'Chennaisuper.23')).resolves.toBe(true);
  });
});

describe('pure-JS HMAC matches standard HMAC-SHA256', () => {
  // Known-good double-pass HMAC-SHA256 of "monish" under HMAC_KEY, produced by
  // Node's crypto (== Web-Crypto subtle). Proves the js-sha256 fallback yields
  // byte-identical hashes to the native path, so a session minted on HTTPS
  // stays valid when served over HTTP.
  const KNOWN_GOOD_MONISH =
    '3e381f2c83eea5cc93fe174957831af32b2e8e24126c772ee0f92b23333c831d';

  it('double-pass HMAC-SHA256 of "monish" equals the native reference', () => {
    const jsFirst = sha256.hmac.array(HMAC_KEY, 'monish');
    const jsSecond = sha256.hmac.array(HMAC_KEY, new Uint8Array(jsFirst));
    const jsHex = toHex(new Uint8Array(jsSecond));

    expect(jsHex).toBe(KNOWN_GOOD_MONISH);
  });
});
