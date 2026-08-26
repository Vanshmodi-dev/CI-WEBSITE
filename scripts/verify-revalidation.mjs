/**
 * Does publishing from the admin actually update the public website?
 *
 * Phase 6 found that admin actions revalidated only `/admin/*`, never a public
 * route — so a teacher would publish an announcement, watch the site not
 * change for up to an hour, and reasonably conclude the admin was broken.
 * That was fixed. This proves it, rather than assuming it.
 *
 * The test drives the REAL admin form over HTTP (signed in, replaying React's
 * own action fields), then reads the REAL public page. Nothing is stubbed.
 *
 * Usage: BASE_URL=http://localhost:PORT node scripts/verify-revalidation.mjs
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { hashPassword } from '../src/lib/password.ts';
import { env, exit } from 'node:process';
import { randomBytes } from 'node:crypto';

const BASE = env.BASE_URL ?? 'http://localhost:3170';
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

let cookie = '';

async function req(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
  return { res, setCookie: res.headers.getSetCookie?.() ?? [], text: () => res.text() };
}

/**
 * Replay a rendered form, including React's hidden server-action fields.
 *
 * Picks the form by a field it MUST contain, rather than by position. Position
 * is unreliable here and cost two confusing failures: every admin page has a
 * logout form in the header (so "first form" is wrong), and the edit pages have
 * a delete form after the save form (so "spans to the last </form>" invoked
 * delete instead of save).
 */
function fieldsOf(html, marker) {
  const forms = [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const target =
    forms.find((f) => f.includes(`name="${marker}"`)) ?? forms[forms.length - 1] ?? '';

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
  const b = '----rv' + randomBytes(8).toString('hex');
  const CRLF = '\r\n';
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${b}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
  }
  body += `--${b}--${CRLF}`;
  return req(path, {
    method: 'POST',
    body,
    headers: { 'Content-Type': `multipart/form-data; boundary=${b}` },
  });
}

const EMAIL = 'zzdemo-reval@commerce-insight.invalid';
const PASSWORD = randomBytes(24).toString('base64url'); // never printed
const MESSAGE = `ZZDEMO revalidation probe ${Date.now()}`;
let adminId = null;

function istDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

try {
  console.log('\n=== SIGN IN ===');
  const admin = await prisma.adminUser.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await hashPassword(PASSWORD), active: true },
    create: { email: EMAIL, displayName: 'ZZDEMO Admin', passwordHash: await hashPassword(PASSWORD) },
  });
  adminId = admin.id;

  const loginPage = await req('/admin/login');
  const login = await post('/admin/login', {
    ...fieldsOf(await loginPage.text(), 'password'),
    email: EMAIL,
    password: PASSWORD,
  });
  const session = login.setCookie.find((c) => c.startsWith('ci_admin_session='));
  check(Boolean(session), 'signed in to the admin');
  if (!session) throw new Error('cannot continue without a session');
  cookie = session.split(';')[0];

  console.log('\n=== BEFORE: the public page must not show it ===');
  const before = await (await req('/announcements')).text();
  check(!before.includes(MESSAGE), 'the announcement is not on the public page yet');

  console.log('\n=== PUBLISH VIA THE REAL ADMIN FORM ===');
  const newPage = await req('/admin/announcements/new');
  const created = await post('/admin/announcements/new', {
    ...fieldsOf(await newPage.text(), 'startsAt'),
    message: MESSAGE,
    href: '',
    startsAt: istDate(-1),
    endsAt: istDate(30),
    published: 'on',
  });
  check([200, 303, 307].includes(created.res.status), 'the publish form was accepted',
        `HTTP ${created.res.status}`);

  const row = await prisma.announcement.findFirst({ where: { message: MESSAGE } });
  check(Boolean(row), 'the announcement reached the database');
  check(row?.published === true, 'it was stored as published');

  console.log('\n=== AFTER: the public page must show it, WITHOUT waiting for ISR ===');
  // No sleep. If revalidatePath did not fire, the cached page is served and
  // this fails — which is exactly the Phase 6 bug.
  const after = await (await req('/announcements')).text();
  check(after.includes(MESSAGE),
        'the public announcements page updated immediately after publishing');

  /*
    THE HOMEPAGE BANNER SHOWS ONE ANNOUNCEMENT: THE HIGHEST-PRIORITY LIVE ONE.

    ⚠ THIS CHECK USED TO FAIL, AND IT WAS THE CHECK THAT WAS WRONG.

    It asserted that a freshly published announcement appears in the homepage
    banner. That is only true when nothing outranks it. `getActiveAnnouncements`
    orders by `priority desc, startsAt desc`, the admin form has no priority
    input so anything created through it is priority 0, and the ZZSHOW demo
    dataset seeds an announcement at priority 10. So the banner correctly kept
    showing the demo announcement, and this reported a revalidation failure that
    was not happening.

    Phase 16 established that by measurement rather than by reading the code:
    the homepage never carried the message, not after twenty requests over ten
    seconds, which ruled out a stale-while-revalidate race; and the identical
    failure reproduced on the pre-Phase-15 commit, which ruled out a regression.
    The banner was simply showing a different, higher-priority announcement -
    which is the correct behaviour.

    The fix is to make the assertion true of the thing it claims to test.
    Priority is raised directly, because no admin form exposes it, and then the
    record is saved AGAIN THROUGH THE ADMIN FORM so that the revalidation being
    tested is the one a real publish performs. Asserting on the database write
    alone would test Prisma, not the cache.
  */
  await prisma.announcement.update({
    where: { id: row.id },
    data: { priority: 9999 },
  });

  const editPage = await req(`/admin/announcements/${row.id}`);
  const resaved = await post(`/admin/announcements/${row.id}`, {
    ...fieldsOf(await editPage.text(), 'startsAt'),
    message: MESSAGE,
    href: '',
    startsAt: istDate(-1),
    endsAt: istDate(30),
    published: 'on',
  });
  check([200, 303, 307].includes(resaved.res.status),
        'the re-save through the admin form was accepted',
        `HTTP ${resaved.res.status}`);

  const home = await (await req('/')).text();
  check(home.includes(MESSAGE),
        'the homepage banner updated immediately too');

  console.log('\n=== UNPUBLISH must clear it just as fast ===');
  if (row) {
    const editPage = await req(`/admin/announcements/${row.id}`);
    await post(`/admin/announcements/${row.id}`, {
      ...fieldsOf(await editPage.text(), 'startsAt'),
      id: row.id,
      message: MESSAGE,
      href: '',
      startsAt: istDate(-1),
      endsAt: istDate(30),
      // `published` omitted entirely — an unchecked box is simply absent
    });

    const reread = await prisma.announcement.findUnique({ where: { id: row.id } });
    check(reread?.published === false, 'unpublishing was stored');

    const cleared = await (await req('/announcements')).text();
    check(!cleared.includes(MESSAGE),
          'the public page dropped it immediately after unpublishing');
  }
} catch (error) {
  console.error('\nHarness error:', error instanceof Error ? error.stack : error);
  fail += 1;
} finally {
  console.log('\n=== CLEANUP ===');
  const removed = await prisma.announcement.deleteMany({
    where: { message: { startsWith: 'ZZDEMO' } },
  });
  if (adminId) {
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.adminUser.delete({ where: { id: adminId } }).catch(() => {});
  }
  console.log(`  removed ${removed.count} ZZDEMO announcement(s) and the demo admin`);
  await prisma.$disconnect();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) { console.log('\nFAILURES:'); for (const f of failures) console.log(`  - ${f}`); }
console.log('='.repeat(52));
exit(fail > 0 ? 1 : 0);
