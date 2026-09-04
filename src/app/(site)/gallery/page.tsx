import type { Metadata } from 'next';
import Link from 'next/link';
import { institute } from '@/config/institute';
import { pageMetadata, listingIndexing } from '@/lib/seo';
import { getPublishedGallery, getGalleryCategories } from '@/lib/public-data';
import { getSiteContent, getContactBlock } from '@/lib/site-content';
import { Section, PageHeader, ClosingCta } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { GalleryViewer } from '@/components/domain/gallery-viewer';
import { CATEGORY_LABEL, isGalleryCategory, type GalleryCategoryValue } from '@/lib/gallery';

type GallerySearchParams = { category?: string };

/**
 * The most photographs one page will render.
 *
 * A gallery is the page most likely to become an image-amplification problem:
 * every entry is a network request, a decode and a chunk of memory on a phone.
 * The grid tiles are lazy, so the cost of an off-screen one is small but not
 * zero — and the DOM, the RSC payload and the viewer's item list all grow
 * linearly whatever the loading strategy is.
 *
 * Sixty is comfortably more than an institute gallery needs to feel full and
 * far below the point where a mid-range phone struggles. It is enforced in the
 * QUERY, so a database with six hundred rows costs the same as one with sixty.
 *
 * There is deliberately no pagination. Adding one would be inventing a
 * requirement no document asks for, and a gallery split across pages is a
 * gallery nobody reaches the end of.
 */
const MAX_ON_PAGE = 60;

/**
 * Narrow the untrusted query string once, and use the result everywhere.
 *
 * An unknown, malformed, enormous or repeated `?category=` becomes "no filter"
 * rather than reaching Prisma. `searchParams` hands a repeated parameter over as
 * an ARRAY, which is not a string and therefore fails `isGalleryCategory` — so
 * `?category=EVENTS&category=STUDENTS` degrades to the unfiltered page instead
 * of throwing on a type nobody expected.
 */
function readCategory(params: GallerySearchParams): GalleryCategoryValue | undefined {
  return isGalleryCategory(params.category) ? params.category : undefined;
}

/**
 * ⚠ NO `export const revalidate` HERE, AND THAT IS DELIBERATE.
 *
 * This page reads `searchParams`, which makes it dynamic; a `revalidate` export
 * on a dynamic route is inert. `/results` carries the same note after one sat
 * there for three phases claiming an hour of caching that never happened.
 *
 * `revalidateGallery()` still refreshes `/`, which IS cached and shows a
 * gallery band. Its `revalidatePath('/gallery')` call is a no-op for this route
 * and harmless — kept so the call site stays correct if this ever becomes
 * cacheable.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<GallerySearchParams>;
}): Promise<Metadata> {
  const category = readCategory(await searchParams);
  const { canonical, robots } = listingIndexing({
    path: '/gallery',
    filtered: Boolean(category),
    page: 1,
  });

  /*
    ⚠ `canonical` AND `robots` GO INTO `pageMetadata`, NOT AROUND IT.

    The first version spread `pageMetadata(...)` and then set `robots` beside
    it. When the page is unfiltered `listingIndexing` returns NO robots value,
    and an explicit `robots: undefined` overrides a spread key rather than
    deferring to it — so /gallery lost the site-wide `noindex` that applies
    while SITE_IS_LAUNCHED is false, and would have been indexable before
    launch. `pageMetadata` merges the two correctly, which is why /results
    passes them in rather than merging by hand.
  */
  return pageMetadata({
    title: category ? `Gallery — ${CATEGORY_LABEL[category]}` : 'Gallery',
    description: `Photographs from ${institute.name} in ${institute.locality}.`,
    path: '/gallery',
    canonical,
    robots,
  });
}

/**
 * /gallery — photographs of the institute.
 *
 * =============================================================================
 * NO ImageObject STRUCTURED DATA
 * =============================================================================
 * `src/lib/seo.ts` already refuses to emit `Review` for reviews it did not
 * collect and `Person` for staff it cannot verify, on one consistent rule:
 * structured data is a machine-readable CLAIM, and this project does not make
 * claims it cannot support. An `ImageObject` graph here would assert
 * authorship, licence and subject for photographs whose only verified property
 * is that a teacher uploaded them. There is also nothing to gain — image rich
 * results need licence and creator fields we would have to invent.
 *
 * =============================================================================
 * THE CATEGORY FILTER SHOWS ONLY CATEGORIES THAT HAVE PHOTOGRAPHS
 * =============================================================================
 * The master directive lists seven possible categories and then says "only use
 * categories that correspond to real content". So the filter is built from what
 * is actually published, not from the enum: an empty category is never offered,
 * and typing its name into the URL returns the unfiltered page rather than an
 * empty grid that looks broken.
 */
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<GallerySearchParams>;
}) {
  const category = readCategory(await searchParams);

  // `getSiteContent()` is wrapped in React `cache()`, so the header, the
  // footer and this page share ONE query rather than three.
  const [categories, contact, content] = await Promise.all([
    getGalleryCategories(),
    getContactBlock(),
    getSiteContent(),
  ]);

  /*
    A category that is valid but empty behaves as no filter.

    Otherwise `/gallery?category=SEMINARS` on a site with no seminar photographs
    is a page that says "nothing here" while the unfiltered gallery is full —
    which reads as a fault rather than as a filter.
  */
  const active = category && categories.includes(category) ? category : undefined;
  const visible = await getPublishedGallery({ category: active, limit: MAX_ON_PAGE });

  return (
    <>
      <PageHeader
        eyebrow="Gallery"
        title={<>{content['page.gallery.title']}</>}
        standfirst={
          visible.length > 0 ? (
            <>{content['page.gallery.standfirst']}</>
          ) : (
            <>
              We would rather show you the real place than a stock photograph of
              somebody else&rsquo;s.
            </>
          )
        }
      />

      {visible.length === 0 ? (
        <Section tone="surface" labelledBy="gallery-empty">
          {/*
            THE EMPTY STATE MUST NOT LOOK LIKE PHOTOGRAPHS.

            No grey placeholder tiles, no blurred stock imagery, no skeleton
            grid. A convincing-looking empty gallery is the same failure as an
            invented testimonial wearing a different coat, and this page cannot
            hide itself the way a homepage band can because somebody navigated
            to it deliberately.
          */}
          <div className="max-w-2xl rounded-lg border border-dashed border-rule-strong p-8 md:p-10">
            <h2
              id="gallery-empty"
              className="font-display text-h2 font-bold leading-[1.15] tracking-[-0.015em] text-heading"
            >
              No photographs here yet
            </h2>
            <p className="measure mt-4 text-[17px] leading-relaxed text-muted">
              We are putting this together. In the meantime, the best way to see
              the place is to come and look at it — you are welcome to visit
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
        <Section tone="surface" labelledBy="gallery-list">
          <h2 id="gallery-list" className="sr-only">
            Photographs
          </h2>

          {categories.length > 1 ? (
            <nav aria-label="Filter photographs" className="mb-8">
              <ul className="flex flex-wrap gap-2">
                <li>
                  <FilterLink href="/gallery" active={!active}>
                    All
                  </FilterLink>
                </li>
                {categories.map((c) => (
                  <li key={c}>
                    <FilterLink href={`/gallery?category=${c}`} active={active === c}>
                      {CATEGORY_LABEL[c]}
                    </FilterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          <GalleryViewer items={visible} />
        </Section>
      )}

      <ClosingCta
        id="gallery-cta"
        title={<>{content['page.gallery.ctaTitle']}</>}
        body={<>{content['page.gallery.ctaBody']}</>}
        actions={
          <>
            <Button href="/contact" size="lg" variant="onBand">
              Plan a visit
            </Button>
            <Button href={contact.telHref} variant="onBandSecondary" size="lg">
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
 * A LINK, not a button. Each filter is a different URL that renders different
 * content, which is what a link is for — it works before hydration, it can be
 * opened in a new tab, and it is announced as a navigation rather than as a
 * control that does something unstated. `aria-current` marks the active one so
 * that state is available to a screen reader and not only to the eye.
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
          ? 'inline-flex min-h-11 items-center rounded-full border border-navy-700 bg-navy-700 px-4 text-small font-medium text-white'
          : 'inline-flex min-h-11 items-center rounded-full border border-rule px-4 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected'
      }
    >
      {children}
    </Link>
  );
}
