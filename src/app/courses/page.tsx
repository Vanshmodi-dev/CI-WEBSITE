import type { Metadata } from 'next';
import { institute, publishedCourses, whatsappHref } from '@/config/institute';
import { pageMetadata } from '@/lib/seo';
import { getUpcomingBatches } from '@/lib/public-data';
import { Container, Section } from '@/components/primitives/section';
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
  const batches = await getUpcomingBatches();
  const countFor = (slug: string) =>
    batches.filter((b) => b.courseSlug === slug).length;

  return (
    <>
      <section className="border-b border-rule bg-paper">
        <Container>
          <div className="max-w-3xl py-16 md:py-20">
            <p className="eyebrow text-accent-text">Programmes</p>
            <h1 className="mt-4 text-h1 font-bold leading-tight text-heading lg:text-[44px]">
              What we teach
            </h1>
            <p className="measure mt-5 text-[18px] leading-relaxed text-muted">
              Commerce programmes for school and professional examinations, in{' '}
              {institute.locality}.
            </p>
          </div>
        </Container>
      </section>

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

      <Section tone="band" labelledBy="courses-cta">
        <div className="max-w-2xl">
          <h2 id="courses-cta" className="text-h2 font-bold leading-tight text-band-text">
            Not sure which one fits?
          </h2>
          <p className="measure mt-4 text-[17px] leading-relaxed text-band-muted">
            Tell us which class you are in and what you are aiming for, and we
            will talk you through the options.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/admissions" size="lg" variant="onBand">
              Ask about a course
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
