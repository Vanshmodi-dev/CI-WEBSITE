import Link from 'next/link';

/**
 * Page navigation for admin lists.
 *
 * Shows the range and the total ("51–100 of 1,000") rather than page numbers
 * alone, because the teacher's real question is "have I seen everything?" — the
 * question the old silent `take` cap answered wrongly.
 *
 * Plain links, so this works without JavaScript and every page is bookmarkable.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  basePath,
  params = {},
  label = 'records',
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  label?: string;
}) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function hrefFor(target: number): string {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) search.set(k, v);
    }
    if (target > 1) search.set('page', String(target));
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <nav
      aria-label="Pages"
      className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-rule pt-4 sm:flex-row"
    >
      <p className="text-[13px] tabular-nums text-muted">
        Showing <strong className="text-text">{from.toLocaleString('en-IN')}</strong>
        {to > from ? (
          <>
            {' '}&ndash; <strong className="text-text">{to.toLocaleString('en-IN')}</strong>
          </>
        ) : null}{' '}
        of <strong className="text-text">{total.toLocaleString('en-IN')}</strong> {label}
      </p>

      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={hrefFor(page - 1)}
              rel="prev"
              className="inline-flex min-h-9 items-center rounded-sm border border-rule px-3 text-[13px] text-text hover:bg-surface"
            >
              &larr; Previous
            </Link>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-sm border border-rule/50 px-3 text-[13px] text-muted/50">
              &larr; Previous
            </span>
          )}

          <span className="text-[13px] tabular-nums text-muted">
            Page {page} of {pageCount}
          </span>

          {page < pageCount ? (
            <Link
              href={hrefFor(page + 1)}
              rel="next"
              className="inline-flex min-h-9 items-center rounded-sm border border-rule px-3 text-[13px] text-text hover:bg-surface"
            >
              Next &rarr;
            </Link>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-sm border border-rule/50 px-3 text-[13px] text-muted/50">
              Next &rarr;
            </span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
