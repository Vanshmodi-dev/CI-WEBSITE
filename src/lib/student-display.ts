/**
 * What may actually be shown about a student.
 *
 * THE SINGLE PLACE THAT DECIDES. Database CHECK constraints stop an
 * unconsented row from being marked published, but a constraint cannot stop a
 * component from rendering a field it was handed. So every surface that
 * displays a student goes through here, and no component reads `studentName`
 * directly.
 *
 * Pure and unit-tested (tests/student-display.test.ts). No imports, no I/O.
 *
 * See docs/design/STUDENT-DATA-POLICY.md. That document is implementation
 * guidance agreed for this project; it is not a legal opinion.
 */

export type ConsentScopeValue =
  | 'RESULT_ONLY'
  | 'RESULT_PARTIAL_NAME'
  | 'RESULT_FULL_NAME'
  | 'RESULT_NAME_PHOTO'
  | 'STORY';

export type DisplayNameModeValue = 'INITIALS' | 'FIRST_NAME_ONLY' | 'FULL';

export type StudentRecord = {
  studentName: string;
  displayNameMode: DisplayNameModeValue;
  photoUrl?: string | null;
  consentScope?: ConsentScopeValue | null;
  consentRef?: string | null;
  published: boolean;
};

export type StudentPresentation = {
  /** Null means render no name at all — not a placeholder, nothing. */
  name: string | null;
  /** Null means render the monogram fallback, never an empty photo frame. */
  photoUrl: string | null;
  /** Initials for the monogram tile. Safe at every scope. */
  monogram: string;
};

/** Scopes that permit showing something identifiable as a name. */
const SCOPE_RANK: Record<ConsentScopeValue, number> = {
  RESULT_ONLY: 0,
  RESULT_PARTIAL_NAME: 1,
  RESULT_FULL_NAME: 2,
  RESULT_NAME_PHOTO: 3,
  STORY: 3,
};

function nameParts(fullName: string): string[] {
  return fullName.trim().split(/\s+/).filter(Boolean);
}

/** "Sample Testcase" → "ST". Always safe: initials identify nobody on their own. */
export function monogramOf(fullName: string): string {
  const parts = nameParts(fullName);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/** "Sample Testcase" → "Sample T." */
function partialName(fullName: string): string {
  const parts = nameParts(fullName);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] ?? '';
  const surnameInitial = parts[parts.length - 1]?.[0] ?? '';
  return `${parts[0]} ${surnameInitial.toUpperCase()}.`;
}

/**
 * Resolve what this record may show.
 *
 * Returns the NARROWEST of what the record asks for and what its consent scope
 * permits. An unpublished record shows nothing, whatever its other fields say.
 */
export function present(record: StudentRecord): StudentPresentation {
  const monogram = monogramOf(record.studentName);

  // Not published, or no consent on file: nothing identifiable, ever.
  if (!record.published || !record.consentScope || !record.consentRef) {
    return { name: null, photoUrl: null, monogram };
  }

  const rank = SCOPE_RANK[record.consentScope];

  // RESULT_ONLY authorises the score and nothing else.
  if (rank === 0) {
    return { name: null, photoUrl: null, monogram };
  }

  // The requested mode is capped by the scope.
  let name: string | null;
  switch (record.displayNameMode) {
    case 'FULL':
      name = rank >= 2 ? record.studentName.trim() : partialName(record.studentName);
      break;
    case 'FIRST_NAME_ONLY':
      name = nameParts(record.studentName)[0] ?? null;
      break;
    case 'INITIALS':
    default:
      name = monogram;
      break;
  }

  // A photograph needs the fullest grant.
  const photoUrl =
    record.consentScope === 'RESULT_NAME_PHOTO' || record.consentScope === 'STORY'
      ? (record.photoUrl ?? null)
      : null;

  return { name: name && name.length > 0 ? name : null, photoUrl, monogram };
}

/** True when this record may be rendered publicly at all. */
export function isPubliclyVisible(record: StudentRecord): boolean {
  return Boolean(record.published && record.consentScope && record.consentRef);
}
