/**
 * Media validation — the pure half.
 *
 * Everything here decides whether a file a stranger produced is allowed to
 * become a picture on a website that publishes photographs of children. Each
 * case is one of two questions: can something get through that should not, and
 * can something legitimate be refused.
 *
 * The pipeline that decodes and re-encodes lives behind `server-only` and is
 * exercised over real HTTP in `scripts/verify-media.mjs`, because a decoder can
 * only be trusted by feeding it actual bytes through the actual endpoint. What
 * is unit-testable is the part that runs BEFORE the decoder — and that is the
 * part an attacker meets first.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_FORMATS,
  CONTENT_TYPE_FOR,
  EXTENSION_FOR,
  MEDIA_LIMITS,
  MEDIA_KEY_PATTERN,
  checkDimensions,
  checkSize,
  decideFormat,
  isMediaKey,
  keyFromPath,
  looksLikeSvg,
  mediaPath,
  sniffFormat,
} from '../src/lib/media/format.ts';

/* ------------------------------------------------------------- fixtures -- */

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

const concat = (...parts: Uint8Array[]) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** Real signatures, padded so length checks are not what does the work. */
const PADDING = new Uint8Array(64);

const JPEG = concat(bytes(0xff, 0xd8, 0xff, 0xe0), PADDING);
const PNG = concat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), PADDING);
const WEBP = concat(ascii('RIFF'), bytes(0x24, 0, 0, 0), ascii('WEBPVP8 '), PADDING);
const AVIF = concat(bytes(0, 0, 0, 0x20), ascii('ftypavif'), PADDING);
const AVIS = concat(bytes(0, 0, 0, 0x20), ascii('ftypavis'), PADDING);

describe('sniffFormat reads the bytes, not the name', () => {
  test('recognises each allowed format', () => {
    assert.equal(sniffFormat(JPEG), 'jpeg');
    assert.equal(sniffFormat(PNG), 'png');
    assert.equal(sniffFormat(WEBP), 'webp');
    assert.equal(sniffFormat(AVIF), 'avif');
    assert.equal(sniffFormat(AVIS), 'avif');
  });

  /**
   * The headline case. Every one of these is a real file type an attacker
   * renames to `.jpg`, and the extension is what a naive implementation trusts.
   */
  test('refuses every dangerous type, whatever it is called', () => {
    const hostile: Record<string, Uint8Array> = {
      'Windows executable': concat(ascii('MZ'), PADDING),
      'ELF executable': concat(bytes(0x7f), ascii('ELF'), PADDING),
      'shell script': concat(ascii('#!/bin/sh\nrm -rf /'), PADDING),
      'ZIP / Office / JAR': concat(ascii('PK'), bytes(3, 4), PADDING),
      PDF: concat(ascii('%PDF-1.7'), PADDING),
      HTML: concat(ascii('<!DOCTYPE html><html><script>alert(1)</script>'), PADDING),
      JavaScript: concat(ascii('window.location="http://evil"'), PADDING),
      SVG: concat(ascii('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), PADDING),
      'XML entity attack': concat(ascii('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY'), PADDING),
      GIF: concat(ascii('GIF89a'), PADDING),
      BMP: concat(ascii('BM'), PADDING),
      TIFF: concat(bytes(0x49, 0x49, 0x2a, 0x00), PADDING),
      'RIFF but not WebP (a WAV)': concat(ascii('RIFF'), bytes(0x24, 0, 0, 0), ascii('WAVEfmt '), PADDING),
      'ftyp but not AVIF (an MP4)': concat(bytes(0, 0, 0, 0x20), ascii('ftypisom'), PADDING),
      'HEIC, which is not AVIF': concat(bytes(0, 0, 0, 0x20), ascii('ftypheic'), PADDING),
    };

    for (const [what, content] of Object.entries(hostile)) {
      assert.equal(sniffFormat(content), null, `${what} was accepted`);
    }
  });

  test('a truncated or empty file is refused rather than guessed at', () => {
    assert.equal(sniffFormat(new Uint8Array(0)), null);
    assert.equal(sniffFormat(bytes(0xff)), null);
    assert.equal(sniffFormat(bytes(0xff, 0xd8)), null, 'two of three JPEG bytes is not a JPEG');
    assert.equal(sniffFormat(ascii('RIFF')), null, 'RIFF alone is not WebP');
  });

  /**
   * A polyglot's whole trick is being two things at once. The header is what
   * decides here; the decode-and-re-encode in `ingest.ts` is what removes the
   * appended half, and that is proven over HTTP.
   */
  test('a JPEG with a payload appended still sniffs as a JPEG', () => {
    const polyglot = concat(JPEG, ascii('<script>alert(1)</script>'));
    assert.equal(sniffFormat(polyglot), 'jpeg');
  });

  test('never throws on any input shape', () => {
    for (const bad of [new Uint8Array(0), bytes(0), bytes(255, 255, 255)]) {
      assert.doesNotThrow(() => sniffFormat(bad));
    }
  });
});

describe('decideFormat produces a message a teacher can act on', () => {
  test('accepts the four allowed formats', () => {
    for (const [content, expected] of [
      [JPEG, 'jpeg'],
      [PNG, 'png'],
      [WEBP, 'webp'],
      [AVIF, 'avif'],
    ] as const) {
      const verdict = decideFormat(content);
      assert.equal(verdict.ok, true);
      if (verdict.ok) assert.equal(verdict.format, expected);
    }
  });

  test('an SVG is refused BY NAME, not with a generic message', () => {
    const verdict = decideFormat(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.match(verdict.message, /SVG/);
      assert.match(verdict.message, /code/i, 'the message should say why, not just no');
    }
  });

  test('an XML-declared SVG is also recognised as one', () => {
    const verdict = decideFormat(ascii('<?xml version="1.0"?>\n<svg width="1"></svg>'));
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.match(verdict.message, /SVG/);
  });

  test('an empty file says so plainly', () => {
    const verdict = decideFormat(new Uint8Array(0));
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.match(verdict.message, /empty/i);
  });

  test('a renamed executable is told that renaming changed nothing', () => {
    const verdict = decideFormat(concat(ascii('MZ'), PADDING));
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.match(verdict.message, /renamed/i);
  });
});

describe('looksLikeSvg', () => {
  test('sees through a byte-order mark and leading whitespace', () => {
    assert.equal(looksLikeSvg(concat(bytes(0xef, 0xbb, 0xbf), ascii('<svg>'))), true);
    assert.equal(looksLikeSvg(ascii('\n\n   <svg width="1">')), true);
    assert.equal(looksLikeSvg(ascii('  <?xml version="1.0"?>')), true);
  });

  test('is case-insensitive, because the tag can be written either way', () => {
    assert.equal(looksLikeSvg(ascii('<SVG XMLNS="...">')), true);
  });

  test('does not mistake a real image for one', () => {
    assert.equal(looksLikeSvg(JPEG), false);
    assert.equal(looksLikeSvg(PNG), false);
  });
});

describe('checkSize runs before the bytes are read', () => {
  test('zero is refused', () => {
    assert.equal(checkSize(0).ok, false);
  });

  test('one byte under, exactly at, and one byte over the limit', () => {
    assert.equal(checkSize(MEDIA_LIMITS.maxBytes - 1).ok, true);
    assert.equal(checkSize(MEDIA_LIMITS.maxBytes).ok, true, 'the limit itself must be allowed');
    assert.equal(checkSize(MEDIA_LIMITS.maxBytes + 1).ok, false);
  });

  test('the refusal states both the actual size and the limit', () => {
    const verdict = checkSize(20 * 1024 * 1024);
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.match(verdict.message, /20\.0 MB/);
      assert.match(verdict.message, /6 MB/);
    }
  });

  /** Whichever cap is lower is the one a teacher meets, and ours must be. */
  test('the media limit sits below the framework body limit', () => {
    assert.ok(MEDIA_LIMITS.maxBytes < 8 * 1024 * 1024);
  });
});

describe('checkDimensions guards against image bombs', () => {
  test('a normal photograph passes', () => {
    assert.equal(checkDimensions(4032, 3024).ok, true);
  });

  test('missing or nonsensical dimensions are refused', () => {
    assert.equal(checkDimensions(undefined, undefined).ok, false);
    assert.equal(checkDimensions(0, 100).ok, false);
    assert.equal(checkDimensions(100, 0).ok, false);
    assert.equal(checkDimensions(-5, 100).ok, false);
  });

  test('either side beyond the cap is refused', () => {
    assert.equal(checkDimensions(MEDIA_LIMITS.maxWidth + 1, 100).ok, false);
    assert.equal(checkDimensions(100, MEDIA_LIMITS.maxHeight + 1).ok, false);
  });

  /**
   * The two caps are not the same check. 7000x7000 is inside both side limits
   * and is 49 megapixels — the classic decompression bomb shape, a small file
   * that expands to gigabytes of pixels.
   */
  test('a pixel bomb inside both side limits is still refused', () => {
    assert.ok(7000 <= MEDIA_LIMITS.maxWidth && 7000 <= MEDIA_LIMITS.maxHeight);
    assert.ok(7000 * 7000 > MEDIA_LIMITS.maxPixels);
    assert.equal(checkDimensions(7000, 7000).ok, false);
  });

  test('the boundary itself is allowed', () => {
    assert.equal(checkDimensions(MEDIA_LIMITS.maxWidth, 1).ok, true);
  });
});

describe('isMediaKey is the traversal defence', () => {
  const valid = 'a'.repeat(32) + '.jpg';

  test('accepts exactly the shape this application issues', () => {
    assert.equal(isMediaKey(valid), true);
    for (const ext of ['jpg', 'png', 'webp', 'avif']) {
      assert.equal(isMediaKey(`${'0123456789abcdef'.repeat(2)}.${ext}`), true, ext);
    }
  });

  /**
   * Every one of these is a real attempt at reaching outside the store. They
   * are refused HERE, before a path is ever constructed — the route handler
   * calls this before touching storage.
   */
  test('refuses every traversal and injection shape', () => {
    const hostile = [
      '../../etc/passwd',
      '..\\..\\windows\\system32\\config\\sam',
      '/etc/passwd',
      'C:\\Windows\\win.ini',
      `${valid}/../../../etc/passwd`,
      `../${valid}`,
      `%2e%2e%2f${valid}`,
      '%2e%2e/%2e%2e/etc/passwd',
      `${valid}\u0000.txt`,
      `${valid}\u0000`,
      `${'a'.repeat(32)}.jpg;rm -rf /`,
      `${'a'.repeat(32)}.jpg?x=1`,
      `${'a'.repeat(32)}.jpg#frag`,
      `${'a'.repeat(32)}.svg`,
      `${'a'.repeat(32)}.exe`,
      `${'a'.repeat(32)}.jpg.exe`,
      `${'a'.repeat(31)}.jpg`,
      `${'a'.repeat(33)}.jpg`,
      `${'A'.repeat(32)}.jpg`,
      `${'g'.repeat(32)}.jpg`,
      '.jpg',
      '',
      '   ',
      `  ${valid}`,
      `${valid}  `,
      `${valid}\n`,
      `${valid}\r\n`,
    ];
    for (const bad of hostile) {
      assert.equal(isMediaKey(bad), false, `accepted: ${JSON.stringify(bad)}`);
    }
  });

  test('non-strings are refused without throwing', () => {
    for (const bad of [null, undefined, 42, {}, [], true, Symbol('x')]) {
      assert.equal(isMediaKey(bad), false);
    }
  });

  /** A regex without anchors is the classic way this check silently stops working. */
  test('the pattern is anchored at both ends', () => {
    assert.ok(MEDIA_KEY_PATTERN.source.startsWith('^'));
    assert.ok(MEDIA_KEY_PATTERN.source.endsWith('$'));
  });
});

describe('paths round-trip and cannot be forged', () => {
  const key = `${'0'.repeat(31)}f.png`;

  test('mediaPath and keyFromPath agree', () => {
    assert.equal(mediaPath(key), `/media/${key}`);
    assert.equal(keyFromPath(mediaPath(key)), key);
  });

  test('a path outside /media/ yields no key', () => {
    for (const bad of [
      '/photos/x.jpg',
      'https://evil.example/media/' + key,
      '//evil.example/media/' + key,
      '/media/../secret.jpg',
      '/MEDIA/' + key,
      'media/' + key,
      null,
      undefined,
      42,
    ]) {
      assert.equal(keyFromPath(bad), null, `accepted: ${JSON.stringify(bad)}`);
    }
  });
});

describe('the format tables agree with each other', () => {
  test('every allowed format has an extension and a content type', () => {
    for (const format of ALLOWED_FORMATS) {
      assert.ok(EXTENSION_FOR[format], `${format} has no extension`);
      assert.ok(CONTENT_TYPE_FOR[format], `${format} has no content type`);
    }
  });

  test('every extension is one the key pattern accepts', () => {
    for (const format of ALLOWED_FORMATS) {
      assert.equal(isMediaKey(`${'a'.repeat(32)}.${EXTENSION_FOR[format]}`), true, format);
    }
  });

  /** The migration's CHECK constraint lists these four and nothing else. */
  test('every content type is an image type', () => {
    for (const format of ALLOWED_FORMATS) {
      assert.match(CONTENT_TYPE_FOR[format], /^image\//);
    }
  });

  test('SVG is absent from every table', () => {
    assert.equal(ALLOWED_FORMATS.includes('svg' as never), false);
    assert.equal('svg' in EXTENSION_FOR, false);
    assert.equal(Object.values(CONTENT_TYPE_FOR).includes('image/svg+xml'), false);
  });
});
