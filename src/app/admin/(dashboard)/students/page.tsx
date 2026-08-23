import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listToppers, PAGE_SIZE } from '@/lib/admin-data';
import { Pagination } from '@/components/admin/pagination';
import {
  PageHeader,
  TableShell,
  Td,
  StatusPill,
  EmptyPanel,
  Notice,
} from '@/components/admin/ui';
import { Button } from '@/components/primitives/button';
import { PROGRAMME_LABELS } from '@/lib/admin-format';
import { present } from '@/lib/student-display';

export const dynamic = 'force-dynamic';

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    deleted?: string;
    hidden?: string;
    error?: string;
    programme?: string;
    status?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();
  const flags = await searchParams;

  const page = Math.max(1, Number(flags.page ?? '1') || 1);
  const status =
    flags.status === 'published' || flags.status === 'draft' ? flags.status : undefined;

  // Filtering happens in the DATABASE. Fetching every student to filter in
  // memory does not survive 1,000 records.
  let result: Awaited<ReturnType<typeof listToppers>> | null = null;
  let failed = false;
  try {
    result = await listToppers({
      ...(flags.programme ? { programme: flags.programme } : {}),
      ...(status ? { status } : {}),
      page,
    });
  } catch {
    failed = true;
  }
  const rows = result?.rows ?? [];
  const anyRecords = (result?.total ?? 0) > 0 || Boolean(flags.programme || status);

  return (
    <>
      <PageHeader
        title="Students & Results"
        description="Results stay private until you have the permissions to show them."
        action={<Button href="/admin/students/new">Add result</Button>}
      />

      <div className="mb-6 flex flex-col gap-3 empty:mb-0">
        {flags.saved ? <Notice tone="ok">Saved successfully.</Notice> : null}
        {flags.hidden ? (
          <Notice tone="ok">Taken off the website.</Notice>
        ) : null}
        {flags.deleted ? <Notice tone="ok">Result deleted.</Notice> : null}
        {flags.error ? (
          <Notice tone="danger">We could not do that. Please try again.</Notice>
        ) : null}
        {failed ? (
          <Notice tone="warn" title="We could not load results just now">
            Please refresh the page.
          </Notice>
        ) : null}
      </div>

      {!failed && !anyRecords ? (
        <EmptyPanel
          title="No results yet"
          description="Add a student's result. It stays private until you confirm you have permission to show it."
          action={<Button href="/admin/students/new">Add result</Button>}
        />
      ) : null}

      {anyRecords ? (
        <>
          <div className="mb-5 flex flex-wrap gap-1.5">
            <FilterLink label="All" href="/admin/students" active={!flags.programme && !flags.status} />
            <FilterLink
              label="On website"
              href="/admin/students?status=published"
              active={flags.status === 'published'}
            />
            <FilterLink
              label="Drafts"
              href="/admin/students?status=draft"
              active={flags.status === 'draft'}
            />
            {Object.entries(PROGRAMME_LABELS).map(([value, label]) => (
              <FilterLink
                key={value}
                label={label}
                href={`/admin/students?programme=${value}`}
                active={flags.programme === value}
              />
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyPanel
              title="Nothing matches that filter"
              description="Clear the filter to see all results."
            />
          ) : (
            <>
              <div className="hidden md:block">
                <TableShell
                  headings={['Shown as', 'Course', 'Year', 'Result', 'Status', '']}
                >
                  {rows.map((r) => {
                    const view = present({
                      studentName: r.studentName,
                      displayNameMode: r.displayNameMode,
                      photoUrl: r.photoUrl,
                      consentRef: r.consentRef,
                      consentResult: r.consentResult,
                      consentName: r.consentName,
                      consentPhoto: r.consentPhoto,
                      published: r.published,
                    });
                    return (
                      <tr key={r.id} className="hover:bg-surface">
                        <Td className="font-medium text-text">
                          {/* The list shows what the PUBLIC would see, so the
                              teacher can spot an over-share at a glance. */}
                          {r.published ? (view.name ?? view.monogram) : r.studentName}
                          {!r.published ? (
                            <span className="ml-2 text-[12px] font-normal text-muted">
                              (not shown yet)
                            </span>
                          ) : null}
                        </Td>
                        <Td className="text-muted">
                          {PROGRAMME_LABELS[r.programme] ?? r.programme}
                        </Td>
                        <Td className="tabular-nums text-muted">{r.year}</Td>
                        <Td className="tabular-nums text-text">
                          {String(r.score)}
                          {r.scoreUnit === 'percent' ? '%' : ' marks'}
                        </Td>
                        <Td>
                          <StatusPill tone={r.published ? 'published' : 'draft'}>
                            {r.published ? 'On website' : 'Draft'}
                          </StatusPill>
                        </Td>
                        <Td>
                          <Link
                            href={`/admin/students/${r.id}`}
                            className="text-small text-link"
                          >
                            Edit
                          </Link>
                        </Td>
                      </tr>
                    );
                  })}
                </TableShell>
              </div>

              <ul className="flex flex-col gap-3 md:hidden">
                {rows.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/students/${r.id}`}
                      className="block rounded-md border border-rule bg-paper p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium text-text">
                          {r.studentName}
                        </span>
                        <StatusPill tone={r.published ? 'published' : 'draft'}>
                          {r.published ? 'On website' : 'Draft'}
                        </StatusPill>
                      </div>
                      <p className="mt-1.5 text-[13px] tabular-nums text-muted">
                        {PROGRAMME_LABELS[r.programme] ?? r.programme} &middot;{' '}
                        {r.year} &middot; {String(r.score)}
                        {r.scoreUnit === 'percent' ? '%' : ' marks'}
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
              basePath="/admin/students"
              params={{ programme: flags.programme, status: flags.status }}
              label="results"
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'inline-flex min-h-9 items-center rounded-sm border border-navy-600/40 bg-navy-50 px-3 text-[13px] font-medium text-heading'
          : 'inline-flex min-h-9 items-center rounded-sm border border-rule px-3 text-[13px] text-muted hover:bg-surface'
      }
    >
      {label}
    </Link>
  );
}
