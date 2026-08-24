/**
 * Public data isolation — the test that matters most on this project.
 *
 * Seeds records in every consent state, renders the REAL public pages over
 * HTTP, and asserts what does and does not appear in the delivered HTML.
 *
 * This tests the actual code path a visitor hits, not a reimplementation of it.
 * A unit test of `present()` proves the function is correct; only this proves
 * the page uses it.
 *
 * Every row is prefixed "ZZDEMO" and removed at the end. The names are
 * deliberately non-human ("ZZDEMO Published Full") so nothing here could ever
 * be mistaken for a real student.
 *
 * Usage: BASE_URL=http://localhost:PORT node scripts/verify-public-isolation.mjs
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { env, exit } from 'node:process';

const BASE = env.BASE_URL ?? 'http://localhost:3160';
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
function ok(n, d = '') { pass += 1; console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`); }
function bad(n, d) { fail += 1; failures.push(`${n}: ${d}`); console.log(`  FAIL  ${n} — ${d}`); }
function check(cond, n, d = '') { if (cond) ok(n, d); else bad(n, d || 'condition was false'); }

async function html(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Cache-Control': 'no-cache' } });
  return res.text();
}

const NOW = new Date();
const PAST = new Date(Date.now() - 30 * 86400_000);
const FUTURE = new Date(Date.now() + 30 * 86400_000);
const REF = 'ZZDEMO-CONSENT';
// A path unique to this fixture. Using the site logo here made the photo
// counter meaningless — it appears in the header of every page.
const PHOTO = '/zzdemo-fixture-photo.jpg';
// A second path used ONLY on records that must never reach the public site.
// If this string ever appears in rendered HTML, something leaked.
const FORBIDDEN_PHOTO = '/zzdemo-must-never-render.jpg';

const MODE = env.MODE ?? 'all';

/**
 * An unrecognised MODE used to do nothing at all and exit 0 — a run that looked
 * like a pass. Phase 9 lost time to `MODE=clean` (the mode is `cleanup`), which
 * left fixtures behind and then failed three assertions in a DIFFERENT suite.
 * Silent success is the one outcome this project does not tolerate anywhere
 * else, so it is not tolerated here either.
 */
const MODES = ['all', 'seed', 'assert', 'cleanup'];
if (!MODES.includes(MODE)) {
  console.error(`Unknown MODE "${MODE}". Expected one of: ${MODES.join(', ')}`);
  exit(1);
}

const doSeed = MODE === 'seed' || MODE === 'all';
const doAssert = MODE === 'assert' || MODE === 'all';
const doCleanup = MODE === 'cleanup' || MODE === 'all';

/**
 * MODES. The public pages are ISR-cached, so rows inserted after the server
 * boots do not appear until the revalidate window expires. That is correct
 * caching behaviour, not a bug — so the harness seeds FIRST, the app is then
 * started, and only then are the assertions run.
 *
 *   MODE=seed     insert fixtures and exit
 *   MODE=assert   run the checks against a running app
 *   MODE=cleanup  delete every ZZDEMO row
 */
let photoWithoutConsentRejected = false;
let storyPhotoRejected = false;

try {
if (doSeed) {
  console.log('\n=== SEEDING every consent combination ===');

  // Results ---------------------------------------------------------------
  const rFull = await prisma.topper.create({
    data: {
      studentName: 'ZZDEMO Published Full', displayNameMode: 'FULL',
      programme: 'CLASS_12', year: 2026, score: 91, scoreUnit: 'percent',
      consentRef: REF, consentResult: true, consentName: true, consentPhoto: true,
      photoUrl: PHOTO, published: true, publishedAt: NOW,
      highlight: 'ZZDEMO highlight',
    },
  });
  const rNoName = await prisma.topper.create({
    data: {
      studentName: 'ZZDEMO Nameless Person', displayNameMode: 'INITIALS',
      programme: 'CLASS_12', year: 2026, score: 92, scoreUnit: 'percent',
      consentRef: REF, consentResult: true, consentName: false, consentPhoto: false,
      published: true, publishedAt: NOW,
    },
  });
  // No photo consent => no photoUrl. The database REFUSES to store a published
  // row that has a photo without photo permission, so this combination cannot
  // exist. That refusal is asserted explicitly below.
  const rNoPhoto = await prisma.topper.create({
    data: {
      studentName: 'ZZDEMO Nophoto Person', displayNameMode: 'FULL',
      programme: 'CA_FOUNDATION', year: 2025, score: 88, scoreUnit: 'percent',
      consentRef: REF, consentResult: true, consentName: true, consentPhoto: false,
      published: true, publishedAt: NOW,
    },
  });

  // The state the previous website would have shipped: a published photo with
  // no permission for it. Prove the database will not even record it.
  try {
    await prisma.topper.create({
      data: {
        studentName: 'ZZDEMO Illegal Photo', displayNameMode: 'FULL',
        programme: 'CLASS_12', year: 2026, score: 80, scoreUnit: 'percent',
        consentRef: REF, consentResult: true, consentName: true, consentPhoto: false,
        photoUrl: PHOTO, published: true, publishedAt: NOW,
      },
    });
  } catch {
    photoWithoutConsentRejected = true;
  }
  const rDraft = await prisma.topper.create({
    data: {
      studentName: 'ZZDEMO Draft Person', displayNameMode: 'FULL',
      programme: 'CLASS_12', year: 2026, score: 99, scoreUnit: 'percent',
      consentRef: REF, consentResult: true, consentName: true, consentPhoto: true,
      photoUrl: FORBIDDEN_PHOTO, published: false,
    },
  });
  console.log('  4 results seeded (full / no-name / no-photo / draft)');

  // Stories ---------------------------------------------------------------
  const sFull = await prisma.studentStory.create({
    data: {
      slug: 'zzdemo-published', studentName: 'ZZDEMO Story Full',
      displayNameMode: 'FULL', programme: 'CLASS_12', year: 2026,
      challenge: 'ZZDEMO challenge text.', journey: 'ZZDEMO journey text.',
      outcome: 'ZZDEMO outcome text.', quote: 'ZZDEMO quote text.',
      photoUrl: PHOTO, consentRef: REF,
      consentStory: true, consentName: true, consentPhoto: true,
      published: true, publishedAt: NOW,
    },
  });
  const sNoPhoto = await prisma.studentStory.create({
    data: {
      slug: 'zzdemo-nophoto', studentName: 'ZZDEMO Story Nophoto',
      displayNameMode: 'FULL', programme: 'CLASS_11', year: 2026,
      challenge: 'ZZDEMO nophoto challenge.', journey: 'ZZDEMO nophoto journey.',
      outcome: 'ZZDEMO nophoto outcome.',
      consentRef: REF,
      consentStory: true, consentName: true, consentPhoto: false,
      published: true, publishedAt: NOW,
    },
  });

  // A story grant must not carry a photograph with it.
  try {
    await prisma.studentStory.create({
      data: {
        slug: 'zzdemo-illegal-photo', studentName: 'ZZDEMO Story Illegal',
        displayNameMode: 'FULL', programme: 'CLASS_12', year: 2026,
        challenge: 'x', journey: 'y', outcome: 'z',
        photoUrl: PHOTO, consentRef: REF,
        consentStory: true, consentName: true, consentPhoto: false,
        published: true, publishedAt: NOW,
      },
    });
  } catch {
    storyPhotoRejected = true;
  }
  const sDraft = await prisma.studentStory.create({
    data: {
      slug: 'zzdemo-draft', studentName: 'ZZDEMO Story Draft',
      displayNameMode: 'FULL', programme: 'CLASS_12', year: 2026,
      challenge: 'ZZDEMO draft challenge.', journey: 'ZZDEMO draft journey.',
      outcome: 'ZZDEMO draft outcome.', consentRef: REF,
      photoUrl: FORBIDDEN_PHOTO,
      consentStory: true, consentName: true, consentPhoto: true,
      published: false,
    },
  });
  console.log('  3 stories seeded (full / no-photo / draft)');

  // Batches & announcements ----------------------------------------------
  const bFuture = await prisma.batch.create({
    data: { courseSlug: 'class-12-commerce', startsAt: FUTURE, mode: 'Offline',
            seatsNote: 'ZZDEMO future batch', published: true },
  });
  const bPast = await prisma.batch.create({
    data: { courseSlug: 'class-12-commerce', startsAt: PAST, mode: 'Offline',
            seatsNote: 'ZZDEMO expired batch', published: true },
  });
  const bDraft = await prisma.batch.create({
    data: { courseSlug: 'class-11-commerce', startsAt: FUTURE, mode: 'Offline',
            seatsNote: 'ZZDEMO draft batch', published: false },
  });

  const aLive = await prisma.announcement.create({
    data: { message: 'ZZDEMO live announcement', startsAt: PAST, endsAt: FUTURE, published: true },
  });
  const aExpired = await prisma.announcement.create({
    data: { message: 'ZZDEMO expired announcement',
            startsAt: new Date(Date.now() - 60 * 86400_000), endsAt: PAST, published: true },
  });
  const aFuture = await prisma.announcement.create({
    data: { message: 'ZZDEMO future announcement',
            startsAt: FUTURE, endsAt: new Date(Date.now() + 60 * 86400_000), published: true },
  });
  const aDraft = await prisma.announcement.create({
    data: { message: 'ZZDEMO draft announcement', startsAt: PAST, endsAt: FUTURE, published: false },
  });
  console.log('  3 batches + 4 announcements seeded');

  void rFull; void rNoName; void rNoPhoto; void rDraft;
  void sFull; void sNoPhoto; void sDraft;
  void bFuture; void bPast; void bDraft;
  void aLive; void aExpired; void aFuture; void aDraft;

  // Record the two refusals so `assert` can report them.
  await prisma.auditLog.create({
    data: {
      actorLabel: 'ZZDEMO harness', action: 'created', entity: 'Fixture',
      entityId: 'zzdemo',
      summary: `photoRejected=${photoWithoutConsentRejected} storyPhotoRejected=${storyPhotoRejected}`,
    },
  });
}

if (doAssert) {
  const marker = await prisma.auditLog.findFirst({
    where: { entity: 'Fixture', entityId: 'zzdemo' },
    orderBy: { at: 'desc' },
  });
  photoWithoutConsentRejected = marker?.summary?.includes('photoRejected=true') ?? false;
  storyPhotoRejected = marker?.summary?.includes('storyPhotoRejected=true') ?? false;

  // ==================================================== RESULTS ==========
  console.log('\n=== RESULTS PAGE ===');
  const results = await html('/results');

  check(results.includes('ZZDEMO Published Full'), 'published + name consent SHOWS the name');
  check(!results.includes('ZZDEMO Draft Person'), 'UNPUBLISHED result does not appear');
  check(!results.includes('ZZDEMO Nameless Person'),
        'published WITHOUT name consent does not leak the name');
  check(results.includes('ZZDEMO highlight'), 'published achievement note appears');

  // Photo isolation: the no-photo student's name is shown, their photo is not.
  check(results.includes('ZZDEMO Nophoto Person'),
        'published + name consent, no photo consent — name still shows');
  // next/image emits a src plus a srcSet, so one photo yields several URL
  // references. What matters is WHICH photos appear, not how many times.
  check(results.includes('zzdemo-fixture-photo'),
        'the consented student’s photo is rendered');
  check(!results.includes(FORBIDDEN_PHOTO),
        'a photo attached to an UNPUBLISHED record never renders');
  check(photoWithoutConsentRejected,
        'THE DATABASE REFUSES to store a published photo without photo consent');

  console.log('\n=== NO CONSENT METADATA REACHES THE BROWSER ===');
  for (const needle of ['consentRef', 'consentPhoto', 'consentName', 'consentResult',
                        'consentStory', 'ZZDEMO-CONSENT', 'publishedAt', 'displayNameMode']) {
    check(!results.includes(needle), `"${needle}" absent from the results HTML`);
  }

  // ==================================================== STORIES ==========
  console.log('\n=== STORIES PAGE ===');
  const stories = await html('/stories');

  check(stories.includes('ZZDEMO Story Full'), 'published story appears');
  check(stories.includes('ZZDEMO challenge text.'), 'story body appears');
  check(!stories.includes('ZZDEMO Story Draft'), 'UNPUBLISHED story does not appear');
  check(!stories.includes('ZZDEMO draft challenge.'), 'unpublished story body does not leak');

  check(stories.includes('ZZDEMO Story Nophoto'), 'story without photo consent still appears');
  check(stories.includes('zzdemo-fixture-photo'),
        'the consented story’s photo is rendered');
  check(!stories.includes(FORBIDDEN_PHOTO),
        'a photo on an UNPUBLISHED story never renders');
  check(storyPhotoRejected,
        'THE RULE: the database refuses a published story photo without photo consent');

  for (const needle of ['consentStory', 'consentPhoto', 'ZZDEMO-CONSENT']) {
    check(!stories.includes(needle), `"${needle}" absent from the stories HTML`);
  }

  // ==================================================== BATCHES ==========
  console.log('\n=== BATCHES (course page) ===');
  const coursePage = await html('/courses/class-12-commerce');
  check(coursePage.includes('ZZDEMO future batch'), 'upcoming batch appears');
  check(!coursePage.includes('ZZDEMO expired batch'),
        'a batch that already started does NOT appear as upcoming');

  const course11 = await html('/courses/class-11-commerce');
  check(!course11.includes('ZZDEMO draft batch'), 'UNPUBLISHED batch does not appear');

  // ============================================== ANNOUNCEMENTS =========
  console.log('\n=== ANNOUNCEMENTS ===');
  const updates = await html('/announcements');
  check(updates.includes('ZZDEMO live announcement'), 'announcement inside its window appears');
  check(!updates.includes('ZZDEMO expired announcement'),
        'EXPIRED announcement does not appear');
  check(!updates.includes('ZZDEMO future announcement'),
        'announcement not yet started does not appear');
  check(!updates.includes('ZZDEMO draft announcement'), 'UNPUBLISHED announcement does not appear');

  // ==================================================== HOMEPAGE =========
  console.log('\n=== HOMEPAGE ===');
  const home = await html('/');
  check(home.includes('ZZDEMO live announcement'), 'live announcement shows in the banner');
  check(!home.includes('ZZDEMO expired announcement'), 'expired announcement absent from banner');
  check(home.includes('ZZDEMO Published Full'), 'published result shows on the homepage');
  check(!home.includes('ZZDEMO Draft Person'), 'draft result absent from the homepage');
  check(!home.includes('ZZDEMO Story Draft'), 'draft story absent from the homepage');
  check(!home.includes('ZZDEMO expired batch'), 'expired batch absent from the homepage');

  console.log('\n=== ADMIN NOT DISCOVERABLE ===');
  check(!home.toLowerCase().includes('/admin'), 'no admin link on the homepage');
  const sitemap = await html('/sitemap.xml');
  check(!sitemap.includes('admin'), 'admin absent from the sitemap');
  for (const route of ['/about', '/courses', '/results', '/stories', '/announcements',
                       '/admissions', '/contact']) {
    check(sitemap.includes(route), `sitemap lists ${route}`);
  }

  console.log('\n=== NAVIGATION HAS NO DEAD LINKS ===');
  const navLinks = [...home.matchAll(/href="(\/[a-z0-9-]*(?:\/[a-z0-9-]+)*)"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith('/_next'));
  const unique = [...new Set(navLinks)];
  let dead = 0;
  for (const link of unique) {
    const res = await fetch(`${BASE}${link}`, { redirect: 'manual' });
    if (res.status >= 400) { dead += 1; console.log(`     dead: ${link} -> ${res.status}`); }
  }
  check(dead === 0, 'every internal link on the homepage resolves', `${unique.length} links checked`);

}

if (doCleanup) {
  // ==================================================== CLEANUP =========
  console.log('\n=== CLEANUP ===');
  const removed = await Promise.all([
    prisma.topper.deleteMany({ where: { studentName: { startsWith: 'ZZDEMO' } } }),
    prisma.studentStory.deleteMany({ where: { studentName: { startsWith: 'ZZDEMO' } } }),
    prisma.topper.deleteMany({ where: { studentName: { startsWith: 'ZZDEMO' } } }),
    prisma.batch.deleteMany({ where: { seatsNote: { startsWith: 'ZZDEMO' } } }),
    prisma.announcement.deleteMany({ where: { message: { startsWith: 'ZZDEMO' } } }),
    prisma.auditLog.deleteMany({ where: { entity: 'Fixture' } }),
  ]);
  console.log(`  removed ${removed.reduce((n, r) => n + r.count, 0)} ZZDEMO rows`);

  const left = await Promise.all([
    prisma.topper.count(), prisma.studentStory.count(),
    prisma.batch.count(), prisma.announcement.count(),
  ]);
  console.log(`  rows remaining: ${left.reduce((a, b) => a + b, 0)}`);
}
} catch (error) {
  console.error('\nHarness error:', error instanceof Error ? error.stack : error);
  fail += 1;
} finally {
  await prisma.$disconnect();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) { console.log('\nFAILURES:'); for (const f of failures) console.log(`  - ${f}`); }
console.log('='.repeat(52));
exit(fail > 0 ? 1 : 0);
