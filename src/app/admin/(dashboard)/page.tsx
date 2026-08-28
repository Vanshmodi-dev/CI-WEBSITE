import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import {
  getDashboardSummary,
  getRecentEnquiries,
  getUpcomingBatches,
} from '@/lib/admin-data';
import { Card, StatusPill, QuickAction, Notice } from '@/components/admin/ui';
import { CLASS_LEVEL_LABELS, type ClassLevelValue } from '@/lib/validation';
import { ENQUIRY_STATUS_LABELS, courseLabel, formatDate } from '@/lib/admin-format';

export const dynamic = 'force-dynamic';

/**
 * Dashboard.
 *
 * Answers one question — "what needs my attention?" — and then gets out of the
 * way. No charts: a chart of five enquiries tells a teacher less than the list
 * of five enquiries does.
 */
export default async function AdminDashboard() {
  const admin = await requireAdmin();

  let summary = null;
  let recent: Awaited<ReturnType<typeof getRecentEnquiries>> = [];
  let batches: Awaited<ReturnType<typeof getUpcomingBatches>> = [];
  let failed = false;

  try {
    [summary, recent, batches] = await Promise.all([
      getDashboardSummary(),
      getRecentEnquiries(5),
      getUpcomingBatches(4),
    ]);
  } catch {
    failed = true;
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="font-display text-[28px] font-bold leading-tight text-heading">
          {greeting()}, {admin.displayName}
        </h1>
        <p className="mt-1.5 text-small text-muted">
          Here is what is happening today.
        </p>
      </header>

      {failed ? (
        <Notice tone="warn" title="We could not load your figures just now">
          Please refresh the page. If it keeps happening, contact TradyPerch.
        </Notice>
      ) : null}

      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="New enquiries"
              value={summary.newEnquiries}
              href="/admin/enquiries?status=NEW"
              highlight={summary.newEnquiries > 0}
            />
            <Stat
              label="Upcoming batches"
              value={summary.activeBatches}
              href="/admin/batches"
            />
            <Stat
              label="Published results"
              value={summary.publishedResults}
              href="/admin/students"
            />
            <Stat
              label="Live announcements"
              value={summary.liveAnnouncements}
              href="/admin/announcements"
            />
          </div>

          <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-[18px] font-semibold text-heading">
                  Recent enquiries
                </h2>
                {/*
                  `min-h-11` and the padding are what carry this over the 24x24
                  floor (WCAG 2.5.8) - it measured 42x23 in Topic 11. The
                  negative margin keeps it optically aligned with the heading
                  now that it has a hit area.
                */}
                <Link
                  href="/admin/enquiries"
                  className="-mr-2 inline-flex min-h-11 items-center rounded-sm px-2 text-small text-link"
                >
                  See all
                </Link>
              </div>

              {recent.length === 0 ? (
                <p className="mt-4 text-small text-muted">
                  No enquiries yet. They will appear here as soon as someone
                  uses the form on the website.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-rule">
                  {recent.map((e) => (
                    <li key={e.id} className="py-2.5">
                      <Link
                        href={`/admin/enquiries/${e.id}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-text">
                            {e.name}
                          </span>
                          <span className="block text-[13px] text-muted">
                            {CLASS_LEVEL_LABELS[e.classLevel as ClassLevelValue] ??
                              e.classLevel}
                          </span>
                        </span>
                        <StatusPill tone={e.status === 'NEW' ? 'new' : 'done'}>
                          {ENQUIRY_STATUS_LABELS[e.status] ?? e.status}
                        </StatusPill>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-[18px] font-semibold text-heading">
                  Upcoming batches
                </h2>
                                {/*
                  `min-h-11` and the padding are what carry this over the 24x24
                  floor (WCAG 2.5.8) - it measured 42x23 in Topic 11. The
                  negative margin keeps it optically aligned with the heading
                  now that it has a hit area.
                */}
                <Link
                  href="/admin/batches"
                  className="-mr-2 inline-flex min-h-11 items-center rounded-sm px-2 text-small text-link"
                >
                  See all
                </Link>
              </div>

              {batches.length === 0 ? (
                <p className="mt-4 text-small text-muted">
                  No upcoming batches. Add one so students can see when the
                  next batch starts.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-rule">
                  {batches.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-text">
                          {courseLabel(b.courseSlug)}
                        </span>
                        <span className="block text-[13px] text-muted">
                          Starts {formatDate(b.startsAt)}
                        </span>
                      </span>
                      <StatusPill tone={b.published ? 'published' : 'draft'}>
                        {b.published ? 'On website' : 'Draft'}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </>
      ) : null}

      <section className="mt-10">
        <h2 className="mb-4 font-display text-[18px] font-semibold text-heading">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            href="/admin/students/new"
            label="Add a result"
            hint="Publish a student's result"
          />
          <QuickAction href="/admin/batches/new" label="Add a batch" hint="Set a start date" />
          <QuickAction
            href="/admin/announcements/new"
            label="New announcement"
            hint="Post an update"
          />
          <QuickAction href="/admin/enquiries" label="View enquiries" hint="Follow up on leads" />
        </div>
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: number;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-rule bg-paper p-4 transition-colors hover:border-navy-600/50"
    >
      <span className="block font-display text-[30px] font-bold leading-none text-heading tabular-nums">
        {value}
      </span>
      <span className="mt-2 block text-[13px] text-muted">{label}</span>
      {highlight ? (
        <span
          aria-hidden="true"
          className="mt-2 block h-0.5 w-8 rounded-full bg-accent"
        />
      ) : null}
    </Link>
  );
}

function greeting(): string {
  // Fixed to IST — the institute is in Jaipur, and the server is not.
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(new Date()),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
