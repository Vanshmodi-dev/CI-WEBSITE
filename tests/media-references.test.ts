/**
 * Does the deletion guard know about every photograph on the site?
 *
 * =============================================================================
 * THE DEFECT THIS TEST WOULD HAVE CAUGHT, TWO PHASES EARLIER
 * =============================================================================
 * `MEDIA_CONSUMERS` lists the places a photograph can be referenced from. The
 * library page shows usage from it and the delete action refuses from it, so
 * whatever it omits is a photograph that can be destroyed while a live page is
 * still pointing at it.
 *
 * For two phases it omitted two of four. Nothing failed: Topic 6 added teacher
 * photographs and Topic 8 added gallery images, both with full suites of their
 * own, and neither suite had any reason to ask what the PHOTO LIBRARY thought
 * about them. A query aimed at the wrong tables returns zero, and zero is a
 * perfectly good-looking answer.
 *
 * So this test does not check the list against another list written by the same
 * person on the same day. It reads `prisma/schema.prisma` — the schema is what
 * actually decides which columns can hold a photo path — and fails if a model
 * grows one that nobody declared.
 *
 * ⚠ IF THIS TEST FAILS BECAUSE YOU ADDED A PHOTO COLUMN: add the consumer to
 * `MEDIA_CONSUMERS`. Do not add the model to the ignore list below unless the
 * column genuinely cannot hold a `/media/...` path, and say why in one line.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  MEDIA_CONSUMERS,
  describeUsage,
  type MediaConsumer,
} from '../src/lib/media/consumers.ts';

const schema = readFileSync(
  fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
  'utf8',
);

/** Prisma model name -> the lower-camel accessor `prisma.<name>`. */
const accessor = (model: string) => model.slice(0, 1).toLowerCase() + model.slice(1);

/**
 * Every `model X { ... }` block, with its field names.
 *
 * A deliberately small parser: it only needs to find columns, and a real Prisma
 * parse would be a dependency added to answer a question this can answer.
 */
function models(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const [, name, body] of schema.matchAll(re)) {
    if (name === undefined || body === undefined) continue;
    const fields: string[] = [];
    for (const line of body.split('\n')) {
      const field = /^\s{2,}(\w+)\s+\S/.exec(line)?.[1];
      const trimmed = line.trimStart();
      if (field && !trimmed.startsWith('//') && !trimmed.startsWith('@@')) {
        fields.push(field);
      }
    }
    found.set(name, fields);
  }
  return found;
}

/**
 * Columns that LOOK like a photo path but are not one.
 *
 * `MediaAsset.key` is the file's own identity, not a reference to it — the
 * library row IS the photograph, so counting it as a user of itself would make
 * every photograph permanently undeletable.
 */
const NOT_A_REFERENCE = new Set(['MediaAsset']);

describe('MEDIA_CONSUMERS covers the schema', () => {
  test('the schema parser actually found the models (control)', () => {
    const all = models();
    // If this parser silently matched nothing, every assertion below would
    // pass vacuously. These four are the models the phase reasoned about.
    assert.ok(all.size >= 10, `expected the schema to parse; got ${all.size} models`);
    for (const name of ['Topper', 'StudentStory', 'Faculty', 'GalleryItem']) {
      assert.ok(all.has(name), `${name} should be in the parsed schema`);
    }
    assert.ok(all.get('GalleryItem')?.includes('imageUrl'));
  });

  test('every model with a photo column is a declared consumer', () => {
    const declared = new Set(MEDIA_CONSUMERS.map((c) => `${c.model}.${c.column}`));
    const missing: string[] = [];

    for (const [model, fields] of models()) {
      if (NOT_A_REFERENCE.has(model)) continue;
      for (const field of fields) {
        // The two names this project uses for "a site-relative /media path".
        if (field !== 'photoUrl' && field !== 'imageUrl') continue;
        const key = `${accessor(model)}.${field}`;
        if (!declared.has(key)) missing.push(`${model}.${field}`);
      }
    }

    assert.deepEqual(
      missing,
      [],
      'These columns can hold a photograph and nothing counts them as a use. ' +
        'A photo referenced only from here can be deleted from the library ' +
        'while a live page still shows it. Add them to MEDIA_CONSUMERS.',
    );
  });

  test('every declared consumer really exists in the schema', () => {
    // The other direction: a consumer naming a column that has been renamed
    // would silently count nothing, which is the same failure wearing a
    // different hat.
    const all = models();
    for (const c of MEDIA_CONSUMERS) {
      const model = [...all.keys()].find((name) => accessor(name) === c.model);
      assert.ok(model, `MEDIA_CONSUMERS names a model that is not in the schema: ${c.model}`);
      assert.ok(
        all.get(model)?.includes(c.column),
        `${model} has no column ${c.column}`,
      );
    }
  });

  test('the four known consumers are all declared', () => {
    // Spelled out rather than derived, so a parser that stopped finding photo
    // columns cannot make the test above pass by finding nothing.
    const declared = MEDIA_CONSUMERS.map((c) => `${c.model}.${c.column}`).sort();
    assert.deepEqual(declared, [
      'faculty.photoUrl',
      'galleryItem.imageUrl',
      'studentStory.photoUrl',
      'topper.photoUrl',
    ]);
  });
});

describe('describeUsage — what the refusal says', () => {
  /** Non-null: the list is a literal above and the schema test proves its shape. */
  const consumer = (i: number): MediaConsumer => {
    const c = MEDIA_CONSUMERS[i];
    if (!c) throw new Error(`MEDIA_CONSUMERS has no entry ${i}`);
    return c;
  };

  test('nothing at all', () => {
    assert.equal(describeUsage({ total: 0, parts: [] }), 'nothing');
  });

  test('one kind, singular', () => {
    assert.equal(
      describeUsage({ total: 1, parts: [{ consumer: consumer(2), count: 1 }] }),
      '1 teacher',
    );
  });

  test('one kind, plural', () => {
    assert.equal(
      describeUsage({ total: 3, parts: [{ consumer: consumer(2), count: 3 }] }),
      '3 teachers',
    );
  });

  test('two kinds read as a sentence, not a number', () => {
    assert.equal(
      describeUsage({
        total: 3,
        parts: [
          { consumer: consumer(2), count: 2 },
          { consumer: consumer(3), count: 1 },
        ],
      }),
      '2 teachers and 1 gallery photo',
    );
  });

  test('three kinds use a comma before the final "and"', () => {
    assert.equal(
      describeUsage({
        total: 4,
        parts: [
          { consumer: consumer(0), count: 1 },
          { consumer: consumer(2), count: 2 },
          { consumer: consumer(3), count: 1 },
        ],
      }),
      '1 student result, 2 teachers and 1 gallery photo',
    );
  });
});
