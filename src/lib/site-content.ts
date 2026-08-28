import 'server-only';

import { cache } from 'react';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { logUnexpected } from '@/lib/log';
import {
  EDITABLE_FIELDS,
  isEditableKey,
  resolveContent,
  addressLineFrom,
  phoneE164,
  navKeyFor,
} from '@/config/site-content';
import { primaryNav, footerNav } from '@/config/nav';
import { parseCoordinates, directionsUrl, type Coordinates } from '@/lib/location';
import { validateEmail, parseSocialUrl } from '@/lib/contact-links';

/**
 * Reading editable website copy.
 *
 * THE CONTRACT THIS FILE KEEPS: a public page that asks for content ALWAYS
 * gets a complete, valid set of values, whatever the database is doing.
 *
 * There are three ways this can go wrong in production and all three end the
 * same way — with the site rendering its code defaults, which are the words
 * that shipped and were reviewed:
 *
 *   - no database configured (a preview deploy, a misconfigured env)
 *   - the database is unreachable
 *   - a row exists for a key that is no longer in the registry
 *
 * The last one matters more than it looks. Removing a field from the registry
 * must not leave an orphaned row silently feeding text onto a page that no
 * longer declares it, so unknown keys are DISCARDED on read rather than merged.
 * The row stays in the table — deleting data on a read would be worse — but it
 * cannot reach a page.
 *
 * `cache()` deduplicates within one render: the header, the footer and three
 * sections all want the contact block, and that must be one query, not five.
 */

export type SiteContent = Readonly<Record<string, string>>;

/** Everything, resolved over the code fallbacks. Never throws, never partial. */
export const getSiteContent = cache(async (): Promise<SiteContent> => {
  if (!isDatabaseConfigured()) return resolveContent({});

  try {
    const rows = await getPrisma().siteSetting.findMany({
      select: { key: true, value: true },
    });

    const stored = new Map<string, string>();
    for (const row of rows) {
      // Unknown key: a field that used to exist, or a row written by an older
      // build. Dropped here rather than merged - see the note above.
      if (isEditableKey(row.key)) stored.set(row.key, row.value);
    }

    return resolveContent(stored);
  } catch (error) {
    logUnexpected('site-content.read.failed', error);
    return resolveContent({});
  }
});

/** The raw stored rows, for the admin editor. Admin-only by construction. */
export const getStoredSettings = cache(
  async (): Promise<Map<string, { value: string; updatedAt: Date; updatedBy: string | null }>> => {
    const out = new Map<string, { value: string; updatedAt: Date; updatedBy: string | null }>();
    if (!isDatabaseConfigured()) return out;

    try {
      const rows = await getPrisma().siteSetting.findMany();
      for (const row of rows) {
        out.set(row.key, {
          value: row.value,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        });
      }
    } catch (error) {
      logUnexpected('site-content.read-raw.failed', error);
    }
    return out;
  },
);

/* ------------------------------------------------------- shaped readers -- */

export type ContactBlock = {
  addressLine: string;
  phonePrimaryDisplay: string;
  phonePrimaryE164: string;
  phoneSecondaryDisplay: string | null;
  telHref: string;
  whatsappNumber: string;
  /** One entry per line the teacher typed. Empty when they typed nothing. */
  hours: readonly string[];
  /**
   * The verified map point, or null when nobody has supplied one.
   *
   * Null is the normal state today and it is what keeps the map hidden. A map
   * pin is a claim about a doorway; the address is a claim about a sector.
   */
  coordinates: Coordinates | null;
  /**
   * The institute's own email address, or null when none has been supplied.
   *
   * Null is the normal state today and it renders NOTHING — never a
   * placeholder, never a personal address carried over from the old site.
   */
  email: string | null;
  /** Social profiles the institute actually has. Absent ones are null. */
  social: { youtube: string | null; instagram: string | null };
  /**
   * "Get directions", always present.
   *
   * Built from the coordinates when they exist and from the address when they
   * do not, so the link works before the institute has verified a point. Both
   * forms are Google's documented Maps URLs API and both open the native maps
   * app on a phone.
   */
  directionsHref: string;
};

/**
 * The contact block, derived rather than stored where derivation is possible.
 *
 * `telHref` and the WhatsApp number are computed from the displayed number, so
 * the button can never dial something different from what the page shows. That
 * failure mode is not hypothetical: a site that prints one number and dials
 * another loses the enquiry AND looks fraudulent, and it is exactly what a
 * separate "display" and "e164" field invites the first time somebody updates
 * one and not the other.
 */
export async function getContactBlock(): Promise<ContactBlock> {
  const content = await getSiteContent();

  const primary = content['contact.phonePrimary'] ?? '';
  const secondary = (content['contact.phoneSecondary'] ?? '').trim();
  const e164 = phoneE164(primary);
  const hoursRaw = (content['contact.hours'] ?? '').trim();

  /*
    PARSED, NOT TRUSTED.

    The value went through `validateCoordinates` in the save action and through
    a CHECK constraint on the settings table before it got here. It is parsed
    AGAIN on the way out, for the same reason `present()` and
    `getPublishedGallery()` re-check a photo path: the guards fail differently.
    The write guard protects values arriving through the path everyone
    remembers; this protects against a row that is ALREADY wrong — written by a
    direct query, by an import somebody adds later, or by a defect of the kind
    Topic 5 found in the stories action after months in production.

    A value that fails here yields `null`, which hides the map. There is no
    degraded way to show a pin whose coordinates we do not trust.
  */
  const coordinates = parseCoordinates(content['contact.coordinates'] ?? '');
  const addressLine = addressLineFrom(content as Record<string, string>);

  /*
    RE-VALIDATED ON THE WAY OUT, exactly as the coordinates above are, and for
    the same reason: the write guard protects values arriving through the path
    everybody remembers, and this protects against a row that is ALREADY wrong
    — written by a direct query, or by an import somebody adds later. These
    three become `href` attributes on every page, so a bad one is not a
    cosmetic problem.
  */
  const emailRaw = (content['contact.email'] ?? '').trim();
  const email = emailRaw !== '' && validateEmail(emailRaw) === null ? emailRaw : null;

  /*
    THE KEYS ARE WRITTEN OUT, NOT BUILT FROM A TEMPLATE.

    `tests/site-content.test.ts` proves every registry key is read by real
    source, by looking for the key string in `src/`. A template literal
    `content[`social.${platform}`]` defeats that — and it defeated it QUIETLY,
    because the substring "social.youtube" also occurs in the unrelated
    property access `contact.social.youtube` further down the footer. The test
    went green on a coincidence rather than on a read.

    Spelling the keys out costs three lines and makes the proof real.
  */
  const socialOrNull = (platform: 'youtube' | 'instagram', raw: string) => {
    const value = raw.trim();
    if (value === '') return null;
    const parsed = parseSocialUrl(platform, value);
    return 'url' in parsed ? parsed.url : null;
  };

  return {
    addressLine,
    coordinates,
    email,
    social: {
      youtube: socialOrNull('youtube', content['social.youtube'] ?? ''),
      instagram: socialOrNull('instagram', content['social.instagram'] ?? ''),
    },
    directionsHref: directionsUrl(addressLine, coordinates),
    phonePrimaryDisplay: primary,
    phonePrimaryE164: e164,
    phoneSecondaryDisplay: secondary === '' ? null : secondary,
    telHref: `tel:${e164}`,
    // wa.me wants digits with no plus.
    whatsappNumber: e164.replace(/\D/g, ''),
    hours: hoursRaw === '' ? [] : hoursRaw.split('\n'),
  };
}

/**
 * A WhatsApp deep link built from the CURRENT number.
 *
 * Mirrors `whatsappHref()` in `src/config/institute.ts`, which stays as the
 * fallback path for anything that has no database access. The message text is
 * identical in both so an enquiry reads the same however it was generated.
 */
export function whatsappLink(number: string, context?: string): string {
  const message = context
    ? `Hi Commerce Insight, I'd like to know more about ${context}.`
    : `Hi Commerce Insight, I'd like to know more about your courses.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Is this menu entry shown? Toggles store "on" or "". */
export function isVisible(content: SiteContent, key: string): boolean {
  return (content[key] ?? 'on') === 'on';
}

/**
 * How many fields the institute has actually filled in.
 *
 * Used by the admin to show progress. Counts only fields whose stored value
 * DIFFERS from the fallback, because a row written with the same text the code
 * already had is not new information — and a "100% complete" badge earned by
 * saving unchanged defaults would be a lie told by our own dashboard.
 */
export function countCustomised(
  stored: ReadonlyMap<string, { value: string }>,
): { customised: number; total: number } {
  let customised = 0;
  for (const field of EDITABLE_FIELDS) {
    const row = stored.get(field.key);
    if (row && row.value.trim() !== field.fallback.trim()) customised += 1;
  }
  return { customised, total: EDITABLE_FIELDS.length };
}

/* ------------------------------------------------------------------ nav -- */

export type ResolvedNavLink = {
  href: string;
  label: string;
  children?: ReadonlyArray<{ href: string; label: string }>;
};

/**
 * The primary menu, with the teacher's labels and visibility applied.
 *
 * HREFS COME FROM CODE, ALWAYS. The stored settings can rename an entry and
 * hide an entry; they cannot point one somewhere else. Phase 6 removed four
 * menu items precisely because they linked to pages that did not exist, and an
 * editable href would put that failure back within one save.
 *
 * A submenu entry's label is the course name, which is itself code, so those
 * are left alone here.
 */
export async function getPrimaryNav(): Promise<ResolvedNavLink[]> {
  const content = await getSiteContent();

  return primaryNav
    .filter((link) => isVisible(content, navKeyFor(link.href, 'visible')))
    .map((link) => ({
      href: link.href,
      label: content[navKeyFor(link.href, 'label')] || link.label,
      children: link.children,
    }));
}

export type ResolvedFooterGroup = {
  heading: string;
  links: ReadonlyArray<{ href: string; label: string }>;
};

/**
 * The footer columns.
 *
 * A footer link whose menu entry has been hidden is hidden here too. Hiding
 * "Results" from the menu and leaving it in the footer would be a confusing
 * half-measure, and the teacher who hid it did not ask for that.
 *
 * A column left with no links renders nothing rather than an empty heading.
 */
export async function getFooterNav(): Promise<ResolvedFooterGroup[]> {
  const content = await getSiteContent();

  return footerNav
    .map((group) => ({
      heading:
        content[`footer.${group.heading.toLowerCase()}.heading`] || group.heading,
      links: group.links.filter((link) =>
        // Only links that HAVE a menu toggle are governed by it; /admissions
        // has no menu entry and is always shown.
        primaryNav.some((n) => n.href === link.href)
          ? isVisible(content, navKeyFor(link.href, 'visible'))
          : true,
      ),
    }))
    .filter((group) => group.links.length > 0);
}
