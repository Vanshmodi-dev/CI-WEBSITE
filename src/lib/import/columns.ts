/**
 * The results import template — PURE, no imports.
 *
 * =============================================================================
 * WHAT CAN BE IMPORTED, AND WHAT DELIBERATELY CANNOT
 * =============================================================================
 * Results, with their subject marks. That is the only entity where a teacher
 * genuinely has a spreadsheet: a thousand rows arriving once a year, already in
 * a grid.
 *
 * Stories, batches and announcements are NOT importable, and that is a decision
 * rather than an omission. A story is three paragraphs of prose written one at
 * a time; there are maybe twenty of them, and they are written in the admin
 * where the consent controls sit next to the text. Batches and announcements
 * are a handful per year and take seconds to type. Building three more import
 * paths would triple the surface through which a consent mistake can reach the
 * public site, to save an afternoon of typing that nobody is doing anyway.
 *
 * Export covers everything. Import covers the one thing that is genuinely bulk.
 *
 * =============================================================================
 * THERE IS NO "PUBLISH" COLUMN, ON PURPOSE
 * =============================================================================
 * An import can create and correct records. It can never put one on the
 * website, and it can never take one off.
 *
 * A spreadsheet cell is not a decision. Publishing a child's marks under their
 * name is, and it should be made one record at a time by someone looking at
 * that record. The realistic failure this prevents is a mistyped column making
 * a thousand students public at once, which is not a mistake anyone can undo
 * from the visitor's memory.
 *
 * Consent flags ARE importable, because those are facts about paperwork the
 * institute already holds. Recording "we have signed permission for the name"
 * is bookkeeping. Acting on it is not.
 */

export type ColumnKey =
  | 'reference'
  | 'studentName'
  | 'programme'
  | 'board'
  | 'year'
  | 'score'
  | 'scoreUnit'
  | 'highlight'
  | 'subjects'
  | 'consentRef'
  | 'consentResult'
  | 'consentName'
  | 'consentPhoto'
  | 'nameDisplay'
  | 'photoPath';

export type ColumnSpec = {
  key: ColumnKey;
  /** The heading the teacher types. Matched case- and spacing-insensitively. */
  header: string;
  required: boolean;
  /** One line, in the teacher's language, for the template and the docs. */
  meaning: string;
  accepted: string;
  /** A safe, unmistakably synthetic example. Never a plausible student. */
  example: string;
  /** Does this column change what a visitor could eventually see? */
  affectsVisibility: boolean;
};

/**
 * `Reference` is first because it is the column people skip.
 *
 * It is the institute's own code for the row — a roll number, an enrolment
 * number, anything stable. It is what makes a second import a CORRECTION rather
 * than a duplicate. Without it there is no safe way to tell one student named
 * the same as another apart, and Phase 8 already found two real records
 * colliding on name and year.
 */
export const COLUMNS: readonly ColumnSpec[] = [
  {
    key: 'reference',
    header: 'Reference',
    required: true,
    meaning:
      'Your own code for this record — a roll number or enrolment number. Reuse it later to correct this row; use a new one to add a record.',
    accepted: 'Letters, digits, dot, dash, underscore, slash. Up to 64 characters.',
    example: 'ZZTEST-2026-001',
    affectsVisibility: false,
  },
  {
    key: 'studentName',
    header: 'Student Name',
    required: true,
    meaning: 'The full name as it appears on your records.',
    accepted: '2 to 120 characters.',
    example: 'ZZTEST Student 001',
    affectsVisibility: true,
  },
  {
    key: 'programme',
    header: 'Programme',
    required: true,
    meaning: 'Which course this result belongs to.',
    accepted: 'Class 11 Commerce, Class 12 Commerce, CA Foundation, CA Intermediate, CMA',
    example: 'Class 12 Commerce',
    affectsVisibility: false,
  },
  {
    key: 'board',
    header: 'Board',
    required: false,
    meaning: 'The examining board, where it applies.',
    accepted: 'CBSE, RBSE, ICAI, Other — or leave blank',
    example: 'CBSE',
    affectsVisibility: false,
  },
  {
    key: 'year',
    header: 'Year',
    required: true,
    meaning: 'The year of the result.',
    accepted: 'A four-digit year between 2000 and 2100.',
    example: '2026',
    affectsVisibility: false,
  },
  {
    key: 'score',
    header: 'Score',
    required: true,
    meaning: 'The overall result for this student, as one number.',
    accepted: 'A number. A trailing % sign is accepted and ignored.',
    example: '91.5',
    affectsVisibility: false,
  },
  {
    key: 'scoreUnit',
    header: 'Score Is',
    required: false,
    meaning: 'Whether the score is a percentage or a mark count.',
    accepted: 'Percent or Marks. Defaults to Percent.',
    example: 'Percent',
    affectsVisibility: false,
  },
  {
    key: 'highlight',
    header: 'Highlight',
    required: false,
    meaning: 'One short line shown with the result, if you want one.',
    accepted: 'Up to 160 characters, or blank.',
    example: 'ZZTEST example highlight',
    affectsVisibility: true,
  },
  {
    key: 'subjects',
    header: 'Subjects',
    required: false,
    meaning: 'Subject-wise marks, if you have them.',
    accepted:
      'Subject:Mark pairs separated by semicolons, e.g. "Accountancy:95; Economics:88". Up to 15 subjects.',
    example: 'Accountancy:95; Business Studies:92; Economics:88',
    affectsVisibility: true,
  },
  {
    key: 'consentRef',
    header: 'Consent Form Reference',
    required: false,
    meaning:
      'Where the signed permission form is filed. Nothing can be published without one, so leaving it blank keeps the record private.',
    accepted: 'Up to 200 characters, or blank.',
    example: 'ZZTEST-CONSENT-001',
    affectsVisibility: true,
  },
  {
    key: 'consentResult',
    header: 'Permission: Show Result',
    required: false,
    meaning: 'Do you hold written permission to show this result on the website?',
    accepted: 'Yes or No. Defaults to No.',
    example: 'No',
    affectsVisibility: true,
  },
  {
    key: 'consentName',
    header: 'Permission: Show Name',
    required: false,
    meaning:
      'Do you hold written permission to show their name? Without it, only initials are ever shown.',
    accepted: 'Yes or No. Defaults to No.',
    example: 'No',
    affectsVisibility: true,
  },
  {
    key: 'consentPhoto',
    header: 'Permission: Show Photograph',
    required: false,
    meaning:
      'Do you hold written permission to show a photograph? This is asked separately from everything else and is never implied by the others.',
    accepted: 'Yes or No. Defaults to No.',
    example: 'No',
    affectsVisibility: true,
  },
  {
    key: 'nameDisplay',
    header: 'Name Shown As',
    required: false,
    meaning: 'How much of the name to show, if permission allows it.',
    accepted: 'Initials, First name only, or Full name. Defaults to Initials.',
    example: 'Initials',
    affectsVisibility: true,
  },
  {
    key: 'photoPath',
    header: 'Photograph File',
    required: false,
    meaning:
      'The photograph already uploaded to this website, if there is one. A web address somewhere else will not be accepted.',
    accepted: 'A path on this site ending .jpg, .jpeg, .png, .webp or .avif — e.g. /photos/name.jpg',
    example: '',
    affectsVisibility: true,
  },
] as const;

/** Header → key, for matching a parsed sheet against the template. */
export const HEADER_TO_KEY: ReadonlyMap<string, ColumnKey> = new Map(
  COLUMNS.map((c) => [c.header.toLowerCase().replace(/[\s_-]+/g, ' '), c.key]),
);

export const REQUIRED_HEADERS: readonly string[] = COLUMNS.filter((c) => c.required).map(
  (c) => c.header,
);

/* --------------------------------------------------- accepted values ------ */

/**
 * Teacher-facing labels mapped to the database enum.
 *
 * Only EXPLICIT spellings are accepted. "Commerce" is not here on purpose: it
 * could mean Class 11 or Class 12, and a guess would silently file a student
 * under the wrong year of their life. Ambiguous input is an error, never an
 * assumption.
 */
export const PROGRAMME_VALUES: ReadonlyMap<string, string> = new Map([
  ['class 11 commerce', 'CLASS_11'],
  ['class 11', 'CLASS_11'],
  ['class xi commerce', 'CLASS_11'],
  ['class xi', 'CLASS_11'],
  ['class 12 commerce', 'CLASS_12'],
  ['class 12', 'CLASS_12'],
  ['class xii commerce', 'CLASS_12'],
  ['class xii', 'CLASS_12'],
  ['ca foundation', 'CA_FOUNDATION'],
  ['ca intermediate', 'CA_INTERMEDIATE'],
  ['ca inter', 'CA_INTERMEDIATE'],
  ['cma', 'CMA'],
]);

export const BOARD_VALUES: ReadonlyMap<string, string> = new Map([
  ['cbse', 'CBSE'],
  ['rbse', 'RBSE'],
  ['icai', 'ICAI'],
  ['other', 'OTHER'],
]);

export const NAME_DISPLAY_VALUES: ReadonlyMap<string, string> = new Map([
  ['initials', 'INITIALS'],
  ['first name only', 'FIRST_NAME_ONLY'],
  ['first name', 'FIRST_NAME_ONLY'],
  ['full name', 'FULL'],
  ['full', 'FULL'],
]);

export const SCORE_UNIT_VALUES: ReadonlyMap<string, string> = new Map([
  ['percent', 'percent'],
  ['percentage', 'percent'],
  ['%', 'percent'],
  ['marks', 'marks'],
  ['mark', 'marks'],
]);

/**
 * Yes/no, in the spellings people actually type.
 *
 * `true`/`false` and `1`/`0` are included because a spreadsheet checkbox column
 * exports as one of them depending on the program. Anything else is an error —
 * a blank means "no", but "maybe" means "fix your file".
 */
export const YES_NO_VALUES: ReadonlyMap<string, boolean> = new Map([
  ['yes', true],
  ['y', true],
  ['true', true],
  ['1', true],
  ['no', false],
  ['n', false],
  ['false', false],
  ['0', false],
]);

/** The template file a teacher downloads: headers, then one example row. */
export function templateRows(): string[][] {
  return [COLUMNS.map((c) => c.header), COLUMNS.map((c) => c.example)];
}
