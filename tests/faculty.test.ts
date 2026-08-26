/**
 * Faculty presentation — the pure half.
 *
 * The monogram is what renders when a teacher has no photograph, on a page
 * whose whole job is putting faces to names. That makes it the common case
 * during the period the institute is still collecting portraits, not an edge
 * case — so it is worth pinning properly.
 *
 * CRUD, authorisation, XSS, stale edits and public rendering are exercised
 * against a real server in `scripts/verify-faculty.mjs`, because none of them
 * can be proved without one.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { facultyInitials, FACULTY_LIMITS } from '../src/lib/faculty-display.ts';

describe('facultyInitials', () => {
  test('takes the first and last name parts', () => {
    assert.equal(facultyInitials('Ravi Sharma'), 'RS');
    assert.equal(facultyInitials('Anita Rani Gupta'), 'AG');
  });

  /**
   * An Indian institute has staff who go by one name. Doubling the letter
   * would read as a mistake, so a single part gives a single letter.
   */
  test('a single-word name gives one letter', () => {
    assert.equal(facultyInitials('Meenakshi'), 'M');
  });

  test('is not confused by extra whitespace', () => {
    assert.equal(facultyInitials('  Ravi   Sharma  '), 'RS');
    assert.equal(facultyInitials('\tRavi\nSharma '), 'RS');
  });

  test('uppercases whatever it is given', () => {
    assert.equal(facultyInitials('ravi sharma'), 'RS');
    assert.equal(facultyInitials('rAVI shARMA'), 'RS');
  });

  test('handles non-Latin names', () => {
    assert.equal(facultyInitials('रवि शर्मा'), 'रश');
    assert.equal(facultyInitials('李 明'), '李明');
  });

  /**
   * `name[0]` returns half a surrogate pair, which renders as a replacement
   * character. Iterating the string takes whole characters instead.
   */
  test('does not split a character across surrogate halves', () => {
    const initials = facultyInitials('𝐑avi 𝐒harma');
    assert.equal([...initials].length, 2, 'should be two whole characters');
    assert.ok(!initials.includes('�'));
  });

  test('an empty or blank name yields nothing rather than throwing', () => {
    assert.equal(facultyInitials(''), '');
    assert.equal(facultyInitials('   '), '');
    assert.equal(facultyInitials('\n\t'), '');
  });

  test('never throws on any input type', () => {
    for (const bad of [null, undefined, 42, {}, [], true, Symbol('x')]) {
      assert.doesNotThrow(() => facultyInitials(bad));
      assert.equal(facultyInitials(bad), '');
    }
  });

  /** A monogram is a tile, not a label; more than two letters overflows it. */
  test('never returns more than two characters', () => {
    for (const name of [
      'A B C D E F',
      'Dr Anita Rani Gupta Sharma',
      'One Two Three Four Five Six Seven',
    ]) {
      assert.ok([...facultyInitials(name)].length <= 2, name);
    }
  });
});

describe('FACULTY_LIMITS match the database', () => {
  /*
    These numbers appear in three places: the Prisma column, the CHECK
    constraint, and the save action. If they drift, a teacher meets a Postgres
    error instead of a sentence - which is the failure Phase 12 recorded when
    the CSV size cap disagreed with the framework's.
  */
  test('the text limits are the declared column widths', () => {
    assert.equal(FACULTY_LIMITS.name, 120);
    assert.equal(FACULTY_LIMITS.designation, 120);
    assert.equal(FACULTY_LIMITS.subject, 120);
    assert.equal(FACULTY_LIMITS.bio, 600);
    assert.equal(FACULTY_LIMITS.photoUrl, 500);
  });

  test('the priority ceiling matches the CHECK constraint', () => {
    assert.equal(FACULTY_LIMITS.maxPriority, 1000);
  });
});
