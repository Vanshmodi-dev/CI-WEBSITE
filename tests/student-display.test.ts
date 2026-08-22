import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  present,
  monogramOf,
  isPubliclyVisible,
  type StudentRecord,
} from '../src/lib/student-display.ts';

/**
 * These tests encode docs/design/STUDENT-DATA-POLICY.md.
 *
 * FIXTURE NAMING: test names are deliberately synthetic ("Sample Testcase",
 * "ZZ-TEST-*"). Realistic-looking names must not appear anywhere in this
 * repository — the site this replaces published fabricated students, and a
 * plausible name in a fixture is one careless copy-paste away from looking
 * like a real record.
 *
 * The property that matters: NOTHING identifiable escapes unless a consent
 * scope explicitly permits it. Every test below is a way that could go wrong.
 */

function record(overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    studentName: 'Sample Testcase',
    displayNameMode: 'FULL',
    photoUrl: '/photos/zz-test.jpg',
    consentScope: 'RESULT_NAME_PHOTO',
    consentRef: 'ZZ-TEST-CONSENT-001',
    published: true,
    ...overrides,
  };
}

describe('monogramOf', () => {
  test('builds initials from first and last name', () => {
    assert.equal(monogramOf('Sample Testcase'), 'ST');
    assert.equal(monogramOf('Sample Middle Testcase'), 'ST');
    assert.equal(monogramOf('Sample'), 'S');
    assert.equal(monogramOf('  spaced   out  '), 'SO');
  });

  test('never throws on empty or odd input', () => {
    assert.equal(monogramOf(''), '?');
    assert.equal(monogramOf('   '), '?');
  });
});

describe('present — the record must be publishable at all', () => {
  test('unpublished record reveals nothing', () => {
    const p = present(record({ published: false }));
    assert.equal(p.name, null);
    assert.equal(p.photoUrl, null);
    assert.equal(p.monogram, 'ST');
  });

  test('missing consentRef reveals nothing, even if published', () => {
    const p = present(record({ consentRef: null }));
    assert.equal(p.name, null);
    assert.equal(p.photoUrl, null);
  });

  test('missing consentScope reveals nothing, even if published', () => {
    const p = present(record({ consentScope: null }));
    assert.equal(p.name, null);
    assert.equal(p.photoUrl, null);
  });
});

describe('present — scope caps what is shown', () => {
  test('RESULT_ONLY shows no name and no photo, whatever the mode asks for', () => {
    const p = present(record({ consentScope: 'RESULT_ONLY', displayNameMode: 'FULL' }));
    assert.equal(p.name, null);
    assert.equal(p.photoUrl, null);
  });

  test('FULL mode is downgraded to a partial name under partial consent', () => {
    const p = present(
      record({ consentScope: 'RESULT_PARTIAL_NAME', displayNameMode: 'FULL' }),
    );
    assert.equal(p.name, 'Sample T.');
    assert.equal(p.photoUrl, null);
  });

  test('FULL mode is allowed under full-name consent', () => {
    const p = present(
      record({ consentScope: 'RESULT_FULL_NAME', displayNameMode: 'FULL' }),
    );
    assert.equal(p.name, 'Sample Testcase');
  });

  test('photo requires the fullest grant', () => {
    assert.equal(present(record({ consentScope: 'RESULT_FULL_NAME' })).photoUrl, null);
    assert.equal(present(record({ consentScope: 'RESULT_PARTIAL_NAME' })).photoUrl, null);
    assert.equal(
      present(record({ consentScope: 'RESULT_NAME_PHOTO' })).photoUrl,
      '/photos/zz-test.jpg',
    );
  });

  test('INITIALS is honoured even when the scope would allow more', () => {
    const p = present(
      record({ consentScope: 'RESULT_NAME_PHOTO', displayNameMode: 'INITIALS' }),
    );
    assert.equal(p.name, 'ST');
  });

  test('FIRST_NAME_ONLY shows only the first name', () => {
    const p = present(
      record({ consentScope: 'RESULT_FULL_NAME', displayNameMode: 'FIRST_NAME_ONLY' }),
    );
    assert.equal(p.name, 'Sample');
  });

  test('a null photoUrl stays null even under the fullest grant', () => {
    assert.equal(present(record({ photoUrl: null })).photoUrl, null);
  });
});

describe('isPubliclyVisible', () => {
  test('requires published plus both consent fields', () => {
    assert.equal(isPubliclyVisible(record()), true);
    assert.equal(isPubliclyVisible(record({ published: false })), false);
    assert.equal(isPubliclyVisible(record({ consentRef: null })), false);
    assert.equal(isPubliclyVisible(record({ consentScope: null })), false);
  });
});
