import 'server-only';

import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { toCsv, type CsvColumn } from '@/lib/csv';
import { COLUMNS } from '@/lib/import/columns';

/**
 * Admin exports — SERVER ONLY.
 *
 * =============================================================================
 * WHY EXPORT EXISTS
 * =============================================================================
 * Data you cannot get out is data you do not own. The institute should be able
 * to take their records elsewhere, keep a copy, or open them in the spreadsheet
 * they are used to, without asking anyone.
 *
 * The results export is deliberately the SAME SHAPE as the import template, so
 * the round trip works: export, edit in Excel, import back. The `Reference`
 * column carries `importRef`, which is what makes the re-import a correction
 * rather than a thousand duplicates.
 *
 * =============================================================================
 * WHAT IS EXPORTED, AND WHAT IS NOT
 * =============================================================================
 * Consent flags ARE exported. They are administrative facts the institute holds
 * and needs in order to check its own paperwork, and withholding them would
 * make the round trip silently destroy them.
 *
 * `publishedAt`, internal ids and `ipHash` are NOT exported. The first two are
 * database machinery of no use in a spreadsheet; the third is abuse-control
 * plumbing that would put a per-person identifier into a file that gets emailed
 * around.
 *
 * Every value passes through `neutraliseCell` inside `toCsv`, so a name
 * containing `=HYPERLINK(...)` opens as text rather than as a formula.
 */

const YES_NO = (v: boolean) => (v ? 'Yes' : 'No');

const PROGRAMME_LABEL: Record<string, string> = {
  CLASS_11: 'Class 11 Commerce',
  CLASS_12: 'Class 12 Commerce',
  CA_FOUNDATION: 'CA Foundation',
  CA_INTERMEDIATE: 'CA Intermediate',
  CMA: 'CMA',
};

const NAME_MODE_LABEL: Record<string, string> = {
  INITIALS: 'Initials',
  FIRST_NAME_ONLY: 'First name only',
  FULL: 'Full name',
};

const header = (key: string) => COLUMNS.find((c) => c.key === key)?.header ?? key;

export type ExportKind = 'results' | 'stories' | 'batches' | 'announcements' | 'enquiries';

export const EXPORT_KINDS: ReadonlyArray<{ kind: ExportKind; label: string; note: string }> = [
  {
    kind: 'results',
    label: 'Student results',
    note: 'Same columns as the import template, so you can edit and import it back.',
  },
  { kind: 'stories', label: 'Student stories', note: 'Full text, with the permissions recorded for each.' },
  { kind: 'batches', label: 'Batches', note: 'Every batch, past and upcoming.' },
  { kind: 'announcements', label: 'Announcements', note: 'Every notice, including expired ones.' },
  {
    kind: 'enquiries',
    label: 'Enquiries',
    note: 'Names and phone numbers of people who contacted you. Treat this file carefully.',
  },
];

/** How many rows an export will read. Bounded so one click cannot read a table without limit. */
export const EXPORT_ROW_LIMIT = 20_000;

export type ExportResult = { filename: string; csv: string; rows: number };

export async function buildExport(kind: ExportKind): Promise<ExportResult> {
  if (!isDatabaseConfigured()) {
    return { filename: `${kind}.csv`, csv: toCsv([], []), rows: 0 };
  }
  const prisma = getPrisma();
  const stamp = new Date().toISOString().slice(0, 10);

  switch (kind) {
    case 'results': {
      const rows = await prisma.topper.findMany({
        orderBy: [{ year: 'desc' }, { studentName: 'asc' }],
        take: EXPORT_ROW_LIMIT,
        select: {
          importRef: true,
          studentName: true,
          programme: true,
          board: true,
          year: true,
          score: true,
          scoreUnit: true,
          highlight: true,
          consentRef: true,
          consentResult: true,
          consentName: true,
          consentPhoto: true,
          displayNameMode: true,
          photoUrl: true,
          published: true,
          subjectScores: { select: { subject: true, score: true }, orderBy: { subject: 'asc' } },
        },
      });

      type Row = (typeof rows)[number];
      const columns: CsvColumn<Row>[] = [
        { header: header('reference'), value: (r) => r.importRef },
        { header: header('studentName'), value: (r) => r.studentName },
        { header: header('programme'), value: (r) => PROGRAMME_LABEL[r.programme] ?? r.programme },
        { header: header('board'), value: (r) => r.board ?? '' },
        { header: header('year'), value: (r) => r.year },
        { header: header('score'), value: (r) => String(r.score) },
        { header: header('scoreUnit'), value: (r) => (r.scoreUnit === 'marks' ? 'Marks' : 'Percent') },
        { header: header('highlight'), value: (r) => r.highlight ?? '' },
        {
          header: header('subjects'),
          value: (r) => r.subjectScores.map((s) => `${s.subject}:${String(s.score)}`).join('; '),
        },
        { header: header('consentRef'), value: (r) => r.consentRef ?? '' },
        { header: header('consentResult'), value: (r) => YES_NO(r.consentResult) },
        { header: header('consentName'), value: (r) => YES_NO(r.consentName) },
        { header: header('consentPhoto'), value: (r) => YES_NO(r.consentPhoto) },
        { header: header('nameDisplay'), value: (r) => NAME_MODE_LABEL[r.displayNameMode] ?? 'Initials' },
        { header: header('photoPath'), value: (r) => r.photoUrl ?? '' },
        // Read-only. Import ignores it, because publishing is never a
        // spreadsheet decision - see src/lib/import/columns.ts.
        { header: 'On Website Now (read only)', value: (r) => YES_NO(r.published) },
      ];

      return { filename: `results-${stamp}.csv`, csv: toCsv(columns, rows), rows: rows.length };
    }

    case 'stories': {
      const rows = await prisma.studentStory.findMany({
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
        take: EXPORT_ROW_LIMIT,
        select: {
          studentName: true,
          programme: true,
          year: true,
          challenge: true,
          journey: true,
          outcome: true,
          quote: true,
          consentRef: true,
          consentStory: true,
          consentName: true,
          consentPhoto: true,
          displayNameMode: true,
          photoUrl: true,
          published: true,
        },
      });
      type Row = (typeof rows)[number];
      const columns: CsvColumn<Row>[] = [
        { header: 'Student Name', value: (r) => r.studentName },
        { header: 'Programme', value: (r) => PROGRAMME_LABEL[r.programme] ?? r.programme },
        { header: 'Year', value: (r) => r.year },
        { header: 'The Challenge', value: (r) => r.challenge },
        { header: 'What Changed', value: (r) => r.journey },
        { header: 'The Outcome', value: (r) => r.outcome },
        { header: 'Quote', value: (r) => r.quote ?? '' },
        { header: 'Consent Form Reference', value: (r) => r.consentRef ?? '' },
        { header: 'Permission: Publish Story', value: (r) => YES_NO(r.consentStory) },
        { header: 'Permission: Show Name', value: (r) => YES_NO(r.consentName) },
        { header: 'Permission: Show Photograph', value: (r) => YES_NO(r.consentPhoto) },
        { header: 'Name Shown As', value: (r) => NAME_MODE_LABEL[r.displayNameMode] ?? 'Initials' },
        { header: 'Photograph File', value: (r) => r.photoUrl ?? '' },
        { header: 'On Website Now', value: (r) => YES_NO(r.published) },
      ];
      return { filename: `stories-${stamp}.csv`, csv: toCsv(columns, rows), rows: rows.length };
    }

    case 'batches': {
      const rows = await prisma.batch.findMany({
        orderBy: { startsAt: 'desc' },
        take: EXPORT_ROW_LIMIT,
        select: { courseSlug: true, startsAt: true, mode: true, seatsNote: true, published: true },
      });
      type Row = (typeof rows)[number];
      const columns: CsvColumn<Row>[] = [
        { header: 'Course', value: (r) => r.courseSlug },
        { header: 'Starts', value: (r) => r.startsAt },
        { header: 'Mode', value: (r) => r.mode },
        { header: 'Seats Note', value: (r) => r.seatsNote ?? '' },
        { header: 'On Website Now', value: (r) => YES_NO(r.published) },
      ];
      return { filename: `batches-${stamp}.csv`, csv: toCsv(columns, rows), rows: rows.length };
    }

    case 'announcements': {
      const rows = await prisma.announcement.findMany({
        orderBy: { startsAt: 'desc' },
        take: EXPORT_ROW_LIMIT,
        select: { message: true, href: true, startsAt: true, endsAt: true, priority: true, published: true },
      });
      type Row = (typeof rows)[number];
      const columns: CsvColumn<Row>[] = [
        { header: 'Message', value: (r) => r.message },
        { header: 'Link', value: (r) => r.href ?? '' },
        { header: 'Shows From', value: (r) => r.startsAt },
        { header: 'Shows Until', value: (r) => r.endsAt },
        { header: 'Priority', value: (r) => r.priority },
        { header: 'On Website Now', value: (r) => YES_NO(r.published) },
      ];
      return { filename: `announcements-${stamp}.csv`, csv: toCsv(columns, rows), rows: rows.length };
    }

    case 'enquiries': {
      const rows = await prisma.enquiry.findMany({
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ROW_LIMIT,
        // ipHash is NOT selected. It is abuse-control plumbing, it identifies a
        // person, and it has no business in a file that gets emailed around.
        select: {
          createdAt: true,
          name: true,
          phone: true,
          email: true,
          classLevel: true,
          courseSlug: true,
          message: true,
          sourcePage: true,
          status: true,
          notes: true,
        },
      });
      type Row = (typeof rows)[number];
      const columns: CsvColumn<Row>[] = [
        { header: 'Received', value: (r) => r.createdAt },
        { header: 'Name', value: (r) => r.name },
        { header: 'Phone', value: (r) => r.phone },
        { header: 'Email', value: (r) => r.email ?? '' },
        { header: 'Asking About', value: (r) => r.classLevel },
        { header: 'From Course Page', value: (r) => r.courseSlug ?? '' },
        { header: 'Message', value: (r) => r.message ?? '' },
        { header: 'Came From', value: (r) => r.sourcePage },
        { header: 'Status', value: (r) => r.status },
        { header: 'Your Notes', value: (r) => r.notes ?? '' },
      ];
      return { filename: `enquiries-${stamp}.csv`, csv: toCsv(columns, rows), rows: rows.length };
    }
  }
}

/** The blank template a teacher downloads before filling anything in. */
export function buildTemplate(): ExportResult {
  const columns: CsvColumn<Record<string, string>>[] = COLUMNS.map((c) => ({
    header: c.header,
    value: (row) => row[c.key] ?? '',
  }));
  const exampleRow = Object.fromEntries(COLUMNS.map((c) => [c.key, c.example]));
  return {
    filename: 'commerce-insight-results-template.csv',
    csv: toCsv(columns, [exampleRow]),
    rows: 1,
  };
}
