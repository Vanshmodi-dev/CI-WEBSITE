import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isGalleryItemPublic,
  galleryBlockers,
  describeVisibility,
  isGalleryCategory,
  GALLERY_CATEGORIES,
  CATEGORY_LABEL,
  type GalleryRecord,
} from '../src/lib/gallery.ts';

/**
 * The gallery visibility rule.
 *
 * These are the tests that matter most in Topic 8. Everything else it builds is
 * a page; this is the function that decides whether a photograph of somebody
 * else's child appears on the internet.
 *
 * `docs/design/STUDENT-DATA-POLICY.md` is the specification being tested:
 *
 *   - publication is not authorised until a specific record says otherwise
 *   - a published record cannot have a null consent reference
 *   - photograph permission is never implied by anything else
 */

const VALID = '/media/' + 'a'.repeat(32) + '.jpg';

function record(over: Partial<GalleryRecord> = {}): GalleryRecord {
  return {
    imageUrl: VALID,
    showsPeople: true,
    consentRef: 'CI-2026-014',
    consentPhoto: true,
    published: true,
    ...over,
  };
}

describe('isGalleryItemPublic', () => {
  test('a fully consented, published photograph is public', () => {
    // The POSITIVE CONTROL. Without it, every assertion below could pass
    // because the function returns false for everything.
    assert.equal(isGalleryItemPublic(record()), true);
  });

  test('an unpublished photograph is not public, however complete its consent', () => {
    assert.equal(isGalleryItemPublic(record({ published: false })), false);
  });

  test('a photograph of people with no consent reference is not public', () => {
    assert.equal(isGalleryItemPublic(record({ consentRef: null })), false);
  });

  test('a blank or whitespace consent reference is not a consent reference', () => {
    assert.equal(isGalleryItemPublic(record({ consentRef: '' })), false);
    assert.equal(isGalleryItemPublic(record({ consentRef: '   ' })), false);
    assert.equal(isGalleryItemPublic(record({ consentRef: '\t\n ' })), false);
  });

  test('photograph permission is never implied by having a reference on file', () => {
    // The policy is explicit that the four permissions are independent
    // questions rather than a ladder. Holding a form is not permission.
    assert.equal(isGalleryItemPublic(record({ consentPhoto: false })), false);
  });

  test('a photograph with nobody in it needs no consent at all', () => {
    assert.equal(
      isGalleryItemPublic(
        record({ showsPeople: false, consentRef: null, consentPhoto: false }),
      ),
      true,
    );
  });

  test('an unrenderable path hides the item even when consent is complete', () => {
    /*
      This is the case the database CHECK constraint CANNOT catch, and the
      reason the read path re-checks at all. `/media/x.svg` starts with a slash,
      contains no traversal and no backslash, so it satisfies
      `gallery_items_image_is_site_relative` — and `isSafePhotoPath` refuses it,
      because SVG is not in the allowed format list.
    */
    assert.equal(isGalleryItemPublic(record({ imageUrl: '/media/x.svg' })), false);
    assert.equal(isGalleryItemPublic(record({ imageUrl: '/media/x.html' })), false);
  });

  test('an absolute, protocol-relative or traversing path hides the item', () => {
    for (const bad of [
      'https://evil.example/x.jpg',
      'http://evil.example/x.jpg',
      '//evil.example/x.jpg',
      '/media/../../etc/passwd.jpg',
      '/media/..%2f..%2fx.jpg',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '/media/x.jpg?a=b',
      '/media/x.jpg#frag',
      '/media/with space.jpg',
      String.raw`\media\x.jpg`,
    ]) {
      assert.equal(
        isGalleryItemPublic(record({ imageUrl: bad })),
        false,
        `should have refused ${bad}`,
      );
    }
  });

  test('a missing path hides the item', () => {
    assert.equal(isGalleryItemPublic(record({ imageUrl: null })), false);
    assert.equal(isGalleryItemPublic(record({ imageUrl: '' })), false);
  });
});

describe('galleryBlockers', () => {
  test('a publishable photograph has no blockers', () => {
    assert.deepEqual(galleryBlockers(record()), []);
  });

  test('a people-free photograph has no blockers without consent', () => {
    assert.deepEqual(
      galleryBlockers(record({ showsPeople: false, consentRef: null, consentPhoto: false })),
      [],
    );
  });

  test('a missing reference and a missing tick are reported separately', () => {
    const blockers = galleryBlockers(record({ consentRef: null, consentPhoto: false }));
    assert.equal(blockers.length, 2);
    // Each names the control to use, because a teacher cannot act on a
    // constraint name.
    assert.ok(blockers.some((b) => /consent form reference/i.test(b)));
    assert.ok(blockers.some((b) => /permission to publish/i.test(b)));
  });

  test('a missing photograph is a blocker in its own right', () => {
    const blockers = galleryBlockers(record({ imageUrl: null }));
    assert.ok(blockers.some((b) => /needs one/i.test(b)));
  });

  test('an unsafe path is reported as a path problem, not a consent problem', () => {
    const blockers = galleryBlockers(record({ imageUrl: '/media/x.svg' }));
    assert.ok(blockers.some((b) => /Choose photo/i.test(b)));
    assert.ok(!blockers.some((b) => /consent/i.test(b)));
  });

  test('no blocker text leaks a constraint name or a column name', () => {
    // A teacher should never meet `gallery_items_published_requires_consent`.
    const all = [
      ...galleryBlockers(record({ consentRef: null, consentPhoto: false })),
      ...galleryBlockers(record({ imageUrl: null })),
      ...galleryBlockers(record({ imageUrl: '/media/x.svg' })),
    ].join(' ');
    for (const leak of ['gallery_items', 'consentRef', 'consentPhoto', 'showsPeople', 'NULL']) {
      assert.ok(!all.includes(leak), `blocker text leaked ${leak}`);
    }
  });
});

describe('describeVisibility', () => {
  test('a public photograph says so', () => {
    const v = describeVisibility(record());
    assert.equal(v.public, true);
    assert.match(v.summary, /On the website/i);
  });

  test('a people-free public photograph says why it needs no consent', () => {
    const v = describeVisibility(
      record({ showsPeople: false, consentRef: null, consentPhoto: false }),
    );
    assert.equal(v.public, true);
    assert.match(v.summary, /nobody identifiable/i);
  });

  test('a draft says what to do next', () => {
    const v = describeVisibility(record({ published: false, consentPhoto: false }));
    assert.equal(v.public, false);
    assert.match(v.summary, /Not on the website/i);
  });

  test('marked published but not showing is reported as exactly that', () => {
    /*
      The state a teacher would otherwise never discover. It is reachable: the
      CHECK constraint permits `/media/x.svg` on a published row, and the read
      path then refuses to render it. Saying "published" here would be the admin
      telling a comfortable lie about a page that shows nothing.
    */
    const v = describeVisibility(record({ imageUrl: '/media/x.svg' }));
    assert.equal(v.public, false);
    assert.match(v.summary, /NOT showing/i);
  });
});

describe('isGalleryCategory', () => {
  test('accepts every category in the closed set', () => {
    for (const c of GALLERY_CATEGORIES) assert.equal(isGalleryCategory(c), true);
  });

  test('refuses anything else, and never throws on a strange type', () => {
    for (const bad of [
      'CLASSROOM',
      'classrooms',
      'ALL',
      '',
      ' CLASSROOMS ',
      'CLASSROOMS; DROP TABLE gallery_items',
      null,
      undefined,
      42,
      {},
      [],
      // A repeated query parameter arrives as an array, which must degrade to
      // "no filter" rather than reaching Prisma.
      ['CLASSROOMS', 'EVENTS'],
    ]) {
      assert.equal(isGalleryCategory(bad), false, `should have refused ${JSON.stringify(bad)}`);
    }
  });

  test('every category has a human label', () => {
    for (const c of GALLERY_CATEGORIES) {
      assert.equal(typeof CATEGORY_LABEL[c], 'string');
      assert.ok(CATEGORY_LABEL[c].length > 0);
      // The label is what a visitor reads; it must not be the enum value.
      assert.notEqual(CATEGORY_LABEL[c], c);
    }
  });

  test('"All" is not a stored category', () => {
    // It is the absence of a filter. Storing it would let a photograph belong
    // to a category the filter also uses to mean "everything".
    assert.equal(isGalleryCategory('ALL'), false);
  });
});
