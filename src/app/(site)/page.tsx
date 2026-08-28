import type { Metadata } from 'next';
import Link from 'next/link';
import { institute, publishedCourses } from '@/config/institute';
import { getSiteContent, getContactBlock, whatsappLink } from '@/lib/site-content';
import { getPublicReviews } from '@/lib/reviews/fetch';
import { pageMetadata } from '@/lib/seo';
import {
  getPublishedResults,
  getPublishedStories,
  getUpcomingBatches,
  getTopAnnouncement,
  getPublishedFaculty,
  getPublishedGallery,
  getPublishedVideos,
} from '@/lib/public-data';
import {
  Container,
  Section,
  SectionHeader,
  ClosingCta,
} from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';
import {
  ResultCard,
  StoryCard,
  BatchList,
  FacultyCard,
  ReviewCard,
} from '@/components/domain/public-cards';
import { GalleryStrip } from '@/components/domain/gallery-strip';
import { VideoStrip } from '@/components/domain/video-strip';

export const metadata: Metadata = pageMetadata({
  title: `Commerce coaching in ${institute.locality}`,
  description: `${institute.name} — ${institute.tagline}. Class XI and XII Commerce, CA Foundation, CA Intermediate and CMA in ${institute.locality}.`,
  path: '/',
});

export const revalidate = 900;

/** "All results →" style link. One implementation for every band that has one. */
function MoreLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-11 items-center gap-1.5 text-small font-medium text-link hover:text-link-hover"
    >
      {children}
      <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
        &rarr;
      </span>
    </Link>
  );
}

/**
 * Homepage.
 *
 * Band order follows Master Plan §03, with one rule applied throughout: a band
 * that has no real data DOES NOT RENDER. There are no sample toppers, no
 * placeholder statistics and no stock testimonials anywhere on this page.
 *
 * That means the homepage is currently short. It is short and true, which is
 * the trade this whole rebuild exists to make — the site it replaces was long
 * and partly invented.
 *
 * PHASE 15 LAYOUT NOTE. Every band used to be the same shape: eyebrow, navy
 * heading, three-column card grid. Stacked five deep with a 1.05:1 background
 * step between them, the page had no rhythm to scan by — the eye found no
 * edges, so nothing looked more important than anything else. The bands now
 * differ in SHAPE, which is the cue that survives being read at a glance and
 * at any contrast: the hero splits two ways with the programme list as its
 * counterweight, results are a dense numeric grid, batches are rows, stories
 * are two wide panels, location is an asymmetric split, and the closing call
 * to action is a single framed block. Same content, same data rules —
 * different silhouettes.
 */
export default async function HomePage() {
  const [
    content,
    contact,
    announcement,
    courseBatches,
    results,
    stories,
    faculty,
    reviewPayload,
    gallery,
    videos,
  ] = await Promise.all([
    getSiteContent(),
    getContactBlock(),
    getTopAnnouncement(),
    // Unlimited (the helper caps at 24) because the hero panel prints a per
    // programme count. Taking 4 here would have made that count a count of
    // "batches on this page", which is not what "3 upcoming" says to a reader.
    getUpcomingBatches(),
    getPublishedResults({ limit: 6 }),
    getPublishedStories(2),
    // Three is the homepage band; the full list is /faculty.
    getPublishedFaculty(3),
    getPublicReviews(),
    /*
      FOUR, AND THE NUMBER IS A BUDGET DECISION RATHER THAN A DESIGN ONE.

      Eight looked better and cost eight image requests. The homepage request
      budget in `scripts/verify-budget.mjs` is 20, the page was already at 22
      before this topic, and eight more took it to 30 - a regression this topic
      introduced and should not hand onward.

      Four is one full row at the desktop breakpoint and two rows on a phone,
      which still reads as a gallery rather than as a stray photograph. The
      band is a taste of the gallery; the full page is one link away and capped
      separately at 60.
    */
    getPublishedGallery({ limit: 4 }),
    /*
      THREE, AND THE BAND HIDES ITSELF BELOW THREE.

      Master Plan band 10: "3 latest videos, thumbnail + title. Band hidden if
      the channel has fewer than 3 videos." Four videos would be a fourth
      request for no editorial gain, and one or two videos in a three-column
      grid reads as a section that failed to load rather than as a taste of a
      library. Asking for four and showing three is how the band knows whether
      it has enough.
    */
    getPublishedVideos({ limit: 4 }),
  ]);

  /*
    THE TWO OWNER-SUPPLIED BANDS, ASSEMBLED HERE SO THE JSX STAYS READABLE.

    A stat counts only when BOTH halves are present: a number with nothing
    naming it, or a label with no number, is worse than showing neither. Same
    rule for a point — a heading with no sentence is still a point worth
    showing, but a sentence with no heading is not.
  */
  const trustStats = [1, 2, 3, 4]
    .map((n) => ({
      value: (content[`home.trust.${n}.value`] ?? '').trim(),
      label: (content[`home.trust.${n}.label`] ?? '').trim(),
    }))
    .filter((stat) => stat.value !== '' && stat.label !== '');

  const whyHeading = (content['home.why.heading'] ?? '').trim();
  const whyPoints = [1, 2, 3]
    .map((n) => ({
      title: (content[`home.why.${n}.title`] ?? '').trim(),
      body: (content[`home.why.${n}.body`] ?? '').trim(),
    }))
    .filter((point) => point.title !== '');

  const batchCountFor = (slug: string) =>
    courseBatches.filter((b) => b.courseSlug === slug).length;

  const courseName = (slug: string) =>
    institute.courses.find((c) => c.slug === slug)?.name ?? slug;

  // The band lists the soonest few; the panel counts all of them.
  const shownBatches = courseBatches.slice(0, 5);

  return (
    <>
      {/* 1 · Announcement — only while inside its validity window. */}
      {announcement ? (
        <div className="border-b border-navy-700 bg-band text-band-text">
          <Container>
            <p className="py-2.5 text-center text-small">
              {announcement.href ? (
                <Link href={announcement.href} className="text-band-text underline decoration-white/40 underline-offset-4 hover:decoration-white">
                  {announcement.message}
                </Link>
              ) : (
                announcement.message
              )}
            </p>
          </Container>
        </div>
      ) : null}

      {/*
        3 · Hero.

        The hero used to be a single left-aligned column on plain paper, which
        gave the largest type on the site nothing to sit against. It is now a
        split: the claim on the left, and on the right a panel that answers the
        question the claim provokes — "which programmes?" — using the real
        course list. Nothing invented; the panel is the same `courses` array
        the /courses page is built from, so it cannot drift out of date.
      */}
      <section className="border-b border-rule-strong bg-paper">
        <Container>
          <div className="grid grid-cols-1 items-center gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:py-28">
            <div>
              <p className="eyebrow flex items-center gap-2.5 text-accent-text">
                <span aria-hidden="true" className="h-[3px] w-7 shrink-0 rounded-full bg-accent" />
                {content['home.heroEyebrow']}
              </p>

              <h1 className="mt-5 font-display text-display font-bold leading-[1.04] tracking-[-0.025em] text-heading lg:text-[62px]">
                {content['home.heroTitleLine1']}
                {content['home.heroTitleLine2'] ? (
                  <>
                    <br />
                    {content['home.heroTitleLine2']}
                  </>
                ) : null}
              </h1>

              <p className="measure mt-6 text-[18px] leading-relaxed text-muted">
                {content['home.heroStandfirst']}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button href="/courses" size="lg">
                  Explore courses
                </Button>
                <Button href="/admissions" size="lg" variant="secondary">
                  Talk to us
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-rule bg-surface p-6 shadow-e1 md:p-7">
              <h2 className="eyebrow text-accent-text">What we teach</h2>
              <ul className="mt-4 divide-y divide-rule">
                {publishedCourses.map((course) => (
                  <li key={course.slug}>
                    <Link
                      href={`/courses/${course.slug}`}
                      className="group flex min-h-12 items-center justify-between gap-4 py-1 font-medium text-heading hover:text-link-hover"
                    >
                      <span className="min-w-0">
                        {course.name}
                        {batchCountFor(course.slug) > 0 ? (
                          <span className="ml-2 text-small font-normal text-muted">
                            {batchCountFor(course.slug)} upcoming
                          </span>
                        ) : null}
                      </span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-link transition-transform group-hover:translate-x-0.5"
                      >
                        &rarr;
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-5 border-t border-rule pt-4">
                <MoreLink href="/courses">All courses and details</MoreLink>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/*
        4 · Credibility strip — EMPTY UNTIL THE INSTITUTE FILLS IT IN.

        This comment used to read "DELIBERATELY ABSENT", and the reasoning was
        right: student numbers, years of experience and success rates are
        exactly the figures the previous site invented, and none of them is
        confirmed. What the comment did not do was the other half of the
        blueprint's instruction (§9): "the UI should be designed so these
        values can be dynamically updated later." There was no mechanism, so
        the day the institute confirmed a number, showing it needed a developer.

        There is one now. Every figure is an editable field that ships EMPTY,
        the band renders nothing at all until a pair is filled in, and nothing
        here can publish a number a human did not type.
      */}
      {trustStats.length > 0 ? (
        <Section tone="surface" className="py-10 md:py-12">
          <Container>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
              {trustStats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block font-display text-[30px] font-bold leading-none text-heading md:text-[36px]">
                      {stat.value}
                    </span>
                    <span className="mt-2 block text-small text-muted">{stat.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Container>
        </Section>
      ) : null}

      {/*
        4b · Why this institute — the same rule.

        §10 and §50 both ask for a value-proposition band, and the vision brief
        spells out six candidate cards. Every one of them ("Doubt Support",
        "Personal Attention") is a claim about a service, and both documents
        attach the same condition: "actual offerings sir se verify." So the
        wording is the institute's to write, the fallbacks are empty, and the
        band does not exist until somebody has written at least one point.
      */}
      {whyPoints.length > 0 ? (
        <Section tone="paper" labelledBy={whyHeading ? 'home-why' : undefined}>
          <Container>
            {whyHeading ? (
              <h2
                id="home-why"
                className="mb-8 font-display text-[26px] font-bold leading-tight text-heading md:text-[32px]"
              >
                {whyHeading}
              </h2>
            ) : null}
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {whyPoints.map((point) => (
                <li
                  key={point.title}
                  className="rounded-md border border-rule bg-surface p-5"
                >
                  <h3 className="font-display text-[17px] font-semibold text-heading">
                    {point.title}
                  </h3>
                  {point.body ? (
                    <p className="measure mt-2 text-small leading-relaxed text-muted">
                      {point.body}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      ) : null}

      {/*
        5 · Courses — DELIBERATELY NOT A SEPARATE BAND ANY MORE.

        The hero panel above already lists every published programme, with its
        upcoming-batch count and a link into each one. A three-card band
        immediately below it repeated three of those same five names, with the
        same batch counts and the same links, inside one scroll of the hero —
        the reader met "Class XI Commerce → " twice in a row and could not tell
        why. The panel won because it shows all five rather than three, and
        because it is what gives the hero something to sit against.

        The programme cards still exist and are still the whole of /courses.
      */}

      {/* 6 · Results — hidden entirely when nothing is published. */}
      {results.results.length > 0 ? (
        <Section tone="surface" labelledBy="home-results">
          <SectionHeader
            id="home-results"
            eyebrow="Results"
            title={content['home.section.results.heading']}
            action={<MoreLink href="/results">All results</MoreLink>}
          />

          <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.results.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* Batches — real records only. Rows, not cards: see BatchList. */}
      {courseBatches.length > 0 ? (
        <Section tone="paper" labelledBy="home-batches">
          <SectionHeader
            id="home-batches"
            eyebrow="Admissions open"
            title={content['home.section.batches.heading']}
            action={<MoreLink href="/admissions">Enquire about a batch</MoreLink>}
          />
          <BatchList batches={shownBatches} courseName={courseName} />
        </Section>
      ) : null}

      {/* 11 · Student stories — hidden entirely when none are published. */}
      {stories.length > 0 ? (
        <Section tone="surface" labelledBy="home-stories">
          <SectionHeader
            id="home-stories"
            eyebrow="Student stories"
            title={content['home.section.stories.heading']}
            action={<MoreLink href="/stories">All stories</MoreLink>}
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {stories.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        </Section>
      ) : null}

      {/*
        Faculty — "Meet Your Mentors" in the master directive.

        Like every other band on this page, it DOES NOT RENDER when there is
        nothing real to show. That rule is what let this site launch honestly,
        and a faculty band is exactly where it matters most: a grid of stock
        portraits is the single most common lie on a coaching website.
      */}
      {faculty.length > 0 ? (
        <Section tone="paper" labelledBy="home-faculty">
          <SectionHeader
            id="home-faculty"
            eyebrow="Meet your mentors"
            title={content['home.section.faculty.heading']}
            action={<MoreLink href="/faculty">All teachers</MoreLink>}
          />
          <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {faculty.map((member) => (
              <FacultyCard key={member.id} member={member} />
            ))}
          </div>
        </Section>
      ) : null}

      {/*
        Reviews — read from the Review Engine, never stored here.

        Like every other band, it does not render without real data. Here that
        rule does most of the work: with the engine inactive there is no
        payload, so there is nothing to show and nothing is shown. A coaching
        site with invented testimonials is the specific failure this rebuild
        exists to correct.
      */}
      {reviewPayload && reviewPayload.reviews.length > 0 ? (
        <Section tone="paper" labelledBy="home-reviews">
          <SectionHeader
            id="home-reviews"
            eyebrow={`Reviews on ${reviewPayload.sourceLabel}`}
            title={content['home.section.reviews.heading']}
            action={<MoreLink href="/reviews">All reviews</MoreLink>}
          />
          <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviewPayload.reviews.slice(0, 3).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </Section>
      ) : null}

      {/*
        11 · Videos.

        Master Plan section 04 moved this band above student stories, on the
        argument that video is the one piece of proof a visitor can judge
        directly, in seconds, without trusting anybody's word. It sits before
        the gallery, matching the master directive's homepage flow.

        The band hides itself below three videos, per band 10 — the same rule as
        every other band on this page, which renders nothing rather than
        something thin.

        No iframe and no player JavaScript here: three posters that link to
        /videos. See `video-strip.tsx`.
      */}
      {videos.length >= 3 ? (
        <Section tone="paper" labelledBy="home-videos">
          <SectionHeader
            id="home-videos"
            eyebrow="Videos"
            title={content['home.section.videos.heading']}
            action={<MoreLink href="/videos">All videos</MoreLink>}
          />
          <VideoStrip videos={videos.slice(0, 3)} />
        </Section>
      ) : null}

      {/*
        12 · Gallery.

        The master directive's homepage flow puts the gallery between the videos
        and the location, and that is where it sits. Like every other band it
        renders nothing at all when there is nothing real to show — the
        photographs here have already passed the consent filter in
        `getPublishedGallery()`, so a picture whose permission was withdrawn
        disappears from the homepage at the same moment it disappears from
        /gallery.

        The VIDEOS band is still absent: it needs a channel ID the institute has
        not supplied. Master Plan §22.
      */}
      {gallery.length > 0 ? (
        <Section tone="surface" labelledBy="home-gallery">
          <SectionHeader
            id="home-gallery"
            eyebrow="Gallery"
            title={content['home.section.gallery.heading']}
            action={<MoreLink href="/gallery">See the gallery</MoreLink>}
          />
          <GalleryStrip items={gallery} />
        </Section>
      ) : null}

      {/*
        13 · Location.

        This band was already a two-column grid, but the second column was
        empty — a 320px reserved track with nothing in it, so on desktop the
        address sat in a narrow measure for no reason. The right column now
        carries the two things somebody who has just found the address wants
        next, which is how to reach the place and who to ask for.
      */}
      <Section tone="paper" labelledBy="home-location">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
          <div>
            <SectionHeader
              id="home-location"
              eyebrow="Find us"
              title={`We’re in ${institute.locality}`}
              className="mb-0"
            />
            <address className="measure mt-5 text-[17px] leading-relaxed text-text not-italic">
              {contact.addressLine}
            </address>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href={contact.telHref}>
                Call {contact.phonePrimaryDisplay}
              </Button>
              {/*
                DIRECTIONS IS A DIRECTIONS LINK NOW.

                This button said "Contact & directions" and went to /contact,
                which had no directions on it — the site promised the thing in
                two places and delivered it in none. It now hands the visitor
                straight to Google's directions, which is what somebody reading
                a location band wants.
              */}
              <Button href={contact.directionsHref} external variant="secondary">
                Get directions
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-rule bg-paper p-6">
            <p className="eyebrow text-accent-text">Talk to us</p>
            <dl className="mt-4 flex flex-col divide-y divide-rule text-small">
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-muted">Phone</dt>
                <dd>
                  <a
                    href={contact.telHref}
                    className="inline-flex min-h-6 items-center font-medium text-link hover:text-link-hover"
                  >
                    {contact.phonePrimaryDisplay}
                  </a>
                </dd>
              </div>
              {contact.phoneSecondaryDisplay ? (
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-muted">Alternate</dt>
                  <dd className="font-medium text-text">
                    {contact.phoneSecondaryDisplay}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-muted">WhatsApp</dt>
                <dd>
                  <a
                    href={whatsappLink(contact.whatsappNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-6 items-center font-medium text-link hover:text-link-hover"
                  >
                    Message us
                  </a>
                </dd>
              </div>
              {/* Opening hours are null in config and stay absent until the
                  institute confirms them. No "9 AM – 7 PM" invented here. */}
              {contact.hours.map((line) => (
                <div key={line} className="py-3">
                  <dt className="sr-only">Opening hours</dt>
                  <dd className="text-text">{line}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      {/* 14 · Final call to action — see ClosingCta for why this is not a band. */}
      <ClosingCta
        id="home-cta"
        title={content['home.ctaTitle']}
        body={content['home.ctaBody']}
        actions={
          <>
            <Button href="/admissions" size="lg">
              Enquire now
            </Button>
            <Button
              href={whatsappLink(contact.whatsappNumber)}
              external
              size="lg"
              variant="secondary"
            >
              WhatsApp us
            </Button>
          </>
        }
      />
    </>
  );
}
