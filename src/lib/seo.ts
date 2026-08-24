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
export function instituteJsonLd() {
  const data: Record<string, unknown> = {
    '@type': 'EducationalOrganization',
    '@id': ORG_ID,
    name: institute.name,
    description: institute.tagline,
    url: SITE_URL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${institute.address.landmark}, ${institute.address.line1}`,
      addressLocality: institute.address.city,
      addressRegion: institute.address.state,
      postalCode: institute.address.postalCode,
      addressCountry: institute.address.country,
    },
    telephone: institute.phonePrimary.e164,
  };

  if (institute.email) data.email = institute.email;
  if (institute.googleBusinessProfileUrl) {
    data.hasMap = institute.googleBusinessProfileUrl;
  }
  if (institute.coordinates) {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: institute.coordinates.lat,
      longitude: institute.coordinates.lng,
    };
  }

  const sameAs = [institute.social.youtube, institute.social.instagram].filter(
    (u): u is string => Boolean(u),
  );
  if (sameAs.length > 0) data.sameAs = sameAs;

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
export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [instituteJsonLd(), websiteJsonLd()],
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

/** Used in the address block and the contact page. */
export const displayAddress = addressFull;
