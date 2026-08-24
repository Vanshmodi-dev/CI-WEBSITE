import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with scrypt from node:crypto.
 *
 * WHY NOT A LIBRARY. argon2 and bcrypt both need a native module. scrypt is
 * memory-hard, is in the Node standard library, is an RFC (7914), and is
 * accepted for password storage. For one seeded admin account, adding a native
 * build step to the deploy pipeline buys nothing. This is a considered choice,
 * not a shortcut — see docs/PHASE-5-REPORT.md.
 *
 * Encoded form: scrypt$N$r$p$<salt base64>$<hash base64>
 * The parameters travel with the hash, so they can be raised later without
 * invalidating existing passwords.
 */

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** OWASP-suggested floor for scrypt: N=2^17, r=8, p=1. */
export const SCRYPT_PARAMS = { N: 131072, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// N * r * 128 * 2 with headroom — scrypt throws if maxmem is too small.
const MAXMEM = 256 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Upper bounds on what an unauthenticated endpoint will even look at.
 *
 * scrypt's cost is dominated by N rather than by input length, so a long
 * password is not itself expensive to hash - but normalize('NFKC') on a
 * megabyte of text is, the string has to be parsed out of the request first,
 * and none of that work is anything a real person needs. 200 characters is far
 * beyond any passphrase a human types; 254 is the practical maximum length of
 * an email address.
 */
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_EMAIL_LENGTH = 254;

export function hashFormat(
  N: number,
  r: number,
  p: number,
  salt: Buffer,
  hash: Buffer,
): string {
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export type ParsedHash = {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
};

/** Returns null for anything that is not a well-formed scrypt string. */
export function parseHash(encoded: string): ParsedHash | null {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (parts.length !== 6) return null;
  const [scheme, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  if (scheme !== 'scrypt') return null;

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isSafeInteger(N) || N < 1024) return null;
  if (!Number.isSafeInteger(r) || r < 1) return null;
  if (!Number.isSafeInteger(p) || p < 1) return null;

  try {
    const salt = Buffer.from(saltRaw ?? '', 'base64');
    const hash = Buffer.from(hashRaw ?? '', 'base64');
    if (salt.length < 8 || hash.length < 32) return null;
    return { N, r, p, salt, hash };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
  const salt = randomBytes(SALT_BYTES);
  const { N, r, p } = SCRYPT_PARAMS;
  const hash = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: MAXMEM,
  });
  return hashFormat(N, r, p, salt, hash);
}

/**
 * Constant-time verification.
 *
 * Never throws and never reveals WHY it failed — a caller that could tell
 * "no such user" from "wrong password" would leak which accounts exist.
 */
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  // Bounded before any work. A caller that skipped its own length check must
  // not be able to hand an unbounded string to NFKC and scrypt.
  if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  const parsed = parseHash(encoded);
  if (!parsed) return false;

  try {
    const candidate = await scryptAsync(
      password.normalize('NFKC'),
      parsed.salt,
      parsed.hash.length,
      { N: parsed.N, r: parsed.r, p: parsed.p, maxmem: MAXMEM },
    );
    if (candidate.length !== parsed.hash.length) return false;
    return timingSafeEqual(candidate, parsed.hash);
  } catch {
    return false;
  }
}
