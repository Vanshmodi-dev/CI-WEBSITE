import type { Metadata } from 'next';
import { institute } from '@/config/institute';
import { publicPageMetadata } from '@/lib/share-image';
import { getPublicReviews } from '@/lib/reviews/fetch';
import { getSiteContent, getContactBlock, whatsappLink } from '@/lib/site-content';
import { Section, PageHeader, ClosingCta } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { ReviewCard } from '@/components/domain/public-cards';
import { ReviewProvenance } from '@/components/domain/review-provenance';

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({
    title: 'Reviews',
    description: `What people say about ${institute.name} in ${institute.locality}.`,
    path: '/reviews',
  });
}

/**
 * Six hours, matched to the Review Engine's harvest cadence.
 *
 * The `fetch` inside `getPublicReviews` carries the same interval, so this and
 * the payload cache expire together rather than one holding a render built from
 * the other's stale data.
 */
export const revalidate = 21600;

/**
 * /reviews — reviews collected on Google, read from the Review Engine.
 *
 * =============================================================================
 * THE ENGINE IS THE SOURCE OF TRUTH. THIS PAGE OWNS NOTHING.
 * =============================================================================
 * Master Plan Decision 02: "The Review Engine stays the source of truth for
 * reviews. We read its published payload server-side and render it in our own
 * components. We never copy it into our database, and the visitor's browser
 * never contacts Google."
 *
 * There is no reviews table, no admin editor and no moderation here. Adding any
 * of them would fork the source of truth and bypass the publish gate the engine
 * exists to enforce.
 *
 * =============================================================================
 * NO Review OR AggregateRating STRUCTURED DATA
 * =============================================================================
 * `publish.schema_org` is false in the engine's client config, and `seo.ts`
 * already omits both deliberately: Google's guidelines restrict marking up
 * reviews collected on another platform as your own, and a manual action
 * against the domain costs far more than star snippets are worth. The reviews
 * display; they are simply not claimed as our own structured data.
 *
 * =============================================================================
 * FAILURE IS SILENT
 * =============================================================================
 * `frontend/SAFETY.md` §4: a failure is never the visitor's problem. Whatever
 * goes wrong upstream — unset URL, timeout, 404, malformed JSON, wrong schema
 * version — `getPublicReviews` returns null and this page shows the same
 * "nothing here yet" state a business with no reviews would see. No error text.
 */
export default async function ReviewsPage() {
  // `getSiteContent()` is wrapped in React `cache()`, so the header, the
  // footer and this page share ONE query rather than three.
  const [payload, contact, content] = await Promise.all([
    getPublicReviews(),
    getContactBlock(),
    getSiteContent(),
  ]);
  const reviews = payload?.reviews ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Reviews"
        title={<>{content['page.reviews.title']}</>}
        standfirst={
          reviews.length > 0 ? (
            <>
              Reviews left on {payload?.sourceLabel ?? 'Google'} by people who
              have studied at {institute.name}. We do not write them and we
              cannot edit them.
            </>
          ) : (
            <>
              We would rather show you real reviews than write our own.
            </>
          )
        }
      />

      {reviews.length === 0 ? (
        <Section tone="surface" labelledBy="reviews-empty">
          {/*
            THE EMPTY STATE MUST NOT LOOK LIKE REVIEW CONTENT.

            No greyed-out placeholder cards, no "5.0" with nothing behind it,
            no sample testimonial. The previous website invented testimonials;
            a convincing-looking empty state is the same failure wearing a
            different coat.
          */}
          <div className="max-w-2xl rounded-lg border border-dashed border-rule-strong p-8 md:p-10">
            <h2
              id="reviews-empty"
              className="font-display text-h2 font-bold leading-[1.15] tracking-[-0.015em] text-heading"
            >
              No reviews to show here yet
            </h2>
            <p className="measure mt-4 text-[17px] leading-relaxed text-muted">
              When people review {institute.name} on Google, their reviews
              appear here automatically. Nothing on this page is written by us.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href={contact.telHref}>Call {contact.phonePrimaryDisplay}</Button>
              <Button href="/contact" variant="secondary">
                Visit us
              </Button>
            </div>
          </div>
        </Section>
      ) : (
        <Section tone="surface" labelledBy="reviews-list">
          <h2 id="reviews-list" className="sr-only">
            Reviews
          </h2>

          {payload ? <ReviewProvenance payload={payload} className="mb-8" /> : null}

          <ul className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <li key={review.id} className="contents">
                <ReviewCard review={review} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ClosingCta
        id="reviews-cta"
        title={<>{content['page.reviews.ctaTitle']}</>}
        body={<>{content['page.reviews.ctaBody']}</>}
        actions={
          <>
            <Button href="/admissions" size="lg" variant="onBand">
              Send an enquiry
            </Button>
            <Button
              href={whatsappLink(contact.whatsappNumber)}
              external
              size="lg"
              variant="onBandSecondary"
            >
              WhatsApp us
            </Button>
          </>
        }
      />
    </>
  );
}
