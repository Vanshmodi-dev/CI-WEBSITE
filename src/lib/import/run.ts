import 'server-only';

import { createHash } from 'node:crypto';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { logUnexpected, log } from '@/lib/log';
import { parseCsv, CSV_LIMITS } from '@/lib/csv';
import { buildPlan, type ImportPlan, type ExistingRecord, type PlannedRecord } from '@/lib/import/plan';

/**
 * Reading the file, planning the import, and — only on a second, explicit
 * request — writing it.
 *
 * SERVER ONLY. The parser and planner are pure and live elsewhere; this is the
 * layer that touches the database, and it is deliberately thin.
 */

/* ------------------------------------------------------ upload limits ----- */

/**
 * Control characters, for stripping out of an uploaded filename.
 *
 * Built from escapes rather than typed as literals, for the same reason as the
 * digest separators below: an invisible byte in source is a byte nobody can
 * review.
 */
const CONTROL_CHARACTERS = new RegExp('[\u0000-\u001F\u007F]', 'g');

/**
 * Bounds on the upload itself, derived from the expected scale.
 *
 * A 1,000-row results file with every column filled is roughly 200 KB. 2 MB is
 * ten times that, which leaves room for a teacher who pastes in extra columns
 * without leaving room for a file that is trying to exhaust memory. The row and
 * cell bounds live in `CSV_LIMITS` and are enforced during parsing rather than
 * after, so a hostile file stops being read at the point it goes too far.
 *
 * KEEP THIS BELOW `serverActions.bodySizeLimit` IN next.config.ts. Whichever
 * limit is lower is the one the teacher meets, and only this one produces a
 * sentence they can act on. Phase 12 had them the wrong way round and a 1.5 MB
 * upload answered 500.
 */

export const UPLOAD_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  /** Extensions we will look at. Content is what actually decides. */
  extensions: ['.csv', '.txt'] as const,
} as const;

export type UploadRejection = { ok: false; message: string };

/**
 * Accept or refuse an uploaded file BEFORE reading it.
 *
 * The filename is never trusted and never used as a path — it is a label shown
 * back to the teacher and stored for the history, nothing more. The extension
 * check is a courtesy that produces a better error message; the real decision
 * is whether the bytes parse as the template.
 */
export function checkUpload(file: { name: string; size: number; type: string }): UploadRejection | null {
  if (file.size === 0) return { ok: false, message: 'That file is empty.' };
  if (file.size > UPLOAD_LIMITS.maxBytes) {
    return {
      ok: false,
      message: `That file is larger than ${Math.round(UPLOAD_LIMITS.maxBytes / 1024 / 1024)} MB. Split it into smaller files.`,
    };
  }

  const lower = file.name.toLowerCase();
  const looksAccepted = UPLOAD_LIMITS.extensions.some((ext) => lower.endsWith(ext));
  if (!looksAccepted) {
    // Named specifically, because this is the mistake a teacher will actually
    // make: exporting .xlsx out of habit.
    const isSpreadsheet = /\.(xlsx|xls|xlsm|ods|numbers)$/.test(lower);
    return {
      ok: false,
      message: isSpreadsheet
        ? 'This system reads CSV files. In your spreadsheet choose File, then Save As, then CSV, and upload that.'
        : 'Only CSV files can be uploaded. Save your spreadsheet as CSV and try again.',
    };
  }
  return null;
}

/**
 * A display-safe version of the uploaded filename.
 *
 * Nothing ever opens this. It is stored so the teacher recognises their own
 * upload in the history, so it is stripped to characters that cannot be
 * mistaken for a path and truncated to something a table can show.
 */
export function displayFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'upload.csv';
  return (
    base
      .replace(CONTROL_CHARACTERS, '')
      .replace(/[^A-Za-z0-9._ -]/g, '_')
      .slice(0, 160)
      .trim() || 'upload.csv'
  );
}

/* --------------------------------------------------------- the digest ----- */

/**
 * Separators that cannot occur inside any field value.
 *
 * Built with `fromCharCode` rather than typed as literals. Unit and record
 * separators are used rather than a comma so that no student name can forge a
 * field boundary and make two different plans hash alike.
 */
const SEP_FIELD = String.fromCharCode(31);
const SEP_ROW = String.fromCharCode(30);

/**
 * A fingerprint of the plan the teacher approved.
 *
 * WHY THIS EXISTS. The dry run and the import are two separate requests, and
 * nothing is stored between them — the uploaded file is parsed and discarded.
 * So the confirm step re-uploads and re-plans, and this digest proves the plan
 * it produced is the same one that was reviewed.
 *
 * That closes the gap where a teacher checks one file, and the confirm request
 * carries a different one. It also means no uploaded spreadsheet ever sits on a
 * server waiting for a second click.
 *
 * Only the DECISIONS are hashed, not incidental ordering or formatting, so
 * re-uploading the identical file always reproduces the identical digest.
 */
export function planDigest(plan: ImportPlan): string {
  const shape = [...plan.creates, ...plan.updates]
    .map((r) =>
      [
        r.action,
        r.importRef,
        r.studentName,
        r.programme,
        r.board ?? '',
        r.year,
        r.score,
        r.scoreUnit,
        r.highlight ?? '',
        r.consentRef ?? '',
        r.consentResult ? 1 : 0,
        r.consentName ? 1 : 0,
        r.consentPhoto ? 1 : 0,
        r.displayNameMode,
        r.photoUrl ?? '',
        r.subjects.map((s) => `${s.subject}=${s.score}`).join('|'),
      ].join(SEP_FIELD),
    )
    .sort()
    .join(SEP_ROW);

  return createHash('sha256')
    .update(['v1', plan.problems.length, shape].join(SEP_ROW))
    .digest('hex');
}

/* ----------------------------------------------------------- planning ----- */

export type PlanOutcome =
  | { ok: true; plan: ImportPlan; digest: string }
  | { ok: false; message: string };

/**
 * Parse a file and work out what it would do. WRITES NOTHING.
 *
 * The only database access is a read of the records the file refers to, and it
 * is bounded by the references in the file rather than fetching the table.
 */
export async function planImport(text: string): Promise<PlanOutcome> {
  const parsed = parseCsv(text, CSV_LIMITS);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  if (parsed.table.rowCount === 0) {
    return { ok: false, message: 'That file has headings but no rows.' };
  }

  let existing: ExistingRecord[] = [];
  if (isDatabaseConfigured()) {
    // Collect the references the file mentions, then ask only about those.
    const refs = [
      ...new Set(
        parsed.table.rows
          .map((r) => (r['reference'] ?? '').trim())
          .filter((r) => r.length > 0 && r.length <= 64),
      ),
    ];
    if (refs.length > 0) {
      try {
        const rows = await getPrisma().topper.findMany({
          where: { importRef: { in: refs } },
          select: {
            importRef: true,
            published: true,
            consentResult: true,
            consentName: true,
            consentPhoto: true,
            consentRef: true,
            displayNameMode: true,
            photoUrl: true,
          },
        });
        existing = rows
          .filter((r): r is typeof r & { importRef: string } => r.importRef !== null)
          .map((r) => ({ ...r, importRef: r.importRef }));
      } catch (error) {
        logUnexpected('import.plan.lookup_failed', error);
        return { ok: false, message: 'We could not check this file against the existing records. Please try again.' };
      }
    }
  }

  const plan = buildPlan({ headers: parsed.table.headers, rows: parsed.table.rows, existing });
  return { ok: true, plan, digest: planDigest(plan) };
}

/* ---------------------------------------------------------- executing ----- */

export type ImportOutcome =
  | { ok: true; created: number; updated: number; durationMs: number; madePublic: number }
  | { ok: false; message: string };

const CHUNK = 200;

function toRow(record: PlannedRecord) {
  return {
    importRef: record.importRef,
    studentName: record.studentName,
    displayNameMode: record.displayNameMode,
    photoUrl: record.photoUrl,
    score: record.score,
    scoreUnit: record.scoreUnit,
    programme: record.programme as never,
    board: (record.board ?? null) as never,
    year: record.year,
    highlight: record.highlight,
    consentRef: record.consentRef,
    consentResult: record.consentResult,
    consentName: record.consentName,
    consentPhoto: record.consentPhoto,
  };
}

/**
 * Apply a plan.
 *
 * ATOMICITY, STATED EXACTLY. The whole import runs inside one interactive
 * transaction: either every row lands or none of them does. There is no
 * half-imported state to explain, and no chunking that leaves the teacher
 * wondering which half worked.
 *
 * `CHUNK` bounds how many statements are pipelined at a time INSIDE that one
 * transaction. It is a memory bound, not a commit boundary — the transaction
 * still commits once, at the end.
 *
 * PUBLICATION IS NEVER TOUCHED. Creates default `published` to false (the
 * column default); updates do not mention `published` or `publishedAt` at all,
 * so a record that is on the website stays on it and a record that is not stays
 * off. The database CHECK constraints remain the last line of defence: if a row
 * somehow reached here in a state that violates the consent model, the
 * transaction fails and nothing is written.
 */
export async function executeImport(plan: ImportPlan): Promise<ImportOutcome> {
  if (!isDatabaseConfigured()) {
    return { ok: false, message: 'The database is not available right now.' };
  }
  if (!plan.ok) {
    return { ok: false, message: 'This file still has problems that need fixing first.' };
  }

  const started = Date.now();
  const prisma = getPrisma();

  try {
    await prisma.$transaction(
      async (tx) => {
        // ---- creates -------------------------------------------------------
        for (let i = 0; i < plan.creates.length; i += CHUNK) {
          const slice = plan.creates.slice(i, i + CHUNK);
          await tx.topper.createMany({ data: slice.map(toRow) });
        }

        // Subject marks need the ids the database just generated, so they are
        // resolved in one read rather than one read per row.
        const createdRefs = plan.creates.filter((c) => c.subjects.length > 0).map((c) => c.importRef);
        if (createdRefs.length > 0) {
          const idByRef = new Map(
            (
              await tx.topper.findMany({
                where: { importRef: { in: createdRefs } },
                select: { id: true, importRef: true },
              })
            ).map((r) => [r.importRef as string, r.id]),
          );
          const marks = plan.creates.flatMap((c) => {
            const id = idByRef.get(c.importRef);
            return id ? c.subjects.map((s) => ({ topperId: id, subject: s.subject, score: s.score })) : [];
          });
          for (let i = 0; i < marks.length; i += CHUNK) {
            await tx.subjectScore.createMany({ data: marks.slice(i, i + CHUNK) });
          }
        }

        // ---- updates -------------------------------------------------------
        for (const record of plan.updates) {
          await tx.topper.update({
            where: { importRef: record.importRef },
            // `published` and `publishedAt` are absent on purpose. An import
            // corrects data; it never changes what is on the website.
            data: toRow(record),
          });
        }

        // Subject marks are replaced wholesale: the list in the file is the
        // list that ends up stored, so a mark deleted from the spreadsheet is
        // deleted from the record rather than lingering.
        const updateRefs = plan.updates.map((u) => u.importRef);
        if (updateRefs.length > 0) {
          const idByRef = new Map(
            (
              await tx.topper.findMany({
                where: { importRef: { in: updateRefs } },
                select: { id: true, importRef: true },
              })
            ).map((r) => [r.importRef as string, r.id]),
          );
          const ids = [...idByRef.values()];
          for (let i = 0; i < ids.length; i += CHUNK) {
            await tx.subjectScore.deleteMany({ where: { topperId: { in: ids.slice(i, i + CHUNK) } } });
          }
          const marks = plan.updates.flatMap((u) => {
            const id = idByRef.get(u.importRef);
            return id ? u.subjects.map((s) => ({ topperId: id, subject: s.subject, score: s.score })) : [];
          });
          for (let i = 0; i < marks.length; i += CHUNK) {
            await tx.subjectScore.createMany({ data: marks.slice(i, i + CHUNK) });
          }
        }
      },
      // A thousand rows measured well under this; the ceiling exists so a
      // pathological file releases its locks rather than holding them.
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (error) {
    const ref = logUnexpected('import.execute.failed', error);
    return {
      ok: false,
      message: `Nothing was imported — the whole file was rolled back. Please try again, and quote reference ${ref} if it keeps happening.`,
    };
  }

  const durationMs = Date.now() - started;
  log.info('import.completed', {
    created: plan.creates.length,
    updated: plan.updates.length,
    durationMs,
  });

  return {
    ok: true,
    created: plan.creates.length,
    updated: plan.updates.length,
    madePublic: plan.wouldBecomePublic,
    durationMs,
  };
}
