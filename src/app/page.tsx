import type { Metadata } from 'next';
import Link from 'next/link';
import { institute, publishedCourses, telHref, whatsappHref, addressFull } from '@/config/institute';
import { pageMetadata } from '@/lib/seo';
import {
  getPublishedResults,
  getPublishedStories,
  getUpcomingBatches,
  getTopAnnouncement,
} from '@/lib/public-data';
import { Container, Section } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import {
  ResultCard,
  StoryCard,
  BatchCard,
  CourseCard,
} from '@/components/domain/public-cards';

export const metadata: Metadata = pageMetadata({
  title: `Commerce coaching in ${institute.locality}`,
  description: `${institute.name} — ${institute.tagline}. Class XI and XII Commerce, CA Foundation, CA Intermediate and CMA in ${institute.locality}.`,
  path: '/',
});

export const revalidate = 900;

/**
 * Homepage.
 *
 * Band order follows Master Plan §03, with one rule applied throughout: a band
 * that has no real data DOES NOT RENDER. There are no sample toppers, no
 * placeholder statistics and no stock testimonials anywhere on this page.
 *
 * That means the homepage is currently short. It is short and true, which is
 * the trade this whole rebuild exists to make — the site it replaces was long
 * and partly invented.
 */
export default async function HomePage() {
  const [announcement, courseBatches, results, stories] = await Promise.all([
    getTopAnnouncement(),
    getUpcomingBatches({ limit: 3 }),
    getPublishedResults({ limit: 6 }),
    getPublishedStories(2),
  ]);

  const batchCountFor = (slug: string) =>
    courseBatches.filter((b) => b.courseSlug === slug).length;

  const courseName = (slug: string) =>
    institute.courses.find((c) => c.slug === slug)?.name ?? slug;

  return (
    <>
      {/* 1 · Announcement — only while inside its validity window. */}
      {announcement ? (
        <div className="border-b border-navy-700 bg-band text-band-text">
          <Container>
            <p className="py-2.5 text-center text-small">
              {announcement.href ? (
                <Link href={announcement.href} className="text-band-text underline decoration-white/40 underline-offset-4 hover:decoration-white">
                  {announcement.message}
                </Link>
              ) : (
                announcement.message
              )}
            </p>
          </Container>
        </div>
      ) : null}

      {/* 3 · Hero */}
      <section className="border-b border-rule bg-paper">
        <Container>
          <div className="max-w-3xl py-20 md:py-28 lg:py-32">
            <p className="eyebrow text-accent-text">{institute.tagline}</p>

            <h1 className="mt-5 text-display font-bold leading-[1.06] tracking-[-0.02em] text-heading lg:text-[60px]">
              Master Commerce.
              <br />
              Build Your Future.
            </h1>

            <p className="measure mt-6 text-[18px] leading-relaxed text-muted">
              Class XI and XII Commerce, CA Foundation, CA Intermediate and CMA
              in {institute.locality} — taught for concept clarity, not
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

      {/*
        4 · Credibility strip — DELIBERATELY ABSENT.
        Student numbers, years of experience and success rates are exactly the
        figures the previous site invented. None are confirmed, so none appear.
      */}

      {/* 5 · Courses */}
      <Section tone="surface" labelledBy="home-courses">
        <div className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="eyebrow text-accent-text">Programmes</p>
            <h2
              id="home-courses"
              className="mt-2 font-display text-h2 font-bold text-heading"
            >
              What we teach
            </h2>
          </div>
          <Link href="/courses" className="inline-flex min-h-11 items-center text-small font-medium text-link">
            All courses &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {publishedCourses.slice(0, 3).map((course) => (
            <CourseCard
              key={course.slug}
              slug={course.slug}
              name={course.name}
              batchCount={batchCountFor(course.slug)}
            />
          ))}
        </div>
      </Section>

      {/* 6 · Results — hidden entirely when nothing is published. */}
      {results.results.length > 0 ? (
        <Section tone="paper" labelledBy="home-results">
          <div className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="eyebrow text-accent-text">Results</p>
              <h2
                id="home-results"
                className="mt-2 font-display text-h2 font-bold text-heading"
              >
                Our students&rsquo; results
              </h2>
            </div>
            <Link href="/results" className="inline-flex min-h-11 items-center text-small font-medium text-link">
              All results &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.results.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* Batches — real records only. */}
      {courseBatches.length > 0 ? (
        <Section tone="surface" labelledBy="home-batches">
          <div className="mb-10">
            <p className="eyebrow text-accent-text">Admissions open</p>
            <h2
              id="home-batches"
              className="mt-2 font-display text-h2 font-bold text-heading"
            >
              Upcoming batches
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courseBatches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                courseName={courseName(batch.courseSlug)}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {/* 11 · Student stories — hidden entirely when none are published. */}
      {stories.length > 0 ? (
        <Section tone="paper" labelledBy="home-stories">
          <div className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="eyebrow text-accent-text">Student stories</p>
              <h2
                id="home-stories"
                className="mt-2 font-display text-h2 font-bold text-heading"
              >
                How they got there
              </h2>
            </div>
            <Link href="/stories" className="inline-flex min-h-11 items-center text-small font-medium text-link">
              All stories &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {stories.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        </Section>
      ) : null}

      {/*
        Faculty, reviews, videos and gallery bands are absent. Each needs
        content the institute has not supplied — credentials and portraits, an
        activated Review Engine, a channel ID, photography. Master Plan §22.
      */}

      {/* 13 · Location */}
      <Section tone="surface" labelledBy="home-location">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
          <div>
            <p className="eyebrow text-accent-text">Find us</p>
            <h2
              id="home-location"
              className="mt-2 font-display text-h2 font-bold text-heading"
            >
              We&rsquo;re in {institute.locality}
            </h2>
            <address className="measure mt-5 text-[17px] leading-relaxed text-text not-italic">
              {addressFull}
            </address>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href={telHref}>Call {institute.phonePrimary.display}</Button>
              <Button href="/contact" variant="secondary">
                Contact &amp; directions
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* 14 · Final CTA */}
      <Section tone="band" labelledBy="home-cta">
        <div className="max-w-2xl">
          <h2 id="home-cta" className="text-h2 font-bold leading-tight text-band-text lg:text-[32px]">
            Ready to take the next step?
          </h2>
          <p className="measure mt-4 text-[17px] leading-relaxed text-band-muted">
            Talk to us about programmes, batches and admissions.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/admissions" size="lg" variant="onBand">
              Enquire now
            </Button>
            <Button href={whatsappHref()} external size="lg" variant="onBand">
              WhatsApp us
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
