import { isSafePhotoPath } from './validation.ts';

/**
 * Gallery visibility — the one place that decides whether a photograph is
 * allowed to be public.
 *
 * =============================================================================
 * WHY THIS FILE EXISTS RATHER THAN A CHECK INSIDE THE SAVE ACTION
 * =============================================================================
 * Four surfaces need the answer to "is this photograph public, and if not, why
 * not?": the save action, the admin list, the admin form, and the public read
 * path. Phase 16 Topic 4 established the rule that a second implementation of a
 * visibility question is a second ANSWER waiting to disagree with the first,
 * and `present()` in student-display.ts is the existing precedent for putting
 * that question in one importable place.
 *
 * So the admin does not decide what is publishable. It asks this.
 *
 * =============================================================================
 * WHY NOT `blockersForPublishing()` FROM student-display.ts
 * =============================================================================
 * That function is the right rule applied to the wrong shape. It requires a
 * `studentName` and a `displayNameMode`, because a `Topper` row is ABOUT one
 * identified student and the question is how much of that student to show.
 *
 * A photograph is not about one student. A picture of a prize-giving may
 * contain thirty of them, or none at all, and there is no name to display or
 * withhold. Passing a fabricated `studentName` into that function to reuse it
 * would be worse than writing this: it would make the student rules appear to
 * apply while silently evaluating a field that means nothing here.
 *
 * What is reused is the POLICY, not the function. From
 * `docs/design/STUDENT-DATA-POLICY.md`:
 *
 *   - "Assume publication is NOT authorised until a specific record says
 *     otherwise."
 *   - `consentRef` is "not nullable on a published record".
 *   - `consentPhoto` authorises "showing a photograph - never implied by
 *     anything else".
 *
 * Those three sentences are the whole of the rule below.
 */

/** The stored shape this module needs. Deliberately not the Prisma type. */
export type GalleryRecord = {
  imageUrl: string | null;
  showsPeople: boolean;
  consentRef: string | null;
  consentPhoto: boolean;
  published: boolean;
};

export const GALLERY_CATEGORIES = [
  'CLASSROOMS',
  'EVENTS',
  'STUDENTS',
  'ACHIEVEMENTS',
  'SEMINARS',
  'CELEBRATIONS',
] as const;

export type GalleryCategoryValue = (typeof GALLERY_CATEGORIES)[number];

/** What a visitor reads. The enum is storage; this is language. */
export const CATEGORY_LABEL: Readonly<Record<GalleryCategoryValue, string>> = {
  CLASSROOMS: 'Classrooms',
  EVENTS: 'Events',
  STUDENTS: 'Students',
  ACHIEVEMENTS: 'Achievements',
  SEMINARS: 'Seminars',
  CELEBRATIONS: 'Celebrations',
};

/** Is this a category we recognise? Anything else is a probe or a stale link. */
export function isGalleryCategory(value: unknown): value is GalleryCategoryValue {
  return typeof value === 'string' && (GALLERY_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Would this photograph be visible to a logged-out visitor?
 *
 * ⚠ THE PHOTO PATH IS CHECKED HERE TOO, AND DELIBERATELY.
 *
 * The save action validates the path on the way in. This checks it again on the
 * way out, for the same reason `present()` does: the two guards fail
 * differently. The write guard protects data arriving through the path everyone
 * remembers; this one protects against a row that is ALREADY wrong - written by
 * a direct query, by an import somebody adds later, or by a defect of the kind
 * Topic 5 found in the stories action after it had been live for months.
 *
 * A bad path here means the photograph is not shown at all. For a gallery,
 * where the photograph IS the content, that means the item disappears rather
 * than rendering an empty frame.
 */
export function isGalleryItemPublic(record: GalleryRecord): boolean {
  if (!record.published) return false;
  if (!record.imageUrl || !isSafePhotoPath(record.imageUrl)) return false;

  // A photograph with nobody in it needs no student's permission.
  if (!record.showsPeople) return true;

  const ref = record.consentRef?.trim() ?? '';
  return ref.length > 0 && record.consentPhoto;
}

/**
 * Why this photograph cannot be published yet, in words a teacher can act on.
 *
 * Empty array means publishing is allowed. The admin uses this to disable the
 * publish control and explain itself, so nobody ever meets a database
 * constraint error — the same contract `blockersForPublishing()` has with the
 * student forms.
 *
 * The wording matters. "Violates gallery_items_published_requires_consent" is
 * true and useless. A teacher needs to know which box to tick.
 */
export function galleryBlockers(record: GalleryRecord): string[] {
  const blockers: string[] = [];

  if (!record.imageUrl || record.imageUrl.trim().length === 0) {
    blockers.push('Choose a photograph. A gallery entry needs one.');
  } else if (!isSafePhotoPath(record.imageUrl)) {
    blockers.push('That is not a photo on this website. Use the Choose photo button.');
  }

  if (record.showsPeople) {
    if (!record.consentRef || record.consentRef.trim().length === 0) {
      blockers.push(
        'Add the consent form reference you hold on file for the people in this photograph.',
      );
    }
    if (!record.consentPhoto) {
      blockers.push('Tick "Permission to publish this photograph".');
    }
  }

  return blockers;
}

/**
 * One sentence describing the record's current visibility, for the admin.
 *
 * Says what is true and, when it is not public, the FIRST thing to do about it.
 * Built from the same predicate the public page uses, so the two cannot drift.
 */
export function describeVisibility(record: GalleryRecord): {
  public: boolean;
  summary: string;
} {
  if (isGalleryItemPublic(record)) {
    return {
      public: true,
      summary: record.showsPeople
        ? 'On the website. Consent is recorded for the people in it.'
        : 'On the website. Marked as having nobody identifiable in it.',
    };
  }

  if (!record.published) {
    const blockers = galleryBlockers(record);
    return {
      public: false,
      summary:
        blockers.length > 0
          ? `Not on the website. ${blockers[0]}`
          : 'Not on the website. Tick "Show on the website" when it is ready.',
    };
  }

  /*
    Marked published, but not actually visible.

    This is the state that matters most and the one a teacher would otherwise
    never discover: consent was withdrawn after publication, or the stored path
    stopped being valid. The record still says `published: true`, and the
    photograph is correctly absent from the site. Saying "published" here would
    be the admin telling a comfortable lie.
  */
  const blockers = galleryBlockers(record);
  return {
    public: false,
    summary:
      blockers.length > 0
        ? `Marked for the website but NOT showing. ${blockers[0]}`
        : 'Marked for the website but not showing.',
  };
}
