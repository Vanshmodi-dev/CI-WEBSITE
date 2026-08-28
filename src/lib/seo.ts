import type { Metadata } from 'next';
import { institute, addressFull } from '@/config/institute';
import { isIndexable } from '@/config/launch';

/**
 * SEO helpers — Master Plan §17.
 *
 * Local search is close to the whole game for a single-location institute, so
 * page titles lead with the programme and the locality rather than with
 * superlatives. The previous site's title read "Best CA & Commerce Coaching in
 * Jaipur"; unsubstantiated superlatives are a weak ranking signal, every
 * competitor makes the same claim, and it invites scrutiny of advertising
 * claims. Specific beats superlative.
 *
 * ⚠ NOTHING HERE MAY INVENT A FACT. Every title, description and structured-data
 * field is assembled from `src/config/institute.ts` or from content the
 * institute entered in the admin. There is no marketing copy written to please
 * a crawler.
 */

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const TITLE_SUFFIX = `${institute.name} · ${institute.locality}`;

/** Canonical absolute URL for a path, with query preserved when given. */
export function canonicalUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export function pageMetadata({
  title,
  description,
  path = '/',
  canonical,
  noindex = false,
  robots,
}: {
  title: string;
  description: string;
  path?: string;
  /** Where this page's authority belongs, when that is not `path` itself. */
  canonical?: string;
  noindex?: boolean;
  /**
   * Per-page indexing policy for filtered and paginated views.
   *
   * ⚠ IGNORED WHILE THE LAUNCH SWITCH IS OFF. The root layout sets
   * `noindex, nofollow` sitewide until `src/config/launch.ts` says otherwise,
   * and a page-level `robots` key OVERRIDES the layout's. Emitting
   * `index: true` here before launch would therefore punch a hole straight
   * through the launch switch, one page at a time. So this is applied only when
   * `isIndexable()` already agrees; otherwise the sitewide noindex stands.
   */
  robots?: { index: boolean; follow: boolean };
}): Metadata {
  const url = canonicalUrl(canonical ?? path);

  let effectiveRobots: { index: boolean; follow: boolean } | undefined;
  if (noindex) {
    effectiveRobots = { index: false, follow: false };
  } else if (robots && (robots.index === false || isIndexable())) {
    // A "do not index this view" instruction is always safe to keep — it can
    // only narrow what is indexed. An "index this view" instruction is kept
    // only once the launch switch already agrees.
    effectiveRobots = robots;
  }

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — ${TITLE_SUFFIX}`,
      description,
      url,
      siteName: institute.name,
      locale: 'en_IN',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — ${TITLE_SUFFIX}`,
      description,
    },
    ...(effectiveRobots ? { robots: effectiveRobots } : {}),
  };
}

/* ------------------------------------------------------ listing policy ---- */

/**
 * Re-exported from `src/lib/indexing.ts`, where it lives import-free so the
 * unit tests can reach it. Callers should keep importing it from here.
 */
export { listingIndexing, type ListingIndexing } from '@/lib/indexing';

/* -------------------------------------------------------- structured data -- */

const ORG_ID = `${SITE_URL}/#organisation`;
const SITE_ID = `${SITE_URL}/#website`;

/**
 * schema.org for the institute.
 *
 * ⚠ DELIBERATELY OMITS AggregateRating AND Review.
 * Google's structured-data guidelines restrict marking up reviews collected on
 * another platform as your own. Our reviews come from the Google Business
 * Profile via the Review Engine, so claiming them as first-party structured
 * data risks a manual action against the whole domain — a far larger loss than
 * star snippets are worth. The reviews still display on the page; they are
 * simply not claimed as our own structured data. (Master Plan §13, §17.)
 *
 * ⚠ ALSO DELIBERATELY OMITS: foundingDate, founder, numberOfStudents,
 * alumni, award, hasCredential, aggregateRating, makesOffer, priceRange and
 * `Course` entries. Every one of those is a field we do not hold a verified
 * fact for, and every one of them is a field a template would fill in. An
 * absent field costs a little rich-result eligibility; an invented one is a
 * false claim published in machine-readable form, which is worse than the same
 * claim in prose because aggregators repeat it.
 *
 * Fields whose facts we do not yet hold are omitted rather than guessed, so
 * this object grows only when `src/config/institute.ts` grows.
 */
export type JsonLdContact = {
  addressLine: string;
  landmark: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  phoneE164: string;
  hours: readonly string[];
  /**
   * The resolved map point, or null.
   *
   * ⚠ PASSED IN RATHER THAN READ FROM CONFIG, AND THAT IS THE WHOLE POINT.
   *
   * `geo` used to read `institute.coordinates` directly while the ADDRESS above
   * came from the admin. That was fine only because both were unset. The moment
   * Topic 10 let a teacher enter a map point, a config-read `geo` would have
   * announced one location to a search engine while the page showed another —
   * on the single field a local listing is matched on. Master Plan §17 designs
   * NAP drift out structurally rather than watching for it, so the coordinates
   * arrive here already resolved, from the same call the page uses.
   */
  coordinates?: { lat: number; lng: number } | null;
  /**
   * The institute's social profiles, resolved from the admin.
   *
   * Here for the same reason `coordinates` is, and the note above is the
   * argument in full: these feed `sameAs`, which is how a search engine
   * confirms that a YouTube channel and this business are one organisation.
   * Reading them from config while the footer rendered the edited values would
   * be the identical mismatch, one field along.
   */
  social?: { youtube: string | null; instagram: string | null };
  /**
   * The institute's own email address, resolved from the admin, or null.
   *
   * ⚠ THE THIRD FIELD TO NEED THIS NOTE, AND THE ARGUMENT IS UNCHANGED.
   *
   * `email` was read straight from `institute.email`, which is pinned to null
   * in config and has been since Phase 3. Topic 12 made the address editable,
   * so the moment an institute entered one the contact page and the footer
   * showed it and the JSON-LD stayed silent — announcing to a search engine
   * that this organisation has no email while the page printed one.
   *
   * Reproduced in Phase 19: saved through the real editor, the footer rendered
   * `zzqa-office@example.invalid` and the structured data had no `email` key at
   * all. Exactly the mismatch `coordinates` and `social` were added to prevent,
   * one field along.
   */
  email?: string | null;
};

/**
 * `contact` overrides the code defaults with what the institute has actually
 * entered in the admin.
 *
 * WHY THIS IS NOT OPTIONAL POLISH. Structured data is a MACHINE-READABLE COPY
 * of what the page says, and Google treats a mismatch between the two as a
 * quality signal against the site. If the visible address is edited and the
 * JSON-LD keeps announcing the old one, the site is telling a search engine
 * something different from what it tells a person, on the single field a local
 * listing is matched on. The override keeps the two in step by construction.
 *
 * Called with no argument, this still returns exactly what it always did, so
 * anything without database access degrades to the shipped facts.
 */
export function instituteJsonLd(contact?: JsonLdContact) {
  const address = contact ?? {
    landmark: institute.address.landmark,
    line1: institute.address.line1,
    city: institute.address.city,
    state: institute.address.state,
    postalCode: institute.address.postalCode,
    phoneE164: institute.phonePrimary.e164,
    hours: [] as readonly string[],
    addressLine: addressFull,
  };

  const data: Record<string, unknown> = {
    '@type': 'EducationalOrganization',
    '@id': ORG_ID,
    name: institute.name,
    description: institute.tagline,
    url: SITE_URL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: [address.landmark, address.line1]
        .filter((part) => part.trim().length > 0)
        .join(', '),
      addressLocality: address.city,
      addressRegion: address.state,
      postalCode: address.postalCode,
      addressCountry: institute.address.country,
    },
    telephone: address.phoneE164,
  };

  /*
    The resolved value when we were given one, the shipped config otherwise —
    the same rule `geo` and `sameAs` follow below, for the same reason.
  */
  const email = contact ? (contact.email ?? null) : institute.email;
  if (email) data.email = email;
  if (institute.googleBusinessProfileUrl) {
    data.hasMap = institute.googleBusinessProfileUrl;
  }
  /*
    The resolved value when we were given one, the shipped config otherwise, so
    a caller with no database access still degrades to the typed facts.
  */
  const geo = contact ? (contact.coordinates ?? null) : institute.coordinates;
  if (geo) {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: geo.lat,
      longitude: geo.lng,
    };
  }

  /*
    THE SAME RULE AS `geo` ABOVE: the resolved value when we were given one,
    the shipped config otherwise.

    Topic 12 made the social links editable, and this was still reading the
    code constants — so the footer would have linked a channel the institute
    had just added while `sameAs` stayed silent about it. `sameAs` is how a
    search engine confirms that a YouTube channel and a business are the same
    organisation, so a mismatch here is not cosmetic.
  */
  const socialLinks = contact?.social
    ? [contact.social.youtube, contact.social.instagram]
    : [institute.social.youtube, institute.social.instagram];
  const sameAs = socialLinks.filter((u): u is string => Boolean(u));
  if (sameAs.length > 0) data.sameAs = sameAs;

  /*
    OPENING HOURS ARE DELIBERATELY NOT EMITTED FROM THE ADMIN FIELD.

    `openingHoursSpecification` needs a machine day-of-week and 24-hour opens
    and closes times. The admin field is free text, because that is what a
    teacher can actually write ("Mon to Sat, 9 to 7, closed Sunday"), and
    parsing that into a schema is guessing. Emitting a GUESSED opening time to
    a search engine is worse than emitting none: it can put wrong hours in a
    knowledge panel, which sends people to a locked door.

    So the visible page shows the teacher's words, and the structured data stays
    silent until `institute.hours` holds a properly structured value. That is a
    deliberate gap, recorded here rather than papered over.
  */
  if (institute.hours && institute.hours.length > 0) {
    data.openingHoursSpecification = institute.hours.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.days,
      opens: h.opens,
      closes: h.closes,
    }));
  }

  return data;
}

/**
 * WebSite.
 *
 * Three fields, all verified: the name from the logo, the origin we are served
 * from, and the language the pages are written in.
 *
 * ⚠ NO `potentialAction` / SearchAction. That property declares a site search
 * endpoint, and this site has no search. Declaring one because the snippet is
 * everywhere online would be advertising a feature that does not exist.
 */
export function websiteJsonLd() {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: institute.name,
    url: SITE_URL,
    inLanguage: 'en-IN',
    publisher: { '@id': ORG_ID },
  };
}

/**
 * The sitewide graph, emitted once in the root layout.
 *
 * One `@graph` rather than two separate <script> blocks: the WebSite references
 * the organisation by `@id`, and a single graph is what lets a consumer resolve
 * that reference without guessing they describe the same institute.
 */
export function siteJsonLd(contact?: JsonLdContact) {
  return {
    '@context': 'https://schema.org',
    '@graph': [instituteJsonLd(contact), websiteJsonLd()],
  };
}

/**
 * BreadcrumbList for a nested page.
 *
 * Built from the route the visitor actually navigated and the labels actually
 * shown on the page — never from invented category names. Emitted only where a
 * real hierarchy exists, which today is the course pages.
 */
export function breadcrumbJsonLd(trail: ReadonlyArray<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: canonicalUrl(step.path),
    })),
  };
}

/**
 * Serialise structured data for injection into a <script> block.
 *
 * `JSON.stringify` escapes what JSON needs and nothing more, so a string
 * containing `</script>` survives intact and closes the block early — the rest
 * of the value is then parsed as HTML. Every field we emit today comes from
 * static configuration, so this is not currently reachable; it is one edit to
 * `src/config/institute.ts` away from being reachable, and the fix costs three
 * replacements.
 *
 * `<`, `>` and `&` become their unicode escapes. That is still valid JSON and
 * still parses to the identical value, so nothing downstream changes.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** Used in the address block and the contact page. */
export const displayAddress = addressFull;
