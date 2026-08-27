'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId } from '@/lib/validation';
import { logUnexpected } from '@/lib/log';
import {
  EDIT_TOKEN_FIELD,
  STALE_EDIT_MESSAGE,
  StaleEditError,
  isStaleEditError,
  parseEditToken,
} from '@/lib/stale-edit';
import { revalidateAnnouncements } from '@/lib/revalidate-public';

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

export type AnnouncementFormState = {
  status: 'idle' | 'error';
  message?: string;
  errors?: Partial<Record<'message' | 'startsAt' | 'endsAt' | 'href', string>>;
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

/** "YYYY-MM-DD" anchored to IST, so a date never slips a day in UTC. */
function parseIstDate(value: string, endOfDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = endOfDay ? 'T23:59:59+05:30' : 'T00:00:00+05:30';
  const date = new Date(`${value}${time}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function saveAnnouncement(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const id = String(formData.get('id') ?? '').trim();

  // Present but not an id we could have issued: refuse rather than fall through
  // to the create branch, which would silently duplicate the record.
  if (id.length > 0 && !isValidRecordId(id)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }
  const message = String(formData.get('message') ?? '').trim().slice(0, 300);
  const href = String(formData.get('href') ?? '').trim().slice(0, 300);
  const startsRaw = String(formData.get('startsAt') ?? '').trim();
  const endsRaw = String(formData.get('endsAt') ?? '').trim();
  const published = formData.get('published') === 'on';

  const errors: NonNullable<AnnouncementFormState['errors']> = {};

  if (message.length < 4) errors.message = 'Write the announcement message.';

  const startsAt = parseIstDate(startsRaw);
  const endsAt = parseIstDate(endsRaw, true);
  if (!startsAt) errors.startsAt = 'Choose the day it should start showing.';
  if (!endsAt) errors.endsAt = 'Choose the day it should stop showing.';
  if (startsAt && endsAt && endsAt <= startsAt) {
    errors.endsAt = 'The end date must be after the start date.';
  }

  // Only a path on this site. An external link in a site-wide banner is an
  // open-redirect waiting to happen.
  if (href.length > 0 && !/^\/[A-Za-z0-9\-/]*$/.test(href)) {
    errors.href = 'Use a link on this website, for example /admissions.';
  }

  if (Object.keys(errors).length > 0) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      errors,
      values: { message, href, startsAt: startsRaw, endsAt: endsRaw, published: published ? 'on' : '' },
    };
  }
  if (!startsAt || !endsAt) {
    return { status: 'error', message: 'Those dates are not valid.' };
  }

  const data = {
    message,
    href: href.length > 0 ? href : null,
    startsAt,
    endsAt,
    published,
  };

  try {
    const prisma = getPrisma();
    if (id) {
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
        const applied = await tx.announcement.updateMany({
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
        'Announcement',
        id,
      );
    } else {
      const created = await prisma.announcement.create({
        data,
        select: { id: true },
      });
      await recordAudit(admin, 'created', 'Announcement', created.id);
    }
  } catch (error) {
    if (isStaleEditError(error)) {
      return { status: 'error', message: STALE_EDIT_MESSAGE };
    }
    logUnexpected('admin.announcement.save_failed', error);
    return {
      status: 'error',
      message: 'We could not save this right now. Please try again.',
    };
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/admin');
  revalidateAnnouncements();
  redirect('/admin/announcements?saved=1');
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!isValidRecordId(id)) redirect('/admin/announcements');

  try {
    await getPrisma().announcement.delete({ where: { id } });
    await recordAudit(admin, 'deleted', 'Announcement', id);
  } catch (error) {
    logUnexpected('admin.announcement.delete_failed', error);
    redirect('/admin/announcements?error=1');
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/admin');
  revalidateAnnouncements();
  redirect('/admin/announcements?deleted=1');
}
