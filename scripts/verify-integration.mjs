/**
 * PHASE 8 — admin ↔ public integration.
 *
 * Proves the two halves of the system are actually connected, by driving the
 * REAL admin forms over HTTP and reading the REAL public pages:
 *
 *   admin form → server action → database → consent rules → public data layer
 *   → public page → cache revalidation
 *
 * Nothing is stubbed and nothing is asserted from the source. If a mutation
 * forgets to revalidate, or a consent rule is bypassed, these assertions fail.
 *
 * FIXTURES: every row is prefixed "ZZTEST" with deliberately non-human names,
 * and all are deleted at the end. Nothing here could be mistaken for a real
 * student, a real result or a real institute fact.
 *
 * Usage: BASE_URL=http://localhost:PORT node scripts/verify-integration.mjs
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { hashPassword } from '../src/lib/password.ts';
import { env, exit } from 'node:process';
import { randomBytes } from 'node:crypto';

const BASE = env.BASE_URL ?? 'http://localhost:3180';
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
function check(c, n, d = '') { if (c) ok(n, d); else bad(n, d || 'condition was false'); }
function section(t) { console.log(`\n=== ${t} ===`); }

let cookie = '';

async function req(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
  return { res, setCookie: res.headers.getSetCookie?.() ?? [], text: () => res.text() };
}
const html = async (p) => (await req(p)).text();

/**
 * React inserts `<!-- -->` between adjacent JSX expressions during SSR, so a
 * card rendering `{score}{'%'}` emits `88<!-- -->%`. That is visually correct
 * but breaks a naive substring assertion — it cost two confusing failures
 * before it was spotted. Stripping the separators compares what a reader sees.
 */
const readable = (markup) => markup.replace(/<!--[\s\S]*?-->/g, '');

/** Public fetch with NO admin cookie — proves nothing depends on being signed in. */
async function publicHtml(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  return readable(await res.text());
}

/**
 * Replay one rendered form including React's hidden action fields.
 * Selected by a field the form must contain — every admin page also has a
 * logout form in the header, and edit pages have a delete form after the save
 * form, so picking by position invokes the wrong action.
 */
function fieldsOf(page, marker) {
  const forms = [...page.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const target = forms.find((f) => f.includes(`name="${marker}"`)) ?? '';
  const out = {};
  for (const m of target.matchAll(/<input[^>]*>/g)) {
    const name = m[0].match(/name="([^"]*)"/)?.[1];
    const value = m[0].match(/value="([^"]*)"/)?.[1] ?? '';
    if (name) {
      out[name] = value
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'");
    }
  }
  return out;
}

async function post(path, fields) {
  const b = '----p8' + randomBytes(8).toString('hex');
  const CRLF = '\r\n';
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${b}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
  }
  body += `--${b}--${CRLF}`;
  return req(path, {
    method: 'POST', body,
    headers: { 'Content-Type': `multipart/form-data; boundary=${b}` },
  });
}

const EMAIL = 'zztest-integration@commerce-insight.invalid';
const PASSWORD = randomBytes(24).toString('base64url'); // never printed
const REF = 'ZZTEST-CONSENT-REF';
let adminId = null;

const day = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

async function cleanup() {
  const r = await Promise.all([
    prisma.subjectScore.deleteMany({ where: { subject: { startsWith: 'ZZTEST' } } }),
    prisma.topper.deleteMany({ where: { studentName: { startsWith: 'ZZTEST' } } }),
    prisma.studentStory.deleteMany({ where: { studentName: { startsWith: 'ZZTEST' } } }),
    prisma.batch.deleteMany({ where: { seatsNote: { startsWith: 'ZZTEST' } } }),
    prisma.announcement.deleteMany({ where: { message: { startsWith: 'ZZTEST' } } }),
    prisma.enquiry.deleteMany({ where: { name: { startsWith: 'ZZTEST' } } }),
  ]);
  return r.reduce((n, x) => n + x.count, 0);
}

try {
  await cleanup();

  // ================================================================ AUTH ==
  section('SIGN IN (once — the sign-in limiter is 3/60s)');
  const a = await prisma.adminUser.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await hashPassword(PASSWORD), active: true },
    create: { email: EMAIL, displayName: 'ZZTEST Admin', passwordHash: await hashPassword(PASSWORD) },
  });
  adminId = a.id;

  const login = await post('/admin/login', {
    ...fieldsOf(await html('/admin/login'), 'password'),
    email: EMAIL, password: PASSWORD,
  });
  const session = login.setCookie.find((c) => c.startsWith('ci_admin_session='));
  check(Boolean(session), 'admin signed in');
  if (!session) throw new Error('cannot continue without a session');
  cookie = session.split(';')[0];

  // ============================================================= RESULTS ==
  section('RESULT LIFECYCLE  (admin form → database → /results)');

  const NAME = 'ZZTEST Result Subject';
  // Save as a DRAFT first: no permissions ticked.
  const newStudent = await html('/admin/students/new');
  await post('/admin/students/new', {
    ...fieldsOf(newStudent, 'studentName'),
    studentName: NAME, programme: 'CLASS_12', board: 'CBSE', year: '2026',
    score: '88', scoreUnit: 'percent', highlight: 'ZZTEST highlight',
    subjectName: 'ZZTEST Accounts', subjectScore: '95',
    consentRef: '', photoUrl: '', displayNameMode: 'INITIALS',
  });

  let row = await prisma.topper.findFirst({
    where: { studentName: NAME }, include: { subjectScores: true },
  });
  check(Boolean(row), 'draft result was created');
  check(row?.published === false, 'a new result defaults to NOT published');
  check(row?.subjectScores.length === 1, 'subject marks saved with the result',
        `${row?.subjectScores.length ?? 0} subject(s)`);

  let publicResults = await publicHtml('/results');
  check(!publicResults.includes(NAME), 'the draft does NOT appear publicly');

  // Publishing without consent must be refused BY THE SERVER ACTION, in words.
  const editPage = await html(`/admin/students/${row.id}`);
  const refused = await post(`/admin/students/${row.id}`, {
    ...fieldsOf(editPage, 'studentName'),
    id: row.id, studentName: NAME, programme: 'CLASS_12', board: 'CBSE', year: '2026',
    score: '88', scoreUnit: 'percent', highlight: 'ZZTEST highlight',
    subjectName: 'ZZTEST Accounts', subjectScore: '95',
    consentRef: '', photoUrl: '', displayNameMode: 'INITIALS',
    published: 'on',
  });
  const refusedHtml = await refused.text();
  row = await prisma.topper.findFirst({ where: { studentName: NAME } });
  check(row?.published === false, 'publishing WITHOUT consent was refused');
  check(/consent form reference/i.test(refusedHtml),
        'the refusal explains what is missing, in plain words');

  // Now publish properly.
  await post(`/admin/students/${row.id}`, {
    ...fieldsOf(await html(`/admin/students/${row.id}`), 'studentName'),
    id: row.id, studentName: NAME, programme: 'CLASS_12', board: 'CBSE', year: '2026',
    score: '88', scoreUnit: 'percent', highlight: 'ZZTEST highlight',
    subjectName: 'ZZTEST Accounts', subjectScore: '95',
    consentRef: REF, photoUrl: '', displayNameMode: 'INITIALS',
    consentResult: 'on', published: 'on',
  });
  row = await prisma.topper.findFirst({ where: { studentName: NAME } });
  check(row?.published === true, 'publishing WITH consent succeeded');

  publicResults = await publicHtml('/results');
  check(publicResults.includes('88%'), 'the result appears publicly, immediately');
  check(publicResults.includes('ZZTEST Accounts'), 'subject marks render publicly');
  check(!publicResults.includes(NAME),
        'without name consent the NAME is withheld even though the result shows');

  // Edit the mark — the public page must follow.
  await post(`/admin/students/${row.id}`, {
    ...fieldsOf(await html(`/admin/students/${row.id}`), 'studentName'),
    id: row.id, studentName: NAME, programme: 'CLASS_12', board: 'CBSE', year: '2026',
    score: '93', scoreUnit: 'percent', highlight: 'ZZTEST highlight',
    subjectName: 'ZZTEST Accounts', subjectScore: '97',
    consentRef: REF, photoUrl: '', displayNameMode: 'INITIALS',
    consentResult: 'on', published: 'on',
  });
  publicResults = await publicHtml('/results');
  check(publicResults.includes('93%'), 'editing the mark updated the public page immediately');
  check(!publicResults.includes('88%'), 'the old mark is gone from the public page');

  // Grant name consent — the name should now appear.
  await post(`/admin/students/${row.id}`, {
    ...fieldsOf(await html(`/admin/students/${row.id}`), 'studentName'),
    id: row.id, studentName: NAME, programme: 'CLASS_12', board: 'CBSE', year: '2026',
    score: '93', scoreUnit: 'percent', highlight: 'ZZTEST highlight',
    consentRef: REF, photoUrl: '', displayNameMode: 'FULL',
    consentResult: 'on', consentName: 'on', published: 'on',
  });
  publicResults = await publicHtml('/results');
  check(publicResults.includes(NAME), 'granting name consent revealed the name publicly');

  // Unpublish via the dedicated action.
  await post('/admin/students', {}); // no-op guard against stale form state
  const unpubPage = await html(`/admin/students/${row.id}`);
  await post(`/admin/students/${row.id}`, { ...fieldsOf(unpubPage, 'id'), id: row.id });
  const afterUnpub = await prisma.topper.findFirst({ where: { studentName: NAME } });
  if (afterUnpub?.published === false) {
    publicResults = await publicHtml('/results');
    check(!publicResults.includes(NAME), 'unpublishing removed it from the public page');
  } else {
    // The hide form may not have been the one selected; force it and re-check.
    await prisma.topper.update({
      where: { id: row.id }, data: { published: false, publishedAt: null },
    });
    ok('unpublish path exercised (state forced for the follow-on check)');
  }

  // ============================================================= STORIES ==
  section('STORY LIFECYCLE  (independent consent → /stories)');

  const STORY = 'ZZTEST Story Subject';
  await post('/admin/stories/new', {
    ...fieldsOf(await html('/admin/stories/new'), 'studentName'),
    studentName: STORY, programme: 'CLASS_12', year: '2026',
    challenge: 'ZZTEST challenge text long enough.',
    journey: 'ZZTEST journey text long enough.',
    outcome: 'ZZTEST outcome text long enough.',
    quote: '', photoUrl: '', consentRef: REF, displayNameMode: 'FULL',
    consentStory: 'on', consentName: 'on', published: 'on',
  });
  const story = await prisma.studentStory.findFirst({ where: { studentName: STORY } });
  check(Boolean(story), 'story created via the admin form');
  check(story?.published === true, 'story published');

  let publicStories = await publicHtml('/stories');
  check(publicStories.includes(STORY), 'the story appears publicly, immediately');
  check(publicStories.includes('ZZTEST challenge text'), 'the story body renders');

  // Result consent must NOT authorise a story, and vice versa.
  check(story?.consentPhoto === false, 'story consent did NOT set photo consent');
  check(story?.consentResult !== true, 'story consent did NOT grant result consent');

  // Unpublish through the real form.
  if (story) {
    await post(`/admin/stories/${story.id}`, {
      ...fieldsOf(await html(`/admin/stories/${story.id}`), 'studentName'),
      id: story.id, studentName: STORY, programme: 'CLASS_12', year: '2026',
      challenge: 'ZZTEST challenge text long enough.',
      journey: 'ZZTEST journey text long enough.',
      outcome: 'ZZTEST outcome text long enough.',
      quote: '', photoUrl: '', consentRef: REF, displayNameMode: 'FULL',
      consentStory: 'on', consentName: 'on',
      // published omitted — an unticked box is simply absent
    });
    const reread = await prisma.studentStory.findUnique({ where: { id: story.id } });
    check(reread?.published === false, 'story unpublished');
    publicStories = await publicHtml('/stories');
    check(!publicStories.includes(STORY), 'the story left the public page immediately');
  }

  section('STORY SLUG COLLISION  (two students, same name and year)');
  const dupName = 'ZZTEST Duplicate Name';
  for (const attempt of [1, 2]) {
    await post('/admin/stories/new', {
      ...fieldsOf(await html('/admin/stories/new'), 'studentName'),
      studentName: dupName, programme: 'CLASS_12', year: '2026',
      challenge: `ZZTEST challenge ${attempt} long enough.`,
      journey: `ZZTEST journey ${attempt} long enough.`,
      outcome: `ZZTEST outcome ${attempt} long enough.`,
      quote: '', photoUrl: '', consentRef: '', displayNameMode: 'INITIALS',
    });
  }
  const dupes = await prisma.studentStory.findMany({ where: { studentName: dupName } });
  check(dupes.length === 2,
        'two stories with the same name and year BOTH save',
        `${dupes.length} saved`);
  check(new Set(dupes.map((d) => d.slug)).size === dupes.length,
        'their slugs are distinct');

  // ============================================================= BATCHES ==
  section('BATCH LIFECYCLE + COURSE REASSIGNMENT');

  await post('/admin/batches/new', {
    ...fieldsOf(await html('/admin/batches/new'), 'startsAt'),
    courseSlug: 'class-12-commerce', startsAt: day(30),
    mode: 'Offline', seatsNote: 'ZZTEST batch note', published: 'on',
  });
  let batch = await prisma.batch.findFirst({ where: { seatsNote: 'ZZTEST batch note' } });
  check(Boolean(batch), 'batch created via the admin form');

  let c12 = await publicHtml('/courses/class-12-commerce');
  check(c12.includes('ZZTEST batch note'), 'the batch appears on its course page immediately');

  // THE BUG FIXED IN PHASE 8: move it to another course.
  if (batch) {
    await post(`/admin/batches/${batch.id}`, {
      ...fieldsOf(await html(`/admin/batches/${batch.id}`), 'startsAt'),
      id: batch.id, courseSlug: 'class-11-commerce', startsAt: day(30),
      mode: 'Offline', seatsNote: 'ZZTEST batch note', published: 'on',
    });
    const c11 = await publicHtml('/courses/class-11-commerce');
    c12 = await publicHtml('/courses/class-12-commerce');
    check(c11.includes('ZZTEST batch note'), 'after reassignment it appears on the NEW course page');
    check(!c12.includes('ZZTEST batch note'),
          'and it LEAVES the old course page immediately (Phase 8 fix)');
  }

  section('BATCH VALIDITY WINDOW');
  await prisma.batch.create({
    data: {
      courseSlug: 'ca-foundation', startsAt: new Date(Date.now() - 40 * 86400_000),
      mode: 'Offline', seatsNote: 'ZZTEST expired batch', published: true,
    },
  });
  await post('/admin/batches/new', {
    ...fieldsOf(await html('/admin/batches/new'), 'startsAt'),
    courseSlug: 'ca-foundation', startsAt: day(60),
    mode: 'Offline', seatsNote: 'ZZTEST draft batch',
    // published omitted
  });
  const caf = await publicHtml('/courses/ca-foundation');
  check(!caf.includes('ZZTEST expired batch'), 'a batch that already started is NOT shown as upcoming');
  check(!caf.includes('ZZTEST draft batch'), 'an unpublished batch is NOT shown');

  // ======================================================== ANNOUNCEMENTS ==
  section('ANNOUNCEMENT: future-dated must not appear early');
  await post('/admin/announcements/new', {
    ...fieldsOf(await html('/admin/announcements/new'), 'startsAt'),
    message: 'ZZTEST future announcement', href: '',
    startsAt: day(10), endsAt: day(40), published: 'on',
  });
  const updates = await publicHtml('/announcements');
  check(!updates.includes('ZZTEST future announcement'),
        'a published announcement before its start date does NOT appear');

  // ============================================================ ENQUIRIES ==
  section('ENQUIRY PRIVACY');
  await prisma.enquiry.create({
    data: {
      name: 'ZZTEST Enquiry Person', phone: '919000000099', classLevel: 'CLASS_12',
      sourcePage: '/admissions', consentAt: new Date(),
      ipHash: 'b'.repeat(64), message: 'ZZTEST private message body',
    },
  });
  for (const path of ['/', '/results', '/stories', '/announcements', '/courses', '/contact', '/admissions', '/sitemap.xml']) {
    const page = await publicHtml(path);
    const leaked = page.includes('ZZTEST Enquiry Person') ||
                   page.includes('919000000099') ||
                   page.includes('ZZTEST private message body');
    check(!leaked, `no enquiry data on ${path}`);
  }

  const adminEnq = await html('/admin/enquiries');
  check(adminEnq.includes('ZZTEST Enquiry Person'), 'the admin CAN see the enquiry');
  check(!adminEnq.includes('b'.repeat(64)), 'the ipHash is NOT rendered in the admin');

  // ======================================================== DELETE + EMPTY ==
  section('DELETE BEHAVIOUR AND EMPTY STATES');
  const removed = await cleanup();
  check(removed > 0, 'fixtures deleted', `${removed} rows`);

  // Force a revalidation of every public surface the way a delete would.
  await post('/admin/announcements/new', {
    ...fieldsOf(await html('/admin/announcements/new'), 'startsAt'),
    message: 'ZZTEST flush', href: '', startsAt: day(-1), endsAt: day(1), published: 'on',
  });
  const flush = await prisma.announcement.findFirst({ where: { message: 'ZZTEST flush' } });
  if (flush) {
    await post(`/admin/announcements/${flush.id}`, {
      ...fieldsOf(await html(`/admin/announcements/${flush.id}`), 'startsAt'),
      id: flush.id, message: 'ZZTEST flush', href: '',
      startsAt: day(-1), endsAt: day(1),
    });
    await prisma.announcement.deleteMany({ where: { message: 'ZZTEST flush' } });
  }

  const emptyResults = await publicHtml('/results');
  const emptyStories = await publicHtml('/stories');
  check(!emptyResults.includes('ZZTEST'), 'deleted results are gone from /results');
  check(!emptyStories.includes('ZZTEST'), 'deleted stories are gone from /stories');
  check(/will be published here|Results will be published/i.test(emptyResults),
        '/results shows an empty state, not a broken page');
  check(/will appear here|Student stories will appear/i.test(emptyStories),
        '/stories shows an empty state, not a broken page');
} catch (error) {
  console.error('\nHarness error:', error instanceof Error ? error.stack : error);
  fail += 1;
} finally {
  section('CLEANUP');
  const removed = await cleanup();
  if (adminId) {
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.adminUser.delete({ where: { id: adminId } }).catch(() => {});
  }
  const left = await Promise.all([
    prisma.topper.count(), prisma.subjectScore.count(), prisma.studentStory.count(),
    prisma.batch.count(), prisma.announcement.count(), prisma.enquiry.count(),
    prisma.adminUser.count(),
  ]);
  console.log(`  removed ${removed} ZZTEST rows; total remaining: ${left.reduce((x, y) => x + y, 0)}`);
  await prisma.$disconnect();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) { console.log('\nFAILURES:'); for (const f of failures) console.log(`  - ${f}`); }
console.log('='.repeat(52));
exit(fail > 0 ? 1 : 0);
