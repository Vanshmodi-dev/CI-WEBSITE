import { institute } from '@/config/institute';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { PROGRAMME_LABELS, BOARD_LABELS } from '@/lib/admin-format';
import type {
  PublicResult,
  PublicStory,
  PublicBatch,
  PublicFaculty,
} from '@/lib/public-data';
import type { SafeReview } from '@/lib/reviews/payload';

/**
 * Public content cards.
 *
 * These receive ALREADY-RESOLVED presentations from src/lib/public-data.ts —
 * there is no consent field on any prop here, so no card can accidentally
 * render something it was not authorised to show. A missing name renders a
 * monogram; a missing photo renders a monogram. Never a placeholder face,
 * never an empty frame.
 */

const IST_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/* --------------------------------------------------------------- avatar -- */

function Monogram({ text, size = 'md' }: { text: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-navy-800 font-display font-bold text-white',
        size === 'lg' ? 'h-16 w-16 text-[22px]' : 'h-12 w-12 text-[17px]',
      )}
    >
      {text}
    </span>
  );
}

function Portrait({
  photoUrl,
  monogram,
  alt,
  size = 'md',
}: {
  photoUrl: string | null;
  monogram: string;
  alt: string;
  size?: 'md' | 'lg';
}) {
  if (!photoUrl) return <Monogram text={monogram} size={size} />;
  const px = size === 'lg' ? 64 : 48;
  return (
    <Image
      src={photoUrl}
      alt={alt}
      width={px}
      height={px}
      className="shrink-0 rounded-full object-cover"
    />
  );
}

/* -------------------------------------------------------------- results -- */

export function ResultCard({ result }: { result: PublicResult }) {
  /*
    No name permission means no name — the card leads with the achievement
    instead, which is the part that was actually authorised.

    ⚠ THE INSTITUTE NAME IS READ, NOT SPELLED OUT. This label said "Commerce
    Insight student" as a literal, and the story card below said it again. The
    name is deliberately code-owned — it is matched to the Google Business
    Profile — but code-owned means one place, and these were two more copies of
    it on the most-viewed cards on the site.
  */
  const heading = result.name ?? `${institute.name} student`;

  return (
    <article className="flex flex-col rounded-md border border-rule bg-paper p-5 transition-shadow hover:shadow-e2">
      <div className="flex items-baseline gap-1">
        <span className="font-display text-[34px] font-bold leading-none tabular-nums text-heading">
          {result.score}
          {result.scoreUnit === 'percent' ? '%' : ''}
        </span>
        {result.scoreUnit !== 'percent' ? (
          <span className="text-small text-muted">marks</span>
        ) : null}
      </div>

      <p className="mt-3 text-small text-muted">
        {PROGRAMME_LABELS[result.programme] ?? result.programme}
        {result.board ? ` · ${BOARD_LABELS[result.board] ?? result.board}` : ''}
        {' · '}
        {result.year}
      </p>

      {result.highlight ? (
        <p className="mt-2 text-small font-medium text-accent-text">
          {result.highlight}
        </p>
      ) : null}

      {/* Subject marks, where the institute entered them. A commerce result is
          more persuasive broken down: "Accounts 99" says more than "96%". */}
      {result.subjects.length > 0 ? (
        <dl className="mt-4 flex flex-col gap-1 border-t border-rule pt-3 text-small">
          {result.subjects.map((s) => (
            <div key={s.subject} className="flex items-baseline justify-between gap-3">
              <dt className="truncate text-muted">{s.subject}</dt>
              <dd className="shrink-0 font-medium tabular-nums text-text">{s.score}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* Attribution sits directly under the content, not pinned to the foot
          of a stretched card. A result carries anything from no subject rows
          to five, so stretching every card in a row to the tallest one and
          pushing the portrait to the bottom opened a void in the middle of the
          short cards. The grid uses `items-start` instead: each card is as
          tall as what is in it, and the row is ragged along the bottom rather
          than hollow in the middle. */}
      <div className="mt-5 flex items-center gap-3 border-t border-rule pt-4">
        <Portrait
          photoUrl={result.photoUrl}
          monogram={result.monogram}
          alt={result.name ? `${result.name}` : 'Student'}
        />
        <span className="min-w-0 font-medium text-text">{heading}</span>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------- stories -- */

export function StoryCard({ story }: { story: PublicStory }) {
  return (
    <article className="flex flex-col rounded-md border border-rule bg-paper p-6">
      <div className="flex items-center gap-4">
        <Portrait
          photoUrl={story.photoUrl}
          monogram={story.monogram}
          alt={story.name ?? 'Student'}
          size="lg"
        />
        <div className="min-w-0">
          <p className="font-display text-[18px] font-semibold text-heading">
            {story.name ?? `A ${institute.name} student`}
          </p>
          <p className="text-small text-muted">
            {PROGRAMME_LABELS[story.programme] ?? story.programme} · {story.year}
          </p>
        </div>
      </div>

      {story.quote ? (
        <blockquote className="mt-5 border-l-2 border-accent pl-4 text-[17px] leading-relaxed text-text">
          {story.quote}
        </blockquote>
      ) : null}

      <dl className="mt-5 flex flex-col gap-4 text-small">
        <div>
          <dt className="eyebrow text-accent-text">The challenge</dt>
          <dd className="mt-1 leading-relaxed text-text">{story.challenge}</dd>
        </div>
        <div>
          <dt className="eyebrow text-accent-text">What changed</dt>
          <dd className="mt-1 leading-relaxed text-text">{story.journey}</dd>
        </div>
        <div>
          <dt className="eyebrow text-accent-text">The outcome</dt>
          <dd className="mt-1 leading-relaxed text-text">{story.outcome}</dd>
        </div>
      </dl>
    </article>
  );
}

/* -------------------------------------------------------------- batches -- */

export function BatchCard({
  batch,
  courseName,
}: {
  batch: PublicBatch;
  courseName: string;
}) {
  return (
    <article className="flex flex-col rounded-md border border-rule bg-paper p-5">
      <p className="font-display text-[18px] font-semibold text-heading">
        {courseName}
      </p>
      <p className="mt-2 text-small text-muted">
        Starts{' '}
        <strong className="font-medium text-text">
          {IST_DATE.format(batch.startsAt)}
        </strong>
      </p>
      <p className="mt-1 text-small text-muted">{batch.mode}</p>
      {batch.seatsNote ? (
        <p className="mt-3 inline-flex w-fit rounded-sm border border-accent/40 bg-accent-wash px-2 py-0.5 text-[12px] font-medium text-accent-text">
          {batch.seatsNote}
        </p>
      ) : null}
    </article>
  );
}

/**
 * BatchRow / BatchList — the same records as BatchCard, laid out as rows.
 *
 * Phase 15. Before this, every band on the homepage was a three-column card
 * grid: courses, results, batches. Three identical shapes stacked vertically
 * is why the page scanned as one undifferentiated column no matter what the
 * colours did. Batches are the band that gains most from rows, because a batch
 * is a schedule — course, date, mode read as a table far better than as three
 * loose paragraphs in a box, and the dates line up down the page where they
 * can actually be compared.
 *
 * BatchCard is kept: /courses/[slug] shows one course's batches, where a card
 * beside sibling content is still right.
 */
export function BatchList({
  batches,
  courseName,
}: {
  batches: PublicBatch[];
  courseName: (slug: string) => string;
}) {
  return (
    <ul className="divide-y divide-rule overflow-hidden rounded-md border border-rule bg-paper">
      {batches.map((batch) => (
        <li key={batch.id}>
          <div className="flex flex-col gap-x-6 gap-y-2 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <p className="font-display text-[19px] font-semibold leading-tight text-heading sm:w-[34%] sm:shrink-0">
              {courseName(batch.courseSlug)}
            </p>

            <p className="text-small text-muted sm:w-[26%] sm:shrink-0">
              Starts{' '}
              <strong className="font-medium text-text">
                {IST_DATE.format(batch.startsAt)}
              </strong>
            </p>

            <p className="text-small text-muted sm:w-[16%] sm:shrink-0">{batch.mode}</p>

            {batch.seatsNote ? (
              <p className="inline-flex w-fit rounded-sm border border-accent/40 bg-accent-wash px-2 py-0.5 text-[12px] font-medium text-accent-text sm:ml-auto">
                {batch.seatsNote}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------- courses -- */

export function CourseCard({
  slug,
  name,
  batchCount,
}: {
  slug: string;
  name: string;
  batchCount: number;
}) {
  return (
    <Link
      href={`/courses/${slug}`}
      className="group flex flex-col rounded-md border border-rule bg-paper p-6 transition-colors hover:border-navy-600/50 hover:bg-selected"
    >
      <h3 className="font-display text-[20px] font-semibold text-heading">{name}</h3>
      <p className="mt-2 flex-1 text-small text-muted">
        {batchCount > 0
          ? `${batchCount} upcoming ${batchCount === 1 ? 'batch' : 'batches'}`
          : 'Batch dates will be announced here.'}
      </p>
      <span className="mt-4 text-small font-medium text-link group-hover:text-link-hover">
        View programme &rarr;
      </span>
    </Link>
  );
}

/* -------------------------------------------------------- announcements -- */

export function AnnouncementCard({
  message,
  href,
  startsAt,
}: {
  message: string;
  href: string | null;
  startsAt: Date;
}) {
  /*
    `overflow-wrap: anywhere` — the third time this project has needed it.

    An announcement is free text typed by a teacher, so it can contain a long
    URL, a reference code, or anything else with no space in it. Without this a
    single unbreakable run widens the card and the whole document: /announcements
    measured 353px against a 320px viewport, which pushed the floating WhatsApp
    button off the right edge.

    The same fix was made for review cards in Topic 7 and for the gallery and
    faculty admin lists in Topic 8. This is the public-page instance of it.
  */
  const body = (
    <>
      <p className="text-[17px] leading-relaxed text-text [overflow-wrap:anywhere]">
        {message}
      </p>
      <p className="mt-2 text-[13px] text-muted">{IST_DATE.format(startsAt)}</p>
    </>
  );

  if (!href) {
    return (
      <article className="rounded-md border border-rule bg-paper p-5">{body}</article>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-md border border-rule bg-paper p-5 transition-colors hover:border-navy-600/50 hover:bg-selected"
    >
      {body}
    </Link>
  );
}

/* -------------------------------------------------------------- faculty -- */

/**
 * One member of teaching staff.
 *
 * SHAPE, NOT DECORATION. The site's other cards are rectangular with a small
 * round avatar; this one leads with a larger portrait because a faculty card
 * exists to put a face to a name, and that is the one piece of information a
 * parent is actually scanning for.
 *
 * The portrait is a fixed square with `object-cover`. A square is the only
 * ratio that survives both a phone snapshot and a studio headshot without
 * letterboxing, and `object-cover` crops the edges rather than stretching the
 * face - a distorted portrait of a real person is worse than a tight crop.
 *
 * No photograph renders a MONOGRAM, exactly as the student cards do, so a
 * teacher who has not supplied one does not leave a grey rectangle in the grid.
 */
export function FacultyCard({ member }: { member: PublicFaculty }) {
  return (
    /*
      `h-full` so every card in a row is the same height.

      The results grid deliberately lets cards take their natural height,
      because a result with five subject rows and one with none are genuinely
      different amounts of content. Faculty cards are not like that: the
      portraits are identical squares, so a short card next to a tall one reads
      as a rendering fault rather than as variation. Equal heights, ragged text.
    */
    <article className="flex h-full flex-col overflow-hidden rounded-md border border-rule bg-paper">
      <div className="aspect-square w-full bg-surface-2">
        {member.photoUrl ? (
          <Image
            src={member.photoUrl}
            /*
              Named, not decorative. A visitor using a screen reader is being
              introduced to a person, and "photograph of Ravi Sharma" is the
              introduction. The name is repeated below in text, which is
              correct: the heading identifies, the alt describes the image.
            */
            alt={`${member.name}, ${member.designation}`}
            width={640}
            height={640}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw"
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center bg-navy-800 font-display text-[44px] font-bold text-white"
          >
            {member.monogram}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-[19px] font-semibold leading-tight text-heading">
          {member.name}
        </h3>
        <p className="mt-1 text-small font-medium text-accent-text">
          {member.designation}
        </p>
        {member.subject ? (
          <p className="mt-0.5 text-small text-muted">{member.subject}</p>
        ) : null}
        {member.bio ? (
          <p className="mt-3 text-small leading-relaxed text-text">{member.bio}</p>
        ) : null}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------- reviews -- */

const REVIEW_DATE = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/**
 * A star rating with a text equivalent.
 *
 * `frontend/SAFETY.md` §6 is explicit about this: the stars themselves are
 * `aria-hidden` and the group carries `role="img"` with a label, because five
 * star characters read literally announce as "black star black star black
 * star" and leave the listener counting.
 *
 * Drawn with characters rather than an icon font or an SVG sprite. An icon font
 * would be a second request the institute never agreed to; the engine draws its
 * own stars with `clip-path` for the same reason.
 */
export function StarRating({ rating }: { rating: number }) {
  return (
    <span
      role="img"
      aria-label={`Rated ${rating} out of 5`}
      className="inline-flex items-center gap-0.5 text-[15px] leading-none text-accent"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} aria-hidden="true" className={star <= rating ? '' : 'text-rule-strong'}>
          ★
        </span>
      ))}
    </span>
  );
}

/**
 * One review from the Review Engine.
 *
 * ⚠ EVERY STRING HERE IS SOMEBODY ELSE'S KEYSTROKES, and they have travelled
 * through a scraper. They are rendered as React children and nothing else:
 * no `dangerouslySetInnerHTML`, no `innerHTML`, no attribute interpolation of
 * review content. `frontend/SAFETY.md` §1 makes that its first rule and it is
 * the right one.
 *
 * There is NO AVATAR, deliberately. INV-01 in that same document says the
 * visitor's browser never contacts a review source, and §7 lists loading
 * avatars from the source's CDN as the tempting thing that breaks it. The
 * normaliser discards those URLs entirely; this renders initials.
 */
export function ReviewCard({ review }: { review: SafeReview }) {
  return (
    /*
      `min-w-0` IS LOAD-BEARING, NOT TIDINESS.

      A grid item defaults to `min-width: auto`, which means it refuses to
      shrink below its widest unbreakable content. One reviewer writing a long
      hyphen-free run of characters therefore widened the card, the grid, and
      the whole document: /reviews and the homepage scrolled sideways at every
      width up to 768px. Nothing in the payload is under our control, so the
      layout has to survive text nobody would choose to write.
    */
    <article className="flex h-full min-w-0 flex-col rounded-md border border-rule bg-paper p-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-800 font-display text-[15px] font-bold text-white"
        >
          {review.initials}
        </span>
        <div className="min-w-0">
          {/*
            A HEADING, so the cards are a list a screen-reader user can move
            through by heading rather than by reading every quote in order. It
            is styled as body text on purpose: the visual weight belongs to the
            review, not to the stranger's name above it.

            `h3` sits under the `h2` that titles whichever band holds the card,
            on both /reviews and the homepage.
          */}
          <h3 className="truncate font-medium text-text">
            {review.authorName ?? 'A Google reviewer'}
          </h3>
          {review.date ? (
            <p className="text-[13px] text-muted">{REVIEW_DATE.format(new Date(review.date))}</p>
          ) : null}
        </div>
      </div>

      {review.rating !== null ? (
        <div className="mt-3">
          <StarRating rating={review.rating} />
        </div>
      ) : null}

      {review.text ? (
        /*
          `overflow-wrap: anywhere` rather than `break-words`: the latter still
          declines to break a word when the browser thinks it can avoid it, and
          a single 70-character token is exactly the case where it cannot.
        */
        <p className="mt-3 text-small leading-relaxed text-text [overflow-wrap:anywhere]">
          {review.text}
          {review.textTruncated ? <span aria-hidden="true">…</span> : null}
        </p>
      ) : null}

      {review.ownerReply ? (
        <div className="mt-4 min-w-0 border-l-2 border-rule pl-3">
          <p className="eyebrow text-accent-text">Our reply</p>
          <p className="mt-1 text-small leading-relaxed text-muted [overflow-wrap:anywhere]">
            {review.ownerReply.text}
          </p>
        </div>
      ) : null}
    </article>
  );
}
