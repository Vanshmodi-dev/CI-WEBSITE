import type { Metadata } from 'next';
import Link from 'next/link';
import { institute } from '@/config/institute';
import { pageMetadata, listingIndexing } from '@/lib/seo';
import { getPublishedStoriesPage } from '@/lib/public-data';
import { Section, PageHeader, ClosingCta } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { StoryCard } from '@/components/domain/public-cards';
import { getSiteContent } from '@/lib/site-content';

type StoriesSearchParams = { page?: string };

const readPage = (params: StoriesSearchParams) =>
  Math.max(1, Number(params.page ?? '1') || 1);

/**
 * ⚠ NO `revalidate` EXPORT — this page now reads `searchParams`, so it renders
 * per request and a `revalidate` value would be inert. See the trade-off note
 * on the component below.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<StoriesSearchParams>;
}): Promise<Metadata> {
  const page = readPage(await searchParams);
  const { canonical, robots } = listingIndexing({ path: '/stories', filtered: false, page });

  return pageMetadata({
    title: page > 1 ? `Student stories — page ${page}` : 'Student stories',
    description: `How students at ${institute.name} got to their results, in their own words.`,
    path: '/stories',
    canonical,
    robots,
  });
}

/**
 * Student stories.
 *
 * A story is a SEPARATE permission from a result, and neither includes a
 * photograph. All three are resolved on the server before the data reaches
 * this component, so a story published without photo permission arrives with
 * `photoUrl: null` and renders a monogram — the component cannot get it wrong,
 * because it never receives the photo.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS PAGE IS PAGINATED, AND WHAT IT COST
 * -----------------------------------------------------------------------------
 * It used to render every published story in full, up to a hidden cap of 60.
 * Phase 9 measured it at 80 published stories: twenty were silently missing,
 * with nothing on the page to say so, and the HTML had reached 224 KB — a
 * quarter of a megabyte for the browser to parse before anything was readable.
 *
 * Paginating fixes both, and costs one thing: reading `searchParams` makes this
 * route render per request instead of being served from the ISR cache. That
 * trade was made knowingly. Page one drops from 224 KB of HTML to roughly 45 KB,
 * the total is now stated on screen so nothing can go missing quietly, and the
 * render itself measured 9 ms. A cached page that omits a fifth of the content
 * is not the faster option; it is the wrong one.
 */
export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Promise<StoriesSearchParams>;
}) {
  const page = readPage(await searchParams);
  // `getSiteContent()` is wrapped in React `cache()`, so the header, the
  // footer and this page share ONE query rather than three.
  const [data, content] = await Promise.all([
    getPublishedStoriesPage({ page }),
    getSiteContent(),
  ]);
  const stories = data.stories;

  return (
    <>
      <PageHeader
        eyebrow="Student stories"
        title={<>{content['page.stories.title']}</>}
        standfirst={<>{content['page.stories.standfirst']}</>}
      />

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
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {stories.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>

            {data.pageCount > 1 ? (
              <nav
                aria-label="Story pages"
                className="mt-10 flex items-center justify-center gap-3 border-t border-rule pt-6"
              >
                {data.page > 1 ? (
                  <Link
                    href={data.page === 2 ? '/stories' : `/stories?page=${data.page - 1}`}
                    rel="prev"
                    className="inline-flex min-h-11 items-center rounded-sm border border-rule px-4 text-small text-text hover:bg-paper"
                  >
                    &larr; Previous
                  </Link>
                ) : null}
                <span className="text-small tabular-nums text-muted">
                  Page {data.page} of {data.pageCount}
                </span>
                {data.page < data.pageCount ? (
                  <Link
                    href={`/stories?page=${data.page + 1}`}
                    rel="next"
                    className="inline-flex min-h-11 items-center rounded-sm border border-rule px-4 text-small text-text hover:bg-paper"
                  >
                    Next &rarr;
                  </Link>
                ) : null}
              </nav>
            ) : null}

            {/* Stated, not implied: a story that exists but is not on this
                screen is still accounted for here. */}
            <p className="mt-8 text-center text-[13px] tabular-nums text-muted">
              Showing {stories.length} of {data.total} published{' '}
              {data.total === 1 ? 'story' : 'stories'}
            </p>
          </>
        )}
      </Section>

      <ClosingCta
        id="stories-cta"
        title={<>{content['page.stories.ctaTitle']}</>}
        body={<>{content['page.stories.ctaBody']}</>}
        actions={
          <>
            <Button href="/admissions" size="lg">
              Send an enquiry
            </Button>
          </>
        }
      />
    </>
  );
}
