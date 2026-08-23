/**
 * Scale check at ~1,000 students.
 *
 * Inserts clearly-synthetic DEMO rows, times the queries the admin actually
 * runs, checks the planner uses the indexes we built, then deletes everything.
 *
 * Every row is named "DEMO - Load Test ..." and every one is removed at the
 * end. Nothing here could be mistaken for a real student, and nothing here is
 * ever published (all rows stay published=false).
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { env, exit } from 'node:process';
import { createHash } from 'node:crypto';

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const STUDENTS = 1000;
const ENQUIRIES = 1000;
const PREFIX = 'DEMO - Load Test';

async function time(label, fn) {
  const started = performance.now();
  const result = await fn();
  const ms = performance.now() - started;
  const count = Array.isArray(result) ? result.length : result;
  console.log(`  ${String(Math.round(ms)).padStart(5)} ms  ${label}  (${count} rows)`);
  return ms;
}

try {
  console.log(`\n=== SEEDING ${STUDENTS} DEMO students + ${ENQUIRIES} DEMO enquiries ===`);
  console.log('  All synthetic, all unpublished, all removed at the end.\n');

  const programmes = ['CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CMA'];
  const years = [2023, 2024, 2025, 2026];

  const toppers = Array.from({ length: STUDENTS }, (_, i) => ({
    studentName: `${PREFIX} Student ${String(i + 1).padStart(4, '0')}`,
    displayNameMode: 'INITIALS',
    score: 60 + (i % 40),
    scoreUnit: 'percent',
    programme: programmes[i % programmes.length],
    year: years[i % years.length],
    published: false,
    consentResult: false,
    consentName: false,
    consentPhoto: false,
  }));

  const enquiries = Array.from({ length: ENQUIRIES }, (_, i) => ({
    name: `${PREFIX} Enquiry ${String(i + 1).padStart(4, '0')}`,
    phone: `9190000${String(i).padStart(5, '0')}`,
    classLevel: ['CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'OTHER'][i % 4],
    sourcePage: '/admissions',
    status: ['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED'][i % 4],
    consentAt: new Date(),
    ipHash: createHash('sha256').update(`demo-${i % 50}`).digest('hex'),
    createdAt: new Date(Date.now() - i * 60_000),
  }));

  let t = performance.now();
  await prisma.topper.createMany({ data: toppers });
  await prisma.enquiry.createMany({ data: enquiries });
  console.log(`  seeded in ${Math.round(performance.now() - t)} ms`);

  await prisma.$executeRawUnsafe('ANALYZE');

  console.log('\n=== QUERY TIMINGS AT SCALE ===');
  await time('count all toppers', () => prisma.topper.count());
  await time('published toppers by year (indexed)', () =>
    prisma.topper.findMany({ where: { published: true }, orderBy: { year: 'desc' }, take: 50 }),
  );
  await time('admin students page 1 (50)', () =>
    prisma.topper.findMany({ orderBy: [{ year: 'desc' }, { sortOrder: 'asc' }], take: 50 }),
  );
  await time('admin students page 10 (skip 450)', () =>
    prisma.topper.findMany({
      orderBy: [{ year: 'desc' }, { sortOrder: 'asc' }],
      skip: 450,
      take: 50,
    }),
  );
  await time('filter by programme', () =>
    prisma.topper.findMany({ where: { programme: 'CLASS_12' }, take: 50 }),
  );
  await time('enquiries page 1 (50)', () =>
    prisma.enquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  );
  await time('enquiries filtered by status (indexed)', () =>
    prisma.enquiry.findMany({
      where: { status: 'NEW' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  );
  await time('enquiry search by name (no index — seq scan)', () =>
    prisma.enquiry.findMany({
      where: { name: { contains: '0042', mode: 'insensitive' } },
      take: 50,
    }),
  );
  await time('rate-limit count by ipHash (indexed)', () =>
    prisma.enquiry.count({
      where: {
        ipHash: createHash('sha256').update('demo-7').digest('hex'),
        createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
      },
    }),
  );
  await time('duplicate check by phone (indexed)', () =>
    prisma.enquiry.count({
      where: { phone: '919000000042', createdAt: { gte: new Date(Date.now() - 600_000) } },
    }),
  );
  await time('dashboard summary (6 parallel counts)', async () => {
    const now = new Date();
    const r = await Promise.all([
      prisma.enquiry.count({ where: { status: 'NEW' } }),
      prisma.enquiry.count(),
      prisma.batch.count({ where: { published: true, startsAt: { gte: now } } }),
      prisma.topper.count({ where: { published: true } }),
      prisma.resultRecord.count({ where: { published: true } }),
      prisma.announcement.count({
        where: { published: true, startsAt: { lte: now }, endsAt: { gte: now } },
      }),
    ]);
    return r.reduce((a, b) => a + b, 0);
  });

  console.log('\n=== INDEX USAGE (query planner) ===');
  const plans = [
    ['rate-limit lookup', `SELECT count(*) FROM enquiries WHERE "ipHash" = '${createHash('sha256').update('demo-7').digest('hex')}' AND "createdAt" > now() - interval '15 min'`],
    ['status filter', `SELECT * FROM enquiries WHERE status = 'NEW' ORDER BY "createdAt" DESC LIMIT 50`],
    ['published toppers', `SELECT * FROM toppers WHERE published = true AND year = 2026`],
    ['duplicate check', `SELECT * FROM enquiries WHERE phone = '919000000042' AND "createdAt" > now() - interval '10 min'`],
  ];
  for (const [label, sql] of plans) {
    const rows = await prisma.$queryRawUnsafe(`EXPLAIN ${sql}`);
    const plan = rows.map((r) => Object.values(r)[0]).join(' ');
    const usesIndex = /Index (Scan|Only Scan|Cond)|Bitmap Index/i.test(plan);
    console.log(`  ${usesIndex ? 'INDEX  ' : 'SEQSCAN'} ${label}`);
    console.log(`          ${plan.split('  ')[0].trim().slice(0, 100)}`);
  }

  console.log('\n=== TABLE SIZES AT THIS SCALE ===');
  const sizes = await prisma.$queryRaw`
    SELECT relname AS table_name,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 6`;
  for (const s of sizes) console.log(`  ${s.table_name.padEnd(20)} ${s.total}`);

  const [{ total }] = await prisma.$queryRaw`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS total`;
  console.log(`  ${'DATABASE TOTAL'.padEnd(20)} ${total}`);

  console.log('\n=== CLEANUP ===');
  const a = await prisma.topper.deleteMany({ where: { studentName: { startsWith: PREFIX } } });
  const b = await prisma.enquiry.deleteMany({ where: { name: { startsWith: PREFIX } } });
  console.log(`  deleted ${a.count} DEMO students and ${b.count} DEMO enquiries`);
  console.log(`  rows remaining: toppers=${await prisma.topper.count()} enquiries=${await prisma.enquiry.count()}`);
} catch (error) {
  console.error('Scale check failed:', error instanceof Error ? error.stack : error);
  exit(1);
} finally {
  await prisma.$disconnect();
}
