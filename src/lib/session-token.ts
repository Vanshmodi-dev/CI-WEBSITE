/**
 * Admin session token format — PURE, so it can be unit-tested.
 *
 * Split from the module that holds the signing key, exactly as token.ts was
 * split from crypto.ts. Security logic that cannot be tested is security logic
 * nobody has checked.
 *
 * Format: "<adminId>.<expiresAtMs>.<hmac hex>"
 *
 * The token is a BEARER credential: whoever holds it is the admin. It is
 * therefore only ever sent in an HttpOnly, SameSite=Lax, Secure cookie, and
 * never placed in a URL, a body, or client-readable storage.
 */

export type Signer = (payload: string) => string;
export type Comparer = (a: string, b: string) => boolean;

/** Eight hours. Long enough for a working day, short enough to limit theft. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type SessionFailure = 'malformed' | 'bad-signature' | 'expired';

export type SessionResult =
  | { ok: true; adminId: string; expiresAt: number }
  | { ok: false; reason: SessionFailure };

/** cuid-ish: letters and digits only, so it cannot contain our separator. */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function buildSessionToken(
  adminId: string,
  expiresAt: number,
  sign: Signer,
): string {
  if (!ID_PATTERN.test(adminId)) {
    throw new Error('Refusing to sign a session for a malformed admin id.');
  }
  return `${adminId}.${expiresAt}.${sign(`session:${adminId}:${expiresAt}`)}`;
}

export function readSessionToken(
  token: string,
  sign: Signer,
  compare: Comparer,
  now: number,
): SessionResult {
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [adminId, expiresRaw, signature] = parts;
  if (!adminId || !expiresRaw || !signature) {
    return { ok: false, reason: 'malformed' };
  }
  if (!ID_PATTERN.test(adminId)) return { ok: false, reason: 'malformed' };
  if (!/^\d{10,16}$/.test(expiresRaw)) return { ok: false, reason: 'malformed' };
  if (!/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: 'malformed' };

  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt)) return { ok: false, reason: 'malformed' };

  // Signature first, always. An attacker must learn nothing about expiry
  // handling from a token they could not have signed.
  if (!compare(signature, sign(`session:${adminId}:${expiresAt}`))) {
    return { ok: false, reason: 'bad-signature' };
  }

  if (now >= expiresAt) return { ok: false, reason: 'expired' };

  return { ok: true, adminId, expiresAt };
}
