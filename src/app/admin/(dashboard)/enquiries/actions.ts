'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { logUnexpected } from '@/lib/log';

const STATUSES = ['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED', 'SPAM'] as const;
type Status = (typeof STATUSES)[number];

export type ActionResult = { ok: boolean; message: string };

/**
 * Update an enquiry's status.
 *
 * AUTHORISATION IS CHECKED HERE, not only in the layout. A Server Action is an
 * HTTP endpoint: anyone can POST to it without a page ever rendering, so the
 * page-level guard is a convenience and this is the security boundary.
 */
export async function updateEnquiryStatus(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdminOrNull();
  if (!admin) return { ok: false, message: 'Please sign in again.' };

  const id = String(formData.get('id') ?? '');
  const statusRaw = String(formData.get('status') ?? '');

  if (!id || !STATUSES.includes(statusRaw as Status)) {
    return { ok: false, message: 'That status is not valid.' };
  }
  const status = statusRaw as Status;

  try {
    await getPrisma().enquiry.update({ where: { id }, data: { status } });
    await recordAudit(admin, 'updated', 'Enquiry', id, `status → ${status}`);
    revalidatePath('/admin/enquiries');
    revalidatePath(`/admin/enquiries/${id}`);
    revalidatePath('/admin');
    return { ok: true, message: 'Status updated.' };
  } catch (error) {
    logUnexpected('admin.enquiry.status_failed', error);
    return { ok: false, message: 'We could not save that. Please try again.' };
  }
}

/** Save the internal follow-up note. Never shown on the public website. */
export async function saveEnquiryNotes(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdminOrNull();
  if (!admin) return { ok: false, message: 'Please sign in again.' };

  const id = String(formData.get('id') ?? '');
  const notes = String(formData.get('notes') ?? '').slice(0, 2000);
  if (!id) return { ok: false, message: 'Something went wrong. Please reload.' };

  try {
    await getPrisma().enquiry.update({
      where: { id },
      data: { notes: notes.trim().length > 0 ? notes.trim() : null },
    });
    // The note itself is never logged — it is about a named person.
    await recordAudit(admin, 'updated', 'Enquiry', id, 'note saved');
    revalidatePath(`/admin/enquiries/${id}`);
    return { ok: true, message: 'Note saved.' };
  } catch (error) {
    logUnexpected('admin.enquiry.notes_failed', error);
    return { ok: false, message: 'We could not save that. Please try again.' };
  }
}
