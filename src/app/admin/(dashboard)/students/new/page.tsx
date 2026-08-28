import { requireAdmin } from '@/lib/auth';
import { PageHeader, Notice } from '@/components/admin/ui';
import { StudentForm } from '../student-form';

export const dynamic = 'force-dynamic';

export default async function NewStudentPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        back={{ href: '/admin/students', label: 'Back to students & results' }}
        title="Add a result"
        description="Nothing here appears on the website until you confirm the permissions."
      />
      <div className="mb-6 max-w-3xl">
        <Notice tone="info" title="Before you publish a student">
          Only tick a permission if the student or their parent has agreed to it
          in writing, and keep that form on file. If you are unsure, save it as
          a draft — you can publish later.
        </Notice>
      </div>
      <StudentForm />
    </>
  );
}
