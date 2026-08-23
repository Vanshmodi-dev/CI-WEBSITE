'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { logUnexpected } from '@/lib/log';

export type AnnouncementFormState = {
  status: 'idle' | 'error';
  message?: string;
  errors?: Partial<Record<'message' | 'startsAt' | 'endsAt' | 'href', string>>;
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
    return { status: 'error', message: 'Please check the highlighted fields.', errors };
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
      await prisma.announcement.update({ where: { id }, data });
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
    logUnexpected('admin.announcement.save_failed', error);
    return {
      status: 'error',
      message: 'We could not save this right now. Please try again.',
    };
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/admin');
  redirect('/admin/announcements?saved=1');
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/admin/announcements');

  try {
    await getPrisma().announcement.delete({ where: { id } });
    await recordAudit(admin, 'deleted', 'Announcement', id);
  } catch (error) {
    logUnexpected('admin.announcement.delete_failed', error);
    redirect('/admin/announcements?error=1');
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/admin');
  redirect('/admin/announcements?deleted=1');
}
