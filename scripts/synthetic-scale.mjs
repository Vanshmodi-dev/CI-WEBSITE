/**
 * Synthetic content at realistic scale, for performance measurement only.
 *
 * The institute has supplied no content yet, so an empty database says nothing
 * about how the site behaves once it holds four years of results. This fills it
 * with obviously-fake rows, measures against them, and removes them.
 *
 * ⚠ EVERY ROW IS PREFIXED `ZZTEST`. Nothing here resembles a real student, a
 * real mark, a real story or a real institute claim. The names are literally
 * `ZZTEST-STUDENT-0001`; the "stories" are three sentences of filler that say
 * they are filler. If any of this were ever to reach a public page by accident,
 * it would be unmistakable rather than plausible — which is the entire point.
 *
 * `clean` deletes every ZZTEST row and is safe to run at any time. The database
 * must end every session at zero content rows.
 *
 *   node scripts/synthetic-scale.mjs seed
 *   node scripts/synthetic-scale.mjs clean
 *   node scripts/synthetic-scale.mjs count
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { env, argv, exit } from 'node:process';
import { createHash } from 'node:crypto';

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const P = 'ZZTEST';
const STUDENTS = 1000;
const SUBJECTS_EACH = 3;
const STORIES = 80; // deliberately above the 60-row cap in getPublishedStories
const BATCHES = 30;
const ANNOUNCEMENTS = 12;
const ENQUIRIES = 500;

const PROGRAMMES = ['CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CMA'];
const BOARDS = ['CBSE', 'RBSE', 'ICAI', 'OTHER'];
const YEARS = [2023, 2024, 2025, 2026];
const COURSES = [
  'class-11-commerce',
  'class-12-commerce',
  'ca-foundation',
  'ca-intermediate',
  'cma',
];

const pad = (n, w = 4) => String(n).padStart(w, '0');
const day = 86_400_000;

async function seed() {
  await clean({ quiet: true });
  const started = performance.now();

  /**
   * Published AND consented, because the point is to measure the public site.
   * `consentPhoto` stays false throughout: we hold no photographs, synthetic or
   * otherwise, and inventing one would be inventing a student.
   */
  const toppers = Array.from({ length: STUDENTS }, (_, i) => ({
    studentName: `${P}-STUDENT-${pad(i + 1)}`,
    // Derived from consentName, not chosen independently: the database CHECK
    // constraint `toppers_name_requires_name_consent` rejects FULL without it,
    // and rightly so. The first draft of this fixture picked the two at random
    // and Postgres refused the insert — the constraint doing its job.
    displayNameMode: i % 2 === 0 ? 'FULL' : 'INITIALS',
    score: 55 + (i % 45),
    scoreUnit: i % 7 === 0 ? 'marks' : 'percent',
    programme: PROGRAMMES[i % PROGRAMMES.length],
    // Always set: `createMany` builds one INSERT, so a null enum in a mixed
    // batch is rejected by Prisma. The null-board render path is covered by the
    // integration suite instead.
    board: BOARDS[i % BOARDS.length],
    year: YEARS[i % YEARS.length],
    highlight: i % 5 === 0 ? `${P} synthetic highlight ${pad(i + 1)}` : null,
    consentRef: `${P}-CONSENT-${pad(i + 1)}`,
    consentResult: true,
    consentName: i % 2 === 0,
    consentPhoto: false,
    published: true,
    publishedAt: new Date(Date.now() - i * 3600_000),
    sortOrder: i % 10,
  }));

  await prisma.topper.createMany({ data: toppers });
  const ids = await prisma.topper.findMany({
    where: { studentName: { startsWith: P } },
    select: { id: true },
  });

  const subjects = [];
  for (const [i, row] of ids.entries()) {
    for (let s = 0; s < SUBJECTS_EACH; s += 1) {
      subjects.push({
        topperId: row.id,
        subject: ['Accountancy', 'Business Studies', 'Economics'][s],
        score: 50 + ((i + s * 7) % 50),
      });
    }
  }
  await prisma.subjectScore.createMany({ data: subjects });

  await prisma.studentStory.createMany({
    data: Array.from({ length: STORIES }, (_, i) => ({
      slug: `${P.toLowerCase()}-story-${pad(i + 1)}`,
      studentName: `${P}-STORY-STUDENT-${pad(i + 1)}`,
      displayNameMode: i % 2 === 0 ? 'FULL' : 'INITIALS', // must agree with consentName

      programme: PROGRAMMES[i % PROGRAMMES.length],
      year: YEARS[i % YEARS.length],
      challenge: `${P} synthetic challenge text ${pad(i + 1)}. This is placeholder copy written for a performance measurement and describes no real person.`,
      journey: `${P} synthetic journey text ${pad(i + 1)}. This paragraph exists to give the page a realistic byte weight and contains no institute claim, no result and no testimonial.`,
      outcome: `${P} synthetic outcome text ${pad(i + 1)}. Placeholder only.`,
      quote: i % 3 === 0 ? `${P} synthetic quote ${pad(i + 1)}.` : null,
      consentRef: `${P}-CONSENT-STORY-${pad(i + 1)}`,
      consentStory: true,
      consentName: i % 2 === 0,
      consentPhoto: false,
      published: true,
      publishedAt: new Date(Date.now() - i * day),
    })),
  });

  await prisma.batch.createMany({
    data: Array.from({ length: BATCHES }, (_, i) => ({
      courseSlug: COURSES[i % COURSES.length],
      startsAt: new Date(Date.now() + (i + 1) * 3 * day),
      mode: ['Offline', 'Online live', 'Offline + online live'][i % 3],
      // Always prefixed, never null: the prefix is how `clean` finds it again.
      seatsNote: `${P} seats note ${pad(i + 1)}`,
      published: true,
    })),
  });

  await prisma.announcement.createMany({
    data: Array.from({ length: ANNOUNCEMENTS }, (_, i) => ({
      message: `${P} synthetic announcement ${pad(i + 1)} — placeholder notice for performance measurement.`,
      href: i % 3 === 0 ? '/courses' : null,
      startsAt: new Date(Date.now() - (i + 1) * day),
      endsAt: new Date(Date.now() + (30 - i) * day),
      priority: i % 5,
      published: true,
    })),
  });

  await prisma.enquiry.createMany({
    data: Array.from({ length: ENQUIRIES }, (_, i) => ({
      name: `${P}-ENQUIRY-${pad(i + 1)}`,
      phone: `9190000${pad(i, 5)}`,
      classLevel: ['CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'OTHER'][i % 4],
      sourcePage: '/admissions',
      status: ['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED'][i % 4],
      consentAt: new Date(),
      ipHash: createHash('sha256').update(`${P}-${i % 40}`).digest('hex'),
      createdAt: new Date(Date.now() - i * 60_000),
    })),
  });

  // The planner needs statistics or it will seq-scan a table it has never seen.
  await prisma.$executeRawUnsafe('ANALYZE');

  console.log(`Seeded in ${Math.round(performance.now() - started)} ms:`);
  await count();
}

async function clean({ quiet = false } = {}) {
  // Subject scores cascade from toppers; enquiries and the rest are matched by
  // the ZZTEST prefix so nothing outside the fixture can be touched.
  const removed = {
    subjectScores: (
      await prisma.subjectScore.deleteMany({
        where: { topper: { studentName: { startsWith: P } } },
      })
    ).count,
    toppers: (await prisma.topper.deleteMany({ where: { studentName: { startsWith: P } } })).count,
    stories: (
      await prisma.studentStory.deleteMany({ where: { studentName: { startsWith: P } } })
    ).count,
    batches: (await prisma.batch.deleteMany({ where: { seatsNote: { startsWith: P } } })).count,
    announcements: (
      await prisma.announcement.deleteMany({ where: { message: { startsWith: P } } })
    ).count,
    enquiries: (await prisma.enquiry.deleteMany({ where: { name: { startsWith: P } } })).count,
  };
  if (!quiet) {
    console.log('Removed:', JSON.stringify(removed));
    await count();
  }
}

async function count() {
  const totals = {
    toppers: await prisma.topper.count(),
    subjectScores: await prisma.subjectScore.count(),
    resultRecords: await prisma.resultRecord.count(),
    stories: await prisma.studentStory.count(),
    batches: await prisma.batch.count(),
    announcements: await prisma.announcement.count(),
    enquiries: await prisma.enquiry.count(),
  };
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(`  TOTAL CONTENT ROWS: ${total} ${JSON.stringify(totals)}`);
  return total;
}

const command = argv[2];
try {
  if (command === 'seed') await seed();
  else if (command === 'clean') await clean();
  else if (command === 'count') await count();
  else {
    console.error('Usage: node scripts/synthetic-scale.mjs seed|clean|count');
    exit(1);
  }
} finally {
  await prisma.$disconnect();
}
