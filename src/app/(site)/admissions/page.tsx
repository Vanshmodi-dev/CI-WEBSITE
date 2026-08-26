import type { Metadata } from 'next';
import { institute } from '@/config/institute';
import { getContactBlock, whatsappLink } from '@/lib/site-content';
import { pageMetadata } from '@/lib/seo';
import { issueFormToken } from '@/lib/crypto';
import { Section, PageHeader } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import { Hidden } from '@/components/primitives/empty-state';
import { EnquiryForm } from './enquiry-form';

export const metadata: Metadata = pageMetadata({
  title: 'Admissions and enquiries',
  description: `Enquire about Class XI and XII Commerce, CA Foundation, CA Intermediate and CMA coaching at ${institute.name}, ${institute.locality}.`,
  path: '/admissions',
});

/**
 * The form carries a signed, time-stamped token, which must be minted per
 * request — a token baked in at build time would be stale for every visitor.
 * That is why this route is dynamic. It is a form page, so there is no static
 * caching benefit to lose.
 */
export const dynamic = 'force-dynamic';

export default async function AdmissionsPage() {
  const contact = await getContactBlock();

  const formToken = issueFormToken();

  return (
    <>
      <PageHeader
        eyebrow="Admissions"
        title={
          <>
            Talk to us about joining
          </>
        }
        standfirst={
          <>
            Tell us which class or course you are asking about and we will
            call you back. If you would rather talk straight away, WhatsApp or
            call us — that is often quicker.
          </>
        }
      >
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button
            href={whatsappLink(contact.whatsappNumber)}
            external
            variant="secondary"
          >
            Message on WhatsApp
          </Button>
          <Button href={contact.telHref} variant="secondary">
            Call {contact.phonePrimaryDisplay}
          </Button>
        </div>
      </PageHeader>

      {/*
        The admission process itself — steps, documents, whether a demo class
        is offered, and fees — is not published because Commerce Insight has
        not confirmed it. Inventing a process is exactly the failure this
        rebuild exists to correct (Master Plan §00, §42).
      */}
      <Hidden reason="Admission process steps — awaiting client confirmation" />
      <Hidden reason="Fees — awaiting client confirmation on whether to publish" />

      <Section tone="surface" labelledBy="enquiry-heading">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
          <div>
            <h2
              id="enquiry-heading"
              className="text-h2 font-bold leading-tight text-heading"
            >
              Send an enquiry
            </h2>
            <p className="measure mt-3 mb-8 text-[17px] leading-relaxed text-muted">
              Only the name and phone number are needed. Everything else helps
              us answer you better.
            </p>

            <EnquiryForm
              formToken={formToken}
              sourcePage="/admissions"
              phoneDisplay={contact.phonePrimaryDisplay}
              whatsappHref={whatsappLink(contact.whatsappNumber)}
            />
          </div>

          <aside className="lg:pt-2">
            <div className="rounded-md border border-rule bg-paper p-6">
              <h3 className="font-display text-h3 font-semibold text-heading">
                Prefer to talk?
              </h3>
              <ul className="mt-4 flex flex-col gap-3 text-small">
                <li>
                  <a
                    href={contact.telHref}
                    className="text-link hover:text-link-hover"
                  >
                    {contact.phonePrimaryDisplay}
                  </a>
                </li>
                <li>
                  <a
                    href={whatsappLink(contact.whatsappNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link hover:text-link-hover"
                  >
                    WhatsApp us
                  </a>
                </li>
              </ul>
              <p className="mt-5 border-t border-rule pt-4 text-[13px] leading-relaxed text-muted">
                We use your details only to reply to this enquiry.
              </p>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
