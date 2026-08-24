import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { institute, publishedCourses, whatsappHref, telHref } from '@/config/institute';
import { pageMetadata, breadcrumbJsonLd, jsonLdScript, SITE_URL } from '@/lib/seo';
import { getUpcomingBatches } from '@/lib/public-data';
import { Container, Section } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { BatchCard } from '@/components/domain/public-cards';

export const revalidate = 3600;

export function generateStaticParams() {
  return publishedCourses.map((c) => ({ slug: c.slug }));
}

function findCourse(slug: string) {
  return publishedCourses.find((c) => c.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = findCourse(slug);
  if (!course) return {};

  return pageMetadata({
    title: `${course.name} coaching in ${institute.locality}`,
    description: `${course.name} at ${institute.name}, ${institute.locality}. Ask us about batches and admissions.`,
    path: `/courses/${course.slug}`,
  });
}

/**
 * Course detail.
 *
 * ⚠ WHAT THIS PAGE DELIBERATELY DOES NOT SAY.
 *
 * Commerce Insight has not supplied syllabus, fees, timings, duration or
 * teaching staff for any programme. Those are the fields a visitor most wants,
 * and they are exactly the fields most tempting to invent. The previous website
 * invented them.
 *
 * So this page states only what is verified — the programme name, the locality,
 * and any batch the institute has actually entered in the admin — and is honest
 * about the rest. An honest gap converts better than a confident fabrication,
 * because the enquiry CTA gives the visitor a way to ask a person.
 */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = findCourse(slug);
  if (!course) notFound();

  const batches = await getUpcomingBatches({ courseSlug: course.slug });

  /**
   * Course schema.org carries the name and provider only. No price, no
   * duration, no rating — asserting any of those would be a fabrication, and a
   * fabricated `offers` block is exactly what earns a manual action.
   *
   * The consequence, stated plainly: without `offers` and `hasCourseInstance`
   * this entity is not eligible for a Course rich result. That is the correct
   * trade. We do not hold the institute's fees, dates or delivery mode, and a
   * rich result built on invented ones would be a lie with a star rating on it.
   * The block still describes the page truthfully to any consumer that reads it.
   *
   * `provider` references the sitewide organisation by @id rather than
   * redeclaring its name and URL, so the two can never drift apart.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.name,
    provider: { '@id': `${SITE_URL}/#organisation` },
  };

  // Mirrors the visible breadcrumb below, exactly. Structured data that claims
  // a hierarchy the page does not show is the definition of a hidden SEO claim.
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Courses', path: '/courses' },
    { name: course.name, path: `/courses/${course.slug}` },
  ]);

  return (
    <>
      <section className="border-b border-rule bg-paper">
        <Container>
          <nav aria-label="Breadcrumb" className="pt-8">
            <ol className="flex items-center gap-2 text-small text-muted">
              <li>
                <Link href="/courses" className="hover:text-heading">
                  Courses
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-text">{course.name}</li>
            </ol>
          </nav>

          <div className="max-w-3xl py-10 md:py-14">
            <h1 className="text-h1 font-bold leading-tight text-heading lg:text-[44px]">
              {course.name}
            </h1>
            <p className="measure mt-5 text-[18px] leading-relaxed text-muted">
              Taught at {institute.name}, {institute.locality}.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/admissions" size="lg">
                Ask about this course
              </Button>
              <Button
                href={whatsappHref(course.name)}
                external
                size="lg"
                variant="secondary"
              >
                WhatsApp us
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* Batches — real records from the admin, or an honest absence. */}
      <Section tone="surface" labelledBy="batches-heading">
        <h2
          id="batches-heading"
          className="font-display text-h2 font-bold text-heading"
        >
          Upcoming batches
        </h2>

        {batches.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((batch) => (
              <BatchCard key={batch.id} batch={batch} courseName={course.name} />
            ))}
          </div>
        ) : (
          <p className="measure mt-4 text-[17px] leading-relaxed text-muted">
            New batch dates will appear here as soon as they are confirmed. Ask
            us and we will tell you when the next one starts.
          </p>
        )}
      </Section>

      {/*
        Course details: absent on purpose. See the note at the top of this file.
        This block invites the question rather than answering it with fiction.
      */}
      <Section tone="paper" labelledBy="details-heading">
        <h2
          id="details-heading"
          className="font-display text-h2 font-bold text-heading"
        >
          Course details
        </h2>
        <p className="measure mt-4 text-[17px] leading-relaxed text-muted">
          Subjects, timings and fees for {course.name} will be published here.
          In the meantime, call or message us and we will answer your questions
          directly.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href={telHref} variant="secondary">
            Call {institute.phonePrimary.display}
          </Button>
          <Button href="/admissions" variant="secondary">
            Send an enquiry
          </Button>
        </div>
      </Section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
    </>
  );
}
