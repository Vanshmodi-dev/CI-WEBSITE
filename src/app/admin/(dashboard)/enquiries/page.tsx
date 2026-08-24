import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listEnquiries, PAGE_SIZE } from '@/lib/admin-data';
import { Pagination } from '@/components/admin/pagination';
import {
  PageHeader,
  TableShell,
  Td,
  StatusPill,
  EmptyPanel,
  Notice,
} from '@/components/admin/ui';
import { CLASS_LEVEL_LABELS, type ClassLevelValue } from '@/lib/validation';
import { formatDate, ENQUIRY_STATUS_LABELS } from '@/lib/admin-format';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'ENROLLED', label: 'Enrolled' },
  { value: 'CLOSED', label: 'Closed' },
] as const;

type Status = 'NEW' | 'CONTACTED' | 'ENROLLED' | 'CLOSED' | 'SPAM';

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const status = FILTERS.some((f) => f.value === params.status && f.value !== '')
    ? (params.status as Status)
    : undefined;
  const q = params.q?.slice(0, 80) ?? '';

  const page = Math.max(1, Number(params.page ?? '1') || 1);

  let result: Awaited<ReturnType<typeof listEnquiries>> | null = null;
  let failed = false;
  try {
    result = await listEnquiries({ ...(status ? { status } : {}), q, page });
  } catch {
    failed = true;
  }
  const enquiries = result?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="People who have asked about joining. Call them back and keep the status up to date."
      />

      {failed ? (
        <Notice tone="warn" title="We could not load enquiries just now">
          Please refresh the page.
        </Notice>
      ) : (
        <>
          {/* Filters are plain links, so they work without JavaScript and are
              shareable and bookmarkable. */}
          <form className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const active = (params.status ?? '') === f.value;
                const href = f.value
                  ? `/admin/enquiries?status=${f.value}`
                  : '/admin/enquiries';
                return (
                  <Link
                    key={f.label}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'inline-flex min-h-9 items-center rounded-sm border border-navy-600/40 bg-selected px-3 text-[13px] font-medium text-heading'
                        : 'inline-flex min-h-9 items-center rounded-sm border border-rule px-3 text-[13px] text-muted hover:bg-surface'
                    }
                  >
                    {f.label}
                  </Link>
                );
              })}
            </div>

            <div className="flex gap-2 sm:ml-auto">
              <label htmlFor="q" className="sr-only">
                Search by name or phone
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search name or phone"
                className="min-h-9 w-full rounded-sm border border-rule-strong bg-paper px-3 text-small sm:w-56"
              />
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <button
                type="submit"
                className="min-h-9 shrink-0 rounded-sm border border-rule px-3 text-[13px] text-text hover:bg-surface"
              >
                Search
              </button>
            </div>
          </form>

          {enquiries.length === 0 ? (
            <EmptyPanel
              title={q || status ? 'Nothing matches that' : 'No enquiries yet'}
              description={
                q || status
                  ? 'Try a different search, or clear the filter to see everything.'
                  : 'When someone fills in the enquiry form on the website, it will appear here.'
              }
            />
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block">
                <TableShell
                  headings={['Name', 'Phone', 'Interested in', 'Received', 'Status', '']}
                >
                  {enquiries.map((e) => (
                    <tr key={e.id} className="hover:bg-surface">
                      <Td className="font-medium text-text">{e.name}</Td>
                      <Td className="tabular-nums text-muted">{e.phone}</Td>
                      <Td className="text-muted">
                        {CLASS_LEVEL_LABELS[e.classLevel as ClassLevelValue] ??
                          e.classLevel}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {formatDate(e.createdAt)}
                      </Td>
                      <Td>
                        <StatusPill tone={e.status === 'NEW' ? 'new' : 'done'}>
                          {ENQUIRY_STATUS_LABELS[e.status] ?? e.status}
                        </StatusPill>
                      </Td>
                      <Td>
                        <Link
                          href={`/admin/enquiries/${e.id}`}
                          className="text-small text-link"
                        >
                          Open
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </TableShell>
              </div>

              {/* Mobile — a six-column table is unusable at 360px, so it
                  becomes a stacked list instead of being squeezed. */}
              <ul className="flex flex-col gap-3 md:hidden">
                {enquiries.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/admin/enquiries/${e.id}`}
                      className="block rounded-md border border-rule bg-paper p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium text-text">{e.name}</span>
                        <StatusPill tone={e.status === 'NEW' ? 'new' : 'done'}>
                          {ENQUIRY_STATUS_LABELS[e.status] ?? e.status}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-[13px] text-muted">
                        {CLASS_LEVEL_LABELS[e.classLevel as ClassLevelValue] ??
                          e.classLevel}
                      </p>
                      <p className="mt-2 text-[13px] tabular-nums text-muted">
                        {e.phone} · {formatDate(e.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {result ? (
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              pageSize={PAGE_SIZE}
              basePath="/admin/enquiries"
              params={{ status: params.status, q: q || undefined }}
              label="enquiries"
            />
          ) : null}
        </>
      )}
    </>
  );
}
