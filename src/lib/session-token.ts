/**
 * Admin session token format — PURE, so it can be unit-tested.
 *
 * Split from the module that holds the signing key, exactly as token.ts was
 * split from crypto.ts. Security logic that cannot be tested is security logic
 * nobody has checked.
 *
 * Format: "<adminId>.<issuedAtMs>.<expiresAtMs>.<hmac hex>"
 *
 * The token is a BEARER credential: whoever holds it is the admin. It is
 * therefore only ever sent in an HttpOnly, SameSite=Lax, Secure cookie, and
 * never placed in a URL, a body, or client-readable storage.
 *
 * -----------------------------------------------------------------------------
 * WHY `issuedAt` IS IN THE TOKEN (Phase 10)
 * -----------------------------------------------------------------------------
 * There is no server-side session record — the signature IS the session. That
 * is cheap and stateless, and it has one serious consequence: nothing can be
 * revoked. Signing out clears the cookie in the browser that asked and does
 * nothing to a copy of the token held anywhere else.
 *
 * Phase 10 proved that rather than assuming it: capture the cookie, sign out,
 * replay the cookie, reach the dashboard. A token that leaks — from a shared
 * machine, a proxy log, a backup — stays valid for its full eight hours no
 * matter what the admin does.
 *
 * `issuedAt` fixes that with one column instead of a session table. Each
 * account carries `sessionsValidFrom`; a token issued before that instant is
 * refused. Signing out moves it to now, which invalidates every outstanding
 * token for that account at once. That is the correct meaning for a
 * single-owner admin panel: "sign me out" means everywhere.
 */

export type Signer = (payload: string) => string;
export type Comparer = (a: string, b: string) => boolean;

/** Eight hours. Long enough for a working day, short enough to limit theft. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type SessionFailure = 'malformed' | 'bad-signature' | 'expired' | 'not-yet-valid';

export type SessionResult =
  | { ok: true; adminId: string; issuedAt: number; expiresAt: number }
  | { ok: false; reason: SessionFailure };

/** cuid-ish: letters and digits only, so it cannot contain our separator. */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Hard ceiling on the cookie we are willing to parse at all.
 *
 * The value is attacker-supplied. Every field below is length-bounded by its
 * own pattern, but bounding the whole string first means a megabyte of cookie
 * is discarded before any regex touches it.
 */
export const MAX_TOKEN_LENGTH = 256;

function payloadFor(adminId: string, issuedAt: number, expiresAt: number): string {
  return `session:${adminId}:${issuedAt}:${expiresAt}`;
}

export function buildSessionToken(
  adminId: string,
  issuedAt: number,
  expiresAt: number,
  sign: Signer,
): string {
  if (!ID_PATTERN.test(adminId)) {
    throw new Error('Refusing to sign a session for a malformed admin id.');
  }
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) {
    throw new Error('Refusing to sign a session with a non-integer timestamp.');
  }
  if (expiresAt <= issuedAt) {
    throw new Error('Refusing to sign a session that expires before it is issued.');
  }
  return `${adminId}.${issuedAt}.${expiresAt}.${sign(payloadFor(adminId, issuedAt, expiresAt))}`;
}

export function readSessionToken(
  token: string,
  sign: Signer,
  compare: Comparer,
  now: number,
): SessionResult {
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: 'malformed' };
  }

  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };

  const [adminId, issuedRaw, expiresRaw, signature] = parts;
  if (!adminId || !issuedRaw || !expiresRaw || !signature) {
    return { ok: false, reason: 'malformed' };
  }
  if (!ID_PATTERN.test(adminId)) return { ok: false, reason: 'malformed' };
  if (!/^\d{10,16}$/.test(issuedRaw)) return { ok: false, reason: 'malformed' };
  if (!/^\d{10,16}$/.test(expiresRaw)) return { ok: false, reason: 'malformed' };
  if (!/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: 'malformed' };

  const issuedAt = Number(issuedRaw);
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) {
    return { ok: false, reason: 'malformed' };
  }

  // Signature first, always. An attacker must learn nothing about expiry
  // handling from a token they could not have signed.
  if (!compare(signature, sign(payloadFor(adminId, issuedAt, expiresAt)))) {
    return { ok: false, reason: 'bad-signature' };
  }

  // A signed token claiming a lifetime longer than we ever issue is a signal
  // that the TTL constant changed under us, or that a token was minted by
  // something other than `buildSessionToken`. Refuse it either way.
  if (expiresAt - issuedAt > SESSION_TTL_MS) return { ok: false, reason: 'malformed' };
  if (now >= expiresAt) return { ok: false, reason: 'expired' };

  return { ok: true, adminId, issuedAt, expiresAt };
}

/**
 * Was this session issued after the account's revocation point?
 *
 * Kept here, next to the format it depends on, so the rule is testable without
 * a database. `validFrom` is `AdminUser.sessionsValidFrom`.
 */
export function isSessionRevoked(issuedAt: number, validFrom: number): boolean {
  return issuedAt < validFrom;
}
