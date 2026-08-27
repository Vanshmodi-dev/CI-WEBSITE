'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId, isSafePhotoPath } from '@/lib/validation';
import {
  EDIT_TOKEN_FIELD,
  STALE_EDIT_MESSAGE,
  isStaleEditError,
  parseEditToken,
} from '@/lib/stale-edit';
import { logUnexpected } from '@/lib/log';
import { revalidateStories } from '@/lib/revalidate-public';
import { blockersForPublishing } from '@/lib/student-display';

/**
 * Every id below is validated for SHAPE before it reaches Prisma.
 *
 * Prisma parameterises, so an unvalidated id was never an injection risk. What
 * it was is unbounded attacker-controlled input handed to the database: Phase
 * 10 posted a five-thousand-character id and a JSON object literal through
 * these forms and both reached Postgres before being rejected there. Checking
 * first stops the work at the edge and fails closed — an id we never issued
 * cannot select a row.
 */

export type StoryFormState = {
  status: 'idle' | 'error';
  message?: string;
  blockers?: string[];
  errors?: Partial<
    Record<
      | 'studentName'
      | 'slug'
      | 'challenge'
      | 'journey'
      | 'outcome'
      | 'year'
      | 'programme'
      | 'photoUrl',
      string
    >
  >;
  /**
   * What the teacher had typed when the save was refused.
   *
   * React resets a form once its action settles, so an uncontrolled input goes
   * back to its `defaultValue` even when the action returned an error and the
   * teacher is still looking at the form. Echoing the submitted values back
   * means that reset restores what they typed rather than what the record held
   * when the page opened. See the Topic 11 report, defect D-2.
   */
  values?: Record<string, string>;
};

const PROGRAMMES = ['CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CMA'] as const;
const NAME_MODES = ['INITIALS', 'FIRST_NAME_ONLY', 'FULL'] as const;

/**
 * Find a free slug, appending -2, -3 … on collision.
 *
 * Bounded so a pathological case cannot loop; after that it falls back to a
 * timestamp, which is ugly but always unique and never blocks the teacher.
 */
async function uniqueSlug(base: string): Promise<string> {
  const prisma = getPrisma();
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const clash = await prisma.studentStory.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now()}`;
}

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

  // Present but not an id we could have issued: refuse rather than fall through
  // to the create branch, which would silently duplicate the record.
  if (id.length > 0 && !isValidRecordId(id)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }
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
  /*
    ⚠ D5-1 — THIS CHECK WAS MISSING ENTIRELY UNTIL PHASE 16.

    `admin/students/actions.ts` has validated `photoUrl` with `isSafePhotoPath`
    since it was written. This action, saving the same kind of record with the
    same kind of field, did not: it accepted any 500-character string and wrote
    it straight to a column that the public story card renders through
    `next/image`.

    Nothing downstream compensated. `present()` in student-display.ts gates the
    photo on `consentPhoto` and never looks at the PATH, so a value like
    `https://someone-elses-server/track.gif` reached the public page - and since
    that host is not in `remotePatterns`, the optimiser throws and the whole
    /stories page fails to render. An admin-only write, but a stored one: it
    persists until somebody edits the record.

    Found by inventory at the start of Topic 5, fixed here, and pinned by a
    regression test.
  */
  if (photoUrl.length > 0 && !isSafePhotoPath(photoUrl)) {
    errors.photoUrl =
      'That does not look like a photo on this website. Use the Choose photo button.';
  }

  if (challenge.length < 10) errors.challenge = 'Describe what they found hard.';
  if (journey.length < 10) errors.journey = 'Describe how they worked on it.';
  if (outcome.length < 10) errors.outcome = 'Describe how it turned out.';

  if (Object.keys(errors).length > 0) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      errors,
      values: { programme: programmeRaw, year: yearRaw, challenge, journey, outcome, quote },
    };
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

  /**
   * The slug is UNIQUE in the database, and two students can genuinely share a
   * name and year — siblings, or simply a common name among a thousand
   * students. The collision surfaced as "we could not save this, please try
   * again", which is both wrong and unactionable: retrying never works.
   *
   * On EDIT the existing slug is kept. Regenerating it on every save would
   * change a record's identity because someone corrected a spelling.
   */
  let slug: string;
  if (id) {
    const existing = await getPrisma()
      .studentStory.findUnique({ where: { id }, select: { slug: true } })
      .catch(() => null);
    slug = existing?.slug ?? (slugify(`${studentName}-${year}`) || `story-${Date.now()}`);
  } else {
    slug = await uniqueSlug(slugify(`${studentName}-${year}`) || 'story');
  }

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
      /**
       * Lost-update guard. A story carries story consent, photo consent and a
       * publication state, so a form opened before a withdrawal must not be
       * able to write the old permissions back. Same defect and same fix as
       * the student form - see src/lib/stale-edit.ts.
       *
       * updateMany rather than update: it reports a count instead of throwing
       * a record-not-found, which is how a refused save is told apart from a
       * deleted record.
       */
      const expectedEditedAt = parseEditToken(formData.get(EDIT_TOKEN_FIELD));
      const applied = await prisma.studentStory.updateMany({
        // A missing token cannot prove the form saw the current row: fail closed.
        where: expectedEditedAt ? { id, updatedAt: expectedEditedAt } : { id, updatedAt: new Date(0) },
        data,
      });
      if (applied.count === 0) {
        return { status: 'error', message: STALE_EDIT_MESSAGE };
      }
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
    if (isStaleEditError(error)) {
      return { status: 'error', message: STALE_EDIT_MESSAGE };
    }
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
  if (!isValidRecordId(id)) redirect('/admin/stories');

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
