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
 * Pure and unit-tested (tests/student-display.test.ts). No imports, no I/O.
 *
 * See docs/design/STUDENT-DATA-POLICY.md. That document is implementation
 * guidance agreed for this project; it is not a legal opinion.
 */

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
  /** Pointer to the signed paperwork. Without it, nothing publishes. */
  consentRef?: string | null;
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
 * `consentResult` for a topper or result, `consentStory` for a story. Both
 * also need the signed paperwork reference.
 */
export function isPubliclyVisible(
  record: StudentRecord,
  requires: ContentKind = 'consentResult',
): boolean {
  return Boolean(record.published && record.consentRef && record[requires]);
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
  const photoUrl = record.consentPhoto ? (record.photoUrl ?? null) : null;

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

  if (!record.consentRef || record.consentRef.trim().length === 0) {
    blockers.push('Add the consent form reference you hold on file.');
  }

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
