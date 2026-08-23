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

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const prisma = getPrisma();
  const now = new Date();

  const [newEnquiries, totalEnquiries, activeBatches, toppers, results, liveAnnouncements] =
    await Promise.all([
      prisma.enquiry.count({ where: { status: 'NEW' } }),
      prisma.enquiry.count(),
      prisma.batch.count({ where: { published: true, startsAt: { gte: now } } }),
      prisma.topper.count({ where: { published: true } }),
      prisma.resultRecord.count({ where: { published: true } }),
      prisma.announcement.count({
        where: { published: true, startsAt: { lte: now }, endsAt: { gte: now } },
      }),
    ]);

  return {
    newEnquiries,
    totalEnquiries,
    activeBatches,
    publishedResults: toppers + results,
    liveAnnouncements,
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
};

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

  return getPrisma().enquiry.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
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
  });
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

export async function listToppers() {
  return getPrisma().topper.findMany({
    orderBy: [{ year: 'desc' }, { sortOrder: 'asc' }],
    take: 300,
  });
}

export async function getTopper(id: string) {
  return getPrisma().topper.findUnique({ where: { id } });
}

export async function listBatches() {
  return getPrisma().batch.findMany({ orderBy: { startsAt: 'desc' }, take: 200 });
}

export async function getBatch(id: string) {
  return getPrisma().batch.findUnique({ where: { id } });
}

export async function listAnnouncements() {
  return getPrisma().announcement.findMany({
    orderBy: { startsAt: 'desc' },
    take: 200,
  });
}

export async function getAnnouncement(id: string) {
  return getPrisma().announcement.findUnique({ where: { id } });
}

export async function listStories() {
  return getPrisma().studentStory.findMany({
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export async function getStory(id: string) {
  return getPrisma().studentStory.findUnique({ where: { id } });
}
