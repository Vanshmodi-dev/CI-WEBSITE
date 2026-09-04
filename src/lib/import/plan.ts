/**
 * Turn a parsed spreadsheet into a plan — PURE. No database, no I/O.
 *
 * This module decides what an import WOULD do. It never does it. That split is
 * what makes a dry run trustworthy: the same function produces the preview the
 * teacher approves and the instructions the writer executes, so the two cannot
 * describe different things.
 *
 * Existing records are passed IN rather than fetched here, so every rule below
 * is testable without a database.
 *
 * Imports use relative paths rather than the `@/` alias so Node's test runner
 * can load this file directly — the same reason token.ts, indexing.ts and
 * burst-limit.ts do.
 */

import {
  COLUMNS,
  HEADER_TO_KEY,
  PROGRAMME_VALUES,
  BOARD_VALUES,
  NAME_DISPLAY_VALUES,
  SCORE_UNIT_VALUES,
  YES_NO_VALUES,
  type ColumnKey,
} from './columns.ts';
import { present, blockersForPublishing, type DisplayNameModeValue } from '../student-display.ts';
import { isSafePhotoPath } from '../validation.ts';

/* ------------------------------------------------------------- types ------ */

export type RowProblem = {
  /** The line number in the teacher's file, counting the header as line 1. */
  line: number;
  column: string;
  problem: string;
  /** What a correct value looks like. Never a schema detail. */
  expected: string;
};

export type SubjectMark = { subject: string; score: number };

/** A row that passed every check, normalised into database shape. */
export type PlannedRecord = {
  line: number;
  importRef: string;
  studentName: string;
  displayNameMode: DisplayNameModeValue;
  photoUrl: string | null;
  score: number;
  scoreUnit: string;
  programme: string;
  board: string | null;
  year: number;
  highlight: string | null;
  consentResult: boolean;
  consentName: boolean;
  consentPhoto: boolean;
  subjects: SubjectMark[];
  /** NEW creates a record; UPDATE corrects the one with this reference. */
  action: 'create' | 'update';
  /** Set for updates: whether the existing record is currently on the website. */
  currentlyPublished: boolean;
};

/** What a visitor would see if this record were published. */
export type VisibilityPreview = {
  importRef: string;
  studentName: string;
  /** Is the record on the website right now? Import never changes this. */
  publishedNow: boolean;
  resultVisible: boolean;
  nameShown: string | null;
  photoShown: boolean;
  /** Plain-language reasons, one per thing that stays private. */
  reasons: string[];
};

export type ImportPlan = {
  ok: boolean;
  rowsTotal: number;
  creates: PlannedRecord[];
  updates: PlannedRecord[];
  problems: RowProblem[];
  /** Rows dropped as exact duplicates of an earlier row in the same file. */
  duplicateLines: number[];
  preview: VisibilityPreview[];
  /**
   * How many records this import would make publicly visible.
   *
   * Structurally zero: import never sets `published`. Reported anyway, because
   * "0" is the number the teacher needs to see before pressing the button, and
   * a non-zero value here would mean something is badly wrong.
   */
  wouldBecomePublic: number;
  /** Records already on the website that this import would alter. */
  updatesToLiveRecords: number;
};

/** What the planner needs to know about a record that already exists. */
export type ExistingRecord = {
  importRef: string;
  published: boolean;
  consentResult: boolean;
  consentName: boolean;
  consentPhoto: boolean;
  displayNameMode: string;
  photoUrl: string | null;
};

export const MAX_SUBJECTS = 15;

/* -------------------------------------------------------- normalising ----- */

/**
 * Trim, collapse inner whitespace, and strip control characters.
 *
 * Deliberately conservative. It removes what a copy-paste from a PDF drags in;
 * it does not "correct" anything a person meant to type. Nothing here changes
 * the letters of an Indian name.
 */
function clean(raw: string | undefined): string {
  if (typeof raw !== 'string') return '';
  // Written as escapes, never as literal control characters: a NUL or a
  // vertical tab sitting in source is invisible to whoever reviews this next.
  return raw
    .replace(new RegExp('[\u0000-\u001F\u007F]', 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


const isBlank = (v: string) => v.length === 0;

/** Look a value up in an accepted-values table, case- and spacing-insensitively. */
function lookup<T>(table: ReadonlyMap<string, T>, raw: string): T | undefined {
  return table.get(raw.toLowerCase().replace(/[\s_-]+/g, ' ').trim());
}

/** The accepted spellings, for an error message that tells the teacher what to type. */
function acceptedList(key: ColumnKey): string {
  return COLUMNS.find((c) => c.key === key)?.accepted ?? '';
}

function headerFor(key: ColumnKey): string {
  return COLUMNS.find((c) => c.key === key)?.header ?? key;
}

/**
 * Parse "Accountancy:95; Economics:88".
 *
 * Strict on purpose. A pair without a colon, a mark that is not a number, or a
 * subject with no name is an error rather than a silent drop — a missing
 * subject on a published result is a wrong result.
 */
export function parseSubjects(raw: string): { subjects: SubjectMark[] } | { error: string } {
  const text = clean(raw);
  if (isBlank(text)) return { subjects: [] };

  const parts = text.split(';').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length > MAX_SUBJECTS) {
    return { error: `More than ${MAX_SUBJECTS} subjects listed.` };
  }

  const subjects: SubjectMark[] = [];
  for (const part of parts) {
    const colon = part.lastIndexOf(':');
    if (colon <= 0 || colon === part.length - 1) {
      return { error: `"${part.slice(0, 40)}" is not a Subject:Mark pair.` };
    }
    const subject = part.slice(0, colon).trim();
    const markText = part.slice(colon + 1).trim().replace(/%$/, '').trim();
    if (subject.length === 0 || subject.length > 60) {
      return { error: `"${subject.slice(0, 40)}" is not a usable subject name.` };
    }
    const score = Number(markText);
    if (!Number.isFinite(score) || score < 0 || score > 9999) {
      return { error: `"${markText.slice(0, 20)}" is not a mark between 0 and 9999.` };
    }
    if (subjects.some((s) => s.subject.toLowerCase() === subject.toLowerCase())) {
      return { error: `"${subject}" is listed twice.` };
    }
    subjects.push({ subject, score });
  }
  return { subjects };
}

/* ---------------------------------------------------------- planning ------ */

export type PlanInput = {
  headers: string[];
  rows: Array<Record<string, string>>;
  existing: ExistingRecord[];
};

/**
 * Validate every row and work out what would happen.
 *
 * NEVER STOPS AT THE FIRST ERROR. A teacher with 53 problems in 1,000 rows
 * gets all 53 in one report; the alternative is fifty-three upload-and-fix
 * cycles, which is how people give up and start editing the database directly.
 */
export function buildPlan({ headers, rows, existing }: PlanInput): ImportPlan {
  const problems: RowProblem[] = [];
  const creates: PlannedRecord[] = [];
  const updates: PlannedRecord[] = [];
  const duplicateLines: number[] = [];

  // ---- the sheet must be the template -------------------------------------
  const present_ = new Set(headers.filter((h) => HEADER_TO_KEY.has(h)));
  const missing = COLUMNS.filter((c) => c.required).filter(
    (c) => !present_.has(c.header.toLowerCase().replace(/[\s_-]+/g, ' ')),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      rowsTotal: rows.length,
      creates: [],
      updates: [],
      problems: missing.map((c) => ({
        line: 1,
        column: c.header,
        problem: 'This column is missing from the file.',
        expected: `Add a "${c.header}" column. Download the template to see the exact headings.`,
      })),
      duplicateLines: [],
      preview: [],
      wouldBecomePublic: 0,
      updatesToLiveRecords: 0,
    };
  }

  const byRef = new Map(existing.map((e) => [e.importRef, e]));
  const seenRefs = new Map<string, number>();

  const get = (row: Record<string, string>, key: ColumnKey): string => {
    const header = COLUMNS.find((c) => c.key === key)?.header ?? '';
    return clean(row[header.toLowerCase().replace(/[\s_-]+/g, ' ')]);
  };

  rows.forEach((row, index) => {
    // Line 1 is the header, so the first data row is line 2 — which is what the
    // teacher sees in their spreadsheet's row numbers.
    const line = index + 2;
    const rowProblems: RowProblem[] = [];
    const fail = (key: ColumnKey, problem: string, expected?: string) =>
      rowProblems.push({
        line,
        column: headerFor(key),
        problem,
        expected: expected ?? acceptedList(key),
      });

    // ---- reference: the identity of the row -------------------------------
    const reference = get(row, 'reference');
    if (isBlank(reference)) {
      fail('reference', 'This is required — it is how a later correction finds this row again.');
    } else if (!/^[A-Za-z0-9._/-]{1,64}$/.test(reference)) {
      fail('reference', 'Contains characters that are not allowed.');
    } else {
      const firstSeen = seenRefs.get(reference);
      if (firstSeen !== undefined) {
        duplicateLines.push(line);
        rowProblems.push({
          line,
          column: headerFor('reference'),
          problem: `"${reference}" is already used on line ${firstSeen} of this file.`,
          expected: 'Each row needs its own reference. Two rows cannot describe the same record.',
        });
      } else {
        seenRefs.set(reference, line);
      }
    }

    // ---- name --------------------------------------------------------------
    const studentName = get(row, 'studentName');
    if (isBlank(studentName)) fail('studentName', 'This is required.');
    else if (studentName.length < 2) fail('studentName', 'This looks too short to be a name.');
    else if (studentName.length > 120) fail('studentName', 'This is longer than 120 characters.');

    // ---- programme ---------------------------------------------------------
    const programmeRaw = get(row, 'programme');
    const programme = lookup(PROGRAMME_VALUES, programmeRaw);
    if (isBlank(programmeRaw)) {
      fail('programme', 'This is required.');
    } else if (!programme) {
      fail(
        'programme',
        `"${programmeRaw.slice(0, 40)}" is not one of the courses in the template.`,
        'Class 11 Commerce, Class 12 Commerce, CA Foundation, CA Intermediate or CMA. "Commerce" on its own is not enough — say which class.',
      );
    }

    // ---- board (optional) ---------------------------------------------------
    const boardRaw = get(row, 'board');
    let board: string | null = null;
    if (!isBlank(boardRaw)) {
      const matched = lookup(BOARD_VALUES, boardRaw);
      if (!matched) fail('board', `"${boardRaw.slice(0, 40)}" is not a board in the template.`);
      else board = matched;
    }

    // ---- year ---------------------------------------------------------------
    const yearRaw = get(row, 'year');
    const year = Number(yearRaw);
    if (isBlank(yearRaw)) fail('year', 'This is required.');
    else if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      fail('year', `"${yearRaw.slice(0, 20)}" is not a year between 2000 and 2100.`);
    }

    // ---- score ---------------------------------------------------------------
    const scoreRaw = get(row, 'score').replace(/%$/, '').trim();
    const score = Number(scoreRaw);
    const scoreUnitRaw = get(row, 'scoreUnit');
    const scoreUnit = isBlank(scoreUnitRaw) ? 'percent' : lookup(SCORE_UNIT_VALUES, scoreUnitRaw);
    if (isBlank(scoreRaw)) {
      fail('score', 'This is required.');
    } else if (!Number.isFinite(score) || score < 0 || score > 9999) {
      fail('score', `"${scoreRaw.slice(0, 20)}" is not a number between 0 and 9999.`);
    }
    if (!scoreUnit) {
      fail('scoreUnit', `"${scoreUnitRaw.slice(0, 20)}" is not Percent or Marks.`);
    } else if (scoreUnit === 'percent' && Number.isFinite(score) && score > 100) {
      fail(
        'score',
        `${score} is more than 100, but this row says the score is a percentage.`,
        'Either correct the score, or set "Score Is" to Marks.',
      );
    }

    // ---- highlight ------------------------------------------------------------
    const highlight = get(row, 'highlight');
    if (highlight.length > 160) fail('highlight', 'This is longer than 160 characters.');

    // ---- subjects --------------------------------------------------------------
    const subjectResult = parseSubjects(row[headerFor('subjects').toLowerCase().replace(/[\s_-]+/g, ' ')] ?? '');
    let subjects: SubjectMark[] = [];
    if ('error' in subjectResult) fail('subjects', subjectResult.error);
    else subjects = subjectResult.subjects;

    // ---- consent ----------------------------------------------------------------
    // No consent-form-reference column since Phase 23. The three permissions
    // below are the whole of what a spreadsheet may record about consent.
    const readFlag = (key: ColumnKey): boolean => {
      const raw = get(row, key);
      if (isBlank(raw)) return false;
      const value = lookup(YES_NO_VALUES, raw);
      if (value === undefined) {
        fail(key, `"${raw.slice(0, 20)}" is not Yes or No.`);
        return false;
      }
      return value;
    };
    const consentResult = readFlag('consentResult');
    const consentName = readFlag('consentName');
    const consentPhoto = readFlag('consentPhoto');

    const nameDisplayRaw = get(row, 'nameDisplay');
    let displayNameMode: DisplayNameModeValue = 'INITIALS';
    if (!isBlank(nameDisplayRaw)) {
      const matched = lookup(NAME_DISPLAY_VALUES, nameDisplayRaw);
      if (!matched) fail('nameDisplay', `"${nameDisplayRaw.slice(0, 30)}" is not one of the options.`);
      else displayNameMode = matched as DisplayNameModeValue;
    }

    // ---- photograph ---------------------------------------------------------------
    const photoRaw = get(row, 'photoPath');
    let photoUrl: string | null = null;
    if (!isBlank(photoRaw)) {
      if (!isSafePhotoPath(photoRaw)) {
        fail(
          'photoPath',
          'This is not a photograph on this website.',
          'Upload the photograph to this site first, then give its path — for example /photos/name.jpg. A link to another website is not accepted.',
        );
      } else {
        photoUrl = photoRaw;
      }
    }

    // ---- consent combinations the database would refuse ----------------------------
    // Caught here so the teacher reads a sentence rather than a constraint name.
    if (displayNameMode !== 'INITIALS' && !consentName) {
      rowProblems.push({
        line,
        column: headerFor('nameDisplay'),
        problem: 'This row asks to show a name, but there is no permission for the name.',
        expected: `Set "${headerFor('consentName')}" to Yes, or set "${headerFor('nameDisplay')}" to Initials.`,
      });
    }
    if (photoUrl && !consentPhoto) {
      rowProblems.push({
        line,
        column: headerFor('photoPath'),
        problem: 'This row gives a photograph, but there is no permission for a photograph.',
        expected: `Set "${headerFor('consentPhoto')}" to Yes, or leave the photograph blank. Permission for the name or the result does not cover a photograph.`,
      });
    }

    if (rowProblems.length > 0) {
      problems.push(...rowProblems);
      return;
    }

    // ---- new or a correction? ------------------------------------------------------
    const existingRecord = byRef.get(reference);
    const record: PlannedRecord = {
      line,
      importRef: reference,
      studentName,
      displayNameMode,
      photoUrl,
      score,
      scoreUnit: scoreUnit as string,
      programme: programme as string,
      board,
      year,
      highlight: isBlank(highlight) ? null : highlight,
      consentResult,
      consentName,
      consentPhoto,
      subjects,
      action: existingRecord ? 'update' : 'create',
      currentlyPublished: existingRecord?.published ?? false,
    };

    /**
     * A correction must not knock a live record off the website sideways.
     *
     * Import never changes `published`. So if a record is on the website and
     * the new row would remove a permission the publication depends on, the
     * database would reject the write. The teacher gets a sentence about it
     * instead of a constraint violation.
     */
    if (existingRecord?.published) {
      if (!consentResult) {
        problems.push({
          line,
          column: headerFor('consentResult'),
          problem: 'This record is on the website now, and this row removes permission to show the result.',
          expected: 'Either keep the permission as Yes, or take the record off the website first in Students.',
        });
        return;
      }
      /*
        THE SECOND RULE HERE WAS ABOUT THE CONSENT FORM REFERENCE, and it went
        with the requirement (Phase 23). A live record whose row blanks the
        reference is no longer a problem, because the database no longer refuses
        that write — `toppers_published_requires_consent` is now about
        `consentResult` alone.
      */
    }

    if (record.action === 'update') updates.push(record);
    else creates.push(record);
  });

  // ---- what a visitor would see ---------------------------------------------------
  const preview = [...creates, ...updates].map((r) => buildPreview(r));

  return {
    ok: problems.length === 0,
    rowsTotal: rows.length,
    creates,
    updates,
    problems,
    duplicateLines,
    preview,
    // Import never publishes. Computed rather than hard-coded so the number is
    // a measurement of the plan and not a promise about it.
    wouldBecomePublic: preview.filter((p) => !p.publishedNow && p.resultVisible).length,
    updatesToLiveRecords: updates.filter((u) => u.currentlyPublished).length,
  };
}

/**
 * What this record would show, decided by the SAME functions the website uses.
 *
 * `present()` and `blockersForPublishing()` are imported rather than
 * reimplemented. A second interpretation of consent is how two answers to "is
 * this child's photograph public?" come to exist in one codebase.
 */
export function buildPreview(record: PlannedRecord): VisibilityPreview {
  const asStored = {
    studentName: record.studentName,
    displayNameMode: record.displayNameMode,
    photoUrl: record.photoUrl,
    consentResult: record.consentResult,
    consentName: record.consentName,
    consentPhoto: record.consentPhoto,
    // Import never changes publication, so the preview asks what is true for
    // the state this record will actually be in.
    published: record.currentlyPublished,
  };

  const view = present(asStored);
  const resultVisible = record.currentlyPublished && record.consentResult;

  const reasons: string[] = [];
  if (!record.currentlyPublished) {
    reasons.push(
      record.action === 'create'
        ? 'Stored privately. Importing never puts a record on the website — publish it from Students when you are ready.'
        : 'Not on the website. Importing does not change that either way.',
    );
  }
  // What would still be missing if the teacher went to publish this next.
  for (const blocker of blockersForPublishing(asStored)) reasons.push(blocker);
  if (resultVisible && !record.consentName) {
    reasons.push('Only initials will be shown — there is no permission for the name.');
  }
  if (resultVisible && record.photoUrl && !record.consentPhoto) {
    reasons.push('The photograph stays private — there is no permission for it.');
  }

  return {
    importRef: record.importRef,
    studentName: record.studentName,
    publishedNow: record.currentlyPublished,
    resultVisible,
    nameShown: resultVisible ? view.name : null,
    photoShown: resultVisible && Boolean(view.photoUrl),
    reasons,
  };
}
