import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/admin/ui';
import { VideoForm } from '../video-form';

export const metadata: Metadata = { title: 'Add a video' };
export const dynamic = 'force-dynamic';

export default async function NewVideoPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        back={{ href: '/admin/videos', label: 'Back to videos' }}
        title="Add a video"
        description="Nothing appears on the website until you tick “Show this video on the website”."
      />
      <VideoForm />
    </>
  );
}
