import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { PROGRAMME_LABELS, BOARD_LABELS } from '@/lib/admin-format';
import type { PublicResult, PublicStory, PublicBatch } from '@/lib/public-data';

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
  // No name permission means no name — the card leads with the achievement
  // instead, which is the part that was actually authorised.
  const heading = result.name ?? 'Commerce Insight student';

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

      <div className="mt-4 flex items-center gap-3 border-t border-rule pt-4">
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
            {story.name ?? 'A Commerce Insight student'}
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
      className="group flex flex-col rounded-md border border-rule bg-paper p-6 transition-colors hover:border-navy-600/50 hover:bg-navy-50"
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
  const body = (
    <>
      <p className="text-[17px] leading-relaxed text-text">{message}</p>
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
      className="block rounded-md border border-rule bg-paper p-5 transition-colors hover:border-navy-600/50 hover:bg-navy-50"
    >
      {body}
    </Link>
  );
}
