/**
 * Videos, attacked.
 *
 * =============================================================================
 * WHAT THIS SUITE IS ACTUALLY FOR
 * =============================================================================
 * A stored value on this table becomes the `src` of an IFRAME. That is the
 * whole risk: everything else here is a website. So the suite spends most of
 * its assertions on one question — can anything a teacher types become a URL
 * the browser loads? — and answers it at the action, at the database, and in a
 * real browser.
 *
 * The second question is third-party cost. A video page that embeds six players
 * on load makes every visitor pay for YouTube's code whether or not they watch
 * anything, so the suite measures requests by ORIGIN before and after a click.
 *
 * =============================================================================
 * SECTION 0 IS NOT CEREMONY
 * =============================================================================
 * Every "the attack was refused" assertion below is only meaningful because
 * section 0 proves the suite can WRITE and that the server under test actually
 * contains Topic 9. Phase 16 has produced suites whose negative checks passed
 * because nothing was happening: two that never wrote, one that served a stale
 * build, one whose cache clear silently failed, and one that blamed a hidden
 * row for a public row's content-addressed URL. All of them looked green.
 *
 * Usage:
 *   DATABASE_URL=... ADMIN_PASSWORD=... BASE_URL=http://localhost:3000 \
 *     node scripts/verify-videos.mjs
 */

import { env, exit } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { launch } from './browser.mjs';
import { parseYouTubeId, isYouTubeId } from '../src/lib/video.ts';

const BASE = env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = env.ADMIN_EMAIL ?? 'admin@localhost.invalid';
const PASSWORD = env.ADMIN_PASSWORD ?? '';

/** Unmistakably synthetic, and the only rows this suite ever touches. */
const P = 'ZZVID';

/** Structurally valid ids that cannot be a real video. */
const ID = (n) => `ZZVID${String(n).padStart(6, '0')}`;

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
  console.error('DATABASE_URL is not set. This suite reads the videos table directly.');
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

const mine = { title: { startsWith: P } };
const countMine = () => prisma.video.count({ where: mine });

/* ---------------------------------------------------------- start clean -- */

await prisma.video.deleteMany({ where: mine });
await prisma.video.deleteMany({ where: { youtubeId: { startsWith: 'ZZVID' } } });

/* -------------------------------------------------------------- browser -- */

const browser = await launch(env.BROWSER ?? 'chrome');
const page = await browser.page();
await page.viewport(1280, 900);

/**
 * Every field lookup is scoped to the FORM.
 *
 * ⚠ `document.querySelector('[name="description"]')` RETURNS THE <meta> TAG.
 *
 * The document head carries `<meta name="description">`, which matches that
 * selector and comes first in document order — so an unscoped lookup set the
 * value of a meta tag, threw "Illegal invocation" on the input-element setter,
 * and would have silently filled the wrong element for any name that collides
 * with a meta tag. No previous suite hit it because no previous form had a
 * field called `description`.
 */
/** Set a controlled input the way a person would, so React sees the change. */
function setField(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify('form ' + selector)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
}

/** A <select> needs its own descriptor and a change event. */
function setSelect(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify('form ' + selector)});
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

async function fillVideo({
  url,
  title,
  description = '',
  subject = 'ECONOMICS',
  priority = null,
  publish = false,
}) {
  await page.eval(setField('[name="youtubeUrl"]', url));
  await page.eval(setField('[name="title"]', title));
  await page.eval(setField('[name="description"]', description));
  await page.eval(setSelect('[name="subject"]', subject));
  if (priority !== null) await page.eval(setField('[name="priority"]', String(priority)));
  await page.eval(setCheckbox('v-published', publish));
}

/* ============================================================ 0. CONTROL == */

section('0. THE SERVER HAS TOPIC 9, AND THIS SUITE CAN WRITE');
{
  /*
    BUILD FRESHNESS FIRST. Topic 7 spent an hour reporting layout failures
    against source that had already been fixed, because `next start` was serving
    a `.next` from before the fix. A suite that cannot tell which build it is
    measuring is not measuring anything.
  */
  const pub = await fetch(`${BASE}/videos`, { redirect: 'manual' });
  check(pub.status === 200, 'the running server serves /videos', `status ${pub.status}`);
  const adm = await fetch(`${BASE}/admin/videos`, { redirect: 'manual' });
  check(
    adm.status === 307 || adm.status === 302,
    'and /admin/videos exists and is behind auth',
    `status ${adm.status}`,
  );
  if (pub.status !== 200 || adm.status === 404) {
    console.error('\nThe server under test does not contain Topic 9. Rebuild before running.');
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

await page.goto(`${BASE}/admin/videos/new`);
await fillVideo({
  url: `https://www.youtube.com/watch?v=${ID(1)}`,
  title: `${P} control video`,
  description: `${P} control description.`,
  subject: 'ECONOMICS',
  priority: 500,
  publish: true,
});
await page.submitForm('[name="title"]', 4000);

const control = await prisma.video.findFirst({ where: mine });
check(Boolean(control), 'a video record was created through the admin');
check(control?.published === true, 'and it was published');
check(control?.youtubeId === ID(1), 'and the id was extracted from the URL', control?.youtubeId);
check(control?.subject === 'ECONOMICS', 'with the subject chosen');
check((await countMine()) === 1, 'exactly one ZZVID record exists, so later counts are meaningful');

const controlLive = await waitForPublic('/videos', (h) => h.includes(`${P} control video`));
check(
  controlLive.ok,
  'and a logged-out visitor can see it on /videos',
  `after ${controlLive.attempt} request(s)`,
);

/* ================================================ 1. URL VALIDATION ======= */

section('1. ONLY A YOUTUBE VIDEO REFERENCE SURVIVES THE MUTATION BOUNDARY');
{
  /*
    The parser is unit-tested exhaustively in tests/video.test.ts. What THIS
    section proves is different and cannot be proved by a unit test: that the
    parser is actually wired into the endpoint a teacher reaches, that nothing
    else in the action bypasses it, and that a refused value creates no row.
  */
  const HOSTILE = [
    // Wrong host, including the three that defeat a substring check.
    'https://evil.example/watch?v=' + ID(9),
    'https://youtube.com.evil.example/watch?v=' + ID(9),
    'https://evil.example/youtube.com/watch?v=' + ID(9),
    'https://www.youtube.com@evil.example/watch?v=' + ID(9),
    // Schemes.
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'http://www.youtube.com/watch?v=' + ID(9),
    // Protocol-relative.
    '//www.youtube.com/watch?v=' + ID(9),
    // Raw embed HTML — the input the field must never accept.
    '<iframe src="https://www.youtube.com/embed/' + ID(9) + '"></iframe>',
    '<iframe src="https://evil.example/x"></iframe>',
    '"><iframe src="https://evil.example">',
    // Loopback and metadata, in case anything ever fetches.
    'https://127.0.0.1/watch?v=' + ID(9),
    'https://localhost/watch?v=' + ID(9),
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/watch?v=' + ID(9),
    // Malformed ids on a good host.
    'https://www.youtube.com/watch?v=tooshort',
    'https://www.youtube.com/watch?v=' + 'a'.repeat(12),
    'https://www.youtube.com/@somechannel',
    'https://www.youtube.com/results?search_query=x',
    // Nonsense.
    'not a url',
    'x'.repeat(600),
  ];

  const before = await countMine();
  let stored = [];
  for (const hostile of HOSTILE) {
    await page.goto(`${BASE}/admin/videos/new`);
    await fillVideo({
      url: hostile,
      title: `${P} hostile url probe`,
      subject: 'ECONOMICS',
      publish: true,
    });
    await page.submitForm('[name="title"]', 2500);

    const made = await prisma.video.findFirst({
      where: { title: { startsWith: `${P} hostile url probe` } },
    });
    if (made) {
      stored.push(`${hostile.slice(0, 40)} -> ${made.youtubeId}`);
      await prisma.video.delete({ where: { id: made.id } });
    }
    check(made === null, `refused: ${hostile.slice(0, 44)}`, made ? `STORED ${made.youtubeId}` : '');
  }
  check(
    (await countMine()) === before,
    'not one hostile value created a record',
    `${before} -> ${await countMine()}`,
  );

  // POSITIVE CONTROL: the legitimate shapes still work through the same form.
  for (const [n, url] of [
    [21, `https://youtu.be/${ID(21)}`],
    [22, `https://www.youtube.com/embed/${ID(22)}`],
    [23, `https://www.youtube.com/shorts/${ID(23)}`],
    [24, `https://www.youtube.com/watch?v=${ID(24)}&list=PLx&t=30s&si=TRACKER`],
  ]) {
    await page.goto(`${BASE}/admin/videos/new`);
    await fillVideo({ url, title: `${P} accepted shape ${n}`, subject: 'OTHER' });
    await page.submitForm('[name="title"]', 3000);
    const made = await prisma.video.findFirst({ where: { title: `${P} accepted shape ${n}` } });
    check(made?.youtubeId === ID(n), `control: ${url.slice(0, 44)} stores the id`, made?.youtubeId);
  }

  // And the tracking parameters were thrown away rather than stored.
  const tracked = await prisma.video.findFirst({ where: { title: `${P} accepted shape 24` } });
  check(
    tracked?.youtubeId === ID(24),
    'the playlist, timestamp and tracking token were discarded',
    tracked?.youtubeId,
  );
  check(
    !JSON.stringify(tracked ?? {}).includes('TRACKER'),
    'and no part of the tracking token is stored anywhere on the row',
  );
}

section('1b. THE DATABASE REFUSES A BAD ID TOO');
{
  /*
    The action is the gate a teacher meets. This is the gate everything else
    meets — a direct query, a future import, a script written in a hurry.
  */
  const base = { title: `${P} direct write probe`, subject: 'ECONOMICS' };
  for (const [label, id] of [
    ['a full URL', 'https://youtu.be/' + ID(9)],
    ['iframe html', '<iframe src=x>'],
    ['javascript scheme', 'javascript:1'],
    ['ten characters', 'aaaaaaaaaa'],
    ['twelve characters', 'aaaaaaaaaaaa'],
    ['a dot', 'aaaaaaaaaa.'],
    ['a slash', 'aaaa/aaaaaa'],
  ]) {
    let refused = false;
    let constraint = '';
    try {
      const made = await prisma.video.create({ data: { ...base, youtubeId: id }, select: { id: true } });
      await prisma.video.delete({ where: { id: made.id } });
    } catch (error) {
      refused = true;
      constraint = (String(error.message).match(/videos_[a-z_]+/) ?? [''])[0];
    }
    check(refused, `a direct write with ${label} is refused by the database`, constraint);
  }

  // POSITIVE CONTROL: the constraint is not simply rejecting everything.
  let accepted = false;
  try {
    const made = await prisma.video.create({
      data: { ...base, youtubeId: ID(31) },
      select: { id: true },
    });
    await prisma.video.delete({ where: { id: made.id } });
    accepted = true;
  } catch {
    accepted = false;
  }
  check(accepted, 'control: a legitimate eleven-character id IS accepted');
}

/* ============================================ 2. NO IFRAME UNTIL A CLICK == */

section('2. NO IFRAME EXISTS UNTIL A VISITOR ASKS FOR ONE');
{
  /*
    ⚠ THIRD-PARTY CONTACT IS MEASURED WITH CDP, NOT `performance`.

    `performance.getEntriesByType('resource')` reports resources of the TOP
    document. A cross-origin iframe's own navigation is not reliably one of
    them: this suite recorded youtube-nocookie once and then, on a later run,
    recorded NO third-party origin at all while an iframe pointing at it sat in
    the DOM. That direction of error is the dangerous one — it would have
    reported "YouTube is never contacted", the most flattering possible wrong
    answer, and Topic 10 hit exactly the same blind spot.

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
  await page.goto(`${BASE}/videos`);
  await new Promise((r) => setTimeout(r, 2500));

  const initial = JSON.parse(
    await page.eval(`(() => {
      const res = performance.getEntriesByType('resource');
      const origins = {};
      for (const e of res) { try { origins[new URL(e.name).origin] = (origins[new URL(e.name).origin] || 0) + 1; } catch (err) {} }
      return JSON.stringify({
        requests: res.length,
        origins,
        iframes: document.querySelectorAll('iframe').length,
        players: document.querySelectorAll('button[aria-label^="Play video"]').length,
        thirdParty: [],
      });
    })()`),
  );
  initial.thirdParty = thirdPartyHosts();

  check(initial.players > 0, 'control: there are video posters to press', `${initial.players}`);
  check(initial.iframes === 0, 'NO iframe is present on initial load', `${initial.iframes} iframe(s)`);
  check(
    initial.thirdParty.length === 0,
    'and the browser contacts NO third-party host at all before a click',
    initial.thirdParty.join(', ') || 'zero third-party origins',
  );
  console.log(`  measured: ${initial.requests} requests on load, all same-origin`);

  // Now press play on exactly one video.
  const clicked = await page.eval(`(() => {
    const btn = document.querySelector('button[aria-label^="Play video"]');
    if (!btn) return 'none';
    btn.click();
    return 'clicked';
  })()`);
  check(clicked === 'clicked', 'control: a poster was actually pressed');
  await new Promise((r) => setTimeout(r, 3500));

  const after = JSON.parse(
    await page.eval(`(() => {
      const res = performance.getEntriesByType('resource');
      const origins = {};
      for (const e of res) { try { origins[new URL(e.name).origin] = (origins[new URL(e.name).origin] || 0) + 1; } catch (err) {} }
      const frames = [...document.querySelectorAll('iframe')];
      return JSON.stringify({
        requests: res.length,
        thirdParty: [],
        iframes: frames.length,
        srcs: frames.map((f) => f.src),
        allows: frames.map((f) => f.getAttribute('allow') || ''),
        sandboxes: frames.map((f) => f.getAttribute('sandbox')),
        titles: frames.map((f) => f.getAttribute('title') || ''),
      });
    })()`),
  );

  after.thirdParty = thirdPartyHosts();
  check(after.iframes === 1, 'exactly ONE iframe is created — not one per video', `${after.iframes}`);
  check(
    after.srcs.every((s) => s.startsWith('https://www.youtube-nocookie.com/embed/')),
    'and it points at youtube-nocookie.com',
    after.srcs[0],
  );
  check(
    after.thirdParty.length > 0 &&
      after.thirdParty.every((h) => h.endsWith('youtube-nocookie.com')),
    'the only third-party host contacted is the nocookie one',
    after.thirdParty.join(', ') || 'none recorded',
  );
  check(
    after.allows.every((a) => !/clipboard|gyroscope|accelerometer|web-share|camera|microphone|geolocation|payment|\*/.test(a)),
    'the allow list grants nothing beyond playback',
    after.allows[0],
  );
  check(after.titles.every((t) => t.length > 0), 'the iframe has a title, so it has a name');
  console.log(
    `  measured: ${initial.requests} requests before the click, ${after.requests} after ` +
      `(+${after.requests - initial.requests})`,
  );
}

/* ================================================= 3. CSP IS ENFORCED ===== */

section('3. THE CSP REFUSES A FRAME FROM ANYWHERE ELSE');
{
  /*
    The application never creates such a frame — every src is built from an id.
    This proves the BROWSER would refuse one anyway, which is what makes
    `frame-src` a control rather than a comment. Injecting it from script is the
    only way to test the header without shipping a defect to test against.
  */
  await page.goto(`${BASE}/videos`);
  await new Promise((r) => setTimeout(r, 800));

  /*
    ⚠ DETECTED BY `securitypolicyviolation`, NOT BY `onload`.

    The first version of this check resolved "loaded" when the iframe's onload
    fired — and a CSP-blocked frame STILL fires onload, on the empty document
    the browser substitutes. So both frames reported "loaded" and the suite
    claimed the CSP was not enforced when it demonstrably was.

    The violation event is the authoritative signal: the browser emits one, with
    the blocked URI and the directive that refused it, precisely when it refuses.
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
    await add('https://www.youtube.com/embed/dQw4w9WgXcQ');
    await add('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    return JSON.stringify({ violations });
  })()`, true);

  const csp = JSON.parse(verdict);
  const blocked = csp.violations.join(' | ');
  check(
    csp.violations.some((v) => v.includes('example.com') && v.includes('frame-src')),
    'a frame from an unlisted origin is blocked by frame-src',
    blocked,
  );
  check(
    csp.violations.some((v) => v.includes('www.youtube.com') && v.includes('frame-src')),
    'and even www.youtube.com is blocked — only the nocookie origin is allowed',
    blocked,
  );
  check(
    !csp.violations.some((v) => v.includes('youtube-nocookie')),
    'control: the nocookie origin is NOT blocked, so the policy is not refusing everything',
    blocked,
  );

  // The header itself, read from the response rather than from the config file.
  const headers = (await fetch(`${BASE}/videos`)).headers;
  const policy = headers.get('content-security-policy') ?? '';
  const frameSrc = (policy.match(/frame-src ([^;]*)/) ?? ['', ''])[1].trim();
  check(
    frameSrc.includes('https://www.youtube-nocookie.com'),
    'frame-src names the nocookie origin',
    frameSrc,
  );
  check(!/frame-src[^;]*\*/.test(policy), 'frame-src contains no wildcard');
  check(
    !/frame-src[^;]*\bhttps:(\s|;|$)/.test(policy),
    'and no blanket https: source',
  );
  check(
    !policy.includes('www.youtube.com'),
    'plain www.youtube.com is NOT in the policy',
  );
}

/* ================================== 4. PUBLICATION AND REVALIDATION ======= */

section('4. PUBLISHING AND UNPUBLISHING REACH THE PUBLIC PAGE');
{
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/admin/videos/new`);
  await fillVideo({
    url: `https://youtu.be/${ID(41)}`,
    title: `${P} lifecycle video`,
    subject: 'ECONOMICS',
    publish: false,
  });
  await page.submitForm('[name="title"]', 3500);

  const draft = await prisma.video.findFirst({ where: { title: `${P} lifecycle video` } });
  check(draft?.published === false, 'a draft is saved unpublished');
  check(
    !(await publicHtml('/videos')).includes(`${P} lifecycle video`),
    'and a logged-out visitor cannot see it',
  );

  // Publish it.
  await page.goto(`${BASE}/admin/videos/${draft.id}`);
  await page.eval(setCheckbox('v-published', true));
  await page.submitForm('[name="title"]', 3500);

  const live = await prisma.video.findUnique({ where: { id: draft.id } });
  check(live?.published === true, 'publishing sets the flag');
  const seen = await waitForPublic('/videos', (h) => h.includes(`${P} lifecycle video`));
  check(seen.ok, 'and it appears publicly', `after ${seen.attempt} request(s)`);

  // Unpublish it.
  await page.goto(`${BASE}/admin/videos/${draft.id}`);
  await page.eval(setCheckbox('v-published', false));
  await page.submitForm('[name="title"]', 3500);

  const down = await prisma.video.findUnique({ where: { id: draft.id } });
  check(down?.published === false, 'unpublishing clears the flag');
  const gone = await waitForPublic('/videos', (h) => !h.includes(`${P} lifecycle video`));
  check(gone.ok, 'and it disappears from the public page', `after ${gone.attempt} request(s)`);
  check(Boolean(down), 'the record itself still exists — nothing was destroyed');
}

/* ===================================================== 5. STALE EDIT ====== */

section('5. A STALE FORM CANNOT REPUBLISH AN UNPUBLISHED VIDEO');
{
  const item = await prisma.video.create({
    data: {
      youtubeId: ID(51),
      title: `${P} stale edit subject`,
      subject: 'ECONOMICS',
      published: true,
    },
  });

  // Tab A loads the form while the video is published.
  await page.goto(`${BASE}/admin/videos/${item.id}`);
  const token = await page.eval(
    `document.querySelector('[name="editedAt"]') ? document.querySelector('[name="editedAt"]').value : ''`,
  );
  check(token.length > 0, 'control: the form carries a version token', token.slice(0, 24));

  // Meanwhile it is taken down elsewhere.
  await prisma.video.update({ where: { id: item.id }, data: { published: false } });

  // Tab A saves, unchanged — every field still as it was, including published.
  await page.submitForm('[name="title"]', 4000);

  const after = await prisma.video.findUnique({ where: { id: item.id } });
  check(after?.published === false, 'the stale save did NOT republish the video');
  check(
    /Someone changed this record/i.test(await page.eval('document.body.innerText')),
    'and the teacher is told what happened',
  );
  check(
    !(await publicHtml('/videos')).includes(`${P} stale edit subject`),
    'the video is still absent from the public page',
  );

  // Tab B's change survives a stale overwrite of a different field.
  await prisma.video.update({ where: { id: item.id }, data: { title: `${P} changed elsewhere` } });
  await page.goto(`${BASE}/admin/videos/${item.id}`);
  const fresh = await prisma.video.findUnique({ where: { id: item.id } });
  await prisma.video.update({
    where: { id: item.id },
    data: { title: `${P} changed again by the other tab` },
  });
  await page.eval(setField('[name="title"]', `${P} stale overwrite attempt`));
  await page.submitForm('[name="title"]', 4000);
  const final = await prisma.video.findUnique({ where: { id: item.id } });
  check(
    final?.title === `${P} changed again by the other tab`,
    "the other tab's change survived",
    final?.title,
  );
  check(fresh !== null, 'control: the row existed before the race');

  /*
    A MISSING token is treated as stale too.

    ⚠ The token is stripped LAST, immediately before submitting. Topic 8 stripped
    it first and then clicked a checkbox; each click is a React state update and
    the re-render restored the controlled hidden input, so the attack undid
    itself and the suite reported a failure that was really the harness.
  */
  await page.goto(`${BASE}/admin/videos/${item.id}`);
  await page.eval(setCheckbox('v-published', true));
  const stripped = await page.eval(`(() => {
    const t = document.querySelector('[name="editedAt"]');
    if (!t) return 'missing';
    t.value = '';
    return t.value === '' ? 'stripped' : 'restored';
  })()`);
  check(stripped === 'stripped', 'control: the version token really was removed', stripped);
  await page.submitForm('[name="title"]', 4000);

  const after2 = await prisma.video.findUnique({ where: { id: item.id } });
  check(
    after2?.published === false,
    'a save with the version token stripped is refused as stale',
    `published=${after2?.published}`,
  );
}

/* ========================================= 6. AUTHORISATION, CSRF, IDOR === */

section('6. AUTHORISATION, CSRF AND IDOR');
{
  /*
    ⚠ THIS ATTACKS THE DELETE FORM RATHER THAN THE SAVE ACTION, for the reason
    verify-faculty.mjs records: `saveVideo` is driven by `useActionState`, so
    React encodes a bound previous-state argument that a hand-built payload
    cannot reproduce, and Next answers a malformed action body with a 500 —
    which says nothing about authorisation.

    `deleteVideo` takes only FormData and is rendered as a real <form>, so its
    `$ACTION_*` fields can be read out of the served HTML. Every replay below is
    a genuine invocation of a genuine destructive endpoint.
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

  const victim = await prisma.video.create({
    data: { youtubeId: ID(61), title: `${P} victim, do not delete`, subject: 'OTHER' },
    select: { id: true },
  });

  const listHtml = await (
    await fetch(`${BASE}/admin/videos`, { headers: { Cookie: adminCookie } })
  ).text();
  const fields = deleteFormFields(listHtml, victim.id);
  check(Boolean(fields), 'read the real delete-form payload out of the served HTML');

  async function postDelete(overrides, { cookie, origin } = {}) {
    const boundary = '----zzvid' + Math.random().toString(16).slice(2);
    const CRLF = String.fromCharCode(13, 10);
    let body = '';
    for (const [k, v] of Object.entries({ ...fields, ...overrides })) {
      body += `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
    }
    body += `--${boundary}--${CRLF}`;
    const res = await fetch(`${BASE}/admin/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Origin: origin ?? BASE,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
      redirect: 'manual',
    });
    await res.text().catch(() => '');
    return res;
  }

  const alive = async () => (await prisma.video.findUnique({ where: { id: victim.id } })) !== null;

  if (fields) {
    // (a) No cookie. The PROXY refuses at the edge — a real defence, named as
    //     what it actually is rather than credited to the action.
    const anon = await postDelete({});
    check(
      anon.status === 307 || anon.status === 302,
      'an anonymous delete is redirected at the edge',
      `status ${anon.status}`,
    );
    check(await alive(), 'and the record survives');

    // (b) A cookie that exists but is forged. This gets PAST the proxy, so the
    //     ACTION is what must refuse it.
    const forged = await postDelete({}, { cookie: 'ci_admin_session=forged.value.here' });
    check(forged.status < 500, 'a forged session reaches the action and is handled', `status ${forged.status}`);
    check(await alive(), 'and the action refuses it — the record survives');

    // (c) Real session, foreign origin.
    const csrf = await postDelete({}, { cookie: adminCookie, origin: 'https://attacker.example' });
    check(csrf.status >= 400, 'a cross-origin delete is refused outright', `status ${csrf.status}`);
    check(await alive(), 'and the record survives');

    // (d) IDOR: ids we never issued must select nothing.
    const before = await prisma.video.count();
    for (const badId of [
      '../../etc/passwd',
      "'; DROP TABLE videos; --",
      'x'.repeat(500),
      '{"$ne":null}',
      '1 OR 1=1',
      '',
    ]) {
      await postDelete({ id: badId }, { cookie: adminCookie });
    }
    const afterBad = await prisma.video.count();
    check(afterBad === before, 'malformed ids delete nothing', `${before} -> ${afterBad}`);
    check(await alive(), 'and the victim is untouched');
  }

  // The edit route must refuse ids we never issued rather than 500.
  for (const badId of ['../../etc/passwd', 'x'.repeat(300), '%2e%2e%2f', 'null']) {
    const res = await fetch(`${BASE}/admin/videos/${encodeURIComponent(badId)}`, {
      headers: { Cookie: adminCookie },
      redirect: 'manual',
    });
    await res.text().catch(() => '');
    check(res.status !== 500, `a malformed id on the edit route does not 500 (${badId.slice(0, 14)})`, `status ${res.status}`);
  }

  // Anonymous access to every video admin route.
  for (const route of ['/admin/videos', '/admin/videos/new', `/admin/videos/${victim.id}`]) {
    const res = await fetch(BASE + route, { redirect: 'manual' });
    await res.text().catch(() => '');
    check(
      res.status === 307 || res.status === 302,
      `anonymous ${route} is redirected`,
      `status ${res.status}`,
    );
  }
}

/* ================================================================ 7. XSS == */

section('7. TEACHER-ENTERED TEXT STAYS TEXT');
{
  const PAYLOADS = [
    '<script>window.__zzvid_xss=1</script>',
    '<img src=x onerror="window.__zzvid_xss=1">',
    '"><svg onload="window.__zzvid_xss=1">',
    '</script><script>window.__zzvid_xss=1</script>',
    '<iframe src="https://evil.example/pwn"></iframe>',
  ];

  await page.goto(`${BASE}/admin/videos/new`);
  await fillVideo({
    url: `https://youtu.be/${ID(71)}`,
    title: `${P} xss ${PAYLOADS[0]}${PAYLOADS[1]}`,
    description: `${P} desc ${PAYLOADS[2]}${PAYLOADS[3]}${PAYLOADS[4]}`,
    subject: 'OTHER',
    publish: true,
  });
  await page.submitForm('[name="title"]', 4000);

  const stored = await prisma.video.findFirst({ where: { title: { startsWith: `${P} xss` } } });
  check(Boolean(stored), 'control: the XSS record was stored, so the payloads reach the page');

  const live = await waitForPublic('/videos', (h) => h.includes(`${P} xss`));
  check(live.ok, 'control: and it renders publicly', `after ${live.attempt} request(s)`);

  check(
    !live.html.includes('<script>window.__zzvid_xss'),
    'the script payload is not present as live markup',
  );
  check(
    !/onerror="window\.__zzvid_xss/.test(live.html),
    'the event-handler payload is not present as a live attribute',
  );
  check(live.html.includes('&lt;script&gt;'), 'it is escaped instead', 'entity-encoded');

  // The decisive check: a real browser, and whether anything executed.
  await page.goto(`${BASE}/videos`);
  await new Promise((r) => setTimeout(r, 1200));
  const executed = await page.eval('String(window.__zzvid_xss === 1)');
  check(executed === 'false', 'and NOTHING executed in a real browser', `flag=${executed}`);

  // The injected <iframe> payload must not have become a frame.
  const frames = JSON.parse(
    await page.eval(`JSON.stringify([...document.querySelectorAll('iframe')].map((f) => f.src))`),
  );
  check(
    frames.every((s) => !s.includes('evil.example')),
    'the injected iframe payload did not become a frame',
    frames.join(' | ') || 'no frames at all',
  );
  check(frames.length === 0, 'in fact no frame exists at all before a click', `${frames.length}`);
}

/* ====================================== 8. REQUIRED VS OPTIONAL FIELDS ==== */

section('8. REQUIRED MEANS REQUIRED, OPTIONAL MEANS OPTIONAL');
{
  /*
    The project has already shipped a field whose help text said "optional"
    while validation refused it empty. Both directions are checked here.
  */
  await page.goto(`${BASE}/admin/videos/new`);
  const formText = await page.eval('document.body.innerText');
  check(/Optional/i.test(formText), 'the description is labelled optional');

  // OPTIONAL: saving with no description succeeds.
  await fillVideo({
    url: `https://youtu.be/${ID(81)}`,
    title: `${P} no description at all`,
    description: '',
    subject: 'OTHER',
  });
  await page.submitForm('[name="title"]', 3500);
  const noDesc = await prisma.video.findFirst({ where: { title: `${P} no description at all` } });
  check(Boolean(noDesc), 'a video with no description SAVES');
  check(noDesc?.description === null, 'and the empty description is stored as null');

  // REQUIRED: no title is refused.
  await page.goto(`${BASE}/admin/videos/new`);
  await fillVideo({ url: `https://youtu.be/${ID(82)}`, title: '   ', subject: 'OTHER' });
  await page.submitForm('[name="title"]', 3000);
  const blank = await prisma.video.count({ where: { youtubeId: ID(82) } });
  check(blank === 0, 'a video with a blank title is refused');
  check(
    /Give the video a title/i.test(await page.eval('document.body.innerText')),
    'and the message says what to do',
  );

  // REQUIRED: no URL is refused.
  await page.goto(`${BASE}/admin/videos/new`);
  await fillVideo({ url: '', title: `${P} no url`, subject: 'OTHER' });
  await page.submitForm('[name="title"]', 3000);
  check(
    (await prisma.video.count({ where: { title: `${P} no url` } })) === 0,
    'a video with no link is refused',
  );

  // REQUIRED: no subject is refused.
  await page.goto(`${BASE}/admin/videos/new`);
  await fillVideo({ url: `https://youtu.be/${ID(83)}`, title: `${P} no subject`, subject: '' });
  await page.submitForm('[name="title"]', 3000);
  check(
    (await prisma.video.count({ where: { youtubeId: ID(83) } })) === 0,
    'a video with no subject is refused',
  );
}

section('8b. THE SAME VIDEO CANNOT BE ADDED TWICE');
{
  await page.goto(`${BASE}/admin/videos/new`);
  await fillVideo({
    url: `https://www.youtube.com/watch?v=${ID(1)}`,
    title: `${P} duplicate attempt`,
    subject: 'OTHER',
  });
  await page.submitForm('[name="title"]', 3500);

  check(
    (await prisma.video.count({ where: { youtubeId: ID(1) } })) === 1,
    'the duplicate did not create a second row',
  );
  check(
    /already/i.test(await page.eval('document.body.innerText')),
    'and the teacher is told it is already on the list',
  );
}

/* ============================================================ 9. DELETION = */

section('9. DELETION');
{
  const doomed = await prisma.video.create({
    data: { youtubeId: ID(91), title: `${P} to be deleted`, subject: 'OTHER', published: true },
    select: { id: true },
  });

  const shown = await waitForPublic('/videos', (h) => h.includes(`${P} to be deleted`));
  check(shown.ok, 'control: it is public before the delete', `after ${shown.attempt} request(s)`);

  await page.goto(`${BASE}/admin/videos`);
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

    Topic 11 found this video list deleting on a single click with no
    confirmation of any kind, while announcements, batches, stories and results
    all asked first. `DeleteButton` now gives every one of them the same inline
    question, so the suite drives two clicks - and asserts the first one did
    nothing, because a test that only proves deletion works would have passed
    against the defect.
  */
  check(
    (await prisma.video.findUnique({ where: { id: doomed.id } })) !== null,
    'one click on Remove does NOT delete the video',
  );
  check(
    await page.eval(`Boolean([...document.querySelectorAll('[role="alert"]')].find((el) => /remove this video/i.test(el.textContent || '')))`),
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
    (await prisma.video.findUnique({ where: { id: doomed.id } })) === null,
    'the record is gone from the database',
  );
  const gone = await waitForPublic('/videos', (h) => !h.includes(`${P} to be deleted`));
  check(gone.ok, 'and gone from the public page', `after ${gone.attempt} request(s)`);

  const again = await fetch(`${BASE}/admin/videos`, {
    method: 'POST',
    headers: {
      Cookie: adminCookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE,
    },
    body: `id=${doomed.id}`,
    redirect: 'manual',
  });
  await again.text().catch(() => '');
  check(again.status < 500, 'deleting an already-deleted record does not 500', `status ${again.status}`);
}

/* =========================================================== 10. AUDIT === */

section('10. EVERY MUTATION IS AUDITED');
{
  /*
    Phase 12 found `signed_out` claimed as audited while the row was silently
    discarded by a CHECK constraint on the action name. So this reads the stored
    rows — and the column is `at`, not `createdAt`, which Topic 8 learned the
    loud way.
  */
  const rows = await prisma.auditLog.findMany({
    where: { entity: 'Video' },
    select: { action: true, entityId: true, summary: true, at: true },
    orderBy: { at: 'desc' },
    take: 200,
  });

  check(rows.length > 0, 'audit rows exist for Video', `${rows.length} row(s)`);
  const actions = new Set(rows.map((r) => r.action));
  for (const wanted of ['created', 'published', 'unpublished', 'deleted']) {
    check(actions.has(wanted), `"${wanted}" was recorded`, [...actions].join(', '));
  }
  check(
    rows.every((r) => typeof r.entityId === 'string' && r.entityId.length > 0),
    'every audit row names the record it concerns',
  );

  const permitted = new Set([
    'created', 'updated', 'published', 'unpublished', 'deleted',
    'signed_in', 'signed_out', 'imported',
  ]);
  check(
    [...actions].every((a) => permitted.has(a)),
    'every recorded action is one the database constraint permits',
    [...actions].join(', '),
  );
  check(
    rows.every((r) => !(r.summary ?? '').includes(P)),
    'no audit summary contains the record content',
  );
}

/* ============================================ 11. THE PUBLIC ENDPOINT ==== */

section('11. THE PUBLIC PAGE UNDER ATTACK');
{
  const PROBES = [
    '?subject=ECONOMICS',
    '?subject=NOT_A_SUBJECT',
    '?subject=',
    '?subject=' + 'x'.repeat(4000),
    '?subject=ECONOMICS&subject=OTHER',
    '?subject=%00ECONOMICS',
    '?subject=../../etc/passwd',
    '?subject=<script>alert(1)</script>',
    "?subject='%20OR%201=1--",
    '?subject[]=ECONOMICS',
    '?page=-1',
    '?page=999999999999999999999',
  ];

  for (const probe of PROBES) {
    const res = await fetch(`${BASE}/videos${probe}`);
    const body = await res.text();
    const label = probe.slice(0, 34);
    check(res.status === 200, `200 for ${label}`, `status ${res.status}`);
    check(
      !/at .*\(\/|node_modules|PrismaClient|Internal Server Error/i.test(body),
      `no stack trace or internal detail for ${label}`,
    );
    check(!body.includes('<script>alert(1)</script>'), `nothing reflected unescaped for ${label}`);
    check(!body.includes('<iframe'), `and no iframe is served for ${label}`);
  }

  // No unpublished video leaks through any of them.
  const hidden = await prisma.video.findMany({
    where: { published: false },
    select: { title: true, youtubeId: true },
  });
  let leaked = [];
  for (const probe of PROBES) {
    const body = await (await fetch(`${BASE}/videos${probe}`)).text();
    for (const row of hidden) {
      if (body.includes(row.title)) leaked.push(`${probe} -> ${row.title.slice(0, 28)}`);
    }
  }
  check(
    leaked.length === 0,
    'no unpublished video is reachable through any query string',
    leaked.slice(0, 3).join(' | '),
  );
  check(
    hidden.length > 0,
    'control: there ARE unpublished rows to leak, so the check above is not vacuous',
    `${hidden.length} hidden row(s)`,
  );

  // Every id that reached the page is one we would accept back.
  const html = await publicHtml('/videos');
  const ids = [...html.matchAll(/i\.ytimg\.com%2Fvi%2F([^%]+)%2F/g)].map((m) => m[1]);
  check(ids.length > 0, 'control: thumbnails are on the page', `${ids.length} found`);
  check(
    ids.every((id) => isYouTubeId(id)),
    'every id in the rendered page is a valid YouTube id',
    ids.filter((id) => !isYouTubeId(id)).join(', ') || 'all valid',
  );
  check(
    ids.every((id) => parseYouTubeId(id) === id),
    'and each round-trips through the parser unchanged',
  );
}

/* ======================================== 12. ACCESSIBILITY + RESPONSIVE == */

section('12. ACCESSIBLE AND RESPONSIVE');
{
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/videos`);
  await new Promise((r) => setTimeout(r, 1200));

  const a11y = JSON.parse(
    await page.eval(`(() => {
      const players = [...document.querySelectorAll('button[aria-label^="Play video"]')];
      const cards = [...document.querySelectorAll('article')];
      const headings = [...document.querySelectorAll('h1, h2, h3, h4')].map((h) => Number(h.tagName[1]));
      let jump = false;
      for (let i = 1; i < headings.length; i += 1) if (headings[i] - headings[i - 1] > 1) jump = true;
      /*
        SCOPED TO main, DELIBERATELY.

        The footer WhatsApp link, the agency credit and the floating WhatsApp
        button are also target=_blank and are site chrome predating this topic.
        They carry rel=noopener but do NOT announce the new tab, which is
        recorded as an observation in the Topic 9 report rather than fixed here.
        Widening this assertion would be asserting against three elements Topic
        9 did not add.

        No backticks or dollar signs in this comment: it sits inside a template
        literal, and either one ends or interpolates it.
      */
      const external = [...document.querySelectorAll('main a[target="_blank"]')];
      return JSON.stringify({
        players: players.length,
        named: players.filter((b) => (b.getAttribute('aria-label') || '').length > 12).length,
        cards: cards.length,
        cardsWithoutHeading: cards.filter((c) => !c.querySelector('h2, h3, h4')).length,
        h1: document.querySelectorAll('h1').length,
        jump,
        imgsWithoutAlt: [...document.querySelectorAll('main img')].filter((i) => !i.hasAttribute('alt')).length,
        divButtons: document.querySelectorAll('div[onclick], span[onclick]').length,
        positiveTabindex: [...document.querySelectorAll('[tabindex]')].map((e) => Number(e.getAttribute('tabindex'))).filter((n) => n > 0).length,
        externalLinks: external.length,
        externalSafe: external.filter((a) => (a.getAttribute('rel') || '').includes('noopener')).length,
        externalAnnounced: external.filter((a) => /new tab/i.test(a.textContent || '')).length,
      });
    })()`),
  );

  check(a11y.players > 0, 'control: there are players to check', `${a11y.players}`);
  check(a11y.named === a11y.players, 'every play control has a descriptive name', `${a11y.named}/${a11y.players}`);
  check(a11y.cardsWithoutHeading === 0, 'every video card is headed', `${a11y.cardsWithoutHeading}`);
  check(a11y.h1 === 1, 'the page has exactly one h1', String(a11y.h1));
  check(!a11y.jump, 'heading levels do not skip a level');
  check(a11y.imgsWithoutAlt === 0, 'no image is missing an alt attribute');
  check(a11y.divButtons === 0, 'no div is being used as a button');
  check(a11y.positiveTabindex === 0, 'no positive tabindex rewrites the focus order');
  check(
    a11y.externalLinks > 0 && a11y.externalSafe === a11y.externalLinks,
    'every link that leaves the site carries rel=noopener',
    `${a11y.externalSafe}/${a11y.externalLinks}`,
  );
  check(
    a11y.externalAnnounced === a11y.externalLinks,
    'and says it opens in a new tab',
    `${a11y.externalAnnounced}/${a11y.externalLinks}`,
  );

  // Keyboard: the poster can be reached and activated without a mouse.
  const keyboard = await page.eval(`(() => {
    const btn = document.querySelector('button[aria-label^="Play video"]');
    btn.focus();
    const focused = document.activeElement === btn;
    btn.click();
    return JSON.stringify({ focused, becameFrame: Boolean(document.querySelector('iframe')) });
  })()`);
  const kb = JSON.parse(keyboard);
  await new Promise((r) => setTimeout(r, 1500));
  check(kb.focused, 'a play control can take keyboard focus');
  check(
    Boolean(await page.eval(`String(Boolean(document.querySelector('iframe')))`)) &&
      (await page.eval(`String(Boolean(document.querySelector('iframe')))`)) === 'true',
    'and activating it creates the player',
  );

  // Responsive.
  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1280]) {
    await page.viewport(width, 800, { mobile: width < 640 });
    for (const route of ['/videos', '/', '/admin/videos', '/admin/videos/new']) {
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

  // The PLAYING state must also fit — a state a page test never reaches.
  await page.viewport(320, 800, { mobile: true });
  await page.goto(`${BASE}/videos`);
  await new Promise((r) => setTimeout(r, 900));
  await page.eval(`(() => {
    const b = document.querySelector('button[aria-label^="Play video"]');
    if (b) b.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 2000));
  const playingBox = JSON.parse(
    await page.eval(`(() => {
      const f = document.querySelector('iframe');
      const r = f ? f.getBoundingClientRect() : null;
      return JSON.stringify({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        frameRight: r ? Math.round(r.right) : 0,
        frameWidth: r ? Math.round(r.width) : 0,
        viewport: window.innerWidth,
      });
    })()`),
  );
  check(
    playingBox.scroll <= playingBox.client,
    '320px an open player does not widen the page',
    `${playingBox.scroll} > ${playingBox.client}`,
  );
  check(
    playingBox.frameWidth > 0 && playingBox.frameRight <= playingBox.viewport + 1,
    'and the iframe stays inside the viewport',
    `right ${playingBox.frameRight} vs ${playingBox.viewport}`,
  );

  // Touch targets.
  for (const route of ['/videos', '/admin/videos']) {
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

/* ================================================================ CLEANUP = */

section('13. CLEANUP');
{
  const removed = await prisma.video.deleteMany({ where: mine });
  console.log(`  removed ${removed.count} ZZVID row(s)`);
  const stragglers = await prisma.video.deleteMany({
    where: { youtubeId: { startsWith: 'ZZVID' } },
  });
  if (stragglers.count > 0) console.log(`  removed ${stragglers.count} straggler(s) by id`);
  check((await countMine()) === 0, 'every ZZVID row was removed');
  check(
    (await prisma.video.count({ where: { youtubeId: { startsWith: 'ZZVID' } } })) === 0,
    'and none survives under a ZZVID id either',
  );

  const zzshow = await prisma.video.count({ where: { title: { startsWith: 'ZZSHOW' } } });
  console.log(`  ZZSHOW demo rows still present: ${zzshow}`);

  await page.close();
  await browser.close();
  await prisma.$disconnect();
}

console.log('\n========================================================');
console.log(`VIDEOS VERIFICATION: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('========================================================');

exit(fail === 0 ? 0 : 1);
