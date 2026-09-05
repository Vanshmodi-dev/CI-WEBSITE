/**
 * Changing an admin password must end that account's sessions.
 *
 * =============================================================================
 * THE DEFECT
 * =============================================================================
 * `sessionsValidFrom` is the revocation boundary and it worked, but it was
 * written in exactly one place — `signOut()`. The only path that changes a
 * password wrote `passwordHash` and left the boundary untouched, so a token
 * captured before the change kept working for the rest of its eight hours.
 *
 * These are the PURE half of the proof: that the write always carries both
 * fields, and that the boundary comparison behaves at the exact millisecond it
 * is set. The other half — an old cookie actually being refused by a running
 * server — is section 23 of scripts/verify-security.mjs, because only a real
 * request can prove the real request path.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  passwordChangeWrite,
  setAdminPassword,
} from '../src/lib/admin-password.ts';
import { isSessionRevoked, SESSION_TTL_MS } from '../src/lib/session-token.ts';

/* ------------------------------------------------------------- the write -- */

describe('a password change always carries a revocation boundary', () => {
  test('the write contains BOTH the hash and sessionsValidFrom', () => {
    const at = new Date('2026-09-05T10:00:00.000Z');
    const write = passwordChangeWrite('scrypt$131072$8$1$abc$def', at);

    assert.equal(write.passwordHash, 'scrypt$131072$8$1$abc$def');
    assert.deepEqual(write.sessionsValidFrom, at);
  });

  /**
   * ⚠ THIS IS THE REGRESSION TEST FOR THE ORIGINAL BUG.
   *
   * The old code wrote `{ passwordHash, displayName, active }`. If somebody
   * reduces the write back to that shape, this fails — which is the only thing
   * standing between a future refactor and a silently un-revoked session.
   */
  test('sessionsValidFrom cannot be dropped from the write', () => {
    const write = passwordChangeWrite('scrypt$hash');
    assert.ok(
      Object.prototype.hasOwnProperty.call(write, 'sessionsValidFrom'),
      'a password change that does not move sessionsValidFrom leaves old sessions alive',
    );
    assert.ok(write.sessionsValidFrom instanceof Date);
  });

  test('it defaults to now, from this process clock', () => {
    const before = Date.now();
    const write = passwordChangeWrite('scrypt$hash');
    const after = Date.now();
    const stamped = write.sessionsValidFrom.getTime();
    assert.ok(stamped >= before && stamped <= after, `${stamped} outside [${before}, ${after}]`);
  });
});

/* ------------------------------------------------- the boundary behaviour -- */

/**
 * `isSessionRevoked` is `issuedAt < validFrom`. These pin the exact meaning of
 * that at the millisecond, because both mistakes are real: a boundary that is
 * one millisecond too lenient leaves the attacker's token alive, and one that
 * is too strict refuses the owner's brand-new session and looks like a broken
 * login.
 */
describe('the revocation boundary, to the millisecond', () => {
  const change = new Date('2026-09-05T10:00:00.000Z').getTime();

  test('a session issued before the change is rejected', () => {
    assert.equal(isSessionRevoked(change - 1, change), true);
    assert.equal(isSessionRevoked(change - 60_000, change), true);
    assert.equal(isSessionRevoked(change - SESSION_TTL_MS, change), true);
  });

  test('a session issued after the change is accepted', () => {
    assert.equal(isSessionRevoked(change + 1, change), false);
    assert.equal(isSessionRevoked(change + 60_000, change), false);
  });

  /**
   * The exact-tie case, stated rather than left to be discovered.
   *
   * A token stamped in the SAME millisecond as the change survives. That is the
   * deliberate trade: `signIn()` reads the clock AFTER the update commits, so
   * making this strict would be the only way a legitimate re-login could be
   * refused, while the attack it would prevent requires minting a token inside
   * the same millisecond as the password change.
   */
  test('a session issued in the same millisecond is not revoked, by design', () => {
    assert.equal(isSessionRevoked(change, change), false);
  });

  test('the comparison never throws on the extremes', () => {
    assert.equal(isSessionRevoked(0, change), true);
    assert.equal(isSessionRevoked(Number.MAX_SAFE_INTEGER, change), false);
  });
});

/* ------------------------------------------------------ the upsert shape -- */

/**
 * A stub standing in for Prisma.
 *
 * The point is not to test Prisma. It is to capture the ARGUMENTS this project
 * sends, so the assertions below are about our own code: that the update branch
 * revokes, that the create branch does not, and that both happen in a single
 * statement rather than a read-modify-write a concurrent sign-in could slip
 * through.
 */
function stubPrisma(existingRow: { id: string } | null) {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const prisma = {
    adminUser: {
      findUnique: async (args: Record<string, unknown>) => {
        calls.push({ op: 'findUnique', args });
        return existingRow;
      },
      upsert: async (args: Record<string, unknown>) => {
        calls.push({ op: 'upsert', args });
        return {
          id: existingRow?.id ?? 'new-id',
          email: 'admin@example.invalid',
          displayName: 'Local Admin',
          sessionsValidFrom: new Date('2026-09-05T10:00:00.000Z'),
        };
      },
    },
  };
  // The stub deliberately implements only what this function uses.
  return { prisma: prisma as never, calls };
}

describe('setAdminPassword', () => {
  const input = {
    email: 'admin@example.invalid',
    displayName: 'Local Admin',
    passwordHash: 'scrypt$131072$8$1$salt$hash',
  };
  const now = new Date('2026-09-05T10:00:00.000Z');

  test('an EXISTING account has its sessions revoked', async () => {
    const { prisma, calls } = stubPrisma({ id: 'admin-1' });
    const result = await setAdminPassword(prisma, input, now);

    const upsert = calls.find((c) => c.op === 'upsert');
    assert.ok(upsert, 'no upsert was issued');
    const update = upsert.args.update as Record<string, unknown>;

    assert.equal(update.passwordHash, input.passwordHash);
    assert.deepEqual(
      update.sessionsValidFrom,
      now,
      'the password changed without moving the revocation boundary',
    );
    assert.equal(result.existed, true);
  });

  /**
   * A new account has nothing to revoke, and stamping a process-clock value
   * onto it could refuse its very first sign-in if this process ran ahead of
   * the application server. The column keeps its database default instead.
   */
  test('a NEW account does not get a process-clock boundary', async () => {
    const { prisma, calls } = stubPrisma(null);
    const result = await setAdminPassword(prisma, input, now);

    const upsert = calls.find((c) => c.op === 'upsert');
    assert.ok(upsert);
    const create = upsert.args.create as Record<string, unknown>;

    assert.equal(create.passwordHash, input.passwordHash);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(create, 'sessionsValidFrom'),
      'a brand-new account should keep the database default',
    );
    assert.equal(result.existed, false);
  });

  /**
   * ATOMICITY, as far as a unit test can see it: the hash and the boundary
   * travel in ONE statement. If they were ever split into two writes there
   * would be a window in which the new password was live and the old sessions
   * still were too.
   */
  test('the hash and the boundary are written by a single statement', async () => {
    const { prisma, calls } = stubPrisma({ id: 'admin-1' });
    await setAdminPassword(prisma, input, now);

    const writes = calls.filter((c) => c.op !== 'findUnique');
    assert.equal(writes.length, 1, `expected one write, got ${writes.length}`);
    const update = writes[0]?.args.update as Record<string, unknown>;
    assert.ok(update.passwordHash && update.sessionsValidFrom);
  });

  test('it never receives or returns a plaintext password', async () => {
    const { prisma, calls } = stubPrisma({ id: 'admin-1' });
    const result = await setAdminPassword(prisma, input, now);
    const serialised = JSON.stringify({ calls, result });
    assert.ok(!/password"\s*:\s*"(?!scrypt)/i.test(serialised));
    assert.ok(serialised.includes('scrypt$'), 'the hash is what travels');
  });
});
