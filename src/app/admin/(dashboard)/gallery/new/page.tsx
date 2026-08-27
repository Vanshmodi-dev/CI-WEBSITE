import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/admin/ui';
import { GalleryForm } from '../gallery-form';

export const metadata: Metadata = { title: 'Add a photograph' };
export const dynamic = 'force-dynamic';

export default async function NewGalleryItemPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Add a photograph"
        description="Nothing appears on the website until you tick “Show this photograph on the website”, and a photograph of a person also needs its permission recorded."
      />
      <GalleryForm />
    </>
  );
}
