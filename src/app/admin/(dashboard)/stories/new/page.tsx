import { requireAdmin } from '@/lib/auth';
import { PageHeader, Notice } from '@/components/admin/ui';
import { StoryForm } from '../story-form';

export const dynamic = 'force-dynamic';

export default async function NewStoryPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        back={{ href: '/admin/stories', label: 'Back to student stories' }}
        title="Add a story"
        description="Nothing here appears on the website until you confirm the permissions."
      />
      <div className="mb-6 max-w-3xl">
        <Notice tone="info" title="A story needs its own permission">
          Agreeing to have a result published is not the same as agreeing to a
          written story, and neither one includes a photograph. Ask separately,
          and keep the signed form on file.
        </Notice>
      </div>
      <StoryForm />
    </>
  );
}
