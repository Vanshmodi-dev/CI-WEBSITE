import 'server-only';

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { buildToken, checkToken, type TokenResult } from '@/lib/token';

/**
 * Keyed hashing and form-token signing. node:crypto only — no dependency.
 *
 * SECRET HANDLING: everything here needs ENQUIRY_SECRET. It is read from the
 * environment, never prefixed NEXT_PUBLIC_, and never logged. If it is absent
 * in production we throw rather than falling back to a default, because a
 * predictable key makes both the IP hash and the form token forgeable.
 *
 * The parsing and timing rules live in token.ts so they can be unit-tested
 * without a secret.
 */

let devSecret: string | undefined;

function secret(): string {
  const value = process.env.ENQUIRY_SECRET;
  if (value && value.length >= 32) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENQUIRY_SECRET is missing or shorter than 32 characters. Generate one with: openssl rand -base64 32',
    );
  }

  // Development only, and deliberately per-process: restarting the dev server
  // invalidates outstanding tokens, which is the right trade for never
  // shipping a hardcoded key.
  devSecret ??= randomBytes(32).toString('hex');
  return devSecret;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

/** Constant-time comparison of two equal-length hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Pseudonymise a client IP for rate limiting.
 *
 * The raw address is never stored. The hash is KEYED, so it cannot be reversed
 * with a precomputed table of the IPv4 space — an unkeyed SHA-256 of an IP is
 * trivially reversible and would not count as pseudonymisation.
 */
export function hashIp(ip: string): string {
  return createHmac('sha256', secret()).update(`ip:${ip}`).digest('hex');
}

/** Signed, time-stamped token embedded in the enquiry form. */
export function issueFormToken(now: number = Date.now()): string {
  return buildToken(now, sign);
}

export function verifyFormToken(
  token: string,
  now: number = Date.now(),
): TokenResult {
  return checkToken(token, sign, safeEqualHex, now);
}
