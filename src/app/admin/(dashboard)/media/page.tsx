import type { Metadata } from 'next';
import Image from 'next/image';
import { requireAdmin } from '@/lib/auth';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { PageHeader, Card, Notice, EmptyPanel } from '@/components/admin/ui';
import { formatDateTime } from '@/lib/admin-format';
import { mediaPath } from '@/lib/media/format';
import { getMediaStore, mediaStorageIsProductionReady } from '@/lib/media/store';
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
    Usage is counted per asset in ONE pair of queries rather than two per row.
    A library of a few hundred photographs with two queries each is the kind of
    thing that is fine on a laptop and slow on the institute's connection.
  */
  const paths = assets.map((a) => mediaPath(a.key));
  const [topperUses, storyUses] = await Promise.all([
    prisma.topper.groupBy({
      by: ['photoUrl'],
      where: { photoUrl: { in: paths } },
      _count: { _all: true },
    }),
    prisma.studentStory.groupBy({
      by: ['photoUrl'],
      where: { photoUrl: { in: paths } },
      _count: { _all: true },
    }),
  ]);

  const useCount = new Map<string, number>();
  for (const row of [...topperUses, ...storyUses]) {
    if (!row.photoUrl) continue;
    useCount.set(row.photoUrl, (useCount.get(row.photoUrl) ?? 0) + row._count._all);
  }

  // Reported, not inferred: what storage actually holds versus what is recorded.
  const storedKeys = new Set(await getMediaStore().list().catch(() => []));

  return (
    <>
      <PageHeader
        title="Photos"
        description="Every photo uploaded to this website. Photos are attached to a student or story from that record's own page."
      />

      {!mediaStorageIsProductionReady() ? (
        <div className="mb-6">
          <Notice tone="warn" title="Photo storage is for testing only on this server">
            <p>
              Uploaded photos are kept on this machine&rsquo;s disk. That works
              here, but the live website runs on a host whose disk is wiped on
              every deployment, so photo storage has to be set up before the
              site goes live. Nothing you upload now will survive that step.
            </p>
          </Notice>
        </div>
      ) : null}

      {assets.length === 0 ? (
        <EmptyPanel
          title="No photos yet"
          description="Photos appear here once you add one to a student result or a story."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => {
            const path = mediaPath(asset.key);
            const uses = useCount.get(path) ?? 0;
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
                    {uses === 0
                      ? 'Not used anywhere'
                      : `Used by ${uses} ${uses === 1 ? 'record' : 'records'}`}
                  </p>
                  <DeleteMediaButton
                    mediaKey={asset.key}
                    name={asset.originalName}
                    inUse={uses > 0}
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
