/**
 * Display helpers for the admin.
 *
 * All dates are formatted in Asia/Kolkata. The institute is in Jaipur and the
 * server is not; a batch that "starts 1 September" must not read as 31 August
 * because the host runs in UTC.
 */

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
