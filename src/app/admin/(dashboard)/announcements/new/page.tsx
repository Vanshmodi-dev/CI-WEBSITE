import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/admin/ui';
import { AnnouncementForm } from '../announcement-form';

export const dynamic = 'force-dynamic';

export default async function NewAnnouncementPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="New announcement"
        description="It stays a draft until you tick the visibility box."
      />
      <AnnouncementForm />
    </>
  );
}
