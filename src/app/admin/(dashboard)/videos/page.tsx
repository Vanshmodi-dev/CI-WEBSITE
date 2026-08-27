import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { requireAdmin } from '@/lib/auth';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { PageHeader, Card, Notice, StatusPill, EmptyPanel } from '@/components/admin/ui';
import {
  isYouTubeId,
  thumbnailUrl,
  watchUrl,
  SUBJECT_LABEL,
  type VideoSubjectValue,
} from '@/lib/video';
import { deleteVideo } from './actions';

export const metadata: Metadata = { title: 'Videos' };
export const dynamic = 'force-dynamic';

/**
 * The video list.
 *
 * Ordered exactly as the public page orders it — priority first, then newest —
 * so "which video appears first?" is answered by looking at this screen rather
 * than by guessing.
 *
 * The poster is rendered, never an iframe. An admin screen listing twenty
 * videos would otherwise embed twenty players, which is the cost the public
 * page goes to some trouble to avoid; there is no reason for the teacher to pay
 * it either.
 */
export default async function AdminVideosPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  await requireAdmin();
  const flags = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PageHeader title="Videos" />
        <Notice tone="danger" title="No database">
          <p>Videos cannot be listed because the database is not configured.</p>
        </Notice>
      </>
    );
  }

  const videos = await getPrisma().video.findMany({
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });

  const shown = videos.filter((v) => v.published).length;

  return (
    <>
      <PageHeader
        title="Videos"
        description="Videos from the institute's YouTube channel, chosen to appear on the website. Nothing here uploads or copies a video."
        action={
          <Link
            href="/admin/videos/new"
            className="inline-flex min-h-11 items-center rounded-sm bg-navy-800 px-4 text-small font-medium text-white shadow-e1 transition-colors hover:bg-navy-700"
          >
            Add a video
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
          <Notice tone="ok">
            That video has been removed from the website. It is still on YouTube.
          </Notice>
        </div>
      ) : null}
      {flags.error ? (
        <div className="mb-6">
          <Notice tone="danger">That could not be removed. Please try again.</Notice>
        </div>
      ) : null}

      {videos.length === 0 ? (
        <EmptyPanel
          title="No videos yet"
          description="Add videos from the institute's YouTube channel. The videos section only appears on the website once at least one is shown."
          action={
            <Link
              href="/admin/videos/new"
              className="inline-flex min-h-11 items-center rounded-sm bg-navy-800 px-4 text-small font-medium text-white"
            >
              Add the first video
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-4 text-small text-muted">
            {videos.length} {videos.length === 1 ? 'video' : 'videos'}, {shown} shown
            on the website.
          </p>

          <ul className="flex flex-col gap-4">
            {videos.map((video) => (
              <li key={video.id}>
                <Card className="flex flex-wrap items-start gap-4">
                  <div className="h-[72px] w-32 shrink-0 overflow-hidden rounded-sm border border-rule bg-surface">
                    {/*
                      The id is re-checked before it becomes an `src`, even here.
                      A row written by something other than the save action is
                      exactly the case this catches, and an admin screen is not
                      a reason to skip it.
                    */}
                    {isYouTubeId(video.youtubeId) ? (
                      <Image
                        src={thumbnailUrl(video.youtubeId)}
                        alt=""
                        width={128}
                        height={72}
                        unoptimized
                        className="h-[72px] w-32 object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center px-2 text-center text-[11px] text-danger">
                        Bad video id
                      </span>
                    )}
                  </div>

                  {/*
                    `min-w-0` and `overflow-wrap` together: a flex child defaults
                    to `min-width: auto` and refuses to shrink below its widest
                    unbreakable word, which is how Topic 8 made an admin list
                    1542px wide at a 320px viewport.
                  */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusPill tone={video.published ? 'published' : 'draft'}>
                        {video.published ? 'On website' : 'Draft'}
                      </StatusPill>
                      <span className="text-[13px] text-muted">
                        {SUBJECT_LABEL[video.subject as VideoSubjectValue]}
                      </span>
                    </div>

                    <p className="mt-2 font-display text-[17px] font-semibold text-heading [overflow-wrap:anywhere]">
                      {video.title}
                    </p>
                    {video.description ? (
                      <p className="measure mt-1 text-small text-muted [overflow-wrap:anywhere]">
                        {video.description}
                      </p>
                    ) : null}

                    <p className="mt-2 text-[13px] text-muted">
                      {isYouTubeId(video.youtubeId) ? (
                        <a
                          href={watchUrl(video.youtubeId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link underline"
                        >
                          Check on YouTube
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        <span className="text-danger">
                          This entry does not hold a usable video id and is not shown.
                        </span>
                      )}
                      {video.priority > 0 ? <> · Order {video.priority}</> : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/admin/videos/${video.id}`}
                      className="inline-flex min-h-11 items-center rounded-sm border border-rule px-3 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected"
                    >
                      Edit<span className="sr-only"> {video.title}</span>
                    </Link>
                    {/*
                      A real POST through a server action, not a link. A
                      destructive action behind a GET can be triggered by a
                      prefetch, a crawler, or a browser restoring tabs.
                    */}
                    <form action={deleteVideo}>
                      <input type="hidden" name="id" value={video.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center rounded-sm px-3 text-small font-medium text-muted transition-colors hover:text-danger"
                      >
                        Remove<span className="sr-only"> {video.title}</span>
                      </button>
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
