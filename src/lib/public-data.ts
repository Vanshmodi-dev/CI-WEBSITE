import 'server-only';

import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { present, type DisplayNameModeValue } from '@/lib/student-display';
import { logUnexpected } from '@/lib/log';
import { isSafePhotoPath } from '@/lib/validation';
import { facultyInitials } from '@/lib/faculty-display';
import {
  isGalleryItemPublic,
  type GalleryCategoryValue,
} from '@/lib/gallery';
import { isYouTubeId, type VideoSubjectValue } from '@/lib/video';

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

/** A filter the visitor can actually apply, with how many records it holds. */
export type FilterFacet<T> = { value: T; count: number };

export type PublicResultsPage = {
  results: PublicResult[];
  total: number;
  page: number;
  pageCount: number;
  /** Years that hold results FOR THE ACTIVE PROGRAMME. See the note below. */
  years: FilterFacet<number>[];
  /** Programmes that hold results FOR THE ACTIVE YEAR. */
  programmes: FilterFacet<ProgrammeValue>[];
};

export const RESULTS_PAGE_SIZE = 24;

/**
 * Hard ceiling on how deep a page number may go before the total is known.
 *
 * `?page=` is attacker-controlled, and it used to be passed through with only a
 * lower bound. `?page=999999999` became `OFFSET 23999999976`, and Postgres
 * answers that by walking the index to a row that does not exist — one cheap
 * request buying an expensive scan, repeatable for free.
 *
 * Both list pages now clamp twice: to this ceiling before querying, and to the
 * real page count once it is known. The first bound is what makes the query
 * safe; the second is what makes it correct.
 */
const MAX_PAGE = 10_000;

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
    programmes: [],
  };
  if (!isDatabaseConfigured()) return empty;

  /** Published + consented. Everything else is a filter on top of this. */
  const visible = {
    published: true,
    consentResult: true,
    consentRef: { not: null },
  } as const;

  const where = {
    ...visible,
    ...(year ? { year } : {}),
    ...(programme ? { programme } : {}),
  } as const;

  const take = limit ?? RESULTS_PAGE_SIZE;
  const requested = Math.min(MAX_PAGE, Math.max(1, Math.floor(page) || 1));

  try {
    const prisma = getPrisma();

    const [total, rows, yearRows, programmeRows] = await Promise.all([
      prisma.topper.count({ where }),
      prisma.topper.findMany({
        where,
        orderBy: [{ year: 'desc' }, { sortOrder: 'asc' }, { score: 'desc' }],
        skip: limit ? 0 : (requested - 1) * take,
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
      /**
       * The facets are each scoped to the OTHER filter, not to themselves.
       *
       * Phase 8 left this as a known defect: the year list ignored the
       * programme filter entirely, so choosing "CA Foundation" still offered
       * every year in the database — including years with no CA Foundation
       * result at all. Following one of those chips landed the visitor on
       * "Nothing published for that filter yet", from a control the page had
       * just told them was available.
       *
       * Scoping each facet to the other filter (and never to itself) is what
       * makes the chips honest AND keeps them usable: the year chips still list
       * every year available for the chosen programme, rather than collapsing
       * to the single year already selected.
       *
       * Both are grouped IN THE DATABASE. Counting these in JavaScript would
       * mean fetching all 1,000 rows to count them.
       */
      prisma.topper.groupBy({
        by: ['year'],
        where: { ...visible, ...(programme ? { programme } : {}) },
        orderBy: { year: 'desc' },
        _count: { _all: true },
      }),
      prisma.topper.groupBy({
        by: ['programme'],
        where: { ...visible, ...(year ? { year } : {}) },
        _count: { _all: true },
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

    const pageCount = Math.max(1, Math.ceil(total / take));

    return {
      results,
      total,
      // Reported clamped, so a request for page nine million renders "Page 1 of
      // 1" rather than an empty page pretending to be page nine million.
      page: Math.min(requested, pageCount),
      pageCount,
      years: yearRows.map((y) => ({ value: y.year, count: y._count._all })),
      programmes: programmeRows
        .map((p) => ({ value: p.programme as ProgrammeValue, count: p._count._all }))
        // Ordered by the enum, so the chips keep a stable reading order
        // (Class XI → Class XII → CA → CMA) instead of whatever the planner
        // returned.
        .sort((a, b) => PROGRAMMES.indexOf(a.value) - PROGRAMMES.indexOf(b.value)),
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

export type PublicStoriesPage = {
  stories: PublicStory[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * A story is a full page of prose — challenge, journey, outcome and a quote.
 * Twelve of them is already a long scroll and about 45 KB of HTML; sixty was
 * 224 KB, which is what the unpaginated page was serving.
 */
export const STORIES_PAGE_SIZE = 12;

const STORY_VISIBLE = {
  published: true,
  consentStory: true,
  consentRef: { not: null },
} as const;

const STORY_ORDER = [{ year: 'desc' as const }, { createdAt: 'desc' as const }];

/**
 * Published student stories.
 *
 * `consentStory` is required — a result grant does not authorise a story. And
 * the photo is resolved by `present()` against `consentPhoto` alone, so a
 * published story whose subject did not agree to a photograph returns
 * `photoUrl: null` and the component renders a monogram.
 *
 * ⚠ `limit` IS FOR THE HOMEPAGE BAND, WHICH SHOWS A DELIBERATE FEW.
 * It is not a way to read "all" stories — see `getPublishedStoriesPage` for
 * that. This function used to default to `take: 60`, which silently discarded
 * every story past the sixtieth: a teacher could publish one, see it nowhere,
 * and have no way to find out why. Phase 9 measured it happening at 80 stories.
 * `limit` is now required so no caller can inherit that default by accident.
 */
const STORY_SELECT = {
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
} as const;

/** Resolve one row through the consent rules. Nothing else may do this. */
function presentStory(row: {
  id: string;
  slug: string;
  studentName: string;
  displayNameMode: string;
  photoUrl: string | null;
  consentRef: string | null;
  consentStory: boolean;
  consentName: boolean;
  consentPhoto: boolean;
  published: boolean;
  programme: string;
  year: number;
  challenge: string;
  journey: string;
  outcome: string;
  quote: string | null;
}): PublicStory {
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
}

export async function getPublishedStories(limit: number): Promise<PublicStory[]> {
  if (!isDatabaseConfigured()) return [];

  try {
    const rows = await getPrisma().studentStory.findMany({
      where: STORY_VISIBLE,
      orderBy: STORY_ORDER,
      take: limit,
      select: STORY_SELECT,
    });
    return rows.map(presentStory);
  } catch (error) {
    logUnexpected('public.stories.failed', error);
    return [];
  }
}

/**
 * One page of published stories, with the total so the page can say how many
 * there are.
 *
 * The count is what makes the truncation impossible to hide: the page renders
 * "Page 1 of 7", so a story that exists but is not on screen is still visibly
 * accounted for.
 */
export async function getPublishedStoriesPage({
  page = 1,
}: { page?: number } = {}): Promise<PublicStoriesPage> {
  const empty: PublicStoriesPage = { stories: [], total: 0, page: 1, pageCount: 1 };
  if (!isDatabaseConfigured()) return empty;

  const requested = Math.min(MAX_PAGE, Math.max(1, Math.floor(page) || 1));

  try {
    const prisma = getPrisma();
    const [total, rows] = await Promise.all([
      prisma.studentStory.count({ where: STORY_VISIBLE }),
      prisma.studentStory.findMany({
        where: STORY_VISIBLE,
        orderBy: STORY_ORDER,
        skip: (requested - 1) * STORIES_PAGE_SIZE,
        take: STORIES_PAGE_SIZE,
        select: STORY_SELECT,
      }),
    ]);

    const pageCount = Math.max(1, Math.ceil(total / STORIES_PAGE_SIZE));

    return {
      stories: rows.map(presentStory),
      total,
      page: Math.min(requested, pageCount),
      pageCount,
    };
  } catch (error) {
    logUnexpected('public.stories.page.failed', error);
    return empty;
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

/* ------------------------------------------------------ freshness ---- */

export type ContentFreshness = {
  results: Date | null;
  stories: Date | null;
  announcements: Date | null;
  batches: Date | null;
};

/**
 * When each kind of public content last changed.
 *
 * Used only by the sitemap, and deliberately built on the SAME visibility
 * predicates the public pages use. An unpublished record, or one whose consent
 * was withdrawn, must not be able to move a `lastModified` date — that would
 * leak the fact that something changed behind the scenes, and it would send a
 * crawler back to a page that did not actually change.
 *
 * Returns null for a kind with nothing published. The sitemap omits the field
 * rather than substituting today's date.
 */
export async function lastPublishedAt(): Promise<ContentFreshness> {
  const empty: ContentFreshness = {
    results: null,
    stories: null,
    announcements: null,
    batches: null,
  };
  if (!isDatabaseConfigured()) return empty;

  const now = new Date();
  try {
    const prisma = getPrisma();
    const [result, story, announcement, batch] = await Promise.all([
      prisma.topper.aggregate({
        where: { published: true, consentResult: true, consentRef: { not: null } },
        _max: { updatedAt: true },
      }),
      prisma.studentStory.aggregate({ where: STORY_VISIBLE, _max: { updatedAt: true } }),
      prisma.announcement.aggregate({
        where: { published: true, startsAt: { lte: now }, endsAt: { gte: now } },
        _max: { updatedAt: true },
      }),
      prisma.batch.aggregate({
        where: { published: true, startsAt: { gte: now } },
        _max: { updatedAt: true },
      }),
    ]);

    return {
      results: result._max.updatedAt ?? null,
      stories: story._max.updatedAt ?? null,
      announcements: announcement._max.updatedAt ?? null,
      batches: batch._max.updatedAt ?? null,
    };
  } catch (error) {
    logUnexpected('public.freshness.failed', error);
    return empty;
  }
}

/* -------------------------------------------------------------- faculty -- */

export type PublicFaculty = {
  id: string;
  name: string;
  designation: string;
  subject: string | null;
  bio: string | null;
  photoUrl: string | null;
  /** Initials, for the monogram shown when there is no photograph. */
  monogram: string;
};

/**
 * Teaching staff, for /faculty and the homepage band.
 *
 * TWO THINGS THIS SHARES WITH EVERY OTHER PUBLIC READER, ON PURPOSE.
 *
 * `published: true` is in the WHERE clause, not applied afterwards in
 * JavaScript. A filter that runs after the query is a filter somebody can
 * forget to apply on the next call site; a filter in the query cannot return
 * the row at all.
 *
 * The photo path is re-checked with `isSafePhotoPath` even though the save
 * action validates it and a CHECK constraint backs that up. Topic 5 found the
 * stories action writing an unvalidated path for its entire existence with
 * nothing downstream compensating, so a row that is already wrong must
 * degrade to a monogram rather than reach `next/image`.
 *
 * Faculty are NOT students. There is no consent model here and none is
 * invented - see the note on the model in schema.prisma. What replaces it is
 * the same publication gate everything else uses.
 */
export async function getPublishedFaculty(limit?: number): Promise<PublicFaculty[]> {
  if (!isDatabaseConfigured()) return [];

  try {
    const rows = await getPrisma().faculty.findMany({
      where: { published: true },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      ...(limit ? { take: limit } : {}),
      select: {
        id: true,
        name: true,
        designation: true,
        subject: true,
        bio: true,
        photoUrl: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      designation: row.designation,
      subject: row.subject,
      bio: row.bio,
      photoUrl:
        row.photoUrl && isSafePhotoPath(row.photoUrl) ? row.photoUrl : null,
      monogram: facultyInitials(row.name),
    }));
  } catch (error) {
    logUnexpected('public.faculty.failed', error);
    return [];
  }
}

export type PublicGalleryItem = {
  id: string;
  imageUrl: string;
  alt: string;
  caption: string | null;
  category: GalleryCategoryValue;
};

/**
 * Gallery photographs, for /gallery and the homepage band.
 *
 * =============================================================================
 * THE CONSENT FILTER IS IN THE QUERY, AND THEN AGAIN IN JAVASCRIPT
 * =============================================================================
 * `docs/design/STUDENT-DATA-POLICY.md` covers gallery photographs, so this is
 * the read path for potentially sensitive images of minors. It is guarded
 * twice, and the two guards catch different things.
 *
 * THE QUERY refuses to return an unpublished row, or a row that shows people
 * without both a consent reference and photograph permission. A filter written
 * in the WHERE clause cannot be forgotten by the next call site the way a
 * `.filter()` after the query can - and it means the sensitive rows never leave
 * Postgres at all.
 *
 * `isGalleryItemPublic` THEN RE-CHECKS EVERY ROW. That looks redundant and is
 * not. The database CHECK constraint permits any path that starts with a slash
 * and contains no traversal, which is strictly weaker than `isSafePhotoPath` -
 * `/media/x.svg` satisfies the constraint and is not an image this site will
 * ever render. A row written by a direct query, by a future import, or by a
 * defect of the kind Topic 5 found in the stories action can therefore be
 * published, constraint-valid, and still wrong. The predicate that decides what
 * a visitor sees must be the same one the admin shows the teacher, so it is
 * imported rather than re-expressed.
 *
 * A row that fails the second check is DROPPED, not rendered blank. In a
 * gallery the photograph is the content; an entry without one is an empty box.
 */
export async function getPublishedGallery(
  options: { limit?: number; category?: GalleryCategoryValue } = {},
): Promise<PublicGalleryItem[]> {
  if (!isDatabaseConfigured()) return [];

  try {
    const rows = await getPrisma().galleryItem.findMany({
      where: {
        published: true,
        ...(options.category ? { category: options.category } : {}),
        /*
          "Nobody identifiable in it" OR "consent is on file for the people in
          it." Expressed as an OR rather than two queries so there is one
          statement to read and one to get right.
        */
        OR: [
          { showsPeople: false },
          { AND: [{ consentPhoto: true }, { consentRef: { not: null } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      ...(options.limit ? { take: options.limit } : {}),
      select: {
        id: true,
        imageUrl: true,
        alt: true,
        caption: true,
        category: true,
        showsPeople: true,
        consentRef: true,
        consentPhoto: true,
        published: true,
      },
    });

    return rows
      .filter((row) => isGalleryItemPublic(row))
      .map((row) => ({
        id: row.id,
        imageUrl: row.imageUrl,
        alt: row.alt,
        caption: row.caption,
        category: row.category as GalleryCategoryValue,
      }));
  } catch (error) {
    logUnexpected('public.gallery.failed', error);
    return [];
  }
}

/**
 * Which categories actually have a publishable photograph in them.
 *
 * The master directive says "only use categories that correspond to real
 * content", so the public filter is built from what exists rather than from the
 * enum. An empty category is not offered and cannot be reached by editing the
 * URL, because the page narrows an unknown or unpopulated value to "all".
 *
 * Deliberately derived from `getPublishedGallery()` rather than from a separate
 * `groupBy` query: a second query would be a second visibility rule, and the
 * one thing this page must never do is advertise a category whose contents are
 * not allowed to be shown.
 */
export async function getGalleryCategories(): Promise<GalleryCategoryValue[]> {
  const items = await getPublishedGallery();
  const seen = new Set<GalleryCategoryValue>();
  for (const item of items) seen.add(item.category);
  return [...seen];
}

export type PublicVideo = {
  id: string;
  youtubeId: string;
  title: string;
  description: string | null;
  subject: VideoSubjectValue;
};

/**
 * Published videos, for /videos and the homepage band.
 *
 * =============================================================================
 * THE ID IS RE-CHECKED ON THE WAY OUT
 * =============================================================================
 * `isYouTubeId` runs again here, even though the save action validates and a
 * CHECK constraint backs it up. That is the same two-guard pattern `present()`
 * and `getPublishedGallery()` use, and it exists because the guards fail
 * differently: the write guard protects data arriving through the path everyone
 * remembers, and this protects against a row that is ALREADY wrong - written by
 * a direct query, by an import somebody adds later, or by a defect of the kind
 * Topic 5 found in the stories action after months in production.
 *
 * The stakes are higher here than for a photo path. This value becomes the
 * `src` of an IFRAME. A row that failed to be eleven safe characters is dropped
 * rather than rendered, because there is no degraded way to show a video whose
 * identifier we do not trust.
 */
export async function getPublishedVideos(
  options: { limit?: number; subject?: VideoSubjectValue } = {},
): Promise<PublicVideo[]> {
  if (!isDatabaseConfigured()) return [];

  try {
    const rows = await getPrisma().video.findMany({
      where: {
        published: true,
        ...(options.subject ? { subject: options.subject } : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      ...(options.limit ? { take: options.limit } : {}),
      select: {
        id: true,
        youtubeId: true,
        title: true,
        description: true,
        subject: true,
      },
    });

    return rows
      .filter((row) => isYouTubeId(row.youtubeId))
      .map((row) => ({
        id: row.id,
        youtubeId: row.youtubeId,
        title: row.title,
        description: row.description,
        subject: row.subject as VideoSubjectValue,
      }));
  } catch (error) {
    logUnexpected('public.videos.failed', error);
    return [];
  }
}

/**
 * Which subjects have enough published videos to be worth filtering by.
 *
 * Master Plan: "filtered by subject only once each filter has three or more
 * videos." That is a stricter rule than the gallery's "only categories with
 * content", and it is a good one: a filter that returns a single video is a
 * control that costs a reader a click to learn nothing.
 *
 * Derived from `getPublishedVideos()` rather than from a separate `groupBy`,
 * so there is one visibility rule rather than two that can disagree.
 */
export const SUBJECT_FILTER_MINIMUM = 3;

export async function getVideoSubjects(): Promise<VideoSubjectValue[]> {
  const videos = await getPublishedVideos();
  const counts = new Map<VideoSubjectValue, number>();
  for (const video of videos) {
    counts.set(video.subject, (counts.get(video.subject) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= SUBJECT_FILTER_MINIMUM)
    .map(([subject]) => subject);
}
