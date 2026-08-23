import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getPublishedResults, getPublishedStories, getUpcomingBatches, getActiveAnnouncements } from '@/lib/public-data';
import { PageHeader, Card, Notice } from '@/components/admin/ui';
import { ResultCard, StoryCard, AnnouncementCard } from '@/components/domain/public-cards';
import { institute } from '@/config/institute';

export const dynamic = 'force-dynamic';

/**
 * Preview — "what does the website actually show right now?"
 *
 * ⚠ THIS IS NOT A SECRET-URL PREVIEW, DELIBERATELY.
 *
 * It calls the SAME public data functions the live site calls, so it can only
 * ever show what a visitor could already see. There is no draft-preview token,
 * no bypass parameter and no unpublished content — a signed preview URL for
 * unpublished student data would be a way to leak a minor's photograph to
 * anyone who got the link, and it is not worth building.
 *
 * What this answers is the question a teacher actually has after publishing:
 * "did it work?" If a record is missing here, it is missing on the website, and
 * the reason is always a permission that has not been ticked.
 */
export default async function PreviewPage() {
  await requireAdmin();

  const [results, stories, batches, announcements] = await Promise.all([
    getPublishedResults({ limit: 6 }),
    getPublishedStories(2),
    getUpcomingBatches({ limit: 4 }),
    getActiveAnnouncements(3),
  ]);

  const nothingLive =
    results.total === 0 &&
    stories.length === 0 &&
    batches.length === 0 &&
    announcements.length === 0;

  return (
    <>
      <PageHeader
        title="Website preview"
        description="Exactly what visitors can see right now. If something is missing here, it is missing on the website too."
      />

      <div className="mb-6">
        <Notice tone="info" title="This shows published content only">
          Anything still in draft, or missing a permission, will not appear here
          — the same rule the website follows. Open{' '}
          <Link href="/" className="text-link underline" target="_blank">
            the live site
          </Link>{' '}
          to see it in its real layout.
        </Notice>
      </div>

      {nothingLive ? (
        <Card>
          <p className="font-display text-[18px] font-semibold text-heading">
            Nothing is published yet
          </p>
          <p className="measure mt-2 text-small text-muted">
            The website is live and working — it simply has no results, stories,
            batches or updates to show. As you publish them they will appear
            here and on the site. Visitors currently see {institute.name}&rsquo;s
            programmes and contact details.
          </p>
        </Card>
      ) : null}

      {announcements.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-4 font-display text-[18px] font-semibold text-heading">
            Updates showing now ({announcements.length})
          </h2>
          <ul className="flex flex-col gap-3">
            {announcements.map((a) => (
              <li key={a.id}>
                <AnnouncementCard message={a.message} href={a.href} startsAt={a.startsAt} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results.total > 0 ? (
        <section className="mb-10">
          <h2 className="mb-4 font-display text-[18px] font-semibold text-heading">
            Results on the website ({results.total})
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.results.map((r) => (
              <ResultCard key={r.id} result={r} />
            ))}
          </div>
        </section>
      ) : null}

      {stories.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-4 font-display text-[18px] font-semibold text-heading">
            Stories on the website ({stories.length})
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {stories.map((s) => (
              <StoryCard key={s.id} story={s} />
            ))}
          </div>
        </section>
      ) : null}

      {batches.length > 0 ? (
        <section>
          <h2 className="mb-4 font-display text-[18px] font-semibold text-heading">
            Upcoming batches ({batches.length})
          </h2>
          <ul className="flex flex-col gap-2 text-small">
            {batches.map((b) => (
              <li key={b.id} className="rounded-md border border-rule bg-paper p-4">
                <span className="font-medium text-text">
                  {institute.courses.find((c) => c.slug === b.courseSlug)?.name ?? b.courseSlug}
                </span>
                <span className="ml-2 text-muted">{b.mode}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
