import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  present,
  monogramOf,
  partialName,
  isPubliclyVisible,
  blockersForPublishing,
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
 * The property that matters: NOTHING identifiable escapes unless a permission
 * explicitly allows it. Every test below is a way that could go wrong.
 */

function record(overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    studentName: 'Sample Testcase',
    displayNameMode: 'FULL',
    photoUrl: '/photos/zz-test.jpg',
    consentRef: 'ZZ-TEST-CONSENT-001',
    consentResult: true,
    consentName: true,
    consentPhoto: true,
    consentStory: false,
    published: true,
    ...overrides,
  };
}

describe('name helpers', () => {
  test('monogram uses first and last initial', () => {
    assert.equal(monogramOf('Sample Testcase'), 'ST');
    assert.equal(monogramOf('Sample Middle Testcase'), 'ST');
    assert.equal(monogramOf('Sample'), 'S');
    assert.equal(monogramOf('  spaced   out  '), 'SO');
  });

  test('never throws on empty or odd input', () => {
    assert.equal(monogramOf(''), '?');
    assert.equal(monogramOf('   '), '?');
    assert.equal(partialName(''), '');
  });

  test('partial name is first name plus surname initial', () => {
    assert.equal(partialName('Sample Testcase'), 'Sample T.');
    assert.equal(partialName('Sample'), 'Sample');
  });
});

describe('the base gate', () => {
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

  test('a blank consentRef is caught by the admin publish check', () => {
    assert.ok(blockersForPublishing(record({ consentRef: '   ' })).length > 0);
  });

  test('without result permission, a result reveals nothing', () => {
    const p = present(record({ consentResult: false }));
    assert.equal(p.name, null);
    assert.equal(p.photoUrl, null);
  });
});

describe('THE RULE THAT MOTIVATED THIS MODEL', () => {
  test('a story grant does NOT authorise a photograph', () => {
    const story = record({
      consentStory: true,
      consentPhoto: false,
      consentResult: false,
    });
    // The story itself may be published...
    assert.equal(isPubliclyVisible(story, 'consentStory'), true);
    // ...but the photograph must not appear.
    assert.equal(present(story, 'consentStory').photoUrl, null);
  });

  test('a result grant does NOT authorise a photograph', () => {
    const p = present(record({ consentPhoto: false }));
    assert.equal(p.photoUrl, null);
    assert.equal(p.name, 'Sample Testcase');
  });

  test('a name grant does NOT authorise a photograph', () => {
    const p = present(record({ consentName: true, consentPhoto: false }));
    assert.equal(p.name, 'Sample Testcase');
    assert.equal(p.photoUrl, null);
  });

  test('a photo grant does NOT authorise a name', () => {
    const p = present(record({ consentName: false, consentPhoto: true }));
    assert.equal(p.name, 'ST', 'must fall back to initials');
    assert.equal(p.photoUrl, '/photos/zz-test.jpg');
  });

  test('result permission does not let a story be published', () => {
    assert.equal(
      isPubliclyVisible(record({ consentResult: true, consentStory: false }), 'consentStory'),
      false,
    );
  });

  test('story permission does not let a result be published', () => {
    assert.equal(
      isPubliclyVisible(record({ consentResult: false, consentStory: true }), 'consentResult'),
      false,
    );
  });
});

describe('display name is capped by name permission', () => {
  test('FULL is downgraded to initials without name permission', () => {
    assert.equal(present(record({ displayNameMode: 'FULL', consentName: false })).name, 'ST');
  });

  test('FIRST_NAME_ONLY is downgraded to initials without name permission', () => {
    assert.equal(
      present(record({ displayNameMode: 'FIRST_NAME_ONLY', consentName: false })).name,
      'ST',
    );
  });

  test('INITIALS is honoured even when more is permitted', () => {
    assert.equal(present(record({ displayNameMode: 'INITIALS' })).name, 'ST');
  });

  test('FIRST_NAME_ONLY shows only the first name when permitted', () => {
    assert.equal(present(record({ displayNameMode: 'FIRST_NAME_ONLY' })).name, 'Sample');
  });

  test('a null photoUrl stays null even with photo permission', () => {
    assert.equal(present(record({ photoUrl: null })).photoUrl, null);
  });
});

describe('blockersForPublishing — what the admin shows the teacher', () => {
  test('a fully consented record has no blockers', () => {
    assert.deepEqual(blockersForPublishing(record()), []);
  });

  test('missing consent reference is reported', () => {
    const b = blockersForPublishing(record({ consentRef: null }));
    assert.ok(b.some((m) => m.includes('consent form reference')));
  });

  test('missing result permission is reported', () => {
    assert.ok(
      blockersForPublishing(record({ consentResult: false })).some((m) => m.includes('Result')),
    );
  });

  test('a name without name permission is reported', () => {
    const b = blockersForPublishing(record({ displayNameMode: 'FULL', consentName: false }));
    assert.ok(b.some((m) => m.includes('Name')));
  });

  test('initials need no name permission', () => {
    assert.deepEqual(
      blockersForPublishing(record({ displayNameMode: 'INITIALS', consentName: false })),
      [],
    );
  });

  test('a photo without photo permission is reported', () => {
    assert.ok(
      blockersForPublishing(record({ consentPhoto: false })).some((m) =>
        m.includes('Photograph'),
      ),
    );
  });

  test('no photo means no photo blocker', () => {
    assert.deepEqual(
      blockersForPublishing(record({ photoUrl: null, consentPhoto: false })),
      [],
    );
  });

  test('a story needs story permission, not result permission', () => {
    const b = blockersForPublishing(
      record({ consentStory: false, consentResult: true }),
      'consentStory',
    );
    assert.ok(b.some((m) => m.includes('Story')));
  });

  test('every blocker is written for a person, not a database', () => {
    const b = blockersForPublishing(
      record({
        consentRef: null,
        consentResult: false,
        consentName: false,
        consentPhoto: false,
      }),
    );
    assert.ok(b.length >= 3);
    for (const message of b) {
      for (const jargon of ['null', 'NULL', 'constraint', 'CHECK', 'boolean', 'column']) {
        assert.ok(
          !message.includes(jargon),
          `blocker leaked jargon "${jargon}": ${message}`,
        );
      }
    }
  });
});
