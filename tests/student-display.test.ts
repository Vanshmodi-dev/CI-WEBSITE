import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  present,
  monogramOf,
  partialName,
  isPubliclyVisible,
  blockersForPublishing,
  type StudentRecord,
  type DisplayNameModeValue,
  type ContentKind,
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

  /*
    THE CONSENT-FORM REFERENCE IS NOT PART OF THIS MODULE ANY MORE.

    Until Phase 23 nothing could be published or shown without one. That phase
    removed the requirement for results and this file kept a test pinning it for
    stories; Phase 24 removed it for stories too, so the field is gone from
    `StudentRecord` and there is nothing left here to assert about it.

    What must stay true is asserted below and in tests/consent-removal.test.ts:
    publication needs the PERMISSION for the kind of content, and nothing else
    stands in for it.
  */
  test('a published, permitted record with no reference anywhere is shown', () => {
    const p = present(record());
    assert.equal(p.name, 'Sample Testcase');
    assert.equal(p.photoUrl, '/photos/zz-test.jpg');
    assert.deepEqual(blockersForPublishing(record()), []);
  });

  test('a STORY needs its own permission, and that is the whole gate', () => {
    assert.equal(isPubliclyVisible(record({ consentStory: true }), 'consentStory'), true);
    assert.equal(isPubliclyVisible(record({ consentStory: false }), 'consentStory'), false);
    assert.equal(present(record({ consentStory: false }), 'consentStory').name, null);
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

  test('no blocker mentions a consent form reference, for either kind', () => {
    const all = [
      ...blockersForPublishing(record({ consentResult: false })),
      ...blockersForPublishing(record({ consentStory: false }), 'consentStory'),
      ...blockersForPublishing(record({ consentName: false, displayNameMode: 'FULL' })),
      ...blockersForPublishing(record({ consentPhoto: false })),
    ].join(' ');
    assert.ok(!/consent form reference/i.test(all));
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
        consentResult: false,
        consentName: false,
        consentPhoto: false,
      }),
    );
    // Three: result, name, photograph. A fourth, the consent-form reference,
    // was removed in Phase 23 for results and Phase 24 for stories.
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

/* ============================================================================
 * THE WHOLE MATRIX, NOT A SAMPLE (Phase 14)
 * ============================================================================
 * Every test above picks a combination and asserts what it should do. That is
 * how the interesting cases get named, and it is worth keeping - but it leaves
 * the combinations nobody thought of unguarded.
 *
 * This enumerates all of them and asserts the INVARIANTS instead: whatever the
 * inputs, a name may only appear with name permission, a photograph only with
 * photograph permission, and neither may appear at all unless the record is
 * published and holds the permission for this KIND of content.
 *
 * The database was verified the same way in Phase 14: 192 combinations of the
 * fields the CHECK constraints mention, all agreeing with the constraint
 * predicates. This is the application half of that.
 */
describe('the consent matrix, exhaustively', () => {
  /** Read the permission that authorises this KIND of content. */
  const grantFor = (record: StudentRecord, kind: ContentKind): boolean | undefined =>
    kind === 'consentResult' ? record.consentResult : record.consentStory;

  const MODES: DisplayNameModeValue[] = ['INITIALS', 'FIRST_NAME_ONLY', 'FULL'];
  const KINDS: ContentKind[] = ['consentResult', 'consentStory'];
  const bools = [true, false];

  function everyCombination(
    visit: (record: StudentRecord, kind: ContentKind, label: string) => void,
  ) {
    for (const published of bools)
        for (const consentResult of bools)
          for (const consentStory of bools)
            for (const consentName of bools)
              for (const consentPhoto of bools)
                for (const hasPhoto of bools)
                  for (const displayNameMode of MODES)
                    for (const kind of KINDS) {
                      const record: StudentRecord = {
                        studentName: 'Sample Testcase',
                        displayNameMode,
                        photoUrl: hasPhoto ? '/sample.jpg' : null,
                        consentResult,
                        consentStory,
                        consentName,
                        consentPhoto,
                        published,
                      };
                      const label =
                        `published=${published} result=${consentResult} ` +
                        `story=${consentStory} name=${consentName} photo=${consentPhoto} ` +
                        `photoUrl=${hasPhoto} mode=${displayNameMode} kind=${kind}`;
                      visit(record, kind, label);
                    }
  }

  test('a photograph never appears without photograph permission', () => {
    everyCombination((record, kind, label) => {
      const view = present(record, kind);
      if (view.photoUrl !== null) {
        assert.equal(record.consentPhoto, true, `photo shown without permission: ${label}`);
      }
    });
  });

  test('a real name never appears without name permission', () => {
    everyCombination((record, kind, label) => {
      const view = present(record, kind);
      // Initials are always safe; anything longer is a name.
      if (view.name !== null && view.name !== view.monogram) {
        assert.equal(record.consentName, true, `name shown without permission: ${label}`);
      }
    });
  });

  test('nothing at all appears unless published and permitted', () => {
    everyCombination((record, kind, label) => {
      const gated = !record.published || record[kind] !== true;
      if (gated) {
        const view = present(record, kind);
        assert.equal(view.name, null, `name leaked while gated: ${label}`);
        assert.equal(view.photoUrl, null, `photo leaked while gated: ${label}`);
      }
    });
  });

  test('the two content kinds are independent in both directions', () => {
    everyCombination((record, kind, label) => {
      const view = present(record, kind);
      if (view.name !== null || view.photoUrl !== null) {
        // Whatever was shown, it was authorised by THIS kind, never the other.
        assert.equal(grantFor(record, kind), true, `shown under the wrong kind: ${label}`);
      }
    });
  });

  test('the monogram is always safe and never reveals more than initials', () => {
    everyCombination((record, kind, label) => {
      const view = present(record, kind);
      assert.ok(view.monogram.length <= 2, `monogram too long: ${label}`);
      assert.ok(
        !view.monogram.includes(' '),
        `monogram contains a space, so it is more than initials: ${label}`,
      );
    });
  });

  test('present() never throws, for any combination', () => {
    everyCombination((record, kind) => {
      assert.doesNotThrow(() => present(record, kind));
    });
  });
});
