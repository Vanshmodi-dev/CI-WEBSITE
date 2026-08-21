import 'server-only';

import { log } from '@/lib/log';

/**
 * Enquiry notification — SEAM ONLY, no provider wired.
 *
 * WHY THERE IS NO EMAIL PROVIDER HERE
 * -----------------------------------
 * Two facts are missing, and neither can be invented:
 *
 *   1. Commerce Insight has no professional email address yet. The previous
 *      site used a personal Gmail (a gaming handle), which cannot be the
 *      destination for student enquiries.
 *   2. There is no sending domain, so no SPF/DKIM. Notification mail sent from
 *      an unauthenticated domain lands in spam, which silently loses leads —
 *      worse than no notification at all, because nobody notices.
 *
 * So this module records the intent and does nothing else. The enquiry is
 * ALREADY SAFELY PERSISTED before this is called (see enquiry.ts), so a
 * missing notifier can never lose a lead — the admin list in Phase 5 is the
 * durable path, and email is a convenience layered on top.
 *
 * TO WIRE IT UP (Phase 5): implement `deliver()` against Resend or Postmark
 * using RESEND_API_KEY and ENQUIRY_NOTIFICATION_TO. Nothing else changes.
 */

export type NotificationOutcome =
  | { delivered: false; reason: 'not-configured' }
  | { delivered: false; reason: 'failed' }
  | { delivered: true };

function isConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY && process.env.ENQUIRY_NOTIFICATION_TO,
  );
}

/**
 * Called after the enquiry is committed. MUST NOT THROW — a notification
 * problem is never allowed to turn a saved lead into an error for the visitor.
 *
 * Note the payload: an id and a class level, never the enquirer's name, phone
 * or message. Those live in the database and the admin UI (Master Plan §19).
 */
export async function notifyNewEnquiry(enquiry: {
  id: string;
  classLevel: string;
  sourcePage: string;
}): Promise<NotificationOutcome> {
  if (!isConfigured()) {
    log.info('enquiry.notification.skipped', {
      enquiryId: enquiry.id,
      reason: 'not-configured',
      classLevel: enquiry.classLevel,
      sourcePage: enquiry.sourcePage,
    });
    return { delivered: false, reason: 'not-configured' };
  }

  try {
    // Phase 5: deliver via the configured provider.
    log.info('enquiry.notification.pending', { enquiryId: enquiry.id });
    return { delivered: false, reason: 'not-configured' };
  } catch {
    // Deliberately swallowed. The lead is already saved.
    log.warn('enquiry.notification.failed', { enquiryId: enquiry.id });
    return { delivered: false, reason: 'failed' };
  }
}
