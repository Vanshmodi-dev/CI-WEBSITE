'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId } from '@/lib/validation';
import { logUnexpected } from '@/lib/log';
import { institute } from '@/config/institute';
import {
  EDIT_TOKEN_FIELD,
  STALE_EDIT_MESSAGE,
  StaleEditError,
  isStaleEditError,
  parseEditToken,
} from '@/lib/stale-edit';
import { revalidateBatches } from '@/lib/revalidate-public';

/**
 * Every id below is validated for SHAPE before it reaches Prisma.
 *
 * Prisma parameterises, so an unvalidated id was never an injection risk. What
 * it was is unbounded attacker-controlled input handed to the database: Phase
 * 10 posted a five-thousand-character id and a JSON object literal through
 * these forms and both reached Postgres before being rejected there. Checking
 * first stops the work at the edge and fails closed — an id we never issued
 * cannot select a row.
 */

export type BatchFormState = {
  status: 'idle' | 'error';
  message?: string;
  errors?: Partial<Record<'courseSlug' | 'startsAt' | 'mode', string>>;
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

const KNOWN_SLUGS = institute.courses.map((c) => c.slug);

/**
 * Dates arrive as "YYYY-MM-DD" from <input type="date">, which the browser
 * gives us in the teacher's local calendar. We anchor them to 00:00 IST so a
 * batch entered as "1 September" is never stored as 31 August in UTC.
 */
function parseIstDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readForm(formData: FormData) {
  return {
    courseSlug: String(formData.get('courseSlug') ?? '').trim(),
    startsAt: String(formData.get('startsAt') ?? '').trim(),
    mode: String(formData.get('mode') ?? '').trim().slice(0, 60),
    seatsNote: String(formData.get('seatsNote') ?? '').trim().slice(0, 120),
    published: formData.get('published') === 'on',
  };
}

function validate(input: ReturnType<typeof readForm>) {
  const errors: NonNullable<BatchFormState['errors']> = {};
  if (!KNOWN_SLUGS.includes(input.courseSlug)) {
    errors.courseSlug = 'Choose which course this batch is for.';
  }
  if (!parseIstDate(input.startsAt)) {
    errors.startsAt = 'Choose the date the batch starts.';
  }
  if (input.mode.length === 0) {
    errors.mode = 'Say how the batch runs, for example "Offline".';
  }
  return errors;
}

export async function saveBatch(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const id = String(formData.get('id') ?? '').trim();

  // Present but not an id we could have issued: refuse rather than fall through
  // to the create branch, which would silently duplicate the record.
  if (id.length > 0 && !isValidRecordId(id)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }
  const input = readForm(formData);
  const errors = validate(input);

  if (Object.keys(errors).length > 0) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      errors,
      values: {
        courseSlug: input.courseSlug,
        startsAt: input.startsAt,
        mode: input.mode,
        seatsNote: input.seatsNote,
        published: input.published ? 'on' : '',
      },
    };
  }

  const startsAt = parseIstDate(input.startsAt);
  if (!startsAt) return { status: 'error', message: 'That start date is not valid.' };

  const data = {
    courseSlug: input.courseSlug,
    startsAt,
    mode: input.mode,
    seatsNote: input.seatsNote.length > 0 ? input.seatsNote : null,
    published: input.published,
  };

  // Moving a batch between courses changes TWO public pages: the one it left
  // and the one it joined. Revalidating only the new slug leaves the old course
  // page advertising a batch it no longer has, for up to an hour.
  let previousCourseSlug: string | null = null;

  try {
    const prisma = getPrisma();
    if (id) {
      const existing = await prisma.batch.findUnique({
        where: { id },
        select: { courseSlug: true },
      });
      previousCourseSlug = existing?.courseSlug ?? null;

      /*
        LOST-UPDATE GUARD. The form carries the row's `updatedAt`; the update
        requires it to still match. If the row moved underneath - a colleague
        edited it, or unpublished it - the count comes back zero and the whole
        transaction is abandoned rather than half-applied.

        An ABSENT token is treated as stale: a form that cannot prove which
        version it was looking at has no business overwriting one.

        ADDED IN TOPIC 11. This surface had no guard at all: a second tab's
        save silently overwrote the first, with no warning to either teacher.
        Faculty, gallery, videos, stories, students and the website editor all
        had it; these two were written before the guard existed and were never
        brought forward.
      */
      const expectedUpdatedAt = parseEditToken(formData.get(EDIT_TOKEN_FIELD));

      await prisma.$transaction(async (tx) => {
        const applied = await tx.batch.updateMany({
          where: expectedUpdatedAt
            ? { id, updatedAt: expectedUpdatedAt }
            : { id, updatedAt: new Date(0) },
          data,
        });
        if (applied.count === 0) throw new StaleEditError();
      });
      await recordAudit(admin, input.published ? 'published' : 'updated', 'Batch', id, input.courseSlug);
    } else {
      const created = await prisma.batch.create({ data, select: { id: true } });
      await recordAudit(admin, 'created', 'Batch', created.id, input.courseSlug);
    }
  } catch (error) {
    if (isStaleEditError(error)) {
      return { status: 'error', message: STALE_EDIT_MESSAGE };
    }
    logUnexpected('admin.batch.save_failed', error);
    return { status: 'error', message: 'We could not save this right now. Please try again.' };
  }

  revalidatePath('/admin/batches');
  revalidatePath('/admin');
  revalidateBatches(input.courseSlug);
  if (previousCourseSlug && previousCourseSlug !== input.courseSlug) {
    revalidateBatches(previousCourseSlug);
  }
  redirect('/admin/batches?saved=1');
}

export async function deleteBatch(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!isValidRecordId(id)) redirect('/admin/batches');

  try {
    await getPrisma().batch.delete({ where: { id } });
    await recordAudit(admin, 'deleted', 'Batch', id);
  } catch (error) {
    logUnexpected('admin.batch.delete_failed', error);
    redirect('/admin/batches?error=1');
  }

  revalidatePath('/admin/batches');
  revalidatePath('/admin');
  revalidateBatches();
  redirect('/admin/batches?deleted=1');
}
