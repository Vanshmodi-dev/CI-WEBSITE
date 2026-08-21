import type { Metadata } from 'next';
import { institute, addressFull, telHref, whatsappHref } from '@/config/institute';
import { pageMetadata } from '@/lib/seo';
import { Container, Section } from '@/components/primitives/section';
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
export default function ContactPage() {
  const hasMap = Boolean(institute.placeId || institute.coordinates);

  return (
    <>
      <section className="border-b border-rule bg-paper">
        <Container>
          <div className="max-w-3xl py-16 md:py-20">
            <p className="eyebrow text-accent-text">Contact</p>
            <h1 className="mt-4 text-h1 font-bold leading-tight text-heading lg:text-[44px]">
              Come and see us
            </h1>
            <p className="measure mt-5 text-[18px] leading-relaxed text-muted">
              We are in {institute.locality}. Call or message us with any
              question about programmes, batches or admissions.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button href={telHref} size="lg">
                Call {institute.phonePrimary.display}
              </Button>
              <Button href={whatsappHref()} external size="lg" variant="secondary">
                WhatsApp
              </Button>
              <Button href="/admissions" size="lg" variant="secondary">
                Send an enquiry
              </Button>
            </div>
          </div>
        </Container>
      </section>

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
              {addressFull}
            </address>
          </div>

          <div>
            <h3 className="eyebrow text-accent-text">Phone</h3>
            <ul className="mt-3 flex flex-col gap-2 text-[17px]">
              <li>
                <a href={telHref} className="text-link hover:text-link-hover">
                  {institute.phonePrimary.display}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${institute.phoneSecondary.e164}`}
                  className="text-link hover:text-link-hover"
                >
                  {institute.phoneSecondary.display}
                </a>
              </li>
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

          {/* Opening hours are absent until confirmed — a wrong opening time
              sends someone to a closed building. */}
          {institute.hours && institute.hours.length > 0 ? (
            <div>
              <h3 className="eyebrow text-accent-text">Opening hours</h3>
              <ul className="mt-3 flex flex-col gap-1 text-[17px] text-text">
                {institute.hours.map((h) => (
                  <li key={h.days}>
                    {h.days}: {h.opens}–{h.closes}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Section>

      {!institute.email ? (
        <Hidden reason="Email block — no professional address supplied yet" />
      ) : null}
      {!institute.hours ? (
        <Hidden reason="Opening hours — awaiting client confirmation" />
      ) : null}
      {!hasMap ? (
        <Hidden reason="Map and directions — needs Place ID or coordinates (Master Plan §15)" />
      ) : null}

      <Section tone="band" labelledBy="contact-cta">
        <div className="max-w-2xl">
          <h2
            id="contact-cta"
            className="text-h2 font-bold leading-tight text-band-text"
          >
            Still deciding?
          </h2>
          <p className="measure mt-4 text-[17px] leading-relaxed text-band-muted">
            Send us an enquiry and we will talk you through the options.
          </p>
          <div className="mt-8">
            <Button href="/admissions" size="lg" variant="onBand">
              Send an enquiry
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
