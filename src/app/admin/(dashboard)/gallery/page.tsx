import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { requireAdmin } from '@/lib/auth';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { PageHeader, Card, Notice, StatusPill, EmptyPanel } from '@/components/admin/ui';
import { isSafePhotoPath } from '@/lib/validation';
import { CATEGORY_LABEL, describeVisibility, type GalleryCategoryValue } from '@/lib/gallery';
import { deleteGalleryItem } from './actions';
import { DeleteButton } from '@/components/admin/delete-button';

export const metadata: Metadata = { title: 'Gallery' };
export const dynamic = 'force-dynamic';

/**
 * The gallery list.
 *
 * Ordered exactly as the public page orders it — priority first, then newest —
 * so "which photograph appears first?" is answered by looking at this screen
 * rather than by guessing.
 *
 * =============================================================================
 * EVERY ROW SAYS WHETHER IT IS PUBLIC AND WHY
 * =============================================================================
 * A gallery of other people's children is the one screen where "I thought that
 * one was hidden" is a serious sentence. So no row shows a bare Draft/Published
 * badge: each carries the sentence `describeVisibility()` produces, built from
 * the same predicate the public page filters on.
 *
 * That includes the state nobody expects — MARKED for the website but not
 * actually showing, which happens when a stored path stops being renderable.
 * The database constraint prevents the consent version of that state; it cannot
 * prevent this one, because `isSafePhotoPath` is stricter than any CHECK can
 * be. A teacher would otherwise never find out.
 */
export default async function AdminGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    deleted?: string;
    error?: string;
    consent?: string;
  }>;
}) {
  await requireAdmin();
  const flags = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PageHeader title="Gallery" />
        <Notice tone="danger" title="No database">
          <p>The gallery cannot be listed because the database is not configured.</p>
        </Notice>
      </>
    );
  }

  const items = await getPrisma().galleryItem.findMany({
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });

  const live = items.filter((item) => describeVisibility(item).public).length;

  return (
    <>
      <PageHeader
        title="Gallery"
        description="Photographs of the institute. A photograph of a person stays off the website until you record that you hold their permission."
        action={
          <Link
            href="/admin/gallery/new"
            className="inline-flex min-h-11 items-center rounded-sm bg-navy-800 px-4 text-small font-medium text-white shadow-e1 transition-colors hover:bg-navy-700"
          >
            Add a photograph
          </Link>
        }
      />

      {flags.saved ? (
        <div className="mb-6">
          <Notice tone="ok">Saved.</Notice>
        </div>
      ) : null}
      {/*
        The consent flag is its own message, not a variant of "saved".

        It is what the teacher sees after unticking permission on a photograph
        that was live: the save succeeded AND the photograph came down. Rolling
        that into "Saved." would hide the part that matters.
      */}
      {flags.consent ? (
        <div className="mb-6">
          <Notice tone="warn" title="Saved, and taken off the website">
            <p>
              That photograph is no longer shown publicly, because the
              permission for it is not recorded. It is still here, so nothing
              has been lost — tick the permission again to put it back.
            </p>
          </Notice>
        </div>
      ) : null}
      {flags.deleted ? (
        <div className="mb-6">
          <Notice tone="ok">That photograph has been removed.</Notice>
        </div>
      ) : null}
      {flags.error ? (
        <div className="mb-6">
          <Notice tone="danger">That could not be removed. Please try again.</Notice>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyPanel
          title="No photographs yet"
          description="Add pictures of the classrooms, events and day-to-day life of the institute. The gallery only appears on the website once at least one photograph is shown."
          action={
            <Link
              href="/admin/gallery/new"
              className="inline-flex min-h-11 items-center rounded-sm bg-navy-800 px-4 text-small font-medium text-white"
            >
              Add the first photograph
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-4 text-small text-muted">
            {items.length} {items.length === 1 ? 'photograph' : 'photographs'}, {live}{' '}
            on the website.
          </p>

          <ul className="flex flex-col gap-4">
            {items.map((item) => {
              const visibility = describeVisibility(item);
              return (
                <li key={item.id}>
                  <Card className="flex flex-wrap items-start gap-4">
                    <div className="h-20 w-28 shrink-0 overflow-hidden rounded-sm border border-rule bg-surface">
                      {isSafePhotoPath(item.imageUrl) ? (
                        <Image
                          src={item.imageUrl}
                          /* Decorative here: the description is right beside it. */
                          alt=""
                          width={112}
                          height={80}
                          className="h-20 w-28 object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center px-2 text-center text-[11px] text-danger">
                          Photo missing
                        </span>
                      )}
                    </div>

                    {/*
                      `min-w-0` AND `overflow-wrap` ARE BOTH LOAD-BEARING.

                      A flex child defaults to `min-width: auto`, so it refuses
                      to shrink below its widest unbreakable content. A teacher
                      pasting a long hyphen-free description — or a URL, or the
                      attack strings this project's own suites store — made
                      /admin/gallery 1542px wide at a 320px viewport, so the
                      Edit and Remove controls sat off-screen and the page
                      scrolled sideways.

                      The public grid already handled this; the admin did not,
                      which is the wrong way round: the admin is where hostile
                      text arrives first.
                    */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <StatusPill tone={visibility.public ? 'published' : 'draft'}>
                          {visibility.public ? 'On website' : 'Not shown'}
                        </StatusPill>
                        <span className="text-[13px] text-muted">
                          {CATEGORY_LABEL[item.category as GalleryCategoryValue]}
                        </span>
                      </div>

                      <p className="measure mt-2 text-small text-text [overflow-wrap:anywhere]">
                        {item.alt}
                      </p>
                      {item.caption ? (
                        <p className="measure mt-1 text-[13px] text-muted [overflow-wrap:anywhere]">
                          {item.caption}
                        </p>
                      ) : null}

                      <p className="measure mt-2 text-[13px] text-muted [overflow-wrap:anywhere]">
                        {visibility.summary}
                      </p>
                      {item.priority > 0 ? (
                        <p className="mt-2 text-[13px] text-muted">
                          Order {item.priority}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/admin/gallery/${item.id}`}
                        className="inline-flex min-h-11 items-center rounded-sm border border-rule px-3 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected"
                      >
                        Edit<span className="sr-only"> {item.alt}</span>
                      </Link>
                      {/*
                        A real POST through a server action, not a link. A
                        destructive action behind a GET can be triggered by a
                        prefetch, a crawler, or a browser restoring tabs.
                      */}
                      <form action={deleteGalleryItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <DeleteButton
                          label="Remove"
                          name={item.alt}
                          confirmMessage="Remove this photograph?"
                        />
                      </form>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
