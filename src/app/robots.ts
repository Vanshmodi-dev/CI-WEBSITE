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
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: `${SITE_URL}/sitemap.xml`,
    };
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
