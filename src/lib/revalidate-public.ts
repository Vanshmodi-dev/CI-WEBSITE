import 'server-only';

import { revalidatePath } from 'next/cache';
import { institute } from '@/config/institute';

/**
 * Refresh the public pages after an admin change.
 *
 * WHY THIS EXISTS. The public pages are ISR-cached (15 minutes to an hour), so
 * without this a teacher publishes an announcement and then watches the website
 * not change — for up to an hour, with no way to tell whether it worked. They
 * would reasonably conclude the admin is broken and call for help.
 *
 * Admin actions previously revalidated only `/admin/*`, which kept the admin
 * itself instant while leaving the public site stale. Found in Phase 6 testing.
 *
 * Each helper clears exactly the pages that show that kind of record, so a
 * batch change does not needlessly discard the results cache.
 *
 * ⚠ EVERY HELPER ALSO CLEARS THE SITEMAP. Phase 9 made `lastModified` read the
 * real `updatedAt` of published content instead of the build clock, which means
 * the sitemap is now content-derived — and content-derived output that is not
 * revalidated is stale output. `/sitemap.xml` is cheap to regenerate and there
 * is no admin change that cannot move one of its dates.
 */

/** The sitemap's dates come from published content, so it ages with content. */
function revalidateSitemap(): void {
  revalidatePath('/sitemap.xml');
}

/** Announcements appear on their own page and in the site-wide banner. */
export function revalidateAnnouncements(): void {
  revalidatePath('/announcements');
  revalidatePath('/'); // the banner
  revalidateSitemap();
}

/** Batches appear on the homepage, the course index and each course page. */
export function revalidateBatches(courseSlug?: string): void {
  revalidatePath('/');
  revalidatePath('/courses');
  if (courseSlug) {
    revalidatePath(`/courses/${courseSlug}`);
  } else {
    for (const course of institute.courses) {
      revalidatePath(`/courses/${course.slug}`);
    }
  }
  revalidateSitemap();
}

/**
 * Results appear on the homepage and the results page.
 *
 * `/results` renders per request (it reads `searchParams`), so clearing it is a
 * no-op today. It is kept because the call site should stay correct if that
 * route ever becomes cacheable — and because removing it would make the next
 * reader believe results are not meant to refresh. `/` genuinely is cached and
 * genuinely does show a results band.
 */
export function revalidateResults(): void {
  revalidatePath('/');
  revalidatePath('/results');
  revalidateSitemap();
}

/** Stories appear on the homepage and the stories page. */
export function revalidateStories(): void {
  revalidatePath('/');
  revalidatePath('/stories');
  revalidateSitemap();
}
