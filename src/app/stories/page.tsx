import type { Metadata } from 'next';
import { institute } from '@/config/institute';
import { pageMetadata } from '@/lib/seo';
import { getPublishedStories } from '@/lib/public-data';
import { Container, Section } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { StoryCard } from '@/components/domain/public-cards';

export const metadata: Metadata = pageMetadata({
  title: 'Student stories',
  description: `How students at ${institute.name} got to their results, in their own words.`,
  path: '/stories',
});

export const revalidate = 3600;

/**
 * Student stories.
 *
 * A story is a SEPARATE permission from a result, and neither includes a
 * photograph. All three are resolved on the server before the data reaches
 * this component, so a story published without photo permission arrives with
 * `photoUrl: null` and renders a monogram — the component cannot get it wrong,
 * because it never receives the photo.
 */
export default async function StoriesPage() {
  const stories = await getPublishedStories();

  return (
    <>
      <section className="border-b border-rule bg-paper">
        <Container>
          <div className="max-w-3xl py-16 md:py-20">
            <p className="eyebrow text-accent-text">Student stories</p>
            <h1 className="mt-4 text-h1 font-bold leading-tight text-heading lg:text-[44px]">
              How they got there
            </h1>
            <p className="measure mt-5 text-[18px] leading-relaxed text-muted">
              A result is one number. These are the longer versions — what was
              hard, what changed, and how it turned out.
            </p>
          </div>
        </Container>
      </section>

      <Section tone="surface" labelledBy="stories-heading">
        <h2 id="stories-heading" className="sr-only">
          Published stories
        </h2>

        {stories.length === 0 ? (
          <div className="rounded-md border border-dashed border-rule-strong bg-paper px-6 py-16 text-center">
            <p className="font-display text-[20px] font-semibold text-heading">
              Student stories will appear here
            </p>
            <p className="measure mx-auto mt-3 text-[17px] leading-relaxed text-muted">
              We publish a student&rsquo;s story only with their written
              permission, and we ask separately before showing a photograph.
              Stories will appear on this page once we have that.
            </p>
            <div className="mt-8 flex justify-center">
              <Button href="/results">See our results</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {stories.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        )}
      </Section>

      <Section tone="band" labelledBy="stories-cta">
        <div className="max-w-2xl">
          <h2 id="stories-cta" className="text-h2 font-bold leading-tight text-band-text">
            Your story could start here
          </h2>
          <p className="measure mt-4 text-[17px] leading-relaxed text-band-muted">
            Talk to us about which programme suits where you are now.
          </p>
          <div className="mt-8">
            <Button href="/admissions" size="lg" variant="onBand">
              Send an enquiry
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
