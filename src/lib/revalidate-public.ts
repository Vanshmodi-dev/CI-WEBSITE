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
 */

/** Announcements appear on their own page and in the site-wide banner. */
export function revalidateAnnouncements(): void {
  revalidatePath('/announcements');
  revalidatePath('/'); // the banner
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
}

/** Results appear on the homepage and the results page. */
export function revalidateResults(): void {
  revalidatePath('/');
  revalidatePath('/results');
}

/** Stories appear on the homepage and the stories page. */
export function revalidateStories(): void {
  revalidatePath('/');
  revalidatePath('/stories');
}
