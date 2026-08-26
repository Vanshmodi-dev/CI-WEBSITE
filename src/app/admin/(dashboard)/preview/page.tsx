import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getPublishedResults, getPublishedStories, getUpcomingBatches, getActiveAnnouncements } from '@/lib/public-data';
import { PageHeader, Card, Notice } from '@/components/admin/ui';
import { ResultCard, StoryCard, AnnouncementCard } from '@/components/domain/public-cards';
import { institute } from '@/config/institute';
import { courseLabel } from '@/lib/admin-format';
import { getSiteContent, getStoredSettings } from '@/lib/site-content';
import { previewPages, CODE_OWNED } from '@/config/site-content';
import { contentToken } from '@/lib/stale-edit';
import { FieldEditor } from './field-editor';

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

  const [results, stories, batches, announcements, content, stored] = await Promise.all([
    getPublishedResults({ limit: 6 }),
    getPublishedStories(2),
    getUpcomingBatches({ limit: 4 }),
    getActiveAnnouncements(3),
    getSiteContent(),
    getStoredSettings(),
  ]);

  const pages = previewPages();

  /** Lost-update token for one key: its own row, or empty if never saved. */
  const tokenFor = (key: string): string => {
    const row = stored.get(key);
    return contentToken(row ? [row] : []);
  };

  const nothingLive =
    results.total === 0 &&
    stories.length === 0 &&
    batches.length === 0 &&
    announcements.length === 0;

  return (
    <>
      <PageHeader
        title="Website preview"
        description="Exactly what visitors can see right now, and every piece of wording you can change. If something is missing here, it is missing on the website too."
      />

      <div className="mb-6">
        <Notice tone="info" title="This shows published content only">
          {/*
            A real <p>, not bare text in a <div>.

            The link inside this sentence is 82x20, which is under the 24x24
            touch-target minimum. WCAG 2.5.8 exempts a link that sits inline in
            a block of text - but the exemption is about what the markup SAYS,
            and a link floating in a <div> is not in a paragraph. Wrapping the
            prose makes the exemption honestly apply and is better semantics
            regardless; the alternative, padding an inline link out to 24px
            tall, would break the line it sits in.
          */}
          <p>
            Anything still in draft, or missing a permission, will not appear
            here — the same rule the website follows. Open{' '}
            <Link href="/" className="text-link underline" target="_blank">
              the live site
            </Link>{' '}
            to see it in its real layout.
          </p>
        </Notice>
      </div>

      {/*
        THE EDITABLE MAP.

        Values come from `getSiteContent()` — the same function the public pages
        call — so what is printed here is what a visitor is being served. The
        grouping comes from each field's declared render location, and a unit
        test asserts that declaration is true of the source.
      */}
      <section className="mb-12">
        <h2 className="mb-1 font-display text-[20px] font-semibold text-heading">
          Wording you can change
        </h2>
        <p className="measure mb-5 text-small text-muted">
          Grouped by the page it appears on. Click Edit to change it; the
          website updates as soon as you save.
        </p>

        <div className="flex flex-col gap-5">
          {pages.map((page) => (
            <Card key={page.route}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-display text-[17px] font-semibold text-heading">
                  {page.title}
                </h3>
                {page.href ? (
                  <Link
                    href={page.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-small font-medium text-link hover:text-link-hover"
                  >
                    Open this page &nearr;
                  </Link>
                ) : null}
              </div>

              {page.sections.map((section) => (
                <div key={section.section} className="mt-4">
                  <h4 className="eyebrow text-accent-text">{section.section}</h4>
                  <div className="mt-1 divide-y divide-rule">
                    {section.fields.map((field) => (
                      <FieldEditor
                        key={field.key}
                        field={field}
                        value={content[field.key] ?? ''}
                        token={tokenFor(field.key)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          ))}
        </div>
      </section>

      {/*
        AND WHAT IS NOT EDITABLE, SAID OUT LOUD.

        A CMS that silently omits things trains the reader to believe everything
        it does not mention is impossible. Naming these, with the reason,
        answers "why can I not change that?" without anyone having to ask.
      */}
      <section className="mb-12">
        <h2 className="mb-1 font-display text-[20px] font-semibold text-heading">
          Set in the code, on purpose
        </h2>
        <p className="measure mb-5 text-small text-muted">
          These are not oversights. Each one would break something if it were a
          text box.
        </p>
        <Card>
          <dl className="divide-y divide-rule">
            {CODE_OWNED.map((item) => (
              <div key={item.label} className="py-3">
                <dt className="text-small font-medium text-text">{item.label}</dt>
                <dd className="mt-0.5 measure text-[13px] text-muted">{item.why}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <h2 className="mb-1 font-display text-[20px] font-semibold text-heading">
        Content you have published
      </h2>
      <p className="measure mb-5 text-small text-muted">
        Results, stories, batches and updates. These are records, not wording,
        and are managed under Students and Website.
      </p>

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
                  {courseLabel(b.courseSlug)}
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
