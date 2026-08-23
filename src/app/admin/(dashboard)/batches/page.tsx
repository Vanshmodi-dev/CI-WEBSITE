import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listBatches } from '@/lib/admin-data';
import {
  PageHeader,
  TableShell,
  Td,
  StatusPill,
  EmptyPanel,
  Notice,
} from '@/components/admin/ui';
import { Button } from '@/components/primitives/button';
import { formatDate } from '@/lib/admin-format';
import { institute } from '@/config/institute';

export const dynamic = 'force-dynamic';

function courseName(slug: string): string {
  return institute.courses.find((c) => c.slug === slug)?.name ?? slug;
}

/**
 * Reading the clock lives in here rather than in the component body.
 *
 * This is a server component rendered per request, so consulting the clock is
 * correct — but doing it inline in the render body trips the React purity rule
 * and would genuinely be unstable if this ever became a client component.
 */
function hasStarted(startsAt: Date): boolean {
  return startsAt.getTime() < Date.now();
}

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  await requireAdmin();
  const flags = await searchParams;

  let batches: Awaited<ReturnType<typeof listBatches>> = [];
  let failed = false;
  try {
    batches = await listBatches();
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader
        title="Batches"
        description="Tell students when the next batch starts."
        action={<Button href="/admin/batches/new">Add batch</Button>}
      />

      <div className="mb-6 flex flex-col gap-3 empty:mb-0">
        {flags.saved ? <Notice tone="ok">Saved successfully.</Notice> : null}
        {flags.deleted ? <Notice tone="ok">Batch deleted.</Notice> : null}
        {flags.error ? (
          <Notice tone="danger">We could not do that. Please try again.</Notice>
        ) : null}
        {failed ? (
          <Notice tone="warn" title="We could not load batches just now">
            Please refresh the page.
          </Notice>
        ) : null}
      </div>

      {!failed && batches.length === 0 ? (
        <EmptyPanel
          title="No batches yet"
          description="Add your first batch so students can see when the next one starts."
          action={<Button href="/admin/batches/new">Add batch</Button>}
        />
      ) : null}

      {batches.length > 0 ? (
        <>
          {/* Desktop */}
          <div className="hidden md:block">
            <TableShell headings={['Course', 'Starts', 'How it runs', 'Status', '']}>
              {batches.map((b) => {
                const started = hasStarted(b.startsAt);
                return (
                  <tr key={b.id} className="hover:bg-surface">
                    <Td className="font-medium text-text">
                      {courseName(b.courseSlug)}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDate(b.startsAt)}
                      {started ? (
                        <span className="ml-2 text-[12px]">(already started)</span>
                      ) : null}
                    </Td>
                    <Td className="text-muted">{b.mode}</Td>
                    <Td>
                      <StatusPill tone={b.published ? 'published' : 'draft'}>
                        {b.published ? 'On website' : 'Draft'}
                      </StatusPill>
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/batches/${b.id}`}
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

          {/* Mobile — stacked, not a squeezed table */}
          <ul className="flex flex-col gap-3 md:hidden">
            {batches.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/batches/${b.id}`}
                  className="block rounded-md border border-rule bg-paper p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-text">
                      {courseName(b.courseSlug)}
                    </span>
                    <StatusPill tone={b.published ? 'published' : 'draft'}>
                      {b.published ? 'On website' : 'Draft'}
                    </StatusPill>
                  </div>
                  <p className="mt-1.5 text-[13px] text-muted">
                    Starts {formatDate(b.startsAt)} &middot; {b.mode}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-8 max-w-prose text-[13px] text-muted">
        A batch whose start date has passed stops appearing as upcoming on the
        website by itself, so an old batch can never advertise itself as new.
      </p>
    </>
  );
}
