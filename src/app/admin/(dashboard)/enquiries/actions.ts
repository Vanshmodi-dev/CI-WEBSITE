'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId } from '@/lib/validation';
import { logUnexpected } from '@/lib/log';

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

  if (!isValidRecordId(id) || !STATUSES.includes(statusRaw as Status)) {
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
  if (!isValidRecordId(id)) {
    return { ok: false, message: 'Something went wrong. Please reload.' };
  }

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
