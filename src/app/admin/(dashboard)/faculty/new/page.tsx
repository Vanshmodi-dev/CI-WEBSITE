import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/admin/ui';
import { FacultyForm } from '../faculty-form';

export const metadata: Metadata = { title: 'Add a teacher' };
export const dynamic = 'force-dynamic';

export default async function NewFacultyPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Add a teacher"
        description="Nothing appears on the website until you tick “Show this teacher on the website”."
      />
      <FacultyForm />
    </>
  );
}
