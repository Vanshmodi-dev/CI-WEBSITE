/**
 * Form-token format and timing rules — PURE.
 *
 * Split out of crypto.ts so this can be unit-tested. crypto.ts holds the
 * secret and is 'server-only'; this holds the parsing and timing logic and
 * takes the signer as an argument. Security-critical logic that cannot be
 * tested is security-critical logic nobody has checked.
 *
 * Token format: "<issuedAtMs>.<64 hex chars>"
 */

export type Signer = (payload: string) => string;
/** Injected so the comparison stays constant-time in production. */
export type Comparer = (a: string, b: string) => boolean;

export const MIN_ELAPSED_MS = 2_500;
export const MAX_ELAPSED_MS = 6 * 60 * 60 * 1000;

export type TokenFailure =
  | 'malformed'
  | 'bad-signature'
  | 'too-fast'
  | 'expired';

export type TokenResult =
  | { ok: true; ageMs: number }
  | { ok: false; reason: TokenFailure };

export function buildToken(issuedAt: number, sign: Signer): string {
  return `${issuedAt}.${sign(`form:${issuedAt}`)}`;
}

export function checkToken(
  token: string,
  sign: Signer,
  compare: Comparer,
  now: number,
): TokenResult {
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };

  const separator = token.indexOf('.');
  if (separator <= 0) return { ok: false, reason: 'malformed' };

  const issuedRaw = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!/^\d{10,16}$/.test(issuedRaw) || !/^[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, reason: 'malformed' };
  }

  const issuedAt = Number(issuedRaw);
  if (!Number.isSafeInteger(issuedAt)) return { ok: false, reason: 'malformed' };

  // Signature is checked BEFORE the clock. An attacker must not be able to
  // learn anything about timing rules using an unsigned token.
  if (!compare(signature, sign(`form:${issuedAt}`))) {
    return { ok: false, reason: 'bad-signature' };
  }

  const ageMs = now - issuedAt;
  // A negative age is a forged future timestamp or clock skew. Treated as
  // too-fast rather than trusted.
  if (ageMs < MIN_ELAPSED_MS) return { ok: false, reason: 'too-fast' };
  if (ageMs > MAX_ELAPSED_MS) return { ok: false, reason: 'expired' };

  return { ok: true, ageMs };
}
