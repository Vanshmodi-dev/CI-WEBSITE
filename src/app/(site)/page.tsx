import type { Metadata } from 'next';
import Link from 'next/link';
import { institute, publishedCourses } from '@/config/institute';
import { getSiteContent, getContactBlock, whatsappLink } from '@/lib/site-content';
import { getPublicReviews } from '@/lib/reviews/fetch';
import { publicPageMetadata } from '@/lib/share-image';
import {
  getPublishedResults,
  getPublishedStories,
  getUpcomingBatches,
  getTopAnnouncement,
  getPublishedFaculty,
  getHeroPortrait,
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
import { cn } from '@/lib/cn';
import {
  ResultCard,
  StoryCard,
  BatchList,
  FacultyCard,
  ReviewCard,
} from '@/components/domain/public-cards';
import { GalleryStrip } from '@/components/domain/gallery-strip';
import { HeroPortrait } from '@/components/domain/hero-portrait';
import { VideoStrip } from '@/components/domain/video-strip';

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({
    title: `Commerce coaching in ${institute.locality}`,
    description: `${institute.name} — ${institute.tagline}. Class XI and XII Commerce, CA Foundation, CA Intermediate and CMA in ${institute.locality}.`,
    path: '/',
  });
}

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
 * at any contrast: the hero splits two ways with the teacher's portrait as its
 * counterweight (Phase 21; it was the programme list until the owner asked for
 * a face), results are a dense numeric grid, batches are rows, stories are two
 * wide panels, location is an asymmetric split, and the closing call to action
 * is a single framed block. Same content, same data rules — different
 * silhouettes.
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
    portrait,
    reviewPayload,
    gallery,
    videos,
  ] = await Promise.all([
    getSiteContent(),
    getContactBlock(),
    getTopAnnouncement(),
    // Unlimited, which the helper caps at 24. Phase 21 removed the hero panel
    // that printed a per-programme count, so this is now simply the list the
    // band draws its soonest five from; the read is unchanged and the extra
    // rows are discarded by `shownBatches` below.
    getUpcomingBatches(),
    getPublishedResults({ limit: 6 }),
    getPublishedStories(2),
    // Three is the homepage band; the full list is /faculty.
    getPublishedFaculty(3),
    /*
      THE HERO PORTRAIT — one more read of the same table, not a new mechanism.

      A separate query rather than `faculty.find((m) => m.photoUrl)` over the
      three rows above: those three are the homepage BAND, and the band's limit
      is an editorial choice. Deriving the hero from it would mean that raising
      or lowering the band silently changed whose photograph leads the page.
    */
    getHeroPortrait(),
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

  const courseName = (slug: string) =>
    institute.courses.find((c) => c.slug === slug)?.name ?? slug;

  // The band lists the soonest few.
  const shownBatches = courseBatches.slice(0, 5);

  /*
    THE HERO TRUST STRIP — THREE COUNTS, NONE OF THEM WRITTEN DOWN.

    Every figure is measured from data this page has already fetched: the
    published programme list, the upcoming batches, and the total the
    results query reports. Nothing here is a stored number a teacher could
    inflate, and nothing is a claim - a count of records is the one kind of
    statistic this site is allowed to make, because it is true by
    construction.

    A zero is DROPPED rather than shown. An institute that has published no
    results yet gets two facts, or one, or an empty strip; it never gets
    "0 results published", which is a worse thing to say than nothing.
  */
  const heroFacts = [
    { label: 'Programmes', value: publishedCourses.length },
    { label: 'Upcoming batches', value: courseBatches.length },
    // 'Results', not 'Results published': every label in this strip is a
    // string the content audit already accounts for elsewhere on the site.
    { label: 'Results', value: results.total },
  ].filter((fact) => fact.value > 0);

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

        A split: the claim on the left, the teacher on the right. Phase 21
        replaced a panel repeating the programme list with the photograph, on
        the argument that a parent choosing a coaching class is choosing a
        person — see `getHeroPortrait()` and `HeroPortrait`. The column
        disappears entirely rather than showing a placeholder when no teacher
        has a photograph yet.

        PHASE 25 MADE IT A COMPOSITION.

        Three decorative layers, all `aria-hidden`, none of them animated: a
        faint graph-paper grid, a navy bloom from the top-left and a gold one
        from the right. Each is well under the threshold at which it reads as
        colour; together they stop the largest type on the site from sitting on
        a flat white field. This is the "expensive, not busy" instruction — no
        blobs, no glass, nothing moving.

        THE SECOND HEADLINE LINE CARRIES A GOLD STROKE. That is the one
        highlighted phrase the design asks for, and it is done as a rule rather
        than a colour swap because orange TEXT at headline size is 2.06:1 and
        illegible. Which words are emphasised is therefore the institute's
        decision, not a developer's: it is whatever they typed into
        `home.heroTitleLine2`, and a single-line headline gets no stroke at all
        rather than an arbitrary word picked by code.
      */}
      <section className="relative isolate overflow-hidden border-b border-rule bg-surface">
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 grid-pattern" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bloom-navy" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bloom-gold" />
        <Container>
          <div
            className={`grid grid-cols-1 items-center gap-12 py-16 md:py-24 lg:gap-20 lg:py-28 ${
              portrait ? 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]' : ''
            }`}
          >
            <div className={portrait ? '' : 'max-w-[760px]'}>
              <p className="eyebrow flex items-center gap-3 text-accent-text">
                <span
                  aria-hidden="true"
                  className="h-[2px] w-8 shrink-0 rounded-full bg-accent"
                />
                {content['home.heroEyebrow']}
              </p>

              <h1 className="mt-6 font-display text-display font-bold leading-[1.02] tracking-[-0.03em] text-heading">
                {content['home.heroTitleLine1']}
                {content['home.heroTitleLine2'] ? (
                  <>
                    <br />
                    <span className="accent-underline">
                      {content['home.heroTitleLine2']}
                    </span>
                  </>
                ) : null}
              </h1>

              <p className="measure mt-7 text-[18px] leading-relaxed text-muted">
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

              {/*
                THE TRUST STRIP, AND EVERY ITEM IN IT IS A FACT THIS PAGE
                ALREADY HOLDS.

                Programmes counted from the published course list, batches from
                the batch table, results from the published-and-consented
                query. No figure is written here and none is invented: each one
                renders only when its number is above zero, so an institute with
                nothing published sees an empty hero rather than a row of
                zeroes claiming a track record it does not have.
              */}
              {heroFacts.length > 0 ? (
                <dl className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-rule pt-7">
                  {heroFacts.map((fact) => (
                    <div key={fact.label}>
                      <dt className="text-[13px] text-muted">{fact.label}</dt>
                      <dd className="font-display text-[26px] font-bold leading-none tabular-nums text-heading">
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>

            {portrait ? <HeroPortrait member={portrait} /> : null}
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
      {/*
        PHASE 25 PAINTED THIS BAND NAVY, and it is the reason the homepage now
        has rhythm at all. Light, light, light with hairlines between was
        honest and flat; one full-strength dark band directly under the hero is
        the break a reader feels without being told, and a statistics strip is
        the right thing to put in it - a claim of proof, sitting on the colour
        the brand uses for authority.

        The numerals are GOLD on navy (8.9:1), which is the one place the
        accent is allowed to carry large text. The labels stay in the muted
        band tone so the eye lands on the figure first.

        Nothing about the DATA changed: every value is still an editable field
        that ships empty, the band still renders nothing at all until a
        value/label pair is filled in, and nothing here can publish a number a
        human did not type.
      */}
      {trustStats.length > 0 ? (
        <Section tone="band" className="py-12 md:py-16">
          <Container>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
              {trustStats.map((stat, index) => (
                <div
                  key={stat.label}
                  className={cn(
                    'reveal text-center',
                    /* Hairline dividers between columns, never before the
                       first one and never across a row break. */
                    index % 2 === 1 ? 'border-l border-white/12' : '',
                    'md:border-l md:border-white/12 md:first:border-l-0',
                  )}
                >
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block font-display text-[34px] font-bold leading-none tracking-[-0.02em] text-accent-gold md:text-[42px]">
                      {stat.value}
                    </span>
                    <span className="mt-3 block text-small text-band-muted">
                      {stat.label}
                    </span>
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
            {/*
              EDITORIAL, NOT THREE IDENTICAL BOXES.

              The heading holds one column and the points hold the other, so
              the band reads as a statement with evidence beside it rather than
              as a row of equal tiles. Below `lg` it stacks and the points
              become a single column - three cards side by side on a phone is
              the layout that makes each of them too narrow to say anything.

              The points are NUMBERED, in gold. That is the whole decoration:
              no icon set to choose from, nothing to download, and a numeral
              carries the same "there are three of these" signal an icon would
              have without pretending to illustrate a claim nobody wrote.
            */}
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
              <div className="lg:sticky lg:top-28 lg:self-start">
                {whyHeading ? (
                  <h2
                    id="home-why"
                    className="font-display text-h2 font-bold leading-[1.12] tracking-[-0.02em] text-heading"
                  >
                    {whyHeading}
                  </h2>
                ) : null}
                <span
                  aria-hidden="true"
                  className="mt-6 block h-[3px] w-16 rounded-full bg-gradient-to-r from-accent to-accent-gold"
                />
              </div>

              <ul className="flex flex-col divide-y divide-rule border-y border-rule">
                {whyPoints.map((point, index) => (
                  <li
                    key={point.title}
                    className="reveal flex gap-5 py-7 transition-colors duration-[var(--duration-base)] first:pt-0 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1 font-display text-[15px] font-bold leading-none text-accent-text tabular-nums"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display text-h3 font-semibold leading-snug text-heading">
                        {point.title}
                      </h3>
                      {point.body ? (
                        <p className="measure mt-2 text-[15px] leading-relaxed text-muted">
                          {point.body}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
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
        <Section tone="tint" labelledBy="home-results">
          <SectionHeader
            id="home-results"
            eyebrow="Results"
            title={content['home.section.results.heading']}
            action={<MoreLink href="/results">All results</MoreLink>}
          />

          {/*
            NO `items-start` HERE, and that is the whole of the grid's part in
            equal-height cards. The default `stretch` makes every item in a row
            as tall as the tallest, which is what `h-full` inside ResultCard
            then has something to fill. Phase 21; see the note in that card.
          */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        <Section tone="surface" labelledBy="home-reviews">
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
      <Section tone="tint" labelledBy="home-location">
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
            <Button href="/admissions" size="lg" variant="onBand">
              Enquire now
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
