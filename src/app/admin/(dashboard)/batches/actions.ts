'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { logUnexpected } from '@/lib/log';
import { institute } from '@/config/institute';
import { revalidateBatches } from '@/lib/revalidate-public';

export type BatchFormState = {
  status: 'idle' | 'error';
  message?: string;
  errors?: Partial<Record<'courseSlug' | 'startsAt' | 'mode', string>>;
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
  const input = readForm(formData);
  const errors = validate(input);

  if (Object.keys(errors).length > 0) {
    return { status: 'error', message: 'Please check the highlighted fields.', errors };
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

  try {
    const prisma = getPrisma();
    if (id) {
      await prisma.batch.update({ where: { id }, data });
      await recordAudit(admin, input.published ? 'published' : 'updated', 'Batch', id, input.courseSlug);
    } else {
      const created = await prisma.batch.create({ data, select: { id: true } });
      await recordAudit(admin, 'created', 'Batch', created.id, input.courseSlug);
    }
  } catch (error) {
    logUnexpected('admin.batch.save_failed', error);
    return { status: 'error', message: 'We could not save this right now. Please try again.' };
  }

  revalidatePath('/admin/batches');
  revalidatePath('/admin');
  revalidateBatches(input.courseSlug);
  redirect('/admin/batches?saved=1');
}

export async function deleteBatch(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/admin/batches');

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
