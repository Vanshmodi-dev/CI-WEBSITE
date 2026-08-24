/**
 * The teacher's workflow, in a real browser, end to end.
 *
 * WHY THIS EXISTS ALONGSIDE verify-integration.mjs. That suite drives the same
 * forms over raw HTTP and proves the DATA path: admin action -> database ->
 * consent rules -> public page. It cannot see any of the things that decide
 * whether the teacher can actually do the job:
 *
 *   - does the admin panel render at all under the nonce CSP Phase 10 added,
 *     or is it a blank page with a console full of violations;
 *   - do the forms submit when a person clicks the button, rather than when a
 *     script replays hidden action fields;
 *   - does anything throw in the console while they work;
 *   - do the labels say what a teacher would understand.
 *
 * Everything here uses ZZQA-prefixed fixtures and deletes them afterwards. The
 * admin password is generated per run and never written to disk.
 *
 * Usage: BASE_URL=http://localhost:3170 node scripts/verify-teacher.mjs
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { hashPassword } from '../src/lib/password.ts';
import { env, exit } from 'node:process';
import { randomBytes } from 'node:crypto';
import { launch, findBrowser } from './browser.mjs';

const BASE = env.BASE_URL ?? 'http://localhost:3170';
const KIND = env.BROWSER ?? 'chrome';

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
/**
 * UX observations that are not failures. Empty at the end of Phase 11: the
 * workflow raised nothing a teacher would be confused by. Kept as a place to
 * record one, because "no failures" and "nothing worth mentioning" are
 * different claims.
 */
const notes = [];
const ok = (n, d = '') => {
  pass += 1;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
};
const bad = (n, d) => {
  fail += 1;
  failures.push(`${n}: ${d}`);
  console.log(`  FAIL  ${n} — ${d}`);
};
const check = (c, n, d = '') => (c ? ok(n, d) : bad(n, d || 'condition was false'));
const note = (n) => {
  notes.push(n);
  console.log(`  NOTE  ${n}`);
};
const section = (t) => console.log(`\n=== ${t} ===`);

const PREFIX = 'ZZQA';
const EMAIL = 'zzqa-teacher@example.invalid';
const PASSWORD = `ZZQA-${randomBytes(18).toString('base64url')}`;
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function cleanup() {
  await prisma.subjectScore.deleteMany({
    where: { topper: { studentName: { startsWith: PREFIX } } },
  });
  await prisma.topper.deleteMany({ where: { studentName: { startsWith: PREFIX } } });
  await prisma.studentStory.deleteMany({ where: { studentName: { startsWith: PREFIX } } });
  await prisma.announcement.deleteMany({ where: { message: { startsWith: PREFIX } } });
  await prisma.batch.deleteMany({ where: { seatsNote: { startsWith: PREFIX } } });
  await prisma.enquiry.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.auditLog.deleteMany({ where: { actorLabel: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
}

if (!findBrowser(KIND)) {
  console.log(`\nNOT TESTED — ENVIRONMENT LIMITATION: ${KIND} is not installed.`);
  exit(0);
}

const browser = await launch(KIND);
console.log(`\n### TEACHER WORKFLOW — ${browser.version} ###`);
const page = await browser.page();
/** A teacher is on a laptop for admin work; the public checks use a phone. */
await page.viewport(1280, 900, { mobile: false });

try {
  await cleanup();
  await prisma.adminUser.create({
    data: {
      email: EMAIL,
      displayName: `${PREFIX} Teacher`,
      passwordHash: await hashPassword(PASSWORD),
    },
  });

  /* ================================================= 1. SIGNING IN ===== */
  section('1. SIGNING IN');

  page.clearErrors();
  await page.goto(`${BASE}/admin/login`);

  const loginRender = await page.eval(`(() => ({
    hasEmail: Boolean(document.querySelector('input[type=email]')),
    hasPassword: Boolean(document.querySelector('input[type=password]')),
    hasSubmit: Boolean(document.querySelector('form button')),
    visibleText: (document.body.innerText || '').trim().length,
    styled: getComputedStyle(document.body).backgroundColor,
  }))()`);

  // The Phase 10 nonce CSP's failure mode is a blank page, so this is the
  // assertion that matters most in this whole file.
  check(loginRender.visibleText > 50, 'the sign-in page is not blank under the nonce CSP', `${loginRender.visibleText} chars`);
  check(loginRender.hasEmail && loginRender.hasPassword && loginRender.hasSubmit, 'the sign-in form renders');
  check(page.consoleErrors.length === 0, 'sign-in page logs no console error', page.consoleErrors.join(' | ').slice(0, 200));
  check(page.pageErrors.length === 0, 'sign-in page throws nothing', page.pageErrors.join(' | ').slice(0, 200));

  // A wrong password first, the way a person mistypes.
  await page.type('input[type=email]', EMAIL);
  await page.type('input[type=password]', 'this-is-the-wrong-password');
  await page.submitForm('input[type=password]');
  const afterWrong = await page.eval(`(() => ({
    path: location.pathname,
    message: (document.body.innerText.match(/That email or password[^\\n]*/) || [''])[0],
  }))()`);
  check(afterWrong.path === '/admin/login', 'a wrong password keeps the teacher on the sign-in page');
  check(afterWrong.message.length > 0, 'a wrong password shows a plain-language message', afterWrong.message);

  await page.type('input[type=email]', EMAIL);
  await page.type('input[type=password]', PASSWORD);
  await page.submitForm('input[type=password]', 3500);

  const dash = await page.eval(`(() => ({
    path: location.pathname,
    text: (document.body.innerText || '').slice(0, 400),
  }))()`);
  check(dash.path === '/admin', 'correct credentials land on the dashboard', `at ${dash.path}`);
  if (dash.path !== '/admin') throw new Error('cannot continue without a signed-in session');
  check(page.consoleErrors.length === 0, 'the sign-in round trip logs no console error', page.consoleErrors.join(' | ').slice(0, 200));

  /* ============================================ 2. THE ADMIN RENDERS === */
  section('2. EVERY ADMIN PAGE RENDERS AND IS INTERACTIVE');

  const adminPages = [
    '/admin',
    '/admin/students',
    '/admin/students/new',
    '/admin/stories',
    '/admin/stories/new',
    '/admin/batches',
    '/admin/batches/new',
    '/admin/announcements',
    '/admin/announcements/new',
    '/admin/enquiries',
    '/admin/preview',
  ];

  for (const path of adminPages) {
    page.clearErrors();
    await page.goto(`${BASE}${path}`);
    const state = await page.eval(`(() => ({
      chars: (document.body.innerText || '').trim().length,
      h1: document.querySelectorAll('h1').length,
      nav: document.querySelectorAll('a[href^="/admin"]').length,
      csp: Boolean(document.querySelector('script[nonce]')),
    }))()`);
    check(state.chars > 80, `${path} renders content`, `${state.chars} chars`);
    check(state.h1 === 1, `${path} has exactly one <h1>`, `${state.h1}`);
    check(state.nav >= 3, `${path} shows the admin navigation`, `${state.nav} links`);
    check(state.csp, `${path} scripts carry the CSP nonce`);
    check(page.consoleErrors.length === 0, `${path} logs no console error`, page.consoleErrors.join(' | ').slice(0, 200));
    check(page.pageErrors.length === 0, `${path} throws nothing`, page.pageErrors.join(' | ').slice(0, 200));
  }

  /* ============================================ 3. CREATE A STUDENT ==== */
  section('3. RECORDING A RESULT, THE WAY A TEACHER WOULD');

  const NAME = `${PREFIX}-STUDENT-001`;
  page.clearErrors();
  await page.goto(`${BASE}/admin/students/new`);

  // The form is the teacher's whole interface to consent, so its wording is
  // worth reading rather than only its behaviour.
  const labels = await page.eval(`(() => {
    const out = [];
    for (const l of document.querySelectorAll('label')) {
      const t = (l.textContent || '').trim().replace(/\\s+/g, ' ');
      if (t) out.push(t.slice(0, 90));
    }
    return out;
  })()`);
  const jargon = labels.filter((l) =>
    /published\s*=|displayNameMode|consentScope|boolean|true\/false/i.test(l),
  );
  check(jargon.length === 0, 'no database jargon appears in a form label', jargon.join(' | '));
  const consentLabels = labels.filter((l) => /permission|consent|allow|show/i.test(l));
  check(consentLabels.length >= 3, 'the consent controls are described in plain language', `${consentLabels.length} found`);

  await page.type('input[name=studentName]', NAME);
  await page.type('select[name=programme]', 'CLASS_12');
  await page.type('input[name=year]', '2026');
  await page.type('input[name=score]', '91');
  await page.submitForm('input[name=studentName]', 3500);

  const created = await prisma.topper.findFirst({
    where: { studentName: NAME },
    select: { id: true, published: true, score: true },
  });
  check(Boolean(created), 'the student is saved from the browser form');
  check(created?.published === false, 'a new record is NOT published by default');

  // Publishing without consent must be refused, in words the teacher can act on.
  await page.goto(`${BASE}/admin/students/${created.id}`);
  await page.check('input[name=published]', true);
  await page.submitForm('input[name=studentName]', 3000);
  const refused = await page.eval(`(() => (document.body.innerText || '').slice(0, 1500))()`);
  const stillDraft = await prisma.topper.findUnique({ where: { id: created.id }, select: { published: true } });
  check(stillDraft.published === false, 'publishing without consent is refused');
  check(
    /permission|consent|cannot be shown/i.test(refused),
    'the refusal explains what is missing rather than showing an error code',
  );

  // Now with the paperwork recorded.
  await page.goto(`${BASE}/admin/students/${created.id}`);
  await page.type('input[name=consentRef]', `${PREFIX}-CONSENT-001`);
  await page.check('input[name=consentResult]', true);
  await page.check('input[name=published]', true);
  await page.submitForm('input[name=studentName]', 3500);
  const published = await prisma.topper.findUnique({
    where: { id: created.id },
    select: { published: true, consentResult: true, consentName: true, consentPhoto: true },
  });
  check(published.published === true, 'publishing succeeds once consent is recorded');
  check(published.consentName === false, 'result consent did NOT silently grant name consent');
  check(published.consentPhoto === false, 'result consent did NOT silently grant photo consent');

  /* ============================================ 4. THE PUBLIC RESULT === */
  section('4. WHAT A VISITOR SEES');

  await page.goto(`${BASE}/results`);
  const publicResults = await page.eval(`(() => (document.body.innerText || ''))()`);
  check(/91/.test(publicResults), 'the published result appears on /results');
  check(!publicResults.includes(NAME), 'the name is withheld without name consent');
  check(
    !(await page.eval(`document.documentElement.outerHTML.includes('${PREFIX}-CONSENT-001')`)),
    'the consent reference never reaches the public page',
  );

  // Grant name consent and watch the page change.
  await page.goto(`${BASE}/admin/students/${created.id}`);
  await page.check('input[name=consentName]', true);
  await page.type('select[name=displayNameMode]', 'FULL');
  await page.submitForm('input[name=studentName]', 3500);
  await page.goto(`${BASE}/results`);
  check(
    (await page.eval(`(document.body.innerText || '')`)).includes(NAME),
    'granting name permission reveals the name publicly',
  );

  /* ================================================ 5. WITHDRAWAL ====== */
  section('5. WITHDRAWING PERMISSION');

  await page.goto(`${BASE}/admin/students/${created.id}`);
  await page.check('input[name=published]', false);
  await page.submitForm('input[name=studentName]', 3500);
  await page.goto(`${BASE}/results`);
  const afterWithdrawal = await page.eval(`(() => (document.documentElement.outerHTML || ''))()`);
  check(!afterWithdrawal.includes(NAME), 'unpublishing removes the record from /results immediately');

  /* =============================================== 6. ANNOUNCEMENT ===== */
  section('6. AN ANNOUNCEMENT, PUBLISHED AND WITHDRAWN');

  const MESSAGE = `${PREFIX}-ANNOUNCEMENT-001 synthetic notice`;
  await page.goto(`${BASE}/admin/announcements/new`);
  await page.type('input[name=message], textarea[name=message]', MESSAGE);
  await page.type('input[name=startsAt]', day(-1));
  await page.type('input[name=endsAt]', day(30));
  await page.check('input[name=published]', true);
  await page.submitForm('input[name=message], textarea[name=message]', 3500);

  const ann = await prisma.announcement.findFirst({
    where: { message: { startsWith: PREFIX } },
    select: { id: true, published: true },
  });
  check(Boolean(ann), 'the announcement saves');
  await page.goto(`${BASE}/announcements`);
  check(
    (await page.eval(`(document.body.innerText || '')`)).includes(MESSAGE),
    'the announcement appears on /announcements',
  );
  /**
   * The homepage banner shows ONE notice: the highest priority, then the most
   * recent. Whether the teacher's announcement is that one depends on what else
   * is live, so the expectation is computed rather than assumed.
   *
   * An earlier draft asserted it unconditionally. It passed against an empty
   * database and failed at 1,000-record scale, where the synthetic fixture set
   * includes announcements with priorities 1-4. That was the TEST being wrong:
   * `priority` is not on the announcement form at all, so every notice a
   * teacher actually creates has priority 0 and the newest one wins.
   */
  const bannerOrder = await prisma.announcement.findMany({
    where: {
      published: true,
      startsAt: { lte: new Date() },
      endsAt: { gte: new Date() },
    },
    orderBy: [{ priority: 'desc' }, { startsAt: 'desc' }],
    select: { message: true },
    take: 1,
  });
  const bannerShouldShowOurs = bannerOrder[0]?.message === MESSAGE;

  await page.goto(`${BASE}/`);
  const homeText = await page.eval(`(document.body.innerText || '')`);
  if (bannerShouldShowOurs) {
    check(homeText.includes(MESSAGE), 'the announcement appears in the homepage banner');
  } else {
    check(
      homeText.includes(bannerOrder[0]?.message ?? '\u0000'),
      'the homepage banner shows the top-ranked live notice',
      `top is "${(bannerOrder[0]?.message ?? '').slice(0, 40)}"`,
    );
    note(
      'With more than one live announcement the homepage banner shows only the ' +
        'top-ranked one. `priority` is not on the announcement form, so every ' +
        'notice a teacher creates ranks equally and the newest wins — a second ' +
        'notice published the same day may not change the homepage. /announcements ' +
        'lists them all and /admin/preview answers "what is live right now", so ' +
        'nothing is lost; it is worth knowing before the teacher asks.',
    );
  }

  await page.goto(`${BASE}/admin/announcements/${ann.id}`);
  await page.check('input[name=published]', false);
  await page.submitForm('input[name=message], textarea[name=message]', 3500);
  await page.goto(`${BASE}/announcements`);
  check(
    !(await page.eval(`(document.documentElement.outerHTML || '')`)).includes(MESSAGE),
    'unpublishing removes it from /announcements',
  );
  await page.goto(`${BASE}/`);
  check(
    !(await page.eval(`(document.documentElement.outerHTML || '')`)).includes(MESSAGE),
    'unpublishing removes it from the homepage banner',
  );
  check(
    !(await page.eval(`(document.documentElement.outerHTML || '')`)).includes(MESSAGE),
    'the withdrawn notice is gone from the homepage HTML entirely',
  );

  /* =================================================== 7. DELETION ===== */
  section('7. DELETING A RECORD');

  await page.goto(`${BASE}/admin/students/${created.id}`);
  /**
   * The confirmation is a native `window.confirm`, not inline text.
   *
   * An earlier draft of this suite looked for a visible "cannot be undone"
   * warning beside the button, found none, and filed a UX complaint. The
   * confirmation was there the whole time — `DeleteButton` calls
   * `window.confirm(confirmMessage)` and cancels the submit when it is
   * declined. Testing for the mechanism rather than for one particular
   * presentation is both correct and stronger: this now proves that DECLINING
   * actually cancels, which the inline-text check never would have.
   */
  const deleteButton = await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => /delete/i.test(b.textContent || ''));
    return btn ? (btn.textContent || '').trim() : null;
  })()`);
  check(Boolean(deleteButton), 'the edit page offers a delete control', String(deleteButton));

  // Decline the confirmation: the record must survive.
  await page.eval(`(() => {
    window.__confirmMessage = null;
    window.confirm = (m) => { window.__confirmMessage = m; return false; };
    const btn = [...document.querySelectorAll('button')]
      .find((b) => /delete/i.test(b.textContent || ''));
    btn.click();
  })()`);
  await page.eval('new Promise((r) => setTimeout(r, 1500))', true);
  const confirmMessage = await page.eval('window.__confirmMessage');
  check(Boolean(confirmMessage), 'deleting asks for confirmation first', String(confirmMessage));
  check(
    /permanent|cannot be undone|sure|\?/i.test(String(confirmMessage ?? '')),
    'the confirmation says what is about to happen',
    String(confirmMessage),
  );
  const survived = await prisma.topper.findUnique({ where: { id: created.id }, select: { id: true } });
  check(Boolean(survived), 'declining the confirmation does NOT delete the record');

  // Accept it: the record must go.
  await page.goto(`${BASE}/admin/students/${created.id}`);
  await page.eval(`(() => {
    window.confirm = () => true;
    const btn = [...document.querySelectorAll('button')]
      .find((b) => /delete/i.test(b.textContent || ''));
    btn.click();
  })()`);
  await page.eval('new Promise((r) => setTimeout(r, 3000))', true);
  const deleted = await prisma.topper.findUnique({ where: { id: created.id }, select: { id: true } });
  check(!deleted, 'accepting the confirmation deletes the record');

  await page.goto(`${BASE}/admin/students`);
  check(
    !(await page.eval(`(document.body.innerText || '')`)).includes(NAME),
    'a deleted student is gone from the admin list',
  );

  /* ==================================================== 8. SIGN OUT ==== */
  section('8. SIGNING OUT, AND WHAT HAPPENS NEXT');

  const sessionBefore = await page.eval(`document.cookie`);
  check(!/ci_admin_session/.test(sessionBefore), 'the session cookie is not readable from JavaScript (HttpOnly)');

  await page.goto(`${BASE}/admin`);
  const signedOut = await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => /sign out|log ?out/i.test(b.textContent || ''));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check(signedOut, 'the admin offers a sign-out control');
  await page.eval('new Promise((r) => setTimeout(r, 2500))', true);

  const afterSignOut = await page.eval(`location.pathname`);
  check(
    afterSignOut === '/admin/login',
    'signing out lands on the sign-in page',
    `at ${afterSignOut}`,
  );

  await page.goto(`${BASE}/admin/students`);
  check(
    (await page.eval(`location.pathname`)) === '/admin/login',
    'after signing out, an admin URL redirects to sign-in',
  );

  // Back button after logout must not resurrect the panel.
  await page.eval('history.back()');
  await page.eval('new Promise((r) => setTimeout(r, 1500))', true);
  const afterBack = await page.eval(`(() => ({
    path: location.pathname,
    leaked: /Enquiries|Students|Sign out/.test(document.body.innerText || ''),
  }))()`);
  check(!afterBack.leaked || afterBack.path === '/admin/login', 'the Back button does not restore admin content after sign-out', `at ${afterBack.path}`);
} catch (error) {
  console.error('\nHarness error:', error instanceof Error ? `${error.name}: ${error.message}` : error);
  fail += 1;
} finally {
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

console.log(`\n${'='.repeat(56)}`);
console.log(`TEACHER WORKFLOW (${KIND}): ${pass} passed, ${fail} failed`);
if (notes.length > 0) {
  console.log('\nUX observations (not failures):');
  for (const n of notes) console.log(`  - ${n}`);
}
if (fail > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('='.repeat(56));
exit(fail > 0 ? 1 : 0);
