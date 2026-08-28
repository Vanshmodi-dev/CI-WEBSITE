import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId } from '@/lib/validation';
import { PageHeader, Card } from '@/components/admin/ui';
import { editToken } from '@/lib/stale-edit';
import { DeleteButton } from '@/components/admin/delete-button';
import { deleteVideo } from '../actions';
import { watchUrl, type VideoSubjectValue } from '@/lib/video';
import { VideoForm } from '../video-form';

export const metadata: Metadata = { title: 'Edit video' };
export const dynamic = 'force-dynamic';

export default async function EditVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  // Shape first: an id we never issued cannot select a row, and stopping at the
  // edge keeps unbounded attacker input away from the database.
  if (!isValidRecordId(id)) notFound();

  const record = await getPrisma().video.findUnique({ where: { id } });
  if (!record) notFound();

  return (
    <>
      <PageHeader
        back={{ href: '/admin/videos', label: 'Back to videos' }}
        title="Edit video"
        description={
          record.published
            ? 'This video is currently shown on the website.'
            : 'This video is not shown on the website yet.'
        }
      />
      <VideoForm
        values={{
          id: record.id,
          /*
            The stored ID is handed back as a canonical watch URL rather than as
            eleven bare characters. The field asks for a link, so it should
            contain one — and the parser accepts both, so a teacher can leave it
            alone or paste a new link over it.
          */
          youtubeUrl: watchUrl(record.youtubeId),
          title: record.title,
          description: record.description ?? '',
          subject: record.subject as VideoSubjectValue,
          priority: record.priority,
          published: record.published,
          editedAt: editToken(record.updatedAt),
        }}
      />

      {/*
        DELETE LIVES ON THE RECORD'S OWN PAGE, FOR EVERY ENTITY.

        Phase 16 Topic 11 unified what Delete DOES - it found three different
        confirmation behaviours and gave every entity the same two-step control.
        It never asked where the control LIVES, and the answer was split by
        whichever phase happened to build the page: results, stories, batches
        and announcements offered it on the edit page; faculty, gallery and
        videos only in a row on the list.

        Nothing anywhere recorded a reason, so it was an accident rather than a
        decision - the same shape as the confirmation split, and it survived the
        phase whose whole job was consistency. An owner who learns "open the
        record, scroll down, delete" now finds that true everywhere.

        The list-page control stays. It is the same two-step control, it is
        useful for tidying several at once, and taking away a shortcut people
        may already rely on would be a change with no argument behind it.
      */}
      <Card className="mt-10 max-w-2xl border-danger/30">
        <h2 className="font-display text-[16px] font-semibold text-heading">
          Delete this video
        </h2>
        <p className="measure mt-1 text-small text-muted">
          The video disappears from the website immediately. Nothing on YouTube is touched. This cannot be undone.
        </p>
        <form action={deleteVideo} className="mt-4">
          <input type="hidden" name="id" value={record.id} />
          <DeleteButton confirmMessage="Delete this video?" />
        </form>
      </Card>
    </>
  );
}
