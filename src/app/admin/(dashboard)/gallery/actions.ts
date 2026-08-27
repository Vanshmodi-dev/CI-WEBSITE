'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { isValidRecordId, isSafePhotoPath } from '@/lib/validation';
import { logUnexpected } from '@/lib/log';
import { revalidateGallery } from '@/lib/revalidate-public';
import {
  galleryBlockers,
  isGalleryCategory,
  type GalleryCategoryValue,
} from '@/lib/gallery';
import {
  EDIT_TOKEN_FIELD,
  STALE_EDIT_MESSAGE,
  StaleEditError,
  isStaleEditError,
  parseEditToken,
} from '@/lib/stale-edit';

/**
 * Gallery mutations.
 *
 * EVERY EXPORTED ASYNC FUNCTION IN A 'use server' MODULE IS A PUBLIC ENDPOINT
 * (Phase 14). Both functions here re-authenticate rather than trusting the page
 * that rendered the form, and both validate the id for SHAPE before it reaches
 * Prisma — an id we never issued cannot select a row.
 *
 * This follows `faculty/actions.ts` rather than inventing a pattern: same
 * validation shape, same audit calls, same redirect-with-flag convention, same
 * stale-edit guard.
 *
 * WHAT IS DIFFERENT, AND WHY: gallery photographs are covered by
 * `docs/design/STUDENT-DATA-POLICY.md`, so this action carries a consent gate
 * that faculty does not. The gate is `galleryBlockers()`, imported rather than
 * written here, because the admin list, the form and the public read path all
 * have to give the same answer.
 */

const LIMITS = {
  alt: 200,
  caption: 300,
  consentRef: 200,
  photoUrl: 500,
  maxPriority: 1000,
} as const;

export type GalleryFormState = {
  status: 'idle' | 'error';
  message?: string;
  errors?: Partial<
    Record<'imageUrl' | 'alt' | 'caption' | 'category' | 'priority' | 'consentRef', string>
  >;
  /** Consent blockers, listed so the teacher knows which box to tick. */
  blockers?: string[];
  /**
   * What the teacher had typed when the save was refused.
   *
   * React resets a form once its action settles, so an uncontrolled input goes
   * back to its `defaultValue` even when the action returned an error and the
   * teacher is still looking at the form. Echoing the submitted values back
   * means that reset restores what they typed rather than what the record held
   * when the page opened. See the Topic 11 report, defect D-2.
   */
  values?: Record<string, string>;
};

/** Trim, bound, and strip control characters. Matches the CHECK constraints. */
function clean(raw: FormDataEntryValue | null, max: number): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

export async function saveGalleryItem(
  _prev: GalleryFormState,
  formData: FormData,
): Promise<GalleryFormState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const id = String(formData.get('id') ?? '').trim();
  // Present but not an id we could have issued: refuse rather than fall through
  // to the create branch, which would silently duplicate the record.
  if (id.length > 0 && !isValidRecordId(id)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }

  const imageUrl = clean(formData.get('imageUrl'), LIMITS.photoUrl);
  const alt = clean(formData.get('alt'), LIMITS.alt);
  const caption = clean(formData.get('caption'), LIMITS.caption);
  const categoryRaw = String(formData.get('category') ?? '').trim();
  const priorityRaw = String(formData.get('priority') ?? '0').trim();
  const consentRef = clean(formData.get('consentRef'), LIMITS.consentRef);

  const showsPeople = formData.get('showsPeople') === 'on';
  const consentPhoto = formData.get('consentPhoto') === 'on';
  const publishRequested = formData.get('published') === 'on';

  const errors: NonNullable<GalleryFormState['errors']> = {};

  /*
    THE PHOTOGRAPH IS GENUINELY REQUIRED HERE, AND THE FORM SAYS SO.

    Every other photo field on this site is optional, and Topic 5 added a
    regression test to keep them that way after the project shipped a field
    whose help text said "optional" while validation refused it empty.

    A gallery entry is the one case where the photograph IS the record, so the
    requirement is real. The contradiction that rule exists to prevent is
    between the LABEL and the VALIDATION, not the requirement itself — so the
    field is marked required in the form, the help text says a photograph is
    needed, and this message names the control to use.
  */
  if (imageUrl.length === 0) {
    errors.imageUrl = 'Choose a photograph. A gallery entry needs one.';
  } else if (!isSafePhotoPath(imageUrl)) {
    /*
      The value comes from the media picker, which only ever produces
      `/media/<hash>.<ext>`. "It comes from our own component" is exactly the
      assumption that was wrong in the stories action for months; the browser
      sends whatever it likes.
    */
    errors.imageUrl = 'That is not a photo on this website. Use the Choose photo button.';
  }

  if (alt.length < 3) {
    errors.alt = 'Describe the photograph, so people who cannot see it know what it shows.';
  }

  if (!isGalleryCategory(categoryRaw)) {
    errors.category = 'Choose which part of the gallery this belongs in.';
  }
  // Narrowed once, above, so the value written below is the enum and not a
  // string that merely looks like one.
  const category = categoryRaw as GalleryCategoryValue;

  const priority = Number(priorityRaw);
  if (!Number.isInteger(priority) || priority < 0 || priority > LIMITS.maxPriority) {
    errors.priority = `Order must be a whole number between 0 and ${LIMITS.maxPriority}.`;
  }

  if (Object.keys(errors).length > 0) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields.',
      errors,
      values: { alt, caption, category: categoryRaw, priority: priorityRaw, consentRef, showsPeople: showsPeople ? 'on' : '', consentPhoto: consentPhoto ? 'on' : '', published: publishRequested ? 'on' : '' },
    };
  }

  /*
    =========================================================================
    WITHDRAWING CONSENT TAKES THE PHOTOGRAPH DOWN. IT DOES NOT FAIL THE SAVE.
    =========================================================================
    A teacher unticking "Permission to publish this photograph" on a record
    that is currently on the website is almost always doing one thing: somebody
    has asked for that photograph to come down.

    Refusing the save until they also untick "Show on the website" would be
    defensible and is wrong, because of what happens in the meantime — the
    photograph STAYS PUBLIC while they work out what the error message wants.
    That is the opposite of what the person who asked for it wants, and it is
    the opposite of what the policy's "assume publication is not authorised"
    position implies.

    So consent that no longer covers publication forces `published: false`, and
    the teacher is told plainly that this is what happened. Fail closed means
    the ambiguous case resolves to "not published", not to "error".
  */
  const consentState = {
    imageUrl,
    showsPeople,
    consentRef: consentRef.length > 0 ? consentRef : null,
    consentPhoto,
    published: publishRequested,
  };
  const blockers = galleryBlockers(consentState);
  const published = publishRequested && blockers.length === 0;
  const forcedDown = publishRequested && !published;

  const data = {
    imageUrl,
    alt,
    caption: caption.length > 0 ? caption : null,
    category,
    priority,
    published,
    showsPeople,
    consentRef: consentRef.length > 0 ? consentRef : null,
    consentPhoto,
  };

  try {
    if (id.length > 0) {
      /*
        LOST-UPDATE GUARD. The form carries the row's `updatedAt`; the update
        requires it to still match. If the row moved underneath — a colleague
        edited it, or consent was withdrawn — the count comes back zero and the
        whole transaction is abandoned rather than half-applied.

        An ABSENT token is treated as stale: a form that cannot prove which
        version it was looking at has no business overwriting one. For this
        table that is the privacy-critical case, not merely a tidiness one — a
        stale form still holds the consent boxes as they were ticked before the
        withdrawal, and applying it would republish the photograph.
      */
      const expectedUpdatedAt = parseEditToken(formData.get(EDIT_TOKEN_FIELD));

      /*
        The PREVIOUS state is read inside the transaction, so the audit entry
        can say what actually changed rather than only what the row now says.
      */
      let wasPublished = false;
      let hadPhotoConsent = false;

      await getPrisma().$transaction(async (tx) => {
        const before = await tx.galleryItem.findUnique({
          where: { id },
          select: { published: true, consentPhoto: true },
        });
        wasPublished = before?.published ?? false;
        hadPhotoConsent = before?.consentPhoto ?? false;

        const applied = await tx.galleryItem.updateMany({
          where: expectedUpdatedAt
            ? { id, updatedAt: expectedUpdatedAt }
            : { id, updatedAt: new Date(0) },
          data,
        });
        if (applied.count === 0) throw new StaleEditError();
      });

      /*
        =====================================================================
        AN UNPUBLISH IS AUDITED AS AN UNPUBLISH, NOT AS AN EDIT
        =====================================================================
        Recording every save as "updated" would make the audit log unable to
        answer the one question anybody will ever ask it about this table:
        WHEN DID THAT PHOTOGRAPH COME DOWN, and did somebody put it back?

        `audit_log_action_known` already permits "unpublished" — it was in the
        constraint and nothing used it. Phase 12 found the opposite failure,
        an action recorded that the constraint silently rejected; this is the
        same lesson from the other side, an available action nobody used.

        The summary distinguishes a consent WITHDRAWAL from an ordinary
        unpublish, because those are different events with different urgency.
        It names neither a person nor a file — the audit log holds the action
        and the entity id, never the content.
      */
      const withdrawn = hadPhotoConsent && !consentPhoto;
      const action = published
        ? 'published'
        : wasPublished
          ? 'unpublished'
          : 'updated';
      const summary = published
        ? 'shown on the website'
        : withdrawn
          ? 'photograph permission withdrawn; taken off the website'
          : wasPublished
            ? 'taken off the website'
            : 'not shown on the website';

      await recordAudit(admin, action, 'GalleryItem', id, summary);
    } else {
      const created = await getPrisma().galleryItem.create({ data, select: { id: true } });
      await recordAudit(admin, 'created', 'GalleryItem', created.id);
    }
  } catch (error) {
    if (isStaleEditError(error)) {
      return { status: 'error', message: STALE_EDIT_MESSAGE };
    }
    logUnexpected('admin.gallery.save_failed', error);
    return {
      status: 'error',
      message: 'We could not save this right now. Please try again.',
    };
  }

  revalidatePath('/admin/gallery');
  revalidatePath('/admin');
  revalidateGallery();
  redirect(`/admin/gallery?${forcedDown ? 'consent=1' : 'saved=1'}`);
}

export async function deleteGalleryItem(formData: FormData): Promise<void> {
  const admin = await requireAdminOrNull();
  if (!admin) redirect('/admin/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!isValidRecordId(id)) redirect('/admin/gallery');

  try {
    await getPrisma().galleryItem.delete({ where: { id } });
    await recordAudit(admin, 'deleted', 'GalleryItem', id);
  } catch (error) {
    /*
      A delete of a row that is already gone lands here. It is not an error
      worth showing: the teacher asked for it to be gone and it is gone. It is
      still logged, because a burst of them is worth seeing.
    */
    logUnexpected('admin.gallery.delete_failed', error);
    redirect('/admin/gallery?error=1');
  }

  /*
    The PHOTOGRAPH IS NOT DELETED with the record.

    The same bytes may be used elsewhere — the media key is a content hash, so
    two records that show the same picture share one file. Removing the file
    here would break the other record. `npm run media:audit` reports files
    nothing references and `media:clean` reclaims them: the deliberate trade
    recorded in Topic 5, where an orphan file is recoverable and invisible and a
    broken reference is neither.
  */
  revalidatePath('/admin/gallery');
  revalidatePath('/admin');
  revalidateGallery();
  redirect('/admin/gallery?deleted=1');
}
