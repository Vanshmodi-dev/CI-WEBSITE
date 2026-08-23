/**
 * Enquiry input validation.
 *
 * HAND-WRITTEN ON PURPOSE. This is the one internet-facing write endpoint on
 * the site, and it has five fields with simple rules. A validation library
 * would add a supply-chain surface to exactly the code path that most needs to
 * be auditable, for very little gain. Everything here is pure and unit-tested
 * (tests/validation.test.ts).
 *
 * This module deliberately does NOT import 'server-only' — it must remain
 * importable by the test runner. It also touches no I/O, no environment and no
 * database, so there is nothing here to leak.
 *
 * RULE: validation runs on the SERVER. Anything the browser checks is a
 * convenience for the visitor and is never trusted.
 */

export const CLASS_LEVELS = [
  'CLASS_11',
  'CLASS_12',
  'CA_FOUNDATION',
  'CA_INTERMEDIATE',
  'CMA',
  'OTHER',
] as const;

export type ClassLevelValue = (typeof CLASS_LEVELS)[number];

export const CLASS_LEVEL_LABELS: Record<ClassLevelValue, string> = {
  CLASS_11: 'Class 11 Commerce',
  CLASS_12: 'Class 12 Commerce',
  CA_FOUNDATION: 'CA Foundation',
  CA_INTERMEDIATE: 'CA Intermediate',
  CMA: 'CMA',
  OTHER: 'Something else',
};

export const LIMITS = {
  name: { min: 2, max: 80 },
  phone: { min: 10, max: 15 },
  email: { max: 160 },
  message: { max: 2000 },
  courseSlug: { max: 64 },
  sourcePage: { max: 200 },
} as const;

export type FieldName =
  | 'name'
  | 'phone'
  | 'email'
  | 'classLevel'
  | 'message'
  | 'consent'
  | 'form';

export type ValidationErrors = Partial<Record<FieldName, string>>;

export type EnquiryInput = {
  name: string;
  phone: string;
  email: string | null;
  classLevel: ClassLevelValue;
  courseSlug: string | null;
  message: string | null;
  sourcePage: string;
};

export type ValidationResult =
  | { ok: true; value: EnquiryInput }
  | { ok: false; errors: ValidationErrors };

/**
 * C0 control characters and DEL.
 *
 * Stripped rather than rejected: a stray character pasted from a contacts app
 * is not an attack, and failing the submission would punish a real person.
 * They are removed because they corrupt log lines, CSV exports and terminal
 * output for whoever reads the lead later.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** The same set, but U+000A (newline) is kept. */
const CONTROL_CHARS_KEEP_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

export function clean(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

/** Same, but preserves newlines — used for the free-text message. */
export function cleanMultiline(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(CONTROL_CHARS_KEEP_NEWLINE, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalise an Indian mobile number to bare digits with country code.
 *
 * Accepts the forms people actually type: "+91 95090 17150", "09509017150",
 * "9509017150", "91-9509017150". Indian mobile numbers are ten digits starting
 * 6–9. Returns null when it is not a number we can call back.
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;

  let local = digits;
  if (local.length === 12 && local.startsWith('91')) local = local.slice(2);
  else if (local.length === 11 && local.startsWith('0')) local = local.slice(1);
  else if (local.length === 13 && local.startsWith('091')) local = local.slice(3);

  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `91${local}`;
}

/**
 * Pragmatic email check. Deliberately not RFC 5322 — the exhaustive grammar
 * rejects addresses that work and accepts ones that do not. Email is optional
 * here anyway; the phone number is what gets the callback.
 */
export function isPlausibleEmail(value: string): boolean {
  if (value.length > LIMITS.email.max) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length === 0 || domain.length < 3) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) &&
    /^[a-zA-Z0-9.-]+$/.test(domain);
}

function isClassLevel(value: string): value is ClassLevelValue {
  return (CLASS_LEVELS as readonly string[]).includes(value);
}

/** Path only. Rejects absolute URLs and anything carrying a query string. */
export function sanitiseSourcePage(raw: unknown): string {
  const value = clean(raw);
  if (!value.startsWith('/')) return '/';
  if (value.includes('//') || value.includes('..')) return '/';
  const path = value.split(/[?#]/)[0] ?? '/';
  if (path.length > LIMITS.sourcePage.max) return '/';
  if (!/^\/[a-zA-Z0-9\-/]*$/.test(path)) return '/';
  return path;
}

/**
 * Validate one submission.
 *
 * `knownCourseSlugs` is passed in rather than imported so this stays pure and
 * testable, and so an unknown slug is dropped instead of stored.
 */
export function validateEnquiry(
  form: {
    name?: unknown;
    phone?: unknown;
    email?: unknown;
    classLevel?: unknown;
    courseSlug?: unknown;
    message?: unknown;
    sourcePage?: unknown;
    consent?: unknown;
  },
  knownCourseSlugs: readonly string[] = [],
): ValidationResult {
  const errors: ValidationErrors = {};

  // ---- name ---------------------------------------------------------------
  const name = clean(form.name);
  if (name.length === 0) {
    errors.name = 'Please enter your name.';
  } else if (name.length < LIMITS.name.min) {
    errors.name = 'That name looks too short.';
  } else if (name.length > LIMITS.name.max) {
    errors.name = `Please keep the name under ${LIMITS.name.max} characters.`;
  }

  // ---- phone --------------------------------------------------------------
  const phoneRaw = clean(form.phone);
  let phone: string | null = null;
  if (phoneRaw.length === 0) {
    errors.phone = 'Please enter a phone number so we can call you back.';
  } else {
    phone = normalisePhone(phoneRaw);
    if (!phone) {
      errors.phone = 'Please enter a valid 10-digit Indian mobile number.';
    }
  }

  // ---- email (optional) ---------------------------------------------------
  const emailRaw = clean(form.email);
  let email: string | null = null;
  if (emailRaw.length > 0) {
    if (!isPlausibleEmail(emailRaw)) {
      errors.email = 'That email address does not look right.';
    } else {
      email = emailRaw.toLowerCase();
    }
  }

  // ---- class level --------------------------------------------------------
  const classLevelRaw = clean(form.classLevel);
  let classLevel: ClassLevelValue | null = null;
  if (classLevelRaw.length === 0) {
    errors.classLevel = 'Please choose which class or course you are asking about.';
  } else if (!isClassLevel(classLevelRaw)) {
    errors.classLevel = 'Please choose one of the listed options.';
  } else {
    classLevel = classLevelRaw;
  }

  // ---- message (optional) -------------------------------------------------
  const messageRaw = cleanMultiline(form.message);
  let message: string | null = null;
  if (messageRaw.length > LIMITS.message.max) {
    errors.message = `Please keep the message under ${LIMITS.message.max} characters.`;
  } else if (messageRaw.length > 0) {
    message = messageRaw;
  }

  // ---- consent ------------------------------------------------------------
  // Must be explicitly present. An unchecked HTML checkbox is simply absent
  // from the submission, so "not sent" is the same as "not agreed".
  const consent = form.consent;
  const consentGiven =
    consent === 'on' || consent === 'true' || consent === true;
  if (!consentGiven) {
    errors.consent = 'Please agree to be contacted about your enquiry.';
  }

  // ---- course slug (optional attribution) ---------------------------------
  const courseSlugRaw = clean(form.courseSlug);
  const courseSlug =
    courseSlugRaw.length > 0 && knownCourseSlugs.includes(courseSlugRaw)
      ? courseSlugRaw
      : null;

  const sourcePage = sanitiseSourcePage(form.sourcePage);

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // Narrowing for TypeScript — unreachable when there are no errors.
  if (!phone || !classLevel) return { ok: false, errors: { form: 'Invalid submission.' } };

  return {
    ok: true,
    value: { name, phone, email, classLevel, courseSlug, message, sourcePage },
  };
}

/**
 * Is this a photo path that points inside our own website?
 *
 * Admin-supplied, but still untrusted — a `startsWith('/')` check alone would
 * accept "/../../etc/passwd" and the protocol-relative "//evil.com". Only a
 * plain site-relative image path passes.
 *
 * Lives here rather than in the server action because a module marked
 * 'use server' may only export async functions, and because a security check
 * that cannot be unit-tested is a security check nobody has verified.
 */
export function isSafePhotoPath(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  if (value.includes('..')) return false;
  if (value.includes(String.fromCharCode(92))) return false; // backslash
  if (/[:?#\s]/.test(value)) return false;
  return /^\/[A-Za-z0-9._\-/]+\.(jpe?g|png|webp|avif)$/i.test(value);
}
