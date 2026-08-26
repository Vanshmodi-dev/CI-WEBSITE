import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId } from '@/lib/validation';
import { PageHeader } from '@/components/admin/ui';
import { editToken } from '@/lib/stale-edit';
import { FacultyForm } from '../faculty-form';

export const metadata: Metadata = { title: 'Edit teacher' };
export const dynamic = 'force-dynamic';

export default async function EditFacultyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  // Shape first: an id we never issued cannot select a row, and stopping at the
  // edge keeps unbounded attacker input away from the database.
  if (!isValidRecordId(id)) notFound();

  const record = await getPrisma().faculty.findUnique({ where: { id } });
  if (!record) notFound();

  return (
    <>
      <PageHeader
        title="Edit teacher"
        description={record.published
          ? 'This teacher is currently shown on the website.'
          : 'This teacher is not shown on the website yet.'}
      />
      <FacultyForm
        values={{
          id: record.id,
          name: record.name,
          designation: record.designation,
          subject: record.subject ?? '',
          bio: record.bio ?? '',
          photoUrl: record.photoUrl ?? '',
          priority: record.priority,
          published: record.published,
          editedAt: editToken(record.updatedAt),
        }}
      />
    </>
  );
}
