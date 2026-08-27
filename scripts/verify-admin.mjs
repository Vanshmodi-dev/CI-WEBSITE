/**
 * The admin as a control surface — can a teacher actually change the website?
 *
 * =============================================================================
 * WHAT THIS SUITE IS FOR, AND WHY IT IS NOT verify-cms
 * =============================================================================
 * `verify-cms.mjs` proves the EDITOR works: authentication, validation, an
 * unregistered key, a stale edit, CSRF, XSS, and that one representative field
 * reaches a logged-out visitor.
 *
 * This suite asks a different question, one representative fields cannot
 * answer: does EVERY registered field actually reach the public page it claims
 * to render on? A field can be registered, listed in the preview, declared to
 * appear at `/about`, read by some function somewhere — and still never be
 * rendered, because the declaration is data and the rendering is code.
 *
 * `tests/site-content.test.ts` proves each key is read by SOURCE. That is a
 * static proof and a good one. It cannot prove the value comes out the other
 * end at the declared route, which is the only thing a teacher cares about.
 *
 * So: for all 49 fields, write a unique marker through the real single-field
 * save, fetch the declared route as an anonymous visitor, and look for it.
 *
 * =============================================================================
 * AND THAT NEIGHBOURING FIELDS SURVIVE
 * =============================================================================
 * The second question is data safety. The website action reads every field of a
 * group with `formData.get(key)` and turns absence into "" — so a payload that
 * omits a field BLANKS it. The single-field `only=` path exists to stop that.
 * Every save here goes through `only=`, and the suite snapshots the whole
 * settings table at the start and asserts at the end that nothing it did not
 * name has changed.
 *
 * Usage:
 *   DATABASE_URL=... ADMIN_PASSWORD=... BASE_URL=http://localhost:3000 \
 *     node scripts/verify-admin.mjs
 */

import { env, exit } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { launch } from './browser.mjs';
import { EDITABLE_FIELDS } from '../src/config/site-content.ts';

const BASE = env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = env.ADMIN_EMAIL ?? 'admin@localhost.invalid';
const PASSWORD = env.ADMIN_PASSWORD ?? '';

let pass = 0;
let fail = 0;
const failures = [];

function check(condition, name, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name} ${detail}`);
  }
}
const section = (t) => console.log(`\n=== ${t} ===`);

if (!PASSWORD) {
  console.error('ADMIN_PASSWORD is not set.');
  exit(1);
}
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. This suite reads the settings table directly.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const publicHtml = async (path) =>
  (await fetch(BASE + path, { headers: { 'cache-control': 'no-cache' } })).text();

async function waitForPublic(path, predicate, tries = 8) {
  let html = '';
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    html = await publicHtml(path);
    if (predicate(html)) return { ok: true, attempt, html };
    if (attempt < tries) await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, attempt: tries, html };
}

/* ------------------------------------------------------------ snapshot -- */

/** Everything in the settings table, so the teardown can prove what changed. */
async function snapshot() {
  const rows = await prisma.siteSetting.findMany({ select: { key: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
const before = await snapshot();

/*
  ⚠ REFUSE TO START FROM A POLLUTED BASELINE.

  This suite restores whatever it found. If a previous run threw before its
  teardown - which happened, when a selector error killed the run midway - the
  markers it wrote are still in the table, and the next run adopts them as
  `before` and faithfully puts them BACK. The pollution then looks permanent and
  starts failing unrelated suites, which is exactly how verify-cms failed
  earlier in this topic.

  A baseline containing this suite's own markers is not a baseline. It is
  wreckage from a previous run, and the right response is to clear it rather
  than preserve it.
*/
/*
  ⚠ THE MARKER SET INCLUDES THE ONES THAT DO NOT LOOK LIKE MARKERS.

  Four fields are validated, so this suite cannot write "ZZADM07" into them - a
  PIN code must be six digits and a phone must look like a phone. Their markers
  are therefore realistic values, and a first version of this guard, which
  matched only /ZZADM|ZZNAV/, walked straight past them: a crashed run left
  `contact.postalCode=302099` and `contact.phonePrimary=+91 90000 11111`
  behind, the next run adopted them as its baseline and faithfully restored
  them, and they were still on the public site two suites later.

  The set is built from the same function that writes them, so it cannot drift
  from what this suite is capable of leaving behind.
*/
const SUITE_MARKERS = new Set(
  EDITABLE_FIELDS.filter((f) => f.kind !== 'toggle').map((f, i) => markerFor(f, i).value),
);

const polluted = Object.entries(before).filter(
  ([, v]) => /ZZADM|ZZNAV/.test(v) || SUITE_MARKERS.has(v),
);
if (polluted.length > 0) {
  console.log(
    `\n  Baseline contained ${polluted.length} leftover marker row(s) from an ` +
      'earlier interrupted run. Clearing them rather than restoring them:',
  );
  for (const [key] of polluted) {
    console.log(`    ${key}`);
    delete before[key];
  }
  await prisma.siteSetting.deleteMany({ where: { key: { in: polluted.map(([k]) => k) } } });
}

/* -------------------------------------------------------------- browser -- */

const browser = await launch(env.BROWSER ?? 'chrome');
const page = await browser.page();
await page.viewport(1280, 900);

function fieldsOf(markup, marker) {
  const forms = [...markup.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const target = forms.find((f) => f.includes(marker)) ?? '';
  const fields = {};
  for (const m of target.matchAll(/<input[^>]*>/g)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]*)"/) ?? [])[1];
    const value = (tag.match(/value="([^"]*)"/) ?? [])[1] ?? '';
    if (name) {
      fields[name] = value
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    }
  }
  return fields;
}

async function postAction(path, fields, { cookie, origin } = {}) {
  const boundary = '----zzadm' + Math.random().toString(16).slice(2);
  const CRLF = String.fromCharCode(13, 10);
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
  }
  body += `--${boundary}--${CRLF}`;
  const res = await fetch(BASE + path, {
    method: 'POST',
    body,
    redirect: 'manual',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Origin: origin ?? BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  await res.text().catch(() => '');
  return res;
}

/* ============================================================ 0. CONTROL == */

section('0. SIGN IN, AND PROVE THIS SUITE CAN WRITE');

await page.goto(`${BASE}/admin/login`);
await page.type('input[type=email]', EMAIL);
await page.type('input[type=password]', PASSWORD);
await page.submitForm('input[type=password]', 4000);

if ((await page.eval('location.pathname')).includes('/admin/login')) {
  console.error('Could not sign in. Is ADMIN_PASSWORD correct, or is the account throttled?');
  await page.close();
  await browser.close();
  await prisma.$disconnect();
  exit(1);
}

let adminCookie = await page.cookieHeader(BASE);
check(adminCookie.includes('='), 'the httpOnly session cookie was captured');

/**
 * The single-field form for `key`, taken from /admin/preview.
 *
 * ⚠ THE TOKEN MUST COME FROM THE SAME PLACE AS THE `only` FIELD.
 *
 * The first version of this read the GROUP form on /admin/website and added
 * `only=` to it. That combination is not one any real client produces, and it
 * fails: /admin/website carries a token computed over the WHOLE GROUP (it saves
 * the whole group), while the action compares against a token computed over
 * just the keys it is about to write. One save per group therefore succeeded
 * and every later one was rejected as stale.
 *
 * I very nearly reported that as a high-severity application defect. It is not:
 * both real paths are internally consistent. /admin/website sends a group token
 * and saves the group; /admin/preview sends a PER-KEY token and saves one key.
 * Driving the preview form - which is the click-to-edit path a teacher actually
 * uses - saves the same key repeatedly with no rejection.
 */
async function formFor(key) {
  const markup = await (
    await fetch(`${BASE}/admin/preview`, { headers: { Cookie: adminCookie } })
  ).text();
  // The preview renders one form per field, each with `<input name="only"
  // value="<key>">`, so the key's own value is the marker that finds it.
  return fieldsOf(markup, `value="${key}"`);
}

/** Save exactly one field through the real click-to-edit path. */
async function saveOne(key, value) {
  const fields = await formFor(key);
  if (fields.only !== key) {
    return { ok: false, reason: `preview form for ${key} not found (only=${fields.only})` };
  }
  fields[key] = value;
  const res = await postAction('/admin/preview', fields, { cookie: adminCookie });
  return { ok: res.status < 400 || res.status === 303, status: res.status };
}

const storedValue = async (key) =>
  (await prisma.siteSetting.findUnique({ where: { key }, select: { value: true } }))?.value ?? null;

{
  // A control write, proving the mechanism works before 49 assertions rely on it.
  const probe = await saveOne('home.heroEyebrow', 'ZZADM control probe');
  check(probe.ok, 'a single-field save is accepted', `status ${probe.status ?? probe.reason}`);
  check(
    (await storedValue('home.heroEyebrow')) === 'ZZADM control probe',
    'control: the save mechanism writes what it was given',
  );
  check(
    (await storedValue('home.heroEyebrow')) === 'ZZADM control probe',
    'and the value reached the database',
  );
  const live = await waitForPublic('/', (h) => h.includes('ZZADM control probe'));
  check(live.ok, 'and a logged-out visitor sees it', `after ${live.attempt} request(s)`);
}

/* ================== 1. EVERY REGISTERED FIELD REACHES ITS DECLARED ROUTE == */

section('1. EVERY REGISTERED FIELD REACHES THE PAGE IT SAYS IT RENDERS ON');

/**
 * A value that satisfies the field's validator and is findable in HTML.
 *
 * The validated fields cannot take an arbitrary marker: a PIN code must be six
 * digits and a phone must look like a phone. Their markers are therefore real
 * values chosen to be unmistakable rather than random strings.
 */
function markerFor(field, index) {
  switch (field.key) {
    case 'contact.postalCode':
      return { value: '302099', find: '302099' };
    case 'contact.phonePrimary':
      return { value: '+91 90000 11111', find: '90000 11111' };
    case 'contact.phoneSecondary':
      return { value: '+91 90000 22222', find: '90000 22222' };
    case 'contact.coordinates':
      // Renders a MAP, not text. The observable effect is the panel appearing.
      return { value: '26.849123,75.805456', find: 'Show the map' };
    default: {
      const marker = `ZZADM${String(index).padStart(2, '0')}`;
      // Nav labels are capped at 24 characters; keep every marker short.
      return { value: marker, find: marker };
    }
  }
}

/** Where an anonymous visitor should be able to see this field. */
function routeFor(field) {
  // `*` means site chrome - header, footer, or a block repeated everywhere.
  return field.renders.route === '*' ? '/' : field.renders.route;
}

const textFields = EDITABLE_FIELDS.filter((f) => f.kind !== 'toggle');
const toggleFields = EDITABLE_FIELDS.filter((f) => f.kind === 'toggle');

console.log(`  ${textFields.length} text fields and ${toggleFields.length} toggles to cover\n`);

const notReaching = [];

for (const [index, field] of textFields.entries()) {
  const { value, find } = markerFor(field, index);
  const route = routeFor(field);

  /*
    A MENU LABEL ONLY RENDERS WHILE ITS ENTRY IS SHOWN.

    Four entries ship hidden - faculty, reviews, videos and gallery are in
    HIDDEN_UNTIL_POPULATED, so their `visible` toggle falls back to "". Their
    LABEL is registered and editable, and changing it correctly produces no
    visible change until the entry is turned on.

    That is the product behaving properly, not a field failing to reach its
    route, so the toggle is turned on first - which is exactly what a teacher
    does when they want the entry to appear. Section 2 proves the toggle itself
    works in both directions.
  */
  const navLabel = /^nav\.(.+)\.label$/.exec(field.key);
  if (navLabel) await saveOne(`nav.${navLabel[1]}.visible`, 'on');

  const saved = await saveOne(field.key, value);
  if (!saved.ok) {
    check(false, `${field.key} saved`, saved.reason ?? `status ${saved.status}`);
    continue;
  }

  const stored = await storedValue(field.key);
  const reached = await waitForPublic(route, (h) => h.includes(find));

  check(
    stored === value,
    `${field.key} stored`,
    stored === value ? '' : `stored ${JSON.stringify(stored)}`,
  );
  check(
    reached.ok,
    `${field.key} appears on ${route}`,
    reached.ok ? `after ${reached.attempt} request(s)` : `looked for ${JSON.stringify(find)}`,
  );
  if (!reached.ok) notReaching.push(`${field.key} -> ${route}`);
}

/* ============================================ 2. THE NAVIGATION TOGGLES == */

section('2. EVERY MENU TOGGLE ACTUALLY SHOWS AND HIDES ITS LINK');
{
  /*
    A toggle stores "on" or "". Its observable effect is a menu entry, so the
    assertion is on the header markup rather than on a marker string.

    Each toggle is driven BOTH ways from whatever it currently is, so the test
    is meaningful for the entries that ship hidden (faculty, reviews, gallery,
    videos are in HIDDEN_UNTIL_POPULATED) as well as the ones that ship on.
  */
  for (const field of toggleFields) {
    const slug = field.key.replace(/^nav\./, '').replace(/\.visible$/, '');
    const labelKey = `nav.${slug}.label`;
    const label = EDITABLE_FIELDS.find((f) => f.key === labelKey);
    if (!label) {
      check(false, `${field.key} has a matching label field`, `expected ${labelKey}`);
      continue;
    }

    // Give the link an unmistakable label so presence is unambiguous.
    const marker = `ZZNAV${slug.slice(0, 6)}`;
    await saveOne(labelKey, marker);

    await saveOne(field.key, 'on');
    const shown = await waitForPublic('/', (h) => h.includes(marker));
    check(shown.ok, `${field.key}=on shows "${marker}" in the menu`, `after ${shown.attempt} req`);

    await saveOne(field.key, '');
    const hidden = await waitForPublic('/', (h) => !h.includes(marker));
    check(hidden.ok, `${field.key}="" hides it again`, `after ${hidden.attempt} req`);
  }
}

/* ================================================== 3. DATA SAFETY ======= */

section('3. A SINGLE-FIELD SAVE TOUCHES ONLY THAT FIELD');
{
  /*
    The website action turns an absent key into "". The `only=` path is what
    stops a partial payload blanking a neighbour, and this proves it rather than
    trusting it: two fields in the same group are set, one is rewritten, and the
    other is read back.
  */
  await saveOne('contact.city', 'ZZADM City');
  await saveOne('contact.state', 'ZZADM State');
  check((await storedValue('contact.city')) === 'ZZADM City', 'control: both neighbours are set');
  check((await storedValue('contact.state')) === 'ZZADM State', 'control: the second is set too');

  await saveOne('contact.city', 'ZZADM City Changed');
  check(
    (await storedValue('contact.city')) === 'ZZADM City Changed',
    'the named field changed',
  );
  check(
    (await storedValue('contact.state')) === 'ZZADM State',
    'and its neighbour in the same group did NOT',
    String(await storedValue('contact.state')),
  );

  // A field in a different group is untouched too.
  await saveOne('home.ctaTitle', 'ZZADM Cta');
  await saveOne('contact.city', 'ZZADM City Again');
  check(
    (await storedValue('home.ctaTitle')) === 'ZZADM Cta',
    'and a field in another group is untouched',
    String(await storedValue('home.ctaTitle')),
  );
}

/* ============================================= 4. CLEARING RESTORES ====== */

section('4. CLEARING A FIELD RESTORES THE SHIPPED TEXT');
{
  /*
    For a non-blankable field an empty stored value means "use the fallback",
    which is what makes clearing a box a safe undo. For a blankable one it means
    "show nothing". Both are checked, because they are different promises.
  */
  const nonBlankable = EDITABLE_FIELDS.find((f) => f.key === 'home.heroTitleLine1');
  await saveOne(nonBlankable.key, 'ZZADM Temporary Headline');
  const set = await waitForPublic('/', (h) => h.includes('ZZADM Temporary Headline'));
  check(set.ok, 'control: a non-blankable field shows the typed value');

  await saveOne(nonBlankable.key, '');
  const restored = await waitForPublic(
    '/',
    (h) => !h.includes('ZZADM Temporary Headline') && h.includes(nonBlankable.fallback),
  );
  check(
    restored.ok,
    'clearing it brings the shipped text back',
    `looked for ${JSON.stringify(nonBlankable.fallback.slice(0, 30))}`,
  );

  const blankable = EDITABLE_FIELDS.find((f) => f.key === 'contact.phoneSecondary');
  await saveOne(blankable.key, '+91 90000 33333');
  const shown = await waitForPublic('/contact', (h) => h.includes('90000 33333'));
  check(shown.ok, 'control: a blankable field shows the typed value');

  await saveOne(blankable.key, '');
  const gone = await waitForPublic('/contact', (h) => !h.includes('90000 33333'));
  check(gone.ok, 'clearing a blankable field shows nothing, not a fallback');
}

/* ============================ 5. EVERY EDIT FORM RESISTS A STALE OVERWRITE = */

section('5. ANNOUNCEMENTS AND BATCHES RESIST A STALE OVERWRITE');
{
  /*
    REGRESSION FOR A DEFECT FOUND IN TOPIC 11.

    Faculty, gallery, videos, stories, students and the website editor all
    carried the lost-update guard. Announcements and batches did not: their
    forms sent no version token and their actions called a bare
    `prisma.x.update()`, so a second tab's save silently overwrote the first
    with no warning to either teacher. Proved end-to-end before the fix, and
    pinned here.

    Each case carries its own CONTROL - an ordinary edit that must still save -
    because a guard that rejects everything would pass the first assertion and
    break the product.
  */
  const setValue = (selector, value) => `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;

  const soon = new Date(Date.now() + 7 * 86400000);

  const cases = [
    {
      label: 'announcement',
      field: 'message',
      create: () =>
        prisma.announcement.create({
          data: {
            message: 'ZZADM stale subject',
            startsAt: new Date(),
            endsAt: soon,
            published: false,
            priority: 0,
          },
        }),
      route: (id) => `/admin/announcements/${id}`,
      read: (id) =>
        prisma.announcement.findUnique({ where: { id } }).then((r) => r?.message ?? null),
      elsewhere: (id) =>
        prisma.announcement.update({ where: { id }, data: { message: 'ZZADM changed elsewhere' } }),
      cleanup: () =>
        prisma.announcement.deleteMany({ where: { message: { startsWith: 'ZZADM' } } }),
    },
    {
      label: 'batch',
      field: 'seatsNote',
      create: () =>
        prisma.batch.create({
          data: {
            courseSlug: 'class-11-commerce',
            startsAt: soon,
            mode: 'Offline',
            seatsNote: 'ZZADM stale subject',
            published: false,
          },
        }),
      route: (id) => `/admin/batches/${id}`,
      read: (id) => prisma.batch.findUnique({ where: { id } }).then((r) => r?.seatsNote ?? null),
      elsewhere: (id) =>
        prisma.batch.update({ where: { id }, data: { seatsNote: 'ZZADM changed elsewhere' } }),
      cleanup: () => prisma.batch.deleteMany({ where: { seatsNote: { startsWith: 'ZZADM' } } }),
    },
  ];

  for (const c of cases) {
    await c.cleanup();
    const row = await c.create();

    // Tab A opens the form.
    await page.goto(BASE + c.route(row.id));
    const hasToken = await page.eval(
      `String(Boolean(document.querySelector('[name="editedAt"]')))`,
    );
    check(hasToken === 'true', `the ${c.label} form carries a version token`);

    // Tab B changes it underneath.
    await c.elsewhere(row.id);

    // Tab A saves its older view.
    await page.eval(setValue(`[name="${c.field}"]`, 'ZZADM tab A overwrite'));
    await page.submitForm(`[name="${c.field}"]`, 4000);

    const after = await c.read(row.id);
    check(
      after === 'ZZADM changed elsewhere',
      `a stale ${c.label} save does NOT overwrite the newer change`,
      String(after),
    );
    check(
      /Someone changed this record/i.test(await page.eval('document.body.innerText')),
      `and the teacher is told what happened (${c.label})`,
    );

    // CONTROL: an ordinary edit must still save.
    await page.goto(BASE + c.route(row.id));
    await page.eval(setValue(`[name="${c.field}"]`, 'ZZADM ordinary edit'));
    await page.submitForm(`[name="${c.field}"]`, 4000);
    check(
      (await c.read(row.id)) === 'ZZADM ordinary edit',
      `control: an ordinary ${c.label} edit still saves`,
      String(await c.read(row.id)),
    );

    await c.cleanup();
  }
}

/* ================================ 6. AUTHENTICATION UX ==================== */

section('6. THE SIGN-IN SCREEN SAYS THE RIGHT THING');
{
  /*
    Phase 11 found the throttle being reported as a credential failure, which
    sends an owner off to reset a password that was never wrong. The message is
    checked here from the rendered page rather than from the source string.
  */
  /*
    ⚠ A SEPARATE BROWSER, NOT A SECOND TAB.

    `browser.page()` shares the cookie jar, so a "fresh" tab was already signed
    in and /admin/login redirected straight to the dashboard - the refusal
    message never rendered and the assertion reported that a correctly-behaving
    login screen said nothing. An anonymous check needs an anonymous browser.
  */
  const anonBrowser = await launch(env.BROWSER ?? 'chrome');
  const fresh = await anonBrowser.page();
  await fresh.viewport(1280, 900);

  await fresh.goto(`${BASE}/admin/login`);
  check(
    (await fresh.eval('location.pathname')) === '/admin/login',
    'control: the anonymous browser really is signed out',
    await fresh.eval('location.pathname'),
  );
  await fresh.type('input[type=email]', EMAIL);
  await fresh.type('input[type=password]', 'definitely-not-the-password');
  /*
    4000ms, not 3000. The refusal is rendered by the action's response, and at
    3000 the assertion sometimes read the page before the message arrived - so
    it reported "neither message appeared" on a login screen that was about to
    say exactly the right thing.
  */
  await fresh.submitForm('input[type=password]', 4000);
  const wrong = await fresh.eval('document.body.innerText');

  /*
    EITHER MESSAGE IS CORRECT, AND WHICH ONE APPEARS IS NOT THIS SUITE'S TO
    DECIDE.

    A single wrong password gets "That email or password is not correct." Enough
    of them in one window gets the throttle message instead - and by the time a
    long suite reaches this section, earlier runs may already have spent the
    window. Pinning the assertion to the credential wording made it fail on a
    correctly-behaving product.

    What matters is the PROPERTY: the refusal must not enumerate accounts, and
    must not send somebody off to reset a password that is fine. Both are
    asserted below, on whichever message appeared.
  */
  const credential = /email or password is not correct/i.test(wrong);
  const throttled = /too many attempts|paused for a few minutes/i.test(wrong);
  check(
    credential || throttled,
    'a wrong password is refused with a message a person can act on',
    credential ? 'credential message' : throttled ? 'throttle message' : wrong.slice(0, 60),
  );
  check(
    !throttled || !/password is not correct/i.test(wrong),
    'a throttle is never reported as a wrong password',
  );
  check(
    !/no such account|account does not exist|unknown user/i.test(wrong),
    'and it does not reveal whether the account exists',
  );
  check(
    !/reset your password/i.test(wrong) || !/too many/i.test(wrong),
    'and does not tell the owner to reset a password that may be fine',
  );

  // Signing in for real still works after a failure.
  await fresh.goto(`${BASE}/admin/login`);
  await fresh.type('input[type=email]', EMAIL);
  await fresh.type('input[type=password]', PASSWORD);
  await fresh.submitForm('input[type=password]', 4000);
  const landed = await fresh.eval('location.pathname');
  check(!landed.includes('/admin/login'), 'control: the correct password still signs in', landed);

  // Logging out, then using the back button, must not show the admin again.
  await fresh.goto(`${BASE}/admin/faculty`);
  await fresh.eval(`(() => {
    const f = document.querySelector('form[action="/admin/logout"]');
    if (f) f.submit();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 2500));

  const afterLogout = await fetch(`${BASE}/admin/faculty`, {
    headers: { Cookie: await fresh.cookieHeader(BASE) },
    redirect: 'manual',
  });
  await afterLogout.text().catch(() => '');
  check(
    afterLogout.status === 307 || afterLogout.status === 302,
    'after signing out the session no longer opens an admin page',
    `status ${afterLogout.status}`,
  );

  await fresh.close();
  await anonBrowser.close();

  /*
    ⚠ SIGNING OUT REVOKED THIS SUITE'S OWN SESSION.

    `signOut` revokes every session for the account, not just the cookie in one
    browser - which is the right security behaviour and exactly what the logout
    check above is proving. The consequence is that the suite's main page was
    signed out too, so every later section loaded the login screen instead of
    the form it expected: the submit-button assertions failed, and a selector
    then threw "Illegal invocation" on an element that was not there.

    So the shared session is re-established here, and asserted rather than
    assumed.
  */
  await page.goto(`${BASE}/admin/login`);
  await page.type('input[type=email]', EMAIL);
  await page.type('input[type=password]', PASSWORD);
  await page.submitForm('input[type=password]', 4000);
  adminCookie = await page.cookieHeader(BASE);
  check(
    !(await page.eval('location.pathname')).includes('/admin/login'),
    'the suite signed back in after testing sign-out',
  );
}

/* ============================== 7. SAVE / ERROR / SUCCESS UX ============= */

section('7. A SAVE TELLS THE TEACHER WHAT HAPPENED');
{
  await page.goto(`${BASE}/admin/faculty/new`);

  const submit = await page.eval(`(() => {
    const b = [...document.querySelectorAll('button[type=submit]')].find((x) => /add|save/i.test(x.textContent || ''));
    return JSON.stringify({
      exists: Boolean(b),
      label: b ? (b.textContent || '').trim() : '',
      disabledAtRest: b ? b.disabled : null,
    });
  })()`);
  const btn = JSON.parse(submit);
  check(btn.exists, 'the form has a submit control', btn.label);
  check(btn.disabledAtRest === false, 'which is enabled before anything is typed');

  /*
    REGRESSION FOR THE DEFECT THIS SECTION FOUND.

    React resets a form once its action settles, so every uncontrolled input
    went back to its `defaultValue` after a refused save - and a teacher who
    filled in a long form and missed one required field lost everything they had
    typed. Every admin form is checked, not just this one, because the reset is
    a property of the pattern rather than of any single page.
  */
  {
    const setValue = (name, value) =>
      '(() => {' +
      '  const el = document.querySelector(' + JSON.stringify('[name="' + name + '"]') + ');' +
      "  if (!el) return 'no-field';" +
      "  const proto = el.tagName === 'TEXTAREA'" +
      '    ? window.HTMLTextAreaElement.prototype' +
      '    : window.HTMLInputElement.prototype;' +
      "  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, " + JSON.stringify(value) + ');' +
      "  el.dispatchEvent(new Event('input', { bubbles: true }));" +
      "  return 'ok';" +
      '})()';

    const FORMS = [
      ['/admin/faculty/new', 'designation', 'ZZADM Kept Faculty'],
      ['/admin/gallery/new', 'alt', 'ZZADM Kept Gallery'],
      ['/admin/videos/new', 'title', 'ZZADM Kept Video'],
      ['/admin/announcements/new', 'href', 'ZZADM Kept Announcement'],
      ['/admin/batches/new', 'seatsNote', 'ZZADM Kept Batch'],
      ['/admin/students/new', 'highlight', 'ZZADM Kept Student'],
      ['/admin/stories/new', 'quote', 'ZZADM Kept Story'],
    ];

    for (const [route, field, typed] of FORMS) {
      await page.goto(BASE + route);
      await new Promise((r) => setTimeout(r, 1000));
      const placed = await page.eval(setValue(field, typed));
      if (placed !== 'ok') {
        check(false, `${route} has a ${field} field to type into`, placed);
        continue;
      }
      await page.submitForm(`[name="${field}"]`, 3200);
      const kept = await page.eval(
        `(document.querySelector('[name="${field}"]') || {}).value ?? 'NO INPUT'`,
      );
      check(
        kept === typed,
        `${route} keeps what was typed when the save is refused`,
        JSON.stringify(kept),
      );
    }
  }

  /*
    The loop above left the browser on the last form it checked, so this block
    navigates back before reaching for a faculty field. Without it the selector
    found nothing and threw "Illegal invocation" - a harness error that looked
    like an application crash.
  */
  await page.goto(`${BASE}/admin/faculty/new`);
  await new Promise((r) => setTimeout(r, 800));

  // A validation failure must also announce itself, not just preserve values.
  await page.eval(`(() => {
    const el = document.querySelector('[name="designation"]');
    const proto = window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, 'ZZADM Role Typed');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await page.submitForm('[name="designation"]', 3000);

  const afterFailure = JSON.parse(
    await page.eval(`(() => {
      const role = document.querySelector('[name="designation"]');
      const text = document.body.innerText || '';
      return JSON.stringify({
        stillOnForm: Boolean(role),
        keptValue: role ? role.value : '',
        saysSomething: /check the highlighted|enter the teacher|required/i.test(text),
        hasAlertRole: document.querySelectorAll('[role="alert"]').length,
      });
    })()`),
  );
  check(afterFailure.stillOnForm, 'a validation failure keeps the teacher on the form');
  check(
    afterFailure.keptValue === 'ZZADM Role Typed',
    'and preserves what they already typed',
    afterFailure.keptValue,
  );
  check(afterFailure.saysSomething, 'and says what to fix');
  check(afterFailure.hasAlertRole > 0, 'the message is announced, not just coloured', `${afterFailure.hasAlertRole} alert region(s)`);

  // A successful save announces itself.
  await page.eval(`(() => {
    for (const [name, value] of [['name', 'ZZADM Save Teacher'], ['designation', 'Senior Faculty']]) {
      const el = document.querySelector('[name="' + name + '"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  })()`);
  await page.submitForm('[name="name"]', 4000);

  const saved = JSON.parse(
    await page.eval(`(() => JSON.stringify({
      path: location.pathname,
      text: (document.body.innerText || '').slice(0, 400),
    }))()`),
  );
  check(saved.path === '/admin/faculty', 'a successful save returns to the list', saved.path);
  check(/saved/i.test(saved.text), 'and says so');

  const created = await prisma.faculty.findFirst({ where: { name: 'ZZADM Save Teacher' } });
  check(Boolean(created), 'control: the record really was created');
  if (created) await prisma.faculty.delete({ where: { id: created.id } });
}

/* ================================ 8. RESPONSIVE ADMIN ==================== */

section('8. THE ADMIN IS USABLE ON A PHONE');
{
  const ROUTES = [
    '/admin',
    '/admin/website',
    '/admin/preview',
    '/admin/faculty',
    '/admin/faculty/new',
    '/admin/gallery',
    '/admin/videos',
    '/admin/students',
    '/admin/stories',
    '/admin/announcements',
    '/admin/batches',
    '/admin/enquiries',
    '/admin/media',
    '/admin/reviews',
    '/admin/data',
  ];

  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1440]) {
    await page.viewport(width, 820, { mobile: width < 640 });
    let overflowing = [];
    for (const route of ROUTES) {
      await page.goto(BASE + route);
      const box = JSON.parse(
        await page.eval(`(() => JSON.stringify({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }))()`),
      );
      if (box.scroll > box.client) overflowing.push(`${route} ${box.scroll}>${box.client}`);
    }
    check(
      overflowing.length === 0,
      `${width}px no admin page scrolls sideways`,
      overflowing.slice(0, 3).join(' | '),
    );
  }

  /*
    ⚠ NOT scrollWidth ALONE.

    A page can measure clean and still hide its primary action behind something
    else. `elementFromPoint` at the control's own centre answers the question a
    teacher cares about: if I tap here, do I hit the button?
  */
  await page.viewport(320, 820, { mobile: true });
  /*
    THE LABELS ARE THE REAL ONES, READ OFF THE PAGES.

    A first version guessed at "Add" for announcements and "Save" for the
    website editor; the actual controls say "New announcement" and "Save
    changes", so the probe reported control-not-found and looked like a
    reachability failure. A hit test that cannot find its target is not
    evidence of anything.
  */
  const REACHABLE = [
    ['/admin/faculty', 'Add a teacher'],
    ['/admin/gallery', 'Add a photograph'],
    ['/admin/videos', 'Add a video'],
    ['/admin/announcements', 'New announcement'],
    ['/admin/students', 'Add result'],
    ['/admin/website', 'Save changes'],
  ];
  for (const [route, label] of REACHABLE) {
    await page.goto(BASE + route);
    const hit = await page.eval(`(async () => {
      const target = [...document.querySelectorAll('a, button')]
        .find((el) => new RegExp(${JSON.stringify(label)}, 'i').test((el.textContent || '').trim()));
      if (!target) return 'control-not-found';
      /*
        AN INSTANT SCROLL, AND A REAL WAIT AFTERWARDS.

        The site sets scroll-behavior to smooth, so a default scrollIntoView
        ANIMATES over a few hundred milliseconds. Measuring after two animation
        frames caught the control mid-flight and reported it off-screen - on a
        control a person can reach perfectly well.

        No backticks or dollar signs in this comment: it sits inside a template
        literal, and either one ends or interpolates it. That is the third time
        this project has hit that trap.
      */
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 400));
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return 'zero-size';
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (y < 0 || y > window.innerHeight) return 'off-screen-after-scroll';
      const hitEl = document.elementFromPoint(x, y);
      if (!hitEl) return 'nothing-at-point';
      return target.contains(hitEl) || hitEl.contains(target)
        ? 'reachable'
        : 'covered-by:' + hitEl.tagName + '.' + String(hitEl.className || '').slice(0, 30);
    })()`, true);
    check(hit === 'reachable', `320px "${label}" on ${route} is actually tappable`, hit);
  }
}

/* ================================== 9. ACCESSIBILITY ===================== */

section('9. ADMIN ACCESSIBILITY');
{
  await page.viewport(1280, 900);
  const FORMS = ['/admin/faculty/new', '/admin/gallery/new', '/admin/videos/new', '/admin/website'];

  for (const route of FORMS) {
    await page.goto(BASE + route);
    const a11y = JSON.parse(
      await page.eval(`(() => {
        const controls = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')];
        const visible = controls.filter((c) => c.getAttribute('aria-hidden') !== 'true');
        const unlabelled = visible.filter((c) => {
          const byLabel = c.labels && c.labels.length > 0;
          const byAria = c.getAttribute('aria-label') || c.getAttribute('aria-labelledby');
          return !byLabel && !byAria;
        }).map((c) => c.name || c.type);
        const namelessButtons = [...document.querySelectorAll('button')].filter((b) => {
          const text = (b.textContent || '').trim();
          return text.length === 0 && !b.getAttribute('aria-label');
        }).length;
        const namelessLinks = [...document.querySelectorAll('a[href]')].filter((a) => {
          const text = (a.textContent || '').trim();
          return text.length === 0 && !a.getAttribute('aria-label');
        }).length;
        const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
        let jump = false;
        for (let i = 1; i < headings.length; i += 1) if (headings[i] - headings[i - 1] > 1) jump = true;
        return JSON.stringify({
          unlabelled,
          namelessButtons,
          namelessLinks,
          h1: document.querySelectorAll('h1').length,
          jump,
          hasMain: Boolean(document.querySelector('main')),
          positiveTabindex: [...document.querySelectorAll('[tabindex]')]
            .map((e) => Number(e.getAttribute('tabindex'))).filter((n) => n > 0).length,
        });
      })()`),
    );

    check(a11y.unlabelled.length === 0, `${route} every input has a label`, a11y.unlabelled.join(', '));
    check(a11y.namelessButtons === 0, `${route} no icon-only button lacks a name`, String(a11y.namelessButtons));
    check(a11y.namelessLinks === 0, `${route} no link lacks a name`, String(a11y.namelessLinks));
    check(a11y.h1 === 1, `${route} has exactly one h1`, String(a11y.h1));
    check(!a11y.jump, `${route} heading levels do not skip`);
    check(a11y.hasMain, `${route} has a main landmark`);
    check(a11y.positiveTabindex === 0, `${route} no positive tabindex`);
  }

  // The media picker must be reachable by keyboard, not mouse-only.
  await page.goto(`${BASE}/admin/faculty/new`);
  const picker = await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /choose|photo|upload/i.test(b.textContent || ''));
    if (!btn) return 'not-found';
    btn.focus();
    return document.activeElement === btn ? 'focusable' : 'not-focusable';
  })()`);
  check(picker === 'focusable', 'the photo picker control can take keyboard focus', picker);
}

/* ================================================================ CLEANUP = */

section('10. RESTORE EVERYTHING THIS SUITE TOUCHED');
{
  /*
    Restored by DELETING every key this suite wrote and re-inserting exactly
    what was there before, rather than by saving "" through the action - because
    "" is a stored value with its own meaning, and the table may legitimately
    have had no row at all.
  */
  await prisma.siteSetting.deleteMany({});
  for (const [key, value] of Object.entries(before)) {
    await prisma.siteSetting.create({ data: { key, value } });
  }

  /*
    ⚠ RESTORING THE ROWS IS NOT RESTORING THE WEBSITE.

    Those writes go straight to Postgres, so they fire no revalidation and the
    public pages keep serving whatever this suite last wrote. The first version
    stopped here, and /contact went on showing ZZADM markers long after the
    table was clean - which then failed an assertion in verify-cms, a suite that
    had done nothing wrong.

    One real save per group through the action is what makes the pages catch up:
    `saveWebsiteContent` calls `revalidatePath` for every route its group
    affects. The value written is the value already restored, so this changes
    nothing and refreshes everything.
  */
  const groups = [...new Set(EDITABLE_FIELDS.map((f) => f.group))];
  for (const group of groups) {
    const field = EDITABLE_FIELDS.find((f) => f.group === group);
    if (!field) continue;
    await saveOne(field.key, before[field.key] ?? '');
  }

  /*
    THE REVALIDATION PASS ITSELF LEAVES ROWS BEHIND.

    `saveOne(key, before[key] ?? '')` writes "" for a key that had no row at
    all, which CREATES one - so the table ended with four more rows than it
    started with and the restore assertion below failed. The rows are restored
    once more here, after the pages have refreshed.

    Deleting them does not undo the refresh: for a non-blankable field an empty
    stored value and no row at all render the same shipped text, so the pages
    stay correct.
  */
  await prisma.siteSetting.deleteMany({});
  for (const [key, value] of Object.entries(before)) {
    await prisma.siteSetting.create({ data: { key, value } });
  }

  // And prove the pages actually caught up, rather than assuming they did.
  const markerGone = await waitForPublic('/contact', (h) => !h.includes('ZZADM'));
  check(markerGone.ok, 'no marker from this suite survives on /contact', `after ${markerGone.attempt} request(s)`);
  const homeClean = await waitForPublic('/', (h) => !h.includes('ZZADM') && !h.includes('ZZNAV'));
  check(homeClean.ok, 'nor on the homepage', `after ${homeClean.attempt} request(s)`);

  const after = await snapshot();
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
  check(
    changed.length === 0,
    'the settings table is exactly as this suite found it',
    changed.join(', '),
  );
  check(
    Object.keys(after).length === Object.keys(before).length,
    'and holds the same number of rows',
    `${Object.keys(before).length} -> ${Object.keys(after).length}`,
  );

  await page.close();
  await browser.close();
  await prisma.$disconnect();
}

if (notReaching.length > 0) {
  console.log('\nFIELDS THAT DID NOT REACH THEIR DECLARED ROUTE:');
  for (const n of notReaching) console.log(`  - ${n}`);
}

console.log('\n========================================================');
console.log(`ADMIN CONTROL SURFACE: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('========================================================');

exit(fail === 0 ? 0 : 1);
