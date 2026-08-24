/**
 * The data-retention policy — the numbers, and why each one is what it is.
 *
 * Import-free on purpose, so both the server code (src/lib/retention.ts) and
 * the maintenance script (scripts/retention.mjs) can read the same values, and
 * so the policy can be unit-tested without a database.
 *
 * =============================================================================
 * WHY A RETENTION POLICY EXISTS AT ALL
 * =============================================================================
 * Every phase before Phase 10 added data and none removed any. That is how a
 * database of enquiries from parents, and abuse-control identifiers derived
 * from their IP addresses, quietly becomes a permanent record nobody decided to
 * keep. Data minimisation is not only about what you collect; it is about how
 * long you keep it once the reason has expired.
 */

export const RETENTION = {
  /**
   * Days after which an enquiry's `ipHash` is cleared.
   *
   * The hash supports two rate-limit windows: 15 minutes and 24 hours. After a
   * day it has no operational purpose at all. Thirty days rather than two so a
   * burst of abuse can still be investigated after a weekend and a holiday —
   * and then it goes. It is an HMAC and never a raw address, but it is still a
   * per-person identifier, and keeping one for a check that only ever looks
   * back a day is data we cannot justify holding.
   */
  ipHashDays: 30,

  /**
   * Days after which an audit entry is removed.
   *
   * This is the record that answers "who published this student's photograph,
   * and when?" — a question that can arrive long after the fact, from a parent
   * rather than from an engineer. It holds no personal data by design: an
   * actor, an action, an entity type and an id. Three years covers a student's
   * time at the institute plus a margin.
   */
  auditDays: 365 * 3,

  /**
   * Suggested enquiry retention. REPORTED ONLY — nothing deletes on this.
   *
   * An enquiry is a business record: the institute may legitimately want to
   * know that a family asked about Class XI two years ago. Choosing that period
   * is THEIR decision, and quietly deleting a lead would be worse than keeping
   * it. The count is surfaced so the decision can be made with a number in
   * front of it.
   */
  suggestedEnquiryDays: 365 * 2,
} as const;

export const DAY_MS = 86_400_000;

/** The instant before which records of this kind are past their window. */
export function cutoff(days: number, now: number = Date.now()): Date {
  return new Date(now - days * DAY_MS);
}
