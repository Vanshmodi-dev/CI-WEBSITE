import type { Metadata } from 'next';
import Image from 'next/image';
import { requireAdmin } from '@/lib/auth';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { PageHeader, Card, Notice, EmptyPanel } from '@/components/admin/ui';
import { formatDateTime } from '@/lib/admin-format';
import { mediaPath } from '@/lib/media/format';
import { getMediaStore, describeMediaStorage } from '@/lib/media/store';
import { countMediaReferences } from '@/lib/media/references';
import { describeUsage } from '@/lib/media/consumers';
import { DeleteMediaButton } from './delete-button';

export const metadata: Metadata = { title: 'Photos' };

/** An editor must show what is stored right now, never a cached list. */
export const dynamic = 'force-dynamic';

/**
 * The photo library.
 *
 * Every image the institute has uploaded, what it is, and whether anything is
 * using it. The "in use" count is the reason this page exists rather than a
 * bare grid: deletion is refused while a record still points at a file, and a
 * teacher needs to see WHY before they are told no.
 *
 * That count comes from `countMediaReferences`, never from queries written
 * here. When this page owned its own pair of queries it fell two consumers
 * behind the schema and started offering to delete photographs the gallery was
 * publishing.
 */
export default async function MediaLibraryPage() {
  await requireAdmin();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PageHeader title="Photos" />
        <Notice tone="danger" title="No database">
          <p>Photos cannot be listed because the database is not configured.</p>
        </Notice>
      </>
    );
  }

  const prisma = getPrisma();
  const assets = await prisma.mediaAsset.findMany({
    orderBy: { uploadedAt: 'desc' },
    take: 200,
  });

  /*
    Usage is counted through `countMediaReferences`, which is the ONE list of
    places a photograph can be referenced from.

    ⚠ THIS PAGE USED TO HAND-WRITE THE QUERIES, AND LOOKED IN HALF THE PLACES.

    It grouped `topper.photoUrl` and `studentStory.photoUrl` — the two consumers
    that existed when Topic 5 wrote it — and never learned about the teacher
    photographs Topic 6 added or the gallery images Topic 8 added. So a
    photograph on the live gallery reported "Not used anywhere", was offered a
    Delete button, and was destroyed on request. See the reproduction in
    `src/lib/media/references.ts`.
  */
  const usage = await countMediaReferences(assets.map((a) => mediaPath(a.key)));

  // Reported, not inferred: what storage actually holds versus what is recorded.
  const storage = describeMediaStorage();
  const storedKeys = new Set(await getMediaStore().list().catch(() => []));

  return (
    <>
      <PageHeader
        title="Photos"
        description="Every photo uploaded to this website. A photo is attached to a record — a student result, a story, a teacher or a gallery entry — from that record's own page."
      />

      {/*
        WHERE THE PHOTOGRAPHS ACTUALLY GO, said plainly.

        `describeMediaStorage()` was written in Topic 5 with a comment saying it
        existed "so the pre-flight check and the admin can report the truth" —
        and then nothing called it for two phases. It is called here now, so the
        sentence is true and so a teacher can tell at a glance whether their
        photographs are going somewhere durable.
      */}
      {!storage.durable ? (
        <div className="mb-6">
          <Notice tone="warn" title="Photo storage is for testing only on this server">
            <p>
              Uploaded photos are kept on this machine&rsquo;s disk. That works
              here, but the live website runs on a host whose disk is wiped on
              every deployment, so photo storage has to be set up before the
              site goes live. Nothing you upload now will survive that step.
            </p>
            <p className="mt-2 text-[13px] text-muted">Storing to: {storage.description}</p>
          </Notice>
        </div>
      ) : (
        <div className="mb-6">
          <Notice tone="ok" title="Photos are stored safely">
            <p>
              Uploaded photos go to permanent storage and survive a deployment.
            </p>
            <p className="mt-2 text-[13px] text-muted">Storing to: {storage.description}</p>
          </Notice>
        </div>
      )}

      {assets.length === 0 ? (
        <EmptyPanel
          title="No photos yet"
          description="Photos appear here once you add one to a student result, a story, a teacher or the gallery."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => {
            const path = mediaPath(asset.key);
            const used = usage.get(path);
            const present = storedKeys.has(asset.key);

            return (
              <Card key={asset.key} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-rule bg-surface">
                    {present ? (
                      <Image
                        src={path}
                        /*
                          The teacher's own filename, escaped by React. It is a
                          LABEL: it never addressed this file and never will.
                        */
                        alt={asset.originalName}
                        width={80}
                        height={80}
                        className="h-20 w-20 object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center px-1 text-center text-[11px] text-danger">
                        File missing
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-medium text-text">
                      {asset.originalName}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {asset.width}&times;{asset.height} &middot;{' '}
                      {Math.round(asset.bytes / 1024)} KB
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {formatDateTime(asset.uploadedAt)} by {asset.uploadedBy}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-rule pt-3">
                  <p className="text-[13px] text-muted">
                    {used ? `Used by ${describeUsage(used)}` : 'Not used anywhere'}
                  </p>
                  <DeleteMediaButton
                    mediaKey={asset.key}
                    name={asset.originalName}
                    inUse={Boolean(used)}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
