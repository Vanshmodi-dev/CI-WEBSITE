import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getSiteContent, getStoredSettings, countCustomised } from '@/lib/site-content';
import { FIELD_GROUPS, fieldsInGroup, fieldViewsInGroup } from '@/config/site-content';
import { PageHeader, Notice } from '@/components/admin/ui';
import { formatDateTime } from '@/lib/admin-format';
import { contentToken } from '@/lib/stale-edit';
import { GroupForm } from './group-form';

export const metadata: Metadata = { title: 'Website text' };

/** Never cached: an editor must show what is stored right now. */
export const dynamic = 'force-dynamic';

/**
 * The Website Editor.
 *
 * Everything a teacher may change about the words on the public site, grouped
 * by the question they came here to answer. What is NOT here is as deliberate
 * as what is:
 *
 *   - Page addresses. A slug is a route, and renaming one 404s every link the
 *     institute has already handed out.
 *   - Titles and descriptions for search engines. Editable SEO text is an
 *     invitation to keyword-stuff, and stuffed metadata actively harms a local
 *     listing. Those stay in code.
 *   - Anything about students. Results and stories are consent-gated records,
 *     not website copy, and they live under Students where the consent
 *     controls are.
 *   - Adding menu entries. See the note in src/config/site-content.ts.
 */
export default async function WebsiteEditorPage() {
  await requireAdmin();

  const [content, stored] = await Promise.all([getSiteContent(), getStoredSettings()]);
  const { customised, total } = countCustomised(stored);

  /** The lost-update token for one group: latest updatedAt across its rows. */
  const tokenFor = (groupId: string): string =>
    contentToken(
      fieldsInGroup(groupId as never)
        .map((f) => stored.get(f.key))
        .filter((row): row is NonNullable<typeof row> => Boolean(row)),
    );

  /** The most recent edit in a group, for "Last changed ...". */
  const lastEditedIn = (groupId: string): string | null => {
    let latest: Date | null = null;
    let who: string | null = null;
    for (const field of fieldsInGroup(groupId as never)) {
      const row = stored.get(field.key);
      if (!row) continue;
      if (!latest || row.updatedAt > latest) {
        latest = row.updatedAt;
        who = row.updatedBy;
      }
    }
    if (!latest) return null;
    return who ? `${formatDateTime(latest)} by ${who}` : formatDateTime(latest);
  };

  return (
    <>
      <PageHeader
        title="Website text"
        description="The words on the public site. Everything here is already filled in with what the website says today — edit what you want to change and leave the rest alone."
        action={
          <Link
            href="/admin/preview"
            className="inline-flex min-h-11 items-center rounded-sm border border-rule px-4 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected"
          >
            See the website
          </Link>
        }
      />

      <div className="flex max-w-3xl flex-col gap-6">
        <Notice tone="info" title="Two things this page does not change">
          <p>
            Web addresses stay fixed, so links already printed on a poster or
            shared on WhatsApp keep working. Student results and stories are
            edited under <strong>Students</strong>, where their permissions are.
          </p>
        </Notice>

        {customised === 0 ? (
          <Notice tone="warn" title="Nothing has been customised yet">
            The site is showing its original wording. Anything you save here
            replaces it; clearing a box puts the original back.
          </Notice>
        ) : (
          <p className="text-small text-muted">
            {customised} of {total} entries have been changed from the original
            wording.
          </p>
        )}

        {FIELD_GROUPS.map((group) => (
          <GroupForm
            key={group.id}
            group={group}
            fields={fieldViewsInGroup(group.id)}
            values={content}
            lastEdited={lastEditedIn(group.id)}
            token={tokenFor(group.id)}
          />
        ))}
      </div>
    </>
  );
}
