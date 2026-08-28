import { notFound } from 'next/navigation';
import { editToken } from '@/lib/stale-edit';
import { requireAdmin } from '@/lib/auth';
import { getTopper } from '@/lib/admin-data';
import { PageHeader, Card } from '@/components/admin/ui';
import { StudentForm } from '../student-form';
import { unpublishStudentResult, deleteStudentResult } from '../actions';
import { DeleteButton } from '@/components/admin/delete-button';
import type { DisplayNameModeValue } from '@/lib/student-display';

export const dynamic = 'force-dynamic';

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const record = await getTopper(id).catch(() => null);
  if (!record) notFound();

  return (
    <>
      <PageHeader
        back={{ href: '/admin/students', label: 'Back to students & results' }}
        title="Edit result"
        description="Changes appear on the website within the hour."
      />

      <StudentForm
        values={{
          id: record.id,
          editedAt: editToken(record.updatedAt),
          studentName: record.studentName,
          displayNameMode: record.displayNameMode as DisplayNameModeValue,
          photoUrl: record.photoUrl ?? '',
          score: String(record.score),
          scoreUnit: record.scoreUnit,
          programme: record.programme,
          board: record.board ?? '',
          year: String(record.year),
          highlight: record.highlight ?? '',
          consentRef: record.consentRef ?? '',
          consentResult: record.consentResult,
          consentName: record.consentName,
          consentPhoto: record.consentPhoto,
          published: record.published,
          subjects: record.subjectScores.map((s) => ({
            subject: s.subject,
            score: String(s.score),
          })),
        }}
      />

      {record.published ? (
        <Card className="mt-10 max-w-3xl">
          <h2 className="font-display text-[16px] font-semibold text-heading">
            Take this off the website
          </h2>
          <p className="mt-1 text-small text-muted">
            The record is kept. It just stops being shown to visitors. Use this
            if a student or parent asks you to remove it.
          </p>
          <form action={unpublishStudentResult} className="mt-4">
            <input type="hidden" name="id" value={record.id} />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-sm border border-rule px-4 text-small font-medium text-text transition-colors hover:bg-surface"
            >
              Hide from website
            </button>
          </form>
        </Card>
      ) : null}

      <Card className="mt-6 max-w-3xl border-danger/30">
        <h2 className="font-display text-[16px] font-semibold text-heading">
          Delete this result
        </h2>
        <p className="mt-1 text-small text-muted">
          This removes it permanently and cannot be undone.
        </p>
        <form action={deleteStudentResult} className="mt-4">
          <input type="hidden" name="id" value={record.id} />
          <DeleteButton confirmMessage="Delete this result permanently?" />
        </form>
      </Card>
    </>
  );
}
