/**
 * The Review Engine payload normaliser.
 *
 * This is the trust boundary. Everything the engine sends passes through
 * `normalisePayload` before it can reach a page, so every case here is one of
 * two questions: can something unsafe get through, and can something legitimate
 * be lost.
 *
 * The fixture in `fromEngineExample()` is the engine's REAL published example,
 * schema violations and all. If a change to this module ever refuses it, the
 * reviews band would be blank on a correctly-configured site — which is why it
 * is the first test rather than an afterthought.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  normalisePayload,
  REVIEW_LIMITS,
  SUPPORTED_SCHEMA_VERSION,
} from '../src/lib/reviews/payload.ts';

/* ------------------------------------------------------------- builders -- */

function review(over: Record<string, unknown> = {}) {
  return {
    id: 'a'.repeat(32),
    author_name: 'Dana R.',
    author_initials: 'DR',
    rating: 5,
    text: 'Clear teaching and genuinely helpful staff.',
    text_truncated: false,
    date: '2026-07-28',
    source: 'google',
    first_seen_at: '2026-07-28T10:00:00.000Z',
    revision: 1,
    ...over,
  };
}

function payload(over: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    artifact: 'reviews',
    generated_at: '2026-08-01T00:00:00.000Z',
    client: { slug: 'commerce-insight', display_name: 'Commerce Insight' },
    listing: { key: 'google:X', source: 'google', display_name: 'Commerce Insight' },
    provenance: { harvest_completeness: 'full' },
    stats: {
      total_count: 1,
      mean_rating: 4.6,
      completeness: 'full',
      last_full_harvest_at: '2026-08-01T00:00:00.000Z',
    },
    reviews: [review()],
    notices: null,
    ...over,
  };
}

/** The engine's own example shape, including both schema violations. */
function fromEngineExample() {
  return payload({
    reviews: [
      review({
        // 64 hex characters, where the schema declares exactly 32.
        id: 'a1f3c9e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8',
        owner_reply: {
          text: 'Thanks Dana — glad we could help.',
          date: '2026-07-29',
          // An extra key, where the schema declares additionalProperties: false.
          date_precision: 'day',
        },
      }),
    ],
  });
}

const ok = (raw: unknown) => {
  const verdict = normalisePayload(raw);
  assert.equal(verdict.ok, true, verdict.ok ? '' : `refused: ${verdict.reason}`);
  if (!verdict.ok) throw new Error('unreachable');
  return verdict.payload;
};

const refused = (raw: unknown) => {
  const verdict = normalisePayload(raw);
  assert.equal(verdict.ok, false, 'expected a refusal');
  if (verdict.ok) throw new Error('unreachable');
  return verdict.reason;
};

/* ==================================================================== */

describe("the engine's own example is accepted", () => {
  /**
   * The most important test in this file. A consumer that validated strictly
   * against `payload.v1.schema.json` would refuse this — the engine's real
   * output — and the band would silently never render.
   */
  test('a 64-character id is accepted even though the schema says 32', () => {
    const result = ok(fromEngineExample());
    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0]?.id.length, 64);
  });

  test('an unexpected key inside owner_reply does not reject the review', () => {
    const result = ok(fromEngineExample());
    assert.ok(result.reviews[0]?.ownerReply);
    assert.match(result.reviews[0]!.ownerReply!.text, /glad we could help/);
  });

  test('unknown top-level keys are ignored, not fatal', () => {
    const result = ok(payload({ some_future_field: { anything: true } }));
    assert.equal(result.reviews.length, 1);
  });
});

describe('schema version handling', () => {
  test('version 1 is accepted', () => {
    assert.equal(SUPPORTED_SCHEMA_VERSION, 1);
    assert.equal(ok(payload()).reviews.length, 1);
  });

  /**
   * A future version must NOT be read optimistically as v1. Silently
   * reinterpreting a field that changed meaning is the exact failure a version
   * number exists to prevent.
   */
  test('an unknown version is refused, never assumed', () => {
    for (const version of [2, 0, -1, 1.5]) {
      assert.match(refused(payload({ schema_version: version })), /schema_version/);
    }
  });

  test('a missing, null, or string version is refused', () => {
    assert.match(refused(payload({ schema_version: undefined })), /schema_version/);
    assert.match(refused(payload({ schema_version: null })), /schema_version/);
    assert.match(refused(payload({ schema_version: '1' })), /schema_version/);
  });

  test('the refusal reason never contains the payload', () => {
    const reason = refused(payload({ schema_version: 'SECRET-VALUE-abcdef' }));
    assert.ok(!reason.includes('SECRET-VALUE'), reason);
    assert.match(reason, /string\(\d+\)/, 'it should describe the shape, not the value');
  });
});

describe('artifact handling', () => {
  test('reviews and latest carry reviews', () => {
    assert.equal(ok(payload({ artifact: 'reviews' })).reviews.length, 1);
    assert.equal(ok(payload({ artifact: 'latest' })).reviews.length, 1);
  });

  /** A stats artifact has no reviews array; rendering from it gives an empty band. */
  test('stats, schema_org and index artifacts are refused', () => {
    for (const artifact of ['stats', 'schema_org', 'index', 'anything']) {
      assert.match(refused(payload({ artifact })), /artifact/);
    }
  });
});

describe('rubbish input never throws', () => {
  test('every hostile shape is refused calmly', () => {
    const rubbish: unknown[] = [
      null,
      undefined,
      0,
      '',
      'not json at all',
      '<html><body>404</body></html>',
      [],
      [1, 2, 3],
      true,
      { unrelated: 'json' },
      { schema_version: 1 },
      Object.create(null),
    ];
    for (const value of rubbish) {
      assert.doesNotThrow(() => normalisePayload(value), `threw on ${JSON.stringify(value)}`);
      assert.equal(normalisePayload(value).ok, false, `accepted ${JSON.stringify(value)}`);
    }
  });

  /**
   * A payload carrying `__proto__` as a data key must not alter any object's
   * prototype. `JSON.parse` already treats it as a plain key, and nothing here
   * merges objects — this pins that.
   */
  test('a __proto__ key does not pollute anything', () => {
    const hostile = JSON.parse(
      '{"schema_version":1,"artifact":"reviews","__proto__":{"polluted":true},"reviews":[]}',
    );
    normalisePayload(hostile);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });

  test('a reviews field of the wrong type yields no reviews rather than an error', () => {
    for (const reviews of [null, 'reviews', 42, { 0: review() }]) {
      const result = ok(payload({ reviews }));
      assert.equal(result.reviews.length, 0);
    }
  });
});

describe('per-review normalisation', () => {
  test('a review with no usable id is dropped', () => {
    for (const id of [undefined, null, 42, '', 'not-hex', 'zz'.repeat(20), 'a'.repeat(200)]) {
      const result = ok(payload({ reviews: [review({ id })] }));
      assert.equal(result.reviews.length, 0, `accepted id ${JSON.stringify(id)}`);
    }
  });

  test('ratings outside 1-5, or non-integer, become null', () => {
    for (const rating of [0, 6, -1, 4.5, '5', null, undefined, NaN, Infinity]) {
      const result = ok(payload({ reviews: [review({ rating, text: 'Some text.' })] }));
      assert.equal(result.reviews[0]?.rating, null, `accepted rating ${String(rating)}`);
    }
  });

  test('valid ratings survive', () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      assert.equal(ok(payload({ reviews: [review({ rating })] })).reviews[0]?.rating, rating);
    }
  });

  /** `include_rating_only: true` in the client config makes this legitimate. */
  test('a rating with no text is kept', () => {
    const result = ok(payload({ reviews: [review({ text: null, rating: 4 })] }));
    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0]?.text, null);
  });

  test('a review with neither rating nor text is dropped as unrenderable', () => {
    const result = ok(payload({ reviews: [review({ text: null, rating: null })] }));
    assert.equal(result.reviews.length, 0);
  });

  test('over-long text is truncated and flagged, not discarded', () => {
    const long = 'x'.repeat(5000);
    const result = ok(payload({ reviews: [review({ text: long, text_truncated: false })] }));
    assert.equal(result.reviews[0]?.text?.length, REVIEW_LIMITS.maxTextLength);
    assert.equal(result.reviews[0]?.textTruncated, true);
  });

  test("the engine's own truncation flag is respected", () => {
    const result = ok(payload({ reviews: [review({ text: 'Short.', text_truncated: true })] }));
    assert.equal(result.reviews[0]?.textTruncated, true);
  });

  test('an over-long author name is bounded', () => {
    const result = ok(payload({ reviews: [review({ author_name: 'N'.repeat(500) })] }));
    assert.equal(result.reviews[0]?.authorName?.length, REVIEW_LIMITS.maxNameLength);
  });

  test('a non-string author name becomes null rather than "[object Object]"', () => {
    for (const author_name of [42, {}, [], true, null]) {
      const result = ok(payload({ reviews: [review({ author_name })] }));
      assert.equal(result.reviews[0]?.authorName, null);
    }
  });

  test('unparseable or implausible dates become null', () => {
    for (const date of ['', 'yesterday', '0000-00-00', 42, null, {}, '1970-01-01', '2999-01-01']) {
      const result = ok(payload({ reviews: [review({ date })] }));
      assert.equal(result.reviews[0]?.date, null, `accepted date ${JSON.stringify(date)}`);
    }
  });

  test('a real date survives as ISO', () => {
    const result = ok(payload({ reviews: [review({ date: '2026-07-28' })] }));
    assert.match(result.reviews[0]!.date!, /^2026-07-28T/);
  });

  test('a malformed owner_reply is dropped without dropping the review', () => {
    for (const owner_reply of [42, 'text', [], { text: null }, { text: '' }]) {
      const result = ok(payload({ reviews: [review({ owner_reply })] }));
      assert.equal(result.reviews.length, 1);
      assert.equal(result.reviews[0]?.ownerReply, null);
    }
  });
});

describe('avatars never cross the boundary', () => {
  /**
   * INV-01 in `frontend/SAFETY.md` §3: the visitor's browser never contacts a
   * review source. §7 names "lazy-loading avatars from the source's CDN" as the
   * tempting thing that breaks it. So these fields are read and discarded, and
   * this test is what stops somebody adding them back for a nicer-looking card.
   */
  test('no avatar or profile URL appears anywhere in the normalised output', () => {
    const result = ok(
      payload({
        reviews: [
          review({
            author_avatar_url: 'https://lh3.googleusercontent.com/a/AAcHTtd',
            author_profile_url: 'https://www.google.com/maps/contrib/1234',
          }),
        ],
      }),
    );
    const serialised = JSON.stringify(result);
    assert.ok(!serialised.includes('googleusercontent'), serialised);
    assert.ok(!serialised.includes('maps/contrib'), serialised);
    assert.ok(!serialised.includes('http'), 'no URL of any kind should survive');
  });

  test('a javascript: or data: avatar is equally absent', () => {
    const result = ok(
      payload({
        reviews: [
          review({
            author_avatar_url: 'javascript:alert(1)',
            author_profile_url: 'data:text/html,<script>alert(1)</script>',
          }),
        ],
      }),
    );
    const serialised = JSON.stringify(result);
    assert.ok(!serialised.includes('javascript:'), serialised);
    assert.ok(!serialised.includes('data:'), serialised);
  });
});

describe('initials are letters, whatever arrives', () => {
  test('supplied initials are used when they are letters', () => {
    assert.equal(ok(payload({ reviews: [review({ author_initials: 'DR' })] })).reviews[0]?.initials, 'DR');
  });

  test('markup in the initials field is stripped to letters', () => {
    const result = ok(
      payload({ reviews: [review({ author_initials: '<script>x</script>', author_name: 'Dana R.' })] }),
    );
    assert.match(result.reviews[0]!.initials, /^[\p{L}]*$/u);
    assert.ok(!result.reviews[0]!.initials.includes('<'));
  });

  test('initials fall back to the name when the engine supplies none', () => {
    const result = ok(
      payload({ reviews: [review({ author_initials: null, author_name: 'Anita Gupta' })] }),
    );
    assert.equal(result.reviews[0]?.initials, 'AG');
  });

  test('an anonymous reviewer yields empty initials rather than junk', () => {
    const result = ok(
      payload({ reviews: [review({ author_initials: null, author_name: null })] }),
    );
    assert.equal(result.reviews[0]?.initials, '');
  });

  test('initials are bounded', () => {
    const result = ok(payload({ reviews: [review({ author_initials: 'ABCDEFGHIJ' })] }));
    assert.ok(result.reviews[0]!.initials.length <= REVIEW_LIMITS.maxInitialsLength);
  });
});

describe('deduplication and bounds', () => {
  test('duplicate ids collapse to one, keeping the first', () => {
    const result = ok(
      payload({
        reviews: [
          review({ id: 'b'.repeat(32), text: 'First copy.' }),
          review({ id: 'b'.repeat(32), text: 'Second copy.' }),
        ],
      }),
    );
    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0]?.text, 'First copy.');
  });

  /**
   * Two people can write the same sentence. Merging on text would delete
   * somebody's review on a guess, so identity is the engine's documented id and
   * nothing else.
   */
  test('identical text under different ids is NOT merged', () => {
    const result = ok(
      payload({
        reviews: [
          review({ id: 'c'.repeat(32), text: 'Excellent.' }),
          review({ id: 'd'.repeat(32), text: 'Excellent.' }),
        ],
      }),
    );
    assert.equal(result.reviews.length, 2);
  });

  test('the review count is capped', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      review({ id: i.toString(16).padStart(32, '0') }),
    );
    const result = ok(payload({ reviews: many }));
    assert.equal(result.reviews.length, REVIEW_LIMITS.maxReviews);
  });

  test('the cap matches the engine client config (display.latest_count)', () => {
    assert.equal(REVIEW_LIMITS.maxReviews, 20);
  });

  test('normalisation is deterministic', () => {
    const input = fromEngineExample();
    assert.deepEqual(normalisePayload(input), normalisePayload(input));
  });
});

describe('freshness, counts and the publish gate', () => {
  test('a full harvest reports full and keeps the total', () => {
    const result = ok(payload());
    assert.equal(result.freshness.kind, 'full');
    assert.equal(result.totalCount, 1);
  });

  /**
   * Master Plan §13: on a partial harvest the count is labelled "showing recent
   * reviews" rather than presented as a total. Nulling it here means the
   * component has no number to print by accident.
   */
  test('a partial harvest suppresses the total count', () => {
    for (const variant of [
      payload({ stats: { ...payload().stats, completeness: 'partial' } }),
      payload({ stats: { ...payload().stats, completeness: 'full_capped' } }),
      payload({ notices: ['harvest_partial'] }),
      payload({ notices: ['harvest_capped'] }),
    ]) {
      const result = ok(variant);
      assert.equal(result.freshness.kind, 'partial');
      assert.equal(result.totalCount, null);
    }
  });

  test('awaiting_first_full_harvest hides the band entirely', () => {
    assert.match(
      refused(payload({ notices: ['awaiting_first_full_harvest'] })),
      /awaiting_first_full_harvest/,
    );
  });

  test('a failed harvest or unavailable source hides the band entirely', () => {
    assert.ok(refused(payload({ stats: { ...payload().stats, completeness: 'failed' } })));
    assert.ok(refused(payload({ notices: ['source_unavailable'] })));
  });

  test('an implausible mean rating is dropped rather than shown', () => {
    for (const mean_rating of [-1, 6, 'x', null, NaN, Infinity]) {
      const result = ok(payload({ stats: { ...payload().stats, mean_rating } }));
      assert.equal(result.meanRating, null, `accepted ${String(mean_rating)}`);
    }
  });

  test('a valid mean rating is rounded to one decimal', () => {
    assert.equal(ok(payload({ stats: { ...payload().stats, mean_rating: 4.6666 } })).meanRating, 4.7);
  });
});

describe('provenance cannot be forged by the payload', () => {
  test('a google listing is labelled Google', () => {
    assert.equal(ok(payload()).sourceLabel, 'Google');
  });

  /**
   * `listing.source` is a free string in the schema and it reaches the page as
   * a claim about WHERE these came from. Echoing it would let a malformed or
   * hostile payload label its contents as coming from somewhere they did not.
   */
  test('any other source degrades to a true, unspecific label', () => {
    for (const source of [
      'Trustpilot',
      '<script>alert(1)</script>',
      'the institute itself',
      42,
      null,
      { evil: true },
    ]) {
      const result = ok(payload({ listing: { key: 'x', source, display_name: 'x' } }));
      assert.equal(result.sourceLabel, 'a verified review platform', String(source));
    }
  });

  test('the label never contains markup', () => {
    const result = ok(payload({ listing: { key: 'x', source: '<img onerror=x>', display_name: 'y' } }));
    assert.ok(!result.sourceLabel.includes('<'));
  });
});

describe('structured data is never carried across', () => {
  /**
   * The engine can publish a `schema_org` artifact, and `publish.schema_org` is
   * false for this client. Even if a payload arrived carrying one, it must not
   * reach the site: `seo.ts` deliberately omits AggregateRating and Review
   * because marking up another platform's reviews as first-party risks a manual
   * action against the whole domain.
   */
  test('a schema_org block in the payload does not survive normalisation', () => {
    const result = ok(
      payload({
        schema_org: {
          '@type': 'AggregateRating',
          ratingValue: 5,
          reviewCount: 999,
        },
      }),
    );
    const serialised = JSON.stringify(result);
    assert.ok(!serialised.includes('AggregateRating'), serialised);
    assert.ok(!serialised.includes('ratingValue'), serialised);
    assert.ok(!serialised.includes('@type'), serialised);
  });

  test('the normalised type exposes only the fields the page needs', () => {
    const result = ok(fromEngineExample());
    assert.deepEqual(
      Object.keys(result).sort(),
      ['freshness', 'meanRating', 'reviews', 'sourceLabel', 'totalCount'],
    );
    assert.deepEqual(
      Object.keys(result.reviews[0]!).sort(),
      ['authorName', 'date', 'id', 'initials', 'ownerReply', 'rating', 'text', 'textTruncated'],
    );
  });
});

describe('text passes through as text', () => {
  /**
   * Escaping is React's job and it does it on render; the normaliser's job is
   * not to mangle content. What is asserted here is that the payload cannot
   * smuggle a field PAST the normaliser — the rendered-page proof is in
   * scripts/verify-reviews.mjs, which loads the real page in a real browser.
   */
  test('markup in review text is preserved as literal text, not stripped or executed', () => {
    const attack = '<script>window.pwned=1</script><img src=x onerror=alert(1)>';
    const result = ok(payload({ reviews: [review({ text: attack })] }));
    assert.equal(result.reviews[0]?.text, attack);
    assert.equal(typeof result.reviews[0]?.text, 'string');
  });

  test('control characters are stripped from text', () => {
    const result = ok(payload({ reviews: [review({ text: 'Good\u0000 teach\u001Fing.' })] }));
    assert.equal(result.reviews[0]?.text, 'Good teaching.');
  });
});

/* ==================================================== cross-repo drift ==== */

/**
 * The consumer, checked against the ENGINE'S OWN FILE rather than a copy of it.
 *
 * =============================================================================
 * WHY A COPIED FIXTURE IS NOT ENOUGH
 * =============================================================================
 * `fromEngineExample()` above reproduces the engine's published example, schema
 * violations and all, and it is the right first test. But it is a
 * RECONSTRUCTION: it was written by reading the engine once. If the engine
 * changes what it publishes — a new `schema_version`, a restructured review,
 * a renamed field — that fixture keeps passing and this site quietly stops
 * showing reviews on the day the engine is finally switched on.
 *
 * The engine lives beside this repository rather than inside it, so this cannot
 * be a hard dependency. When it is present, its real example is fed through the
 * real normaliser. When it is absent, the test SAYS SO rather than passing
 * silently — a skip nobody can see is how a suite reports coverage it does not
 * have.
 */
describe('the engine payload contract, read from the engine itself', () => {
  const ENGINE_EXAMPLE = fileURLToPath(
    new URL('../../tp-reviews-engine/examples/static/reviews.json', import.meta.url),
  );
  const present = existsSync(ENGINE_EXAMPLE);

  test('the engine repository is beside this one (context, not a failure)', () => {
    if (!present) {
      console.log(
        '    NOT CHECKED: ../tp-reviews-engine is not present on this machine, ' +
          'so the live payload contract was not verified against the engine.',
      );
    }
    assert.ok(true);
  });

  test('the engine publishes the schema version this consumer supports', { skip: !present }, () => {
    const example = JSON.parse(readFileSync(ENGINE_EXAMPLE, 'utf8')) as Record<string, unknown>;
    assert.equal(
      example.schema_version,
      SUPPORTED_SCHEMA_VERSION,
      'the engine has changed schema version. This consumer refuses unknown ' +
        'versions on purpose, so the reviews band would go blank — update the ' +
        'normaliser deliberately rather than widening the check.',
    );
  });

  test('and this consumer ACCEPTS the engine’s real example', { skip: !present }, () => {
    const example = JSON.parse(readFileSync(ENGINE_EXAMPLE, 'utf8'));
    const verdict = normalisePayload(example);
    assert.ok(
      verdict.ok,
      `the normaliser refuses the engine's own published example: ${
        verdict.ok ? '' : verdict.reason
      }`,
    );
  });

  test('and loses none of its reviews', { skip: !present }, () => {
    const example = JSON.parse(readFileSync(ENGINE_EXAMPLE, 'utf8'));
    const verdict = normalisePayload(example);
    if (!verdict.ok) throw new Error(verdict.reason);
    const published = Array.isArray(example.reviews) ? example.reviews.length : 0;
    assert.equal(
      verdict.payload.reviews.length,
      published,
      'the consumer dropped reviews the engine published. Each one dropped is a ' +
        'real review a visitor will not see.',
    );
  });
});
