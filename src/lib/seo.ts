import type { Metadata } from 'next';
import { institute, addressFull } from '@/config/institute';

/**
 * SEO helpers — Master Plan §17.
 *
 * Local search is close to the whole game for a single-location institute, so
 * page titles lead with the programme and the locality rather than with
 * superlatives. The previous site's title read "Best CA & Commerce Coaching in
 * Jaipur"; unsubstantiated superlatives are a weak ranking signal, every
 * competitor makes the same claim, and it invites scrutiny of advertising
 * claims. Specific beats superlative.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const TITLE_SUFFIX = `${institute.name} · ${institute.locality}`;

export function pageMetadata({
  title,
  description,
  path = '/',
  noindex = false,
}: {
  title: string;
  description: string;
  path?: string;
  noindex?: boolean;
}): Metadata {
  const url = new URL(path, SITE_URL).toString();
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
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

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
 * Fields whose facts we do not yet hold are omitted rather than guessed.
 */
export function instituteJsonLd() {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
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

/** Used in the address block and the contact page. */
export const displayAddress = addressFull;
