/**
 * Faculty management, attacked.
 *
 * =============================================================================
 * SECTION 0 IS NOT CEREMONY
 * =============================================================================
 * Every "the attack was refused" assertion below is only meaningful because
 * section 0 proves the suite can WRITE. Phase 16 has already produced two
 * suites whose negative checks passed because nothing was ever being written —
 * once from reading an httpOnly cookie through `document.cookie`, once from a
 * helper that read the previous result. Both looked green.
 *
 * So: a control record is created first and its existence asserted from the
 * DATABASE, not from a status code. Every refusal check afterwards compares
 * database state before and after.
 *
 * Usage:
 *   DATABASE_URL=... ADMIN_PASSWORD=... BASE_URL=http://localhost:3000 \
 *     node scripts/verify-faculty.mjs
 */

import { env, exit } from 'node:process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { launch } from './browser.mjs';
import { facultyInitials } from '../src/lib/faculty-display.ts';

const BASE = env.BASE_URL ?? 'http://localhost:3170';
const EMAIL = env.ADMIN_EMAIL ?? 'admin@localhost.invalid';
const PASSWORD = env.ADMIN_PASSWORD ?? '';

/** Unmistakably synthetic, and the only rows this suite ever touches. */
const P = 'ZZFAC';

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
  console.error('DATABASE_URL is not set. This suite reads the faculty table directly.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/** Anonymous fetch — no admin cookie, the way a visitor arrives. */
async function publicHtml(pathname) {
  const res = await fetch(BASE + pathname, { headers: { 'cache-control': 'no-cache' } });
  return res.text();
}

/**
 * Poll a public page until it carries `needle`, reporting how many requests.
 *
 * `revalidatePath` marks an ISR page stale; it does not rebuild it inline, so
 * the first anonymous request after a save can still be served the previous
 * render. Asserting on one request measures that race; asserting with no bound
 * would hide a genuinely broken revalidation. A small bound, and the count is
 * printed so a regression stays visible.
 */
async function waitForPublic(pathname, needle, tries = 6) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const html = await publicHtml(pathname);
    if (html.includes(needle)) return { found: true, attempt, html };
    if (attempt < tries) await new Promise((r) => setTimeout(r, 250));
  }
  return { found: false, attempt: tries, html: await publicHtml(pathname) };
}

const countFaculty = () => prisma.faculty.count({ where: { name: { startsWith: P } } });

/* ---------------------------------------------------------- start clean -- */

await prisma.faculty.deleteMany({ where: { name: { startsWith: P } } });

const dir = await mkdtemp(path.join(tmpdir(), 'zzfac-'));
const photoA = path.join(dir, 'portrait-a.jpg');
const photoB = path.join(dir, 'portrait-b.jpg');
await writeFile(
  photoA,
  await sharp({ create: { width: 300, height: 300, channels: 3, background: '#2a6ff5' } })
    .jpeg()
    .toBuffer(),
);
await writeFile(
  photoB,
  await sharp({ create: { width: 300, height: 300, channels: 3, background: '#f5a02a' } })
    .jpeg()
    .toBuffer(),
);
/** Not an image at all. Used for the failed-replacement test. */
const notAnImage = path.join(dir, 'portrait-c.jpg');
await writeFile(notAnImage, Buffer.from('<html><script>alert(1)</script></html>', 'utf8'));

/* -------------------------------------------------------------- browser -- */

const browser = await launch(env.BROWSER ?? 'chrome');
const page = await browser.page();
await page.viewport(1280, 900);

/** Set a controlled input the way a person would, so React sees the change. */
function setField(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
}

async function fillFaculty({ name, designation, subject = '', bio = '', publish = false }) {
  await page.eval(setField('[name="name"]', name));
  await page.eval(setField('[name="designation"]', designation));
  await page.eval(setField('[name="subject"]', subject));
  await page.eval(setField('[name="bio"]', bio));
  if (publish) {
    await page.eval(`(() => {
      const box = document.querySelector('#f-published');
      if (box && !box.checked) box.click();
      return true;
    })()`);
  }
}

/** Upload through the Topic 5 control and wait for a genuinely new result. */
async function attachPhoto(filePath) {
  const SENTINEL = '__zzfac_awaiting__';
  await page.eval(`(() => {
    for (const input of document.querySelectorAll('input[type=file]')) input.value = '';
    const status = document.querySelector('[role="status"]');
    if (status) status.textContent = ${JSON.stringify(SENTINEL)};
    return true;
  })()`);
  await page.setFileInput('input[type=file]:not([capture])', [filePath]);

  for (let i = 0; i < 60; i += 1) {
    const seen = JSON.parse(
      await page.eval(`(() => {
        const s = document.querySelector('[role="status"]');
        const a = document.querySelector('[role="alert"]');
        return JSON.stringify({
          status: s ? s.textContent.trim() : '',
          alert: a ? a.textContent.trim() : '',
        });
      })()`),
    );
    if (seen.alert) return { ok: false, message: seen.alert };
    if (seen.status && seen.status !== SENTINEL && !/Uploading/i.test(seen.status)) {
      return { ok: true, message: seen.status };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, message: '(timed out)' };
}

const photoValue = () =>
  page.eval(`(document.querySelector('input[type=hidden][name="photoUrl"]') || {}).value || ''`);

/* ====================================================================== */

section('0. THE HARNESS CAN WRITE, SO REFUSALS BELOW MEAN SOMETHING');

await page.goto(`${BASE}/admin/login`);
await page.type('input[type=email]', EMAIL);
await page.type('input[type=password]', PASSWORD);
await page.submitForm('input[type=password]', 4000);
const landed = await page.eval('location.pathname');
check(landed === '/admin', 'signed in', landed);
if (landed !== '/admin') {
  await rm(dir, { recursive: true, force: true });
  await prisma.$disconnect();
  await page.close();
  await browser.close();
  exit(1);
}

const adminCookie = await page.cookieHeader(BASE);
check(
  adminCookie.includes('='),
  'the httpOnly session cookie was captured from the browser jar',
  adminCookie ? 'present' : 'MISSING — replays below would be anonymous',
);

await page.goto(`${BASE}/admin/faculty/new`);
await fillFaculty({
  name: `${P} Control Teacher`,
  designation: 'Senior Faculty',
  subject: 'Accountancy',
  bio: 'Synthetic record used to prove this suite can write.',
  publish: true,
});
await page.submitForm('[name="name"]', 4000);

const control = await prisma.faculty.findFirst({ where: { name: `${P} Control Teacher` } });
check(Boolean(control), 'a faculty record was created');
check(control?.published === true, 'and it was published');
check(control?.designation === 'Senior Faculty', 'with the designation entered');
check(control?.subject === 'Accountancy', 'and the subject entered');
check(
  (await countFaculty()) === 1,
  'exactly one record exists, so a later "count unchanged" assertion is meaningful',
);

section('1. IT REACHES A LOGGED-OUT VISITOR');
{
  const seen = await waitForPublic('/faculty', `${P} Control Teacher`);
  check(seen.found, 'the teacher is on the PUBLIC faculty page', `after ${seen.attempt} request(s)`);
  check(seen.html.includes('Senior Faculty'), 'their role is shown');
  check(seen.html.includes('Accountancy'), 'their subject is shown');

  const home = await waitForPublic('/', `${P} Control Teacher`);
  check(home.found, 'and in the homepage band', `after ${home.attempt} request(s)`);
}

section('2. A HIDDEN TEACHER IS NOT PUBLIC');
{
  await prisma.faculty.create({
    data: {
      name: `${P} Hidden Teacher`,
      designation: 'Draft Role',
      bio: 'Should never be public.',
      published: false,
    },
  });

  const facultyPage = await publicHtml('/faculty');
  const home = await publicHtml('/');
  check(!facultyPage.includes(`${P} Hidden Teacher`), 'a draft teacher is absent from /faculty');
  check(!home.includes(`${P} Hidden Teacher`), 'and from the homepage');
  check(!facultyPage.includes('Draft Role'), 'and so is their role');

  /*
    THE CONTROL. The published teacher IS on the same page, so the absence
    above is the publication gate working rather than the page being empty.
  */
  check(facultyPage.includes(`${P} Control Teacher`), 'while the published teacher IS shown');
}

section('3. UNPUBLISHING AND DELETING REMOVE THEM FROM THE SITE');
{
  const row = await prisma.faculty.findFirst({ where: { name: `${P} Control Teacher` } });
  await page.goto(`${BASE}/admin/faculty/${row.id}`);
  await page.eval(`(() => { const b = document.querySelector('#f-published'); if (b && b.checked) b.click(); return true; })()`);
  await page.submitForm('[name="name"]', 4000);

  const after = await prisma.faculty.findUnique({ where: { id: row.id } });
  check(after?.published === false, 'unpublishing was stored');

  for (let i = 0; i < 6; i += 1) {
    if (!(await publicHtml('/faculty')).includes(`${P} Control Teacher`)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  check(
    !(await publicHtml('/faculty')).includes(`${P} Control Teacher`),
    'an unpublished teacher disappears from the public page',
  );

  // Re-publish for the tests that follow.
  await page.goto(`${BASE}/admin/faculty/${row.id}`);
  await page.eval(`(() => { const b = document.querySelector('#f-published'); if (b && !b.checked) b.click(); return true; })()`);
  await page.submitForm('[name="name"]', 4000);
  check(
    (await waitForPublic('/faculty', `${P} Control Teacher`)).found,
    'and comes back when published again',
  );
}

section('4. THE PHOTO IS GENUINELY OPTIONAL');
{
  /*
    A regression test with history: this project has already shipped a field
    whose help text said "optional" while validation refused it empty.
  */
  await page.goto(`${BASE}/admin/faculty/new`);
  await fillFaculty({ name: `${P} No Photo`, designation: 'Faculty', publish: true });
  check((await photoValue()) === '', 'the photo field starts empty');
  await page.submitForm('[name="name"]', 4000);

  const saved = await prisma.faculty.findFirst({ where: { name: `${P} No Photo` } });
  check(Boolean(saved), 'a teacher with no photograph saves successfully');
  check(saved?.photoUrl === null, 'and stores no photo path', String(saved?.photoUrl));

  const html = await waitForPublic('/faculty', `${P} No Photo`);
  check(html.found, 'and appears on the public page');
  /*
    A teacher with no photograph must render the MONOGRAM, not a broken image
    frame. An earlier version of this check asserted the page contained no
    literal "undefined" anywhere, which is far too crude - Next's streaming RSC
    payload contains that word legitimately - and it failed while the page was
    perfectly correct.
  */
  /*
    Computed, not hardcoded. An earlier version looked for "NP" because the
    record is called "No Photo" - but the monogram takes the FIRST and LAST
    name parts, and the name starts with the ZZFAC prefix, so it is "ZP".
    Hardcoding an expectation is how a test ends up asserting the tester's
    arithmetic rather than the product's behaviour.
  */
  const expectedInitials = facultyInitials(`${P} No Photo`);
  check(
    html.html.includes(`>${expectedInitials}<`),
    'a teacher with no photo renders their initials, not a broken image',
    `expected ${expectedInitials}`,
  );
  check(
    !/<img[^>]+src=""[^>]*>/.test(html.html),
    'and no image tag with an empty source',
  );
}

section('5. PHOTO ATTACH, REPLACE, AND FAILED REPLACEMENT');
{
  const row = await prisma.faculty.findFirst({ where: { name: `${P} No Photo` } });
  await page.goto(`${BASE}/admin/faculty/${row.id}`);

  const first = await attachPhoto(photoA);
  check(first.ok, 'a photo attaches through the Topic 5 control', first.message);
  const pathA = await photoValue();
  check(/^\/media\/[0-9a-f]{32}\.jpg$/.test(pathA), 'it produced a media path', pathA);
  await page.submitForm('[name="name"]', 4000);

  const withPhoto = await prisma.faculty.findUnique({ where: { id: row.id } });
  check(withPhoto?.photoUrl === pathA, 'the record stores it');

  /*
    THE FAILED-REPLACEMENT CASE.

    An invalid file must leave the EXISTING photograph intact. A record briefly
    pointing at nothing, because an upload failed halfway, is a broken image on
    a live page.
  */
  await page.goto(`${BASE}/admin/faculty/${row.id}`);
  const bad = await attachPhoto(notAnImage);
  check(!bad.ok, 'an invalid replacement is refused', bad.message.slice(0, 70));
  check(
    (await photoValue()) === pathA,
    'and the existing photo is still in the form',
    await photoValue(),
  );
  await page.submitForm('[name="name"]', 4000);
  check(
    (await prisma.faculty.findUnique({ where: { id: row.id } }))?.photoUrl === pathA,
    'saving after a failed upload keeps the original photo',
  );

  // A valid replacement does replace it, with a different url.
  await page.goto(`${BASE}/admin/faculty/${row.id}`);
  const second = await attachPhoto(photoB);
  check(second.ok, 'a valid replacement is accepted', second.message);
  const pathB = await photoValue();
  check(pathB !== pathA, 'a different photo gives a different url', `${pathA} -> ${pathB}`);
  await page.submitForm('[name="name"]', 4000);
  check(
    (await prisma.faculty.findUnique({ where: { id: row.id } }))?.photoUrl === pathB,
    'the record now points at the new photo',
  );

  const seen = await waitForPublic('/faculty', pathB.replace('/media/', ''));
  check(seen.found, 'and the public page serves the new photo', `after ${seen.attempt} request(s)`);

  // Removing the photo must be possible and must not delete the file.
  await page.goto(`${BASE}/admin/faculty/${row.id}`);
  await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove');
    if (btn) btn.click();
    return true;
  })()`);
  check((await photoValue()) === '', 'Remove clears the photo from the form');
  await page.submitForm('[name="name"]', 4000);
  check(
    (await prisma.faculty.findUnique({ where: { id: row.id } }))?.photoUrl === null,
    'and the record stores no photo',
  );
  const stillServed = await fetch(BASE + pathB);
  check(
    stillServed.status === 200,
    'the FILE still exists — removing it from a record does not destroy shared bytes',
    `status ${stillServed.status}`,
  );
}

section('6. VALIDATION');
{
  const before = await countFaculty();

  // Empty name.
  await page.goto(`${BASE}/admin/faculty/new`);
  await fillFaculty({ name: '   ', designation: 'Faculty' });
  await page.submitForm('[name="name"]', 3000);
  check(
    /Enter the teacher/i.test(await page.eval('document.body.innerText')),
    'a blank name is refused with a plain message',
  );
  check((await countFaculty()) === before, 'and nothing was stored');

  // Empty designation.
  await page.goto(`${BASE}/admin/faculty/new`);
  await fillFaculty({ name: `${P} Roleless`, designation: '' });
  await page.submitForm('[name="name"]', 3000);
  check(
    /Enter their role/i.test(await page.eval('document.body.innerText')),
    'a blank role is refused',
  );
  check((await countFaculty()) === before, 'and nothing was stored');

  // Over-long input is truncated to the column width, never rejected by Postgres.
  await page.goto(`${BASE}/admin/faculty/new`);
  await fillFaculty({
    name: `${P} Long ` + 'x'.repeat(400),
    designation: 'y'.repeat(400),
    bio: 'z'.repeat(2000),
    publish: false,
  });
  await page.submitForm('[name="name"]', 4000);
  const long = await prisma.faculty.findFirst({ where: { name: { startsWith: `${P} Long` } } });
  check(Boolean(long), 'over-long input is truncated and saved, not rejected with a database error');
  if (long) {
    check(long.name.length <= 120, 'name truncated to the column width', String(long.name.length));
    check(long.designation.length <= 120, 'designation truncated', String(long.designation.length));
    check((long.bio ?? '').length <= 600, 'bio truncated', String((long.bio ?? '').length));
    await prisma.faculty.delete({ where: { id: long.id } });
  }
}

section('7. XSS IS RENDERED AS TEXT, NOT EXECUTED');
{
  const payloadName = `${P} <script>window.__zzfacPwned=1</script>`;
  const payloadBio = '<img src=x onerror="window.__zzfacPwned=1"> <a href="javascript:alert(1)">x</a>';

  await page.goto(`${BASE}/admin/faculty/new`);
  await fillFaculty({
    name: payloadName,
    designation: '<b>Director</b>',
    bio: payloadBio,
    publish: true,
  });
  await page.submitForm('[name="name"]', 4000);

  const stored = await prisma.faculty.findFirst({ where: { name: { contains: 'script' } } });
  check(Boolean(stored), 'the payload was stored as text');

  const html = await waitForPublic('/faculty', '&lt;script&gt;');
  check(html.found, 'the payload appears ESCAPED in the public HTML');
  check(
    !html.html.includes('<script>window.__zzfacPwned'),
    'and never as live markup',
  );
  /*
    The escaped payload legitimately CONTAINS the characters "onerror=" as
    text - that is what escaping looks like. The claim worth testing is that
    there is no LIVE img tag carrying it, so the check looks for an unescaped
    tag rather than for a substring.
  */
  check(
    !/<img[^>]*onerror/i.test(html.html),
    'there is no live img tag carrying the handler',
  );
  check(html.html.includes('&lt;img'), 'the img payload is present, escaped, as text');

  await page.goto(`${BASE}/faculty`);
  check(
    (await page.eval('Boolean(window.__zzfacPwned)')) === false,
    'nothing executed in a real browser on the public page',
  );

  await page.goto(`${BASE}/admin/faculty`);
  check(
    (await page.eval('Boolean(window.__zzfacPwned)')) === false,
    'and nothing executed in the admin list either',
  );

  if (stored) await prisma.faculty.delete({ where: { id: stored.id } });
}

section('8. STALE EDIT');
{
  const row = await prisma.faculty.findFirst({ where: { name: `${P} Control Teacher` } });

  // Tab A loads the form and keeps its token.
  await page.goto(`${BASE}/admin/faculty/${row.id}`);
  const staleToken = await page.eval(
    `(document.querySelector('input[name="editedAt"]') || {}).value || ''`,
  );
  check(staleToken.length > 0, 'the edit form carries a version token');

  // Tab B changes the bio.
  await prisma.faculty.update({
    where: { id: row.id },
    data: { bio: 'Changed by the other tab.' },
  });

  // Tab A changes only the designation and saves.
  await page.eval(setField('[name="designation"]', 'Changed By Stale Tab'));
  await page.submitForm('[name="name"]', 4000);

  const after = await prisma.faculty.findUnique({ where: { id: row.id } });
  check(
    after?.designation !== 'Changed By Stale Tab',
    'the stale save did NOT overwrite the newer change',
    String(after?.designation),
  );
  check(after?.bio === 'Changed by the other tab.', "the other tab's change survived");
  check(
    /Someone changed this record/i.test(await page.eval('document.body.innerText')),
    'and the teacher is told what happened',
  );
}

section('9. AUTHORISATION, CSRF AND IDOR');
{
  /*
    ⚠ WHY THIS ATTACKS THE DELETE FORM RATHER THAN THE SAVE ACTION.

    `saveFaculty` is driven by `useActionState`, so React encodes a bound
    previous-state argument alongside the fields. A hand-built payload cannot
    reproduce that, and Next answers with a 500 for a malformed action body -
    which says nothing whatever about authorisation. A first version of this
    section did exactly that and produced a "failure" that was really a
    deserialisation error.

    Worse, its anonymous case PASSED FOR THE WRONG REASON: with no cookie the
    proxy redirects at the edge, so the request never reached the action at
    all. It proved the proxy works, while claiming the action refuses.

    `deleteFaculty` takes only FormData and is rendered as a real <form>, so
    its `$ACTION_*` fields can be read out of the served HTML exactly as
    verify-security.mjs does for sign-in. That makes every replay below a
    genuine invocation of a genuine destructive endpoint - and deletion is the
    mutation most worth protecting.
  */
  /** Hidden fields of the delete form belonging to one record. */
  function deleteFormFields(markup, id) {
    const forms = [...markup.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
    const target = forms.find((f) => f.includes(`value="${id}"`));
    if (!target) return null;
    const fields = {};
    for (const m of target.matchAll(/<input[^>]*>/g)) {
      const name = (m[0].match(/name="([^"]*)"/) ?? [])[1];
      const value = (m[0].match(/value="([^"]*)"/) ?? [])[1] ?? '';
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

  const victim = await prisma.faculty.create({
    data: { name: `${P} Victim`, designation: 'Do Not Delete Me', published: false },
    select: { id: true },
  });

  const freshList = await (await fetch(`${BASE}/admin/faculty`, {
    headers: { Cookie: adminCookie },
  })).text();
  const fields = deleteFormFields(freshList, victim.id);
  check(Boolean(fields), 'read the real delete-form payload out of the served HTML');

  async function postDelete(overrides, { cookie, origin } = {}) {
    const boundary = '----zzfac' + Math.random().toString(16).slice(2);
    const CRLF = String.fromCharCode(13, 10);
    let body = '';
    for (const [k, v] of Object.entries({ ...fields, ...overrides })) {
      body += `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
    }
    body += `--${boundary}--${CRLF}`;
    const res = await fetch(`${BASE}/admin/faculty`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Origin: origin ?? BASE,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
      redirect: 'manual',
    });
    // Consume the body: leaving it unread closes the connection mid-response
    // and fills the server log with "Connection closed" noise that looks like
    // an application error.
    await res.text().catch(() => '');
    return res;
  }

  const alive = async () =>
    (await prisma.faculty.findUnique({ where: { id: victim.id } })) !== null;

  if (fields) {
    // (a) No cookie at all. The PROXY refuses this before the action runs -
    //     which is a real defence, and is named as what it is.
    const anon = await postDelete({});
    check(anon.status === 307 || anon.status === 302, 'an anonymous delete is redirected at the edge', `status ${anon.status}`);
    check(await alive(), 'and the record survives');

    // (b) A cookie that exists but is forged. This gets PAST the proxy, so the
    //     action itself is what must refuse it.
    const forged = await postDelete({}, { cookie: 'ci_admin_session=forged.value.here' });
    check(forged.status < 500, 'a forged session reaches the action and is handled', `status ${forged.status}`);
    check(await alive(), 'and the action refuses it — the record survives');

    // (c) Real session, foreign origin.
    const csrf = await postDelete({}, { cookie: adminCookie, origin: 'https://attacker.example' });
    check(csrf.status >= 400, 'a cross-origin delete is refused outright', `status ${csrf.status}`);
    check(await alive(), 'and the record survives');

    // (d) IDOR: ids we never issued must select nothing.
    const before = await prisma.faculty.count();
    for (const badId of [
      '../../etc/passwd',
      "'; DROP TABLE faculty; --",
      'x'.repeat(500),
      '{"$ne":null}',
      '1 OR 1=1',
      '',
    ]) {
      await postDelete({ id: badId }, { cookie: adminCookie });
    }
    check(
      (await prisma.faculty.count()) === before,
      'malformed ids delete nothing',
      `${before} -> ${await prisma.faculty.count()}`,
    );
    check(await alive(), 'and the victim record is untouched');

    /*
      THE CONTROL CASE. Every refusal above is only meaningful if this
      identical request, with a real session and a real origin, DOES delete.
      Without it, a broken endpoint would make all six checks pass.
    */
    const real = await postDelete({}, { cookie: adminCookie });
    check(real.status < 400 || real.status === 303 || real.status === 307,
          'the same request with a valid session is accepted', `status ${real.status}`);
    check(!(await alive()), 'and it really does delete — so the refusals above mean something');
  }
}

section('10. AUDIT LOG');
{
  const entries = await prisma.auditLog.count({ where: { entity: 'Faculty' } });
  check(entries > 0, 'faculty actions are audited', `${entries} entries`);

  const sample = await prisma.auditLog.findFirst({
    where: { entity: 'Faculty' },
    orderBy: { at: 'desc' },
  });
  check(Boolean(sample?.action), 'each entry records what happened', String(sample?.action));
  check(
    !JSON.stringify(sample ?? {}).includes('<script>'),
    'the audit log does not store payload content',
  );
}

section('11. DELETION');
{
  const row = await prisma.faculty.findFirst({ where: { name: `${P} Control Teacher` } });
  await page.goto(`${BASE}/admin/faculty`);
  await page.eval(`(() => {
    const forms = [...document.querySelectorAll('form')];
    const target = forms.find((f) => {
      const input = f.querySelector('input[name="id"]');
      return input && input.value === ${JSON.stringify(row.id)};
    });
    if (target) target.querySelector('button[type=submit]').click();
    return Boolean(target);
  })()`);
  await new Promise((r) => setTimeout(r, 2500));

  check(
    (await prisma.faculty.findUnique({ where: { id: row.id } })) === null,
    'the record is deleted',
  );
  const html = await publicHtml('/faculty');
  check(!html.includes(`${P} Control Teacher`), 'and is gone from the public page');
}

section('12. THE EMPTY STATE');
{
  /*
    DELETED THROUGH THE ADMIN, NOT THROUGH PRISMA.

    An earlier version removed the remaining rows with `deleteMany` and then
    expected the public page to be empty. It was not, and the page was right:
    /faculty is an ISR route, a direct database write fires no
    `revalidatePath`, and the cached render was still correct for the data the
    application knew about. The test was asserting that Prisma revalidates
    Next, which nothing has ever claimed.

    Deleting the way a teacher does exercises the revalidation this topic is
    actually responsible for.
  */
  const remaining = await prisma.faculty.findMany({
    where: { name: { startsWith: P } },
    select: { id: true },
  });
  for (const row of remaining) {
    await page.goto(`${BASE}/admin/faculty`);
    await page.eval(`(() => {
      const form = [...document.querySelectorAll('form')].find((f) => {
        const input = f.querySelector('input[name="id"]');
        return input && input.value === ${JSON.stringify(row.id)};
      });
      if (form) form.querySelector('button[type=submit]').click();
      return Boolean(form);
    })()`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  check(
    (await countFaculty()) === 0,
    'every remaining record was removed through the admin',
    String(await countFaculty()),
  );

  /*
    THE EMPTY STATE IS ONLY CORRECT WHEN THE SITE IS ACTUALLY EMPTY.

    ⚠ This asserted the empty-state wording unconditionally and began failing
    the moment the ZZSHOW demo dataset gained faculty: with four published
    teachers, /faculty correctly shows teachers. The page was right; the
    assertion assumed a database state that had stopped being true — the same
    mistake verify-integration.mjs made in Topic 5.

    Both branches are worth testing, so the suite asks the database which one
    applies. What is asserted unconditionally is the part that actually matters
    here: this suite's own records are gone, and the page rendered rather than
    erroring.
  */
  const otherFaculty = await prisma.faculty.count({ where: { published: true } });
  for (let i = 0; i < 8; i += 1) {
    const probe = await publicHtml('/faculty');
    if (!probe.includes(P)) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const html = await publicHtml('/faculty');

  check(!html.includes(P), 'no record from this suite remains on the public page');
  check(html.includes('Call ') || html.includes('Send an enquiry'),
        'and the page still offers a way to get in touch');

  if (otherFaculty === 0) {
    check(
      html.includes('putting this page together'),
      'with no faculty at all, the page shows a real state rather than an empty grid',
    );
  } else {
    check(
      html.includes('<article'),
      `the page still renders the ${otherFaculty} unrelated published teacher(s)`,
    );
  }
}


section('14. RESPONSIVE AND ACCESSIBILITY');
{
  /*
    A record exists again so the public page has real cards to lay out. The
    empty state was measured in section 12; an empty page cannot overflow.
  */
  /*
    CREATED THROUGH THE ADMIN, NOT THROUGH PRISMA.

    A direct database write fires no `revalidatePath`, so the ISR-cached
    /faculty page would keep serving its previous render and the card checks
    below would run against a page with no cards - passing "each card has a
    heading" vacuously, because zero cards all have headings. That is the exact
    shape of false pass this project keeps finding, so the record is created
    the way a teacher creates one.
  */
  await page.goto(`${BASE}/admin/faculty/new`);
  await fillFaculty({
    name: `${P} Layout Check`,
    designation: 'Senior Faculty, Commerce and Accountancy Department',
    subject: 'Accountancy, Business Studies and Economics',
    bio: 'A deliberately long description used to check that a card handles a paragraph that runs well past a single line on a narrow screen without clipping, overlapping, or pushing the card out of the grid.',
    publish: true,
  });
  await page.submitForm('[name="name"]', 4000);

  const member = await prisma.faculty.findFirst({
    where: { name: `${P} Layout Check` },
    select: { id: true },
  });
  check(Boolean(member), 'the layout-check record was created through the admin');
  const onPage = await waitForPublic('/faculty', `${P} Layout Check`);
  check(
    onPage.found,
    'and is on the public page, so the card checks below are not vacuous',
    `after ${onPage.attempt} request(s)`,
  );

  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1280]) {
    await page.viewport(width, 800, { mobile: width < 640 });

    for (const route of ['/faculty', '/', '/admin/faculty', `/admin/faculty/${member.id}`]) {
      await page.goto(BASE + route);
      const box = await page.eval(`(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))()`);
      check(
        box.scroll <= box.client,
        `${width}px ${route} does not scroll sideways`,
        `${box.scroll} > ${box.client}`,
      );
    }
  }

  // Touch targets, using the same two WCAG 2.5.8 exceptions verify-ux applies.
  await page.viewport(320, 800, { mobile: true });
  for (const route of ['/faculty', '/admin/faculty', `/admin/faculty/${member.id}`]) {
    await page.goto(BASE + route);
    const small = JSON.parse(
      await page.eval(`(() => {
        const out = [];
        for (const el of document.querySelectorAll('a[href], button:not([disabled]), input[type=submit]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const s = getComputedStyle(el);
          const hidden = s.clipPath === 'inset(50%)'
            || s.clip === 'rect(0px, 0px, 0px, 0px)'
            || (r.width <= 1 && r.height <= 1);
          if (hidden) continue;
          if (el.closest('p, li') && s.display === 'inline') continue;
          if (r.width < 24 || r.height < 24) {
            out.push(el.tagName.toLowerCase() + ':' + (el.textContent || '').trim().slice(0, 20)
              + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          }
        }
        return JSON.stringify(out.slice(0, 5));
      })()`),
    );
    check(small.length === 0, `320px ${route} touch targets meet 24x24`, small.join(' | '));
  }

  // Form semantics on the edit page, checked by interaction rather than markup.
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/admin/faculty/${member.id}`);
  const semantics = JSON.parse(
    await page.eval(`(() => {
      const controls = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')];
      /*
        A control marked aria-hidden is not IN the accessibility tree, so it
        needs no label - the visible button that triggers it carries the name.
        That is the correct pattern for the hidden file inputs behind "Choose
        photo". Excluding them without checking would be hiding a real problem,
        so hiddenFocusable below proves they are also unreachable by
        keyboard: an aria-hidden control that COULD be focused would be a
        genuine trap, and that is what is worth asserting.
      */
      const visible = controls.filter((c) => c.getAttribute('aria-hidden') !== 'true');
      const unlabelled = visible.filter((c) => {
        const byLabel = c.labels && c.labels.length > 0;
        const byAria = c.getAttribute('aria-label') || c.getAttribute('aria-labelledby');
        return !byLabel && !byAria;
      }).map((c) => c.name || c.type);

      const hiddenFocusable = controls
        .filter((c) => c.getAttribute('aria-hidden') === 'true')
        .filter((c) => c.tabIndex >= 0)
        .map((c) => c.name || c.type);
      const divButtons = [...document.querySelectorAll('div[onclick], span[onclick]')].length;
      const imgs = [...document.querySelectorAll('img')];
      const noAlt = imgs.filter((i) => !i.hasAttribute('alt') && i.getAttribute('aria-hidden') !== 'true').length;
      return JSON.stringify({
        unlabelled,
        hiddenFocusable,
        divButtons,
        noAlt,
        controls: visible.length,
      });
    })()`),
  );
  check(semantics.controls > 0, 'the edit form renders controls', String(semantics.controls));
  check(
    semantics.unlabelled.length === 0,
    'every form control on the edit page is labelled',
    semantics.unlabelled.join(', '),
  );
  check(
    semantics.hiddenFocusable.length === 0,
    'no aria-hidden control can be reached by keyboard',
    semantics.hiddenFocusable.join(', '),
  );
  check(semantics.divButtons === 0, 'no clickable divs are used in place of buttons');
  check(semantics.noAlt === 0, 'every image has alt text or is hidden from assistive tech');

  // Keyboard: the primary action must be reachable and operable by keyboard.
  const keyboard = JSON.parse(
    await page.eval(`(() => {
      const save = [...document.querySelectorAll('button[type=submit]')]
        .find((b) => /Save changes/i.test(b.textContent));
      if (!save) return JSON.stringify({ found: false });
      save.focus();
      return JSON.stringify({
        found: true,
        focused: document.activeElement === save,
        tag: save.tagName,
      });
    })()`),
  );
  check(keyboard.found, 'the save button exists');
  check(keyboard.focused, 'and can take keyboard focus');
  check(keyboard.tag === 'BUTTON', 'and is a real button element', keyboard.tag);

  // Public card semantics.
  await page.goto(`${BASE}/faculty`);
  const cards = JSON.parse(
    await page.eval(`(() => {
      const articles = [...document.querySelectorAll('article')];
      const headings = articles.filter((a) => a.querySelector('h3')).length;
      const imgs = [...document.querySelectorAll('article img')];
      return JSON.stringify({
        articles: articles.length,
        headings,
        imgsWithAlt: imgs.filter((i) => (i.getAttribute('alt') || '').length > 0).length,
        imgs: imgs.length,
      });
    })()`),
  );
  check(cards.articles > 0, 'faculty render as <article> elements', String(cards.articles));
  check(
    cards.articles > 0 && cards.headings === cards.articles,
    'each card has a heading',
    `${cards.headings} of ${cards.articles}`,
  );
  check(
    cards.imgs === 0 || cards.imgsWithAlt === cards.imgs,
    'every portrait carries alt text naming the person',
    `${cards.imgsWithAlt} of ${cards.imgs}`,
  );

  await prisma.faculty.delete({ where: { id: member.id } });
  await page.viewport(1280, 900);
}

section('13. CLEANUP');
{
  const removed = await prisma.faculty.deleteMany({ where: { name: { startsWith: P } } });
  console.log(`  removed ${removed.count} ZZFAC record(s)`);
  check((await countFaculty()) === 0, 'no ZZFAC records remain');
  /*
    Scoped to this suite's own prefix. Asserting the whole table is empty would
    fail whenever the ZZSHOW demo dataset is seeded - and deleting somebody
    else's rows to make that true would be a verification suite destroying data
    it does not own.
  */
  check(
    (await prisma.auditLog.count({ where: { entity: 'Faculty' } })) > 0,
    'the audit trail of this run survives cleanup',
  );
}

await rm(dir, { recursive: true, force: true });
await prisma.$disconnect();
await page.close();
await browser.close();

console.log('\n========================================================');
console.log(`FACULTY VERIFICATION: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('========================================================');

exit(fail === 0 ? 0 : 1);
