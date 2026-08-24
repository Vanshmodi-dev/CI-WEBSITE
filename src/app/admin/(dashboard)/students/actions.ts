'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { logUnexpected } from '@/lib/log';
import { revalidateResults } from '@/lib/revalidate-public';
import { blockersForPublishing } from '@/lib/student-display';
import { isSafePhotoPath, isValidRecordId } from '@/lib/validation';

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

export type StudentFormState = {
  status: 'idle' | 'error';
  message?: string;
  /** Plain-language reasons publishing is not allowed yet. */
  blockers?: string[];
  errors?: Partial<
    Record<'studentName' | 'score' | 'year' | 'programme' | 'photoUrl', string>
  >;
};

const PROGRAMMES = [
  'CLASS_11',
  'CLASS_12',
  'CA_FOUNDATION',
  'CA_INTERMEDIATE',
  'CMA',
] as const;
const BOARDS = ['CBSE', 'RBSE', 'ICAI', 'OTHER'] as const;
const NAME_MODES = ['INITIALS', 'FIRST_NAME_ONLY', 'FULL'] as const;
const UNITS = ['percent', 'marks'] as const;

/** Subject rows arrive as parallel `subject[]` / `subjectScore[]` fields. */
function readSubjectScores(formData: FormData) {
  const names = formData.getAll('subjectName').map((v) => String(v).trim().slice(0, 60));
  const scores = formData.getAll('subjectScore').map((v) => String(v).trim());

  const rows: Array<{ subject: string; score: number }> = [];
  for (let i = 0; i < names.length; i += 1) {
    const subject = names[i] ?? '';
    const raw = scores[i] ?? '';
    if (subject.length === 0 && raw.length === 0) continue; // blank row
    const score = Number(raw);
    if (subject.length === 0 || !Number.isFinite(score) || score < 0 || score > 9999) {
      continue; // a half-filled row is dropped, never guessed at
    }
    rows.push({ subject, score });
  }
  return rows.slice(0, 15);
}

/**
 * Save a student result.
 *
 * PUBLISHING IS GATED HERE, in the mutation — not merely in the form. The
 * database CHECK constraints are the last line of defence, but a teacher must
 * never meet one: a constraint violation would surface as an unexplained
 * failure. So we compute the same blockers the form shows and refuse early,
 * with words that say what to do next.
 */
export async function saveStudentResult(
  _prev: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const id = String(formData.get('id') ?? '').trim();
  const studentName = String(formData.get('studentName') ?? '').trim().slice(0, 120);
  const programmeRaw = String(formData.get('programme') ?? '');
  const boardRaw = String(formData.get('board') ?? '');
  const displayNameModeRaw = String(formData.get('displayNameMode') ?? 'INITIALS');
  const scoreUnitRaw = String(formData.get('scoreUnit') ?? 'percent');
  const scoreRaw = String(formData.get('score') ?? '').trim();
  const yearRaw = String(formData.get('year') ?? '').trim();
  const highlight = String(formData.get('highlight') ?? '').trim().slice(0, 160);
  const photoUrl = String(formData.get('photoUrl') ?? '').trim().slice(0, 500);
  const consentRef = String(formData.get('consentRef') ?? '').trim().slice(0, 200);

  const consentResult = formData.get('consentResult') === 'on';
  const consentName = formData.get('consentName') === 'on';
  const consentPhoto = formData.get('consentPhoto') === 'on';
  const published = formData.get('published') === 'on';

  // Present but not an id we could have issued: refuse rather than fall
  // through to the create branch, which would silently duplicate the record.
  if (id.length > 0 && !isValidRecordId(id)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }

  const errors: NonNullable<StudentFormState['errors']> = {};

  if (studentName.length < 2) errors.studentName = "Enter the student's name.";
  if (!PROGRAMMES.includes(programmeRaw as (typeof PROGRAMMES)[number])) {
    errors.programme = 'Choose the course.';
  }

  const score = Number(scoreRaw);
  const scoreUnit = UNITS.includes(scoreUnitRaw as (typeof UNITS)[number])
    ? (scoreUnitRaw as (typeof UNITS)[number])
    : 'percent';
  if (!Number.isFinite(score) || score < 0 || score > 9999) {
    errors.score = 'Enter the result as a number.';
  } else if (scoreUnit === 'percent' && score > 100) {
    errors.score = 'A percentage cannot be more than 100.';
  }

  const year = Number(yearRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    errors.year = 'Enter the year, for example 2026.';
  }

  // The photo path is admin-supplied but still untrusted. `startsWith('/')`
  // alone would accept "/../../etc/passwd" and protocol-relative "//evil.com".
  if (photoUrl.length > 0 && !isSafePhotoPath(photoUrl)) {
    errors.photoUrl =
      'Use a photo already on this website, for example /photos/name.jpg';
  }

  if (Object.keys(errors).length > 0) {
    return { status: 'error', message: 'Please check the highlighted fields.', errors };
  }

  const displayNameMode = NAME_MODES.includes(
    displayNameModeRaw as (typeof NAME_MODES)[number],
  )
    ? (displayNameModeRaw as (typeof NAME_MODES)[number])
    : 'INITIALS';

  // The publishing gate — same rules the form displayed.
  if (published) {
    const blockers = blockersForPublishing({
      studentName,
      displayNameMode,
      photoUrl: photoUrl.length > 0 ? photoUrl : null,
      consentRef: consentRef.length > 0 ? consentRef : null,
      consentResult,
      consentName,
      consentPhoto,
      published: true,
    });
    if (blockers.length > 0) {
      return {
        status: 'error',
        message: 'This cannot be shown on the website yet.',
        blockers,
      };
    }
  }

  const data = {
    studentName,
    displayNameMode,
    photoUrl: photoUrl.length > 0 ? photoUrl : null,
    score,
    scoreUnit,
    programme: programmeRaw as (typeof PROGRAMMES)[number],
    board: BOARDS.includes(boardRaw as (typeof BOARDS)[number])
      ? (boardRaw as (typeof BOARDS)[number])
      : null,
    year,
    highlight: highlight.length > 0 ? highlight : null,
    consentRef: consentRef.length > 0 ? consentRef : null,
    consentResult,
    consentName,
    consentPhoto,
    published,
    publishedAt: published ? new Date() : null,
  };

  const subjects = readSubjectScores(formData);

  try {
    const prisma = getPrisma();
    if (id) {
      // Replace-in-transaction: the subject list the teacher sees is the list
      // that ends up stored, and a partial write cannot leave stale rows.
      await prisma.$transaction([
        prisma.topper.update({ where: { id }, data }),
        prisma.subjectScore.deleteMany({ where: { topperId: id } }),
        ...(subjects.length > 0
          ? [prisma.subjectScore.createMany({
              data: subjects.map((s) => ({ ...s, topperId: id })),
            })]
          : []),
      ]);
      // The audit records the ACTION, never the student's name or marks.
      await recordAudit(
        admin,
        published ? 'published' : 'updated',
        'Topper',
        id,
        `${data.programme} ${data.year}`,
      );
    } else {
      const created = await prisma.topper.create({
        data: {
          ...data,
          ...(subjects.length > 0 ? { subjectScores: { create: subjects } } : {}),
        },
        select: { id: true },
      });
      await recordAudit(
        admin,
        published ? 'published' : 'created',
        'Topper',
        created.id,
        `${data.programme} ${data.year}`,
      );
    }
  } catch (error) {
    logUnexpected('admin.student.save_failed', error);
    return {
      status: 'error',
      message: 'We could not save this right now. Please try again.',
    };
  }

  revalidatePath('/admin/students');
  revalidatePath('/admin');
  revalidateResults();
  redirect('/admin/students?saved=1');
}

/** Take a published result off the website. Always allowed. */
export async function unpublishStudentResult(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!isValidRecordId(id)) redirect('/admin/students');

  try {
    await getPrisma().topper.update({
      where: { id },
      data: { published: false, publishedAt: null },
    });
    await recordAudit(admin, 'unpublished', 'Topper', id);
  } catch (error) {
    logUnexpected('admin.student.unpublish_failed', error);
    redirect('/admin/students?error=1');
  }

  revalidatePath('/admin/students');
  revalidatePath('/admin');
  revalidateResults();
  redirect('/admin/students?hidden=1');
}

export async function deleteStudentResult(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!isValidRecordId(id)) redirect('/admin/students');

  try {
    await getPrisma().topper.delete({ where: { id } });
    await recordAudit(admin, 'deleted', 'Topper', id);
  } catch (error) {
    logUnexpected('admin.student.delete_failed', error);
    redirect('/admin/students?error=1');
  }

  revalidatePath('/admin/students');
  revalidatePath('/admin');
  revalidateResults();
  redirect('/admin/students?deleted=1');
}
