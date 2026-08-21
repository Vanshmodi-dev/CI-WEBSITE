import 'server-only';

import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { hashIp, verifyFormToken } from '@/lib/crypto';
import { checkBurst, checkSustained } from '@/lib/rate-limit';
import { notifyNewEnquiry } from '@/lib/notify';
import { log, ipHashPrefix, logUnexpected } from '@/lib/log';
import { validateEnquiry, type ValidationErrors } from '@/lib/validation';
import { institute } from '@/config/institute';

/**
 * The enquiry pipeline.
 *
 *   Browser
 *     → server-side validation      (validation.ts, pure and tested)
 *     → anti-spam                   (honeypot + signed timing token)
 *     → rate limiting               (in-memory burst, then database)
 *     → duplicate suppression
 *     → database                    (Prisma, server-only)
 *     → notification                (best-effort, never blocks)
 *
 * The browser never reaches the database. `src/lib/db.ts` imports
 * 'server-only', so an import from client code is a build error rather than a
 * runtime leak.
 */

export type SubmitOutcome =
  | { status: 'success'; duplicate: boolean }
  | { status: 'invalid'; errors: ValidationErrors }
  | { status: 'rate-limited' }
  | { status: 'unavailable'; ref?: string };

/** Window within which the same number asking about the same thing is a re-send. */
const DUPLICATE_WINDOW_MS = 10 * 60_000;

const KNOWN_COURSE_SLUGS = institute.courses.map((c) => c.slug);

export type RawSubmission = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  classLevel?: unknown;
  courseSlug?: unknown;
  message?: unknown;
  sourcePage?: unknown;
  consent?: unknown;
  /** Honeypot. Must be empty — real browsers never fill a hidden field. */
  website?: unknown;
  /** Signed issue-time token from the rendered form. */
  formToken?: unknown;
};

export async function submitEnquiry(
  raw: RawSubmission,
  clientIp: string,
): Promise<SubmitOutcome> {
  const ipHash = hashIp(clientIp);

  // ---- 1. anti-spam, before anything expensive ---------------------------
  // Honeypot: a hidden field that a person cannot see and therefore cannot
  // fill. Anything in it is automation.
  const honeypot = typeof raw.website === 'string' ? raw.website.trim() : '';
  if (honeypot.length > 0) {
    log.warn('enquiry.rejected.honeypot', { ip: ipHashPrefix(ipHash) });
    // Reported to the caller as success. Telling a bot why it failed only
    // helps it try again; a real person can never reach this branch.
    return { status: 'success', duplicate: false };
  }

  const token = typeof raw.formToken === 'string' ? raw.formToken : '';
  const tokenResult = verifyFormToken(token);
  if (!tokenResult.ok) {
    log.warn('enquiry.rejected.token', {
      ip: ipHashPrefix(ipHash),
      reason: tokenResult.reason,
    });
    // A forged or absent signature cannot come from our rendered form, so it
    // is automation. Silently accept: telling a bot why it failed only helps
    // it try again, and no real person can reach this branch.
    if (tokenResult.reason === 'bad-signature') {
      return { status: 'success', duplicate: false };
    }

    // 'too-fast' is a bot SIGNAL, not proof. A real person using autofill can
    // beat the threshold, and silently discarding their enquiry would lose a
    // lead with no indication to anyone — the worst possible outcome for the
    // institute. So we ask them to submit again: a person will, most bots
    // will not, and the second attempt is naturally past the threshold.
    if (tokenResult.reason === 'too-fast') {
      return {
        status: 'invalid',
        errors: { form: 'That was very quick — please press submit once more to confirm.' },
      };
    }

    // Expired or malformed: plausibly a real person who left the tab open.
    return {
      status: 'invalid',
      errors: { form: 'This form expired. Please reload the page and try again.' },
    };
  }

  // ---- 2. burst limit, before any database work --------------------------
  const burst = checkBurst(ipHash);
  if (!burst.allowed) {
    log.warn('enquiry.rejected.rate', { ip: ipHashPrefix(ipHash), scope: burst.scope });
    return { status: 'rate-limited' };
  }

  // ---- 3. validation ------------------------------------------------------
  const validated = validateEnquiry(raw, KNOWN_COURSE_SLUGS);
  if (!validated.ok) {
    // Field NAMES only. Never the values that failed.
    log.info('enquiry.rejected.validation', {
      ip: ipHashPrefix(ipHash),
      fields: Object.keys(validated.errors),
    });
    return { status: 'invalid', errors: validated.errors };
  }

  if (!isDatabaseConfigured()) {
    log.error('enquiry.unavailable.no-database', { ip: ipHashPrefix(ipHash) });
    return { status: 'unavailable' };
  }

  const input = validated.value;

  try {
    const prisma = getPrisma();

    // ---- 4. sustained rate limit -----------------------------------------
    const sustained = await checkSustained(ipHash);
    if (!sustained.allowed) {
      log.warn('enquiry.rejected.rate', {
        ip: ipHashPrefix(ipHash),
        scope: sustained.scope,
      });
      return { status: 'rate-limited' };
    }

    // ---- 5. duplicate suppression ----------------------------------------
    // A double-tapped submit button, or a page refresh, should not create two
    // leads for the institute to call twice.
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const existing = await prisma.enquiry.findFirst({
      where: {
        phone: input.phone,
        classLevel: input.classLevel,
        createdAt: { gte: since },
      },
      select: { id: true },
    });

    if (existing) {
      log.info('enquiry.duplicate.suppressed', {
        enquiryId: existing.id,
        ip: ipHashPrefix(ipHash),
      });
      return { status: 'success', duplicate: true };
    }

    // ---- 6. persist -------------------------------------------------------
    const created = await prisma.enquiry.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email,
        classLevel: input.classLevel,
        courseSlug: input.courseSlug,
        message: input.message,
        sourcePage: input.sourcePage,
        consentAt: new Date(),
        ipHash,
      },
      select: { id: true, classLevel: true, sourcePage: true },
    });

    log.info('enquiry.created', {
      enquiryId: created.id,
      classLevel: created.classLevel,
      sourcePage: created.sourcePage,
      ip: ipHashPrefix(ipHash),
    });

    // ---- 7. notify — best effort, never blocks the visitor ----------------
    await notifyNewEnquiry(created);

    return { status: 'success', duplicate: false };
  } catch (error) {
    // Production-safe: the visitor gets a generic message plus a reference,
    // and the detail stays in the server log (Master Plan §19).
    const ref = logUnexpected('enquiry.failed', error);
    return { status: 'unavailable', ref };
  }
}

/**
 * Best-effort client IP from proxy headers.
 *
 * These headers are attacker-controllable in principle, so this is used ONLY
 * for rate limiting and never for authorisation. On Vercel, x-forwarded-for is
 * set by the platform and the left-most entry is the client. A spoofed value
 * lets someone evade their own rate limit; it does not let them do anything
 * else, and the burst limiter still caps a single connection.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
