'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId } from '@/lib/validation';
import { logUnexpected } from '@/lib/log';
import { revalidateVideos } from '@/lib/revalidate-public';
import { parseYouTubeId, isVideoSubject, type VideoSubjectValue } from '@/lib/video';
import {
  EDIT_TOKEN_FIELD,
  STALE_EDIT_MESSAGE,
  StaleEditError,
  isStaleEditError,
  parseEditToken,
} from '@/lib/stale-edit';

/**
 * Video mutations.
 *
 * EVERY EXPORTED ASYNC FUNCTION IN A 'use server' MODULE IS A PUBLIC ENDPOINT
 * (Phase 14). Both functions here re-authenticate rather than trusting the page
 * that rendered the form, and both validate the id for SHAPE before it reaches
 * Prisma — an id we never issued cannot select a row.
 *
 * This follows `gallery/actions.ts` and `faculty/actions.ts` rather than
 * inventing a pattern: same validation shape, same audit calls, same
 * redirect-with-flag convention, same stale-edit guard.
 *
 * =============================================================================
 * WHAT IS DIFFERENT: THE URL IS PARSED, NOT VALIDATED
 * =============================================================================
 * A photo path is checked and stored as given. A video URL is NOT stored at
 * all — `parseYouTubeId` reduces whatever the teacher pasted to eleven
 * characters and everything else is discarded, including the host, the path,
 * the playlist, the timestamp and the tracking token.
 *
 * That is the difference between filtering a value and eliminating it. There is
 * no code path in which a teacher-supplied string becomes an iframe `src`.
 *
 * =============================================================================
 * NOTHING HERE FETCHES ANYTHING
 * =============================================================================
 * No request is made to the pasted URL, to YouTube, or to anywhere else. The
 * title and description are typed by the teacher, not scraped. So this action
 * has no SSRF surface to defend — not a mitigated one, an absent one.
 */

const LIMITS = {
  title: 160,
  description: 400,
  url: 500,
  maxPriority: 1000,
} as const;

export type VideoFormState = {
  status: 'idle' | 'error';
  message?: string;
  errors?: Partial<Record<'youtubeUrl' | 'title' | 'description' | 'subject' | 'priority', string>>;
  /**
   * What the teacher had typed when the save was refused.
   *
   * React resets a form once its action settles, so an uncontrolled input goes
   * back to its `defaultValue` even when the action returned an error and the
   * teacher is still looking at the form. Echoing the submitted values back
   * means that reset restores what they typed rather than what the record held
   * when the page opened. See the Topic 11 report, defect D-2.
   */
  values?: Record<string, string>;
};

/** Trim, bound, and strip control characters. Matches the CHECK constraints. */
function clean(raw: FormDataEntryValue | null, max: number): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

export async function saveVideo(
  _prev: VideoFormState,
  formData: FormData,
): Promise<VideoFormState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const id = String(formData.get('id') ?? '').trim();
  // Present but not an id we could have issued: refuse rather than fall through
  // to the create branch, which would silently duplicate the record.
  if (id.length > 0 && !isValidRecordId(id)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }

  const rawUrl = clean(formData.get('youtubeUrl'), LIMITS.url);
  const title = clean(formData.get('title'), LIMITS.title);
  const description = clean(formData.get('description'), LIMITS.description);
  const subjectRaw = String(formData.get('subject') ?? '').trim();
  const priorityRaw = String(formData.get('priority') ?? '0').trim();
  const published = formData.get('published') === 'on';

  const errors: NonNullable<VideoFormState['errors']> = {};

  /*
    THE PARSE IS THE VALIDATION.

    An unparseable value is not stored in any form — there is no "store it and
    warn" branch. The message names what is expected rather than what was
    wrong, because "invalid URL" tells a teacher nothing they can act on.
  */
  const youtubeId = parseYouTubeId(rawUrl);
  if (rawUrl.length === 0) {
    errors.youtubeUrl = 'Paste the link to the video on YouTube.';
  } else if (!youtubeId) {
    errors.youtubeUrl =
      'That does not look like a YouTube video link. Copy the address from the video page, for example https://www.youtube.com/watch?v=… or https://youtu.be/…';
  }

  if (title.length < 3) {
    errors.title = 'Give the video a title, so a reader knows what it covers.';
  }

  if (!isVideoSubject(subjectRaw)) {
    errors.subject = 'Choose which subject this video is about.';
  }

  const priority = Number(priorityRaw);
  if (!Number.isInteger(priority) || priority < 0 || priority > LIMITS.maxPriority) {
    errors.priority = `Order must be a whole number between 0 and ${LIMITS.maxPriority}.`;
  }

  if (Object.keys(errors).length > 0 || !youtubeId) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      errors,
      values: { youtubeUrl: rawUrl, title, description, subject: subjectRaw, priority: priorityRaw, published: published ? 'on' : '' },
    };
  }

  const data = {
    youtubeId,
    title,
    // Optional means optional: empty saves as null, and the form says so.
    description: description.length > 0 ? description : null,
    subject: subjectRaw as VideoSubjectValue,
    priority,
    published,
  };

  try {
    if (id.length > 0) {
      /*
        LOST-UPDATE GUARD. The form carries the row's `updatedAt`; the update
        requires it to still match. If the row moved underneath — a colleague
        edited it, or unpublished it — the count comes back zero and the whole
        transaction is abandoned rather than half-applied.

        An ABSENT token is treated as stale: a form that cannot prove which
        version it was looking at has no business overwriting one. For a video
        that somebody has asked to be taken down, that is the difference between
        it staying down and a stale tab quietly republishing it.
      */
      const expectedUpdatedAt = parseEditToken(formData.get(EDIT_TOKEN_FIELD));

      let wasPublished = false;

      await getPrisma().$transaction(async (tx) => {
        const before = await tx.video.findUnique({
          where: { id },
          select: { published: true },
        });
        wasPublished = before?.published ?? false;

        const applied = await tx.video.updateMany({
          where: expectedUpdatedAt
            ? { id, updatedAt: expectedUpdatedAt }
            : { id, updatedAt: new Date(0) },
          data,
        });
        if (applied.count === 0) throw new StaleEditError();
      });

      /*
        An unpublish is audited as an unpublish, not as an edit — the same
        correction Topic 8 made. "When did that video come off the site, and did
        somebody put it back?" is the question this log has to be able to
        answer, and `updated` cannot answer it.
      */
      const action = published ? 'published' : wasPublished ? 'unpublished' : 'updated';
      const summary = published
        ? 'shown on the website'
        : wasPublished
          ? 'taken off the website'
          : 'not shown on the website';

      await recordAudit(admin, action, 'Video', id, summary);
    } else {
      const created = await getPrisma().video.create({ data, select: { id: true } });
      await recordAudit(admin, 'created', 'Video', created.id);
    }
  } catch (error) {
    if (isStaleEditError(error)) {
      return { status: 'error', message: STALE_EDIT_MESSAGE };
    }
    /*
      A duplicate `youtubeId` lands here. It is a normal thing for a teacher to
      do — adding a video they already added — so it gets a sentence they can
      act on rather than "we could not save this right now".
    */
    if (
      error instanceof Error &&
      /Unique constraint|videos_youtubeId_key/i.test(error.message)
    ) {
      return {
        status: 'error',
        message: 'That video is already on the list.',
        errors: { youtubeUrl: 'This video has already been added.' },
      };
    }
    logUnexpected('admin.videos.save_failed', error);
    return {
      status: 'error',
      message: 'We could not save this right now. Please try again.',
    };
  }

  revalidatePath('/admin/videos');
  revalidatePath('/admin');
  revalidateVideos();
  redirect('/admin/videos?saved=1');
}

export async function deleteVideo(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!isValidRecordId(id)) redirect('/admin/videos');

  try {
    await getPrisma().video.delete({ where: { id } });
    await recordAudit(admin, 'deleted', 'Video', id);
  } catch (error) {
    /*
      A delete of a row that is already gone lands here. It is not an error
      worth showing — the teacher asked for it to be gone and it is gone — but
      it is logged, because a burst of them is worth seeing.
    */
    logUnexpected('admin.videos.delete_failed', error);
    redirect('/admin/videos?error=1');
  }

  /*
    NOTHING ELSE IS DELETED, because nothing else was stored.

    Gallery and faculty leave an uploaded file behind when a record goes; a
    video record owns no bytes at all. The video itself lives on YouTube and is
    the institute's to remove there. Removing it here removes it from the
    website and nowhere else, which is the honest scope of this button.
  */
  revalidatePath('/admin/videos');
  revalidatePath('/admin');
  revalidateVideos();
  redirect('/admin/videos?deleted=1');
}
