'use server';

import { updateTag, revalidatePath } from 'next/cache';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { peekWindow, recordWindowHit } from '@/lib/burst-limit';

/**
 * Reviews: the ONLY mutation this application has, and it mutates nothing.
 *
 * =============================================================================
 * WHAT IS DELIBERATELY ABSENT
 * =============================================================================
 * There is no create, no edit, no delete, no hide, no reply, no reorder and no
 * moderation. Master Plan Decision 02 makes the Review Engine the source of
 * truth; an editor here would fork it and bypass the publish gate the engine
 * exists to enforce. A teacher who wants a review changed has to take that up
 * with Google, which is the honest answer and the only one available.
 *
 * This function discards a cache entry. That is all it can do.
 *
 * =============================================================================
 * WHY A REFRESH BUTTON EXISTS AT ALL
 * =============================================================================
 * The payload is cached for six hours, matched to the harvest cadence. That is
 * right for visitors and wrong for the moment a teacher has just been told
 * about a new review and wants to see it on the site. Without this they would
 * either wait, or somebody would shorten the cache for everyone.
 */

export type ReviewRefreshState = {
  status: 'idle' | 'refreshed' | 'error';
  message?: string;
};

/**
 * Six an hour.
 *
 * Each refresh causes at most one upstream fetch, so this bounds how hard the
 * admin can make us hit the engine's data origin. Six is well above "I just
 * added a review, show me" and well below anything that would look like
 * traffic to whoever hosts the payload.
 */
const REFRESH_WINDOW = { max: 6, windowMs: 60 * 60_000 } as const;

export async function refreshReviews(
  _prev: ReviewRefreshState,
  _formData: FormData,
): Promise<ReviewRefreshState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const key = `reviews-refresh:${admin.id}`;
  const verdict = peekWindow(key, REFRESH_WINDOW);
  if (!verdict.allowed) {
    const minutes = Math.max(1, Math.ceil(verdict.retryAfterMs / 60_000));
    return {
      status: 'error',
      message: `Reviews have been checked several times just now. Please wait about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
    };
  }
  recordWindowHit(key, REFRESH_WINDOW);

  /*
    `updateTag`, NOT `revalidateTag`.

    Next 16 changed both. `revalidateTag` now takes a required cache-life
    profile and marks data stale — the next request may still be served the old
    payload while a refresh happens behind it, which is precisely wrong for a
    button labelled "check for new reviews": the teacher clicks it, looks at the
    site, and sees what they saw before.

    `updateTag` expires the entry immediately, so the next request waits for
    fresh data. Its own documentation calls this the read-your-own-writes case,
    and it is callable only from a Server Action, which this is.

    It does not fetch anything itself, so a burst of clicks cannot become a
    burst of upstream requests.
  */
  updateTag('reviews');
  revalidatePath('/reviews');
  revalidatePath('/');
  revalidatePath('/admin/reviews');

  await recordAudit(admin, 'updated', 'ReviewsCache', 'reviews', 'cache cleared');

  return {
    status: 'refreshed',
    message: 'Checked. If anything has changed, the website now shows it.',
  };
}
