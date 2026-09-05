/**
 * The picture on an unfurled link.
 *
 * =============================================================================
 * THE DEFECT THIS FILE EXISTS TO KEEP FIXED
 * =============================================================================
 * Every public page declared `twitter:card = summary_large_image` - a card
 * format that is nothing but a large picture - and not one of them emitted an
 * image. `pageMetadata()` never set one, and no `opengraph-image` file existed.
 * So every link the institute pasted into a WhatsApp group, which Master Plan
 * section 07 makes the primary conversion path, unfurled as a grey rectangle.
 *
 * It survived twenty-five phases because it is invisible from inside the
 * product. No page renders `og:image`, no component reads it, and the only
 * place the failure is visible is somebody else's chat window. Nothing in the
 * repository had ever read the metadata a page actually emits.
 *
 * Two of the tests below are therefore about the SHAPE of the codebase rather
 * than about a function: that every public page still routes its metadata
 * through the wrapper that attaches the picture, and that the generated card is
 * really on disk at the size the code promises. Both are the kind of thing that
 * silently stops being true when somebody adds the fifteenth page.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  cleanValue,
  fieldFor,
  resolveContent,
  validateValue,
  validateShareImage,
  SHARE_CARD_PATH,
  SHARE_CARD_SIZE,
  type EditableField,
} from '../src/config/site-content.ts';

const KEY = 'seo.shareImage';

const shareField = (): EditableField => {
  const f = fieldFor(KEY);
  assert.ok(f, `${KEY} is missing from the registry`);
  return f;
};

/** A well-formed key from the media pipeline: 32 hex characters and an ext. */
const MEDIA = '/media/0123456789abcdef0123456789abcdef.jpg';

describe('validateShareImage decides what other people’s servers may fetch', () => {
  test('our own generated card is accepted', () => {
    assert.equal(validateShareImage(SHARE_CARD_PATH), null);
  });

  test('a photograph from the upload pipeline is accepted', () => {
    assert.equal(validateShareImage(MEDIA), null);
    assert.equal(validateShareImage('/media/ffffffffffffffffffffffffffffffff.webp'), null);
    assert.equal(validateShareImage('/media/00000000000000000000000000000000.avif'), null);
    assert.equal(validateShareImage('/media/0123456789abcdef0123456789abcdef.png'), null);
  });

  /**
   * THE CASE THE FIELD EXISTS TO REFUSE.
   *
   * `og:image` is published to other people's servers under the institute's
   * name. A value that accepted a remote URL would let this one row put any
   * picture, from any host, on a card beside the institute's brand - without it
   * ever appearing on a page where somebody would notice.
   */
  test('a remote URL is refused, however it is dressed up', () => {
    for (const bad of [
      'https://example.invalid/photo.jpg',
      'http://example.invalid/photo.jpg',
      '//example.invalid/photo.jpg',
      'HTTPS://EXAMPLE.INVALID/photo.jpg',
      'https://example.invalid/media/0123456789abcdef0123456789abcdef.jpg',
      'data:image/png;base64,iVBORw0KGgo=',
      'javascript:alert(1)',
      'file:///etc/passwd',
    ]) {
      assert.notEqual(validateShareImage(bad), null, `${bad} was accepted`);
    }
  });

  test('a path that is not a media key is refused', () => {
    for (const bad of [
      '',
      '/media/',
      '/media/not-a-key.jpg',
      // Traversal, in the two forms the media route also refuses.
      '/media/../../etc/passwd',
      '/media/0123456789abcdef0123456789abcdef.jpg/../../secret',
      // A real key with an extension the pipeline never issues.
      '/media/0123456789abcdef0123456789abcdef.svg',
      '/media/0123456789abcdef0123456789abcdef.html',
      // Uppercase hex: the pipeline emits lowercase, so this is not ours.
      '/media/0123456789ABCDEF0123456789ABCDEF.jpg',
      // Too short and too long by one.
      '/media/0123456789abcdef0123456789abcde.jpg',
      '/media/0123456789abcdef0123456789abcdef0.jpg',
      // Another static asset is still not the share card.
      '/brand/commerce-insight-logo.jpg',
      '/favicon.ico',
    ]) {
      assert.notEqual(validateShareImage(bad), null, `${bad} was accepted`);
    }
  });

  test('the refusal tells the teacher what to do instead', () => {
    const message = validateShareImage('https://example.invalid/x.jpg');
    assert.ok(message);
    assert.match(message, /uploaded|clear/i);
  });
});

describe('cleaning a media value', () => {
  test('whitespace from a copy-paste is removed rather than collapsed', () => {
    const f = shareField();
    assert.equal(cleanValue(f, `  ${MEDIA}  `), MEDIA);
    assert.equal(cleanValue(f, `/media/0123456789abcdef01234\n56789abcdef.jpg`), MEDIA);
  });

  test('control characters are stripped', () => {
    const f = shareField();
    assert.equal(cleanValue(f, `${MEDIA}`), MEDIA);
    assert.equal(cleanValue(f, `${MEDIA}`), MEDIA);
  });

  /**
   * A truncated sentence is a shorter sentence; a truncated path is a broken
   * one. So an over-long value survives cleaning intact and is refused by
   * `validateValue` with a message, rather than being cut down to something
   * that would 404 inside somebody's chat window.
   */
  test('an over-long value is refused, not silently truncated', () => {
    const f = shareField();
    const tooLong = `/media/${'a'.repeat(f.maxLength + 50)}.jpg`;
    const cleaned = cleanValue(f, tooLong);
    assert.equal(cleaned, tooLong, 'the value was truncated');
    assert.notEqual(validateValue(f, cleaned), null, 'an over-long value was accepted');
  });

  test('a non-string never throws', () => {
    const f = shareField();
    for (const junk of [null, undefined, 42, {}, [], true]) {
      assert.equal(cleanValue(f, junk), '');
    }
  });
});

describe('clearing the field restores the brand card, never nothing', () => {
  /**
   * ⚠ THE WHOLE POINT OF THIS FIELD NOT BEING `blankable`.
   *
   * Every other optional field on this site renders nothing when empty, and
   * nothing is right for an absent phone number. It is wrong here, because "no
   * share image" is the exact defect the field was added to fix. So an empty
   * value resolves to the generated card - the registry's usual "clearing a box
   * is an undo" rule, pointed at a safe default instead of at silence.
   */
  test('the field is deliberately not blankable', () => {
    assert.equal(shareField().blankable, undefined);
  });

  test('an empty store yields the brand card', () => {
    assert.equal(resolveContent({})[KEY], SHARE_CARD_PATH);
  });

  test('a stored empty value is an undo, not a blanking', () => {
    assert.equal(resolveContent({ [KEY]: '' })[KEY], SHARE_CARD_PATH);
    assert.equal(resolveContent({ [KEY]: '   ' })[KEY], SHARE_CARD_PATH);
  });

  test('a chosen photograph wins over the fallback', () => {
    assert.equal(resolveContent({ [KEY]: MEDIA })[KEY], MEDIA);
  });

  test('the declared fallback is the card, and it validates', () => {
    assert.equal(shareField().fallback, SHARE_CARD_PATH);
    assert.equal(validateShareImage(shareField().fallback), null);
  });
});

/* ------------------------------------------------------- the asset itself -- */

const ROOT = join(import.meta.dirname, '..');

/**
 * The card on disk must match the size the code announces.
 *
 * `og:image:width` and `og:image:height` are emitted from `SHARE_CARD_SIZE`, so
 * if somebody regenerates the artwork at another size those two numbers become
 * a lie told to every chat client that reads them - and the visible result is a
 * stretched card, which nobody would trace back to a constant in a config file.
 *
 * The dimensions are read straight out of the PNG header rather than with an
 * image library, because these tests run in plain Node where `sharp` is not
 * available. A PNG's IHDR chunk always starts at byte 8, and its width and
 * height are the two big-endian uint32s at bytes 16 and 20.
 */
describe('the generated share card', () => {
  const bytes = readFileSync(join(ROOT, 'public', SHARE_CARD_PATH));

  test('exists at the path the registry points at', () => {
    assert.ok(bytes.byteLength > 0);
  });

  test('is a PNG of exactly the declared size', () => {
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(bytes.readUInt32BE(16), SHARE_CARD_SIZE.width);
    assert.equal(bytes.readUInt32BE(20), SHARE_CARD_SIZE.height);
  });

  /**
   * 1.91:1 is what Facebook, WhatsApp and X all crop toward. This is not a
   * style preference: a square card is letterboxed with grey bars by some
   * clients and centre-cropped by others, so the mark can lose its tagline.
   */
  test('is the landscape ratio the platforms crop to', () => {
    const ratio = SHARE_CARD_SIZE.width / SHARE_CARD_SIZE.height;
    assert.ok(ratio > 1.85 && ratio < 1.95, `ratio is ${ratio}`);
  });

  /** Facebook refuses above 8MB and Next fails the build above it. */
  test('is small enough for every consumer', () => {
    assert.ok(bytes.byteLength < 5 * 1024 * 1024, `${bytes.byteLength} bytes`);
  });
});

/* --------------------------------------------------- every page is covered -- */

/**
 * EVERY PUBLIC PAGE STILL ATTACHES THE PICTURE.
 *
 * This is the assertion that would have caught the original defect, and it is
 * the one that keeps it fixed. The image is resolved by `publicPageMetadata()`;
 * a page that calls the underlying `pageMetadata()` directly compiles, renders,
 * passes every other test in this repository, and silently unfurls as a grey
 * rectangle. That is exactly how the site shipped twenty-five phases without
 * an `og:image`.
 *
 * Written against the SOURCE rather than against rendered output on purpose:
 * the rendered check needs a running server and a database, and the failure it
 * guards against is somebody adding a page, which is a source-level event.
 */
describe('no public page can ship without a share card', () => {
  const siteDir = join(ROOT, 'src', 'app', '(site)');

  /**
   * Comments have to go before the source is scanned.
   *
   * Several of these pages DISCUSS `pageMetadata(...)` in prose - /gallery and
   * /videos both carry a warning about passing `canonical` and `robots` into it
   * rather than spreading it - and a scan that counted those would fail on
   * correct files, which is the fastest way to get an assertion deleted.
   *
   * `//` is left alone when it follows a colon so that a `https://` inside a
   * string survives. That is a heuristic and it is allowed to be: the worst it
   * can do is leave text in place, and leftover text can only make this test
   * fail loudly, never pass quietly.
   */
  const stripComments = (source: string): string =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
      .join('\n');

  const pages: { route: string; source: string }[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}/${entry}`);
      } else if (entry === 'page.tsx') {
        pages.push({
          route: prefix === '' ? '/' : prefix,
          source: stripComments(readFileSync(full, 'utf8')),
        });
      }
    }
  };
  walk(siteDir, '');

  test('there are public pages to check', () => {
    assert.ok(pages.length >= 12, `found only ${pages.length}`);
  });

  test('every one of them resolves its metadata through publicPageMetadata', () => {
    for (const page of pages) {
      assert.ok(
        page.source.includes('publicPageMetadata('),
        `${page.route} does not call publicPageMetadata, so a link to it unfurls with no picture`,
      );
    }
  });

  /**
   * And nothing calls the picture-less version directly. `pageMetadata` stays
   * exported because `publicPageMetadata` is built on it and the unit tests
   * reach it, but a PAGE calling it is the defect returning.
   */
  test('no page calls the picture-less pageMetadata directly', () => {
    for (const page of pages) {
      const direct = /(?<!public)(?<![A-Za-z])pageMetadata\(/.exec(page.source);
      assert.equal(
        direct,
        null,
        `${page.route} calls pageMetadata() directly instead of publicPageMetadata()`,
      );
    }
  });
});
