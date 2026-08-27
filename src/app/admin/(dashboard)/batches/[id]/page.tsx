import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getBatch } from '@/lib/admin-data';
import { PageHeader, Card } from '@/components/admin/ui';
import { editToken } from '@/lib/stale-edit';
import { BatchForm } from '../batch-form';
import { toDateInput } from '@/lib/admin-format';
import { deleteBatch } from '../actions';
import { DeleteButton } from '@/components/admin/delete-button';

export const dynamic = 'force-dynamic';

export default async function EditBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const batch = await getBatch(id).catch(() => null);
  if (!batch) notFound();

  return (
    <>
      <PageHeader
        title="Edit batch"
        description="Changes appear on the website within the hour."
      />

      <BatchForm
        values={{
          id: batch.id,
          courseSlug: batch.courseSlug,
          startsAt: toDateInput(batch.startsAt),
          mode: batch.mode,
          seatsNote: batch.seatsNote ?? '',
          published: batch.published,
          editedAt: editToken(batch.updatedAt),
        }}
      />

      <Card className="mt-10 max-w-2xl border-danger/30">
        <h2 className="font-display text-[16px] font-semibold text-heading">
          Delete this batch
        </h2>
        <p className="mt-1 text-small text-muted">This cannot be undone.</p>
        <form action={deleteBatch} className="mt-4">
          <input type="hidden" name="id" value={batch.id} />
          <DeleteButton confirmMessage="Delete this batch?" />
        </form>
      </Card>
    </>
  );
}
