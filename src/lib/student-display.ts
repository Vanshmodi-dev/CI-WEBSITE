/**
 * What may actually be shown about a student.
 *
 * THE SINGLE PLACE THAT DECIDES. Database CHECK constraints stop an
 * unconsented row from being marked published, but a constraint cannot stop a
 * component from rendering a field it was handed. So every surface that
 * displays a student goes through here, and no component reads `studentName`
 * directly.
 *
 * CONSENT IS FOUR INDEPENDENT PERMISSIONS, NOT A LADDER. This replaced an
 * ordered scope enum, which forced every higher grant to imply every lower one
 * — so authorising a story also authorised a photograph. People do not grant
 * permission that way on a paper form, and the institute requires them kept
 * separate.
 *
 * Pure and unit-tested (tests/student-display.test.ts). No I/O.
 *
 * Phase 16 added ONE import: `isSafePhotoPath` from the equally pure
 * `validation.ts`. Copying that check in here instead would have been the
 * mistake - two copies of a security predicate drift, and the one nobody
 * remembers is the one that stops refusing things.
 *
 * See docs/design/STUDENT-DATA-POLICY.md. That document is implementation
 * guidance agreed for this project; it is not a legal opinion.
 */

import { isSafePhotoPath } from './validation.ts';

export type DisplayNameModeValue = 'INITIALS' | 'FIRST_NAME_ONLY' | 'FULL';

/** The permissions the institute holds on file for one student. */
export type ConsentFlags = {
  /** May we publish the score at all? */
  consentResult?: boolean;
  /** May we show a name rather than initials? */
  consentName?: boolean;
  /** May we show a photograph? Granted separately from everything else. */
  consentPhoto?: boolean;
  /** May we publish a written story about them? */
  consentStory?: boolean;
};

export type StudentRecord = ConsentFlags & {
  studentName: string;
  displayNameMode: DisplayNameModeValue;
  photoUrl?: string | null;
  published: boolean;
};

export type StudentPresentation = {
  /** Null means render no name at all — not a placeholder, nothing. */
  name: string | null;
  /** Null means render the monogram fallback, never an empty photo frame. */
  photoUrl: string | null;
  /** Initials for the monogram tile. Safe at every permission level. */
  monogram: string;
};

/** Which permission authorises this KIND of content. */
export type ContentKind = 'consentResult' | 'consentStory';

/*
  THE CONSENT-FORM REFERENCE IS NOT PART OF THIS MODULE ANY MORE.

  Phase 23 removed it as a publishing condition for RESULTS and kept it for
  STORIES, which needed a per-kind table here to express the difference. Phase
  24 removed it for stories too, at the owner's request, so there is no
  difference left to express and the table is gone with it.

  ⚠ WHAT THIS DID NOT CHANGE, EITHER TIME. The reference was never a permission
  — it is a pointer to where the paperwork is filed, and it never decided what
  a visitor saw. `consentResult`, `consentName`, `consentPhoto` and
  `consentStory` are the permissions; all four are unchanged and each is still
  checked independently below. The column is still stored, still exported, and
  still never sent to a browser.
*/

function nameParts(fullName: string): string[] {
  return fullName.trim().split(/\s+/).filter(Boolean);
}

/** "Sample Testcase" → "ST". Always safe: initials identify nobody alone. */
export function monogramOf(fullName: string): string {
  const parts = nameParts(fullName);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/** "Sample Testcase" → "Sample T." */
export function partialName(fullName: string): string {
  const parts = nameParts(fullName);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] ?? '';
  const surnameInitial = parts[parts.length - 1]?.[0] ?? '';
  return `${parts[0]} ${surnameInitial.toUpperCase()}.`;
}

/**
 * The base gate: may this record appear publicly at all?
 *
 * `requires` names the permission that authorises this kind of content —
 * `consentResult` for a topper or result, `consentStory` for a story. Two
 * conditions, both of them decisions a person made about this record: it has
 * been published, and the permission for this kind of content is held.
 */
export function isPubliclyVisible(
  record: StudentRecord,
  requires: ContentKind = 'consentResult',
): boolean {
  return Boolean(record.published && record[requires]);
}

/**
 * Resolve what this record may show.
 *
 * Returns the narrowest of what the record asks for and what its permissions
 * allow. An unpublished record shows nothing, whatever its other fields say.
 */
export function present(
  record: StudentRecord,
  requires: ContentKind = 'consentResult',
): StudentPresentation {
  const monogram = monogramOf(record.studentName);

  if (!isPubliclyVisible(record, requires)) {
    return { name: null, photoUrl: null, monogram };
  }

  // Without name permission, initials are the most that may be shown —
  // whatever displayNameMode asks for.
  let name: string | null;
  if (!record.consentName) {
    name = monogram;
  } else {
    switch (record.displayNameMode) {
      case 'FULL':
        name = record.studentName.trim();
        break;
      case 'FIRST_NAME_ONLY':
        name = nameParts(record.studentName)[0] ?? null;
        break;
      case 'INITIALS':
      default:
        name = monogram;
        break;
    }
  }

  // A photograph needs its OWN permission. A story grant does not confer it,
  // and neither does a name grant.
  /*
    TWO CONDITIONS, NOT ONE.

    Consent decides WHETHER a photograph may be shown. It says nothing about
    whether the stored value is a path this site can safely render, and until
    Phase 16 nothing on the read path checked that - `admin/stories/actions.ts`
    was writing `photoUrl` with no validation at all (D5-1), and this function
    handed whatever it found straight to `next/image`.

    That write is fixed. This check is the second, independent line, and it
    exists because the two fail differently: the write guard protects new data,
    and this protects against a row that is ALREADY poisoned - by the old bug,
    by a direct database edit, or by an import path nobody has re-read lately.
    A bad path here degrades to a monogram, which is exactly what the component
    renders when there is no photo.
  */
  const storedPhoto = record.photoUrl ?? null;
  const photoUrl =
    record.consentPhoto && storedPhoto && isSafePhotoPath(storedPhoto) ? storedPhoto : null;

  return { name: name && name.length > 0 ? name : null, photoUrl, monogram };
}

/**
 * Why a record cannot be published yet, in words a teacher can act on.
 *
 * Returns an empty array when publishing is allowed. The admin uses this to
 * disable the publish control and explain itself, so nobody ever meets a
 * database constraint error.
 */
export function blockersForPublishing(
  record: StudentRecord,
  requires: ContentKind = 'consentResult',
): string[] {
  const blockers: string[] = [];

  if (requires === 'consentResult' && !record.consentResult) {
    blockers.push('Tick "Result" — permission to show this result publicly.');
  }

  if (requires === 'consentStory' && !record.consentStory) {
    blockers.push('Tick "Story" — permission to publish their story.');
  }

  if (record.displayNameMode !== 'INITIALS' && !record.consentName) {
    blockers.push('Tick "Name", or set the display name to initials only.');
  }

  if (record.photoUrl && !record.consentPhoto) {
    blockers.push('Tick "Photograph", or remove the photo.');
  }

  return blockers;
}
