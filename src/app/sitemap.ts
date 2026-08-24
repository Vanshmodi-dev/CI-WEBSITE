import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { publishedCourses } from '@/config/institute';
import { lastPublishedAt } from '@/lib/public-data';

/**
 * Master Plan §17 — generated from routes that actually exist.
 *
 * THREE RULES, and the reason each one is here:
 *
 * 1. EVERY ENTRY MUST RESOLVE. A sitemap listing unwritten pages is a set of
 *    404s handed straight to Google. Course URLs come from `publishedCourses`,
 *    so a course appears only once its content page is written.
 *
 * 2. /admin IS ABSENT AND MUST STAY ABSENT. It is one of three independent
 *    layers — robots.txt disallows it, the pages carry noindex, and it is not
 *    listed here — because any one of them being edited by mistake should not
 *    expose the admin.
 *
 * 3. NO INDIVIDUAL STUDENT RECORD APPEARS. Results and stories have no URLs of
 *    their own, so there is nothing per-student to list. If they ever gain
 *    individual routes, those URLs must come from the functions in
 *    `src/lib/public-data.ts` and nowhere else — that is the only code path
 *    that applies consent filtering, and a sitemap built from a raw query would
 *    be a way to publish an unpublished child's URL without ever rendering it.
 *
 * ⚠ NO QUERY-STRING VARIANTS. `/results?year=2025` and friends are navigation
 * states, not documents; they carry `noindex, follow` (see `listingIndexing` in
 * src/lib/seo.ts) and listing them here would contradict that.
 */

/**
 * Regenerated hourly, and immediately whenever the admin publishes — the
 * revalidation helpers include this path, so `lastModified` cannot go stale
 * while content changes underneath it.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /**
   * `lastModified` is read from the content, not from the clock.
   *
   * This used to be `new Date()` for every entry, which told Google that all
   * nine pages changed at the moment of the last deploy. That is not merely
   * imprecise — it is a claim we cannot support, and a crawler that acts on it
   * and finds nothing changed learns to discount the signal. Where we know when
   * content last changed we say so; where we do not, the field is omitted.
   */
  const content = await lastPublishedAt();

  const entry = (path: string, lastModified?: Date | null): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    ...(lastModified ? { lastModified } : {}),
  });

  /**
   * The homepage shows results, stories, batches and the notice banner, so it
   * is as fresh as the freshest of them.
   */
  const homepageChanged = [content.results, content.stories, content.announcements]
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const routes: MetadataRoute.Sitemap = [
    entry('/', homepageChanged),
    // Static prose. We do not track when the copy was last edited, so claiming
    // a date would be inventing one.
    entry('/about'),
    entry('/courses'),
    entry('/results', content.results),
    entry('/stories', content.stories),
    entry('/announcements', content.announcements),
    entry('/admissions'),
    entry('/contact'),
  ];

  for (const course of publishedCourses) {
    // A course page's only changing content is its batch list.
    routes.push(entry(`/courses/${course.slug}`, content.batches));
  }

  return routes;
}
