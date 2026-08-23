import 'server-only';

import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import {
  buildSessionToken,
  readSessionToken,
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
      select: { id: true, email: true, displayName: true, active: true },
    });
    if (!admin || !admin.active) return null;
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
  | { ok: false; reason: 'invalid' | 'unavailable' };

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

  const normalisedEmail = email.trim().toLowerCase();

  try {
    const prisma = getPrisma();
    const admin = await prisma.adminUser.findUnique({
      where: { email: normalisedEmail },
      select: { id: true, passwordHash: true, active: true, displayName: true },
    });

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
      return { ok: false, reason: 'invalid' };
    }

    const expiresAt = Date.now() + SESSION_TTL_MS;
    const token = buildSessionToken(admin.id, expiresAt, sign);

    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(expiresAt),
    });

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    log.info('admin.signin.ok', { adminId: admin.id });
    return { ok: true };
  } catch (error) {
    logUnexpected('admin.signin.error', error);
    return { ok: false, reason: 'unavailable' };
  }
}

export async function signOut(): Promise<void> {
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
 */
export async function recordAudit(
  admin: AdminIdentity,
  action: 'created' | 'updated' | 'published' | 'unpublished' | 'deleted' | 'signed_in',
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
