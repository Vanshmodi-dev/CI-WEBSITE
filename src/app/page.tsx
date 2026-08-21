import type { Metadata } from 'next';
import { institute } from '@/config/institute';
import { pageMetadata } from '@/lib/seo';
import { Container, Section } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { Hidden } from '@/components/primitives/empty-state';

export const metadata: Metadata = pageMetadata({
  title: `Commerce coaching in ${institute.locality}`,
  description: `${institute.name} — Class XI and XII Commerce, CA Foundation, CA Intermediate and CMA coaching in ${institute.locality}.`,
  path: '/',
});

/**
 * HOMEPAGE — Phase 3 shell.
 *
 * The band order is Master Plan §03. Only the hero is built; every evidence
 * band below it is deliberately absent because the facts behind it do not
 * exist yet (Master Plan §22) and the content-integrity rule forbids inventing
 * them. `<Hidden>` marks each one so the gap is visibly intentional in review
 * and in development, and renders nothing at all in production.
 *
 * Phase 4 fills bands 5, 13 and 14. Phase 5 fills 6, 9, 10, 11 and 12.
 */
export default function HomePage() {
  return (
    <>
      {/* 1 · Announcement bar — driven by an Announcement record with a
          validity window, so a stale notice removes itself. Nothing to show
          until the DB exists in Phase 4. */}
      <Hidden reason="Announcement bar — needs the Announcement model (Phase 4)" />

      {/* 3 · Hero */}
      <section className="border-b border-rule bg-paper">
        <Container>
          <div className="max-w-3xl py-20 md:py-28 lg:py-36">
            <p className="eyebrow text-accent-text">{institute.tagline}</p>

            <h1 className="mt-5 text-display font-bold leading-[1.06] tracking-[-0.02em] text-heading lg:text-[60px]">
              Master Commerce.
              <br />
              Build Your Future.
            </h1>

            <p className="measure mt-6 text-[18px] leading-relaxed text-muted">
              Class XI and XII Commerce, CA Foundation, CA Intermediate and CMA
              coaching in {institute.locality} — taught for concept clarity, not
              memorisation.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button href="/courses" size="lg">
                Explore courses
              </Button>
              <Button href="/admissions" size="lg" variant="secondary">
                Talk to us
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* 4 · Credibility strip — the Google rating and review count come live
          from the Review Engine payload. Nothing is shown until the engine is
          activated, and there is no "success rate" metric by design (§03). */}
      <Hidden reason="Credibility strip — needs the Review Engine payload (Phase 5)" />

      {/* 5 · Course finder */}
      <Hidden reason="Course cards — needs course content and batch data (Phase 4)" />

      {/* 6 · Results and toppers */}
      <Hidden reason="Results band — needs verified results + consent (Phase 5)" />

      {/* 7 · Why Commerce Insight — pillars must be confirmed as things the
          institute actually offers before any of them are claimed (§10). */}
      <Hidden reason="Why Commerce Insight — pillars await client confirmation" />

      {/* 8 · Faculty */}
      <Hidden reason="Faculty band — needs verified credentials and portraits" />

      {/* 9 · Google reviews */}
      <Hidden reason="Reviews band — needs the Review Engine payload (Phase 5)" />

      {/* 10 · Videos */}
      <Hidden reason="Videos band — needs the YouTube channel ID (Phase 5)" />

      {/* 11 · Student stories */}
      <Hidden reason="Student stories — needs stories and written consent" />

      {/* 12 · Gallery */}
      <Hidden reason="Gallery strip — needs photography (Phase 1)" />

      {/* 13 · Location */}
      <Hidden reason="Location band — needs Place ID and opening hours (Phase 4)" />

      {/* 14 · Final CTA — safe to build now: it states no facts. */}
      <Section tone="band" labelledBy="cta-heading">
        <div className="max-w-2xl">
          <h2
            id="cta-heading"
            className="text-h2 font-bold leading-tight text-band-text lg:text-[32px]"
          >
            Ready to take the next step?
          </h2>
          <p className="measure mt-4 text-[17px] leading-relaxed text-band-muted">
            Talk to us about programmes, batches and admissions.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/admissions" size="lg" variant="onBand">
              Enquire now
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
