import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { requireAdmin } from '@/lib/auth';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { PageHeader, Card, Notice, StatusPill, EmptyPanel } from '@/components/admin/ui';
import { isSafePhotoPath } from '@/lib/validation';
import { deleteFaculty } from './actions';
import { DeleteButton } from '@/components/admin/delete-button';

export const metadata: Metadata = { title: 'Faculty' };
export const dynamic = 'force-dynamic';

/**
 * The faculty list.
 *
 * Ordered exactly as the public page orders it — priority first, then name —
 * so "who appears first?" is answered by looking at this screen rather than by
 * guessing. Hidden entries appear here and nowhere else, which is the whole
 * point of having a draft state.
 */
export default async function FacultyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  await requireAdmin();
  const flags = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PageHeader title="Faculty" />
        <Notice tone="danger" title="No database">
          <p>Faculty cannot be listed because the database is not configured.</p>
        </Notice>
      </>
    );
  }

  const staff = await getPrisma().faculty.findMany({
    orderBy: [{ priority: 'desc' }, { name: 'asc' }],
  });

  const shown = staff.filter((s) => s.published).length;

  return (
    <>
      <PageHeader
        title="Faculty"
        description="The teachers shown on the website. Nothing appears publicly until you tick “Show this teacher on the website”."
        action={
          <Link
            href="/admin/faculty/new"
            className="inline-flex min-h-11 items-center rounded-sm bg-navy-800 px-4 text-small font-medium text-white shadow-e1 transition-colors hover:bg-navy-700"
          >
            Add a teacher
          </Link>
        }
      />

      {flags.saved ? (
        <div className="mb-6">
          <Notice tone="ok">Saved.</Notice>
        </div>
      ) : null}
      {flags.deleted ? (
        <div className="mb-6">
          <Notice tone="ok">That teacher has been removed.</Notice>
        </div>
      ) : null}
      {flags.error ? (
        <div className="mb-6">
          <Notice tone="danger">That could not be removed. Please try again.</Notice>
        </div>
      ) : null}

      {staff.length === 0 ? (
        <EmptyPanel
          title="No teachers added yet"
          description="Add the people who teach at the institute. The faculty section only appears on the website once at least one is shown."
          action={
            <Link
              href="/admin/faculty/new"
              className="inline-flex min-h-11 items-center rounded-sm bg-navy-800 px-4 text-small font-medium text-white"
            >
              Add the first teacher
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-4 text-small text-muted">
            {staff.length} {staff.length === 1 ? 'teacher' : 'teachers'}, {shown}{' '}
            shown on the website.
          </p>

          <ul className="flex flex-col gap-4">
            {staff.map((member) => (
              <li key={member.id}>
                <Card className="flex flex-wrap items-start gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-rule bg-surface">
                    {member.photoUrl && isSafePhotoPath(member.photoUrl) ? (
                      <Image
                        src={member.photoUrl}
                        /* Decorative here: the name is right beside it. */
                        alt=""
                        width={64}
                        height={64}
                        className="h-16 w-16 object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[11px] text-muted">
                        No photo
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="font-display text-[17px] font-semibold text-heading">
                        {member.name}
                      </p>
                      <StatusPill tone={member.published ? 'published' : 'draft'}>
                        {member.published ? 'On website' : 'Draft'}
                      </StatusPill>
                    </div>
                    <p className="mt-0.5 text-small text-muted">
                      {member.designation}
                      {member.subject ? ` · ${member.subject}` : ''}
                    </p>
                    {member.bio ? (
                      /*
                        PRE-EXISTING, FOUND BY THE TOPIC 8 PROBE AND FIXED HERE.

                        A flex child defaults to `min-width: auto`, so a long
                        hyphen-free description made this page 3774px wide at a
                        320px viewport, pushing Edit and Remove off-screen. The
                        gallery list had the identical defect; leaving the one
                        next door to it unfixed made no sense.
                      */
                      <p className="measure mt-2 text-small text-text [overflow-wrap:anywhere]">
                        {member.bio}
                      </p>
                    ) : null}
                    {member.priority > 0 ? (
                      <p className="mt-2 text-[13px] text-muted">
                        Order {member.priority}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/admin/faculty/${member.id}`}
                      className="inline-flex min-h-11 items-center rounded-sm border border-rule px-3 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected"
                    >
                      Edit<span className="sr-only"> {member.name}</span>
                    </Link>
                    {/*
                      A real POST through a server action, not a link. A
                      destructive action behind a GET can be triggered by a
                      prefetch, a crawler, or a browser restoring tabs.
                    */}
                    <form action={deleteFaculty}>
                      <input type="hidden" name="id" value={member.id} />
                      <DeleteButton
                        label="Remove"
                        name={member.name}
                        confirmMessage="Remove this teacher?"
                      />
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
