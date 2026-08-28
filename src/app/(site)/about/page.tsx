import type { Metadata } from 'next';
import Link from 'next/link';
import { institute, publishedCourses } from '@/config/institute';
import { getSiteContent, getContactBlock } from '@/lib/site-content';
import { fieldFor } from '@/config/site-content';
import { pageMetadata } from '@/lib/seo';
import {
  Section,
  SectionHeader,
  PageHeader,
  ClosingCta,
} from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';

export const metadata: Metadata = pageMetadata({
  title: 'About',
  description: `${institute.name} — ${institute.tagline}, in ${institute.locality}.`,
  path: '/about',
});

/**
 * About.
 *
 * ⚠ WHAT IS AND IS NOT VERIFIED HERE.
 *
 * Verified, and therefore used:
 *   - the institute's name
 *   - its tagline, taken verbatim from the logo artwork
 *   - the programmes it offers (src/config/institute.ts)
 *   - its locality
 *
 * NOT verified, and therefore ABSENT — not softened, not hedged, absent:
 *   - the year it was founded        - who founded it
 *   - faculty names or credentials   - student numbers
 *   - pass rates or achievements     - awards or affiliations
 *   - class sizes or infrastructure
 *
 * A page like this normally opens with "Founded in 2005 by...". We do not know
 * that, so it does not appear. The page is built around what is true, and the
 * one section that would otherwise be filled with invented history instead
 * states plainly what the institute does — which is verifiable from its own
 * name and its own programme list.
 */
export default async function AboutPage() {
  const [content, contact] = await Promise.all([getSiteContent(), getContactBlock()]);

  /**
   * Has somebody actually written the story yet?
   *
   * The fallback text SAYS the story is still being written, and it is framed
   * in a dashed border to make that visibly deliberate. The moment a real story
   * is saved in the admin, both of those become wrong — a finished paragraph
   * inside a "coming soon" frame, under an eyebrow reading "Being written", is
   * worse than either state on its own. So the frame is tied to whether the
   * text is still the placeholder.
   */
  const storyWritten =
    (content['about.story'] ?? '').trim() !==
    (fieldFor('about.story')?.fallback ?? '').trim();

  return (
    <>
      <PageHeader
        eyebrow="About"
        title={<>{content['about.title']}</>}
        standfirst={<>{content['about.standfirst']}</>}
      />

      {/* What we do — grounded entirely in the programme list. */}
      <Section tone="surface" labelledBy="what-heading">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
          <div>
            <SectionHeader
              id="what-heading"
              eyebrow="Commerce only"
              title={content['about.whatWeTeachHeading']}
              className="mb-6"
            />
            <p className="measure text-[17px] leading-relaxed text-text">
              {content['about.whatWeTeach']}
            </p>
            <p className="measure mt-4 text-[17px] leading-relaxed text-text">
              {content['about.whatWeTeachMore']}
            </p>
          </div>

          <aside>
            <div className="rounded-md border border-rule bg-paper p-6">
              <h3 className="eyebrow text-accent-text">Programmes</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {publishedCourses.map((course) => (
                  <li key={course.slug}>
                    <Link
                      href={`/courses/${course.slug}`}
                      className="text-[17px] text-link hover:text-link-hover"
                    >
                      {course.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </Section>

      {/*
        The institute's story, its founder and its faculty belong here. We do
        not have them, so rather than inventing a history this section says
        what is true today and offers a way to ask.
      */}
      <Section tone="paper" labelledBy="story-heading">
        <div
          className={
            storyWritten
              ? 'max-w-2xl'
              : 'max-w-2xl rounded-lg border border-dashed border-rule-strong p-8 md:p-10'
          }
        >
          <SectionHeader
            id="story-heading"
            eyebrow={storyWritten ? 'The institute' : 'Being written'}
            title={content['about.storyHeading']}
            className="mb-5"
          />
          <p
            className={
              storyWritten
                ? 'text-[17px] leading-relaxed text-text'
                : 'text-[17px] leading-relaxed text-muted'
            }
          >
            {content['about.story']}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href={contact.telHref} variant="secondary">
              Call {contact.phonePrimaryDisplay}
            </Button>
            <Button href="/contact" variant="secondary">
              Visit us
            </Button>
          </div>
        </div>
      </Section>

      <ClosingCta
        id="about-cta"
        title={<>{content['page.about.ctaTitle']}</>}
        body={<>{content['page.about.ctaBody']}</>}
        actions={
          <>
            <Button href="/admissions" size="lg">
              Send an enquiry
            </Button>
            {/*
              Kept pointing at /contact deliberately: from an About page the
              useful next step is the full contact panel — phone, WhatsApp,
              hours and the map — not a bare hand-off to Google. The label is
              corrected so it stops promising directions it does not give.
            */}
            <Button href="/contact" size="lg" variant="secondary">
              Find us
            </Button>
          </>
        }
      />
    </>
  );
}
