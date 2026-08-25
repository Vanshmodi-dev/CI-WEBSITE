/**
 * Exercise the consent constraints against real PostgreSQL.
 *
 * Every previous report had to say these had "never executed". This script
 * attempts each invalid state and asserts the DATABASE rejects it — not the
 * form, not the server action, the database.
 *
 * All rows are clearly synthetic ("DEMO - Test ...") and every one is removed
 * before the script exits. Nothing here resembles a real student.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { env, exit } from 'node:process';

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = '') {
  pass += 1;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function bad(name, detail) {
  fail += 1;
  failures.push(`${name}: ${detail}`);
  console.log(`  FAIL  ${name} — ${detail}`);
}

/** Assert the database REJECTS this write. */
async function mustReject(name, fn) {
  try {
    await fn();
    bad(name, 'the database ACCEPTED a state it should have refused');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const constraint = message.match(/violates check constraint "([^"]+)"/)?.[1];
    if (constraint) ok(name, `rejected by ${constraint}`);
    else if (/violates|constraint|invalid/i.test(message)) ok(name, 'rejected by the database');
    else bad(name, `failed for the wrong reason: ${message.slice(0, 120)}`);
  }
}

/** Assert the database ACCEPTS this write, then clean it up. */
async function mustAccept(name, fn, cleanup) {
  try {
    const created = await fn();
    ok(name);
    if (cleanup) await cleanup(created);
  } catch (error) {
    bad(name, (error instanceof Error ? error.message : String(error)).slice(0, 160));
  }
}

const DEMO = 'DEMO - Test Student 001';
const CONSENT = 'DEMO-CONSENT-REF-001';

function topper(overrides = {}) {
  return {
    studentName: DEMO,
    displayNameMode: 'INITIALS',
    score: 90,
    scoreUnit: 'percent',
    programme: 'CLASS_12',
    year: 2026,
    published: false,
    consentResult: false,
    consentName: false,
    consentPhoto: false,
    ...overrides,
  };
}

function story(overrides = {}) {
  return {
    slug: `demo-test-story-${Math.random().toString(36).slice(2, 10)}`,
    studentName: DEMO,
    displayNameMode: 'INITIALS',
    programme: 'CLASS_12',
    year: 2026,
    challenge: 'DEMO test record.',
    journey: 'DEMO test record.',
    outcome: 'DEMO test record.',
    published: false,
    consentStory: false,
    consentName: false,
    consentPhoto: false,
    ...overrides,
  };
}

const NOW = new Date();

try {
  console.log('\n=== 1. THE DEFAULT IS PRIVATE ===');
  await mustAccept(
    'a new record with no consent saves as a draft',
    () => prisma.topper.create({ data: topper() }),
    (r) => prisma.topper.delete({ where: { id: r.id } }),
  );

  const defaults = await prisma.topper.create({
    data: {
      studentName: DEMO,
      score: 90,
      scoreUnit: 'percent',
      programme: 'CLASS_12',
      year: 2026,
    },
  });
  if (defaults.published === false) ok('published defaults to false');
  else bad('published defaults to false', `got ${defaults.published}`);
  if (defaults.displayNameMode === 'INITIALS') ok('displayNameMode defaults to INITIALS');
  else bad('displayNameMode defaults to INITIALS', `got ${defaults.displayNameMode}`);
  if (
    defaults.consentResult === false &&
    defaults.consentName === false &&
    defaults.consentPhoto === false
  ) {
    ok('all three permissions default to false');
  } else {
    bad('all three permissions default to false', 'a permission defaulted to true');
  }
  await prisma.topper.delete({ where: { id: defaults.id } });

  console.log('\n=== 2. PUBLISHING WITHOUT CONSENT IS IMPOSSIBLE ===');
  await mustReject('published with NO consent at all', () =>
    prisma.topper.create({
      data: topper({ published: true, publishedAt: NOW }),
    }),
  );
  await mustReject('published with consentResult but NO consent reference', () =>
    prisma.topper.create({
      data: topper({ published: true, publishedAt: NOW, consentResult: true }),
    }),
  );
  await mustReject('published with a consent reference but NO result permission', () =>
    prisma.topper.create({
      data: topper({ published: true, publishedAt: NOW, consentRef: CONSENT }),
    }),
  );
  await mustReject('published without publishedAt', () =>
    prisma.topper.create({
      data: topper({ published: true, consentRef: CONSENT, consentResult: true }),
    }),
  );

  console.log('\n=== 3. A PHOTO NEEDS ITS OWN PERMISSION ===');
  await mustReject('published photo WITHOUT photo permission', () =>
    prisma.topper.create({
      data: topper({
        published: true,
        publishedAt: NOW,
        consentRef: CONSENT,
        consentResult: true,
        photoUrl: '/photos/zz-demo.jpg',
      }),
    }),
  );
  await mustReject('result + name permission does not cover a photo', () =>
    prisma.topper.create({
      data: topper({
        published: true,
        publishedAt: NOW,
        consentRef: CONSENT,
        consentResult: true,
        consentName: true,
        displayNameMode: 'FULL',
        photoUrl: '/photos/zz-demo.jpg',
      }),
    }),
  );
  await mustAccept(
    'photo permission WITHOUT a photo is fine',
    () =>
      prisma.topper.create({
        data: topper({
          published: true,
          publishedAt: NOW,
          consentRef: CONSENT,
          consentResult: true,
          consentPhoto: true,
        }),
      }),
    (r) => prisma.topper.delete({ where: { id: r.id } }),
  );

  console.log('\n=== 4. A NAME NEEDS ITS OWN PERMISSION ===');
  await mustReject('FULL name WITHOUT name permission', () =>
    prisma.topper.create({
      data: topper({
        published: true,
        publishedAt: NOW,
        consentRef: CONSENT,
        consentResult: true,
        displayNameMode: 'FULL',
      }),
    }),
  );
  await mustReject('FIRST_NAME_ONLY WITHOUT name permission', () =>
    prisma.topper.create({
      data: topper({
        published: true,
        publishedAt: NOW,
        consentRef: CONSENT,
        consentResult: true,
        displayNameMode: 'FIRST_NAME_ONLY',
      }),
    }),
  );
  await mustAccept(
    'INITIALS needs no name permission',
    () =>
      prisma.topper.create({
        data: topper({
          published: true,
          publishedAt: NOW,
          consentRef: CONSENT,
          consentResult: true,
          displayNameMode: 'INITIALS',
        }),
      }),
    (r) => prisma.topper.delete({ where: { id: r.id } }),
  );

  console.log('\n=== 5. THE RULE THAT MOTIVATED THE REDESIGN ===');
  await mustReject('STORY published WITHOUT story permission', () =>
    prisma.studentStory.create({
      data: story({ published: true, publishedAt: NOW, consentRef: CONSENT }),
    }),
  );
  await mustReject('STORY + photo, but NO photo permission', () =>
    prisma.studentStory.create({
      data: story({
        published: true,
        publishedAt: NOW,
        consentRef: CONSENT,
        consentStory: true,
        photoUrl: '/photos/zz-demo.jpg',
      }),
    }),
  );
  await mustAccept(
    'STORY published with story permission and NO photo',
    () =>
      prisma.studentStory.create({
        data: story({
          published: true,
          publishedAt: NOW,
          consentRef: CONSENT,
          consentStory: true,
        }),
      }),
    (r) => prisma.studentStory.delete({ where: { id: r.id } }),
  );

  console.log('\n=== 6. UPDATES ARE GATED TOO, NOT JUST INSERTS ===');
  const draft = await prisma.topper.create({ data: topper() });
  await mustReject('flipping published on a draft with no consent', () =>
    prisma.topper.update({
      where: { id: draft.id },
      data: { published: true, publishedAt: NOW },
    }),
  );
  await mustAccept(
    'flipping published once consent is recorded',
    () =>
      prisma.topper.update({
        where: { id: draft.id },
        data: {
          published: true,
          publishedAt: NOW,
          consentRef: CONSENT,
          consentResult: true,
        },
      }),
    null,
  );
  await mustReject('removing the consent reference from a published row', () =>
    prisma.topper.update({ where: { id: draft.id }, data: { consentRef: null } }),
  );
  await mustReject('revoking result permission on a published row', () =>
    prisma.topper.update({ where: { id: draft.id }, data: { consentResult: false } }),
  );
  await prisma.topper.delete({ where: { id: draft.id } });

  console.log('\n=== 7. DATA SANITY ===');
  await mustReject('a percentage above 100', () =>
    prisma.topper.create({ data: topper({ score: 101 }) }),
  );
  await mustReject('an unknown score unit', () =>
    prisma.topper.create({ data: topper({ scoreUnit: 'stars' }) }),
  );
  await mustReject('an implausible year', () =>
    prisma.topper.create({ data: topper({ year: 1990 }) }),
  );
  await mustAccept(
    'marks above 100 are fine when the unit is marks',
    () => prisma.topper.create({ data: topper({ score: 480, scoreUnit: 'marks' }) }),
    (r) => prisma.topper.delete({ where: { id: r.id } }),
  );

  console.log('\n=== 8. ANNOUNCEMENT VALIDITY WINDOW ===');
  await mustReject('an announcement that ends before it starts', () =>
    prisma.announcement.create({
      data: {
        message: 'DEMO - Test Announcement',
        startsAt: new Date('2026-09-10'),
        endsAt: new Date('2026-09-01'),
      },
    }),
  );
  await mustReject('an announcement with a zero-length window', () =>
    prisma.announcement.create({
      data: {
        message: 'DEMO - Test Announcement',
        startsAt: new Date('2026-09-01'),
        endsAt: new Date('2026-09-01'),
      },
    }),
  );
  await mustAccept(
    'a valid announcement window',
    () =>
      prisma.announcement.create({
        data: {
          message: 'DEMO - Test Announcement',
          startsAt: new Date('2026-09-01'),
          endsAt: new Date('2026-09-30'),
        },
      }),
    (r) => prisma.announcement.delete({ where: { id: r.id } }),
  );

  console.log('\n=== 9. ENQUIRY INTEGRITY ===');
  const goodHash = 'a'.repeat(64);
  await mustReject('a raw IP address in the ipHash column', () =>
    prisma.enquiry.create({
      data: {
        name: 'DEMO Tester',
        phone: '919000000001',
        classLevel: 'CLASS_12',
        sourcePage: '/admissions',
        consentAt: NOW,
        ipHash: '203.0.113.45'.padEnd(64, ' '),
      },
    }),
  );
  await mustReject('a non-numeric phone number', () =>
    prisma.enquiry.create({
      data: {
        name: 'DEMO Tester',
        phone: 'not-a-number',
        classLevel: 'CLASS_12',
        sourcePage: '/admissions',
        consentAt: NOW,
        ipHash: goodHash,
      },
    }),
  );
  await mustReject('a blank name', () =>
    prisma.enquiry.create({
      data: {
        name: '   ',
        phone: '919000000001',
        classLevel: 'CLASS_12',
        sourcePage: '/admissions',
        consentAt: NOW,
        ipHash: goodHash,
      },
    }),
  );

  console.log('\n=== 10. ADMIN INTEGRITY ===');
  await mustReject('a plaintext password in the hash column', () =>
    prisma.adminUser.create({
      data: {
        email: 'demo-test@example.com',
        displayName: 'DEMO Admin',
        passwordHash: 'hunter2',
      },
    }),
  );
  await mustReject('an uppercase email', () =>
    prisma.adminUser.create({
      data: {
        email: 'DEMO-TEST@example.com',
        displayName: 'DEMO Admin',
        passwordHash: 'scrypt$131072$8$1$AAAA$BBBB',
      },
    }),
  );
  await mustReject('an unknown audit action', () =>
    prisma.auditLog.create({
      data: { actorLabel: 'DEMO', action: 'exfiltrated', entity: 'Topper', entityId: 'x' },
    }),
  );

  /**
   * AND THE OTHER DIRECTION, WHICH IS THE ONE THAT ACTUALLY BIT (Phase 14).
   *
   * Rejecting an unknown action was always checked. Accepting every KNOWN one
   * never was - and that asymmetry is exactly how Phase 12's defect survived:
   * `signed_out` was added to the code, never to the constraint, so the
   * database correctly refused an action it did not know about while
   * recordAudit() swallowed the failure. Every sign-out went unaudited for two
   * phases and the check above passed the whole time.
   *
   * tests/import.test.ts cross-checks the TypeScript union against the
   * migration SQL. This is the live-database half: the SQL on disk and the
   * constraint actually applied are not the same thing, which is the other
   * lesson of Phase 12.
   */
  for (const action of [
    'created', 'updated', 'published', 'unpublished',
    'deleted', 'signed_in', 'signed_out', 'imported',
  ]) {
    await mustAccept(
      `the audit constraint accepts "${action}"`,
      () => prisma.auditLog.create({
        data: { actorLabel: 'DEMO', action, entity: 'Topper', entityId: 'demo-action' },
      }),
      (row) => prisma.auditLog.delete({ where: { id: row.id } }),
    );
  }

  console.log('\n=== 11. CASCADE BEHAVIOUR ===');
  const parent = await prisma.topper.create({
    data: {
      ...topper(),
      subjectScores: {
        create: [
          { subject: 'DEMO Subject A', score: 90 },
          { subject: 'DEMO Subject B', score: 88 },
        ],
      },
    },
  });
  const before = await prisma.subjectScore.count({ where: { topperId: parent.id } });
  await prisma.topper.delete({ where: { id: parent.id } });
  const after = await prisma.subjectScore.count({ where: { topperId: parent.id } });
  if (before === 2 && after === 0) ok('deleting a topper cascades to their subject scores');
  else bad('cascade delete', `before=${before} after=${after}`);

  console.log('\n=== CLEANUP ===');
  const leftovers = await Promise.all([
    prisma.topper.deleteMany({ where: { studentName: { startsWith: 'DEMO' } } }),
    prisma.studentStory.deleteMany({ where: { studentName: { startsWith: 'DEMO' } } }),
    prisma.announcement.deleteMany({ where: { message: { startsWith: 'DEMO' } } }),
    prisma.enquiry.deleteMany({ where: { name: { startsWith: 'DEMO' } } }),
    prisma.adminUser.deleteMany({ where: { email: { contains: 'demo-test' } } }),
  ]);
  console.log(`  removed ${leftovers.reduce((n, r) => n + r.count, 0)} leftover DEMO rows`);

  const remaining = await Promise.all([
    prisma.topper.count(),
    prisma.studentStory.count(),
    prisma.announcement.count(),
  ]);
  console.log(`  student/content rows remaining: ${remaining.reduce((a, b) => a + b, 0)}`);

  console.log(`\n${'='.repeat(52)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('='.repeat(52));
} catch (error) {
  console.error('\nHarness error:', error instanceof Error ? error.stack : error);
  fail += 1;
} finally {
  await prisma.$disconnect();
}

exit(fail > 0 ? 1 : 0);
