import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listAnnouncements } from '@/lib/admin-data';
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

export const dynamic = 'force-dynamic';

/**
 * Three states, not two — "Draft", "Showing now", and "Finished".
 *
 * A published announcement whose window has closed is neither live nor a
 * draft, and showing it as "On website" when it is not would be a lie the
 * teacher would eventually act on.
 */
function liveState(a: { published: boolean; startsAt: Date; endsAt: Date }) {
  const now = Date.now();
  if (!a.published) return { tone: 'draft' as const, label: 'Draft' };
  if (a.endsAt.getTime() < now) return { tone: 'done' as const, label: 'Finished' };
  if (a.startsAt.getTime() > now) return { tone: 'warn' as const, label: 'Scheduled' };
  return { tone: 'published' as const, label: 'Showing now' };
}

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  await requireAdmin();
  const flags = await searchParams;

  let items: Awaited<ReturnType<typeof listAnnouncements>> = [];
  let failed = false;
  try {
    items = await listAnnouncements();
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Short notices that appear across the top of the website."
        action={
          <Button href="/admin/announcements/new">New announcement</Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 empty:mb-0">
        {flags.saved ? <Notice tone="ok">Published successfully.</Notice> : null}
        {flags.deleted ? <Notice tone="ok">Announcement deleted.</Notice> : null}
        {flags.error ? (
          <Notice tone="danger">We could not do that. Please try again.</Notice>
        ) : null}
        {failed ? (
          <Notice tone="warn" title="We could not load announcements just now">
            Please refresh the page.
          </Notice>
        ) : null}
      </div>

      {!failed && items.length === 0 ? (
        <EmptyPanel
          title="No announcements yet"
          description="Create your first announcement to show an update at the top of the website."
          action={
            <Button href="/admin/announcements/new">New announcement</Button>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <>
          <div className="hidden md:block">
            <TableShell headings={['Message', 'Shows from', 'Until', 'Status', '']}>
              {items.map((a) => {
                const state = liveState(a);
                return (
                  <tr key={a.id} className="hover:bg-surface">
                    <Td className="max-w-md font-medium text-text">{a.message}</Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDate(a.startsAt)}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDate(a.endsAt)}
                    </Td>
                    <Td>
                      <StatusPill tone={state.tone}>{state.label}</StatusPill>
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/announcements/${a.id}`}
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
            {items.map((a) => {
              const state = liveState(a);
              return (
                <li key={a.id}>
                  <Link
                    href={`/admin/announcements/${a.id}`}
                    className="block rounded-md border border-rule bg-paper p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-text">{a.message}</span>
                      <StatusPill tone={state.tone}>{state.label}</StatusPill>
                    </div>
                    <p className="mt-1.5 text-[13px] text-muted">
                      {formatDate(a.startsAt)} &ndash; {formatDate(a.endsAt)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </>
  );
}
