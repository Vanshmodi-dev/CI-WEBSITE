import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Setting an admin password — AND REVOKING THAT ACCOUNT'S SESSIONS WITH IT.
 *
 * =============================================================================
 * THE DEFECT THIS FILE EXISTS TO MAKE IMPOSSIBLE
 * =============================================================================
 * `sessionsValidFrom` is this project's session-revocation boundary, and it
 * works: `getCurrentAdmin()` refuses any token whose `issuedAt` predates it,
 * and `signOut()` moves it to now so that "sign me out" means everywhere.
 *
 * It was written in exactly ONE place — `signOut`. The only path that changes a
 * password, `scripts/create-admin.mjs`, wrote `passwordHash` and left the
 * boundary alone. So changing the password did not end the sessions the old
 * password had opened: a token captured beforehand kept working for the rest of
 * its eight hours, on any device, including one the owner had changed the
 * password specifically to lock out.
 *
 * The mechanism was never missing. What was missing was any reason for the next
 * caller to remember it, because "change the password" and "revoke the
 * sessions" were two separate writes that a person had to think to combine.
 *
 * =============================================================================
 * WHY A FUNCTION RATHER THAN TWO LINES IN THE SCRIPT
 * =============================================================================
 * Adding `sessionsValidFrom` to the one upsert in `create-admin.mjs` would fix
 * today's bug and leave tomorrow's in place: the day somebody adds a
 * change-password screen to the admin, they write the same `update` and
 * reintroduce the same hole, and nothing fails. Here the two writes are one
 * operation with one name, so a new caller cannot perform half of it.
 *
 * =============================================================================
 * WHY THIS MODULE IS PURE
 * =============================================================================
 * No `server-only`, no `next/headers`, no module-level Prisma. `src/lib/auth.ts`
 * has all three and therefore cannot be imported by a plain Node script — which
 * is exactly what the only password-change caller is. Taking the client as an
 * argument follows `session-token.ts` and `media/consumers.ts`: the rule lives
 * where a unit test in plain Node can reach it.
 */

/** What a password change writes. Kept as data so a test can assert its shape. */
export type PasswordChangeWrite = {
  passwordHash: string;
  /**
   * The revocation boundary. Every token issued before this instant is refused
   * by `getCurrentAdmin()`, which is what ends the old sessions.
   */
  sessionsValidFrom: Date;
};

/**
 * The fields a password change must write, together.
 *
 * ⚠ THE CLOCK HERE MUST BE THE SAME CLOCK THAT STAMPS `issuedAt`.
 *
 * `signIn()` builds a token with `issuedAt = Date.now()` — the application
 * server's clock — and `signOut()` revokes with `new Date()` from that same
 * clock. The comparison in `isSessionRevoked` is therefore between two readings
 * of one clock, and that is the only reason it is meaningful.
 *
 * It is tempting to reach for the database's `now()` instead, on the general
 * principle that server time beats process time. Here that would be the wrong
 * server: it would compare a Postgres instant against a Node instant, and any
 * skew between them either lets a session survive a password change or refuses
 * a session the moment it is issued. This project has already lost an hour to
 * exactly that shape of bug once. So: process time, matching `issuedAt`.
 */
export function passwordChangeWrite(
  passwordHash: string,
  now: Date = new Date(),
): PasswordChangeWrite {
  return { passwordHash, sessionsValidFrom: now };
}

export type SetAdminPasswordInput = {
  /** Already normalised and lower-cased by the caller. */
  email: string;
  displayName: string;
  /** Produced by `hashPassword()`. This module never sees a plaintext password. */
  passwordHash: string;
};

export type SetAdminPasswordResult = {
  id: string;
  email: string;
  displayName: string;
  sessionsValidFrom: Date;
  /** True when the row already existed, so the caller can word its output. */
  existed: boolean;
};

/**
 * Create the admin account, or change its password and revoke its sessions.
 *
 * =============================================================================
 * ATOMICITY
 * =============================================================================
 * The password and the revocation boundary are two columns of ONE row written
 * by ONE statement, so they commit or fail together with no transaction needed.
 * An explicit `$transaction` would add a round trip and no guarantee — this
 * project reserves it for writes that span rows, such as the stale-edit check
 * in the website editor. There is no window in which the password is new and
 * the old sessions are still valid.
 *
 * =============================================================================
 * `sessionsValidFrom` IS SET ON UPDATE ONLY, DELIBERATELY
 * =============================================================================
 * A brand-new account has no sessions to revoke, so setting a boundary on
 * create buys nothing — and it could cost something. The column defaults to the
 * DATABASE's `now()`, while the boundary written here comes from this process's
 * clock; on create the default is harmless, but writing a process-clock value
 * that happened to run ahead of the application server would refuse the very
 * first sign-in as "not yet valid". Revocation belongs where there is something
 * to revoke.
 */
export async function setAdminPassword(
  prisma: PrismaClient,
  { email, displayName, passwordHash }: SetAdminPasswordInput,
  now: Date = new Date(),
): Promise<SetAdminPasswordResult> {
  const before = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true },
  });

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {
      ...passwordChangeWrite(passwordHash, now),
      displayName,
      active: true,
    },
    create: { email, displayName, passwordHash },
    select: { id: true, email: true, displayName: true, sessionsValidFrom: true },
  });

  return { ...admin, existed: before !== null };
}
