'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { logUnexpected } from '@/lib/log';
import { revalidateStories } from '@/lib/revalidate-public';
import { blockersForPublishing } from '@/lib/student-display';

export type StoryFormState = {
  status: 'idle' | 'error';
  message?: string;
  blockers?: string[];
  errors?: Partial<
    Record<'studentName' | 'slug' | 'challenge' | 'journey' | 'outcome' | 'year' | 'programme', string>
  >;
};

const PROGRAMMES = ['CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CMA'] as const;
const NAME_MODES = ['INITIALS', 'FIRST_NAME_ONLY', 'FULL'] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export async function saveStory(
  _prev: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const id = String(formData.get('id') ?? '').trim();
  const studentName = String(formData.get('studentName') ?? '').trim().slice(0, 120);
  const programmeRaw = String(formData.get('programme') ?? '');
  const yearRaw = String(formData.get('year') ?? '').trim();
  const challenge = String(formData.get('challenge') ?? '').trim().slice(0, 2000);
  const journey = String(formData.get('journey') ?? '').trim().slice(0, 4000);
  const outcome = String(formData.get('outcome') ?? '').trim().slice(0, 2000);
  const quote = String(formData.get('quote') ?? '').trim().slice(0, 600);
  const photoUrl = String(formData.get('photoUrl') ?? '').trim().slice(0, 500);
  const consentRef = String(formData.get('consentRef') ?? '').trim().slice(0, 200);
  const displayNameModeRaw = String(formData.get('displayNameMode') ?? 'INITIALS');

  const consentStory = formData.get('consentStory') === 'on';
  const consentName = formData.get('consentName') === 'on';
  const consentPhoto = formData.get('consentPhoto') === 'on';
  const published = formData.get('published') === 'on';

  const errors: NonNullable<StoryFormState['errors']> = {};
  if (studentName.length < 2) errors.studentName = "Enter the student's name.";
  if (!PROGRAMMES.includes(programmeRaw as (typeof PROGRAMMES)[number])) {
    errors.programme = 'Choose the course.';
  }
  const year = Number(yearRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    errors.year = 'Enter the year, for example 2026.';
  }
  if (challenge.length < 10) errors.challenge = 'Describe what they found hard.';
  if (journey.length < 10) errors.journey = 'Describe how they worked on it.';
  if (outcome.length < 10) errors.outcome = 'Describe how it turned out.';

  if (Object.keys(errors).length > 0) {
    return { status: 'error', message: 'Please check the highlighted fields.', errors };
  }

  const displayNameMode = NAME_MODES.includes(
    displayNameModeRaw as (typeof NAME_MODES)[number],
  )
    ? (displayNameModeRaw as (typeof NAME_MODES)[number])
    : 'INITIALS';

  if (published) {
    const blockers = blockersForPublishing(
      {
        studentName,
        displayNameMode,
        photoUrl: photoUrl.length > 0 ? photoUrl : null,
        consentRef: consentRef.length > 0 ? consentRef : null,
        consentStory,
        consentName,
        consentPhoto,
        published: true,
      },
      'consentStory',
    );
    if (blockers.length > 0) {
      return {
        status: 'error',
        message: 'This story cannot be shown on the website yet.',
        blockers,
      };
    }
  }

  const slug = slugify(`${studentName}-${year}`) || `story-${Date.now()}`;

  const data = {
    slug,
    studentName,
    displayNameMode,
    photoUrl: photoUrl.length > 0 ? photoUrl : null,
    programme: programmeRaw as (typeof PROGRAMMES)[number],
    year,
    challenge,
    journey,
    outcome,
    quote: quote.length > 0 ? quote : null,
    consentRef: consentRef.length > 0 ? consentRef : null,
    consentStory,
    consentName,
    consentPhoto,
    published,
    publishedAt: published ? new Date() : null,
  };

  try {
    const prisma = getPrisma();
    if (id) {
      await prisma.studentStory.update({ where: { id }, data });
      await recordAudit(
        admin,
        published ? 'published' : 'updated',
        'StudentStory',
        id,
        `${data.programme} ${data.year}`,
      );
    } else {
      const created = await prisma.studentStory.create({
        data,
        select: { id: true },
      });
      await recordAudit(
        admin,
        published ? 'published' : 'created',
        'StudentStory',
        created.id,
        `${data.programme} ${data.year}`,
      );
    }
  } catch (error) {
    logUnexpected('admin.story.save_failed', error);
    return {
      status: 'error',
      message: 'We could not save this right now. Please try again.',
    };
  }

  revalidatePath('/admin/stories');
  revalidateStories();
  redirect('/admin/stories?saved=1');
}

export async function deleteStory(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/admin/stories');

  try {
    await getPrisma().studentStory.delete({ where: { id } });
    await recordAudit(admin, 'deleted', 'StudentStory', id);
  } catch (error) {
    logUnexpected('admin.story.delete_failed', error);
    redirect('/admin/stories?error=1');
  }

  revalidatePath('/admin/stories');
  revalidateStories();
  redirect('/admin/stories?deleted=1');
}
