/**
 * THE CONSENT-FORM REFERENCE IS NO LONGER A PUBLISHING REQUIREMENT ANYWHERE.
 *
 * =============================================================================
 * WHY THIS FILE EXISTS SEPARATELY FROM student-display.test.ts
 * =============================================================================
 * That file tests the display rules, and it has been inverted where it pinned
 * the old requirement. This one is the REGRESSION file for the removal itself:
 * it states, in one place, what the owner decided and what must stay true for
 * as long as that decision stands.
 *
 * Keeping it separate is deliberate, because half of these assertions are not
 * about `student-display.ts` at all. Removing a publishing rule is exactly the
 * kind of change that removes a permission by accident three files away, so
 * this reads the public query, the admin surfaces and the import planner too —
 * the places that would all have to agree for a real leak to happen.
 *
 * Every test names which of the six questions the removal was specified
 * against (A-F) it answers.
 *
 * PHASE 24 EXTENDED THE REMOVAL to student stories and to gallery photographs,
 * so the same six questions are asked of those two below the results block.
 * They are the features where the reference mattered most - a story is prose
 * about one identified child, and a gallery photograph can contain thirty - so
 * the permission that replaced it is asserted in both directions each time.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  present,
  isPubliclyVisible,
  blockersForPublishing,
  type StudentRecord,
} from '../src/lib/student-display.ts';
import {
  isGalleryItemPublic,
  galleryBlockers,
  type GalleryRecord,
} from '../src/lib/gallery.ts';
import { COLUMNS } from '../src/lib/import/columns.ts';
import { buildPlan, type ExistingRecord } from '../src/lib/import/plan.ts';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

/** Strip comments, so an assertion about code is not answered by prose. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A result with every permission granted and NO paperwork reference. */
function result(overrides: Partial<StudentRecord> = {}): StudentRecord {
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

/** The import template, as a sheet with every column blank. */
function sheet(values: Record<string, string>) {
  const headers = COLUMNS.map((c) => c.header.toLowerCase().replace(/[\s_-]+/g, ' '));
  const row: Record<string, string> = {};
  for (const header of headers) row[header] = '';
  for (const [key, value] of Object.entries(values)) row[key] = value;
  return { headers, rows: [row] };
}

/** One live, published record for the planner to correct. */
const livePublished: ExistingRecord[] = [
  {
    importRef: 'ZZTEST-001',
    published: true,
    consentResult: true,
    consentName: false,
    consentPhoto: false,
    displayNameMode: 'INITIALS',
    photoUrl: null,
  },
];

const VALID_ROW: Record<string, string> = {
  reference: 'ZZTEST-001',
  'student name': 'Sample Testcase',
  programme: 'Class 12 Commerce',
  year: '2026',
  score: '91',
  'score is': 'Percent',
  'permission: show result': 'Yes',
};

describe('A - a result with result permission publishes without a reference', () => {
  test('nothing blocks publishing', () => {
    assert.deepEqual(blockersForPublishing(result()), []);
  });

  test('and it is publicly visible', () => {
    assert.equal(isPubliclyVisible(result()), true);
  });

  test('the record type has no reference field left to set', () => {
    // Phase 24 removed `consentRef` from `StudentRecord` altogether, which is
    // what makes "a caller could still pass one" impossible rather than merely
    // unlikely. A compile error is the assertion; this reads the source.
    const source = read('src/lib/student-display.ts');
    const type = source.slice(source.indexOf('export type StudentRecord'));
    assert.ok(!type.slice(0, type.indexOf('};')).includes('consentRef'));
  });
});

describe('B - a result without result permission cannot be published', () => {
  test('publishing is blocked, in words a teacher can act on', () => {
    const blockers = blockersForPublishing(result({ consentResult: false }));
    assert.ok(blockers.some((m) => m.includes('Result')));
  });

  test('and nothing about it is visible, whatever else is granted', () => {
    const record = result({ consentResult: false });
    assert.equal(isPubliclyVisible(record), false);
    const view = present(record);
    assert.equal(view.name, null);
    assert.equal(view.photoUrl, null);
  });

  test('the public query filters on the permission, not on the reference', () => {
    const source = read('src/lib/public-data.ts');
    const clause = source.slice(source.indexOf('const visible = {'));
    const body = clause.slice(0, clause.indexOf('} as const;'));
    assert.ok(body.includes('published: true'), 'the published gate is gone');
    assert.ok(body.includes('consentResult: true'), 'the result-permission gate is gone');
    assert.ok(!body.includes('consentRef'), 'the reference is back in the public gate');
  });

  test('the freshness aggregate uses the same gate as the results query', () => {
    // Two hand-written copies of one rule. If they drift, the sitemap reports a
    // change date for rows the page does not show.
    const source = read('src/lib/public-data.ts');
    const aggregate = source.slice(source.indexOf('prisma.topper.aggregate('));
    const where = aggregate.slice(aggregate.indexOf('where:'), aggregate.indexOf('_max:'));
    assert.ok(where.includes('published: true'));
    assert.ok(where.includes('consentResult: true'));
    assert.ok(!where.includes('consentRef'));
  });
});

describe('C - name permission still governs the name', () => {
  test('without it, only initials are shown, even in full-name mode', () => {
    const view = present(result({ consentName: false, displayNameMode: 'FULL' }));
    assert.equal(view.name, 'ST');
    assert.ok(!String(view.name).includes('Sample Testcase'));
  });

  test('and publishing a full name without it is still blocked', () => {
    const blockers = blockersForPublishing(
      result({ consentName: false, displayNameMode: 'FULL' }),
    );
    assert.ok(blockers.some((m) => m.includes('Name')));
  });
});

describe('D - photograph permission still governs the photograph', () => {
  test('without it, no photograph is shown', () => {
    assert.equal(present(result({ consentPhoto: false })).photoUrl, null);
  });

  test('and publishing a record that carries one is still blocked', () => {
    const blockers = blockersForPublishing(result({ consentPhoto: false }));
    assert.ok(blockers.some((m) => m.includes('Photograph')));
  });

  test('result permission does not confer it', () => {
    const record = result({ consentResult: true, consentPhoto: false, consentName: false });
    const view = present(record);
    assert.equal(view.photoUrl, null);
    assert.equal(view.name, view.monogram);
  });
});

describe('E - removing the reference did not open a bypass', () => {
  const bools = [true, false];

  /**
   * Every combination of the four things that remain, with no reference
   * anywhere. The invariants asserted are the ones the permission model has
   * always claimed; if the removal had loosened one, one of these fails.
   */
  test('no permission is satisfied by the absence of a reference', () => {
    for (const published of bools)
      for (const consentResult of bools)
        for (const consentName of bools)
          for (const consentPhoto of bools)
            for (const displayNameMode of ['INITIALS', 'FULL'] as const) {
              const record = result({
                published,
                consentResult,
                consentName,
                consentPhoto,
                displayNameMode,
              });
              const view = present(record);
              const label =
                `published=${published} result=${consentResult} name=${consentName} ` +
                `photo=${consentPhoto} mode=${displayNameMode}`;

              if (!published || !consentResult) {
                assert.equal(view.name, null, `name leaked: ${label}`);
                assert.equal(view.photoUrl, null, `photo leaked: ${label}`);
                continue;
              }
              if (view.photoUrl !== null) {
                assert.equal(consentPhoto, true, `photo without permission: ${label}`);
              }
              if (view.name !== null && view.name !== view.monogram) {
                assert.equal(consentName, true, `name without permission: ${label}`);
              }
            }
  });

  test('the two content kinds stay independent of each other', () => {
    // The removal must not have made one permission stand in for another.
    const storyOnly = result({ consentStory: true, consentResult: false });
    assert.equal(isPubliclyVisible(storyOnly, 'consentStory'), true);
    assert.equal(isPubliclyVisible(storyOnly, 'consentResult'), false);

    const resultOnly = result({ consentStory: false, consentResult: true });
    assert.equal(isPubliclyVisible(resultOnly, 'consentResult'), true);
    assert.equal(isPubliclyVisible(resultOnly, 'consentStory'), false);
  });

  test('the database still refuses a published row without result permission', () => {
    // The application gate is the first line; this is the one that holds when
    // something writes the row directly.
    const sql = read(
      'prisma/migrations/20260902120000_result_publish_without_consent_ref/migration.sql',
    );
    assert.match(
      sql,
      /ADD CONSTRAINT "toppers_published_requires_consent"\s*\n\s*CHECK \(NOT "published" OR "consentResult"\);/,
    );
    // The statements, not the header: the header explains at length which
    // story constraints are being left alone.
    const statements = sql.replace(/--[^\n]*/g, '');
    assert.ok(
      !statements.includes('student_stories'),
      'this migration must not touch stories',
    );

    // ...and the constraints that were never part of this change.
    const init = read('prisma/migrations/20260824124217_init/migration.sql');
    for (const constraint of [
      'toppers_photo_requires_photo_consent',
      'toppers_name_requires_name_consent',
      'toppers_published_at_set',
      'student_stories_published_requires_consent',
    ]) {
      assert.ok(init.includes(constraint), `${constraint} is missing`);
    }
  });

  test('the column itself is retained, with its data', () => {
    const schema = read('prisma/schema.prisma');
    // Three models carry it: Topper, StudentStory and GalleryItem.
    assert.equal(
      [...schema.matchAll(/consentRef\s+String\?\s+@db\.VarChar\(200\)/g)].length,
      3,
      'every model should still declare the retained column',
    );
    for (const migration of [
      '20260902120000_result_publish_without_consent_ref',
      '20260903100000_story_gallery_publish_without_consent_ref',
    ]) {
      const sql = read(`prisma/migrations/${migration}/migration.sql`);
      assert.ok(!/DROP\s+COLUMN/i.test(sql), `${migration} must not drop a column`);
      assert.ok(!/DELETE\s+FROM/i.test(sql), `${migration} must not rewrite rows`);
      assert.ok(!/UPDATE\s+"/i.test(sql), `${migration} must not update rows`);
    }
  });
});

describe('F - the old warning cannot be caused by an empty reference', () => {
  /**
   * The admin panel renders "More permission is needed before this can be
   * shown." whenever `blockersForPublishing()` returns anything. So "does that
   * warning appear because the reference is empty?" is exactly "does that call
   * return anything for a fully permitted result with no reference?".
   */
  test('a fully permitted result with no reference produces no blockers at all', () => {
    assert.deepEqual(blockersForPublishing(result()), []);
  });

  test('no surface in any of the three workflows still asks for a reference', () => {
    for (const file of [
      'src/app/admin/(dashboard)/students/student-form.tsx',
      'src/app/admin/(dashboard)/students/actions.ts',
      'src/app/admin/(dashboard)/students/[id]/page.tsx',
      'src/app/admin/(dashboard)/students/page.tsx',
      // Phase 24.
      'src/app/admin/(dashboard)/stories/story-form.tsx',
      'src/app/admin/(dashboard)/stories/actions.ts',
      'src/app/admin/(dashboard)/stories/[id]/page.tsx',
      'src/app/admin/(dashboard)/stories/page.tsx',
      'src/app/admin/(dashboard)/gallery/gallery-form.tsx',
      'src/app/admin/(dashboard)/gallery/actions.ts',
      'src/app/admin/(dashboard)/gallery/[id]/page.tsx',
    ]) {
      const source = code(read(file));
      assert.ok(
        !/consentRef/.test(source),
        `${file} still reads or writes consentRef outside a comment`,
      );
      assert.ok(
        !/[Cc]onsent form reference/.test(source),
        `${file} still shows the consent-form-reference wording`,
      );
    }
  });

  test('the warning itself survives, for the reasons that are still real', () => {
    // It must NOT be deleted: a record with no permission still has to say so,
    // and that is the case the panel now exists for.
    for (const file of [
      'src/app/admin/(dashboard)/students/student-form.tsx',
      'src/app/admin/(dashboard)/stories/story-form.tsx',
    ]) {
      assert.ok(
        read(file).includes('More permission is needed before this can be shown.'),
        `${file} lost the warning entirely`,
      );
    }
  });
});

describe('the import template no longer collects a reference', () => {
  test('there is no consent-form-reference column', () => {
    assert.equal(COLUMNS.some((c) => /consent form reference/i.test(c.header)), false);
    assert.equal(COLUMNS.some((c) => (c.key as string) === 'consentRef'), false);
  });

  test('a row correcting a live record is no longer refused for a blank reference', () => {
    const plan = buildPlan({ ...sheet(VALID_ROW), existing: livePublished });
    assert.deepEqual(
      plan.problems.map((p) => p.problem),
      [],
      'a blank reference is no longer a problem for a live record',
    );
    assert.equal(plan.ok, true);
  });

  test('but removing the result permission from a live record still is', () => {
    const plan = buildPlan({
      ...sheet({ ...VALID_ROW, 'permission: show result': 'No' }),
      existing: livePublished,
    });
    assert.equal(plan.ok, false);
    assert.match(plan.problems[0]?.problem ?? '', /removes permission to show the result/i);
  });
});

/* ===========================================================================
 * PHASE 24 — THE SAME SIX QUESTIONS, FOR STORIES AND FOR THE GALLERY
 * ===========================================================================
 * A story and a gallery photograph are the two places where the reference
 * looked most load-bearing, so each assertion below has a matching negative:
 * the permission that remains is checked in both directions, and the public
 * query is read to prove the gate did not simply move somewhere else.
 */

/** A story with story permission granted. `consentResult` is deliberately off. */
function story(overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    studentName: 'Sample Testcase',
    displayNameMode: 'FULL',
    photoUrl: '/photos/zz-test.jpg',
    consentResult: false,
    consentName: true,
    consentPhoto: true,
    consentStory: true,
    published: true,
    ...overrides,
  };
}

/** A gallery photograph showing identifiable people, with permission. */
function photo(overrides: Partial<GalleryRecord> = {}): GalleryRecord {
  return {
    imageUrl: '/media/' + 'b'.repeat(32) + '.jpg',
    showsPeople: true,
    consentPhoto: true,
    published: true,
    ...overrides,
  };
}

describe('A(story) - a story publishes on its own permission alone', () => {
  test('nothing blocks publishing', () => {
    assert.deepEqual(blockersForPublishing(story(), 'consentStory'), []);
  });

  test('and it is publicly visible', () => {
    assert.equal(isPubliclyVisible(story(), 'consentStory'), true);
    assert.equal(present(story(), 'consentStory').name, 'Sample Testcase');
  });
});

describe('B(story) - without story permission, nothing is published or shown', () => {
  test('publishing is blocked, naming the permission', () => {
    const blockers = blockersForPublishing(story({ consentStory: false }), 'consentStory');
    assert.ok(blockers.some((m) => m.includes('Story')));
  });

  test('and nothing is visible', () => {
    const record = story({ consentStory: false });
    assert.equal(isPubliclyVisible(record, 'consentStory'), false);
    assert.equal(present(record, 'consentStory').name, null);
    assert.equal(present(record, 'consentStory').photoUrl, null);
  });

  test('the story query filters on the permission, not on the reference', () => {
    const source = read('src/lib/public-data.ts');
    const clause = source.slice(source.indexOf('const STORY_VISIBLE = {'));
    const body = clause.slice(0, clause.indexOf('} as const;'));
    assert.ok(body.includes('published: true'), 'the published gate is gone');
    assert.ok(body.includes('consentStory: true'), 'the story-permission gate is gone');
    assert.ok(!body.includes('consentRef'), 'the reference is back in the story gate');
  });
});

describe('C+D(story) - name and photograph permissions are untouched', () => {
  test('a story without name permission shows initials only', () => {
    const view = present(story({ consentName: false }), 'consentStory');
    assert.equal(view.name, 'ST');
  });

  test('a story without photograph permission shows no photograph', () => {
    assert.equal(present(story({ consentPhoto: false }), 'consentStory').photoUrl, null);
  });

  test('and neither is implied by the story permission', () => {
    const view = present(story({ consentName: false, consentPhoto: false }), 'consentStory');
    assert.equal(view.name, view.monogram);
    assert.equal(view.photoUrl, null);
  });
});

describe('A+B(gallery) - the photograph permission is the whole gate', () => {
  test('a photograph of people with permission is public', () => {
    assert.equal(isGalleryItemPublic(photo()), true);
    assert.deepEqual(galleryBlockers(photo()), []);
  });

  test('without permission it is not public, and publishing is blocked', () => {
    assert.equal(isGalleryItemPublic(photo({ consentPhoto: false })), false);
    assert.ok(
      galleryBlockers(photo({ consentPhoto: false })).some((b) =>
        /permission to publish/i.test(b),
      ),
    );
  });

  test('an unpublished photograph is still not public', () => {
    assert.equal(isGalleryItemPublic(photo({ published: false })), false);
  });

  test('a photograph with nobody in it still needs no permission', () => {
    assert.equal(isGalleryItemPublic(photo({ showsPeople: false, consentPhoto: false })), true);
  });

  test('the gallery query asks for the permission and nothing else', () => {
    const source = read('src/lib/public-data.ts');
    const query = source.slice(source.indexOf('galleryItem.findMany('));
    const where = code(query.slice(0, query.indexOf('orderBy:')));
    assert.ok(where.includes('showsPeople: false'));
    assert.ok(where.includes('consentPhoto: true'));
    assert.ok(!where.includes('consentRef'), 'the reference is back in the gallery gate');
  });

  test('the path check that hides an unrenderable photograph still runs', () => {
    // Not part of this change, and exactly the kind of thing a rewrite of the
    // predicate drops by accident.
    assert.equal(isGalleryItemPublic(photo({ imageUrl: '/media/x.svg' })), false);
    assert.equal(isGalleryItemPublic(photo({ imageUrl: null })), false);
  });
});

describe('E+F(story, gallery) - no bypass, and no leftover warning', () => {
  test('no blocker on either surface mentions a consent form reference', () => {
    const all = [
      ...blockersForPublishing(story({ consentStory: false }), 'consentStory'),
      ...blockersForPublishing(story({ consentName: false }), 'consentStory'),
      ...galleryBlockers(photo({ consentPhoto: false })),
      ...galleryBlockers(photo({ imageUrl: null })),
    ].join(' ');
    assert.ok(!/consent form reference/i.test(all));
  });

  test('the story and gallery rules no longer read the column at all', () => {
    for (const file of ['src/lib/student-display.ts', 'src/lib/gallery.ts']) {
      const source = code(read(file));
      assert.ok(!/consentRef/.test(source), `${file} still reads consentRef outside a comment`);
    }
  });

  test('the database keeps the permission checks it had', () => {
    const sql = read(
      'prisma/migrations/20260903100000_story_gallery_publish_without_consent_ref/migration.sql',
    );
    assert.match(
      sql,
      /ADD CONSTRAINT "student_stories_published_requires_consent"\s*\n\s*CHECK \(NOT "published" OR "consentStory"\);/,
    );
    assert.match(sql, /ADD CONSTRAINT "gallery_items_published_requires_consent"/);
    assert.match(sql, /"consentPhoto" = true/);

    // The constraints this migration must NOT have touched.
    const statements = sql.replace(/--[^\n]*/g, '');
    for (const untouched of [
      'student_stories_photo_requires_photo_consent',
      'student_stories_name_requires_name_consent',
      'gallery_items_text_printable',
      'toppers_',
    ]) {
      assert.ok(!statements.includes(untouched), `this migration must not touch ${untouched}`);
    }
  });
});
