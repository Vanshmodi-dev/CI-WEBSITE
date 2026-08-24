import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { isIndexable } from '@/config/launch';

/**
 * robots.txt — Master Plan §17.
 *
 * Indexing is governed entirely by src/config/launch.ts, which requires BOTH a
 * reviewed code change and a real production domain. Until both are true this
 * disallows everything, because shipping an indexable site full of placeholder
 * content is how a domain earns a bad first impression that takes weeks to undo.
 *
 * /admin stays disallowed even after launch. It is also absent from the sitemap
 * and carries noindex headers of its own — three independent layers, because
 * one of them being edited by mistake should not expose the admin.
 *
 * -----------------------------------------------------------------------------
 * PHASE 9 AUDIT NOTES
 * -----------------------------------------------------------------------------
 * · THE SITEMAP LINE IS OMITTED BEFORE LAUNCH. `Disallow: /` next to a
 *   `Sitemap:` line is a contradictory file: one directive says stay out, the
 *   next hands over a list of everything to visit. Crawlers resolve that
 *   inconsistently, and there is no reason to find out how. Nobody needs the
 *   sitemap URL from robots.txt before the site is live — it is submitted by
 *   hand in Search Console at launch, per docs/PRODUCTION-SETUP.md.
 *
 * · /admin IS LISTED EXPLICITLY IN BOTH BRANCHES. `Disallow: /` already covers
 *   it before launch, so the second line is redundant today. It is there so
 *   that whoever eventually relaxes the pre-launch rule cannot relax the admin
 *   rule by accident at the same time.
 *
 * · FILTERED URLS ARE NOT BLOCKED HERE. `/results?year=2025` and friends carry
 *   `noindex, follow` in their metadata instead. Blocking them in robots.txt
 *   would be worse, not better: a blocked URL cannot be read, so the crawler
 *   never sees the noindex, and a page it cannot read is a page whose links it
 *   cannot follow to the records. See `listingIndexing` in src/lib/seo.ts.
 *
 * · THE FINAL SWITCH IS NOT FLIPPED HERE, EVER. It lives in
 *   src/config/launch.ts and belongs to the deployment phase.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return {
      rules: [{ userAgent: '*', disallow: ['/', '/admin'] }],
    };
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
