import type { Metadata } from 'next';
import { institute } from '@/config/institute';
import { pageMetadata } from '@/lib/seo';
import { getActiveAnnouncements } from '@/lib/public-data';
import { Section, PageHeader } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { AnnouncementCard } from '@/components/domain/public-cards';
import { getSiteContent } from '@/lib/site-content';

export const metadata: Metadata = pageMetadata({
  title: 'Updates',
  description: `Latest updates and notices from ${institute.name}, ${institute.locality}.`,
  path: '/announcements',
});

export const revalidate = 900;

/**
 * Updates.
 *
 * Only announcements inside their validity window are returned, and the window
 * is enforced in the database query. An expired notice is not "published but
 * hidden" — it is not fetched, so it cannot be rendered by mistake. That is the
 * structural fix for the previous website, which spent two months announcing a
 * batch that had already started.
 */
export default async function AnnouncementsPage() {
  // `getSiteContent()` is wrapped in React `cache()`, so the header, the
  // footer and this page share ONE query rather than three.
  const [announcements, content] = await Promise.all([
    getActiveAnnouncements(),
    getSiteContent(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Updates"
        title={<>{content['page.announcements.title']}</>}
        standfirst={<>{content['page.announcements.standfirst']}</>}
      />

      <Section tone="surface" labelledBy="updates-heading">
        <h2 id="updates-heading" className="sr-only">
          Current updates
        </h2>

        {announcements.length === 0 ? (
          <div className="rounded-md border border-dashed border-rule-strong bg-paper px-6 py-16 text-center">
            <p className="font-display text-[20px] font-semibold text-heading">
              No updates at the moment
            </p>
            <p className="measure mx-auto mt-3 text-[17px] leading-relaxed text-muted">
              When there is news about admissions or a new batch, it will appear
              here. Notices come down by themselves once they are out of date.
            </p>
            <div className="mt-8 flex justify-center">
              <Button href="/courses">Explore our courses</Button>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {announcements.map((a) => (
              <li key={a.id}>
                <AnnouncementCard message={a.message} href={a.href} startsAt={a.startsAt} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
