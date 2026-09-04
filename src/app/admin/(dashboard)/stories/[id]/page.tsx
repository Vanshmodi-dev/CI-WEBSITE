import { notFound } from 'next/navigation';
import { editToken } from '@/lib/stale-edit';
import { requireAdmin } from '@/lib/auth';
import { getStory } from '@/lib/admin-data';
import { PageHeader, Card } from '@/components/admin/ui';
import { StoryForm } from '../story-form';
import { deleteStory } from '../actions';
import { DeleteButton } from '@/components/admin/delete-button';
import type { DisplayNameModeValue } from '@/lib/student-display';

export const dynamic = 'force-dynamic';

export default async function EditStoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const story = await getStory(id).catch(() => null);
  if (!story) notFound();

  return (
    <>
      <PageHeader
        back={{ href: '/admin/stories', label: 'Back to student stories' }}
        title="Edit story"
        description="Changes appear on the website within the hour."
      />

      <StoryForm
        values={{
          id: story.id,
          editedAt: editToken(story.updatedAt),
          studentName: story.studentName,
          displayNameMode: story.displayNameMode as DisplayNameModeValue,
          photoUrl: story.photoUrl ?? '',
          programme: story.programme,
          year: String(story.year),
          challenge: story.challenge,
          journey: story.journey,
          outcome: story.outcome,
          quote: story.quote ?? '',
          consentStory: story.consentStory,
          consentName: story.consentName,
          consentPhoto: story.consentPhoto,
          published: story.published,
        }}
      />

      <Card className="mt-10 max-w-3xl border-danger/30">
        <h2 className="font-display text-[16px] font-semibold text-heading">
          Delete this story
        </h2>
        <p className="mt-1 text-small text-muted">This cannot be undone.</p>
        <form action={deleteStory} className="mt-4">
          <input type="hidden" name="id" value={story.id} />
          <DeleteButton confirmMessage="Delete this story permanently?" />
        </form>
      </Card>
    </>
  );
}
