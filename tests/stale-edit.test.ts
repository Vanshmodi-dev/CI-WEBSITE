/**
 * Lost-update guard — the pure half.
 *
 * The behaviour that matters is exercised over HTTP in verify-integration.mjs,
 * because a lost update is a database race and cannot be proved with a unit
 * test. What is unit-testable is the token handling, and that is worth pinning:
 * every one of these cases decides whether a save is refused or allowed, and
 * getting `null` wrong in either direction is the difference between refusing
 * legitimate work and permitting the exact write this guard exists to stop.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EDIT_TOKEN_FIELD,
  STALE_EDIT_MESSAGE,
  StaleEditError,
  isStaleEditError,
  parseEditToken,
  editToken,
} from '../src/lib/stale-edit.ts';

describe('edit token round trip', () => {
  test('a Date survives serialisation to the millisecond', () => {
    const now = new Date('2026-08-25T10:11:12.345Z');
    const parsed = parseEditToken(editToken(now));
    assert.ok(parsed);
    assert.equal(parsed.getTime(), now.getTime());
  });

  test('millisecond precision is not lost', () => {
    // Postgres stores timestamp(3); a token that rounded to the second would
    // compare unequal and refuse every legitimate save.
    for (const ms of [0, 1, 9, 99, 345, 999]) {
      const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ms));
      assert.equal(parseEditToken(editToken(d))?.getTime(), d.getTime());
    }
  });

  test('accepts an ISO string as well as a Date', () => {
    const iso = '2026-08-25T10:11:12.345Z';
    assert.equal(editToken(iso), iso);
  });
});

describe('parseEditToken refuses anything it cannot trust', () => {
  test('returns null for absent, blank or non-string input', () => {
    for (const value of [null, undefined, '', '   ', 42, {}, [], true]) {
      assert.equal(parseEditToken(value), null, `${JSON.stringify(value)} should not parse`);
    }
  });

  test('returns null for an unparseable date', () => {
    for (const value of ['not-a-date', 'yesterday', '2026-13-45T99:99:99Z', 'NaN', '<script>']) {
      assert.equal(parseEditToken(value), null, `${value} should not parse`);
    }
  });

  test('never throws, whatever it is handed', () => {
    for (const value of [Symbol('x'), () => {}, new Map(), Infinity, -0]) {
      assert.doesNotThrow(() => parseEditToken(value as unknown));
    }
  });

  test('a null token means the caller must fail closed', () => {
    // The action turns null into `updatedAt: new Date(0)`, which matches no
    // real row. This asserts the contract the action depends on: a form that
    // lost its token cannot prove it saw the current record.
    assert.equal(parseEditToken(undefined), null);
    assert.equal(parseEditToken(''), null);
  });
});

describe('editToken', () => {
  test('an absent value serialises to the empty string, not "null"', () => {
    // "null" would parse back as an Invalid Date, so this must stay empty.
    for (const value of [null, undefined, '']) {
      assert.equal(editToken(value as Date | null), '');
    }
    assert.equal(parseEditToken(editToken(null)), null);
  });

  test('an invalid date serialises to the empty string', () => {
    assert.equal(editToken(new Date('nonsense')), '');
  });
});

describe('the stale-edit signal', () => {
  test('isStaleEditError recognises the sentinel', () => {
    assert.equal(isStaleEditError(new StaleEditError()), true);
  });

  test('it does not swallow ordinary errors', () => {
    for (const other of [new Error('boom'), new TypeError('x'), null, undefined, 'STALE_EDIT']) {
      assert.equal(isStaleEditError(other), false, `${String(other)} must not read as stale`);
    }
  });

  test('the message tells a teacher what happened and what to do', () => {
    assert.match(STALE_EDIT_MESSAGE, /nothing was saved/i);
    assert.match(STALE_EDIT_MESSAGE, /open it again/i);
    // No database vocabulary: this is read by a teacher, not an engineer.
    for (const jargon of ['conflict', 'stale', 'transaction', 'row', 'updatedAt', 'optimistic']) {
      assert.ok(
        !new RegExp(jargon, 'i').test(STALE_EDIT_MESSAGE),
        `the message should not say "${jargon}"`,
      );
    }
  });

  test('the field name is a single shared constant', () => {
    assert.equal(typeof EDIT_TOKEN_FIELD, 'string');
    assert.ok(EDIT_TOKEN_FIELD.length > 0);
  });
});

describe('both consent-bearing forms are guarded', () => {
  test('the students and stories actions both consult the token', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of [
      'src/app/admin/(dashboard)/students/actions.ts',
      'src/app/admin/(dashboard)/stories/actions.ts',
    ]) {
      const src = readFileSync(file, 'utf8');
      assert.match(src, /parseEditToken\(/, `${file} does not read the edit token`);
      assert.match(src, /updateMany\(/, `${file} does not use a guarded update`);
      assert.match(src, /STALE_EDIT_MESSAGE/, `${file} does not report a refused save`);
    }
  });

  test('both forms send the token back', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of [
      'src/app/admin/(dashboard)/students/student-form.tsx',
      'src/app/admin/(dashboard)/stories/story-form.tsx',
    ]) {
      const src = readFileSync(file, 'utf8');
      assert.match(src, /EDIT_TOKEN_FIELD/, `${file} does not render the hidden token`);
    }
  });
});
