import type { Metadata } from 'next';
import Link from 'next/link';
import { institute, publishedCourses, telHref } from '@/config/institute';
import { pageMetadata } from '@/lib/seo';
import { Container, Section } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';

export const metadata: Metadata = pageMetadata({
  title: 'About',
  description: `${institute.name} — ${institute.tagline}, in ${institute.locality}.`,
  path: '/about',
});

/**
 * About.
 *
 * ⚠ WHAT IS AND IS NOT VERIFIED HERE.
 *
 * Verified, and therefore used:
 *   - the institute's name
 *   - its tagline, taken verbatim from the logo artwork
 *   - the programmes it offers (src/config/institute.ts)
 *   - its locality
 *
 * NOT verified, and therefore ABSENT — not softened, not hedged, absent:
 *   - the year it was founded        - who founded it
 *   - faculty names or credentials   - student numbers
 *   - pass rates or achievements     - awards or affiliations
 *   - class sizes or infrastructure
 *
 * A page like this normally opens with "Founded in 2005 by...". We do not know
 * that, so it does not appear. The page is built around what is true, and the
 * one section that would otherwise be filled with invented history instead
 * states plainly what the institute does — which is verifiable from its own
 * name and its own programme list.
 */
export default function AboutPage() {
  return (
    <>
      <section className="border-b border-rule bg-paper">
        <Container>
          <div className="max-w-3xl py-16 md:py-20">
            <p className="eyebrow text-accent-text">About</p>
            <h1 className="mt-4 text-h1 font-bold leading-tight text-heading lg:text-[44px]">
              {institute.tagline}
            </h1>
            <p className="measure mt-5 text-[18px] leading-relaxed text-muted">
              {institute.name} teaches commerce, and only commerce, in{' '}
              {institute.locality}.
            </p>
          </div>
        </Container>
      </section>

      {/* What we do — grounded entirely in the programme list. */}
      <Section tone="surface" labelledBy="what-heading">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
          <div>
            <h2
              id="what-heading"
              className="font-display text-h2 font-bold text-heading"
            >
              What we teach
            </h2>
            <p className="measure mt-4 text-[17px] leading-relaxed text-text">
              We cover the commerce path from school through professional
              examinations — Class XI and XII, and the CA and CMA
              qualifications. A student can start with us in Class XI and stay
              through CA Intermediate without changing institute.
            </p>
            <p className="measure mt-4 text-[17px] leading-relaxed text-text">
              Being commerce-only is the point. Every programme below shares the
              same subjects at its foundation, so what a student learns for
              their boards is the same material that carries them into CA
              Foundation.
            </p>
          </div>

          <aside>
            <div className="rounded-md border border-rule bg-paper p-6">
              <h3 className="eyebrow text-accent-text">Programmes</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {publishedCourses.map((course) => (
                  <li key={course.slug}>
                    <Link
                      href={`/courses/${course.slug}`}
                      className="text-[17px] text-link hover:text-link-hover"
                    >
                      {course.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </Section>

      {/*
        The institute's story, its founder and its faculty belong here. We do
        not have them, so rather than inventing a history this section says
        what is true today and offers a way to ask.
      */}
      <Section tone="paper" labelledBy="story-heading">
        <h2 id="story-heading" className="font-display text-h2 font-bold text-heading">
          Our story
        </h2>
        <p className="measure mt-4 text-[17px] leading-relaxed text-muted">
          We are writing this properly, with the people who built the institute,
          rather than putting up something approximate. It will appear here
          shortly. Until then, the fastest way to learn how we work is to call
          and ask.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href={telHref} variant="secondary">
            Call {institute.phonePrimary.display}
          </Button>
          <Button href="/contact" variant="secondary">
            Visit us
          </Button>
        </div>
      </Section>

      <Section tone="band" labelledBy="about-cta">
        <div className="max-w-2xl">
          <h2 id="about-cta" className="text-h2 font-bold leading-tight text-band-text">
            Come and see the place
          </h2>
          <p className="measure mt-4 text-[17px] leading-relaxed text-band-muted">
            The clearest way to judge an institute is to visit it and talk to
            the people teaching. We are in {institute.locality}.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/admissions" size="lg" variant="onBand">
              Send an enquiry
            </Button>
            <Button href="/contact" size="lg" variant="onBand">
              Get directions
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
