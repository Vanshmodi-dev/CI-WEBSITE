import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId } from '@/lib/validation';
import { PageHeader } from '@/components/admin/ui';
import { editToken } from '@/lib/stale-edit';
import { describeVisibility, type GalleryCategoryValue } from '@/lib/gallery';
import { GalleryForm } from '../gallery-form';

export const metadata: Metadata = { title: 'Edit photograph' };
export const dynamic = 'force-dynamic';

export default async function EditGalleryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  // Shape first: an id we never issued cannot select a row, and stopping at the
  // edge keeps unbounded attacker input away from the database.
  if (!isValidRecordId(id)) notFound();

  const record = await getPrisma().galleryItem.findUnique({ where: { id } });
  if (!record) notFound();

  /*
    The heading states the CURRENT visibility, computed by the same function the
    public page filters on rather than by reading `published`. A record can be
    marked published and still not be showing, and a teacher opening the form to
    find out why should not be told the opposite of what the website does.
  */
  const visibility = describeVisibility(record);

  return (
    <>
      <PageHeader title="Edit photograph" description={visibility.summary} />
      <GalleryForm
        values={{
          id: record.id,
          imageUrl: record.imageUrl,
          alt: record.alt,
          caption: record.caption ?? '',
          category: record.category as GalleryCategoryValue,
          priority: record.priority,
          published: record.published,
          showsPeople: record.showsPeople,
          consentRef: record.consentRef ?? '',
          consentPhoto: record.consentPhoto,
          editedAt: editToken(record.updatedAt),
        }}
      />
    </>
  );
}
