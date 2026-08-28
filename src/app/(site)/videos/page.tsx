import type { Metadata } from 'next';
import Link from 'next/link';
import { institute } from '@/config/institute';
import { pageMetadata, listingIndexing } from '@/lib/seo';
import { getPublishedVideos, getVideoSubjects } from '@/lib/public-data';
import { getSiteContent, getContactBlock } from '@/lib/site-content';
import { Section, PageHeader, ClosingCta } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { VideoPlayer } from '@/components/domain/video-player';
import { SUBJECT_LABEL, isVideoSubject, type VideoSubjectValue } from '@/lib/video';

type VideosSearchParams = { subject?: string };

/**
 * The most videos one page will render.
 *
 * Each is a poster image and a button until somebody presses play, so the cost
 * of one is a single lazy image rather than an embedded player. Forty is
 * generous for a coaching channel's curated highlights and bounded in the
 * QUERY, so a table with four hundred rows costs the same as one with forty.
 */
const MAX_ON_PAGE = 40;

/**
 * Narrow the untrusted query string once, and use the result everywhere.
 *
 * An unknown, malformed, enormous or repeated `?subject=` becomes "no filter"
 * rather than reaching Prisma. A repeated parameter arrives as an ARRAY, which
 * is not a string and therefore fails `isVideoSubject`, so
 * `?subject=ECONOMICS&subject=OTHER` degrades to the unfiltered page instead of
 * throwing on a type nobody expected.
 */
function readSubject(params: VideosSearchParams): VideoSubjectValue | undefined {
  return isVideoSubject(params.subject) ? params.subject : undefined;
}

/**
 * ⚠ NO `export const revalidate` HERE, AND THAT IS DELIBERATE.
 *
 * This page reads `searchParams`, which makes it dynamic; a `revalidate` export
 * on a dynamic route is inert. `/results` and `/gallery` carry the same note
 * after one sat on `/results` for three phases claiming an hour of caching that
 * never happened.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<VideosSearchParams>;
}): Promise<Metadata> {
  const subject = readSubject(await searchParams);
  const { canonical, robots } = listingIndexing({
    path: '/videos',
    filtered: Boolean(subject),
    page: 1,
  });

  /*
    ⚠ `canonical` AND `robots` GO INTO `pageMetadata`, NOT AROUND IT.

    Topic 8 shipped this wrong on /gallery: spreading `pageMetadata(...)` and
    setting `robots` beside it meant an explicit `robots: undefined` — which is
    what `listingIndexing` returns for an unfiltered view — OVERRODE the
    site-wide policy, and the page lost its pre-launch `noindex`. Passing both
    in lets `pageMetadata` merge them with the launch state, which is why
    /results has always done it this way.
  */
  return pageMetadata({
    title: subject ? `Videos — ${SUBJECT_LABEL[subject]}` : 'Videos',
    description: `Teaching videos from ${institute.name} in ${institute.locality}.`,
    path: '/videos',
    canonical,
    robots,
  });
}

/**
 * /videos — the teaching, where a visitor can judge it directly.
 *
 * =============================================================================
 * NO VideoObject STRUCTURED DATA
 * =============================================================================
 * `src/lib/seo.ts` already refuses `Review` for reviews it did not collect and
 * `Person` for staff it cannot verify, on one rule: structured data is a
 * machine-readable CLAIM and this project does not make claims it cannot
 * support. A `VideoObject` graph needs `uploadDate`, `duration` and
 * `contentUrl` — three facts this application does not hold, because it
 * deliberately does not call the YouTube API. Two of them would have to be
 * invented and the third would point at somebody else's CDN.
 *
 * YouTube already emits `VideoObject` for these videos on its own pages, where
 * the facts are true. Duplicating it here with guesses would be worse than
 * absent.
 *
 * =============================================================================
 * THE SUBJECT FILTER NEEDS THREE VIDEOS TO APPEAR
 * =============================================================================
 * Master Plan: "filtered by subject only once each filter has three or more
 * videos". Stricter than the gallery's "only categories with content", and
 * right — a filter that returns one video costs a reader a click to learn
 * nothing.
 */
export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<VideosSearchParams>;
}) {
  const subject = readSubject(await searchParams);

  // `getSiteContent()` is wrapped in React `cache()`, so the header, the
  // footer and this page share ONE query rather than three.
  const [subjects, contact, content] = await Promise.all([
    getVideoSubjects(),
    getContactBlock(),
    getSiteContent(),
  ]);

  /*
    A subject that is valid but does not have its own filter behaves as no
    filter. Otherwise `/videos?subject=OTHER` on a site with two such videos is
    a page that looks broken next to a filter bar that does not offer it.
  */
  const active = subject && subjects.includes(subject) ? subject : undefined;
  const videos = await getPublishedVideos({ subject: active, limit: MAX_ON_PAGE });

  return (
    <>
      <PageHeader
        eyebrow="Videos"
        title={<>{content['page.videos.title']}</>}
        standfirst={
          videos.length > 0 ? (
            <>{content['page.videos.standfirst']}</>
          ) : (
            <>
              We would rather you watched the teaching than read our description
              of it.
            </>
          )
        }
      />

      {videos.length === 0 ? (
        <Section tone="surface" labelledBy="videos-empty">
          {/*
            THE EMPTY STATE MUST NOT LOOK LIKE VIDEOS.

            No grey player rectangles, no skeleton cards, no stock thumbnail. A
            convincing-looking empty video wall is the same failure as an
            invented testimonial wearing a different coat, and this page cannot
            hide itself the way a homepage band can, because somebody navigated
            to it deliberately.
          */}
          <div className="max-w-2xl rounded-lg border border-dashed border-rule-strong p-8 md:p-10">
            <h2
              id="videos-empty"
              className="font-display text-h2 font-bold leading-[1.15] tracking-[-0.015em] text-heading"
            >
              No videos here yet
            </h2>
            <p className="measure mt-4 text-[17px] leading-relaxed text-muted">
              We are putting this together. In the meantime, the best way to see
              how we teach is to sit in on a class — you are welcome to visit
              during teaching hours.
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
        <Section tone="surface" labelledBy="videos-list">
          <h2 id="videos-list" className="sr-only">
            Videos
          </h2>

          {subjects.length > 1 ? (
            <nav aria-label="Filter videos by subject" className="mb-8">
              <ul className="flex flex-wrap gap-2">
                <li>
                  <FilterLink href="/videos" active={!active}>
                    All
                  </FilterLink>
                </li>
                {subjects.map((s) => (
                  <li key={s}>
                    <FilterLink href={`/videos?subject=${s}`} active={active === s}>
                      {SUBJECT_LABEL[s]}
                    </FilterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          <ul className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <li key={video.id} className="min-w-0">
                <VideoPlayer video={video} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ClosingCta
        id="videos-cta"
        title={<>{content['page.videos.ctaTitle']}</>}
        body={<>{content['page.videos.ctaBody']}</>}
        actions={
          <>
            <Button href="/contact" size="lg">
              Plan a visit
            </Button>
            <Button href={contact.telHref} variant="secondary" size="lg">
              Call {contact.phonePrimaryDisplay}
            </Button>
          </>
        }
      />
    </>
  );
}

/**
 * One filter chip.
 *
 * A LINK, not a button. Each filter is a different URL rendering different
 * content, which is what a link is for — it works before hydration, it can be
 * opened in a new tab, and it is announced as navigation rather than as a
 * control that does something unstated. `aria-current` exposes the active one
 * to a screen reader and not only to the eye.
 */
function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'inline-flex min-h-11 items-center rounded-full border border-navy-800 bg-navy-800 px-4 text-small font-medium text-white'
          : 'inline-flex min-h-11 items-center rounded-full border border-rule px-4 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected'
      }
    >
      {children}
    </Link>
  );
}
