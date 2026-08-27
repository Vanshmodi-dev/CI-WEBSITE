import { cn } from '@/lib/cn';
import type { SafeReviewPayload } from '@/lib/reviews/payload';

const SYNCED = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/**
 * Where these reviews came from, and how complete they are.
 *
 * =============================================================================
 * THIS EXISTS SO THE PAGE DOES NOT LIE BY OMISSION
 * =============================================================================
 * A grid of glowing quotes with no attribution reads as testimonials the
 * institute chose and wrote. These are neither: they were left on Google by
 * people the institute cannot edit or remove. Saying so is the difference
 * between evidence and marketing, and it is the entire reason the Review Engine
 * exists rather than a testimonials table.
 *
 * =============================================================================
 * THE COUNT IS ONLY SHOWN WHEN IT IS A TOTAL
 * =============================================================================
 * Master Plan §13 sets out the degraded states. On a partial harvest the engine
 * holds only some of the reviews, so printing a number would state a total the
 * payload does not support — "12 reviews" when there are ninety is a false
 * claim made by arithmetic. The normaliser nulls `totalCount` in that case, so
 * there is nothing here to print by accident, and the wording changes to
 * "showing recent reviews" instead.
 *
 * The average is shown only alongside a real total, for the same reason: a mean
 * over an unrepresentative sample is a statistic about our harvest, not about
 * the institute.
 */
export function ReviewProvenance({
  payload,
  className,
}: {
  payload: SafeReviewPayload;
  className?: string;
}) {
  const complete = payload.freshness.kind === 'full' && payload.totalCount !== null;
  const syncedAt = payload.freshness.syncedAt;

  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-accent pl-4',
        className,
      )}
    >
      <p className="text-small font-medium text-text">
        {complete ? (
          <>
            {payload.totalCount} {payload.totalCount === 1 ? 'review' : 'reviews'} on{' '}
            {payload.sourceLabel}
            {payload.meanRating !== null ? (
              <>, averaging {payload.meanRating} out of 5</>
            ) : null}
          </>
        ) : (
          <>Showing recent reviews from {payload.sourceLabel}</>
        )}
      </p>

      {syncedAt ? (
        <p className="text-[13px] text-muted">
          {/*
            A `<time>` element, so the machine-readable date is the ISO value
            while the reader sees a date written the way people write dates.
          */}
          Synced <time dateTime={syncedAt}>{SYNCED.format(new Date(syncedAt))}</time>
        </p>
      ) : null}
    </div>
  );
}
