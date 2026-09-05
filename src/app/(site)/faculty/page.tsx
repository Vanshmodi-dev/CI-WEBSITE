import type { Metadata } from 'next';
import { institute } from '@/config/institute';
import { publicPageMetadata } from '@/lib/share-image';
import { getPublishedFaculty } from '@/lib/public-data';
import { getSiteContent, getContactBlock, whatsappLink } from '@/lib/site-content';
import { Section, PageHeader, ClosingCta } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { FacultyCard } from '@/components/domain/public-cards';

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({
    title: 'Our teachers',
    description: `The people who teach at ${institute.name} in ${institute.locality}.`,
    path: '/faculty',
  });
}

export const revalidate = 900;

/**
 * /faculty — the teaching staff.
 *
 * =============================================================================
 * WHY THERE IS NO PER-TEACHER PAGE
 * =============================================================================
 * The master directive asks for "dedicated faculty pages: qualifications,
 * experience, teaching philosophy, achievements". Every one of those is
 * information this project does not have, and the same directive says "only
 * publish verified information". A detail route would therefore be a set of
 * empty pages inviting somebody to fill them with claims nobody checked — which
 * is the failure the whole rebuild exists to correct.
 *
 * It also matches the architecture already here: results and stories are list
 * pages with no per-record route. When real credentials arrive, a detail route
 * is an additive change.
 *
 * =============================================================================
 * NO Person / EducationalOrganization STRUCTURED DATA
 * =============================================================================
 * Emitting `Person` markup for staff would assert to a search engine that these
 * are real, verified people with these exact roles. The names are whatever the
 * institute typed, unverified by us, and `alumniOf`/`hasCredential` would be
 * invented outright. `src/lib/seo.ts` already refuses to claim reviews it did
 * not collect; this is the same rule.
 */
export default async function FacultyPage() {
  // `getSiteContent()` is wrapped in React `cache()`, so the header, the
  // footer and this page share ONE query rather than three.
  const [faculty, contact, content] = await Promise.all([
    getPublishedFaculty(),
    getContactBlock(),
    getSiteContent(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Our teachers"
        title={<>{content['page.faculty.title']}</>}
        standfirst={<>{content['page.faculty.standfirst']}</>}
      />

      {/*
        THE EMPTY STATE IS A REAL STATE, NOT A PLACEHOLDER.

        Every band on this site hides itself when it has no real data — that
        rule is what let the site launch honestly. This page cannot hide
        itself, because it is a route somebody navigated to, so it says
        plainly that the section is being prepared and offers the thing a
        visitor actually wants next: a way to ask.

        No invented teachers. No stock portraits. No "Coming soon" with a
        greyed-out grid of empty cards.
      */}
      {faculty.length === 0 ? (
        <Section tone="surface" labelledBy="faculty-empty">
          <div className="max-w-2xl rounded-lg border border-dashed border-rule-strong p-8 md:p-10">
            <h2
              id="faculty-empty"
              className="font-display text-h2 font-bold leading-[1.15] tracking-[-0.015em] text-heading"
            >
              We are putting this page together
            </h2>
            <p className="measure mt-4 text-[17px] leading-relaxed text-muted">
              We would rather introduce our teachers properly than put up names
              and photographs in a hurry. In the meantime, the fastest way to
              meet them is to visit — or call and ask who teaches your subject.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href={contact.telHref}>
                Call {contact.phonePrimaryDisplay}
              </Button>
              <Button href="/contact" variant="secondary">
                Visit us
              </Button>
            </div>
          </div>
        </Section>
      ) : (
        <Section tone="surface" labelledBy="faculty-list">
          <h2 id="faculty-list" className="sr-only">
            Teaching staff
          </h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {faculty.map((member) => (
              <li key={member.id} className="contents">
                <FacultyCard member={member} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ClosingCta
        id="faculty-cta"
        title={<>{content['page.faculty.ctaTitle']}</>}
        body={<>{content['page.faculty.ctaBody']}</>}
        actions={
          <>
            <Button href="/admissions" size="lg" variant="onBand">
              Send an enquiry
            </Button>
            <Button
              href={whatsappLink(contact.whatsappNumber)}
              external
              size="lg"
              variant="onBandSecondary"
            >
              WhatsApp us
            </Button>
          </>
        }
      />
    </>
  );
}
