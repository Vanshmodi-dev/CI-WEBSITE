'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { logUnexpected } from '@/lib/log';
import { peekWindow, recordWindowHit } from '@/lib/burst-limit';
import { displayFilename } from '@/lib/import/run';
import { ingestImage } from '@/lib/media/ingest';
import { getMediaStore } from '@/lib/media/store';
import { isMediaKey, mediaPath, MEDIA_LIMITS } from '@/lib/media/format';

/**
 * Media mutations.
 *
 * EVERY EXPORTED ASYNC FUNCTION IN A 'use server' MODULE IS A PUBLIC ENDPOINT
 * (Phase 14). It can be POSTed directly, with no page rendered and no form
 * present. So this module exports exactly two functions, and both
 * re-authenticate rather than trusting whatever rendered the form.
 *
 * =============================================================================
 * THE CONSENT BOUNDARY — READ BEFORE ADDING ANYTHING HERE
 * =============================================================================
 * Uploading a photograph is NOT permission to publish it.
 *
 * Nothing in this file writes `published`, `consentPhoto`, `consentRef`, or any
 * other field on a student or story. It stores bytes and returns a path. The
 * decision to show that photograph on the website stays exactly where it was:
 * `blockersForPublishing()` in the record's own save action, and the CHECK
 * constraints behind it.
 *
 * That separation is the whole reason this is a separate action rather than a
 * field inside the student form's own save. If uploading and publishing shared
 * a code path, one refactor could make a photograph public as a side effect of
 * choosing a file, and the person it belongs to would never have agreed to it.
 */

export type MediaUploadState = {
  status: 'idle' | 'uploaded' | 'error';
  message?: string;
  /** `/media/<key>.<ext>` on success — what the form field is set to. */
  path?: string;
  key?: string;
  width?: number;
  height?: number;
  bytes?: number;
  originalName?: string;
};

/**
 * Uploads are expensive: a decode and a re-encode each.
 *
 * Sized from the existing import limiter rather than the anonymous enquiry
 * burst limit (3 per minute), which Phase 12 showed a teacher hits during
 * ordinary work.
 *
 * ⚠ RAISED FROM 30 TO 60 AFTER MEASURING. Thirty was chosen by eye and was too
 * tight for the actual job: a teacher entering a class of thirty students, each
 * with a photograph, plus a few retries and replacements, reaches thirty inside
 * one sitting — and the verification suite alone makes about twenty-two uploads,
 * so it could not be run twice in five minutes. A limit the intended user meets
 * during normal work is not a security control, it is an obstacle they will ask
 * to have removed.
 *
 * Sixty in five minutes still bounds one administrator to roughly 360 MB of
 * decode-and-re-encode work per window, which costs a would-be abuser real time
 * and requires a valid session throughout.
 */
const UPLOAD_WINDOW = { max: 60, windowMs: 5 * 60_000 } as const;

/** Deletion is cheap but destructive; a tighter window, still far above use. */
const DELETE_WINDOW = { max: 40, windowMs: 5 * 60_000 } as const;

export async function uploadMedia(
  _prev: MediaUploadState,
  formData: FormData,
): Promise<MediaUploadState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  /*
    ONE FILE. `formData.getAll` rather than `get`, so that a payload carrying
    twenty files is REFUSED rather than silently processing the first — the
    difference between a bounded operation and an unbounded one.
  */
  const files = formData.getAll('file').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return { status: 'error', message: 'Choose a photo first.' };
  }
  if (files.length > MEDIA_LIMITS.maxFiles) {
    return { status: 'error', message: 'Please upload one photo at a time.' };
  }

  const limitKey = `media-upload:${admin.id}`;
  const verdict = peekWindow(limitKey, UPLOAD_WINDOW);
  if (!verdict.allowed) {
    const minutes = Math.max(1, Math.ceil(verdict.retryAfterMs / 60_000));
    return {
      status: 'error',
      message: `That is a lot of uploads in a short time. Please wait about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and try again.`,
    };
  }
  recordWindowHit(limitKey, UPLOAD_WINDOW);

  const file = files[0]!;
  const result = await ingestImage(file);
  if (!result.ok) return { status: 'error', message: result.message };

  /*
    The teacher's filename is kept as a LABEL and nothing else. It never
    addressed the file - the key is a hash of our own output - and
    `displayFilename` strips it to characters that cannot be mistaken for a
    path or a control sequence. React escapes it wherever it is shown.
  */
  const originalName = displayFilename(file.name);

  try {
    await getPrisma().mediaAsset.upsert({
      where: { key: result.key },
      create: {
        key: result.key,
        contentType: `image/${result.format}`,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        originalName,
        uploadedBy: admin.displayName.slice(0, 80),
      },
      // A re-upload of identical bytes keeps the original row: the first
      // uploader and the first timestamp are the honest record of when this
      // picture entered the site.
      update: {},
    });
  } catch (error) {
    logUnexpected('media.record_failed', error);
    return {
      status: 'error',
      message: 'That photo was processed but could not be recorded. Please try again.',
    };
  }

  // The SHAPE of the action, never the image. Consistent with the audit policy
  // for student records: an entity and an id, never the content.
  await recordAudit(
    admin,
    result.deduplicated ? 'updated' : 'created',
    'MediaAsset',
    result.key,
    `${result.width}x${result.height}, ${Math.round(result.bytes / 1024)} KB`,
  );

  revalidatePath('/admin/media');

  return {
    status: 'uploaded',
    path: result.path,
    key: result.key,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    originalName,
    message: result.deduplicated
      ? 'That photo was already on the site, so it has been reused.'
      : 'Photo uploaded.',
  };
}

export type MediaDeleteState = {
  status: 'idle' | 'deleted' | 'error';
  message?: string;
};

/**
 * Remove a stored image.
 *
 * =============================================================================
 * ORDER: DATABASE ROW FIRST, THEN THE FILE
 * =============================================================================
 * There is no transaction spanning Postgres and a file store, so one of two
 * failures is possible and the order decides which one:
 *
 *   row first  -> if the file delete fails: an ORPHAN FILE. Costs disk. Nothing
 *                 references it, nothing serves it, and `scripts/media-audit.mjs`
 *                 finds and removes it.
 *   file first -> if the row delete fails: a BROKEN REFERENCE. A row and
 *                 possibly a page point at bytes that are gone, and a visitor
 *                 sees a broken image.
 *
 * An orphan is recoverable and invisible; a broken reference is neither. So the
 * row goes first, deliberately, and the reconciliation script exists because of
 * it rather than for appearances.
 *
 * A photo still used by a student or story is REFUSED outright. Deleting it
 * would break a live page, and the teacher's actual intention in that case is
 * to change the record, not to destroy the file underneath it.
 */
export async function deleteMedia(
  _prev: MediaDeleteState,
  formData: FormData,
): Promise<MediaDeleteState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const key = String(formData.get('key') ?? '').trim();
  if (!isMediaKey(key)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }

  const limitKey = `media-delete:${admin.id}`;
  const verdict = peekWindow(limitKey, DELETE_WINDOW);
  if (!verdict.allowed) {
    return { status: 'error', message: 'Too many changes at once. Please wait a moment.' };
  }
  recordWindowHit(limitKey, DELETE_WINDOW);

  const path = mediaPath(key);
  const prisma = getPrisma();

  try {
    const [byTopper, byStory] = await Promise.all([
      prisma.topper.count({ where: { photoUrl: path } }),
      prisma.studentStory.count({ where: { photoUrl: path } }),
    ]);
    const uses = byTopper + byStory;
    if (uses > 0) {
      return {
        status: 'error',
        message:
          `This photo is still used by ${uses} ${uses === 1 ? 'record' : 'records'}. ` +
          'Remove it from those first, then delete it here.',
      };
    }

    await prisma.mediaAsset.delete({ where: { key } });
  } catch (error) {
    logUnexpected('media.delete_failed', error);
    return { status: 'error', message: 'That photo could not be removed. Please try again.' };
  }

  try {
    await getMediaStore().remove(key);
  } catch (error) {
    // Non-fatal by design - see the note above. The row is already gone, so
    // nothing references these bytes; the reconciliation script reclaims them.
    logUnexpected('media.storage_delete_failed', error);
  }

  await recordAudit(admin, 'deleted', 'MediaAsset', key);
  revalidatePath('/admin/media');

  return { status: 'deleted', message: 'Photo removed.' };
}
