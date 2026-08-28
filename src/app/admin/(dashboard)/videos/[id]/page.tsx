import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId } from '@/lib/validation';
import { PageHeader } from '@/components/admin/ui';
import { editToken } from '@/lib/stale-edit';
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
    </>
  );
}
