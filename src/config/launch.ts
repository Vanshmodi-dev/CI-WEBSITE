// Relative, not the `@/` alias, and deliberately so: Node's test runner cannot
// resolve the alias, and this file is the launch switch - the one module that
// most needs to be directly unit-testable.
import { instituteFactsVerified, unverifiedFacts } from './institute.ts';

/**
 * THE LAUNCH SWITCH
 * =============================================================================
 *
 * One place decides whether search engines may index this website. Nothing else
 * in the app makes that decision.
 *
 * ⚠ TWO conditions must BOTH be true before the site is indexable. That is
 * deliberate. A single environment variable is far too easy to set by accident
 * — a copy-pasted deploy config, a shared .env, a teammate flipping something
 * to test — and the cost of getting it wrong is a half-finished site with
 * placeholder content entering Google's index under the institute's name.
 * Getting it *back* out takes weeks.
 *
 *   1. SITE_IS_LAUNCHED below must be changed to `true` IN THE CODE, in a
 *      commit someone reviewed.
 *   2. NEXT_PUBLIC_SITE_URL must be a real https:// origin, not localhost.
 *   3. Every institute fact must be marked verified (Phase 14). The address and
 *      both phone numbers were carried over from the OLD website - the one that
 *      was found publishing fabricated toppers - and are marked `unverified`
 *      until Commerce Insight confirms them in writing. `institute.ts` always
 *      said they "must all read verified before the site goes public"; nothing
 *      enforced it, so the site could have been indexed and ranked on an
 *      address and phone number nobody had checked.
 *
 * Until then every page carries `noindex, nofollow` and robots.txt disallows
 * everything.
 *
 * -----------------------------------------------------------------------------
 * THE EXACT LAUNCH ACTION
 * -----------------------------------------------------------------------------
 * When the institute has confirmed the content is real and correct:
 *
 *   1. Set SITE_IS_LAUNCHED = true here.
 *   2. Set NEXT_PUBLIC_SITE_URL to the live domain (https://…).
 *   3. Commit, deploy, then check https://<domain>/robots.txt shows `Allow: /`.
 *   4. Submit the sitemap in Google Search Console.
 *
 * The pre-launch checklist that must be finished first is in
 * docs/PRODUCTION-SETUP.md.
 */

/**
 * Set to `true` only when the institute has approved the live content.
 *
 * Leave this alone if you are unsure. A site that is not indexed loses nothing
 * except time; a site indexed with placeholder content damages the brand.
 */
const SITE_IS_LAUNCHED = false;

function hasRealDomain(): boolean {
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  if (!url.startsWith('https://')) return false;
  if (url.includes('localhost') || url.includes('127.0.0.1')) return false;
  if (url.includes('.vercel.app')) return false; // preview deployments
  return true;
}

/** True only when the code flag, a real production domain AND verified facts agree. */
export function isIndexable(): boolean {
  return SITE_IS_LAUNCHED && hasRealDomain() && instituteFactsVerified();
}

/**
 * Why the site is not indexable, for the pre-launch banner and the report.
 * Returns null once everything is satisfied.
 */
export function indexingBlockedBecause(): string | null {
  if (!SITE_IS_LAUNCHED) {
    return 'SITE_IS_LAUNCHED is false in src/config/launch.ts';
  }
  if (!hasRealDomain()) {
    return 'NEXT_PUBLIC_SITE_URL is not a live https:// domain';
  }
  const unverified = unverifiedFacts();
  if (unverified.length > 0) {
    // Named, not counted: whoever flipped the switch needs to know WHICH fact
    // to go and confirm, not merely that something is outstanding.
    return `these institute facts are not confirmed yet: ${unverified.join(', ')} (src/config/institute.ts)`;
  }
  return null;
}
