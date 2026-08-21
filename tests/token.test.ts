import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  buildToken,
  checkToken,
  MIN_ELAPSED_MS,
  MAX_ELAPSED_MS,
} from '../src/lib/token.ts';

const KEY = 'test-key-not-used-anywhere-else-0123456789';
const sign = (payload: string) =>
  createHmac('sha256', KEY).update(payload).digest('hex');
const compare = (a: string, b: string) => a === b;

const ATTACKER_KEY = 'a-different-key-that-the-attacker-controls';
const attackerSign = (payload: string) =>
  createHmac('sha256', ATTACKER_KEY).update(payload).digest('hex');

const T0 = 1_760_000_000_000;

describe('form token', () => {
  test('a token signed with our key verifies after the minimum delay', () => {
    const token = buildToken(T0, sign);
    const result = checkToken(token, sign, compare, T0 + MIN_ELAPSED_MS + 1);
    assert.equal(result.ok, true);
  });

  test('rejects a submission that arrives too fast to be human', () => {
    const token = buildToken(T0, sign);
    const result = checkToken(token, sign, compare, T0 + 100);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'too-fast');
  });

  test('rejects a token that has expired', () => {
    const token = buildToken(T0, sign);
    const result = checkToken(token, sign, compare, T0 + MAX_ELAPSED_MS + 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'expired');
  });

  test('rejects a token forged with a different key', () => {
    const forged = buildToken(T0, attackerSign);
    const result = checkToken(forged, sign, compare, T0 + MIN_ELAPSED_MS + 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'bad-signature');
  });

  test('rejects a token whose timestamp was tampered with', () => {
    // Attacker takes a valid token and back-dates it to defeat the timing rule.
    const token = buildToken(T0, sign);
    const signature = token.split('.')[1];
    const tampered = `${T0 - 60_000}.${signature}`;
    const result = checkToken(tampered, sign, compare, T0 + MIN_ELAPSED_MS + 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'bad-signature');
  });

  test('rejects a future-dated token rather than trusting it', () => {
    const token = buildToken(T0 + 60_000, sign);
    const result = checkToken(token, sign, compare, T0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'too-fast');
  });

  test('rejects malformed input without throwing', () => {
    for (const bad of [
      '',
      '.',
      'abc',
      'abc.def',
      `${T0}`,
      `${T0}.`,
      `${T0}.xyz`,
      `${T0}.${'z'.repeat(64)}`,
      `.${'a'.repeat(64)}`,
      `${T0}.${'a'.repeat(63)}`,
      `-1.${'a'.repeat(64)}`,
    ]) {
      const result = checkToken(bad, sign, compare, T0 + 10_000);
      assert.equal(result.ok, false, `should reject ${JSON.stringify(bad)}`);
      if (!result.ok) {
        assert.ok(
          result.reason === 'malformed' || result.reason === 'bad-signature',
          `unexpected reason ${result.reason} for ${JSON.stringify(bad)}`,
        );
      }
    }
  });

  test('the signature is checked before the clock', () => {
    // A forged token that is ALSO too fast must report bad-signature, so an
    // attacker learns nothing about the timing rules from an unsigned probe.
    const forged = buildToken(T0, attackerSign);
    const result = checkToken(forged, sign, compare, T0 + 10);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'bad-signature');
  });
});
