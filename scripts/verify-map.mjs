/**
 * The location and map experience, attacked.
 *
 * =============================================================================
 * WHAT THIS SUITE IS ACTUALLY FOR
 * =============================================================================
 * Topic 10 adds ONE operator-writable value — a coordinate pair — and that
 * value ends up in an iframe `src` and in structured data. So the suite asks
 * three questions and answers each from the database, the public HTML and a
 * real browser:
 *
 *   1. Can anything other than two numbers be stored in it?
 *   2. Does the map stay off until somebody supplies a point, and off again
 *      when they clear it?
 *   3. Does a visitor who does not press "Show the map" contact Google?
 *
 * =============================================================================
 * SECTION 0 IS NOT CEREMONY
 * =============================================================================
 * Every refusal below is only meaningful because section 0 proves the suite can
 * WRITE through the real editor and that the server under test contains Topic
 * 10. Phase 16 has produced suites whose negative checks passed because nothing
 * was happening — two that never wrote, one that served a stale build, one
 * whose cache clear silently failed, one that blamed a hidden row for a public
 * row's URL, and one that decided a CSP was unenforced because a blocked iframe
 * still fires `onload`.
 *
 * Usage:
 *   DATABASE_URL=... ADMIN_PASSWORD=... BASE_URL=http://localhost:3000 \
 *     node scripts/verify-map.mjs
 */

import { env, exit } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { launch } from './browser.mjs';
import { parseCoordinates } from '../src/lib/location.ts';

const BASE = env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = env.ADMIN_EMAIL ?? 'admin@localhost.invalid';
const PASSWORD = env.ADMIN_PASSWORD ?? '';

/** The one key this suite writes. */
const KEY = 'contact.coordinates';
/** The single-field editor. See the note on `contactForm()`. */
const EDITOR = '/admin/preview';
/** Somewhere in Pratap Nagar, Jaipur. Synthetic but plausible. */
const POINT = '26.849123,75.805456';

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
    if (attempt < tries) await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: false, attempt: tries, html };
}

/** What the settings table actually holds for our key. */
const storedValue = async () =>
  (await prisma.siteSetting.findUnique({ where: { key: KEY }, select: { value: true } }))?.value ??
  null;

/**
 * Who last wrote the row, captured so the teardown can put it back.
 *
 * `updatedBy` is how `seed:demo:clean` recognises its own copy rows, so a
 * restore that rebuilt the value and dropped this column would quietly orphan
 * the demo dataset's map point - it would still be on the page and no longer
 * removable by the documented reset.
 */
const storedAuthor = async () =>
  (await prisma.siteSetting.findUnique({ where: { key: KEY }, select: { updatedBy: true } }))
    ?.updatedBy ?? null;

/* ---------------------------------------------------------- start clean -- */

const hoursValue = async () =>
  (
    await prisma.siteSetting.findUnique({
      where: { key: 'contact.hours' },
      select: { value: true },
    })
  )?.value ?? null;

const originalValue = await storedValue();
const originalAuthor = await storedAuthor();
/** Read so the teardown can prove this suite did not blank a field it never tested. */
const hoursAtStart = await hoursValue();
await prisma.siteSetting.deleteMany({ where: { key: KEY } });

/* -------------------------------------------------------------- browser -- */

const browser = await launch(env.BROWSER ?? 'chrome');
const page = await browser.page();
await page.viewport(1280, 900);

/** Hidden action fields of the form that contains `marker`. */
function fieldsOf(markup, marker) {
  const forms = [...markup.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const target = forms.find((f) => f.includes(marker)) ?? '';
  const fields = {};
  for (const m of target.matchAll(/<input[^>]*>/g)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]*)"/) ?? [])[1];
    const value = (tag.match(/value="([^"]*)"/) ?? [])[1] ?? '';
    // React's hidden action payloads are HTML-entity encoded in the markup.
    // Replaying them verbatim posts literal `&quot;` and the action never runs.
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
  const boundary = '----zzmap' + Math.random().toString(16).slice(2);
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
  // Consume the body: an unread one fills the server log with noise that looks
  // like an application error.
  await res.text().catch(() => '');
  return res;
}

/* ============================================================ 0. CONTROL == */

section('0. THE SERVER HAS TOPIC 10, AND THIS SUITE CAN WRITE');
{
  const res = await fetch(`${BASE}/contact`, { redirect: 'manual' });
  const html = await res.text();
  check(res.status === 200, 'the running server serves /contact', `status ${res.status}`);
  check(
    html.includes('maps/dir/?api=1'),
    'and it already carries a directions link — the build contains Topic 10',
  );
  if (!html.includes('maps/dir/?api=1')) {
    console.error('\nThe server under test does not contain Topic 10. Rebuild before running.');
    await page.close();
    await browser.close();
    await prisma.$disconnect();
    exit(1);
  }
}

await page.goto(`${BASE}/admin/login`);
await page.type('input[type=email]', EMAIL);
await page.type('input[type=password]', PASSWORD);
await page.submitForm('input[type=password]', 4000);

if ((await page.eval('location.pathname')).includes('/admin/login')) {
  console.error('Could not sign in. Is ADMIN_PASSWORD correct?');
  await page.close();
  await browser.close();
  await prisma.$disconnect();
  exit(1);
}

const adminCookie = await page.cookieHeader(BASE);
check(
  adminCookie.includes('='),
  'the httpOnly session cookie was captured from the browser jar',
  adminCookie ? 'present' : 'MISSING — replays below would be anonymous',
);

/**
 * The contact group's form, freshly read so its lost-update token is current.
 *
 * ⚠ TWO THINGS HERE ARE LOAD-BEARING.
 *
 * THE MARKER IS `name=`, NOT `value=`. A text field renders as
 * `<input name="contact.coordinates" value="...">`, so matching on `value="…"`
 * found no form at all, `fieldsOf` returned `{}`, and every POST below was an
 * empty payload the action answered with a 500. Thirty assertions then
 * "failed" for one reason that had nothing to do with what they tested.
 *
 * `only` IS ALWAYS SET. The action reads every field of the group with
 * `formData.get(key)` and turns absence into `""` — and `fieldsOf` collects
 * only `<input>` elements, so a payload built from it omits `contact.hours`,
 * which is a textarea. Posting the whole group would therefore have BLANKED THE
 * OPENING HOURS on every save. `only` is the single-key path the action
 * provides for exactly this, and it means this suite can never damage a field
 * it is not testing.
 */
/**
 * The single-field editor payload for ANY registry key.
 *
 * `contactForm()` below is this with `KEY` baked in. Section 2b needs the same
 * machinery for `contact.email` and `social.youtube`, and copying it would be
 * a second place for the token note to go stale.
 */
async function fieldForm(key) {
  const markup = await (
    await fetch(`${BASE}/admin/preview`, { headers: { Cookie: adminCookie } })
  ).text();
  const fields = fieldsOf(markup, `value="${key}"`);
  fields.only = key;
  return fields;
}

async function contactForm() {
  /*
    ⚠ THE FORM COMES FROM /admin/preview, NOT /admin/website. THIS MATTERS.

    Both pages post to the same action, but they carry DIFFERENT stale-edit
    tokens. `/admin/website` renders one form per group and its token is the
    newest `updatedAt` across the WHOLE group. `/admin/preview` renders one form
    per field and its token covers that field alone.

    The action checks the submitted token against the rows it is about to write
    — for `only=contact.coordinates` that is one row. So pairing the GROUP token
    with a single-key save is only ever accepted when no other row in the group
    exists, because that is the one case where the two tokens coincide (both
    describe an empty set).

    This suite did exactly that, and passed for two topics because the contact
    group happened to be empty on every run. It was proved by writing a single
    `contact.city` row — a field that has existed since Phase 15 — and watching
    every save in this file be refused as stale. Nothing about the application
    is wrong: it is refusing a form that cannot prove which version it read,
    which is precisely its job.

    Topic 11 hit the same trap from the other direction and nearly filed it as a
    high-severity application defect. Recording it here so the next person does
    not have to find it a third time.
  */
  const markup = await (
    await fetch(`${BASE}/admin/preview`, { headers: { Cookie: adminCookie } })
  ).text();
  const fields = fieldsOf(markup, `value="${KEY}"`);
  fields.only = KEY;
  return fields;
}

{
  const fields = await contactForm();
  check(
    Object.prototype.hasOwnProperty.call(fields, '$ACTION_KEY') ||
      Object.keys(fields).some((k) => k.startsWith('$ACTION')),
    'the contact group form and its action payload were found',
    Object.keys(fields).filter((k) => k.startsWith('$ACTION')).join(', ') || 'NONE',
  );
  check(
    Object.prototype.hasOwnProperty.call(fields, KEY),
    `and it contains the ${KEY} field`,
    Object.keys(fields).filter((k) => k.startsWith('contact.')).join(', ') || 'NONE',
  );
  check(fields.group === 'contact', 'the payload names the contact group', String(fields.group));
  /*
    THE TOKEN FIELD EXISTS; IT IS LEGITIMATELY EMPTY RIGHT NOW.

    The group's lost-update token is the latest `updatedAt` across its rows, and
    this suite has just deleted the only row it owns. With nothing stored the
    token is "" — which the action must accept, or the FIRST save of any field
    could never happen. Asserting a non-empty token here was asserting that the
    database had content, not that the guard works.

    That the guard does work is proved in section 6, from the other direction:
    a token captured before a change no longer matches after it.
  */
  check(
    Object.prototype.hasOwnProperty.call(fields, 'editedAt'),
    'and carries a lost-update token field',
    fields.editedAt ? String(fields.editedAt).slice(0, 24) : '(empty — nothing stored yet)',
  );
}

/* ============================== 1. DIRECTIONS BEFORE ANY COORDINATES ====== */

section('1. DIRECTIONS WORK BEFORE A POINT IS VERIFIED');
{
  /*
    ⚠ THE RESET GOES THROUGH THE ACTION, NOT THROUGH PRISMA.

    The module-top `deleteMany` guarantees a clean row, and guarantees nothing
    about what a visitor sees: a direct database write fires no revalidation, so
    /contact kept serving a cached render from a previous run — complete with a
    map panel and a geo point — while the table was empty. Three assertions here
    failed against a page that was simply out of date, which is the same trap
    Topic 8 hit with a prerendered homepage.

    Clearing it through the real editor is what a teacher would do, and it is
    the only version of this that proves the public page follows.
  */
  const reset = await contactForm();
  reset[KEY] = '';
  await postAction(EDITOR, reset, { cookie: adminCookie });

  check(
    (await storedValue() ?? '') === '',
    'control: no coordinates are stored, so this is the unverified state',
    String(await storedValue()),
  );

  const cleared = await waitForPublic('/contact', (h) => !h.includes('Show the map'));
  check(cleared.ok, 'and the public page reflects that', `after ${cleared.attempt} request(s)`);

  for (const route of ['/contact', '/']) {
    const html = await publicHtml(route);
    const link = (html.match(/https:\/\/www\.google\.com\/maps\/dir\/\?api=1[^"']*/) ?? [])[0];
    check(Boolean(link), `${route} carries a directions link`, link ? link.slice(0, 60) : 'none');
    check(
      Boolean(link && link.includes('destination=')),
      `${route} directions name a destination`,
    );
    check(
      Boolean(link && /Pratap|Pannadhay/i.test(decodeURIComponent(link))),
      `${route} destination is the institute address, not a placeholder`,
    );
  }

  // And no map, because no point has been verified.
  const contact = await publicHtml('/contact');
  check(!contact.includes('Show the map'), 'no map panel is offered without coordinates');
  check(!contact.includes('<iframe'), 'and no iframe is present');
  check(
    !contact.includes('GeoCoordinates'),
    'structured data claims no geo point either',
  );
}

/* ================================= 2. ADMIN -> PUBLIC, THE WHOLE CHAIN ==== */

section('2. A TEACHER ENTERS COORDINATES AND THE MAP APPEARS');
{
  const fields = await contactForm();
  fields[KEY] = POINT;
  const res = await postAction(EDITOR, fields, { cookie: adminCookie });
  check(res.status < 400 || res.status === 303, 'the save was accepted', `status ${res.status}`);

  const stored = await storedValue();
  check(stored === POINT, 'the value reached the database', String(stored));
  check(
    parseCoordinates(stored ?? '') !== null,
    'and it parses back to a coordinate pair',
  );

  /*
    ANONYMOUS. Not a fetch inside the authenticated admin session — that would
    prove the admin can see its own write, which is not the question.
  */
  const seen = await waitForPublic('/contact', (h) => h.includes('Show the map'));
  check(seen.ok, 'a logged-out visitor now sees the map panel', `after ${seen.attempt} request(s)`);
  check(
    !seen.html.includes('<iframe'),
    'and it is still a PLACEHOLDER — no iframe until they click',
  );

  // The directions link switched from the address to the verified point.
  const link = (seen.html.match(/https:\/\/www\.google\.com\/maps\/dir\/\?api=1[^"']*/) ?? [])[0];
  check(
    Boolean(link && decodeURIComponent(link).includes(POINT)),
    'directions now aim at the verified point rather than the address',
    link ? decodeURIComponent(link).slice(0, 70) : 'none',
  );

  // Structured data must agree with the page. NAP drift is the failure here.
  check(
    seen.html.includes('GeoCoordinates'),
    'structured data now carries a geo point',
  );
  check(
    seen.html.includes('26.849123') && seen.html.includes('75.805456'),
    'and it is the SAME point the page shows, not a config value',
  );
}

/* ============ 2b. THE OTHER TWO CONTACT FACTS THE JSON-LD FORGOT ========== */

section('2b. AN EDITED EMAIL AND SOCIAL LINK REACH THE STRUCTURED DATA');
{
  /*
    =========================================================================
    WHY THIS SECTION EXISTS
    =========================================================================
    Section 2 above proves an edited COORDINATE reaches the JSON-LD. It was
    written in Topic 10 because `geo` had been reading `institute.coordinates`
    while the address came from the admin, and NAP drift on a local listing is
    expensive.

    Phase 19 asked the obvious follow-up — which OTHER contact facts are
    editable — and found two more with the same defect, neither of them tested:

      `email`   `instituteJsonLd` read `institute.email`, pinned to null in
                config since Phase 3. `JsonLdContact` had no email field at all.

      `sameAs`  `instituteJsonLd` had read a RESOLVED `social` since Topic 12,
                with a comment explaining exactly why it must. Nothing ever
                passed one. The only caller — the site layout — supplied
                `coordinates` and stopped there, so it fell through to the
                config constants, both null, and `sameAs` was never emitted
                however many channels the institute added.

    The second is the more instructive: the fix existed, was documented, and
    was dead code because its only caller was never updated. A function is not
    fixed until something feeds it.

    Reproduced against a live page before fixing: the footer rendered
    `zzqa-office@example.invalid` and a YouTube link, and the JSON-LD had
    neither an `email` key nor a `sameAs` array.
  */
  const EMAIL_KEY = 'contact.email';
  const SOCIAL_KEY = 'social.youtube';
  const EMAIL = 'zzmap-office@example.invalid';
  const CHANNEL = 'https://www.youtube.com/@zzmapchannel';

  const emailBefore = await prisma.siteSetting.findUnique({ where: { key: EMAIL_KEY } });
  const socialBefore = await prisma.siteSetting.findUnique({ where: { key: SOCIAL_KEY } });

  const org = (html) => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const [, raw] of blocks) {
      try {
        const parsed = JSON.parse(raw);
        const graph = parsed['@graph'] ?? [parsed];
        const node = graph.find((n) => n['@type'] === 'EducationalOrganization');
        if (node) return node;
      } catch {
        /* a block that is not ours */
      }
    }
    return null;
  };

  /* --- CONTROL: with nothing stored, neither key is claimed -------------- */
  await prisma.siteSetting.deleteMany({ where: { key: { in: [EMAIL_KEY, SOCIAL_KEY] } } });
  const blank = await waitForPublic('/about', () => true, 1);
  const blankOrg = org(blank.html);
  check(Boolean(blankOrg), 'control: the organisation node is in the page to begin with');
  check(blankOrg?.email === undefined, 'control: with no email stored, none is claimed', String(blankOrg?.email));
  check(blankOrg?.sameAs === undefined, 'control: with no channel stored, sameAs is absent', JSON.stringify(blankOrg?.sameAs));

  /* --- save both through the real single-field editor -------------------- */
  const emailFields = await fieldForm(EMAIL_KEY);
  emailFields[EMAIL_KEY] = EMAIL;
  const r1 = await postAction(EDITOR, emailFields, { cookie: adminCookie });
  check(r1.status < 400 || r1.status === 303, 'the email save was accepted', `status ${r1.status}`);

  const socialFields = await fieldForm(SOCIAL_KEY);
  socialFields[SOCIAL_KEY] = CHANNEL;
  const r2 = await postAction(EDITOR, socialFields, { cookie: adminCookie });
  check(r2.status < 400 || r2.status === 303, 'the channel save was accepted', `status ${r2.status}`);

  check(
    (await prisma.siteSetting.findUnique({ where: { key: EMAIL_KEY } }))?.value === EMAIL,
    'the email reached the database',
  );
  check(
    (await prisma.siteSetting.findUnique({ where: { key: SOCIAL_KEY } }))?.value === CHANNEL,
    'the channel reached the database',
  );

  /* --- and out to an ANONYMOUS visitor ----------------------------------- */
  const seen = await waitForPublic('/about', (h) => h.includes(EMAIL));
  check(seen.ok, 'a logged-out visitor sees the email on the page', `after ${seen.attempt} request(s)`);
  const orgNode = org(seen.html);

  check(orgNode?.email === EMAIL, 'AND THE STRUCTURED DATA CARRIES THE SAME EMAIL', String(orgNode?.email));
  check(
    Array.isArray(orgNode?.sameAs) && orgNode.sameAs.includes(CHANNEL),
    'AND sameAs CARRIES THE CHANNEL THE FOOTER LINKS TO',
    JSON.stringify(orgNode?.sameAs),
  );
  check(
    seen.html.includes(CHANNEL),
    'control: the page itself really is linking that channel, so the two agree',
  );

  /* --- teardown, through the editor so the cached pages are correct ------ */
  const clearEmail = await fieldForm(EMAIL_KEY);
  clearEmail[EMAIL_KEY] = '';
  await postAction(EDITOR, clearEmail, { cookie: adminCookie });
  const clearSocial = await fieldForm(SOCIAL_KEY);
  clearSocial[SOCIAL_KEY] = '';
  await postAction(EDITOR, clearSocial, { cookie: adminCookie });

  const after = await waitForPublic('/about', (h) => !h.includes(EMAIL));
  check(after.ok, 'teardown: clearing them takes both off the page');
  const afterOrg = org(after.html);
  check(afterOrg?.email === undefined, 'teardown: and out of the structured data', String(afterOrg?.email));

  // Put back exactly what was there, row for row.
  await prisma.siteSetting.deleteMany({ where: { key: { in: [EMAIL_KEY, SOCIAL_KEY] } } });
  for (const row of [emailBefore, socialBefore]) {
    if (row) {
      await prisma.siteSetting.create({
        data: { key: row.key, value: row.value, updatedBy: row.updatedBy },
      });
    }
  }
  check(
    (await prisma.siteSetting.findUnique({ where: { key: EMAIL_KEY } }))?.value === (emailBefore?.value ?? undefined) ||
      (emailBefore === null && (await prisma.siteSetting.findUnique({ where: { key: EMAIL_KEY } })) === null),
    'teardown: the settings table is back as it was',
  );
}

/* ====================================== 3. VALIDATION AT THE BOUNDARY ===== */

section('3. ONLY TWO NUMBERS SURVIVE THE MUTATION BOUNDARY');
{
  /*
    The parser is unit-tested exhaustively in tests/location.test.ts. What THIS
    proves is different and cannot be proved by a unit test: that the validator
    is actually wired into the endpoint a teacher reaches, that nothing else in
    the action bypasses it, and that a refused value does not reach the row.
  */
  const HOSTILE = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'http://evil.example',
    'https://evil.example',
    'https://google.com.evil.example/maps?q=26.8,75.8',
    'https://evil.example@www.google.com/maps',
    'https://www.google.com@evil.example/maps',
    '//www.google.com/maps?q=26.8,75.8',
    'https://xn--goog-8va.com/maps',
    '<iframe src="https://evil.example"></iframe>',
    '<script>window.__zzmap_xss=1</script>',
    '<img src=x onerror="window.__zzmap_xss=1">',
    '<svg onload="window.__zzmap_xss=1">',
    '"><iframe src="//evil.example">',
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '169.254.169.254',
    'http://169.254.169.254/latest/meta-data/',
    '[::1]',
    '10.0.0.1',
    '192.168.1.1',
    '91,75',
    '26.8,181',
    '-91,0',
    'abc,def',
    '26.8',
    '26.8,75.8,20',
    '%32%36%2E%38%2C%37%35%2E%38',
    'x'.repeat(5000),
  ];

  for (const hostile of HOSTILE) {
    const fields = await contactForm();
    fields[KEY] = hostile;
    await postAction(EDITOR, fields, { cookie: adminCookie });
    const now = await storedValue();
    check(
      now === POINT,
      `refused: ${hostile.slice(0, 46)}`,
      now === POINT ? '' : `STORED ${String(now).slice(0, 40)}`,
    );
    if (now !== POINT) {
      // Put the good value back so later assertions stay meaningful.
      const repair = await contactForm();
      repair[KEY] = POINT;
      await postAction(EDITOR, repair, { cookie: adminCookie });
    }
  }

  // POSITIVE CONTROL: a different legitimate point IS accepted through the
  // same path, so the refusals above are not "the endpoint refuses everything".
  {
    const other = '19.076,72.8777';
    const fields = await contactForm();
    fields[KEY] = other;
    await postAction(EDITOR, fields, { cookie: adminCookie });
    check((await storedValue()) === other, 'control: a different valid point IS accepted');

    const back = await contactForm();
    back[KEY] = POINT;
    await postAction(EDITOR, back, { cookie: adminCookie });
    check((await storedValue()) === POINT, 'and restored for the checks below');
  }

  // Nothing hostile ever rendered.
  const html = await publicHtml('/contact');
  check(!html.includes('evil.example'), 'no hostile host reached the public page');
  check(!html.includes('__zzmap_xss'), 'no script payload reached the public page');
  await page.goto(`${BASE}/contact`);
  await new Promise((r) => setTimeout(r, 700));
  check(
    (await page.eval('String(window.__zzmap_xss === 1)')) === 'false',
    'and nothing executed in a real browser',
  );
}

section('3b. AN UNREGISTERED KEY CANNOT BE INVENTED');
{
  const before = await prisma.siteSetting.count();

  // (a) Extra keys smuggled alongside a legitimate single-key save.
  {
    const fields = await contactForm();
    fields[KEY] = POINT;
    fields['contact.mapsUrl'] = 'https://evil.example/maps';
    fields['contact.placeId'] = 'ChIJevil';
    fields['zzmap.unregistered'] = 'nope';
    await postAction(EDITOR, fields, { cookie: adminCookie });
  }

  // (b) `only` itself naming a key that is not in the registry.
  for (const rogueKey of ['contact.mapsUrl', 'zzmap.unregistered', 'home.heroEyebrow']) {
    const fields = await contactForm();
    fields.only = rogueKey;
    fields[rogueKey] = 'https://evil.example/maps';
    const res = await postAction(EDITOR, fields, { cookie: adminCookie });
    check(res.status < 500, `only=${rogueKey} is handled, not crashed`, `status ${res.status}`);
  }

  const rogue = await prisma.siteSetting.findMany({
    where: { key: { in: ['contact.mapsUrl', 'contact.placeId', 'zzmap.unregistered'] } },
    select: { key: true },
  });
  check(rogue.length === 0, 'unregistered keys were not written', rogue.map((r) => r.key).join(', '));
  check(
    (await prisma.siteSetting.count()) === before,
    'and the settings row count is unchanged',
    `${before} -> ${await prisma.siteSetting.count()}`,
  );
  check(
    (await storedValue()) === POINT,
    'the legitimate value alongside them is untouched',
    String(await storedValue()),
  );
}

/* ============================================ 4. NO IFRAME UNTIL A CLICK == */

section('4. THE MAP IS NOT LOADED UNTIL A VISITOR ASKS');
{
  /*
    ⚠ MEASURED WITH CDP, NOT WITH `performance.getEntriesByType`.

    The performance API reports resources of the TOP document. A cross-origin
    iframe's own navigation is not one of them, so the first version of this
    section measured 22 requests before the click and 22 after — while an iframe
    pointing at google.com was demonstrably sitting in the DOM. It would have
    reported "Google is never contacted", which is the most flattering possible
    wrong answer.

    `page.requests` is fed by `Network.requestWillBeSent`, which the browser
    emits for every request it makes, iframe navigations included.
  */
  const thirdPartyHosts = () => {
    const hosts = new Set();
    for (const r of page.requests) {
      try {
        const { hostname } = new URL(r.url);
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') hosts.add(hostname);
      } catch {
        /* data: and blob: URLs are not third-party contact. */
      }
    }
    return [...hosts];
  };

  await page.viewport(390, 844, { mobile: true });
  page.requests.length = 0;
  await page.goto(`${BASE}/contact`);
  await new Promise((r) => setTimeout(r, 2500));

  const beforeHosts = thirdPartyHosts();
  const beforeCount = page.requests.length;
  const initial = JSON.parse(
    await page.eval(`(() => JSON.stringify({
      iframes: document.querySelectorAll('iframe').length,
      buttons: document.querySelectorAll('button').length,
    }))()`),
  );

  check(initial.iframes === 0, 'NO iframe is present on initial load', `${initial.iframes}`);
  check(
    beforeHosts.length === 0,
    'and the browser contacts NO third-party host before the click',
    beforeHosts.join(', ') || 'zero third-party hosts',
  );
  console.log(`  measured: ${beforeCount} requests on load, all same-origin`);

  const clicked = await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Show the map/i.test(b.textContent || ''));
    if (!btn) return 'none';
    btn.click();
    return 'clicked';
  })()`);
  check(clicked === 'clicked', 'control: the placeholder was actually pressed');
  await new Promise((r) => setTimeout(r, 4000));

  const afterHosts = thirdPartyHosts();
  const afterCount = page.requests.length;
  const after = JSON.parse(
    await page.eval(`(() => {
      const frames = [...document.querySelectorAll('iframe')];
      return JSON.stringify({
        iframes: frames.length,
        srcs: frames.map((f) => f.src),
        titles: frames.map((f) => f.getAttribute('title') || ''),
        allows: frames.map((f) => f.getAttribute('allow')),
      });
    })()`),
  );
  after.thirdParty = afterHosts;
  after.requests = afterCount;

  check(after.iframes === 1, 'exactly one iframe is created', `${after.iframes}`);
  check(
    after.srcs.every((s) => s.startsWith('https://www.google.com/maps')),
    'and its src is the URL we built on www.google.com',
    after.srcs[0],
  );
  check(
    after.srcs.every((s) => s.includes('output=embed') && !/[?&]key=/.test(s)),
    'the keyless embed form, with no API key',
  );
  check(after.titles.every((t) => t.length > 0), 'the iframe has an accessible name', after.titles[0]);
  check(
    after.allows.every((a) => a === null),
    'and grants no permissions at all',
    String(after.allows[0]),
  );
  check(
    after.thirdParty.some((h) => h.endsWith('google.com')),
    'Google is contacted only now',
    after.thirdParty.join(', ') || 'no third-party host recorded',
  );
  check(
    after.thirdParty.every((h) => h.endsWith('google.com') || h.endsWith('gstatic.com')),
    'and nothing beyond Google is contacted',
    after.thirdParty.join(', '),
  );
  console.log(
    `  measured: ${beforeCount} requests before the click, ${afterCount} after ` +
      `(+${afterCount - beforeCount}), third-party hosts: ${after.thirdParty.join(', ') || 'none'}`,
  );
}

/* ================================================= 5. CSP IS ENFORCED ===== */

section('5. THE CSP STILL REFUSES EVERYTHING ELSE');
{
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/contact`);
  await new Promise((r) => setTimeout(r, 700));

  /*
    Detected by `securitypolicyviolation`, not by `onload`. A CSP-blocked frame
    STILL fires onload on the empty document the browser substitutes, which is
    how the Topic 9 suite first concluded a working policy was unenforced.
  */
  const verdict = await page.eval(`(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      violations.push(e.blockedURI + ' :: ' + e.violatedDirective);
    });
    function add(src) {
      return new Promise((resolve) => {
        const f = document.createElement('iframe');
        f.style.display = 'none';
        f.src = src;
        document.body.appendChild(f);
        setTimeout(resolve, 1200);
      });
    }
    await add('https://example.com/');
    await add('https://maps.google.com/maps?q=1,1&output=embed');
    await add('https://www.google.com/maps?q=1,1&output=embed');
    await add('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    return JSON.stringify({ violations });
  })()`, true);

  const csp = JSON.parse(verdict);
  const blocked = csp.violations.join(' | ');
  check(
    csp.violations.some((v) => v.includes('example.com')),
    'an unlisted origin is still blocked',
    blocked,
  );
  check(
    csp.violations.some((v) => v.includes('maps.google.com')),
    'maps.google.com is blocked — the embed deliberately uses www.google.com instead',
    blocked,
  );
  check(
    !csp.violations.some((v) => v.includes('www.google.com/maps') || v === 'https://www.google.com :: frame-src'),
    'control: www.google.com is NOT blocked, so the policy is not refusing everything',
    blocked,
  );
  check(
    !csp.violations.some((v) => v.includes('youtube-nocookie')),
    'and Topic 9 video embedding still works',
    blocked,
  );

  const policy = (await fetch(`${BASE}/contact`)).headers.get('content-security-policy') ?? '';
  const frameSrc = (policy.match(/frame-src ([^;]*)/) ?? ['', ''])[1].trim();
  check(frameSrc.includes('https://www.google.com'), 'frame-src names www.google.com', frameSrc);
  check(!/frame-src[^;]*\*/.test(policy), 'frame-src contains no wildcard');
  check(!/frame-src[^;]*\bhttps:(\s|;|$)/.test(policy), 'and no blanket https: source');
  check(
    !policy.includes('googleapis.com') && !policy.includes('*.google'),
    'no googleapis or wildcard google origin was added',
  );
}

/* ===================================================== 6. STALE EDIT ====== */

section('6. A STALE EDITOR CANNOT OVERWRITE A NEWER CHANGE');
{
  // Tab A reads the form, so it holds the current token.
  const tabA = await contactForm();

  // Tab B changes the value underneath it.
  const tabB = await contactForm();
  tabB[KEY] = '19.076,72.8777';
  await postAction(EDITOR, tabB, { cookie: adminCookie });
  check((await storedValue()) === '19.076,72.8777', "control: tab B's change landed");

  // Tab A now saves its older view.
  tabA[KEY] = '11.111,22.222';
  await postAction(EDITOR, tabA, { cookie: adminCookie });

  const after = await storedValue();
  check(
    after !== '11.111,22.222',
    'the stale save did NOT overwrite the newer value',
    String(after),
  );
  check(after === '19.076,72.8777', "and tab B's change survived", String(after));

  // Restore.
  const repair = await contactForm();
  repair[KEY] = POINT;
  await postAction(EDITOR, repair, { cookie: adminCookie });
  check((await storedValue()) === POINT, 'restored for the checks below');
}

/* ========================================= 7. AUTHORISATION AND CSRF ====== */

section('7. AUTHORISATION AND CSRF');
{
  const before = await storedValue();

  // (a) No cookie at all — the proxy refuses at the edge.
  const anon = await postAction(EDITOR, { ...(await contactForm()), [KEY]: '1,1' });
  check(
    anon.status === 307 || anon.status === 302,
    'an anonymous save is redirected at the edge',
    `status ${anon.status}`,
  );
  check((await storedValue()) === before, 'and the value is unchanged');

  // (b) A cookie that exists but is forged — this gets past the proxy.
  const forged = await postAction(
    '/admin/website',
    { ...(await contactForm()), [KEY]: '2,2' },
    { cookie: 'ci_admin_session=forged.value.here' },
  );
  check(forged.status < 500, 'a forged session reaches the action and is handled', `status ${forged.status}`);
  check((await storedValue()) === before, 'and the action refuses it — value unchanged');

  // (c) Real session, foreign origin.
  const csrf = await postAction(
    '/admin/website',
    { ...(await contactForm()), [KEY]: '3,3' },
    { cookie: adminCookie, origin: 'https://attacker.example' },
  );
  check(csrf.status >= 400, 'a cross-origin save is refused outright', `status ${csrf.status}`);
  check((await storedValue()) === before, 'and the value is unchanged');

  // (d) Anonymous read of the editor.
  const read = await fetch(`${BASE}/admin/website`, { redirect: 'manual' });
  await read.text().catch(() => '');
  check(
    read.status === 307 || read.status === 302,
    'an anonymous GET of the editor is redirected',
    `status ${read.status}`,
  );
}

/* ================================== 8. CLEARING THE VALUE HIDES THE MAP === */

section('8. CLEARING THE POINT TAKES THE MAP DOWN');
{
  const fields = await contactForm();
  fields[KEY] = '';
  await postAction(EDITOR, fields, { cookie: adminCookie });

  const stored = await storedValue();
  check(stored === '' || stored === null, 'the value is cleared', String(stored));

  const gone = await waitForPublic('/contact', (h) => !h.includes('Show the map'));
  check(gone.ok, 'the map panel is gone from the public page', `after ${gone.attempt} request(s)`);
  check(!gone.html.includes('<iframe'), 'and no iframe remains');
  check(
    !gone.html.includes('GeoCoordinates'),
    'structured data stops claiming a geo point',
  );

  // The directions link survives — it never depended on coordinates.
  const link = (gone.html.match(/https:\/\/www\.google\.com\/maps\/dir\/\?api=1[^"']*/) ?? [])[0];
  check(Boolean(link), 'the directions link still works without coordinates');
  check(
    Boolean(link && /Pratap|Pannadhay/i.test(decodeURIComponent(link))),
    'and falls back to the address',
  );

  // Put the point back for the layout checks.
  const restore = await contactForm();
  restore[KEY] = POINT;
  await postAction(EDITOR, restore, { cookie: adminCookie });
  await waitForPublic('/contact', (h) => h.includes('Show the map'));
}

/* ======================================== 9. ACCESSIBLE AND RESPONSIVE ==== */

section('9. ACCESSIBLE AND RESPONSIVE');
{
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/contact`);
  await new Promise((r) => setTimeout(r, 900));

  const a11y = JSON.parse(
    await page.eval(`(() => {
      const trigger = [...document.querySelectorAll('button')].find((b) => /Show the map/i.test(b.textContent || ''));
      const external = [...document.querySelectorAll('main a[target="_blank"]')];
      const headings = [...document.querySelectorAll('h1, h2, h3, h4')].map((h) => Number(h.tagName[1]));
      let jump = false;
      for (let i = 1; i < headings.length; i += 1) if (headings[i] - headings[i - 1] > 1) jump = true;
      const dir = [...document.querySelectorAll('a')].find((a) => /maps\\/dir/.test(a.href));
      return JSON.stringify({
        hasTrigger: Boolean(trigger),
        triggerName: trigger ? (trigger.textContent || '').trim().slice(0, 40) : '',
        triggerFocusable: trigger ? trigger.tabIndex >= 0 : false,
        decorativeHidden: trigger
          ? [...trigger.querySelectorAll('span')].filter((s) => s.querySelector('svg') && s.getAttribute('aria-hidden') !== 'true').length
          : -1,
        h1: document.querySelectorAll('h1').length,
        jump,
        divButtons: document.querySelectorAll('div[onclick], span[onclick]').length,
        positiveTabindex: [...document.querySelectorAll('[tabindex]')].map((e) => Number(e.getAttribute('tabindex'))).filter((n) => n > 0).length,
        externalSafe: external.length > 0 && external.every((a) => (a.getAttribute('rel') || '').includes('noopener')),
        directionsName: dir ? (dir.textContent || '').trim() : '',
        addressIsSemantic: document.querySelectorAll('address').length > 0,
      });
    })()`),
  );

  check(a11y.hasTrigger, 'control: the map trigger is on the page');
  check(/Show the map/i.test(a11y.triggerName), 'it says what it does', a11y.triggerName);
  check(a11y.triggerFocusable, 'and it can take keyboard focus');
  check(a11y.decorativeHidden === 0, 'its decorative pin is hidden from assistive tech');
  check(a11y.h1 === 1, 'the page has exactly one h1', String(a11y.h1));
  check(!a11y.jump, 'heading levels do not skip a level');
  check(a11y.divButtons === 0, 'no div is being used as a button');
  check(a11y.positiveTabindex === 0, 'no positive tabindex rewrites the focus order');
  check(a11y.externalSafe, 'every external link carries rel=noopener');
  check(/directions/i.test(a11y.directionsName), 'the directions link is named', a11y.directionsName);
  check(a11y.addressIsSemantic, 'the address is in an <address> element');

  // Keyboard: focus the trigger and activate it without a mouse.
  const keyboard = await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Show the map/i.test(b.textContent || ''));
    btn.focus();
    const focused = document.activeElement === btn;
    btn.click();
    return String(focused);
  })()`);
  check(keyboard === 'true', 'the trigger is reachable and activable by keyboard');
  await new Promise((r) => setTimeout(r, 2500));
  check(
    (await page.eval(`String(document.querySelectorAll('iframe').length)`)) === '1',
    'and activating it loads the map',
  );

  // Responsive, including the OPEN state.
  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1440]) {
    await page.viewport(width, 800, { mobile: width < 640 });
    for (const route of ['/contact', '/']) {
      await page.goto(BASE + route);
      const box = JSON.parse(
        await page.eval(`(() => JSON.stringify({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }))()`),
      );
      check(
        box.scroll <= box.client,
        `${width}px ${route} does not scroll sideways`,
        `${box.scroll} > ${box.client}`,
      );
    }
  }

  await page.viewport(320, 800, { mobile: true });
  await page.goto(`${BASE}/contact`);
  await new Promise((r) => setTimeout(r, 800));
  await page.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Show the map/i.test(x.textContent || ''));
    if (b) b.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 2500));
  const openBox = JSON.parse(
    await page.eval(`(() => {
      const f = document.querySelector('iframe');
      const r = f ? f.getBoundingClientRect() : null;
      return JSON.stringify({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        right: r ? Math.round(r.right) : 0,
        width: r ? Math.round(r.width) : 0,
        viewport: window.innerWidth,
      });
    })()`),
  );
  check(
    openBox.scroll <= openBox.client,
    '320px an open map does not widen the page',
    `${openBox.scroll} > ${openBox.client}`,
  );
  check(
    openBox.width > 0 && openBox.right <= openBox.viewport + 1,
    'and the iframe stays inside the viewport',
    `right ${openBox.right} vs ${openBox.viewport}`,
  );

  // Touch targets.
  await page.goto(`${BASE}/contact`);
  const small = JSON.parse(
    await page.eval(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('a[href], button:not([disabled])')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const s = getComputedStyle(el);
        if (s.clipPath === 'inset(50%)' || (r.width <= 1 && r.height <= 1)) continue;
        if (el.closest('p, li') && s.display === 'inline') continue;
        if (r.width < 24 || r.height < 24) out.push(el.tagName.toLowerCase() + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      }
      return JSON.stringify(out.slice(0, 5));
    })()`),
  );
  check(small.length === 0, '320px /contact touch targets meet 24x24', small.join(' | '));
}

/* ================================================================ CLEANUP = */

section('10. CLEANUP');
{
  await prisma.siteSetting.deleteMany({ where: { key: KEY } });
  if (originalValue !== null) {
    await prisma.siteSetting.upsert({
      where: { key: KEY },
      update: { value: originalValue, updatedBy: originalAuthor },
      create: { key: KEY, value: originalValue, updatedBy: originalAuthor },
    });
  }
  const finalValue = await storedValue();
  check(
    finalValue === originalValue,
    'the settings table was restored to how the suite found it',
    `${String(originalValue)} -> ${String(finalValue)}`,
  );

  /*
    THE FIELD THIS SUITE NEVER TOUCHED MUST BE UNTOUCHED.

    The first version posted whole-group payloads built from `<input>` elements
    only, which would have written "" over `contact.hours` — a textarea — on
    every save. This asserts the damage did not happen rather than assuming the
    `only` path worked.
  */
  check(
    hoursAtStart === (await hoursValue()),
    'contact.hours was not collaterally blanked',
    `${JSON.stringify(hoursAtStart)} -> ${JSON.stringify(await hoursValue())}`,
  );

  await page.close();
  await browser.close();
  await prisma.$disconnect();
}

console.log('\n========================================================');
console.log(`MAP / LOCATION VERIFICATION: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('========================================================');

exit(fail === 0 ? 0 : 1);
