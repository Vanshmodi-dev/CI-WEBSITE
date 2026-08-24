import 'server-only';

import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { log, logUnexpected } from '@/lib/log';
import { RETENTION, cutoff } from '@/lib/retention-policy';

export { RETENTION } from '@/lib/retention-policy';

/**
 * Data retention — deleting what we no longer have a reason to hold.
 *
 * =============================================================================
 * WHY THIS EXISTS
 * =============================================================================
 * Every phase before this one added data and none removed any. That is how a
 * database of enquiries from parents, and abuse-control identifiers derived
 * from their IP addresses, quietly becomes a permanent record nobody decided to
 * keep.
 *
 * Data minimisation is not only about what you collect. It is about how long
 * you keep it after the reason has expired.
 *
 * =============================================================================
 * THE POLICY
 * =============================================================================
 *
 * `Enquiry.ipHash` — CLEARED AFTER 30 DAYS.
 *   The hash exists to support two rate-limit windows: 15 minutes and 24 hours.
 *   After a day it has no operational purpose whatsoever. It is kept for 30
 *   days rather than 2 so that a burst of abuse can still be investigated after
 *   a weekend and a holiday, and then it goes. It is an HMAC and never a raw
 *   address, but it is still a per-person identifier, and a per-person
 *   identifier retained for a check that only looks back a day is data we
 *   cannot justify holding.
 *
 * `AuditLog` — KEPT FOR 3 YEARS.
 *   This is the record that answers "who published this student's photograph,
 *   and when?" — a question that can arrive long after the fact, from a parent
 *   rather than from an engineer. It holds no personal data by design: an
 *   actor, an action, an entity type and an id. Three years covers a student's
 *   time at the institute plus a margin.
 *
 * `Enquiry` rows themselves — NOT DELETED HERE, DELIBERATELY.
 *   An enquiry is a business record: the institute may legitimately want to
 *   know that a family asked about Class XI two years ago. Choosing that period
 *   is the INSTITUTE's decision, not ours, and deleting a lead behind their
 *   back would be worse than keeping it. `staleEnquiryCount()` reports how many
 *   are older than the suggested period so the decision can be made with a
 *   number in front of it. docs/PHASE-10-SECURITY-HARDENING.md records it as an
 *   open question for the owner.
 *
 * =============================================================================
 * HOW IT RUNS
 * =============================================================================
 * `scripts/retention.mjs`, by hand or from a scheduled job once hosting exists.
 * Deliberately NOT wired into a request path: retention that runs as a side
 * effect of someone visiting a page is retention that stops when traffic does.
 */


export type RetentionReport = {
  ipHashesCleared: number;
  auditEntriesRemoved: number;
  staleEnquiries: number;
};

/**
 * Apply the policy.
 *
 * Idempotent: running it twice in a row clears nothing the second time. Never
 * throws — a retention failure is logged and reported, not raised, because the
 * caller is a maintenance script and a half-completed pass is still progress.
 */
export async function applyRetention(now: Date = new Date()): Promise<RetentionReport> {
  const report: RetentionReport = {
    ipHashesCleared: 0,
    auditEntriesRemoved: 0,
    staleEnquiries: 0,
  };
  if (!isDatabaseConfigured()) return report;

  const prisma = getPrisma();

  try {
    const ipCutoff = cutoff(RETENTION.ipHashDays, now.getTime());
    const cleared = await prisma.enquiry.updateMany({
      where: { createdAt: { lt: ipCutoff }, ipHash: { not: null } },
      data: { ipHash: null },
    });
    report.ipHashesCleared = cleared.count;
  } catch (error) {
    logUnexpected('retention.ip_hash_failed', error);
  }

  try {
    const auditCutoff = cutoff(RETENTION.auditDays, now.getTime());
    const removed = await prisma.auditLog.deleteMany({ where: { at: { lt: auditCutoff } } });
    report.auditEntriesRemoved = removed.count;
  } catch (error) {
    logUnexpected('retention.audit_failed', error);
  }

  try {
    report.staleEnquiries = await staleEnquiryCount(now);
  } catch (error) {
    logUnexpected('retention.stale_count_failed', error);
  }

  // Counts only. There is nothing identifying in a count.
  log.info('retention.applied', { ...report });
  return report;
}

/** How many enquiries are older than the suggested period. Reported, not acted on. */
export async function staleEnquiryCount(now: Date = new Date()): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const stale = cutoff(RETENTION.suggestedEnquiryDays, now.getTime());
  return getPrisma().enquiry.count({ where: { createdAt: { lt: stale } } });
}
