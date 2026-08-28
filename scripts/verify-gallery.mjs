/**
 * The gallery, attacked.
 *
 * =============================================================================
 * WHAT THIS SUITE IS ACTUALLY FOR
 * =============================================================================
 * `docs/design/STUDENT-DATA-POLICY.md` names gallery photographs in its scope,
 * so the table this exercises can hold a photograph of somebody else's child.
 * Every other property here — layout, captions, ordering — is a website. The
 * consent rule is the part where being wrong matters, so it is tested first,
 * from the database outwards, and tested again through a logged-out request.
 *
 * =============================================================================
 * SECTION 0 IS NOT CEREMONY
 * =============================================================================
 * Every "the attack was refused" assertion below is only meaningful because
 * section 0 proves the suite can WRITE and that the server under test actually
 * contains Topic 8. Phase 16 has produced four suites whose negative checks
 * passed because nothing was happening: two that never wrote, one that served a
 * stale build, and one whose cache clear silently failed. All four looked
 * green.
 *
 * So section 0 asserts, from the DATABASE and from the SERVED HTML rather than
 * from a status code:
 *
 *   - the running server has the gallery routes (it is not a stale build)
 *   - a record can be created through the admin and is visible publicly
 *
 * Usage:
 *   DATABASE_URL=... ADMIN_PASSWORD=... BASE_URL=http://localhost:3000 \
 *     node scripts/verify-gallery.mjs
 */

import { env, exit } from 'node:process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { launch } from './browser.mjs';
import { isGalleryItemPublic } from '../src/lib/gallery.ts';

const BASE = env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = env.ADMIN_EMAIL ?? 'admin@localhost.invalid';
const PASSWORD = env.ADMIN_PASSWORD ?? '';

/** Unmistakably synthetic, and the only rows this suite ever touches. */
const P = 'ZZGAL';
const REF = 'ZZGAL-CONSENT-0001';

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
  console.error('DATABASE_URL is not set. This suite reads the gallery table directly.');
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
 * Poll a public page until `predicate(html)` holds, reporting the attempt count.
 *
 * `revalidatePath` marks a page stale rather than rebuilding it inline, so the
 * first anonymous request after a save can still be served the previous render.
 * Asserting on one request measures that race; asserting with no bound would
 * hide a genuinely broken revalidation.
 */
async function waitForPublic(pathname, predicate, tries = 8) {
  let html = '';
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    html = await publicHtml(pathname);
    if (predicate(html)) return { ok: true, attempt, html };
    if (attempt < tries) await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: false, attempt: tries, html };
}

const mine = { alt: { startsWith: P } };
const countMine = () => prisma.galleryItem.count({ where: mine });

/* ---------------------------------------------------------- start clean -- */

await prisma.galleryItem.deleteMany({ where: mine });

const dir = await mkdtemp(path.join(tmpdir(), 'zzgal-'));
const photoA = path.join(dir, 'scene-a.jpg');
const photoB = path.join(dir, 'scene-b.jpg');
await writeFile(
  photoA,
  await sharp({ create: { width: 640, height: 480, channels: 3, background: '#2a6ff5' } })
    .jpeg()
    .toBuffer(),
);
await writeFile(
  photoB,
  await sharp({ create: { width: 640, height: 480, channels: 3, background: '#f5a02a' } })
    .jpeg()
    .toBuffer(),
);

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

/** A <select> needs its own descriptor and a change event, not an input event. */
function setSelect(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
      .set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;
}

/** Click a checkbox only if it is not already in the wanted state. */
function setCheckbox(id, wanted) {
  return `(() => {
    const box = document.querySelector(${JSON.stringify('#' + id)});
    if (!box) return 'missing';
    if (box.checked !== ${wanted ? 'true' : 'false'}) box.click();
    return box.checked;
  })()`;
}

/** Upload through the Topic 5 control and wait for a genuinely new result. */
async function attachPhoto(filePath) {
  const SENTINEL = '__zzgal_awaiting__';
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
  return { ok: false, message: 'upload never settled' };
}

/** Fill the gallery form. Everything except the photograph, which is separate. */
async function fillGallery({
  alt,
  caption = '',
  category = 'CLASSROOMS',
  priority = null,
  showsPeople = true,
  consentRef = null,
  consentPhoto = false,
  publish = false,
}) {
  await page.eval(setField('[name="alt"]', alt));
  await page.eval(setField('[name="caption"]', caption));
  await page.eval(setSelect('[name="category"]', category));
  if (priority !== null) await page.eval(setField('[name="priority"]', String(priority)));
  await page.eval(setCheckbox('g-showsPeople', showsPeople));
  if (consentRef !== null) await page.eval(setField('[name="consentRef"]', consentRef));
  await page.eval(setCheckbox('g-consentPhoto', consentPhoto));
  await page.eval(setCheckbox('g-published', publish));
}

/* ============================================================ 0. CONTROL == */

section('0. THE SERVER HAS TOPIC 8, AND THIS SUITE CAN WRITE');

/*
  BUILD FRESHNESS FIRST.

  Topic 7 spent an hour reporting layout failures against source that had
  already been fixed, because `next start` was serving a `.next` from before the
  fix. A suite that cannot tell which build it is measuring is not measuring
  anything. These two requests are cheap and fail loudly.
*/
{
  const pub = await fetch(`${BASE}/gallery`, { redirect: 'manual' });
  check(pub.status === 200, 'the running server serves /gallery', `status ${pub.status}`);
  const adm = await fetch(`${BASE}/admin/gallery`, { redirect: 'manual' });
  check(
    adm.status === 307 || adm.status === 302,
    'and /admin/gallery exists and is behind auth',
    `status ${adm.status}`,
  );
  if (pub.status !== 200 || adm.status === 404) {
    console.error('\nThe server under test does not contain Topic 8. Rebuild before running.');
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

await page.goto(`${BASE}/admin/gallery/new`);
const upload = await attachPhoto(photoA);
check(upload.ok, 'a photograph uploaded through the Topic 5 control', upload.message);

await fillGallery({
  alt: `${P} control photograph of an empty classroom.`,
  caption: `${P} control caption.`,
  category: 'CLASSROOMS',
  priority: 500,
  showsPeople: false,
  publish: true,
});
await page.submitForm('[name="alt"]', 4000);

const control = await prisma.galleryItem.findFirst({ where: mine });
check(Boolean(control), 'a gallery record was created through the admin');
check(control?.published === true, 'and it was published');
check(control?.showsPeople === false, 'with "shows people" unticked as set');
check(control?.category === 'CLASSROOMS', 'and the category chosen');
check(
  Boolean(control && /^\/media\/[0-9a-f]{32}\.(jpg|png|webp|avif)$/.test(control.imageUrl)),
  'and the image path is a generated media key, not a filename',
  control?.imageUrl,
);
check((await countMine()) === 1, 'exactly one ZZGAL record exists, so later counts are meaningful');

const controlLive = await waitForPublic('/gallery', (h) => h.includes(`${P} control photograph`));
check(
  controlLive.ok,
  'and a logged-out visitor can see it on /gallery',
  `after ${controlLive.attempt} request(s)`,
);

/* =============================================== 1. CONSENT AT THE BOUNDARY */

section('1. CONSENT IS ENFORCED AT THE MUTATION BOUNDARY');
{
  /*
    CASE B — MISSING CONSENT. A photograph that shows people, with the publish
    box ticked and no permission recorded, must not become public.

    Driven through the real form, so what is tested is the action a teacher
    actually reaches — not a direct Prisma write, which would only re-test the
    CHECK constraint that section 1b covers separately.
  */
  await page.goto(`${BASE}/admin/gallery/new`);
  const up = await attachPhoto(photoB);
  check(up.ok, 'control: the photograph for the no-consent case uploaded', up.message);

  await fillGallery({
    alt: `${P} people with no permission recorded.`,
    category: 'STUDENTS',
    showsPeople: true,
    consentRef: '',
    consentPhoto: false,
    publish: true,
  });
  await page.submitForm('[name="alt"]', 4000);

  const row = await prisma.galleryItem.findFirst({
    where: { alt: { startsWith: `${P} people with no permission` } },
  });
  check(Boolean(row), 'the record was still SAVED — refusing to save would lose the work');
  check(row?.published === false, 'but it was NOT published', `published=${row?.published}`);
  check(
    row ? isGalleryItemPublic(row) === false : false,
    'and the shared visibility predicate agrees it is not public',
  );

  const html = await publicHtml('/gallery');
  check(
    !html.includes('people with no permission'),
    'a logged-out visitor cannot see it on /gallery',
  );
  check(
    !(await publicHtml('/')).includes('people with no permission'),
    'and it is not in the homepage band either',
  );

  // The teacher is told, rather than left to wonder why nothing appeared.
  check(
    /not shown publicly|taken off the website/i.test(await page.eval('document.body.innerText')),
    'and the admin says the photograph was not published',
  );

  /*
    HALF CONSENT IS NOT CONSENT.

    A reference on file with the photograph box unticked, and the box ticked
    with no reference. The policy is explicit that the permissions are
    independent questions rather than a ladder, so each of these alone must
    fail.
  */
  for (const [label, ref, tick] of [
    ['a reference on file but the photograph box unticked', REF, false],
    ['the photograph box ticked but no reference on file', '', true],
  ]) {
    await page.goto(`${BASE}/admin/gallery/new`);
    const u = await attachPhoto(photoA);
    if (!u.ok) {
      check(false, `control: upload for "${label}"`, u.message);
      continue;
    }
    const alt = `${P} half consent ${tick ? 'tick' : 'ref'} only.`;
    await fillGallery({
      alt,
      category: 'STUDENTS',
      showsPeople: true,
      consentRef: ref,
      consentPhoto: tick,
      publish: true,
    });
    await page.submitForm('[name="alt"]', 4000);

    const r = await prisma.galleryItem.findFirst({ where: { alt } });
    check(r?.published === false, `${label} does not publish`, `published=${r?.published}`);
  }
}

section('1b. THE DATABASE REFUSES THE ILLEGAL STATE TOO');
{
  /*
    The action is the gate a teacher meets. This is the gate everything else
    meets — a direct query, a future import, a script somebody writes in a
    hurry. Phase 16 Topic 5 found the stories action writing an unvalidated
    photo path for its entire existence with nothing downstream compensating,
    which is precisely what a database-level backstop is for.
  */
  const base = {
    imageUrl: '/media/' + 'b'.repeat(32) + '.jpg',
    alt: `${P} direct write probe.`,
    category: 'STUDENTS',
  };

  const illegal = [
    ['no consent at all', { ...base, published: true }],
    ['reference only', { ...base, published: true, consentRef: REF }],
    ['tick only', { ...base, published: true, consentPhoto: true }],
    ['whitespace reference', { ...base, published: true, consentRef: '   ', consentPhoto: true }],
  ];
  for (const [label, data] of illegal) {
    let refused = false;
    let constraint = '';
    try {
      const made = await prisma.galleryItem.create({ data, select: { id: true } });
      await prisma.galleryItem.delete({ where: { id: made.id } });
    } catch (error) {
      refused = true;
      constraint = (String(error.message).match(/gallery_items_[a-z_]+/) ?? [''])[0];
    }
    check(refused, `a direct write with ${label} is refused by the database`, constraint);
  }

  // POSITIVE CONTROLS: the constraint is not simply rejecting everything.
  for (const [label, data] of [
    ['nobody in it', { ...base, published: true, showsPeople: false }],
    ['full consent', { ...base, published: true, consentRef: REF, consentPhoto: true }],
  ]) {
    let accepted = false;
    try {
      const made = await prisma.galleryItem.create({ data, select: { id: true } });
      await prisma.galleryItem.delete({ where: { id: made.id } });
      accepted = true;
    } catch {
      accepted = false;
    }
    check(accepted, `control: a legitimate published row with ${label} IS accepted`);
  }
}

/* ================================================== 2. CONSENT WITHDRAWAL == */

section('2. WITHDRAWING CONSENT TAKES THE PHOTOGRAPH DOWN');
{
  await page.goto(`${BASE}/admin/gallery/new`);
  const u = await attachPhoto(photoB);
  check(u.ok, 'control: the photograph uploaded', u.message);

  const alt = `${P} consented group photograph.`;
  await fillGallery({
    alt,
    category: 'EVENTS',
    showsPeople: true,
    consentRef: REF,
    consentPhoto: true,
    publish: true,
  });
  await page.submitForm('[name="alt"]', 4000);

  const live = await prisma.galleryItem.findFirst({ where: { alt } });
  check(live?.published === true, 'CASE A: with full consent it publishes');
  const seen = await waitForPublic('/gallery', (h) => h.includes('consented group photograph'));
  check(seen.ok, 'and a logged-out visitor sees it', `after ${seen.attempt} request(s)`);

  /*
    CASE C — WITHDRAWN CONSENT. The teacher unticks the photograph permission
    and saves, leaving "show on the website" ticked, which is what somebody does
    when a parent has just phoned.
  */
  await page.goto(`${BASE}/admin/gallery/${live.id}`);
  await page.eval(setCheckbox('g-consentPhoto', false));
  await page.submitForm('[name="alt"]', 4000);

  const after = await prisma.galleryItem.findUnique({ where: { id: live.id } });
  check(after?.consentPhoto === false, 'the withdrawal was recorded');
  check(
    after?.published === false,
    'and the photograph was unpublished by the same save',
    `published=${after?.published}`,
  );
  check(Boolean(after), 'the record itself still exists — nothing was destroyed');

  const gone = await waitForPublic(
    '/gallery',
    (h) => !h.includes('consented group photograph'),
  );
  check(
    gone.ok,
    'and it is GONE from the public page, not merely flagged',
    `after ${gone.attempt} request(s)`,
  );
  check(
    !(await publicHtml('/')).includes('consented group photograph'),
    'and gone from the homepage band',
  );
  check(
    /taken off the website/i.test(await page.eval('document.body.innerText')),
    'and the teacher is told the photograph came down',
  );
}

/* ===================================================== 3. STALE EDIT ======= */

section('3. A STALE FORM CANNOT RESTORE A WITHDRAWN PHOTOGRAPH');
{
  /*
    CASE D, and the privacy-critical half of the stale-edit guard.

    Tab A opens a photograph while it is published with full consent. Consent is
    then withdrawn elsewhere. Tab A presses Save with the form exactly as it was
    loaded — every consent box still ticked, because that is what it was showing.

    Without the lost-update guard this republishes the photograph, and does so
    while looking to the teacher like a save of something they never changed.
  */
  const item = await prisma.galleryItem.create({
    data: {
      imageUrl: '/media/' + 'c'.repeat(32) + '.jpg',
      alt: `${P} stale edit subject.`,
      category: 'EVENTS',
      showsPeople: true,
      consentRef: REF,
      consentPhoto: true,
      published: true,
    },
  });

  // Tab A loads the form while everything is still consented.
  await page.goto(`${BASE}/admin/gallery/${item.id}`);
  const tokenSeen = await page.eval(
    `document.querySelector('[name="editedAt"]') ? document.querySelector('[name="editedAt"]').value : ''`,
  );
  check(tokenSeen.length > 0, 'control: the form carries a version token', tokenSeen.slice(0, 24));

  // Meanwhile, consent is withdrawn.
  await prisma.galleryItem.update({
    where: { id: item.id },
    data: { consentPhoto: false, published: false },
  });

  // Tab A saves, unchanged.
  await page.submitForm('[name="alt"]', 4000);

  const after = await prisma.galleryItem.findUnique({ where: { id: item.id } });
  check(after?.published === false, 'the stale save did NOT republish the photograph');
  check(after?.consentPhoto === false, 'and did NOT restore the withdrawn permission');
  check(
    /Someone changed this record/i.test(await page.eval('document.body.innerText')),
    'and the teacher is told what happened',
  );
  check(
    !(await publicHtml('/gallery')).includes('stale edit subject'),
    'the photograph is still absent from the public page',
  );

  /*
    A MISSING token is treated as stale too. A form that cannot prove which
    version it was looking at has no business overwriting one.
  */
  await page.goto(`${BASE}/admin/gallery/${item.id}`);
  await page.eval(setCheckbox('g-consentPhoto', true));
  await page.eval(setCheckbox('g-published', true));
  /*
    ⚠ THE TOKEN IS STRIPPED LAST, AND THAT ORDERING IS THE TEST.

    Stripping it before touching the checkboxes did not work: each click is a
    React state update, and the re-render restores the controlled hidden input
    to its original value. The token came back, the save was a NORMAL save, and
    this assertion reported a stale-edit failure that was really the harness
    undoing its own attack.
  */
  const stripped = await page.eval(`(() => {
    const t = document.querySelector('[name="editedAt"]');
    if (!t) return 'missing';
    t.value = '';
    return t.value === '' ? 'stripped' : 'restored';
  })()`);
  check(stripped === 'stripped', 'control: the version token really was removed', stripped);
  await page.submitForm('[name="alt"]', 4000);

  const after2 = await prisma.galleryItem.findUnique({ where: { id: item.id } });
  check(
    after2?.published === false,
    'a save with the version token stripped is refused as stale',
    `published=${after2?.published}`,
  );
}

/* ========================================= 4. AUTHORISATION, CSRF AND IDOR = */

section('4. AUTHORISATION, CSRF AND IDOR');
{
  /*
    ⚠ THIS ATTACKS THE DELETE FORM RATHER THAN THE SAVE ACTION, for the reason
    verify-faculty.mjs records: `saveGalleryItem` is driven by `useActionState`,
    so React encodes a bound previous-state argument that a hand-built payload
    cannot reproduce, and Next answers a malformed action body with a 500 —
    which says nothing about authorisation.

    `deleteGalleryItem` takes only FormData and is rendered as a real <form>, so
    its `$ACTION_*` fields can be read out of the served HTML. Every replay
    below is therefore a genuine invocation of a genuine destructive endpoint.
  */
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

  const victim = await prisma.galleryItem.create({
    data: {
      imageUrl: '/media/' + 'd'.repeat(32) + '.jpg',
      alt: `${P} victim, do not delete.`,
      category: 'CLASSROOMS',
      showsPeople: false,
      published: false,
    },
    select: { id: true },
  });

  const listHtml = await (
    await fetch(`${BASE}/admin/gallery`, { headers: { Cookie: adminCookie } })
  ).text();
  const fields = deleteFormFields(listHtml, victim.id);
  check(Boolean(fields), 'read the real delete-form payload out of the served HTML');

  async function postDelete(overrides, { cookie, origin } = {}) {
    const boundary = '----zzgal' + Math.random().toString(16).slice(2);
    const CRLF = String.fromCharCode(13, 10);
    let body = '';
    for (const [k, v] of Object.entries({ ...fields, ...overrides })) {
      body += `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
    }
    body += `--${boundary}--${CRLF}`;
    const res = await fetch(`${BASE}/admin/gallery`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Origin: origin ?? BASE,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
      redirect: 'manual',
    });
    // Consume the body: leaving it unread fills the server log with
    // "Connection closed" noise that looks like an application error.
    await res.text().catch(() => '');
    return res;
  }

  const alive = async () =>
    (await prisma.galleryItem.findUnique({ where: { id: victim.id } })) !== null;

  if (fields) {
    // (a) No cookie. The PROXY refuses at the edge — a real defence, named as
    //     what it actually is rather than credited to the action.
    const anon = await postDelete({});
    check(
      anon.status === 307 || anon.status === 302,
      'CASE E: an anonymous delete is redirected at the edge',
      `status ${anon.status}`,
    );
    check(await alive(), 'and the record survives');

    // (b) A cookie that exists but is forged. This gets PAST the proxy, so the
    //     ACTION is what must refuse it.
    const forged = await postDelete({}, { cookie: 'ci_admin_session=forged.value.here' });
    check(
      forged.status < 500,
      'CASE F: a forged session reaches the action and is handled',
      `status ${forged.status}`,
    );
    check(await alive(), 'and the action refuses it — the record survives');

    // (c) Real session, foreign origin.
    const csrf = await postDelete({}, { cookie: adminCookie, origin: 'https://attacker.example' });
    check(
      csrf.status >= 400,
      'CASE G: a cross-origin delete is refused outright',
      `status ${csrf.status}`,
    );
    check(await alive(), 'and the record survives');

    // (d) IDOR: ids we never issued must select nothing.
    const before = await prisma.galleryItem.count();
    for (const badId of [
      '../../etc/passwd',
      "'; DROP TABLE gallery_items; --",
      'x'.repeat(500),
      '{"$ne":null}',
      '1 OR 1=1',
      '',
    ]) {
      await postDelete({ id: badId }, { cookie: adminCookie });
    }
    const afterBad = await prisma.galleryItem.count();
    check(afterBad === before, 'malformed ids delete nothing', `${before} -> ${afterBad}`);
    check(await alive(), 'and the victim is untouched');
  }

  // The edit route must refuse ids we never issued rather than 500.
  for (const badId of ['../../etc/passwd', 'x'.repeat(300), '%2e%2e%2f', 'null']) {
    const res = await fetch(`${BASE}/admin/gallery/${encodeURIComponent(badId)}`, {
      headers: { Cookie: adminCookie },
      redirect: 'manual',
    });
    await res.text().catch(() => '');
    check(res.status !== 500, `a malformed id on the edit route does not 500 (${badId.slice(0, 14)})`, `status ${res.status}`);
  }
}

/* ================================================================ 5. XSS == */

section('5. TEACHER-ENTERED TEXT STAYS TEXT');
{
  const PAYLOADS = [
    '<script>window.__zzgal_xss=1</script>',
    '<img src=x onerror="window.__zzgal_xss=1">',
    '"><svg onload="window.__zzgal_xss=1">',
    '</script><script>window.__zzgal_xss=1</script>',
    "javascript:window.__zzgal_xss=1",
    '{{constructor.constructor("window.__zzgal_xss=1")()}}',
  ];

  await page.goto(`${BASE}/admin/gallery/new`);
  const u = await attachPhoto(photoA);
  check(u.ok, 'control: the photograph for the XSS case uploaded', u.message);

  const alt = `${P} xss ${PAYLOADS[0]}${PAYLOADS[1]}`;
  const caption = `${P} caption ${PAYLOADS[2]}${PAYLOADS[3]}${PAYLOADS[4]}${PAYLOADS[5]}`;
  await fillGallery({
    alt,
    caption,
    category: 'EVENTS',
    showsPeople: false,
    publish: true,
  });
  await page.submitForm('[name="alt"]', 4000);

  const stored = await prisma.galleryItem.findFirst({
    where: { alt: { startsWith: `${P} xss` } },
  });
  check(Boolean(stored), 'control: the XSS record was stored, so the payloads reach the page');

  const live = await waitForPublic('/gallery', (h) => h.includes(`${P} xss`));
  check(live.ok, 'control: and it renders publicly', `after ${live.attempt} request(s)`);

  check(
    !live.html.includes('<script>window.__zzgal_xss'),
    'the script payload is not present as live markup',
  );
  check(
    !/onerror="window\.__zzgal_xss/.test(live.html),
    'the event-handler payload is not present as a live attribute',
  );
  check(live.html.includes('&lt;script&gt;'), 'it is escaped instead', 'entity-encoded');

  // The decisive check: a real browser, and whether anything executed.
  await page.goto(`${BASE}/gallery`);
  await new Promise((r) => setTimeout(r, 800));
  const executed = await page.eval('String(window.__zzgal_xss === 1)');
  check(executed === 'false', 'and NOTHING executed in a real browser', `flag=${executed}`);

  const injected = await page.eval(
    `String(document.querySelectorAll('script:not([src]):not([type])').length)`,
  );
  check(Number(injected) < 5, 'no swarm of injected inline scripts', `${injected} inline scripts`);

  // Alt text is an ATTRIBUTE, which is where quote-breaking bites.
  const altBroke = await page.eval(`(() => {
    for (const img of document.querySelectorAll('img')) {
      if ((img.getAttribute('alt') || '').includes('${P} xss')) return 'found-as-alt';
    }
    return 'not-found';
  })()`);
  check(
    altBroke === 'found-as-alt',
    'the payload sits inside the alt ATTRIBUTE without breaking out of it',
    altBroke,
  );
}

/* ================================================= 6. MEDIA PATH SECURITY = */

section('6. ONLY INTERNALLY GENERATED MEDIA PATHS SURVIVE');
{
  /*
    The picker only ever produces `/media/<hash>.<ext>`. "It comes from our own
    component" is exactly the assumption that was wrong in the stories action
    for months — the browser sends whatever it likes, so the hidden field is
    overwritten directly here and the save driven through the real form.
  */
  const HOSTILE = [
    '../../etc/passwd',
    '/media/../../etc/passwd.jpg',
    '/../secrets.jpg',
    'C:\\Windows\\win.ini',
    '%2e%2e%2f%2e%2e%2fetc%2fpasswd.jpg',
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'http://evil.example/x.jpg',
    'https://evil.example/x.jpg',
    '//evil.example/x.jpg',
    '/media/payload.svg',
    '/media/payload.html',
    '/media/x.jpg?a=b',
    '/media/x.jpg#f',
  ];

  const before = await countMine();
  for (const hostile of HOSTILE) {
    await page.goto(`${BASE}/admin/gallery/new`);
    await page.eval(setField('[name="imageUrl"]', hostile));
    await fillGallery({
      alt: `${P} hostile path probe.`,
      category: 'CLASSROOMS',
      showsPeople: false,
      publish: true,
    });
    await page.submitForm('[name="alt"]', 3000);

    const made = await prisma.galleryItem.findFirst({
      where: { alt: { startsWith: `${P} hostile path probe` } },
    });
    check(
      made === null,
      `refused: ${hostile.slice(0, 40)}`,
      made ? `STORED AS ${made.imageUrl}` : '',
    );
    if (made) await prisma.galleryItem.delete({ where: { id: made.id } });
  }
  check(
    (await countMine()) === before,
    'not one hostile path created a record',
    `${before} -> ${await countMine()}`,
  );
}

/* ======================================== 7. THE PHOTOGRAPH IS REQUIRED === */

section('7. THE REQUIRED PHOTOGRAPH IS HONESTLY REQUIRED');
{
  /*
    Every other photo field on this site is optional, and Topic 5 pinned that
    with a regression test after the project shipped a field whose help text
    said "optional" while validation refused it empty.

    A gallery entry genuinely needs a photograph. What must hold is that the
    UI SAYS SO — the contradiction is what causes the harm, not the requirement.
  */
  await page.goto(`${BASE}/admin/gallery/new`);
  const labelText = await page.eval('document.body.innerText');
  check(
    /required/i.test(labelText) && /needs a photograph/i.test(labelText),
    'the form states that a photograph is required before you try to save',
  );
  check(
    !/photo is optional|optional\. *a gallery/i.test(labelText),
    'and nowhere calls the gallery photograph optional',
  );

  await fillGallery({
    alt: `${P} no photograph attached.`,
    category: 'CLASSROOMS',
    showsPeople: false,
    publish: true,
  });
  await page.submitForm('[name="alt"]', 3000);

  const none = await prisma.galleryItem.findFirst({
    where: { alt: { startsWith: `${P} no photograph` } },
  });
  check(none === null, 'saving with no photograph is refused');
  check(
    /needs one|choose a photograph/i.test(await page.eval('document.body.innerText')),
    'and the message names the control to use',
  );

  // Blank alt text is refused too — it is what a screen reader gets instead.
  await page.goto(`${BASE}/admin/gallery/new`);
  const u = await attachPhoto(photoA);
  if (u.ok) {
    await fillGallery({ alt: '   ', category: 'CLASSROOMS', showsPeople: false });
    await page.submitForm('[name="alt"]', 3000);
    const blank = await prisma.galleryItem.count({ where: { alt: { in: ['', '   '] } } });
    check(blank === 0, 'a blank description is refused');
  } else {
    check(false, 'control: upload for the blank-description case', u.message);
  }
}

/* ============================================================ 8. DELETION = */

section('8. DELETION');
{
  const doomed = await prisma.galleryItem.create({
    data: {
      imageUrl: '/media/' + 'e'.repeat(32) + '.jpg',
      alt: `${P} to be deleted.`,
      category: 'CLASSROOMS',
      showsPeople: false,
      published: true,
    },
    select: { id: true },
  });

  const shown = await waitForPublic('/gallery', (h) => h.includes('to be deleted'));
  check(shown.ok, 'control: it is public before the delete', `after ${shown.attempt} request(s)`);

  await page.goto(`${BASE}/admin/gallery`);
  const clicked = await page.eval(`(() => {
    const forms = [...document.querySelectorAll('form')];
    const target = forms.find((f) => {
      const id = f.querySelector('input[name="id"]');
      return id && id.value === ${JSON.stringify(doomed.id)};
    });
    if (!target) return false;
    const btn = [...target.querySelectorAll('button')]
      .find((b) => /remove|delete/i.test((b.textContent || '').trim()));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check(clicked === 'true' || clicked === true, 'the Remove control was found and pressed');
  await new Promise((r) => setTimeout(r, 1200));

  /*
    ONE CLICK MUST NEVER DELETE.

    Topic 11 found this photograph list deleting on a single click with no
    confirmation of any kind, while announcements, batches, stories and results
    all asked first. `DeleteButton` now gives every one of them the same inline
    question, so the suite drives two clicks - and asserts the first one did
    nothing, because a test that only proves deletion works would have passed
    against the defect.
  */
  check(
    (await prisma.galleryItem.findUnique({ where: { id: doomed.id } })) !== null,
    'one click on Remove does NOT delete the photograph',
  );
  check(
    await page.eval(`Boolean([...document.querySelectorAll('[role="alert"]')].find((el) => /remove this photograph/i.test(el.textContent || '')))`),
    'it asks first, naming what it is about to remove',
  );

  await page.eval(`(() => {
    const target = [...document.querySelectorAll('form')].find((f) => {
      const id = f.querySelector('input[name="id"]');
      return id && id.value === ${JSON.stringify(doomed.id)};
    });
    if (!target) return false;
    const go = [...target.querySelectorAll('button')]
      .find((b) => /^(remove|delete)$/i.test((b.textContent || '').trim()));
    if (!go) return false;
    go.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 2500));

  check(
    (await prisma.galleryItem.findUnique({ where: { id: doomed.id } })) === null,
    'the record is gone from the database',
  );
  const gone = await waitForPublic('/gallery', (h) => !h.includes('to be deleted'));
  check(gone.ok, 'and gone from the public page', `after ${gone.attempt} request(s)`);

  // Deleting the same record twice must not 500.
  const again = await fetch(`${BASE}/admin/gallery`, {
    method: 'POST',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE },
    body: `id=${doomed.id}`,
    redirect: 'manual',
  });
  await again.text().catch(() => '');
  check(again.status < 500, 'deleting an already-deleted record does not 500', `status ${again.status}`);
}

/* =========================================================== 9. AUDIT LOG = */

section('9. EVERY MUTATION IS AUDITED');
{
  /*
    Phase 12 found `signed_out` claimed as audited while the row was silently
    discarded by a CHECK constraint on the action name. So this reads the actual
    stored rows rather than trusting that `recordAudit` was called.
  */
  /*
    ⚠ THE COLUMN IS `at`, NOT `createdAt`.

    An earlier version of this section used `createdAt` and threw a Prisma
    validation error mid-suite — which at least failed loudly. The Phase 12
    failure was the quiet version of the same class: `signed_out` was CLAIMED
    as audited while the row was silently discarded by
    `audit_log_action_known`. So this reads the stored rows and checks the
    actions against that constraint's own vocabulary.
  */
  const rows = await prisma.auditLog.findMany({
    where: { entity: 'GalleryItem' },
    select: { action: true, entityId: true, summary: true, at: true },
    orderBy: { at: 'desc' },
    take: 200,
  });

  check(rows.length > 0, 'audit rows exist for GalleryItem', `${rows.length} row(s)`);
  const actions = new Set(rows.map((r) => r.action));
  for (const wanted of ['created', 'published', 'updated', 'unpublished', 'deleted']) {
    check(actions.has(wanted), `"${wanted}" was recorded`, [...actions].join(', '));
  }
  check(
    rows.every((r) => typeof r.entityId === 'string' && r.entityId.length > 0),
    'every audit row names the record it concerns',
  );

  // A consent withdrawal is distinguishable from an ordinary edit.
  check(
    rows.some((r) => r.action === 'unpublished' && /permission withdrawn/i.test(r.summary ?? '')),
    'a consent withdrawal is audited as a withdrawal, not as an edit',
  );

  /*
    The rows must SURVIVE. Phase 12's defect was a row that was written and
    then rejected by a CHECK constraint, leaving a log that claimed coverage it
    did not have — so every action recorded here is checked against the
    constraint's permitted vocabulary rather than assumed valid.
  */
  const permitted = new Set([
    'created', 'updated', 'published', 'unpublished', 'deleted',
    'signed_in', 'signed_out', 'imported',
  ]);
  check(
    [...actions].every((a) => permitted.has(a)),
    'every recorded action is one the database constraint permits',
    [...actions].join(', '),
  );

  // The audit log must not carry content — only the action and the id.
  check(
    rows.every((r) => !(r.summary ?? '').includes(P)),
    'no audit summary contains the record content',
  );
}

/* ============================================ 10. THE PUBLIC ENDPOINT ===== */

section('10. THE PUBLIC PAGE UNDER ATTACK');
{
  const PROBES = [
    '?category=CLASSROOMS',
    '?category=NOT_A_CATEGORY',
    '?category=',
    '?category=' + 'x'.repeat(4000),
    '?category=CLASSROOMS&category=EVENTS',
    '?category=%00CLASSROOMS',
    '?category=../../etc/passwd',
    '?category=<script>alert(1)</script>',
    "?category='%20OR%201=1--",
    '?category[]=CLASSROOMS',
    '?page=-1',
    '?page=999999999999999999999',
    '?category=CLASSROOMS#frag',
  ];

  for (const probe of PROBES) {
    const res = await fetch(`${BASE}/gallery${probe}`);
    const body = await res.text();
    const label = probe.slice(0, 38);
    check(res.status === 200, `200 for ${label}`, `status ${res.status}`);
    check(
      !/at .*\(\/|node_modules|PrismaClient|stack trace|Internal Server Error/i.test(body),
      `no stack trace or internal detail for ${label}`,
    );
    check(
      !body.includes('<script>alert(1)</script>'),
      `nothing reflected unescaped for ${label}`,
    );
  }

  // Not one hidden photograph leaks through any of them.
  const hidden = await prisma.galleryItem.findMany({
    where: { alt: { startsWith: P } },
    select: { alt: true, imageUrl: true, published: true, showsPeople: true, consentRef: true, consentPhoto: true },
  });
  const mustNotAppear = hidden.filter((r) => !isGalleryItemPublic(r));
  /*
    ⚠ A HIDDEN ROW IS IDENTIFIED BY ITS ALT TEXT, NOT BY ITS IMAGE URL.

    Matching on `imageUrl` reported a leak that did not exist. Media keys are
    CONTENT HASHES, so uploading the same fixture photograph for a public row
    and for a hidden row produces the SAME `/media/<hash>.jpg` for both — the
    URL was on the page because of the public row, and the check blamed the
    hidden one. A false positive on a privacy assertion is not harmless: it
    trains whoever reads it next to discount the one check that matters.

    `alt` is unique per row, required, non-blank by CHECK constraint, and is
    rendered verbatim into the page, so it identifies a row exactly. The image
    URL is still checked, but only for URLs that NO public row uses.
  */
  const publicUrls = new Set(
    (
      await prisma.galleryItem.findMany({
        where: { alt: { startsWith: P } },
        select: { alt: true, imageUrl: true, published: true, showsPeople: true, consentRef: true, consentPhoto: true },
      })
    )
      .filter((r) => isGalleryItemPublic(r))
      .map((r) => r.imageUrl),
  );

  let leaked = [];
  for (const probe of PROBES) {
    const body = await (await fetch(`${BASE}/gallery${probe}`)).text();
    for (const row of mustNotAppear) {
      if (body.includes(row.alt)) {
        leaked.push(`${probe} -> TEXT ${row.alt.slice(0, 30)}`);
      }
      if (row.imageUrl && !publicUrls.has(row.imageUrl) && body.includes(row.imageUrl)) {
        leaked.push(`${probe} -> URL ${row.alt.slice(0, 30)}`);
      }
    }
  }
  check(
    leaked.length === 0,
    'no non-public photograph is reachable through any query string',
    leaked.slice(0, 3).join(' | '),
  );
  check(
    mustNotAppear.length > 0,
    'control: there ARE non-public rows to leak, so the check above is not vacuous',
    `${mustNotAppear.length} hidden row(s)`,
  );
}

/* ============================================ 11. LIGHTBOX ACCESSIBILITY == */

section('11. THE VIEWER IS OPERABLE AND ACCESSIBLE');
{
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/gallery`);
  await new Promise((r) => setTimeout(r, 900));

  const tiles = Number(await page.eval(`String(document.querySelectorAll('main button[aria-haspopup="dialog"]').length)`));
  check(tiles > 1, 'control: there are tiles to open', `${tiles} tile(s)`);

  const semantics = JSON.parse(
    await page.eval(`(() => {
      const dialog = document.querySelector('dialog');
      const tiles = [...document.querySelectorAll('main button[aria-haspopup="dialog"]')];
      return JSON.stringify({
        isNativeDialog: Boolean(dialog),
        dialogOpenAtRest: dialog ? dialog.open : null,
        dialogHasName: dialog ? Boolean(dialog.getAttribute('aria-label')) : false,
        tilesAreButtons: tiles.every((t) => t.tagName === 'BUTTON'),
        divButtons: document.querySelectorAll('div[onclick], span[onclick]').length,
        imagesWithAlt: [...document.querySelectorAll('main img')].every((i) => i.hasAttribute('alt')),
        emptyAlts: [...document.querySelectorAll('main img')].filter((i) => (i.getAttribute('alt') || '').trim() === '').length,
        lazyImages: [...document.querySelectorAll('main img')].filter((i) => i.loading === 'lazy').length,
        totalImages: document.querySelectorAll('main img').length,
      });
    })()`),
  );

  check(semantics.isNativeDialog, 'the viewer is a native <dialog>, not a div');
  check(semantics.dialogOpenAtRest === false, 'and it is closed at rest');
  check(semantics.dialogHasName, 'the dialog has an accessible name');
  check(semantics.tilesAreButtons, 'every tile is a real button');
  check(semantics.divButtons === 0, 'no div is being used as a button');
  check(semantics.imagesWithAlt, 'every gallery image has an alt attribute');
  check(
    semantics.emptyAlts === 0,
    'and none of them is empty — alt text is required by the form',
    `${semantics.emptyAlts} empty`,
  );
  check(
    semantics.lazyImages > 0,
    'gallery images are lazily loaded',
    `${semantics.lazyImages}/${semantics.totalImages} lazy`,
  );

  // Open it by KEYBOARD, which is the case a mouse test never reaches.
  const opened = await page.eval(`(() => {
    const tile = document.querySelector('main button[aria-haspopup="dialog"]');
    tile.id = 'zzgal-opener';
    tile.focus();
    tile.click();
    return String(document.activeElement === tile);
  })()`);
  check(opened === 'true', 'control: a tile can take focus and be activated');
  await new Promise((r) => setTimeout(r, 500));

  const whileOpen = JSON.parse(
    await page.eval(`(() => {
      const dialog = document.querySelector('dialog');
      return JSON.stringify({
        open: dialog.open,
        // showModal() puts the dialog in the top layer; a non-modal open() does not.
        isModal: dialog.matches(':modal'),
        focusInside: dialog.contains(document.activeElement),
        hasCloseControl: Boolean([...dialog.querySelectorAll('button')].find((b) => /close/i.test(b.textContent))),
        position: (dialog.textContent.match(/Photograph \\d+ of \\d+/) || [''])[0],
      });
    })()`),
  );
  check(whileOpen.open, 'the viewer opens');
  check(whileOpen.isModal, 'as a MODAL dialog, so the page behind is inert');
  check(whileOpen.focusInside, 'and focus moves inside it');
  check(whileOpen.hasCloseControl, 'it has a visible Close control');
  check(whileOpen.position.length > 0, 'and says which photograph of how many', whileOpen.position);

  // Arrow keys move between photographs.
  const positionNow = () =>
    page.eval(`(() => {
      const m = document.querySelector('dialog').textContent.match(/Photograph (\\d+) of/);
      return m ? m[1] : '';
    })()`);

  const beforeArrow = await positionNow();
  await page.eval(`(() => {
    document.querySelector('dialog').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  const afterArrow = await positionNow();
  check(
    beforeArrow !== afterArrow && afterArrow !== '',
    'ArrowRight moves to the next photograph',
    `${beforeArrow} -> ${afterArrow}`,
  );

  // Escape closes it, and focus goes back to the tile that opened it.
  await page.eval(`(() => { document.querySelector('dialog').close(); return true; })()`);
  await new Promise((r) => setTimeout(r, 400));
  const afterClose = JSON.parse(
    await page.eval(`(() => JSON.stringify({
      open: document.querySelector('dialog').open,
      focusReturned: document.activeElement && document.activeElement.id === 'zzgal-opener',
      activeTag: document.activeElement ? document.activeElement.tagName : 'NONE',
    }))()`),
  );
  check(afterClose.open === false, 'closing the viewer closes it');
  check(
    afterClose.focusReturned,
    'and focus returns to the tile that opened it',
    `focus on ${afterClose.activeTag}`,
  );

  // Heading structure and console cleanliness.
  const headings = JSON.parse(
    await page.eval(`(() => {
      const hs = [...document.querySelectorAll('h1, h2, h3, h4')].map((h) => Number(h.tagName[1]));
      let jump = false;
      for (let i = 1; i < hs.length; i += 1) if (hs[i] - hs[i - 1] > 1) jump = true;
      return JSON.stringify({ h1: document.querySelectorAll('h1').length, jump });
    })()`),
  );
  check(headings.h1 === 1, 'the page has exactly one h1', String(headings.h1));
  check(!headings.jump, 'heading levels do not skip a level');
}

/* ============================================== 12. RESPONSIVE ============ */

section('12. RESPONSIVE');
{
  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1280]) {
    await page.viewport(width, 800, { mobile: width < 640 });
    for (const route of ['/gallery', '/', '/admin/gallery', '/admin/gallery/new']) {
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

  // The open viewer must also fit, which is the state a page test never sees.
  await page.viewport(320, 800, { mobile: true });
  await page.goto(`${BASE}/gallery`);
  await new Promise((r) => setTimeout(r, 700));
  await page.eval(`(() => {
    const t = document.querySelector('main button[aria-haspopup="dialog"]');
    if (t) t.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  const openBox = JSON.parse(
    await page.eval(`(() => {
      const d = document.querySelector('dialog');
      const r = d.getBoundingClientRect();
      return JSON.stringify({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        overflowsRight: r.right > window.innerWidth + 1,
        wider: d.scrollWidth > d.clientWidth + 1,
      });
    })()`),
  );
  check(openBox.scroll <= openBox.client, '320px the open viewer does not widen the page', `${openBox.scroll} > ${openBox.client}`);
  check(!openBox.overflowsRight, 'and does not hang off the right edge');
  check(!openBox.wider, 'and does not scroll sideways inside itself');

  // Touch targets, with the two WCAG 2.5.8 exceptions the other suites apply.
  for (const route of ['/gallery', '/admin/gallery']) {
    await page.goto(BASE + route);
    const small = JSON.parse(
      await page.eval(`(() => {
        const out = [];
        for (const el of document.querySelectorAll('a[href], button:not([disabled]), input[type=submit]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const s = getComputedStyle(el);
          if (s.clipPath === 'inset(50%)' || (r.width <= 1 && r.height <= 1)) continue;
          if (el.closest('p, li') && s.display === 'inline') continue;
          if (r.width < 24 || r.height < 24) {
            out.push(el.tagName.toLowerCase() + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          }
        }
        return JSON.stringify(out.slice(0, 5));
      })()`),
    );
    check(small.length === 0, `320px ${route} touch targets meet 24x24`, small.join(' | '));
  }
}

/* ============================================== 13. PERFORMANCE ========== */

section('13. IMAGE PERFORMANCE');
{
  await page.viewport(390, 844, { mobile: true });
  await page.goto(`${BASE}/gallery`);
  await new Promise((r) => setTimeout(r, 2500));

  const perf = JSON.parse(
    await page.eval(`(() => {
      const res = performance.getEntriesByType('resource');
      const imgs = res.filter((e) => e.initiatorType === 'img' || /\\/_next\\/image/.test(e.name));
      const bytes = res.reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0);
      const widths = [...document.querySelectorAll('main img')].map((i) => Math.round(i.getBoundingClientRect().width));
      return JSON.stringify({
        requests: res.length,
        imageRequests: imgs.length,
        imageBytes: Math.round(imgs.reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0) / 1024),
        totalKB: Math.round(bytes / 1024),
        renderedWidths: widths,
        oversized: [...document.querySelectorAll('main img')].filter((i) => {
          const shown = i.getBoundingClientRect().width;
          return shown > 0 && i.naturalWidth > shown * 3;
        }).length,
      });
    })()`),
  );

  console.log(
    `  measured: ${perf.requests} requests, ${perf.imageRequests} image requests, ` +
      `${perf.imageBytes} KB of images, ${perf.totalKB} KB total at 390px`,
  );
  check(
    perf.imageRequests <= 12,
    'a phone does not request every photograph at once',
    `${perf.imageRequests} image request(s)`,
  );
  check(
    perf.oversized === 0,
    'no image is served more than 3x the size it is displayed at',
    `${perf.oversized} oversized`,
  );
  check(perf.totalKB < 1200, 'the page stays under 1.2 MB on a phone', `${perf.totalKB} KB`);

  const shift = JSON.parse(
    await page.eval(`(() => {
      let cls = 0;
      for (const e of performance.getEntriesByType('layout-shift') || []) {
        if (!e.hadRecentInput) cls += e.value;
      }
      return JSON.stringify({ cls: Number(cls.toFixed(4)) });
    })()`),
  );
  check(shift.cls < 0.1, 'and the grid does not shift as photographs arrive', `CLS ${shift.cls}`);
}

/* ================================================================ CLEANUP = */

section('14. CLEANUP');
{
  const removed = await prisma.galleryItem.deleteMany({ where: mine });
  console.log(`  removed ${removed.count} ZZGAL row(s)`);
  check((await countMine()) === 0, 'every ZZGAL row was removed');

  // The demo data must be untouched: this suite only ever owns ZZGAL.
  const zzshow = await prisma.galleryItem.count({ where: { alt: { startsWith: 'ZZSHOW' } } });
  console.log(`  ZZSHOW demo rows still present: ${zzshow}`);

  await page.close();
  await browser.close();
  await rm(dir, { recursive: true, force: true });
  await prisma.$disconnect();
}

console.log('\n========================================================');
console.log(`GALLERY VERIFICATION: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('========================================================');

exit(fail === 0 ? 0 : 1);
