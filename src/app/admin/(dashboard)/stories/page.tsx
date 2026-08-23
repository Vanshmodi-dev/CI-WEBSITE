import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listStories } from '@/lib/admin-data';
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

/**
 * Student stories.
 *
 * A story is a SEPARATE permission from a result. A student who agreed to have
 * their marks published has not thereby agreed to a written story about them,
 * and neither grant includes a photograph.
 */
export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  await requireAdmin();
  const flags = await searchParams;

  let stories: Awaited<ReturnType<typeof listStories>> = [];
  let failed = false;
  try {
    stories = await listStories();
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader
        title="Student Stories"
        description="Longer write-ups about a student's journey. Separate permission from results."
        action={<Button href="/admin/stories/new">Add story</Button>}
      />

      <div className="mb-6 flex flex-col gap-3 empty:mb-0">
        {flags.saved ? <Notice tone="ok">Saved successfully.</Notice> : null}
        {flags.deleted ? <Notice tone="ok">Story deleted.</Notice> : null}
        {flags.error ? (
          <Notice tone="danger">We could not do that. Please try again.</Notice>
        ) : null}
        {failed ? (
          <Notice tone="warn" title="We could not load stories just now">
            Please refresh the page.
          </Notice>
        ) : null}
      </div>

      {!failed && stories.length === 0 ? (
        <EmptyPanel
          title="No stories yet"
          description="A story is a short write-up of how a student got their result. Add one once you have their written permission."
          action={<Button href="/admin/stories/new">Add story</Button>}
        />
      ) : null}

      {stories.length > 0 ? (
        <>
          <div className="hidden md:block">
            <TableShell headings={['Shown as', 'Course', 'Year', 'Status', '']}>
              {stories.map((s) => {
                const view = present(
                  {
                    studentName: s.studentName,
                    displayNameMode: s.displayNameMode,
                    photoUrl: s.photoUrl,
                    consentRef: s.consentRef,
                    consentStory: s.consentStory,
                    consentName: s.consentName,
                    consentPhoto: s.consentPhoto,
                    published: s.published,
                  },
                  'consentStory',
                );
                return (
                  <tr key={s.id} className="hover:bg-surface">
                    <Td className="font-medium text-text">
                      {s.published ? (view.name ?? view.monogram) : s.studentName}
                      {!s.published ? (
                        <span className="ml-2 text-[12px] font-normal text-muted">
                          (not shown yet)
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-muted">
                      {PROGRAMME_LABELS[s.programme] ?? s.programme}
                    </Td>
                    <Td className="tabular-nums text-muted">{s.year}</Td>
                    <Td>
                      <StatusPill tone={s.published ? 'published' : 'draft'}>
                        {s.published ? 'On website' : 'Draft'}
                      </StatusPill>
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/stories/${s.id}`}
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
            {stories.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/stories/${s.id}`}
                  className="block rounded-md border border-rule bg-paper p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-text">{s.studentName}</span>
                    <StatusPill tone={s.published ? 'published' : 'draft'}>
                      {s.published ? 'On website' : 'Draft'}
                    </StatusPill>
                  </div>
                  <p className="mt-1.5 text-[13px] text-muted">
                    {PROGRAMME_LABELS[s.programme] ?? s.programme} &middot; {s.year}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
