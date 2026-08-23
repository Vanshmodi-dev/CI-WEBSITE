import 'server-only';

import { getPrisma } from '@/lib/db';

/**
 * Read queries for the admin.
 *
 * Everything here runs on the server and is only ever called from a page that
 * has already passed `requireAdmin()`.
 *
 * NOTE ON WHAT THE ADMIN SEES: unlike the public site, the admin deliberately
 * sees UNPUBLISHED records — that is the point of a draft. What it must never
 * see is internal machinery: `ipHash` is excluded from every enquiry query
 * below, because there is nothing a teacher can do with an HMAC digest.
 */

export type DashboardSummary = {
  newEnquiries: number;
  totalEnquiries: number;
  activeBatches: number;
  publishedResults: number;
  liveAnnouncements: number;
};

/**
 * Dashboard figures in ONE round trip.
 *
 * This was six parallel `count()` calls. Measured against real PostgreSQL at
 * 1,000 students: 759 ms on a cold pool, 3 ms warm — the cost was six
 * connections being opened at once, not the counting. On a provider that
 * suspends when idle (Neon's free tier does), every visit after a quiet spell
 * pays that. One query opens one connection.
 *
 * Counting is cheap here and stays cheap: the institute is ~1,000 students, not
 * a million rows.
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const rows = await getPrisma().$queryRaw<
    Array<{
      new_enquiries: bigint;
      total_enquiries: bigint;
      active_batches: bigint;
      published_toppers: bigint;
      published_results: bigint;
      live_announcements: bigint;
    }>
  >`
    SELECT
      (SELECT count(*) FROM "enquiries" WHERE "status" = 'NEW')              AS new_enquiries,
      (SELECT count(*) FROM "enquiries")                                      AS total_enquiries,
      (SELECT count(*) FROM "batches"
         WHERE "published" AND "startsAt" >= now())                           AS active_batches,
      (SELECT count(*) FROM "toppers" WHERE "published")                      AS published_toppers,
      (SELECT count(*) FROM "result_records" WHERE "published")               AS published_results,
      (SELECT count(*) FROM "announcements"
         WHERE "published" AND "startsAt" <= now() AND "endsAt" >= now())     AS live_announcements
  `;

  const r = rows[0];
  const n = (value: bigint | undefined) => Number(value ?? 0n);

  return {
    newEnquiries: n(r?.new_enquiries),
    totalEnquiries: n(r?.total_enquiries),
    activeBatches: n(r?.active_batches),
    publishedResults: n(r?.published_toppers) + n(r?.published_results),
    liveAnnouncements: n(r?.live_announcements),
  };
}

export async function getRecentEnquiries(limit = 5) {
  return getPrisma().enquiry.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    // ipHash is never selected. It is abuse-control machinery, not lead data.
    select: {
      id: true,
      name: true,
      classLevel: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function getUpcomingBatches(limit = 4) {
  return getPrisma().batch.findMany({
    where: { startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: limit,
    select: {
      id: true,
      courseSlug: true,
      startsAt: true,
      mode: true,
      published: true,
    },
  });
}

export type EnquiryFilter = {
  status?: 'NEW' | 'CONTACTED' | 'ENROLLED' | 'CLOSED' | 'SPAM';
  q?: string;
  page?: number;
};

/**
 * PAGE SIZE, and why it exists.
 *
 * These lists were previously capped with a bare `take`, which SILENTLY
 * TRUNCATED: at ~1,000 students the admin would have shown 300 and given no
 * hint that 700 were missing. A cap that hides data without saying so is worse
 * than a slow query. Verified at 1,000 rows — page 1 and page 10 both return
 * in single-digit milliseconds using the existing indexes.
 */
export const PAGE_SIZE = 50;

export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  pageCount: number;
};

function pageArgs(page: number | undefined) {
  const current = Math.max(1, Math.floor(page ?? 1));
  return { current, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

export async function listEnquiries(filter: EnquiryFilter = {}) {
  const where: Record<string, unknown> = {};
  if (filter.status) where.status = filter.status;
  if (filter.q && filter.q.trim().length > 0) {
    const q = filter.q.trim().slice(0, 80);
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q.replace(/\D/g, '') || q } },
    ];
  }

  const prisma = getPrisma();
  const { current, skip, take } = pageArgs(filter.page);

  // Count and page fetched together so the UI can say "page 3 of 12" rather
  // than leaving the teacher guessing whether there is more.
  const [total, rows] = await Promise.all([
    prisma.enquiry.count({ where }),
    prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        classLevel: true,
        courseSlug: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    rows,
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getEnquiry(id: string) {
  return getPrisma().enquiry.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      classLevel: true,
      courseSlug: true,
      message: true,
      sourcePage: true,
      status: true,
      notes: true,
      createdAt: true,
      // Still no ipHash, and no consentAt — neither helps a teacher answer a lead.
    },
  });
}

export type TopperFilter = {
  programme?: string;
  status?: 'published' | 'draft';
  /** Free-text search on the student's name. */
  q?: string;
  page?: number;
};

/**
 * Filtering moved to the DATABASE.
 *
 * The previous version fetched every row and filtered in memory, which does
 * not survive 1,000 students: it transfers the whole table to filter out most
 * of it, and the `take` cap silently dropped the rest.
 */
export async function listToppers(filter: TopperFilter = {}) {
  const prisma = getPrisma();
  const { current, skip, take } = pageArgs(filter.page);

  const where: Record<string, unknown> = {};
  if (filter.programme) where.programme = filter.programme;
  if (filter.status === 'published') where.published = true;
  if (filter.status === 'draft') where.published = false;

  // Searching by name is how a teacher actually finds one student among a
  // thousand — scrolling pages of results is not a workflow. Case-insensitive
  // and database-side; at ~1,000 rows a sequential scan is single-digit
  // milliseconds (measured in Phase 5.5).
  if (filter.q && filter.q.trim().length > 0) {
    where.studentName = { contains: filter.q.trim().slice(0, 80), mode: 'insensitive' };
  }

  const [total, rows] = await Promise.all([
    prisma.topper.count({ where }),
    prisma.topper.findMany({
      where,
      orderBy: [{ year: 'desc' }, { sortOrder: 'asc' }],
      skip,
      take,
      include: { subjectScores: { orderBy: { subject: 'asc' } } },
    }),
  ]);

  return {
    rows,
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getTopper(id: string) {
  return getPrisma().topper.findUnique({
    where: { id },
    include: { subjectScores: { orderBy: { subject: 'asc' } } },
  });
}

/**
 * Not paginated, deliberately. Batches are bounded by the calendar, not by
 * student count — a few per year. 200 is a safety ceiling, not a page size,
 * and it would take a century to reach it.
 */
export async function listBatches() {
  return getPrisma().batch.findMany({ orderBy: { startsAt: 'desc' }, take: 200 });
}

export async function getBatch(id: string) {
  return getPrisma().batch.findUnique({ where: { id } });
}

/** Not paginated for the same reason as batches: bounded by the calendar. */
export async function listAnnouncements() {
  return getPrisma().announcement.findMany({
    orderBy: { startsAt: 'desc' },
    take: 200,
  });
}

export async function getAnnouncement(id: string) {
  return getPrisma().announcement.findUnique({ where: { id } });
}

export async function listStories(page?: number) {
  const prisma = getPrisma();
  const { current, skip, take } = pageArgs(page);
  const [total, rows] = await Promise.all([
    prisma.studentStory.count(),
    prisma.studentStory.findMany({
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return {
    rows,
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getStory(id: string) {
  return getPrisma().studentStory.findUnique({ where: { id } });
}
