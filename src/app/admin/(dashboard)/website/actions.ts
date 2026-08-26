'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminOrNull, recordAudit } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import { logUnexpected } from '@/lib/log';
import {
  EDIT_TOKEN_FIELD,
  STALE_EDIT_MESSAGE,
  StaleEditError,
  isStaleEditError,
  contentToken,
} from '@/lib/stale-edit';
import { institute } from '@/config/institute';
import {
  FIELD_GROUPS,
  fieldsInGroup,
  isEditableKey,
  cleanValue,
  validateValue,
  type FieldGroupId,
} from '@/config/site-content';

/**
 * Saving editable website copy.
 *
 * EVERY EXPORTED ASYNC FUNCTION IN A 'use server' MODULE IS A PUBLIC ENDPOINT.
 * Phase 14 established this the hard way: an exported helper here can be POSTed
 * directly, without any page ever rendering and without the form it belongs to
 * existing. So this module exports exactly ONE function, and that function
 * re-authenticates rather than trusting the layout that rendered the form.
 *
 * WHAT AN ATTACKER CONTROLS AND WHAT THEY DO NOT.
 *
 * They control the whole FormData: any key, any value, any length. What they
 * cannot do is write a key that is not in the registry, because the save loop
 * iterates over the REGISTRY and reads the form, never the other way round.
 * Extra fields in the payload are not rejected with an error — they are simply
 * never looked at, which is the strongest form of ignoring them.
 */

export type WebsiteFormState = {
  status: 'idle' | 'saved' | 'error';
  message?: string;
  /** Keyed by field key, so each input can render its own message. */
  errors?: Record<string, string>;
  /** Which group was saved, so the page can confirm the right panel. */
  group?: string;
};


function isGroupId(value: string): value is FieldGroupId {
  return FIELD_GROUPS.some((g) => g.id === value);
}

/**
 * Clear the public pages this group feeds.
 *
 * Contact details and navigation appear in the header and footer of EVERY
 * page, so those two clear the whole site. The narrower groups clear only what
 * they touch, because discarding the results cache to change a homepage
 * heading would make an unrelated page slow for no reason.
 */
function revalidateFor(group: FieldGroupId): void {
  const routes =
    group === 'contact' || group === 'navigation'
      ? [
          '/',
          '/about',
          '/courses',
          '/results',
          '/stories',
          '/announcements',
          '/contact',
          '/admissions',
          ...institute.courses.map((c) => `/courses/${c.slug}`),
        ]
      : group === 'courses'
        ? ['/courses', ...institute.courses.map((c) => `/courses/${c.slug}`)]
        : group === 'about'
          ? ['/about']
          : ['/'];

  for (const route of routes) revalidatePath(route);
  // The sitemap's dates are content-derived, so any content change ages it.
  revalidatePath('/sitemap.xml');
  revalidatePath('/admin/website');
  revalidatePath('/admin/preview');
}

export async function saveWebsiteContent(
  _prev: WebsiteFormState,
  formData: FormData,
): Promise<WebsiteFormState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const groupRaw = String(formData.get('group') ?? '').trim();
  if (!isGroupId(groupRaw)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }
  const group = groupRaw;

  /*
    SINGLE-FIELD MODE (Phase 16, Topic 4).

    The click-to-edit preview edits one field at a time, so `only` narrows the
    save to a single key. It is validated against the GROUP'S field list, not
    against the registry at large: a payload naming a real key from another
    group is refused rather than quietly written, because the token the form
    carries was computed over this group's rows and would not have covered it.
  */
  const onlyRaw = String(formData.get('only') ?? '').trim();
  const groupFields = fieldsInGroup(group);

  if (onlyRaw.length > 0 && !groupFields.some((f) => f.key === onlyRaw)) {
    return { status: 'error', message: 'Something went wrong. Please reload the page.' };
  }

  const fields = onlyRaw.length > 0
    ? groupFields.filter((f) => f.key === onlyRaw)
    : groupFields;

  const errors: Record<string, string> = {};
  const writes: { key: string; value: string }[] = [];

  for (const field of fields) {
    // A toggle that is off sends nothing at all, which is exactly what an
    // unchecked checkbox does. `cleanValue` turns absence into "".
    const raw = formData.get(field.key);
    const cleaned = cleanValue(field, raw);

    const error = validateValue(field, cleaned);
    if (error) {
      errors[field.key] = error;
      continue;
    }
    writes.push({ key: field.key, value: cleaned });
  }

  if (Object.keys(errors).length > 0) {
    return {
      status: 'error',
      group,
      errors,
      message: 'Some of these need a look before they can be saved.',
    };
  }

  // Belt and braces. Every key here came from the registry a few lines above,
  // so this can only fire if the registry itself has drifted out of its own
  // charset - in which case refusing the whole save is right, because the
  // database CHECK constraint would refuse it anyway and half-written content
  // is worse than none.
  for (const write of writes) {
    if (!isEditableKey(write.key)) {
      logUnexpected('website.save.unknown-key', new Error(write.key));
      return { status: 'error', message: 'Something went wrong. Please reload the page.' };
    }
  }

  /*
    LOST-UPDATE GUARD.

    The form carries the latest `updatedAt` across the keys it is about to
    write. Inside the transaction that value is recomputed and compared; a
    mismatch throws, so nothing is committed - not even the keys that would
    have been fine. A half-applied save is harder to reason about than a
    refused one, and the teacher is told what happened rather than discovering
    later that a colleague's change vanished.

    An ABSENT token is treated as stale whenever rows already exist. A form
    that cannot prove which version it was looking at has no business
    overwriting one.
  */
  const submittedToken = String(formData.get(EDIT_TOKEN_FIELD) ?? '').trim();
  const keys = writes.map((w) => w.key);

  try {
    await getPrisma().$transaction(async (tx) => {
      const current = await tx.siteSetting.findMany({
        where: { key: { in: keys } },
        select: { updatedAt: true },
      });

      if (contentToken(current) !== submittedToken) throw new StaleEditError();

      for (const write of writes) {
        await tx.siteSetting.upsert({
          where: { key: write.key },
          create: {
            key: write.key,
            value: write.value,
            updatedBy: admin.displayName.slice(0, 80),
          },
          update: {
            value: write.value,
            updatedBy: admin.displayName.slice(0, 80),
          },
        });
      }
    });
  } catch (error) {
    if (isStaleEditError(error)) {
      return { status: 'error', group, message: STALE_EDIT_MESSAGE };
    }
    logUnexpected('website.save.failed', error);
    return {
      status: 'error',
      group,
      message: 'That could not be saved. Please try again.',
    };
  }

  // The audit log records the SHAPE of a change, never its content - the same
  // rule the student tables follow. Which group was edited and by whom is
  // enough to answer "who changed the phone number last week?"; storing the old
  // and new text here would put website copy in a table designed to be kept
  // long after the content itself is gone.
  await recordAudit(
    admin,
    'updated',
    'site_settings',
    onlyRaw.length > 0 ? onlyRaw : group,
    `${writes.length} field${writes.length === 1 ? '' : 's'}`,
  );

  revalidateFor(group);

  return {
    status: 'saved',
    group,
    message: 'Saved. The website has been updated.',
  };
}
