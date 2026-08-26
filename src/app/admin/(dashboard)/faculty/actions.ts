'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId, isSafePhotoPath } from '@/lib/validation';
import { logUnexpected } from '@/lib/log';
import { revalidateFaculty } from '@/lib/revalidate-public';
import {
  EDIT_TOKEN_FIELD,
  STALE_EDIT_MESSAGE,
  StaleEditError,
  isStaleEditError,
  parseEditToken,
} from '@/lib/stale-edit';

/**
 * Faculty mutations.
 *
 * EVERY EXPORTED ASYNC FUNCTION IN A 'use server' MODULE IS A PUBLIC ENDPOINT
 * (Phase 14). Both functions here re-authenticate rather than trusting the page
 * that rendered the form, and both validate the id for SHAPE before it reaches
 * Prisma — an id we never issued cannot select a row.
 *
 * This deliberately follows `announcements/actions.ts` rather than inventing a
 * pattern. Same validation shape, same audit calls, same redirect-with-flag
 * convention, same stale-edit guard as students and stories.
 */

const LIMITS = {
  name: 120,
  designation: 120,
  subject: 120,
  bio: 600,
  /** Matches the CHECK constraint. Higher sorts first. */
  maxPriority: 1000,
} as const;

export type FacultyFormState = {
  status: 'idle' | 'error';
  message?: string;
  errors?: Partial<
    Record<'name' | 'designation' | 'subject' | 'bio' | 'photoUrl' | 'priority', string>
  >;
};

/**
 * Trim, bound, and strip control characters.
 *
 * The length cap matches the column and the CHECK constraint, so a value that
 * survives this cannot be refused by the database — a teacher meets our
 * message, never a Postgres error.
 */
function clean(raw: FormDataEntryValue | null, max: number): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

export async function saveFaculty(
  _prev: FacultyFormState,
  formData: FormData,
): Promise<FacultyFormState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const id = String(formData.get('id') ?? '').trim();
  // Present but not an id we could have issued: refuse rather than fall through
  // to the create branch, which would silently duplicate the record.
  if (id.length > 0 && !isValidRecordId(id)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }

  const name = clean(formData.get('name'), LIMITS.name);
  const designation = clean(formData.get('designation'), LIMITS.designation);
  const subject = clean(formData.get('subject'), LIMITS.subject);
  const bio = clean(formData.get('bio'), LIMITS.bio);
  const photoUrl = clean(formData.get('photoUrl'), 500);
  const priorityRaw = String(formData.get('priority') ?? '0').trim();
  const published = formData.get('published') === 'on';

  const errors: NonNullable<FacultyFormState['errors']> = {};

  if (name.length < 2) errors.name = "Enter the teacher's name.";
  if (designation.length < 2) {
    errors.designation = 'Enter their role, for example "Senior Faculty".';
  }

  const priority = Number(priorityRaw);
  if (!Number.isInteger(priority) || priority < 0 || priority > LIMITS.maxPriority) {
    errors.priority = `Order must be a whole number between 0 and ${LIMITS.maxPriority}.`;
  }

  /*
    THE PHOTO PATH IS VALIDATED, ALWAYS.

    Topic 5 found `admin/stories/actions.ts` writing this column with no
    validation at all for its whole existence, and nothing downstream
    compensating. The value here comes from the media picker, which only ever
    produces `/media/<hash>.<ext>` - but "it comes from our own component" is
    exactly the assumption that was wrong last time. The browser sends whatever
    it likes.
  */
  if (photoUrl.length > 0 && !isSafePhotoPath(photoUrl)) {
    errors.photoUrl = 'That is not a photo on this website. Use the Choose photo button.';
  }

  if (Object.keys(errors).length > 0) {
    return { status: 'error', message: 'Please check the highlighted fields.', errors };
  }

  const data = {
    name,
    designation,
    subject: subject.length > 0 ? subject : null,
    bio: bio.length > 0 ? bio : null,
    photoUrl: photoUrl.length > 0 ? photoUrl : null,
    priority,
    published,
  };

  try {
    if (id.length > 0) {
      /*
        LOST-UPDATE GUARD. The form carries the row's `updatedAt`; the update
        requires it to still match. If the row moved underneath - a colleague
        edited it, or unpublished it - the count comes back zero and the whole
        transaction is abandoned rather than half-applied.

        An ABSENT token is treated as stale: a form that cannot prove which
        version it was looking at has no business overwriting one.
      */
      const expectedUpdatedAt = parseEditToken(formData.get(EDIT_TOKEN_FIELD));

      await getPrisma().$transaction(async (tx) => {
        const applied = await tx.faculty.updateMany({
          where: expectedUpdatedAt
            ? { id, updatedAt: expectedUpdatedAt }
            : { id, updatedAt: new Date(0) },
          data,
        });
        if (applied.count === 0) throw new StaleEditError();
      });

      await recordAudit(
        admin,
        published ? 'published' : 'updated',
        'Faculty',
        id,
        published ? 'shown on the website' : 'hidden from the website',
      );
    } else {
      const created = await getPrisma().faculty.create({ data, select: { id: true } });
      await recordAudit(admin, 'created', 'Faculty', created.id);
    }
  } catch (error) {
    if (isStaleEditError(error)) {
      return { status: 'error', message: STALE_EDIT_MESSAGE };
    }
    logUnexpected('admin.faculty.save_failed', error);
    return {
      status: 'error',
      message: 'We could not save this right now. Please try again.',
    };
  }

  revalidatePath('/admin/faculty');
  revalidatePath('/admin');
  revalidateFaculty();
  redirect('/admin/faculty?saved=1');
}

export async function deleteFaculty(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!isValidRecordId(id)) redirect('/admin/faculty');

  try {
    await getPrisma().faculty.delete({ where: { id } });
    await recordAudit(admin, 'deleted', 'Faculty', id);
  } catch (error) {
    logUnexpected('admin.faculty.delete_failed', error);
    redirect('/admin/faculty?error=1');
  }

  /*
    The PHOTOGRAPH IS NOT DELETED with the record.

    The same bytes may be used elsewhere, and the media library refuses to
    delete a file that anything still references. Removing a faculty member
    leaves an unreferenced photo, which `npm run media:audit` reports and
    `media:clean` reclaims - the deliberate trade recorded in Topic 5: an
    orphan file is recoverable and invisible, a broken reference is neither.
  */
  revalidatePath('/admin/faculty');
  revalidatePath('/admin');
  revalidateFaculty();
  redirect('/admin/faculty?deleted=1');
}
