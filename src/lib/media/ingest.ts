import 'server-only';

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Sharp, Metadata } from 'sharp';
import {
  MEDIA_LIMITS,
  CONTENT_TYPE_FOR,
  EXTENSION_FOR,
  checkDimensions,
  checkSize,
  decideFormat,
  mediaPath,
  type ImageFormat,
} from './format.ts';
import { getMediaStore } from './store.ts';
import { logUnexpected } from '@/lib/log';

/**
 * Turning an uploaded file into something safe to store and serve.
 *
 * =============================================================================
 * ORDER MATTERS, AND THE ORDER IS CHEAPEST-REFUSAL-FIRST
 * =============================================================================
 *   1. size        — before a single byte is read
 *   2. magic bytes — before a decoder is handed anything
 *   3. metadata    — dimensions, before pixel work
 *   4. re-encode   — the expensive step, reached only by plausible images
 *
 * Doing it the other way round means a 6 MB file of random noise costs a full
 * decode attempt before being refused, which is a denial-of-service handed to
 * anyone with a session.
 *
 * =============================================================================
 * WHY THE STORED BYTES ARE NEVER THE UPLOADED BYTES
 * =============================================================================
 * The file that arrives is re-encoded, and the ORIGINAL IS DISCARDED. That one
 * decision does most of the security work in this module:
 *
 *   - A polyglot — a valid JPEG with a ZIP, an HTML page or a script appended —
 *     cannot survive a decode-and-re-encode. Only pixels come out.
 *   - EXIF, including GPS coordinates, is not carried forward. A photograph
 *     taken at the institute would otherwise publish its address.
 *   - Orientation is BAKED IN and then discarded, so a portrait photo cannot
 *     display sideways because a viewer ignored the EXIF tag.
 *   - An embedded colour profile, comment block or thumbnail — each of which has
 *     had its own parser CVEs — is simply absent from the output.
 *
 * The cost is that the stored image is not byte-identical to what the teacher
 * chose. That is the correct trade for a site that publishes photographs of
 * children.
 */

export type IngestResult =
  | {
      ok: true;
      /** `/media/<hash>.<ext>` — what goes in the record's photoUrl. */
      path: string;
      key: string;
      format: ImageFormat;
      width: number;
      height: number;
      bytes: number;
      /** True when these exact bytes were already stored. */
      deduplicated: boolean;
    }
  | { ok: false; message: string };

/**
 * `limitInputPixels` is the decoder's own bomb guard.
 *
 * It refuses during decode, before allocation, which is the only place a
 * pixel bomb can be stopped cheaply — the dimension check below runs on
 * metadata and is a second, independent line.
 */
const DECODER_OPTIONS = {
  limitInputPixels: MEDIA_LIMITS.maxPixels,
  // A sequence (animated WebP/AVIF) is read as its first frame only. Storing an
  // animation behind a still-photograph field is not something any surface here
  // asks for, and it multiplies decode cost by the frame count.
  animated: false,
  failOn: 'error' as const,
};

/**
 * Validate, re-encode and store one uploaded file.
 *
 * Never throws for bad input — hostile input is expected, and an exception
 * escaping here would become a 500 that tells an attacker more than a refusal
 * does. Genuine faults are logged and reported as a generic failure.
 */
export async function ingestImage(file: File): Promise<IngestResult> {
  const sizeVerdict = checkSize(file.size);
  if (!sizeVerdict.ok) return { ok: false, message: sizeVerdict.message };

  let input: Buffer;
  try {
    input = Buffer.from(await file.arrayBuffer());
  } catch (error) {
    logUnexpected('media.read_failed', error);
    return { ok: false, message: 'That photo could not be read. Please try again.' };
  }

  // The browser can lie about `size`; the bytes cannot.
  const actualSize = checkSize(input.byteLength);
  if (!actualSize.ok) return { ok: false, message: actualSize.message };

  const formatVerdict = decideFormat(new Uint8Array(input));
  if (!formatVerdict.ok) return { ok: false, message: formatVerdict.message };

  let pipeline: Sharp;
  let meta: Metadata;
  try {
    pipeline = sharp(input, DECODER_OPTIONS);
    meta = await pipeline.metadata();
  } catch (error) {
    /*
      A decode failure here is the expected outcome for a corrupt file, a
      truncated upload, or a header that passed the magic-byte check while the
      body is nonsense. It is NOT logged as unexpected, because logging every
      malformed upload as an error would bury real faults.

      ONE CASE IS DISTINGUISHED. `limitInputPixels` refuses a pixel bomb during
      decode - which is exactly where it should be refused, before allocation -
      but the resulting message would be "it may be damaged", and the file is
      not damaged. Somebody uploading a genuinely enormous scan would go and
      re-save a perfectly good photograph on that advice. The decoder's own
      wording is matched so the answer can be the true one.
    */
    const text = error instanceof Error ? error.message : '';
    if (/pixel limit|exceeds pixel/i.test(text)) {
      return {
        ok: false,
        message:
          `That photo has too many pixels for us to process. ` +
          `The most we can take is ${MEDIA_LIMITS.maxPixels / 1_000_000} megapixels ` +
          `(for example ${MEDIA_LIMITS.maxWidth}x5000). Please use a smaller copy.`,
      };
    }
    return {
      ok: false,
      message: 'That photo could not be opened. It may be damaged — try saving it again.',
    };
  }

  /*
    THE SNIFFED FORMAT MUST AGREE WITH THE DECODER.

    Two independent readers of the same bytes. If they disagree, the file is
    doing something clever with its container and is refused — that disagreement
    is the signature of a polyglot, not of a normal photograph.
  */
  const decoded = normaliseFormat(meta.format);
  if (decoded !== formatVerdict.format) {
    return {
      ok: false,
      message:
        'That file does not match the kind of image it claims to be. ' +
        'Please open it, save it again as a JPG or PNG, and upload that.',
    };
  }

  const dimensions = checkDimensions(meta.width, meta.height);
  if (!dimensions.ok) return { ok: false, message: dimensions.message };

  let output: Buffer;
  let outFormat: ImageFormat;
  try {
    const rendered = await reencode(pipeline, formatVerdict.format);
    output = rendered.buffer;
    outFormat = rendered.format;
  } catch (error) {
    logUnexpected('media.encode_failed', error);
    return { ok: false, message: 'That photo could not be processed. Please try another.' };
  }

  // Read the output's own dimensions rather than assuming the resize did what
  // was asked; the record should describe what is stored, not what was intended.
  let outWidth = meta.width ?? 0;
  let outHeight = meta.height ?? 0;
  try {
    const outMeta = await sharp(output, DECODER_OPTIONS).metadata();
    outWidth = outMeta.width ?? outWidth;
    outHeight = outMeta.height ?? outHeight;
  } catch {
    /* Non-fatal: the stored bytes are already known good. */
  }

  /*
    THE KEY IS THE HASH OF WHAT WE STORE, NOT OF WHAT WAS UPLOADED.

    Hashing the input would let two different uploads that re-encode to the same
    picture occupy two keys, and — worse — would let the key describe bytes that
    no longer exist. Hashing the output makes the URL an honest content address:
    same URL, same bytes, forever. That is what makes replacement immune to
    caching (a different photo is a different URL) and what makes an identical
    re-upload free.
  */
  const key = `${createHash('sha256').update(output).digest('hex').slice(0, 32)}.${EXTENSION_FOR[outFormat]}`;

  const store = getMediaStore();
  let deduplicated = false;
  try {
    /*
      `exists`, not `get`.

      This asked the question with a full read until Phase 17, which was free on
      local disk and absurd on remote storage: every upload downloaded an entire
      photograph purely to discover whether it was already there. A HEAD is one
      request and the same answer.
    */
    deduplicated = await store.exists(key);
    if (!deduplicated) {
      await store.put(key, output, CONTENT_TYPE_FOR[outFormat]);
    }
  } catch (error) {
    logUnexpected('media.store_failed', error);
    return {
      ok: false,
      message:
        'That photo could not be saved. If this keeps happening, photo storage ' +
        'may not be set up on this server.',
    };
  }

  return {
    ok: true,
    path: mediaPath(key),
    key,
    format: outFormat,
    width: outWidth,
    height: outHeight,
    bytes: output.byteLength,
    deduplicated,
  };
}

/**
 * Re-encode, stripping everything that is not a pixel.
 *
 * AVIF input is re-encoded as AVIF; everything else becomes the format it
 * arrived as. Converting all uploads to a single format was considered and
 * rejected: it would silently turn a PNG with sharp edges into a blurry JPEG,
 * and the optimiser already serves AVIF/WebP derivatives to browsers that want
 * them, so a second conversion here buys nothing.
 */
async function reencode(
  pipeline: Sharp,
  format: ImageFormat,
): Promise<{ buffer: Buffer; format: ImageFormat }> {
  const base = pipeline
    // Applies the EXIF orientation and then drops the tag. Without this, a
    // photo taken in portrait displays on its side wherever EXIF is ignored.
    .rotate()
    // Never enlarge. A small photo stays small rather than being interpolated
    // into a soft, larger file that looks worse and costs more to send.
    .resize({
      width: MEDIA_LIMITS.storeMaxWidth,
      height: MEDIA_LIMITS.storeMaxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    });

  switch (format) {
    case 'png':
      return { buffer: await base.png({ compressionLevel: 9 }).toBuffer(), format: 'png' };
    case 'webp':
      return { buffer: await base.webp({ quality: 82 }).toBuffer(), format: 'webp' };
    case 'avif':
      return { buffer: await base.avif({ quality: 60 }).toBuffer(), format: 'avif' };
    case 'jpeg':
    default:
      return {
        buffer: await base
          .jpeg({ quality: 82, mozjpeg: true, progressive: true })
          .toBuffer(),
        format: 'jpeg',
      };
  }
}

/** sharp's format names, mapped onto ours. Anything else is not allowed. */
function normaliseFormat(value: string | undefined): ImageFormat | null {
  switch (value) {
    case 'jpeg':
    case 'jpg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'avif':
    case 'heif':
      // sharp reports some AVIF files as `heif`, because AVIF is a HEIF brand.
      // The magic-byte check already required an `avif`/`avis` brand, and the
      // two must agree, so this can only match a file that really is AVIF.
      return 'avif';
    default:
      return null;
  }
}
