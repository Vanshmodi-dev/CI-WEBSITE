'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { logUnexpected, log } from '@/lib/log';
import { revalidateResults } from '@/lib/revalidate-public';
import { peekWindow, recordWindowHit } from '@/lib/rate-limit';
import { checkUpload, displayFilename, planImport, executeImport } from '@/lib/import/run';
import type { ImportPlan } from '@/lib/import/plan';

/**
 * Import actions.
 *
 * TWO SEPARATE ACTIONS, NOT ONE WITH A FLAG. Checking a file and importing it
 * are different operations with different consequences, so they are different
 * endpoints. A bug in the check can never write; a mistaken click on the check
 * button can never publish anything.
 *
 * Both re-authorise inside the action. Phase 10's lesson holds: a Server Action
 * is an HTTP endpoint, and the page guard is a convenience.
 */

export type ImportState = {
  status: 'idle' | 'checked' | 'imported' | 'error';
  message?: string;
  filename?: string;
  /** Present once a file has been checked; required to confirm. */
  digest?: string;
  plan?: SerialisablePlan;
  imported?: { created: number; updated: number; durationMs: number };
};

/** What the review screen needs. Deliberately not the whole plan. */
export type SerialisablePlan = {
  rowsTotal: number;
  createCount: number;
  updateCount: number;
  updatesToLiveRecords: number;
  wouldBecomePublic: number;
  problems: Array<{ line: number; column: string; problem: string; expected: string }>;
  preview: Array<{
    importRef: string;
    studentName: string;
    publishedNow: boolean;
    resultVisible: boolean;
    nameShown: string | null;
    photoShown: boolean;
    reasons: string[];
  }>;
  previewTruncated: number;
};

/** How many problems and preview rows travel back to the browser. */
const MAX_PROBLEMS_SHOWN = 200;
const MAX_PREVIEW_SHOWN = 100;

function serialise(plan: ImportPlan): SerialisablePlan {
  return {
    rowsTotal: plan.rowsTotal,
    createCount: plan.creates.length,
    updateCount: plan.updates.length,
    updatesToLiveRecords: plan.updatesToLiveRecords,
    wouldBecomePublic: plan.wouldBecomePublic,
    problems: plan.problems.slice(0, MAX_PROBLEMS_SHOWN),
    preview: plan.preview.slice(0, MAX_PREVIEW_SHOWN),
    previewTruncated: Math.max(0, plan.preview.length - MAX_PREVIEW_SHOWN),
  };
}

/**
 * How many files may be uploaded, and over what period.
 *
 * Parsing is the most expensive thing an authenticated user can ask of this
 * application, so it is bounded. But the shape of the limit matters as much as
 * the number: the real workflow is check, fix a typo, check again, and a
 * teacher will do that five or six times on a first import.
 *
 * This deliberately does NOT reuse the enquiry burst limit. That one is three
 * per minute, sized for anonymous strangers posting a contact form, and Phase
 * 12 hit it on the fourth check - which is roughly where a teacher would have
 * hit it too. Twenty per five minutes still bounds a loop of 2 MB uploads to
 * something that costs the sender time, while never interrupting the person the
 * feature exists for.
 */
const IMPORT_WINDOW = { max: 20, windowMs: 5 * 60_000 } as const;

/**
 * Read the uploaded file.
 *
 * Bounded before anything is decoded, and rate limited per administrator.
 */
async function readUpload(
  formData: FormData,
  adminId: string,
): Promise<{ ok: true; text: string; filename: string } | { ok: false; message: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose a CSV file first.' };
  }

  const limitKey = `import:${adminId}`;
  const verdict = peekWindow(limitKey, IMPORT_WINDOW);
  if (!verdict.allowed) {
    const minutes = Math.max(1, Math.ceil(verdict.retryAfterMs / 60_000));
    return {
      ok: false,
      message: `That is a lot of uploads in a short time. Please wait about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and try again.`,
    };
  }
  recordWindowHit(limitKey, IMPORT_WINDOW);

  const rejection = checkUpload({ name: file.name, size: file.size, type: file.type });
  if (rejection) return { ok: false, message: rejection.message };

  try {
    // The file never touches the filesystem. It is decoded, planned, and
    // dropped when this function returns.
    const text = await file.text();
    return { ok: true, text, filename: displayFilename(file.name) };
  } catch (error) {
    logUnexpected('import.read_failed', error);
    return { ok: false, message: 'That file could not be read. Save it as CSV and try again.' };
  }
}

/** Check a file. WRITES NOTHING. */
export async function checkImportFile(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const upload = await readUpload(formData, admin.id);
  if (!upload.ok) return { status: 'error', message: upload.message };

  const outcome = await planImport(upload.text);
  if (!outcome.ok) {
    return { status: 'error', message: outcome.message, filename: upload.filename };
  }

  log.info('import.checked', {
    rows: outcome.plan.rowsTotal,
    problems: outcome.plan.problems.length,
  });

  return {
    status: 'checked',
    filename: upload.filename,
    digest: outcome.digest,
    plan: serialise(outcome.plan),
    message: outcome.plan.ok
      ? undefined
      : 'Some rows need attention. Nothing has been imported.',
  };
}

/**
 * Import a file that has already been checked.
 *
 * The file is uploaded again and re-planned from scratch. The digest the
 * teacher reviewed is submitted alongside it, and the two must match — so
 * approving one file and importing a different one is not possible, and no
 * uploaded spreadsheet ever waits on a server between the two clicks.
 */
export async function confirmImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const approvedDigest = String(formData.get('digest') ?? '');
  if (!/^[0-9a-f]{64}$/.test(approvedDigest)) {
    return { status: 'error', message: 'Please check the file again before importing.' };
  }

  const upload = await readUpload(formData, admin.id);
  if (!upload.ok) return { status: 'error', message: upload.message };

  const outcome = await planImport(upload.text);
  if (!outcome.ok) return { status: 'error', message: outcome.message, filename: upload.filename };

  if (outcome.digest !== approvedDigest) {
    return {
      status: 'error',
      filename: upload.filename,
      digest: outcome.digest,
      plan: serialise(outcome.plan),
      message:
        'This file is not the one that was checked. It has been checked again above - review it, then import.',
    };
  }

  if (!outcome.plan.ok) {
    return {
      status: 'error',
      filename: upload.filename,
      digest: outcome.digest,
      plan: serialise(outcome.plan),
      message: 'Some rows still need attention. Nothing has been imported.',
    };
  }

  const result = await executeImport(outcome.plan);
  if (!result.ok) {
    return { status: 'error', message: result.message, filename: upload.filename };
  }

  // Record what happened. Metadata only: no row of the spreadsheet is stored.
  try {
    const run = await getPrisma().importRun.create({
      data: {
        actorId: admin.id,
        actorLabel: admin.displayName,
        filename: upload.filename,
        planDigest: approvedDigest,
        rowsTotal: outcome.plan.rowsTotal,
        rowsCreated: result.created,
        rowsUpdated: result.updated,
        rowsRejected: outcome.plan.problems.length,
        madePublic: result.madePublic,
        durationMs: result.durationMs,
      },
      select: { id: true },
    });
    await recordAudit(
      admin,
      'imported',
      'ImportRun',
      run.id,
      `${result.created} added, ${result.updated} corrected`,
    );
  } catch (error) {
    // The import already committed. Failing to write its history entry must not
    // be reported as a failed import, or the teacher will run it again.
    logUnexpected('import.history_failed', error);
  }

  revalidatePath('/admin/data');
  revalidatePath('/admin/students');
  revalidatePath('/admin');
  // An import cannot publish anything, so nothing public can have changed. The
  // results pages are refreshed anyway because a CORRECTION to a record that is
  // already live does change what a visitor reads.
  revalidateResults();

  return {
    status: 'imported',
    filename: upload.filename,
    imported: { created: result.created, updated: result.updated, durationMs: result.durationMs },
    message: `Imported. ${result.created} added, ${result.updated} corrected, nothing published.`,
  };
}
