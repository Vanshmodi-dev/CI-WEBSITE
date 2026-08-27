import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getAnnouncement } from '@/lib/admin-data';
import { PageHeader, Card } from '@/components/admin/ui';
import { editToken } from '@/lib/stale-edit';
import { AnnouncementForm } from '../announcement-form';
import { toDateInput } from '@/lib/admin-format';
import { deleteAnnouncement } from '../actions';
import { DeleteButton } from '@/components/admin/delete-button';

export const dynamic = 'force-dynamic';

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const announcement = await getAnnouncement(id).catch(() => null);
  if (!announcement) notFound();

  return (
    <>
      <PageHeader
        title="Edit announcement"
        description="Changes appear on the website within the hour."
      />

      <AnnouncementForm
        values={{
          id: announcement.id,
          message: announcement.message,
          href: announcement.href ?? '',
          startsAt: toDateInput(announcement.startsAt),
          endsAt: toDateInput(announcement.endsAt),
          published: announcement.published,
          editedAt: editToken(announcement.updatedAt),
        }}
      />

      <Card className="mt-10 max-w-2xl border-danger/30">
        <h2 className="font-display text-[16px] font-semibold text-heading">
          Delete this announcement
        </h2>
        <p className="mt-1 text-small text-muted">This cannot be undone.</p>
        <form action={deleteAnnouncement} className="mt-4">
          <input type="hidden" name="id" value={announcement.id} />
          <DeleteButton confirmMessage="Delete this announcement?" />
        </form>
      </Card>
    </>
  );
}
