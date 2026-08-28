import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/admin/ui';
import { BatchForm } from '../batch-form';

export const dynamic = 'force-dynamic';

export default async function NewBatchPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        back={{ href: '/admin/batches', label: 'Back to batches' }}
        title="Add a batch"
        description="It stays a draft until you tick the visibility box."
      />
      <BatchForm />
    </>
  );
}
