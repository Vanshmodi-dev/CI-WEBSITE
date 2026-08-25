/**
 * End-to-end verification against a running app and a real PostgreSQL database.
 *
 * Drives the actual HTTP surface: signs in, follows redirects, submits the real
 * forms, and reads back what landed in the database.
 *
 * The admin password is generated randomly at runtime and NEVER printed, never
 * written to a file, and never committed. All content rows are prefixed
 * "DEMO - " and removed at the end.
 *
 * Usage: BASE_URL=http://localhost:PORT node scripts/verify-e2e.mjs
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { hashPassword, verifyPassword } from '../src/lib/password.ts';
import { env, exit } from 'node:process';
import { randomBytes } from 'node:crypto';

const BASE = env.BASE_URL ?? 'http://localhost:3150';
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
function check(cond, n, d = '') {
  if (cond) ok(n, d);
  else bad(n, d || 'condition was false');
}

// ---------------------------------------------------------------- http ----
let cookieJar = '';

async function req(path, { method = 'GET', body, useCookie = true, headers = {} } = {}) {
  const h = { ...headers };
  if (useCookie && cookieJar) h.Cookie = cookieJar;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body,
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { res, setCookie, text: async () => res.text() };
}

/** Extract React's hidden action fields so a form can be replayed faithfully. */
function formFields(html) {
  const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
  const fields = {};
  for (const m of form.matchAll(/<input[^>]*>/g)) {
    const tag = m[0];
    const name = tag.match(/name="([^"]*)"/)?.[1];
    const value = tag.match(/value="([^"]*)"/)?.[1] ?? '';
    if (name) {
      fields[name] = value
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'");
    }
  }
  return fields;
}

async function postForm(path, fields) {
  const boundary = '----e2e' + randomBytes(8).toString('hex');
  const CRLF = '\r\n';
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
  }
  body += `--${boundary}--${CRLF}`;
  return req(path, {
    method: 'POST',
    body,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  });
}

const ADMIN_EMAIL = 'demo-admin@commerce-insight.invalid';
const PASSWORD = randomBytes(24).toString('base64url'); // never printed
let adminId = null;

try {
  // ============================================================ ADMIN ====
  console.log('\n=== 1. ADMIN ACCOUNT ===');
  const hash = await hashPassword(PASSWORD);
  check(hash.startsWith('scrypt$'), 'password is stored as a scrypt hash');
  check(!hash.includes(PASSWORD), 'the stored hash does not contain the password');
  check(await verifyPassword(PASSWORD, hash), 'the correct password verifies');
  check(!(await verifyPassword(PASSWORD + 'x', hash)), 'a wrong password does not verify');

  const admin = await prisma.adminUser.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash: hash, active: true },
    create: { email: ADMIN_EMAIL, displayName: 'DEMO Admin', passwordHash: hash },
  });
  adminId = admin.id;
  ok('admin account created in PostgreSQL');

  const stored = await prisma.adminUser.findUnique({ where: { email: ADMIN_EMAIL } });
  check(!stored.passwordHash.includes(PASSWORD), 'no plaintext password in the database');

  // ============================================================= AUTH ====
  console.log('\n=== 2. SIGN IN OVER HTTP ===');
  const loginPage = await req('/admin/login', { useCookie: false });
  const loginHtml = await loginPage.text();
  const loginFields = formFields(loginHtml);

  // Wrong password
  const wrong = await postForm('/admin/login', {
    ...loginFields, email: ADMIN_EMAIL, password: 'definitely-not-the-password',
  });
  const wrongHtml = await wrong.text();
  check(
    !wrong.setCookie.some((c) => c.startsWith('ci_admin_session=') && c.split(';')[0].length > 25),
    'wrong password issues no session cookie',
  );
  const genericMsg = 'That email or password is not correct.';
  check(wrongHtml.includes(genericMsg), 'wrong password gives the generic message');

  // Unknown email
  const unknown = await postForm('/admin/login', {
    ...loginFields, email: 'nobody@nowhere.invalid', password: 'whatever-password',
  });
  const unknownHtml = await unknown.text();
  check(unknownHtml.includes(genericMsg), 'unknown email gives the SAME generic message');

  // Correct
  const good = await postForm('/admin/login', {
    ...loginFields, email: ADMIN_EMAIL, password: PASSWORD,
  });
  const sessionCookie = good.setCookie.find((c) => c.startsWith('ci_admin_session='));
  check(Boolean(sessionCookie), 'correct password issues a session cookie');
  if (sessionCookie) {
    check(/HttpOnly/i.test(sessionCookie), 'session cookie is HttpOnly');
    check(/SameSite=Lax/i.test(sessionCookie), 'session cookie is SameSite=Lax');
    check(!sessionCookie.includes(PASSWORD), 'session cookie does not contain the password');
    cookieJar = sessionCookie.split(';')[0];
  }

  const after = await prisma.adminUser.findUnique({ where: { id: adminId } });
  check(after.lastLoginAt !== null, 'lastLoginAt was recorded');

  console.log('\n=== 3. AUTHENTICATED ACCESS ===');
  for (const p of ['/admin', '/admin/enquiries', '/admin/students', '/admin/batches',
                   '/admin/announcements', '/admin/stories']) {
    const r = await req(p);
    check(r.res.status === 200, `signed in: ${p}`, `HTTP ${r.res.status}`);
  }

  const dash = await req('/admin');
  const dashHtml = await dash.text();
  check(dashHtml.includes('DEMO Admin'), 'dashboard greets the signed-in admin');

  console.log('\n=== 4. FORGED / TAMPERED SESSIONS ===');
  const realJar = cookieJar;
  const parts = realJar.replace('ci_admin_session=', '').split('.');
  cookieJar = `ci_admin_session=${parts[0]}.${parts[1]}.${'a'.repeat(64)}`;
  check((await req('/admin')).res.status === 307, 'tampered signature is rejected');
  cookieJar = `ci_admin_session=${parts[0]}.${Date.now() - 1000}.${parts[2]}`;
  check((await req('/admin')).res.status === 307, 'back-dated expiry is rejected');
  cookieJar = 'ci_admin_session=garbage';
  check((await req('/admin')).res.status === 307, 'garbage cookie is rejected');
  cookieJar = realJar;
  check((await req('/admin')).res.status === 200, 'the real session still works');

  console.log('\n=== 5. DEACTIVATION TAKES EFFECT IMMEDIATELY ===');
  await prisma.adminUser.update({ where: { id: adminId }, data: { active: false } });
  check((await req('/admin')).res.status === 307, 'a deactivated account loses access at once');
  await prisma.adminUser.update({ where: { id: adminId }, data: { active: true } });
  check((await req('/admin')).res.status === 200, 'reactivating restores access');

  // ========================================================= ENQUIRY ====
  console.log('\n=== 6. ENQUIRY PIPELINE (public form -> real database) ===');
  const before = await prisma.enquiry.count();

  async function submitEnquiry(overrides = {}, waitMs = 3000) {
    const page = await req('/admissions', { useCookie: false });
    const fields = formFields(await page.text());
    await new Promise((r) => setTimeout(r, waitMs));
    return postForm('/admissions', {
      ...fields,
      name: 'DEMO Enquiry Tester',
      phone: '9900000001',
      email: '',
      classLevel: 'CLASS_12',
      courseSlug: '',
      message: 'DEMO test submission.',
      consent: 'on',
      website: '',
      ...overrides,
    });
  }

  // ---- validation failures first ---------------------------------------
  // The burst limiter (3 per 60s per ipHash) runs BEFORE validation, so these
  // must run in their own window. Testing them after three successful
  // submissions returns "rate limited" instead of the field error, which is
  // correct behaviour but tests the wrong thing.
  //
  // THAT ALSO APPLIES ACROSS RUNS (Phase 14). The limiter is per SERVER PROCESS
  // and keyed on the ipHash, so running this suite twice inside a minute makes
  // these two checks fail with "condition was false" - which reads exactly like
  // a broken enquiry form and is nothing of the sort. Phase 14 lost time to it
  // twice before spotting that "neither invalid submission stored anything" was
  // still passing, which is only possible if the request was refused earlier.
  //
  // The suite cannot dodge the limiter: the key comes from the request IP, and
  // the app deliberately does NOT trust X-Forwarded-For, so there is no honest
  // way to present a different client. What it CAN do is recognise the refusal
  // and say so, instead of reporting a defect that is not there.
  const RATE_LIMITED = /too many|try again in|rate.?limit/i;

  function checkValidation(html, needle, name) {
    if (html.includes(needle)) return ok(name);
    if (RATE_LIMITED.test(html)) {
      return bad(
        name,
        'the rate limiter refused this submission before validation ran - the form is fine, ' +
          'the suite was run again within the 60s burst window. Wait a minute and re-run.',
      );
    }
    return bad(name, 'condition was false');
  }

  const noConsent = await submitEnquiry({ consent: '', phone: '9900000004' });
  checkValidation(await noConsent.text(), 'agree to be contacted', 'missing consent is rejected');

  const badPhone = await submitEnquiry({ phone: '12345' });
  checkValidation(await badPhone.text(), 'valid 10-digit', 'invalid phone is rejected with a field error');

  check(await prisma.enquiry.count() === before,
        'neither invalid submission stored anything');

  console.log('  (waiting 61s for the burst window to reset...)');
  await new Promise((r) => setTimeout(r, 61_000));

  // ---- now the successful path -----------------------------------------
  const valid = await submitEnquiry();
  const validHtml = await valid.text();
  check(validHtml.includes('we have your enquiry'), 'a valid enquiry is accepted');
  const afterValid = await prisma.enquiry.count();
  check(afterValid === before + 1, 'the enquiry was PERSISTED to PostgreSQL',
        `${before} -> ${afterValid}`);

  const row = await prisma.enquiry.findFirst({
    where: { name: 'DEMO Enquiry Tester' }, orderBy: { createdAt: 'desc' },
  });
  check(row?.phone === '919900000001', 'phone was normalised with country code');
  check(/^[0-9a-f]{64}$/.test(row?.ipHash ?? ''), 'ipHash is a 64-char digest, not an IP');
  check(!/\d+\.\d+\.\d+\.\d+/.test(row?.ipHash ?? ''), 'no raw IP address stored');
  check(row?.status === 'NEW', 'new enquiry starts as NEW');
  check(row?.consentAt !== null, 'consent timestamp recorded');

  const dup = await submitEnquiry();
  await dup.text();
  const afterDup = await prisma.enquiry.count();
  check(afterDup === afterValid, 'duplicate within the window creates NO second row',
        `still ${afterDup}`);

  const honeypot = await submitEnquiry({ website: 'http://spam.example', phone: '9900000002' });
  await honeypot.text();
  check(await prisma.enquiry.count() === afterDup, 'honeypot submission stores nothing');

  const forged = await submitEnquiry({ formToken: `${Date.now()}.${'a'.repeat(64)}`, phone: '9900000003' });
  await forged.text();
  check(await prisma.enquiry.count() === afterDup, 'forged token stores nothing');

  // Rate limit: burst is 3/60s per ipHash
  let limited = false;
  for (let i = 0; i < 5; i++) {
    const r = await submitEnquiry({ phone: `990000010${i}` }, 2800);
    if ((await r.text()).includes('sent several enquiries recently')) { limited = true; break; }
  }
  check(limited, 'burst rate limiting engages on rapid submissions');

  console.log('\n=== 7. ENQUIRY ADMIN ===');
  const enqPage = await req(`/admin/enquiries/${row.id}`);
  const enqHtml = await enqPage.text();
  check(enqPage.res.status === 200, 'enquiry detail page loads');
  check(enqHtml.includes('DEMO Enquiry Tester'), 'enquiry detail shows the lead');
  check(!enqHtml.includes(row.ipHash), 'ipHash is NOT exposed in the admin HTML');

  await prisma.enquiry.update({ where: { id: row.id }, data: { status: 'CONTACTED' } });
  const reread = await prisma.enquiry.findUnique({ where: { id: row.id } });
  check(reread.status === 'CONTACTED', 'enquiry status change persists');

  // ========================================================= CONTENT ====
  console.log('\n=== 8. CONTENT CRUD AGAINST REAL POSTGRES ===');
  const batch = await prisma.batch.create({
    data: {
      courseSlug: 'class-12-commerce',
      startsAt: new Date('2026-09-01T00:00:00+05:30'),
      mode: 'Offline',
      seatsNote: 'DEMO - Test Batch',
      published: true,
    },
  });
  ok('batch created');
  await prisma.batch.update({ where: { id: batch.id }, data: { mode: 'Online live' } });
  check((await prisma.batch.findUnique({ where: { id: batch.id } })).mode === 'Online live',
        'batch edit persists');

  const past = await prisma.batch.create({
    data: {
      courseSlug: 'class-11-commerce',
      startsAt: new Date('2020-06-01T00:00:00+05:30'),
      mode: 'Offline',
      seatsNote: 'DEMO - Expired Batch',
      published: true,
    },
  });
  const upcoming = await prisma.batch.findMany({
    where: { published: true, startsAt: { gte: new Date() } },
  });
  check(!upcoming.some((b) => b.id === past.id),
        'an expired batch does NOT appear as upcoming');

  const ann = await prisma.announcement.create({
    data: {
      message: 'DEMO - Test Announcement',
      startsAt: new Date('2026-08-01'),
      endsAt: new Date('2026-12-31'),
      published: true,
    },
  });
  const expiredAnn = await prisma.announcement.create({
    data: {
      message: 'DEMO - Expired Announcement',
      startsAt: new Date('2026-01-01'),
      endsAt: new Date('2026-02-01'),
      published: true,
    },
  });
  const now = new Date();
  const live = await prisma.announcement.findMany({
    where: { published: true, startsAt: { lte: now }, endsAt: { gte: now } },
  });
  check(live.some((a) => a.id === ann.id), 'a current announcement is live');
  check(!live.some((a) => a.id === expiredAnn.id),
        'an expired announcement is NOT live — it removes itself');

  const student = await prisma.topper.create({
    data: {
      studentName: 'DEMO - Test Student 001',
      programme: 'CLASS_12',
      year: 2026,
      score: 88,
      scoreUnit: 'percent',
    },
  });
  check(student.published === false, 'a new student result defaults to NOT published');
  await prisma.topper.update({ where: { id: student.id }, data: { score: 91 } });
  check(Number((await prisma.topper.findUnique({ where: { id: student.id } })).score) === 91,
        'student result edit persists');

  const listPage = await req('/admin/students');
  const listHtml = await listPage.text();
  check(listHtml.includes('DEMO - Test Student 001'), 'admin list shows the draft student');
  check(listHtml.includes('not shown yet'), 'the draft is labelled as not shown');

  // ========================================================== PUBLIC ====
  console.log('\n=== 9. NOTHING UNPUBLISHED LEAKS TO THE PUBLIC SITE ===');
  const home = await req('/', { useCookie: false });
  const homeHtml = await home.text();
  check(!homeHtml.includes('DEMO - Test Student 001'), 'draft student absent from the homepage');
  check(!homeHtml.includes('DEMO Enquiry Tester'), 'enquiry data absent from the homepage');
  check(!homeHtml.toLowerCase().includes('/admin'), 'no admin link on the public homepage');

  const sitemap = await req('/sitemap.xml', { useCookie: false });
  check(!(await sitemap.text()).includes('admin'), 'admin routes absent from the sitemap');

  console.log('\n=== 10. AUDIT LOG ===');
  const auditCount = await prisma.auditLog.count();
  ok('audit log table reachable', `${auditCount} entries`);

  // ========================================================= LOGOUT ====
  console.log('\n=== 11. SIGN OUT ===');
  // Origin is sent because a browser sends it on every POST, and /admin/logout
  // is same-origin-only since Phase 10 — a cross-origin form post used to be
  // able to sign the admin out.
  const out = await req('/admin/logout', {
    method: 'POST',
    headers: { Origin: BASE },
  });
  check(out.res.status === 303, 'logout redirects');
  const cleared = out.setCookie.find((c) => c.startsWith('ci_admin_session='));
  check(Boolean(cleared) && cleared.split(';')[0] === 'ci_admin_session=',
        'logout clears the session cookie');
  cookieJar = '';
  check((await req('/admin')).res.status === 307, 'after logout, admin is inaccessible');

  // ======================================================== CLEANUP ====
  console.log('\n=== CLEANUP ===');
  const removed = await Promise.all([
    prisma.topper.deleteMany({ where: { studentName: { startsWith: 'DEMO' } } }),
    prisma.studentStory.deleteMany({ where: { studentName: { startsWith: 'DEMO' } } }),
    prisma.announcement.deleteMany({ where: { message: { startsWith: 'DEMO' } } }),
    prisma.batch.deleteMany({ where: { seatsNote: { startsWith: 'DEMO' } } }),
    prisma.enquiry.deleteMany({ where: { name: { startsWith: 'DEMO' } } }),
    prisma.auditLog.deleteMany({ where: { actorId: adminId } }),
  ]);
  console.log(`  removed ${removed.reduce((n, r) => n + r.count, 0)} DEMO rows`);
  await prisma.adminUser.delete({ where: { id: adminId } }).catch(() => {});
  console.log('  removed the DEMO admin account');

  const totals = await Promise.all([
    prisma.topper.count(), prisma.enquiry.count(), prisma.batch.count(),
    prisma.announcement.count(), prisma.studentStory.count(), prisma.adminUser.count(),
  ]);
  console.log(`  rows remaining across all content tables: ${totals.reduce((a, b) => a + b, 0)}`);
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
