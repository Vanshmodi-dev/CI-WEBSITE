/**
 * COMMERCE INSIGHT — the single source of truth for institute facts.
 * =============================================================================
 *
 * Master Plan §11 and §17. Every surface that states a fact about the institute
 * reads it from here: the header, the footer, the contact page, the map panel,
 * and the schema.org output. NAP consistency is therefore STRUCTURAL — it can't
 * drift, because there is only one copy.
 *
 * ⚠ DO NOT hardcode an address, phone number or email anywhere else in the app.
 *
 * -----------------------------------------------------------------------------
 * VERIFICATION STATUS
 * -----------------------------------------------------------------------------
 * Values marked `unverified` were carried over from the previous website. That
 * site also published fabricated toppers and testimonials (Master Plan §00), so
 * nothing from it is trusted until Commerce Insight re-confirms it in writing.
 *
 * `unverified` does NOT mean "probably wrong" — it means "not yet confirmed by
 * the client". These must all read `verified` before the site goes public.
 * `npm run verify` does not check this; the Phase 6 content audit does.
 */

export type VerificationState = 'verified' | 'unverified' | 'awaiting-client';

/** Fields the client has not yet confirmed. Phase 6 audit gate. */
export const UNVERIFIED_FACTS = [
  'address',
  'phonePrimary',
  'phoneSecondary',
  'hours',
] as const satisfies readonly string[];

/** Facts we do not have at all, so the UI must render nothing for them. */
export const AWAITING_CLIENT = [
  'email',
  'googleBusinessProfileUrl',
  'placeId',
  'coordinates',
  'youtubeChannelUrl',
  'instagramUrl',
  'legalEntityName',
] as const satisfies readonly string[];

export const institute = {
  /** Legal/display name. Must match the Google Business Profile exactly. */
  name: 'Commerce Insight',

  /**
   * Taken verbatim from the logo artwork, so this is confirmed brand copy.
   * The only tagline authorised for use.
   */
  tagline: 'Exclusive Institute for Commerce Education',

  locality: 'Pratap Nagar, Jaipur',

  address: {
    status: 'unverified' as VerificationState,
    landmark: 'Near Pannadhay Circle',
    line1: 'Pratap Nagar',
    city: 'Jaipur',
    state: 'Rajasthan',
    postalCode: '302033',
    country: 'IN',
  },

  /**
   * ONE primary number. The previous site advertised two, which weakens local
   * SEO (Master Plan §17) — Google prefers a single consistent phone per
   * listing. The secondary is kept for the contact page only, not for
   * schema.org or the header.
   */
  phonePrimary: {
    status: 'unverified' as VerificationState,
    display: '+91 95090 17150',
    e164: '+919509017150',
  },
  phoneSecondary: {
    status: 'unverified' as VerificationState,
    display: '+91 96641 10109',
    e164: '+919664110109',
  },

  /**
   * WhatsApp — the primary conversion path (Master Plan §07).
   * Uses the primary number.
   */
  whatsapp: {
    e164: '919509017150',
  },

  /**
   * NULL ON PURPOSE. The previous site published a personal Gmail address
   * (a gaming handle). That cannot appear on an institute's website, and it
   * is also unreliable for enquiry notifications, which need SPF/DKIM on the
   * institute's own domain (Master Plan §16).
   *
   * Components must render nothing when this is null — never a placeholder.
   */
  email: null as string | null,

  /** Awaiting client. Contact page and schema.org omit hours until supplied. */
  hours: null as ReadonlyArray<{ days: string; opens: string; closes: string }> | null,

  /** Awaiting client — blocks the map panel and LocalBusiness schema (§15). */
  googleBusinessProfileUrl: null as string | null,
  placeId: null as string | null,
  coordinates: null as { lat: number; lng: number } | null,

  /** Awaiting client — the footer renders only links that exist (§32). */
  social: {
    youtube: null as string | null,
    instagram: null as string | null,
  },

  /** Awaiting client — needed for the privacy policy and terms. */
  legalEntityName: null as string | null,

  /**
   * Programmes. Carried from the previous site, which listed more than the
   * brief did (it omitted CA Intermediate and CMA). Slugs are the route
   * segments. `published` gates a course out of nav and sitemap.
   *
   * These are PROGRAMME NAMES, not institute claims — "CA Foundation" is a
   * nationally defined qualification, not something invented here. What is
   * still unconfirmed is everything ABOUT each one: syllabus, fees, timings,
   * who teaches it. Those fields do not exist in this config and the course
   * pages render honest empty states for them rather than inventing content.
   */
  courses: [
    { slug: 'class-11-commerce', name: 'Class XI Commerce', short: 'Class 11', published: true },
    { slug: 'class-12-commerce', name: 'Class XII Commerce', short: 'Class 12', published: true },
    { slug: 'ca-foundation', name: 'CA Foundation', short: 'CA Foundation', published: true },
    { slug: 'ca-intermediate', name: 'CA Intermediate', short: 'CA Inter', published: true },
    { slug: 'cma', name: 'CMA Foundation & Inter', short: 'CMA', published: true },
  ],
};

/** The address as one line, for the footer, contact page and schema.org. */
export const addressFull = [
  institute.address.landmark,
  institute.address.line1,
  institute.address.city,
  `${institute.address.state} ${institute.address.postalCode}`,
].join(', ');

/** `tel:` href for the primary number. */
export const telHref = `tel:${institute.phonePrimary.e164}`;

/**
 * Pre-filled WhatsApp deep link. `context` attributes the enquiry to the page
 * it came from, so a lead arrives already saying which course (Master Plan §07).
 */
export function whatsappHref(context?: string): string {
  const message = context
    ? `Hi Commerce Insight, I'd like to know more about ${context}.`
    : `Hi Commerce Insight, I'd like to know more about your courses.`;
  return `https://wa.me/${institute.whatsapp.e164}?text=${encodeURIComponent(message)}`;
}

/** Courses that have a written content page. Drives nav and sitemap. */
export const publishedCourses = institute.courses.filter((c) => c.published);
