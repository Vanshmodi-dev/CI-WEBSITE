import type { Metadata } from 'next';
import { institute, addressFull } from '@/config/institute';
import { getSiteContent, getContactBlock, whatsappLink } from '@/lib/site-content';
import { publicPageMetadata } from '@/lib/share-image';
import { Section, PageHeader, ClosingCta } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { Hidden } from '@/components/primitives/empty-state';
import { MapPanel } from '@/components/domain/map-panel';

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({
    title: `Contact — ${institute.locality}`,
    description: `Address, phone and directions for ${institute.name}, ${addressFull}.`,
    path: '/contact',
  });
}

/**
 * Contact — Master Plan §04 and §15.
 *
 * ACTIONS BEFORE INFORMATION. Someone on this page wants a human now, so call,
 * WhatsApp and directions are large targets at the top; the reference details
 * follow underneath.
 *
 * Every fact here comes from src/config/institute.ts. Hours, email and the map
 * are absent because the institute has not confirmed them — the blocks simply
 * do not render rather than showing a placeholder (§42).
 */
export default async function ContactPage() {
  // `getSiteContent()` is wrapped in React `cache()`, so the header, the
  // footer and this page share ONE query rather than three.
  const [contact, content] = await Promise.all([getContactBlock(), getSiteContent()]);
  /*
    THE MAP IS GATED ON A VERIFIED POINT, THE DIRECTIONS LINK IS NOT.

    This used to read `institute.placeId || institute.coordinates`, both of
    which are null and neither of which a teacher could ever set. It now reads
    the resolved value, so entering coordinates in Website text turns the map
    on with no deploy.

    Directions ship regardless: a directions link is a SEARCH handed to
    Google, not a pin we placed, so it is honest before the address has been
    checked against the Google Business Profile (checklist item C1, still
    open).
  */
  const hasMap = contact.coordinates !== null;

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title={<>{content['page.contact.title']}</>}
        standfirst={<>{content['page.contact.standfirst']}</>}
      >
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button href={contact.telHref} size="lg">
            Call {contact.phonePrimaryDisplay}
          </Button>
          <Button
            href={whatsappLink(contact.whatsappNumber)}
            external
            size="lg"
            variant="secondary"
          >
            WhatsApp
          </Button>
          <Button href={contact.directionsHref} external size="lg" variant="secondary">
            Get directions
          </Button>
          <Button href="/admissions" size="lg" variant="secondary">
            Send an enquiry
          </Button>
        </div>
      </PageHeader>

      <Section tone="surface" labelledBy="details-heading">
        <h2 id="details-heading" className="sr-only">
          Contact details
        </h2>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h3 className="eyebrow text-accent-text">Address</h3>
            <address className="mt-3 text-[17px] leading-relaxed text-text not-italic">
              {institute.name}
              <br />
              {contact.addressLine}
            </address>
          </div>

          <div>
            <h3 className="eyebrow text-accent-text">Phone</h3>
            <ul className="mt-3 flex flex-col gap-2 text-[17px]">
              <li>
                <a href={contact.telHref} className="text-link hover:text-link-hover">
                  {contact.phonePrimaryDisplay}
                </a>
              </li>
              {contact.phoneSecondaryDisplay ? (
                <li>
                  <a
                    href={`tel:${contact.phoneSecondaryDisplay.replace(/[^+\d]/g, '')}`}
                    className="text-link hover:text-link-hover"
                  >
                    {contact.phoneSecondaryDisplay}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          {/* Email renders only when a professional address exists. The
              previous site published a personal Gmail, so nothing is shown
              until somebody enters an address in Admin -> Website text
              (Master Plan §22). */}
          {contact.email ? (
            <div>
              <h3 className="eyebrow text-accent-text">Email</h3>
              <p className="mt-3 text-[17px]">
                <a
                  href={`mailto:${contact.email}`}
                  className="text-link hover:text-link-hover"
                >
                  {contact.email}
                </a>
              </p>
            </div>
          ) : null}

          {/* Opening hours are absent until somebody enters them in the admin.
              A wrong opening time sends someone to a closed building, so this
              stays blank rather than guessing. */}
          {contact.hours.length > 0 ? (
            <div>
              <h3 className="eyebrow text-accent-text">Opening hours</h3>
              <ul className="mt-3 flex flex-col gap-1 text-[17px] text-text">
                {contact.hours.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Section>

      {!contact.email ? (
        <Hidden reason="Email block — not entered yet (Admin → Website text → Contact details)" />
      ) : null}
      {contact.hours.length === 0 ? (
        <Hidden reason="Opening hours — not entered yet (Admin → Website text → Contact details)" />
      ) : null}
      {hasMap && contact.coordinates ? (
        <Section tone="paper" labelledBy="map-heading">
          <h2
            id="map-heading"
            className="font-display text-h2 font-bold leading-[1.15] tracking-[-0.015em] text-heading"
          >
            Where to find us
          </h2>
          <p className="measure mt-3 text-[17px] leading-relaxed text-muted">
            {institute.address.landmark
              ? `${institute.address.landmark}. `
              : ''}
            Use the directions button above if you are on your way.
          </p>
          <div className="mt-8">
            <MapPanel
              coordinates={contact.coordinates}
              label={`${institute.name}, ${contact.addressLine}`}
            />
          </div>
        </Section>
      ) : (
        <Hidden reason="Map — no coordinates entered yet (Admin → Website text → Contact details → Map location)" />
      )}

      <ClosingCta
        id="contact-cta"
        title={<>{content['page.contact.ctaTitle']}</>}
        body={<>{content['page.contact.ctaBody']}</>}
        actions={
          <>
            <Button href="/admissions" size="lg" variant="onBand">
              Send an enquiry
            </Button>
          </>
        }
      />
    </>
  );
}
