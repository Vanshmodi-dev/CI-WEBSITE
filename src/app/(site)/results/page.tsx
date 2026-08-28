import type { Metadata } from 'next';
import Link from 'next/link';
import { institute } from '@/config/institute';
import { pageMetadata, listingIndexing } from '@/lib/seo';
import { getPublishedResults, asProgramme } from '@/lib/public-data';
import { Section, PageHeader, ClosingCta } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { ResultCard } from '@/components/domain/public-cards';
import { PROGRAMME_LABELS } from '@/lib/admin-format';
import { getSiteContent } from '@/lib/site-content';

type ResultsSearchParams = { year?: string; programme?: string; page?: string };

/** Narrow the untrusted query string once, and use the result everywhere. */
function readFilters(params: ResultsSearchParams) {
  const year = Number(params.year) || undefined;
  // Narrowed against the enum — an unknown value becomes "no filter".
  const programme = asProgramme(params.programme);
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  return { year, programme, page, filtered: Boolean(year || programme) };
}

/**
 * ⚠ NO `export const revalidate` HERE, AND THAT IS DELIBERATE.
 *
 * This page reads `searchParams`, which makes it dynamic; a `revalidate` export
 * on a dynamic route is inert. One sat here for three phases reading
 * `revalidate = 3600`, which said the page was cached for an hour when in fact
 * it was rendered fresh every time — a comforting number that described
 * nothing. Phase 9 measured the render at 19 ms against 1,000 published results
 * with every query using an index, so dynamic is both correct and cheap.
 *
 * `revalidateResults()` still refreshes `/` (which IS cached and shows a
 * results band). Its `revalidatePath('/results')` call is a no-op for this
 * route and harmless — kept so the call site stays correct if this page ever
 * becomes cacheable.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<ResultsSearchParams>;
}): Promise<Metadata> {
  const { year, programme, page, filtered } = readFilters(await searchParams);
  const { canonical, robots } = listingIndexing({ path: '/results', filtered, page });

  // The title names the active filter so the tab is legible, but the words come
  // from the programme label table and the year in the database — never a
  // description of how good the results are.
  const scope = [
    programme ? PROGRAMME_LABELS[programme] : null,
    year ? String(year) : null,
  ].filter(Boolean);

  return pageMetadata({
    title: scope.length > 0 ? `Results — ${scope.join(' ')}` : 'Results',
    description: `Student results published by ${institute.name}, ${institute.locality}.`,
    path: '/results',
    canonical,
    robots,
  });
}

/**
 * Public results.
 *
 * ⚠ THE MOST SENSITIVE PAGE ON THE SITE.
 *
 * Every record here is a real person, most of them under 18. The data reaching
 * this component has already been filtered to published + consented rows and
 * resolved through the consent rules on the server, so this file cannot show a
 * name or a photograph that was not authorised — it never receives them.
 *
 * If nothing is published, this page says so plainly. It does NOT fill the gap
 * with sample achievements. The site this replaces published five invented
 * toppers; that is the specific failure this page exists to not repeat.
 */
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<ResultsSearchParams>;
}) {
  const { year, programme, page, filtered } = readFilters(await searchParams);
  // `getSiteContent()` is wrapped in React `cache()`, so the header, the
  // footer and this page share ONE query rather than three.
  const [data, content] = await Promise.all([
    getPublishedResults({ year, programme, page }),
    getSiteContent(),
  ]);

  function hrefWith(next: Record<string, string | undefined>) {
    const search = new URLSearchParams();
    const merged = {
      year: year ? String(year) : undefined,
      programme,
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) if (v) search.set(k, v);
    const qs = search.toString();
    return qs ? `/results?${qs}` : '/results';
  }

  return (
    <>
      <PageHeader
        eyebrow="Results"
        title={<>{content['page.results.title']}</>}
        standfirst={<>{content['page.results.standfirst']}</>}
      />

      <Section tone="surface" labelledBy="results-heading">
        <h2 id="results-heading" className="sr-only">
          Published results
        </h2>

        {data.total === 0 && !filtered ? (
          <div className="rounded-md border border-dashed border-rule-strong bg-paper px-6 py-16 text-center">
            <p className="font-display text-[20px] font-semibold text-heading">
              Results will be published here
            </p>
            <p className="measure mx-auto mt-3 text-[17px] leading-relaxed text-muted">
              We publish a student&rsquo;s result only once they have given us
              permission in writing. As soon as we have that, their results will
              appear on this page.
            </p>
            <div className="mt-8 flex justify-center">
              <Button href="/courses">Explore our courses</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Filters render only when there is something to filter. */}
            {data.years.length > 1 || data.total > 0 ? (
              <div className="mb-8 flex flex-wrap gap-1.5">
                <FilterChip href="/results" label="All" active={!filtered} />
                {/* Both facet lists are scoped to the OTHER active filter in
                    the query, so every chip on screen leads somewhere that has
                    results. Before Phase 9 the year chips ignored the
                    programme entirely and could offer a dead end. */}
                {data.years.map((y) => (
                  <FilterChip
                    key={y.value}
                    href={hrefWith({ year: String(y.value), page: undefined })}
                    label={String(y.value)}
                    count={y.count}
                    active={year === y.value}
                  />
                ))}
                {data.programmes.map((p) => (
                  <FilterChip
                    key={p.value}
                    href={hrefWith({ programme: p.value, page: undefined })}
                    label={PROGRAMME_LABELS[p.value] ?? p.value}
                    count={p.count}
                    active={programme === p.value}
                  />
                ))}
              </div>
            ) : null}

            {data.results.length === 0 ? (
              <div className="rounded-md border border-dashed border-rule-strong bg-paper px-6 py-14 text-center">
                <p className="font-display text-[18px] font-semibold text-heading">
                  Nothing published for that filter yet
                </p>
                <p className="mt-2 text-small text-muted">
                  <Link href="/results" className="text-link">
                    See all results
                  </Link>
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {data.results.map((result) => (
                    <ResultCard key={result.id} result={result} />
                  ))}
                </div>

                {data.pageCount > 1 ? (
                  <nav
                    aria-label="Result pages"
                    className="mt-10 flex items-center justify-center gap-3 border-t border-rule pt-6"
                  >
                    {data.page > 1 ? (
                      <Link
                        href={hrefWith({ page: String(data.page - 1) })}
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
                        href={hrefWith({ page: String(data.page + 1) })}
                        rel="next"
                        className="inline-flex min-h-11 items-center rounded-sm border border-rule px-4 text-small text-text hover:bg-paper"
                      >
                        Next &rarr;
                      </Link>
                    ) : null}
                  </nav>
                ) : null}

                <p className="mt-8 text-center text-[13px] tabular-nums text-muted">
                  Showing {data.results.length} of {data.total} published{' '}
                  {data.total === 1 ? 'result' : 'results'}
                </p>
              </>
            )}
          </>
        )}
      </Section>

      <ClosingCta
        id="results-cta"
        title={<>{content['page.results.ctaTitle']}</>}
        body={<>{content['page.results.ctaBody']}</>}
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

function FilterChip({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  /** Shown only to assistive technology — the visible chip stays a plain
      label, but a screen-reader user hears how much is behind it. */
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={
        count === undefined
          ? undefined
          : `${label} — ${count} ${count === 1 ? 'result' : 'results'}`
      }
      className={
        active
          ? 'inline-flex min-h-9 items-center rounded-sm border border-navy-600/40 bg-selected px-3 text-[13px] font-medium text-heading'
          : 'inline-flex min-h-9 items-center rounded-sm border border-rule bg-paper px-3 text-[13px] text-muted hover:text-heading'
      }
    >
      {label}
    </Link>
  );
}
