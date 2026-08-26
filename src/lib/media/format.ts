/**
 * What kind of image is this, really? — PURE, no imports.
 *
 * =============================================================================
 * THE ONE RULE
 * =============================================================================
 * The filename does not decide. The browser's `Content-Type` does not decide.
 * The extension does not decide. **The bytes decide.**
 *
 * Every one of those three is chosen by whoever is uploading. A file called
 * `photo.jpg`, sent as `image/jpeg`, containing `<script>`, is trivial to
 * produce and is the first thing anyone tries. So the format is read out of the
 * file's own header, and the extension we store is DERIVED from that reading —
 * the upload never gets to name anything.
 *
 * This module is pure so it can be unit-tested against hostile input without a
 * server, a database or a filesystem. A security check nobody can run is a
 * security check nobody has verified.
 */

/** The only formats this site will store. SVG is deliberately absent — see below. */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

/**
 * WHY SVG IS NOT HERE, AND WHAT IT WOULD TAKE.
 *
 * An SVG is a document, not a picture. It can carry `<script>`, `<foreignObject>`,
 * external references and event handlers, and when served from our own origin it
 * executes with our origin's privileges. Accepting one safely needs a full
 * sanitising parser, a decision about which SVG features survive it, and a
 * separate audit of that parser — and it would still be the only file type on
 * the site that can contain code.
 *
 * The institute uploads photographs. Nothing about the requirement needs SVG,
 * so it is refused by name, with its own message rather than a generic one, so
 * that anyone who tries learns why rather than assuming a bug.
 */
export const ALLOWED_FORMATS: readonly ImageFormat[] = ['jpeg', 'png', 'webp', 'avif'];

/** The extension stored for each format. One canonical spelling, never `.jpeg`. */
export const EXTENSION_FOR: Readonly<Record<ImageFormat, string>> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
};

/** The `Content-Type` served back for each format. */
export const CONTENT_TYPE_FOR: Readonly<Record<ImageFormat, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

/**
 * Limits.
 *
 * Each number is justified, because "reject things that are too big" with an
 * arbitrary threshold is how a limit ends up either useless or in the way of
 * the person it was meant to protect.
 */
export const MEDIA_LIMITS = {
  /**
   * 6 MB.
   *
   * A modern phone camera produces 2–5 MB per photograph, and the teacher will
   * upload straight off the phone rather than resizing first. Below that, the
   * feature does not work for the person it exists for.
   *
   * The framework's `serverActions.bodySizeLimit` is raised from 3 MB to 8 MB
   * to sit ABOVE this. Whichever cap is lower is the one a teacher actually
   * meets, and ours produces a sentence they can act on - "that photo is 7.2 MB,
   * the largest we can take is 6 MB" - where the framework's produces a 500
   * with no explanation. Phase 12 learned that the same way, with CSV imports.
   */
  maxBytes: 6 * 1024 * 1024,

  /**
   * 8000 px on either side, 40 megapixels total.
   *
   * The largest thing this site ever displays is a 1920px-wide band, and the
   * optimiser's own `deviceSizes` stops at 1920. 8000px is far above anything
   * legitimate and far below the width at which decoding costs real memory.
   *
   * The megapixel cap exists separately because the two are different attacks:
   * 8000x8000 passes both side checks and is 64 MP.
   */
  maxWidth: 8000,
  maxHeight: 8000,
  maxPixels: 40_000_000,

  /** What the stored copy is capped at. Nothing on the site is shown wider. */
  storeMaxWidth: 1920,
  storeMaxHeight: 1920,

  /** One file per operation. There is no bulk upload and none is wanted. */
  maxFiles: 1,
} as const;

/* ------------------------------------------------------------- sniffing -- */

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean => {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
};

/**
 * ASCII at a fixed offset, for the container formats that use four-letter tags.
 *
 * STRICT ON PURPOSE: a file too short to contain the tag returns '' and matches
 * nothing. A truncated four-byte "RIF" must not be read as "RIFF" padded with
 * zeroes, or a two-byte file could be sniffed into a format.
 */
const asciiAt = (bytes: Uint8Array, offset: number, length: number): string => {
  if (bytes.length < offset + length) return '';
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
};

/**
 * As much ASCII as there is, up to `length`.
 *
 * Separate from `asciiAt` because the two want opposite behaviour and sharing
 * one helper broke the SVG message: a 40-byte SVG asked for a 256-byte window,
 * got '' from the strict reader, and fell through to the generic "not a photo"
 * message instead of naming SVG. The refusal itself was never affected -
 * `sniffFormat` had already returned null - but a teacher who uploads a logo
 * deserves to be told it is the SVG that is the problem.
 */
const asciiUpTo = (bytes: Uint8Array, offset: number, length: number): string => {
  const end = Math.min(bytes.length, offset + length);
  let out = '';
  for (let i = offset; i < end; i += 1) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
};

/**
 * The format this file actually is, or null.
 *
 * Deliberately conservative: a file whose header does not match one of the four
 * known signatures is `null`, and `null` is refused. There is no "probably a
 * JPEG" branch, because the whole point is that ambiguity is the attack.
 */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  // JPEG: SOI marker FF D8, followed by any marker (FF).
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';

  // PNG: the 8-byte signature, including the CR/LF pair that detects a file
  // mangled by a text-mode transfer.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';

  // WebP: a RIFF container whose form type is WEBP. Both tags are required -
  // "RIFF" alone is also a WAV file.
  if (asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 4) === 'WEBP') return 'webp';

  // AVIF: an ISO-BMFF box named `ftyp` at offset 4, with an AVIF brand.
  // `avis` is the sequence variant; both decode as images.
  if (asciiAt(bytes, 4, 4) === 'ftyp') {
    const brand = asciiAt(bytes, 8, 4);
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }

  return null;
}

/**
 * Does this look like an SVG?
 *
 * Only so the refusal can SAY so. An SVG is text, so it has no fixed signature;
 * this sniffs the first bytes for an XML or `<svg` opening, skipping a BOM and
 * leading whitespace the way a parser would.
 *
 * This is NOT a security control - `sniffFormat` returning null already refuses
 * the file. It exists because "that file is not a JPEG, PNG, WebP or AVIF" sends
 * somebody looking for a corrupt file, and "SVG images are not accepted" tells
 * them the truth.
 */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  let start = 0;
  // Skip a UTF-8 byte-order mark.
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) start = 3;
  // Skip whitespace.
  while (start < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[start] ?? -1)) {
    start += 1;
  }
  const head = asciiUpTo(bytes, start, 256).toLowerCase();
  return head.startsWith('<?xml') || head.startsWith('<svg') || head.includes('<svg');
}

/* ----------------------------------------------------------- decisions -- */

export type FormatVerdict =
  | { ok: true; format: ImageFormat }
  | { ok: false; message: string };

/**
 * Accept or refuse based on content alone.
 *
 * The messages are written for a teacher, not a developer: each one says what
 * was wrong and what to do, because "invalid file" leaves somebody re-uploading
 * the same photograph three times.
 */
export function decideFormat(bytes: Uint8Array): FormatVerdict {
  if (bytes.length === 0) {
    return { ok: false, message: 'That file is empty. Choose a photo and try again.' };
  }

  const format = sniffFormat(bytes);
  if (format) return { ok: true, format };

  if (looksLikeSvg(bytes)) {
    return {
      ok: false,
      message:
        'SVG images are not accepted, because they can contain code. ' +
        'Save the picture as a JPG or PNG and upload that.',
    };
  }

  return {
    ok: false,
    message:
      'That file is not a photo we can use. Photos must be JPG, PNG, WebP or AVIF. ' +
      'If you renamed a file to end in .jpg, that does not change what is inside it.',
  };
}

/** Size check, run before the bytes are read. */
export function checkSize(size: number): { ok: true } | { ok: false; message: string } {
  if (size <= 0) {
    return { ok: false, message: 'That file is empty. Choose a photo and try again.' };
  }
  if (size > MEDIA_LIMITS.maxBytes) {
    const mb = Math.round(MEDIA_LIMITS.maxBytes / 1024 / 1024);
    const gotMb = (size / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      message: `That photo is ${gotMb} MB. The largest we can take is ${mb} MB. Most phones can send a smaller copy.`,
    };
  }
  return { ok: true };
}

/** Dimension check, run from decoded metadata before any pixel work. */
export function checkDimensions(
  width: number | undefined,
  height: number | undefined,
): { ok: true } | { ok: false; message: string } {
  if (!width || !height || width < 1 || height < 1) {
    return {
      ok: false,
      message: 'That photo could not be read. It may be damaged — try saving it again.',
    };
  }
  if (width > MEDIA_LIMITS.maxWidth || height > MEDIA_LIMITS.maxHeight) {
    return {
      ok: false,
      message: `That photo is ${width}x${height} pixels, which is larger than we can process (${MEDIA_LIMITS.maxWidth}x${MEDIA_LIMITS.maxHeight}).`,
    };
  }
  if (width * height > MEDIA_LIMITS.maxPixels) {
    return {
      ok: false,
      message: `That photo has too many pixels (${width}x${height}). Please use a smaller copy.`,
    };
  }
  return { ok: true };
}

/* ------------------------------------------------------------- storage -- */

/**
 * The shape of a storage key. Nothing else is ever read or written.
 *
 * 32 hex characters is the first half of a SHA-256. The full digest is not
 * used because 128 bits is already far beyond guessing and a shorter name keeps
 * URLs readable in a log.
 */
export const MEDIA_KEY_PATTERN = /^[0-9a-f]{32}\.(jpg|png|webp|avif)$/;

/**
 * Is this a key this application issued?
 *
 * The retrieval route calls this BEFORE touching the store, so a traversal
 * attempt never reaches a path join. Written to fail closed on any input type -
 * a probe sends numbers, objects and arrays as often as it sends strings.
 */
export function isMediaKey(value: unknown): value is string {
  return typeof value === 'string' && MEDIA_KEY_PATTERN.test(value);
}

/** The public path a stored object is served from. */
export function mediaPath(key: string): string {
  return `/media/${key}`;
}

/**
 * The key inside a `/media/...` path, or null.
 *
 * Used when a record's stored `photoUrl` needs to be traced back to its object -
 * for deletion, for reference counting, and for the reconciliation script.
 */
export function keyFromPath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith('/media/')) return null;
  const key = path.slice('/media/'.length);
  return isMediaKey(key) ? key : null;
}
