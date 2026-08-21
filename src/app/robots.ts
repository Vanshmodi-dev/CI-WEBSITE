import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Master Plan §17.
 *
 * The site is PRE-LAUNCH, so everything is disallowed. Phase 7 replaces the
 * blanket rule with the commented-out policy below, once the content is real
 * and the client has signed off. Shipping an indexable site with placeholder
 * content is how a domain earns a bad first impression from Google.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };

  // Phase 7:
  // return {
  //   rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api'] }],
  //   sitemap: `${SITE_URL}/sitemap.xml`,
  //   host: SITE_URL,
  // };
}
