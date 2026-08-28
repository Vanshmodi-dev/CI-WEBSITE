import { institute } from '@/config/institute';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getReviews, reviewsConfigured } from '@/lib/reviews/fetch';
import { PageHeader, Card, Notice } from '@/components/admin/ui';
import { RefreshReviewsButton } from './refresh-button';

export const metadata: Metadata = { title: 'Reviews' };

/** Diagnostics must show what is true now, never a cached answer. */
export const dynamic = 'force-dynamic';

/**
 * Reviews — a status screen, not an editor.
 *
 * =============================================================================
 * THERE IS NO REVIEW MANAGEMENT HERE, AND THERE MUST NOT BE
 * =============================================================================
 * Master Plan Decision 02 makes the Review Engine the source of truth. A create
 * or edit control on this screen would fork that, bypass the engine's publish
 * gate, and let the institute write its own "reviews" — which is the exact
 * failure the previous website had and this rebuild exists to correct.
 *
 * So this screen answers three questions and offers one button:
 *
 *   Is the connection set up?
 *   Is it working right now?
 *   What is currently being shown to visitors?
 *   [Check for new reviews]
 *
 * The button clears a cache. It cannot change a review.
 */
export default async function AdminReviewsPage() {
  await requireAdmin();

  const configured = reviewsConfigured();
  const result = await getReviews();

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Reviews come from Google through the Review Engine. They cannot be written or edited here — that is deliberate."
      />

      {!configured ? (
        <div className="mb-6">
          <Notice tone="warn" title="Reviews are not connected yet">
            <p>
              Nothing is broken. The Review Engine has not been switched on for
              {institute.name}, so the website simply does not show a reviews
              section. It will appear on its own once the connection is made.
            </p>
            <p className="mt-2">
              Turning it on needs someone with access to the institute&rsquo;s
              Google Business Profile. It is a one-off setup step, not something
              that can be done from this screen.
            </p>
          </Notice>
        </div>
      ) : null}

      <div className="flex max-w-3xl flex-col gap-6">
        <Card>
          <h2 className="mb-4 font-display text-[18px] font-semibold text-heading">
            Connection
          </h2>
          <dl className="divide-y divide-rule text-small">
            <Row label="Set up">{configured ? 'Yes' : 'Not yet'}</Row>
            <Row label="Working now">{statusLabel(result.status)}</Row>
            {/*
              `detail` is a short technical string built by our own code — an
              HTTP status, a byte count, a refusal reason. It NEVER contains the
              payload or the URL, so it is safe on an authenticated screen and
              is the one place an operator can see why the band is absent.
            */}
            <Row label="Last check said">{result.detail}</Row>
          </dl>
        </Card>

        {result.payload ? (
          <Card>
            <h2 className="mb-4 font-display text-[18px] font-semibold text-heading">
              What visitors are seeing
            </h2>
            <dl className="divide-y divide-rule text-small">
              <Row label="Reviews shown">{String(result.payload.reviews.length)}</Row>
              <Row label="Where they came from">{result.payload.sourceLabel}</Row>
              <Row label="Coverage">
                {result.payload.freshness.kind === 'full'
                  ? 'All reviews'
                  : 'Recent reviews only — the total is not shown on the website'}
              </Row>
              <Row label="Total on Google">
                {result.payload.totalCount === null
                  ? 'Not shown, because the last check was incomplete'
                  : String(result.payload.totalCount)}
              </Row>
              <Row label="Average rating">
                {result.payload.meanRating === null
                  ? 'Not shown'
                  : `${result.payload.meanRating} out of 5`}
              </Row>
            </dl>

            <p className="mt-5 text-[13px] text-muted">
              <Link href="/reviews" target="_blank" className="text-link underline">
                See the reviews page
              </Link>{' '}
              as a visitor sees it.
            </p>
          </Card>
        ) : null}

        <Card>
          <h2 className="mb-1 font-display text-[18px] font-semibold text-heading">
            Check for new reviews
          </h2>
          <p className="measure mb-5 text-small text-muted">
            The website checks for new reviews a few times a day on its own. Use
            this if somebody has just left one and you want to see it now.
          </p>
          <RefreshReviewsButton />
        </Card>

        <Card>
          <h2 className="mb-1 font-display text-[18px] font-semibold text-heading">
            Why you cannot edit reviews here
          </h2>
          <p className="measure text-small text-muted">
            These are other people&rsquo;s words, published on Google. The
            website shows them exactly as they were written and cannot change,
            hide or reorder them. That is what makes them worth showing — a
            review a business can edit is not evidence of anything. If a review
            breaks Google&rsquo;s rules, it has to be reported to Google.
          </p>
        </Card>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-text">{children}</dd>
    </div>
  );
}

/** Plain language for each status. A teacher should not meet "http-error". */
function statusLabel(status: string): string {
  switch (status) {
    case 'ok':
      return 'Yes';
    case 'not-configured':
      return 'Not connected yet';
    case 'unreachable':
      return 'No — the review service could not be reached';
    case 'http-error':
      return 'No — the review service answered with an error';
    case 'too-large':
      return 'No — the response was unexpectedly large and was refused';
    case 'not-json':
      return 'No — the response was not in the expected format';
    case 'rejected':
      return 'No — the response did not pass our checks';
    default:
      return 'Unknown';
  }
}
