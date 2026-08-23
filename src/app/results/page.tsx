import type { Metadata } from 'next';
import Link from 'next/link';
import { institute } from '@/config/institute';
import { pageMetadata } from '@/lib/seo';
import { getPublishedResults, asProgramme } from '@/lib/public-data';
import { Container, Section } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { ResultCard } from '@/components/domain/public-cards';
import { PROGRAMME_LABELS } from '@/lib/admin-format';

export const metadata: Metadata = pageMetadata({
  title: 'Results',
  description: `Student results published by ${institute.name}, ${institute.locality}.`,
  path: '/results',
});

export const revalidate = 3600;

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
  searchParams: Promise<{ year?: string; programme?: string; page?: string }>;
}) {
  const params = await searchParams;

  const year = Number(params.year) || undefined;
  // Narrowed against the enum — an unknown value becomes "no filter".
  const programme = asProgramme(params.programme);
  const page = Math.max(1, Number(params.page ?? '1') || 1);

  const data = await getPublishedResults({ year, programme, page });
  const filtered = Boolean(year || programme);

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
      <section className="border-b border-rule bg-paper">
        <Container>
          <div className="max-w-3xl py-16 md:py-20">
            <p className="eyebrow text-accent-text">Results</p>
            <h1 className="mt-4 text-h1 font-bold leading-tight text-heading lg:text-[44px]">
              Our students&rsquo; results
            </h1>
            <p className="measure mt-5 text-[18px] leading-relaxed text-muted">
              Published with each student&rsquo;s permission. Where a student
              asked us not to show their name or photograph, we don&rsquo;t.
            </p>
          </div>
        </Container>
      </section>

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
                {data.years.map((y) => (
                  <FilterChip
                    key={y}
                    href={hrefWith({ year: String(y), page: undefined })}
                    label={String(y)}
                    active={year === y}
                  />
                ))}
                {Object.entries(PROGRAMME_LABELS).map(([value, label]) => (
                  <FilterChip
                    key={value}
                    href={hrefWith({ programme: value, page: undefined })}
                    label={label}
                    active={programme === value}
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
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

      <Section tone="band" labelledBy="results-cta">
        <div className="max-w-2xl">
          <h2 id="results-cta" className="text-h2 font-bold leading-tight text-band-text">
            Want to study with us?
          </h2>
          <p className="measure mt-4 text-[17px] leading-relaxed text-band-muted">
            Tell us which class you are in and we will explain how we can help.
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

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'inline-flex min-h-9 items-center rounded-sm border border-navy-600/40 bg-navy-50 px-3 text-[13px] font-medium text-heading'
          : 'inline-flex min-h-9 items-center rounded-sm border border-rule bg-paper px-3 text-[13px] text-muted hover:text-heading'
      }
    >
      {label}
    </Link>
  );
}
