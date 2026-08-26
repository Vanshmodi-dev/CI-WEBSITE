/**
 * Display helpers for the admin.
 *
 * All dates are formatted in Asia/Kolkata. The institute is in Jaipur and the
 * server is not; a batch that "starts 1 September" must not read as 31 August
 * because the host runs in UTC.
 */

import { institute } from '@/config/institute';

const IST = 'Asia/Kolkata';

export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: IST,
  }).format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: IST,
  }).format(new Date(value));
}

/** Value for <input type="date"> — YYYY-MM-DD in IST, not UTC. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: IST,
  }).format(new Date(value));
  return parts;
}

export const ENQUIRY_STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  ENROLLED: 'Enrolled',
  CLOSED: 'Closed',
  SPAM: 'Spam',
};

export const PROGRAMME_LABELS: Record<string, string> = {
  CLASS_11: 'Class 11 Commerce',
  CLASS_12: 'Class 12 Commerce',
  CA_FOUNDATION: 'CA Foundation',
  CA_INTERMEDIATE: 'CA Intermediate',
  CMA: 'CMA',
};

export const BOARD_LABELS: Record<string, string> = {
  CBSE: 'CBSE',
  RBSE: 'RBSE',
  ICAI: 'ICAI',
  OTHER: 'Other',
};

export const DISPLAY_NAME_LABELS: Record<string, string> = {
  INITIALS: 'Initials only (most private)',
  FIRST_NAME_ONLY: 'First name only',
  FULL: 'Full name',
};

/**
 * Course slug → the name the institute uses for it.
 *
 * Phase 15. The admin dashboard and the enquiry detail page were printing the
 * raw slug — a teacher reading their own dashboard saw "class-12-commerce"
 * where the public site, two clicks away, says "Class XII Commerce". The
 * preview page already resolved it, by hand, inline; this is that same lookup
 * in one place so the three cannot drift apart again.
 *
 * Falls back to the slug rather than to an empty string: an unknown slug is a
 * data problem the teacher needs to SEE, not one to hide behind a blank.
 */
export function courseLabel(slug: string): string {
  return institute.courses.find((c) => c.slug === slug)?.name ?? slug;
}
