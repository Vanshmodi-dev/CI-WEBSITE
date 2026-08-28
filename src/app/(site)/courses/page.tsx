import type { Metadata } from 'next';
import { institute, publishedCourses } from '@/config/institute';
import { getSiteContent, getContactBlock, whatsappLink } from '@/lib/site-content';
import { pageMetadata } from '@/lib/seo';
import { getUpcomingBatches } from '@/lib/public-data';
import { Section, PageHeader, ClosingCta } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { CourseCard } from '@/components/domain/public-cards';

export const metadata: Metadata = pageMetadata({
  title: 'Courses',
  description: `Commerce programmes taught at ${institute.name}, ${institute.locality} — Class XI and XII Commerce, CA Foundation, CA Intermediate and CMA.`,
  path: '/courses',
});

/** Batches change, so this revalidates rather than being frozen at build. */
export const revalidate = 3600;

export default async function CoursesPage() {
  // `getSiteContent()` is wrapped in React `cache()`, so the header, the
  // footer and this page share ONE query rather than three.
  const [batches, contact, content] = await Promise.all([
    getUpcomingBatches(),
    getContactBlock(),
    getSiteContent(),
  ]);
  const countFor = (slug: string) =>
    batches.filter((b) => b.courseSlug === slug).length;

  return (
    <>
      <PageHeader
        eyebrow="Programmes"
        title={<>{content['page.courses.title']}</>}
        standfirst={<>{content['page.courses.standfirst']}</>}
      />

      <Section tone="surface" labelledBy="courses-heading">
        <h2 id="courses-heading" className="sr-only">
          All programmes
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {publishedCourses.map((course) => (
            <CourseCard
              key={course.slug}
              slug={course.slug}
              name={course.name}
              batchCount={countFor(course.slug)}
            />
          ))}
        </div>
      </Section>

      <ClosingCta
        id="courses-cta"
        title={<>{content['page.courses.ctaTitle']}</>}
        body={<>{content['page.courses.ctaBody']}</>}
        actions={
          <>
            <Button href="/admissions" size="lg">
              Ask about a course
            </Button>
            <Button
              href={whatsappLink(contact.whatsappNumber)}
              external
              size="lg"
              variant="secondary"
            >
              WhatsApp us
            </Button>
          </>
        }
      />
    </>
  );
}
