import type { Metadata } from 'next';
import { institute, addressFull } from '@/config/institute';
import { getContactBlock, whatsappLink } from '@/lib/site-content';
import { pageMetadata } from '@/lib/seo';
import { Section, PageHeader, ClosingCta } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { Hidden } from '@/components/primitives/empty-state';

export const metadata: Metadata = pageMetadata({
  title: `Contact — ${institute.locality}`,
  description: `Address, phone and directions for ${institute.name}, ${addressFull}.`,
  path: '/contact',
});

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
  const hasMap = Boolean(institute.placeId || institute.coordinates);
  const contact = await getContactBlock();

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title={
          <>
            Come and see us
          </>
        }
        standfirst={
          <>
            We are in {institute.locality}. Call or message us with any
            question about programmes, batches or admissions.
          </>
        }
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
              previous site published a personal Gmail; institute.email is
              null until a domain mailbox is set up (Master Plan §22). */}
          {institute.email ? (
            <div>
              <h3 className="eyebrow text-accent-text">Email</h3>
              <p className="mt-3 text-[17px]">
                <a
                  href={`mailto:${institute.email}`}
                  className="text-link hover:text-link-hover"
                >
                  {institute.email}
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

      {!institute.email ? (
        <Hidden reason="Email block — no professional address supplied yet" />
      ) : null}
      {contact.hours.length === 0 ? (
        <Hidden reason="Opening hours — not entered yet (Admin → Website text → Contact details)" />
      ) : null}
      {!hasMap ? (
        <Hidden reason="Map and directions — needs Place ID or coordinates (Master Plan §15)" />
      ) : null}

      <ClosingCta
        id="contact-cta"
        title={<>Still deciding?</>}
        body={
          <>
            Send us an enquiry and we will talk you through the options.
          </>
        }
        actions={
          <>
            <Button href="/admissions" size="lg">
              Send an enquiry
            </Button>
          </>
        }
      />
    </>
  );
}
