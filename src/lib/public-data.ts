import 'server-only';

import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { present, type DisplayNameModeValue } from '@/lib/student-display';
import { logUnexpected } from '@/lib/log';

/**
 * Programme values, narrowed from untrusted query strings.
 *
 * `?programme=` comes from the URL, so it is attacker-controlled. Narrowing it
 * to the enum here means an unknown value becomes "no filter" instead of
 * reaching Prisma — the filter can never be used to widen what is returned.
 */
const PROGRAMMES = [
  'CLASS_11',
  'CLASS_12',
  'CA_FOUNDATION',
  'CA_INTERMEDIATE',
  'CMA',
] as const;

export type ProgrammeValue = (typeof PROGRAMMES)[number];

export function asProgramme(value: string | undefined): ProgrammeValue | undefined {
  return value && (PROGRAMMES as readonly string[]).includes(value)
    ? (value as ProgrammeValue)
    : undefined;
}

/**
 * Public read queries.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: consent metadata never leaves the
 * server. The admin needs to see `consentPhoto` to manage it; a visitor's
 * browser has no business knowing a consent reference exists at all.
 *
 * So every function here:
 *   1. filters to published records IN THE DATABASE, never in JavaScript;
 *   2. runs `present()` on the server;
 *   3. returns ONLY the resolved presentation.
 *
 * The returned objects have no `consentRef`, no `consentPhoto`, no
 * `studentName`, and no internal timestamps. What the component receives is
 * already the public projection, so a component cannot leak a field it was
 * never handed.
 *
 * Every function also degrades to empty rather than throwing: the public site
 * must render when the database is unreachable or not yet configured.
 */

/* ------------------------------------------------------------ results ---- */

export type PublicResult = {
  id: string;
  /** Already resolved. Null means show the monogram, not a placeholder. */
  name: string | null;
  monogram: string;
  photoUrl: string | null;
  score: string;
  scoreUnit: string;
  programme: string;
  board: string | null;
  year: number;
  highlight: string | null;
  /** Subject-wise marks, where the institute has entered them. */
  subjects: Array<{ subject: string; score: string }>;
};

export type PublicResultsPage = {
  results: PublicResult[];
  total: number;
  page: number;
  pageCount: number;
  years: number[];
};

export const RESULTS_PAGE_SIZE = 24;

/**
 * Published results.
 *
 * The `where` clause is the security boundary. `published` alone is not
 * enough — a row could in principle be published without the paperwork
 * reference, so both are required here as well as by the database constraint.
 * Defence in depth: if a constraint were ever dropped, this query still holds.
 */
export async function getPublishedResults({
  year,
  programme,
  page = 1,
  limit,
}: {
  year?: number;
  programme?: ProgrammeValue;
  page?: number;
  limit?: number;
} = {}): Promise<PublicResultsPage> {
  const empty: PublicResultsPage = {
    results: [],
    total: 0,
    page: 1,
    pageCount: 1,
    years: [],
  };
  if (!isDatabaseConfigured()) return empty;

  const where = {
    published: true,
    consentResult: true,
    consentRef: { not: null },
    ...(year ? { year } : {}),
    ...(programme ? { programme } : {}),
  } as const;

  const take = limit ?? RESULTS_PAGE_SIZE;
  const current = Math.max(1, Math.floor(page));

  try {
    const prisma = getPrisma();

    const [total, rows, yearRows] = await Promise.all([
      prisma.topper.count({ where }),
      prisma.topper.findMany({
        where,
        orderBy: [{ year: 'desc' }, { sortOrder: 'asc' }, { score: 'desc' }],
        skip: limit ? 0 : (current - 1) * take,
        take,
        // Consent columns are selected only so present() can apply them. They
        // are consumed here and never returned.
        select: {
          id: true,
          studentName: true,
          displayNameMode: true,
          photoUrl: true,
          consentRef: true,
          consentResult: true,
          consentName: true,
          consentPhoto: true,
          published: true,
          score: true,
          scoreUnit: true,
          programme: true,
          board: true,
          year: true,
          highlight: true,
          subjectScores: {
            select: { id: true, subject: true, score: true },
            orderBy: { subject: 'asc' },
          },
        },
      }),
      prisma.topper.groupBy({
        by: ['year'],
        where: { published: true, consentResult: true, consentRef: { not: null } },
        orderBy: { year: 'desc' },
      }),
    ]);

    const results: PublicResult[] = rows.map((row) => {
      const view = present({
        studentName: row.studentName,
        displayNameMode: row.displayNameMode as DisplayNameModeValue,
        photoUrl: row.photoUrl,
        consentRef: row.consentRef,
        consentResult: row.consentResult,
        consentName: row.consentName,
        consentPhoto: row.consentPhoto,
        published: row.published,
      });

      return {
        id: row.id,
        name: view.name,
        monogram: view.monogram,
        photoUrl: view.photoUrl,
        score: String(row.score),
        scoreUnit: row.scoreUnit,
        programme: row.programme,
        board: row.board,
        year: row.year,
        highlight: row.highlight,
        subjects: row.subjectScores.map((s) => ({
          subject: s.subject,
          score: String(s.score),
        })),
      };
    });

    return {
      results,
      total,
      page: current,
      pageCount: Math.max(1, Math.ceil(total / take)),
      years: yearRows.map((y) => y.year),
    };
  } catch (error) {
    logUnexpected('public.results.failed', error);
    return empty;
  }
}

/* ------------------------------------------------------------ stories ---- */

export type PublicStory = {
  id: string;
  slug: string;
  name: string | null;
  monogram: string;
  photoUrl: string | null;
  programme: string;
  year: number;
  challenge: string;
  journey: string;
  outcome: string;
  quote: string | null;
};

/**
 * Published student stories.
 *
 * `consentStory` is required — a result grant does not authorise a story. And
 * the photo is resolved by `present()` against `consentPhoto` alone, so a
 * published story whose subject did not agree to a photograph returns
 * `photoUrl: null` and the component renders a monogram.
 */
export async function getPublishedStories(limit?: number): Promise<PublicStory[]> {
  if (!isDatabaseConfigured()) return [];

  try {
    const rows = await getPrisma().studentStory.findMany({
      where: { published: true, consentStory: true, consentRef: { not: null } },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      ...(limit ? { take: limit } : { take: 60 }),
      select: {
        id: true,
        slug: true,
        studentName: true,
        displayNameMode: true,
        photoUrl: true,
        consentRef: true,
        consentStory: true,
        consentName: true,
        consentPhoto: true,
        published: true,
        programme: true,
        year: true,
        challenge: true,
        journey: true,
        outcome: true,
        quote: true,
      },
    });

    return rows.map((row) => {
      const view = present(
        {
          studentName: row.studentName,
          displayNameMode: row.displayNameMode as DisplayNameModeValue,
          photoUrl: row.photoUrl,
          consentRef: row.consentRef,
          consentStory: row.consentStory,
          consentName: row.consentName,
          consentPhoto: row.consentPhoto,
          published: row.published,
        },
        'consentStory',
      );

      return {
        id: row.id,
        slug: row.slug,
        name: view.name,
        monogram: view.monogram,
        photoUrl: view.photoUrl,
        programme: row.programme,
        year: row.year,
        challenge: row.challenge,
        journey: row.journey,
        outcome: row.outcome,
        quote: row.quote,
      };
    });
  } catch (error) {
    logUnexpected('public.stories.failed', error);
    return [];
  }
}

/* ------------------------------------------------------------ batches ---- */

export type PublicBatch = {
  id: string;
  courseSlug: string;
  startsAt: Date;
  mode: string;
  seatsNote: string | null;
};

/**
 * Upcoming batches.
 *
 * `startsAt >= now()` is applied IN THE DATABASE, not after fetching. A batch
 * that has already started must never be advertised as upcoming — that was the
 * exact defect on the previous website, which spent two months announcing a
 * batch that had already begun.
 */
export async function getUpcomingBatches({
  courseSlug,
  limit,
}: { courseSlug?: string; limit?: number } = {}): Promise<PublicBatch[]> {
  if (!isDatabaseConfigured()) return [];

  try {
    return await getPrisma().batch.findMany({
      where: {
        published: true,
        startsAt: { gte: new Date() },
        ...(courseSlug ? { courseSlug } : {}),
      },
      orderBy: { startsAt: 'asc' },
      take: limit ?? 24,
      select: {
        id: true,
        courseSlug: true,
        startsAt: true,
        mode: true,
        seatsNote: true,
      },
    });
  } catch (error) {
    logUnexpected('public.batches.failed', error);
    return [];
  }
}

/* ------------------------------------------------------ announcements ---- */

export type PublicAnnouncement = {
  id: string;
  message: string;
  href: string | null;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Announcements inside their validity window.
 *
 * Both ends of the window are enforced in the database. An announcement whose
 * end date has passed is not "published but hidden by the UI" — it is simply
 * not returned, so it cannot be rendered by mistake.
 */
export async function getActiveAnnouncements(
  limit?: number,
): Promise<PublicAnnouncement[]> {
  if (!isDatabaseConfigured()) return [];

  const now = new Date();
  try {
    return await getPrisma().announcement.findMany({
      where: {
        published: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      orderBy: [{ priority: 'desc' }, { startsAt: 'desc' }],
      take: limit ?? 20,
      select: {
        id: true,
        message: true,
        href: true,
        startsAt: true,
        endsAt: true,
      },
    });
  } catch (error) {
    logUnexpected('public.announcements.failed', error);
    return [];
  }
}

/** The single highest-priority live notice, for the site-wide banner. */
export async function getTopAnnouncement(): Promise<PublicAnnouncement | null> {
  const items = await getActiveAnnouncements(1);
  return items[0] ?? null;
}
