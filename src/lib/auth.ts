import 'server-only';

import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { verifyPassword, MAX_PASSWORD_LENGTH, MAX_EMAIL_LENGTH } from '@/lib/password';
import {
  buildSessionToken,
  readSessionToken,
  isSessionRevoked,
  SESSION_TTL_MS,
} from '@/lib/session-token';
import { log, logUnexpected } from '@/lib/log';

/**
 * Admin authentication and authorisation — SERVER ONLY.
 *
 * THE AUTHORISATION RULE FOR THIS PROJECT: every admin page and every admin
 * mutation calls `requireAdmin()` itself. Middleware redirects unauthenticated
 * browsers for a decent user experience, but it is NOT the security boundary —
 * a Server Action can be invoked directly over HTTP without ever passing
 * through a page render, so the check has to live in the action.
 */

export const SESSION_COOKIE = 'ci_admin_session';

/**
 * SIGN-IN THROTTLE - per account, enforced BEFORE any password hashing.
 *
 * Phase 10 measured the previous design failing. The only throttle was keyed on
 * a hashed client IP taken from X-Forwarded-For, a header the client sets. A
 * password-guessing script that rotated that header got 12 out of 12 attempts
 * through untouched.
 *
 * Two things were wrong with that, not one:
 *
 *   1. UNLIMITED GUESSES against a real password.
 *   2. UNLIMITED SCRYPT. Each attempt costs the SERVER an N=2^17 hash -
 *      memory-hard by design, around 128 MB - and the code ran one even for an
 *      account that does not exist, to equalise timing. That turns the sign-in
 *      form into a memory-exhaustion amplifier for anyone who can set a header.
 *
 * The counter below is keyed on the ACCOUNT and stored in the database, so it
 * cannot be reset by changing a header, by spreading load across instances, or
 * by restarting the process. Crossing the threshold refuses the attempt BEFORE
 * the hash runs, which closes both problems at once.
 *
 * THE TRADE, STATED PLAINLY: someone who knows the admin's email can keep the
 * account throttled by submitting wrong passwords. That is a real availability
 * cost, and it is the accepted one - an attacker who can annoy the owner for
 * fifteen minutes at a time is a far smaller problem than an attacker who can
 * grind the password forever. Recovery is automatic; there is no manual unlock
 * to get wrong and nothing to support over the phone.
 *
 * The threshold is deliberately generous. A teacher mistyping a password twice
 * on a phone keyboard must never meet it.
 */
export const SIGNIN_THROTTLE = {
  maxFailures: 10,
  windowMs: 15 * 60_000,
} as const;

/**
 * A ceiling on sign-in work across the whole instance, whatever the account.
 *
 * The per-account counter cannot see attempts for addresses that have no
 * account, and those still reach the timing-equalisation hash. This bounds the
 * total. It is per-process and therefore not authoritative on a serverless
 * platform - it is the cheap layer that runs before any database round trip,
 * exactly like the enquiry burst limiter it mirrors.
 */
const GLOBAL_SIGNIN = { max: 60, windowMs: 60_000 };
let globalAttempts: number[] = [];

function globalSignInAllowed(now: number): boolean {
  const cutoff = now - GLOBAL_SIGNIN.windowMs;
  globalAttempts = globalAttempts.filter((t) => t > cutoff);
  if (globalAttempts.length >= GLOBAL_SIGNIN.max) return false;
  globalAttempts.push(now);
  return true;
}

/** Test seam - resets the per-instance sign-in ceiling. */
export function resetGlobalSignInState(): void {
  globalAttempts = [];
}

let devSecret: string | undefined;

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (value && value.length >= 32) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ADMIN_SESSION_SECRET is missing or shorter than 32 characters. Generate one with: openssl rand -base64 32',
    );
  }
  // Development only, per-process: restarting the dev server signs everyone
  // out, which is the right trade for never shipping a hardcoded key.
  devSecret ??= randomBytes(32).toString('hex');
  return devSecret;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export type AdminIdentity = {
  id: string;
  email: string;
  displayName: string;
};

/**
 * The current admin, or null.
 *
 * Re-reads the account on every call rather than trusting the cookie's claims,
 * so deactivating an account takes effect immediately instead of at the end of
 * an eight-hour session.
 */
export async function getCurrentAdmin(): Promise<AdminIdentity | null> {
  if (!isDatabaseConfigured()) return null;

  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const result = readSessionToken(raw, sign, safeEqualHex, Date.now());
  if (!result.ok) return null;

  try {
    const admin = await getPrisma().adminUser.findUnique({
      where: { id: result.adminId },
      select: {
        id: true,
        email: true,
        displayName: true,
        active: true,
        sessionsValidFrom: true,
      },
    });
    if (!admin || !admin.active) return null;

    // Revocation. A token signed before the account's cut-off is refused even
    // though its signature is valid and it has not expired. That is what makes
    // signing out mean something for a copy of the cookie held elsewhere.
    if (isSessionRevoked(result.issuedAt, admin.sessionsValidFrom.getTime())) {
      return null;
    }

    return { id: admin.id, email: admin.email, displayName: admin.displayName };
  } catch (error) {
    logUnexpected('admin.session.lookup_failed', error);
    return null;
  }
}

/**
 * Require an authenticated admin, or redirect to the sign-in page.
 *
 * Call this at the top of EVERY admin page and EVERY admin server action.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');
  return admin;
}

/**
 * Like requireAdmin, but for actions that want to return an error state rather
 * than redirect. Never leaks why authorisation failed.
 */
export async function requireAdminOrNull(): Promise<AdminIdentity | null> {
  return getCurrentAdmin();
}

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'unavailable' | 'throttled' };

/**
 * Verify credentials and start a session.
 *
 * Returns the SAME failure for an unknown email and a wrong password. Telling
 * them apart would let anyone enumerate which accounts exist.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<SignInResult> {
  if (!isDatabaseConfigured()) return { ok: false, reason: 'unavailable' };

  const now = Date.now();

  // Cheapest gate first: no database round trip, no hashing.
  if (!globalSignInAllowed(now)) {
    log.warn('admin.signin.global_throttle');
    return { ok: false, reason: 'throttled' };
  }

  // Bounded before anything reads it. An unbounded string from an
  // unauthenticated endpoint must never reach NFKC normalisation or scrypt.
  if (email.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    log.warn('admin.signin.oversized_input');
    return { ok: false, reason: 'invalid' };
  }

  const normalisedEmail = email.trim().toLowerCase();

  try {
    const prisma = getPrisma();
    const admin = await prisma.adminUser.findUnique({
      where: { email: normalisedEmail },
      select: {
        id: true,
        passwordHash: true,
        active: true,
        displayName: true,
        failedLoginCount: true,
        firstFailedLoginAt: true,
      },
    });

    // Per-account throttle, checked BEFORE hashing. This is the layer that
    // survives a rotated X-Forwarded-For and a restarted process.
    if (admin && withinThrottle(admin.failedLoginCount, admin.firstFailedLoginAt, now)) {
      log.warn('admin.signin.account_throttled', { adminId: admin.id });
      return { ok: false, reason: 'throttled' };
    }

    // Always run a verification, even with no account, so a missing account
    // and a wrong password take indistinguishable time.
    const stored =
      admin?.passwordHash ??
      'scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const passwordOk = await verifyPassword(password, stored);

    if (!admin || !admin.active || !passwordOk) {
      // Email is NOT logged — a failed sign-in log full of addresses is a
      // credential-stuffing list waiting to leak.
      log.warn('admin.signin.failed', { hadAccount: Boolean(admin) });
      if (admin) await recordFailure(admin.id, admin.firstFailedLoginAt, now);
      return { ok: false, reason: 'invalid' };
    }

    const issuedAt = now;
    const expiresAt = issuedAt + SESSION_TTL_MS;
    const token = buildSessionToken(admin.id, issuedAt, expiresAt, sign);

    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(expiresAt),
    });

    // A successful sign-in clears the failure run, so a teacher who mistyped
    // twice and then got it right starts from zero again.
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, firstFailedLoginAt: null },
    });

    log.info('admin.signin.ok', { adminId: admin.id });
    // A durable record of who signed in and when. The audit log stores the
    // actor and the shape of the event, never a credential and never an email.
    await recordAudit(
      { id: admin.id, email: normalisedEmail, displayName: admin.displayName },
      'signed_in',
      'AdminUser',
      admin.id,
    );
    return { ok: true };
  } catch (error) {
    logUnexpected('admin.signin.error', error);
    return { ok: false, reason: 'unavailable' };
  }
}

/** Is this account inside an active throttle window? */
function withinThrottle(
  failures: number,
  firstFailureAt: Date | null,
  now: number,
): boolean {
  if (failures < SIGNIN_THROTTLE.maxFailures) return false;
  if (!firstFailureAt) return false;
  return now - firstFailureAt.getTime() < SIGNIN_THROTTLE.windowMs;
}

/**
 * Record one failed attempt.
 *
 * The window restarts once the previous one has elapsed, so failures separated
 * by hours never accumulate into a lockout. Never throws: a bookkeeping problem
 * must not turn a wrong password into a server error.
 */
async function recordFailure(
  adminId: string,
  firstFailureAt: Date | null,
  now: number,
): Promise<void> {
  const windowExpired =
    !firstFailureAt || now - firstFailureAt.getTime() >= SIGNIN_THROTTLE.windowMs;
  try {
    await getPrisma().adminUser.update({
      where: { id: adminId },
      data: windowExpired
        ? { failedLoginCount: 1, firstFailedLoginAt: new Date(now) }
        : { failedLoginCount: { increment: 1 } },
    });
  } catch (error) {
    logUnexpected('admin.signin.failure_record_failed', error);
  }
}

/**
 * Sign out.
 *
 * TWO STEPS, AND THE SECOND IS THE ONE THAT MATTERS. Clearing the cookie only
 * affects the browser that asked. Moving sessionsValidFrom forward refuses every
 * token issued before now, including any copy an attacker holds. Phase 10
 * demonstrated the gap by replaying a captured cookie after signing out.
 *
 * The revocation is attempted first. If the database write fails the cookie is
 * still cleared, so the visible behaviour is never worse than it was before;
 * the failure is logged rather than shown, because there is nothing the person
 * signing out can do about it.
 */
export async function signOut(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (admin) {
    try {
      await getPrisma().adminUser.update({
        where: { id: admin.id },
        data: { sessionsValidFrom: new Date() },
      });
      log.info('admin.signout.sessions_revoked', { adminId: admin.id });
      await recordAudit(admin, 'signed_out', 'AdminUser', admin.id, 'all sessions revoked');
    } catch (error) {
      logUnexpected('admin.signout.revoke_failed', error);
    }
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Record a sensitive action.
 *
 * Records the SHAPE of what happened — entity type, id, action — never the
 * personal data inside it. Never throws: an audit failure must not roll back
 * the thing the admin actually did.
 *
 * WHAT IS AND IS NOT AUDITED, AND WHY (Phase 10).
 *
 * Recorded here: sign-in, sign-out, and every create / update / publish /
 * unpublish / delete. Those are the events that answer "who published this
 * student's photograph?" in a dispute, which is the question this table exists
 * to answer.
 *
 * NOT recorded here: FAILED sign-ins. Writing them would mean writing the email
 * that was tried, and an audit table full of attempted addresses is a
 * credential-stuffing list sitting in the database — the same reasoning that
 * keeps emails out of the application log. Failures are counted instead:
 * `AdminUser.failedLoginCount` and `firstFailedLoginAt` give a durable,
 * per-account record of how many and how recently, with no address stored, and
 * `log.warn('admin.signin.failed')` carries the timing without the identity.
 *
 * `summary` must stay free of personal data. Callers pass things like
 * "CLASS_12 2026" or "status → CONTACTED", never a name or a mark.
 */
export async function recordAudit(
  admin: AdminIdentity,
  action:
    | 'created'
    | 'updated'
    | 'published'
    | 'unpublished'
    | 'deleted'
    | 'signed_in'
    | 'signed_out',
  entity: string,
  entityId: string,
  summary?: string,
): Promise<void> {
  try {
    await getPrisma().auditLog.create({
      data: {
        actorId: admin.id,
        actorLabel: admin.displayName,
        action,
        entity,
        entityId,
        summary: summary ?? null,
      },
    });
  } catch (error) {
    logUnexpected('admin.audit.failed', error);
  }
}
