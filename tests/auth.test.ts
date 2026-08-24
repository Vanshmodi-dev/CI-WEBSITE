import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  hashPassword,
  verifyPassword,
  parseHash,
  MIN_PASSWORD_LENGTH,
} from '../src/lib/password.ts';
import {
  buildSessionToken,
  readSessionToken,
  isSessionRevoked,
  MAX_TOKEN_LENGTH,
  SESSION_TTL_MS,
} from '../src/lib/session-token.ts';

const KEY = 'admin-test-key-not-used-anywhere-else-0123456789';
const sign = (p: string) => createHmac('sha256', KEY).update(p).digest('hex');
const compare = (a: string, b: string) => a === b;

const OTHER_KEY = 'a-different-key-an-attacker-controls-987654321';
const attackerSign = (p: string) =>
  createHmac('sha256', OTHER_KEY).update(p).digest('hex');

const NOW = 1_790_000_000_000;
const ADMIN_ID = 'clx0admin000000000000001';

describe('password hashing', () => {
  test('a correct password verifies', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('correct horse battery staple', encoded), true);
  });

  test('a wrong password does not verify', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('correct horse battery stapl', encoded), false);
    assert.equal(await verifyPassword('', encoded), false);
  });

  test('the same password hashes differently every time (random salt)', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    assert.notEqual(a, b, 'identical hashes mean the salt is not random');
    assert.equal(await verifyPassword('correct horse battery staple', a), true);
    assert.equal(await verifyPassword('correct horse battery staple', b), true);
  });

  test('the encoded hash never contains the password', async () => {
    const password = 'unmistakable-plaintext-marker-9987';
    const encoded = await hashPassword(password);
    assert.ok(!encoded.includes(password));
    assert.ok(encoded.startsWith('scrypt$'));
  });

  test('short passwords are refused', async () => {
    await assert.rejects(() => hashPassword('x'.repeat(MIN_PASSWORD_LENGTH - 1)));
  });

  test('verification never throws on malformed stored hashes', async () => {
    for (const bad of [
      '',
      'plaintext-password',
      'scrypt$',
      'scrypt$1$2$3$4',
      'bcrypt$131072$8$1$AAAA$BBBB',
      'scrypt$0$8$1$AAAAAAAAAAAA$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    ]) {
      assert.equal(await verifyPassword('anything', bad), false, `for ${bad}`);
    }
  });

  test('parseHash rejects anything not well-formed', () => {
    assert.equal(parseHash('nope'), null);
    assert.equal(parseHash('scrypt$131072$8$1$short$short'), null);
  });
});

describe('admin session token', () => {
  const ISSUED = NOW - 1000;

  test('a freshly issued token reads back', () => {
    const token = buildSessionToken(ADMIN_ID, ISSUED, ISSUED + SESSION_TTL_MS, sign);
    const r = readSessionToken(token, sign, compare, NOW);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.adminId, ADMIN_ID);
      assert.equal(r.issuedAt, ISSUED);
    }
  });

  test('an expired token is rejected', () => {
    const token = buildSessionToken(ADMIN_ID, NOW - 2000, NOW - 1, sign);
    const r = readSessionToken(token, sign, compare, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'expired');
  });

  test('a token signed with another key is rejected', () => {
    const forged = buildSessionToken(ADMIN_ID, ISSUED, ISSUED + SESSION_TTL_MS, attackerSign);
    const r = readSessionToken(forged, sign, compare, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'bad-signature');
  });

  test('extending the expiry invalidates the signature', () => {
    const token = buildSessionToken(ADMIN_ID, ISSUED, NOW + 1000, sign);
    const signature = token.split('.')[3];
    const tampered = `${ADMIN_ID}.${ISSUED}.${ISSUED + SESSION_TTL_MS}.${signature}`;
    const r = readSessionToken(tampered, sign, compare, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'bad-signature');
  });

  test('backdating the issue time invalidates the signature', () => {
    // The revocation check reads issuedAt, so an attacker who could rewrite it
    // could step around a revoked session. The signature covers it.
    const token = buildSessionToken(ADMIN_ID, ISSUED, ISSUED + SESSION_TTL_MS, sign);
    const [, , exp, sig] = token.split('.');
    const tampered = `${ADMIN_ID}.${NOW + 5000}.${exp}.${sig}`;
    const r = readSessionToken(tampered, sign, compare, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'bad-signature');
  });

  test('swapping in another admin id invalidates the signature', () => {
    const token = buildSessionToken(ADMIN_ID, ISSUED, ISSUED + SESSION_TTL_MS, sign);
    const [, iss, exp, sig] = token.split('.');
    const tampered = `clx0admin000000000000002.${iss}.${exp}.${sig}`;
    const r = readSessionToken(tampered, sign, compare, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'bad-signature');
  });

  test('the signature is checked before expiry', () => {
    // A forged AND expired token must report bad-signature, so probing with an
    // unsigned token reveals nothing about session lifetimes.
    const forged = buildSessionToken(ADMIN_ID, NOW - 2000, NOW - 1, attackerSign);
    const r = readSessionToken(forged, sign, compare, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'bad-signature');
  });

  test('a signed token claiming a lifetime longer than we issue is refused', () => {
    const token = buildSessionToken(ADMIN_ID, ISSUED, ISSUED + SESSION_TTL_MS * 10, sign);
    const r = readSessionToken(token, sign, compare, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'malformed');
  });

  test('an absurdly long cookie is discarded before any parsing', () => {
    const r = readSessionToken('a'.repeat(MAX_TOKEN_LENGTH + 1), sign, compare, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'malformed');
  });

  test('malformed tokens are rejected without throwing', () => {
    for (const bad of [
      '',
      '.',
      'a.b',
      'a.b.c',
      'a.b.c.d.e',
      `${ADMIN_ID}.notanumber.${NOW}.${'a'.repeat(64)}`,
      `${ADMIN_ID}.${ISSUED}.notanumber.${'a'.repeat(64)}`,
      `${ADMIN_ID}.${ISSUED}.${NOW}.${'z'.repeat(64)}`,
      `${ADMIN_ID}.${ISSUED}.${NOW}.${'a'.repeat(63)}`,
      `bad id!.${ISSUED}.${NOW}.${'a'.repeat(64)}`,
    ]) {
      const r = readSessionToken(bad, sign, compare, NOW);
      assert.equal(r.ok, false, `should reject ${JSON.stringify(bad)}`);
    }
  });

  test('refuses to sign a session for a malformed admin id', () => {
    assert.throws(() => buildSessionToken('has spaces', ISSUED, NOW, sign));
    assert.throws(() => buildSessionToken('has.dots', ISSUED, NOW, sign));
  });

  test('refuses to sign a session that expires before it is issued', () => {
    assert.throws(() => buildSessionToken(ADMIN_ID, NOW, NOW - 1, sign));
  });
});

describe('session revocation', () => {
  // The property Phase 10 added: signing out invalidates tokens issued before
  // that moment, including copies the browser signing out never held.
  test('a session issued before the revocation point is revoked', () => {
    assert.equal(isSessionRevoked(1_000, 2_000), true);
  });

  test('a session issued after the revocation point survives', () => {
    assert.equal(isSessionRevoked(3_000, 2_000), false);
  });

  test('a session issued at exactly the revocation point survives', () => {
    // Signing out sets validFrom to now; the token being issued is stamped with
    // the same clock. Treating equal as revoked would sign the admin straight
    // back out of the session they just created.
    assert.equal(isSessionRevoked(2_000, 2_000), false);
  });
});
