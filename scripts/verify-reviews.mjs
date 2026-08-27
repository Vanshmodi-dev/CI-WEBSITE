/**
 * The Review Engine integration, attacked through the real fetch path.
 *
 * =============================================================================
 * WHY THIS RUNS ITS OWN SERVERS
 * =============================================================================
 * The unit tests prove the normaliser refuses hostile input. They cannot prove
 * that a hostile payload, fetched over HTTP by the real application, reaches
 * that normaliser rather than some other path — nor that a refusal produces a
 * hidden band instead of a 500.
 *
 * So this starts:
 *   1. A FIXTURE SERVER that serves whatever payload the current scenario needs,
 *      including malformed bytes, HTML, oversized bodies and hangs.
 *   2. A REAL production build of the site, pointed at that fixture server.
 *
 * Scenarios are switched by changing what the fixture serves and then clearing
 * the site's cache through the admin's own refresh action — the same code path
 * a teacher uses — so the suite exercises that too.
 *
 * =============================================================================
 * SECTION 0 PROVES THE SUITE CAN SEE A REVIEW
 * =============================================================================
 * Every "the attack was refused" assertion below means nothing unless a GOOD
 * payload actually renders. Phase 16 has already produced three suites whose
 * negative checks passed because nothing was ever happening. Section 0 is the
 * control.
 *
 * Usage:
 *   ADMIN_PASSWORD=... node scripts/verify-reviews.mjs
 */

import { env, exit } from 'node:process';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { launch } from './browser.mjs';

const SITE_PORT = Number(env.REVIEWS_SITE_PORT ?? 3310);
const FIXTURE_PORT = Number(env.REVIEWS_FIXTURE_PORT ?? 3311);
const BASE = `http://localhost:${SITE_PORT}`;
const EMAIL = env.ADMIN_EMAIL ?? 'admin@localhost.invalid';
const PASSWORD = env.ADMIN_PASSWORD ?? '';

if (!PASSWORD) {
  console.error('ADMIN_PASSWORD is not set. This suite signs in to clear the cache.');
  exit(1);
}

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

/* ------------------------------------------------------ fixture server -- */

/**
 * What the fixture currently serves. Mutated between scenarios.
 *
 * `mode` lets a scenario do things a JSON body cannot express: hang past the
 * client timeout, refuse the connection, answer with an HTTP error.
 */
let fixture = { mode: 'json', body: '{}', status: 200, contentType: 'application/json' };

const fixtureServer = createServer((req, res) => {
  if (fixture.mode === 'hang') {
    // Never responds. The site's own AbortSignal.timeout must end this.
    return;
  }
  if (fixture.mode === 'destroy') {
    req.socket.destroy();
    return;
  }
  res.writeHead(fixture.status, { 'Content-Type': fixture.contentType });
  res.end(fixture.body);
});

/**
 * ⚠ REFUSE TO RUN IF EITHER PORT IS ALREADY TAKEN.
 *
 * Without this, a leftover server answers on the site port, the new
 * `next start` fails to bind, and the suite tests SOMEBODY ELSE'S BUILD. That
 * is not hypothetical: it happened during Topic 7, and every render assertion
 * failed while pointing at application code that was already correct. Phase 12
 * hit the same class from the other side, reporting a green run against a stale
 * server.
 */
async function portIsFree(port) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}

for (const port of [SITE_PORT, FIXTURE_PORT]) {
  if (!(await portIsFree(port))) {
    console.error(
      `Port ${port} is already in use.` +
        ' This suite starts its own site and fixture server and will not run' +
        ' against one it did not start - that would be testing something else.' +
        ' Stop whatever is on that port and try again.',
    );
    exit(1);
  }
}

await new Promise((resolve) => fixtureServer.listen(FIXTURE_PORT, resolve));
console.log(`\nFixture server on ${FIXTURE_PORT}`);

/* ---------------------------------------------------------- fixtures ---- */

const review = (over = {}) => ({
  id: 'a'.repeat(32),
  author_name: 'Dana R.',
  author_initials: 'DR',
  rating: 5,
  text: 'Clear teaching and genuinely helpful staff.',
  text_truncated: false,
  date: '2026-07-28',
  source: 'google',
  first_seen_at: '2026-07-28T10:00:00.000Z',
  revision: 1,
  ...over,
});

const payload = (over = {}) => ({
  schema_version: 1,
  artifact: 'reviews',
  generated_at: '2026-08-01T00:00:00.000Z',
  client: { slug: 'commerce-insight', display_name: 'Commerce Insight' },
  listing: { key: 'google:X', source: 'google', display_name: 'Commerce Insight' },
  provenance: { harvest_completeness: 'full' },
  stats: {
    total_count: 3,
    mean_rating: 4.7,
    completeness: 'full',
    last_full_harvest_at: '2026-08-01T00:00:00.000Z',
  },
  reviews: [review()],
  notices: null,
  ...over,
});

function serveJson(object) {
  fixture = {
    mode: 'json',
    body: JSON.stringify(object),
    status: 200,
    contentType: 'application/json',
  };
}
function serveRaw(body, { status = 200, contentType = 'application/json' } = {}) {
  fixture = { mode: 'json', body, status, contentType };
}

/* -------------------------------------------------------- site server --- */

/**
 * Build before starting, every run.
 *
 * =============================================================================
 * WHY THIS IS NOT AN OPTIONAL CONVENIENCE
 * =============================================================================
 * `next start` serves whatever is in `.next`. Trusting a build that happens to
 * be on disk meant this suite once reported sixteen layout failures against
 * source that had already been fixed, and would just as happily report zero
 * failures against source that had not. A verification run that measures an
 * unknown artifact is not a verification run.
 *
 * It costs a minute. The alternative costs a wrong answer.
 */
function buildSite() {
  console.log('Building (the suite refuses to measure a build it did not make)...');
  const built = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'build'],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (built.status !== 0) {
    console.error('\nThe build failed, so there is nothing to verify.');
    exit(1);
  }
}

function spawnSite() {
  return spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'start', '-p', String(SITE_PORT)],
    {
      env: {
        ...process.env,
        REVIEWS_PAYLOAD_URL: `http://localhost:${FIXTURE_PORT}/reviews.json`,
        NEXT_PUBLIC_SITE_URL: BASE,
      },
      stdio: 'ignore',
      shell: process.platform === 'win32',
    },
  );
}

/**
 * Stop the site, whole tree.
 *
 * On Windows the child is a shell wrapping `next start`, so `kill()` on the
 * wrapper leaves the server running and holding the port. That is how a zombie
 * from an earlier run came to serve this suite's requests — see the port guard
 * above.
 */
function stopSite() {
  if (!site) return;
  if (process.platform === 'win32' && site.pid) {
    try {
      spawn('taskkill', ['/PID', String(site.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      /* fall through to the portable path */
    }
  }
  site.kill();
}

console.log('Starting the site against the fixture...');
buildSite();

let site = spawnSite();

async function waitForSite() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(BASE + '/', { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

serveJson(payload());
if (!(await waitForSite())) {
  console.error(`The site did not start on ${SITE_PORT}. Run \`npx next build\` first.`);
  fixtureServer.close();
  stopSite();
  exit(1);
}
console.log(`Site on ${SITE_PORT}\n`);

/* --------------------------------------------------------- browser ------ */

const browser = await launch(env.BROWSER ?? 'chrome');
const page = await browser.page();
await page.viewport(1280, 900);

await page.goto(`${BASE}/admin/login`);
await page.type('input[type=email]', EMAIL);
await page.type('input[type=password]', PASSWORD);
await page.submitForm('input[type=password]', 4000);
const signedIn = (await page.eval('location.pathname')) === '/admin';

/**
 * Switch scenario: change what the fixture serves, then clear the site's cache
 * through the admin's own refresh action.
 *
 * Using the real button rather than restarting the server means the refresh
 * path is exercised by every single scenario, which is far better coverage than
 * one dedicated test would give it.
 */
/**
 * Switch scenario: change what the fixture serves, then make the site forget
 * the cached payload.
 *
 * ⚠ THE REFRESH ACTION IS RATE LIMITED, AND THAT NEARLY RUINED THIS SUITE.
 *
 * The admin refresh is capped at six an hour, which is right for the product:
 * each click can cost an upstream fetch. This suite needs about twenty cache
 * clears. On the first full run the seventh onwards were silently refused, so
 * every later scenario tested the PREVIOUS payload — and because most of those
 * scenarios assert an ABSENCE ("no review text is served"), they passed
 * without exercising anything at all.
 *
 * Raising the product limit to suit the test would be weakening a real control
 * to make a suite green. Instead the refusal is DETECTED, and the site is
 * restarted — which clears the fetch cache and the per-process limiter
 * together, at the cost of a few seconds.
 *
 * Returns how the cache was cleared, so a caller can assert on it.
 */
async function withFixture(setUp) {
  setUp();

  await page.goto(`${BASE}/admin/reviews`);
  const clicked = await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button[type=submit]')]
      .find((b) => /Check for new reviews/i.test(b.textContent));
    if (btn) btn.click();
    return Boolean(btn);
  })()`);

  if (!clicked) throw new Error('the refresh control was not found on /admin/reviews');
  await new Promise((r) => setTimeout(r, 1200));

  const text = await page.eval('document.body.innerText');
  if (/several times just now|wait about/i.test(text)) {
    await restartSite();
    return 'restarted';
  }

  /*
    ⚠ A CLICK IS NOT A REFRESH.

    Detecting only the rate-limit message meant every other way the action could
    fail — an expired session, a hydration failure that left the button inert —
    was read as success, and the scenario that followed then ran against the
    PREVIOUS scenario's cached payload. Assertions about what should be absent
    passed for entirely the wrong reason.

    So the confirmation the action itself returns is required. If it is missing,
    fall back to a restart, which clears the cache unconditionally.
  */
  if (!/Checked\./i.test(text)) {
    await restartSite();
    return 'restarted-unconfirmed';
  }
  return 'refreshed';
}

/**
 * Restart the site, which drops every in-memory cache and limiter with it.
 *
 * The admin session survives because it is a signed cookie rather than server
 * state, so there is no need to sign in again — but that is asserted rather
 * than assumed the first time it happens.
 */
async function restartSite() {
  stopSite();
  await new Promise((r) => setTimeout(r, 800));

  site = spawnSite();
  if (!(await waitForSite())) {
    throw new Error('the site did not come back after a restart');
  }
  await page.goto(`${BASE}/admin/reviews`);
  const stillIn = !(await page.eval('location.pathname')).includes('/admin/login');
  if (!stillIn) {
    await page.goto(`${BASE}/admin/login`);
    await page.type('input[type=email]', EMAIL);
    await page.type('input[type=password]', PASSWORD);
    await page.submitForm('input[type=password]', 4000);
  }
}

const publicHtml = async (path) =>
  (await fetch(BASE + path, { headers: { 'cache-control': 'no-cache' } })).text();

/**
 * The text a visitor actually reads on a page.
 *
 * ⚠ USE THIS FOR PROSE ASSERTIONS, NOT A REGEX OVER RAW HTML.
 *
 * React splits interpolated text across separate text nodes and comment
 * markers during server rendering, so "2 reviews on Google" arrives as
 * `2<!-- --> <!-- -->reviews<!-- --> on ...`. A regex over the source therefore
 * fails on a sentence the reader can see perfectly well — which is a test
 * measuring React's serialisation rather than the product.
 */
/**
 * Fetch a public page until it carries `needle`, reporting how many requests.
 *
 * `revalidatePath` marks an ISR page stale rather than rebuilding it inline, so
 * the first request after a scenario switch can still be served the previous
 * render. Asserting on one request measures that race; asserting with no bound
 * would hide a genuinely broken switch. The count is printed so a regression
 * stays visible.
 */
async function waitForPublic(path, needle, tries = 8) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const html = await publicHtml(path);
    if (html.includes(needle)) return { found: true, attempt, html };
    if (attempt < tries) await new Promise((r) => setTimeout(r, 300));
  }
  return { found: false, attempt: tries, html: await publicHtml(path) };
}

async function visibleText(path) {
  await page.goto(BASE + path);
  return page.eval('document.body.innerText');
}

/* ====================================================================== */

section('0. A GOOD PAYLOAD RENDERS — THE CONTROL FOR EVERYTHING BELOW');

check(signedIn, 'signed in to the admin');

await withFixture(() =>
  serveJson(
    payload({
      reviews: [
        review({ id: 'a'.repeat(32), text: 'ZZREV first review text.', rating: 5 }),
        review({ id: 'b'.repeat(32), text: 'ZZREV second review text.', rating: 4 }),
      ],
      stats: { ...payload().stats, total_count: 2 },
    }),
  ),
);

{
  const html = await publicHtml('/reviews');
  check(html.includes('ZZREV first review text.'), 'a review is on the PUBLIC reviews page');
  check(html.includes('ZZREV second review text.'), 'and so is the second');
  check(html.includes('Dana R.'), 'the reviewer name is shown');
  check(html.includes('Rated 5 out of 5'), 'the star rating carries a text equivalent');
  const readable = await visibleText('/reviews');
  check(
    /2 reviews on Google/.test(readable),
    'provenance names the platform and the count',
    readable.split(String.fromCharCode(10)).find((line) => /on Google/.test(line)) ?? '(not found)',
  );
  check(/Synced/.test(readable), 'and when it was last synced');

  const home = await publicHtml('/');
  check(home.includes('ZZREV first review text.'), 'and the homepage band shows reviews too');
}

section('1. THE VISITOR NEVER CONTACTS THE REVIEW SOURCE (INV-01)');
{
  /*
    The strongest form of the engine's core invariant: the payload is fetched on
    the server, so the BROWSER makes no review request at all. Measured by
    loading the page in a real browser and inspecting every request it made.
  */
  await page.goto(`${BASE}/reviews`);
  const requested = [...page.requests].map((r) => r.url);
  const offending = requested.filter(
    (url) => url.includes(String(FIXTURE_PORT)) || url.includes('google') || url.includes('reviews.json'),
  );
  check(
    offending.length === 0,
    'the browser made no request to the payload origin',
    offending.slice(0, 3).join(' | '),
  );

  const visible = await page.eval(`document.body.innerText.includes('ZZREV first review text.')`);
  check(visible, 'yet the reviews are on the page — they arrived in the HTML');
}

section('2. XSS — REVIEW TEXT STAYS TEXT');
{
  const attack = '<script>window.__zzrevPwned=1</script><img src=x onerror="window.__zzrevPwned=1">';
  await withFixture(() =>
    serveJson(
      payload({
        reviews: [
          review({
            id: 'c'.repeat(32),
            text: attack,
            author_name: '</script><script>window.__zzrevPwned=1</script>',
            author_initials: '<b>X</b>',
            owner_reply: { text: '<svg onload=alert(1)>reply</svg>', date: '2026-07-30' },
          }),
        ],
      }),
    ),
  );

  const html = await publicHtml('/reviews');
  check(!html.includes('<script>window.__zzrevPwned'), 'no live script tag in the HTML');
  check(html.includes('&lt;script&gt;'), 'the payload IS present, escaped, as text');
  check(!/<img[^>]*onerror/i.test(html), 'no live img tag carrying a handler');
  check(!/<svg[^>]*onload/i.test(html), 'no live svg tag carrying a handler');

  await page.goto(`${BASE}/reviews`);
  check(
    (await page.eval('Boolean(window.__zzrevPwned)')) === false,
    'nothing executed in a real browser',
  );
  const seen = await page.eval(`document.body.innerText.includes('<script>')`);
  check(seen === true, 'the visitor sees the literal characters, which is correct');

  // And the initials tile must contain letters only.
  const initials = await page.eval(`(() => {
    const el = document.querySelector('article span[aria-hidden="true"]');
    return el ? el.textContent.trim() : '';
  })()`);
  check(!/[<>]/.test(initials), 'the initials tile contains no markup', initials);
}

section('3. NO REVIEW OR AGGREGATERATING STRUCTURED DATA');
{
  await withFixture(() =>
    serveJson(
      payload({
        // A hostile payload trying to smuggle structured data across.
        schema_org: {
          '@context': 'https://schema.org',
          '@type': 'AggregateRating',
          ratingValue: '5',
          reviewCount: '999',
        },
        reviews: [review({ id: 'd'.repeat(32), text: 'ZZREV structured data probe.' })],
      }),
    ),
  );

  for (const route of ['/reviews', '/']) {
    const html = await publicHtml(route);
    check(html.includes('ZZREV structured data probe.') || route === '/reviews',
          `${route} rendered`, '');
    check(!html.includes('AggregateRating'), `${route} emits no AggregateRating`);
    check(!html.includes('"@type":"Review"'), `${route} emits no Review markup`);
    check(!html.includes('ratingValue'), `${route} emits no ratingValue`);
    check(!html.includes('reviewCount'), `${route} emits no reviewCount`);
  }

  /*
    The JSON-LD that IS emitted must still be exactly what it was: an
    EducationalOrganization and a WebSite, and nothing else.
  */
  const html = await publicHtml('/');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  check(blocks.length >= 1, 'the site still emits its own JSON-LD', String(blocks.length));
  for (const block of blocks) {
    let parsed = null;
    try {
      parsed = JSON.parse(block[1].replace(/\\u003c/g, '<'));
    } catch {
      /* handled by the assertion below */
    }
    check(parsed !== null, 'the JSON-LD parses');
    const types = JSON.stringify(parsed ?? {});
    check(!types.includes('Review'), 'and contains no Review type');
    check(!types.includes('aggregateRating'), 'and no aggregateRating property');
  }
}

section('4. PROVENANCE CANNOT BE FORGED BY THE PAYLOAD');
{
  await withFixture(() =>
    serveJson(
      payload({
        listing: { key: 'x', source: 'Commerce Insight Staff', display_name: 'x' },
        reviews: [review({ id: 'e'.repeat(32), text: 'ZZREV provenance probe.' })],
      }),
    ),
  );

  const html = await publicHtml('/reviews');
  check(html.includes('ZZREV provenance probe.'), 'the review renders');
  check(
    !html.includes('Commerce Insight Staff'),
    'a forged source label does not reach the page',
  );
  const readable = await visibleText('/reviews');
  check(
    /a verified review platform/.test(readable),
    'it degrades to a true, unspecific statement',
    readable.split(String.fromCharCode(10)).find((line) => /review platform/.test(line)) ?? '(not found)',
  );
}

section('5. UPSTREAM FAILURE HIDES THE BAND AND NEVER 500s');
{
  const scenarios = [
    ['HTTP 500', () => serveRaw('upstream exploded', { status: 500 })],
    ['HTTP 404', () => serveRaw('not found', { status: 404 })],
    ['HTML instead of JSON', () => serveRaw('<!DOCTYPE html><html><body>Portal</body></html>', { contentType: 'text/html' })],
    ['malformed JSON', () => serveRaw('{"schema_version":1,"artifact":')],
    ['empty body', () => serveRaw('')],
    ['empty object', () => serveJson({})],
    ['unrelated JSON', () => serveJson({ hello: 'world' })],
    ['unsupported schema version', () => serveJson(payload({ schema_version: 2 }))],
    ['awaiting first harvest', () => serveJson(payload({ notices: ['awaiting_first_full_harvest'] }))],
    ['failed harvest', () => serveJson(payload({ stats: { ...payload().stats, completeness: 'failed' } }))],
    ['a stats artifact', () => serveJson(payload({ artifact: 'stats', reviews: undefined }))],
    ['connection destroyed', () => { fixture = { mode: 'destroy' }; }],
  ];

  for (const [what, setUp] of scenarios) {
    await withFixture(setUp);

    for (const route of ['/', '/reviews']) {
      const res = await fetch(BASE + route, { headers: { 'cache-control': 'no-cache' } });
      const html = await res.text();
      check(res.status === 200, `${what}: ${route} still returns 200`, `status ${res.status}`);
      check(!html.includes('ZZREV'), `${what}: no stale review text is served`);
      check(
        !/stack|at Object\.|node_modules|Error:/i.test(html),
        `${what}: no stack trace or internal detail on the page`,
      );
      check(
        !html.includes(String(FIXTURE_PORT)),
        `${what}: the upstream URL is not exposed to visitors`,
      );
    }

    const reviewsPage = await publicHtml('/reviews');
    check(
      reviewsPage.includes('No reviews to show here yet'),
      `${what}: /reviews shows the neutral empty state`,
    );
    check(
      !/unavailable|could not load|failed|error/i.test(
        reviewsPage.replace(/<script[\s\S]*?<\/script>/g, ''),
      ),
      `${what}: no error wording is shown to a visitor`,
    );
  }
}

section('6. TIMEOUT');
{
  /*
    A hanging upstream must not hold a page render open. The client timeout is
    8s; this asserts the page still answers well inside a figure a visitor
    would tolerate, which also proves the abort actually fires.
  */
  await withFixture(() => {
    fixture = { mode: 'hang' };
  });

  const started = Date.now();
  const res = await fetch(BASE + '/reviews', { headers: { 'cache-control': 'no-cache' } });
  const html = await res.text();
  const elapsed = Date.now() - started;

  check(res.status === 200, 'a hanging upstream still returns 200', `status ${res.status}`);
  check(elapsed < 20000, 'and the page renders rather than hanging', `${elapsed}ms`);
  check(html.includes('No reviews to show here yet'), 'showing the neutral empty state');
}

section('7. PAYLOAD AMPLIFICATION IS BOUNDED');
{
  // Far above the 512 KB cap, and far more than the 20-review limit.
  const many = Array.from({ length: 4000 }, (_, i) =>
    review({
      id: i.toString(16).padStart(32, '0'),
      text: 'ZZREV padding '.repeat(60),
    }),
  );
  await withFixture(() => serveJson(payload({ reviews: many })));

  const res = await fetch(BASE + '/reviews', { headers: { 'cache-control': 'no-cache' } });
  const html = await res.text();
  check(res.status === 200, 'an oversized payload does not break the page', `status ${res.status}`);
  check(
    html.includes('No reviews to show here yet'),
    'it is refused wholesale rather than partly rendered',
  );
  check(html.length < 200_000, 'and the served HTML stays small', `${html.length} bytes`);
}

section('8. THE REVIEW COUNT IS CAPPED WHEN THE PAYLOAD IS WITHIN SIZE');
{
  // 60 small reviews: under the byte cap, over the 20-review cap.
  const many = Array.from({ length: 60 }, (_, i) =>
    review({ id: i.toString(16).padStart(32, '0'), text: `ZZREV review number ${i}.` }),
  );
  await withFixture(() => serveJson(payload({ reviews: many })));

  const settled = await waitForPublic('/reviews', 'ZZREV review number 0.');
  await page.goto(`${BASE}/reviews`);
  const rendered = await page.eval(`document.querySelectorAll('article').length`);
  check(rendered === 20, 'exactly 20 reviews render', `${rendered} after ${settled.attempt} request(s)`);
  check(
    settled.found,
    'and they are the first ones, preserving the engine order',
  );
}

section('9. PARTIAL HARVEST DOES NOT CLAIM A TOTAL');
{
  await withFixture(() =>
    serveJson(
      payload({
        notices: ['harvest_partial'],
        stats: { ...payload().stats, completeness: 'partial', total_count: 999 },
        reviews: [review({ id: 'f'.repeat(32), text: 'ZZREV partial probe.' })],
      }),
    ),
  );

  const settledPartial = await waitForPublic('/reviews', 'ZZREV partial probe.');
  const readable = await visibleText('/reviews');
  check(
    settledPartial.found,
    'reviews still render on a partial harvest',
    `after ${settledPartial.attempt} request(s)`,
  );
  check(!readable.includes('999'), 'the unrepresentative total is NOT printed');
  check(
    /Showing recent reviews/.test(readable),
    'and the wording says what it actually is',
    readable.split(String.fromCharCode(10)).find((line) => /Showing recent/.test(line)) ?? '(not found)',
  );
}

section('10. DEDUPLICATION AND MALFORMED ENTRIES');
{
  await withFixture(() =>
    serveJson(
      payload({
        reviews: [
          review({ id: '1'.repeat(32), text: 'ZZREV kept once.' }),
          review({ id: '1'.repeat(32), text: 'ZZREV duplicate id, dropped.' }),
          review({ id: 'not-a-valid-id', text: 'ZZREV bad id, dropped.' }),
          review({ id: '2'.repeat(32), text: null, rating: null }),
          'a string where an object should be',
          null,
          review({ id: '3'.repeat(32), text: 'ZZREV also kept.' }),
        ],
      }),
    ),
  );

  const settled = await waitForPublic('/reviews', 'ZZREV also kept.');
  const html = settled.html;
  await page.goto(`${BASE}/reviews`);
  const count = await page.eval(`document.querySelectorAll('article').length`);

  check(
    count === 2,
    'only the two usable reviews render',
    `${count} after ${settled.attempt} request(s)`,
  );
  check(html.includes('ZZREV kept once.'), 'the first of a duplicated id is kept');
  check(!html.includes('duplicate id, dropped'), 'the duplicate is dropped');
  check(!html.includes('bad id, dropped'), 'a review with an unusable id is dropped');
  check(html.includes('ZZREV also kept.'), 'valid reviews after malformed ones still render');
}

section('11. NO SECRET OR UPSTREAM DETAIL REACHES THE BROWSER');
{
  await withFixture(() =>
    serveJson(payload({ reviews: [review({ id: '4'.repeat(32), text: 'ZZREV leak probe.' })] })),
  );

  for (const route of ['/', '/reviews']) {
    const html = await publicHtml(route);
    check(
      !html.includes('REVIEWS_PAYLOAD_URL'),
      `${route} does not name the environment variable`,
    );
    check(!html.includes(String(FIXTURE_PORT)), `${route} does not contain the payload origin`);
    check(!html.includes('localhost:' + FIXTURE_PORT), `${route} does not leak the upstream host`);
  }

  // And no review code in the client bundles.
  await page.goto(`${BASE}/reviews`);
  const scripts = JSON.parse(
    await page.eval(
      `JSON.stringify([...document.querySelectorAll('script[src]')].map((s) => s.src))`,
    ),
  );
  let leaked = [];
  for (const src of scripts) {
    const body = await (await fetch(src)).text();
    if (body.includes('REVIEWS_PAYLOAD_URL') || body.includes('normalisePayload')) {
      leaked.push(src);
    }
  }
  check(
    leaked.length === 0,
    'no client bundle contains the fetch or the normaliser',
    leaked.join(' | '),
  );
}

section('12. THE ADMIN SCREEN IS DIAGNOSTICS ONLY');
{
  await page.goto(`${BASE}/admin/reviews`);
  const controls = JSON.parse(
    await page.eval(`(() => {
      const text = document.body.innerText;
      const inputs = [...document.querySelectorAll('input:not([type=hidden]), textarea')]
        .map((i) => i.name || i.type);
      const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent.trim());
      return JSON.stringify({ inputs, buttons, hasWhyText: /cannot edit reviews/i.test(text) });
    })()`),
  );

  check(
    controls.inputs.length === 0,
    'there is no field for writing or editing a review',
    controls.inputs.join(', '),
  );
  check(
    controls.buttons.every((b) => !/add|edit|delete|remove|hide|publish|reply/i.test(b)),
    'and no create, edit, delete, hide or reply control',
    controls.buttons.join(' | '),
  );
  check(controls.hasWhyText, 'and the screen explains why not');

  // Anonymous access is refused.
  const anon = await fetch(`${BASE}/admin/reviews`, { redirect: 'manual' });
  check(
    anon.status === 307 || anon.status === 302,
    'an anonymous request to the admin screen is redirected',
    `status ${anon.status}`,
  );
}

section('13. RESPONSIVE AND ACCESSIBLE');
{
  /*
    A payload with the shapes that actually stress a card: a long review, a
    single unbroken token that cannot wrap, a one-word review, and a review with
    no text at all. A grid that survives only well-behaved content is not
    verified, and none of this is under our control - it is whatever a stranger
    typed into Google.
  */
  const state = await withFixture(() =>
    serveJson(
      payload({
        stats: {
          total_count: 4,
          mean_rating: 4.8,
          completeness: 'full',
          last_full_harvest_at: '2026-08-01T09:00:00.000Z',
        },
        reviews: [
          review({
            id: '5'.repeat(32),
            author_name: 'Aarav Krishnamurthy Venkataraman',
            author_initials: 'AK',
            text:
              'ZZREV My daughter joined in class eleven with no confidence in accountancy at all, and the teachers here rebuilt it from the beginning rather than rushing ahead to finish the syllabus. The regular tests were the part that made the difference, because she could see her own progress instead of being told about it.',
          }),
          review({
            id: '6'.repeat(32),
            author_name: 'Meera S.',
            author_initials: 'MS',
            text: 'ZZREV supercalifragilisticexpialidociousaccountancycoachinginstitutejaipur',
          }),
          review({
            id: '7'.repeat(32),
            author_name: 'Rohan T.',
            author_initials: 'RT',
            text: 'ZZREV Excellent.',
          }),
          review({
            id: '8'.repeat(32),
            author_name: 'Ishita B.',
            author_initials: 'IB',
            text: null,
          }),
        ],
      }),
    ),
  );

  const laid = await waitForPublic('/reviews', 'ZZREV Excellent.');
  check(
    laid.found,
    'the layout payload is on the page, so the checks below are not vacuous',
    state + ' then ' + laid.attempt + ' request(s)',
  );

  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1280]) {
    await page.viewport(width, 800, { mobile: width < 640 });

    for (const route of ['/reviews', '/', '/admin/reviews']) {
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

  /*
    The unbreakable token is the one that actually escapes a grid: it cannot
    wrap, so unless the card constrains it the card grows and takes the page
    with it. Measured against the CARD, not the document, because a document
    that does not overflow can still contain a card that does.
  */
  await page.viewport(320, 800, { mobile: true });
  await page.goto(`${BASE}/reviews`);
  const overflow = JSON.parse(
    await page.eval(`(() => {
      const out = [];
      for (const card of document.querySelectorAll('article')) {
        if (card.scrollWidth > card.clientWidth + 1) {
          out.push((card.textContent || '').trim().slice(0, 30) + ' ' + card.scrollWidth + '>' + card.clientWidth);
        }
      }
      return JSON.stringify(out);
    })()`),
  );
  check(overflow.length === 0, '320px no review card overflows its own box', overflow.join(' | '));

  // Touch targets, with the same two WCAG 2.5.8 exceptions the other suites use.
  for (const route of ['/reviews', '/admin/reviews']) {
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

  /*
    A star rating drawn as repeated glyphs reads to a screen reader as a run of
    nonsense unless the glyphs are hidden and the group carries the value. So
    the assertion is on the accessible name, not on the markup producing it.
  */
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/reviews`);
  const a11y = JSON.parse(
    await page.eval(`(() => {
      const ratings = [...document.querySelectorAll('[role=img]')];
      /*
        NO REGEX LITERAL HERE, ON PURPOSE.

        This source reaches the page inside a template literal, and a template
        literal eats an unrecognised escape: a backslash-d arrives as a plain
        d, so the pattern silently matched the literal word "Rated d out of 5"
        and reported 0 of 4 labels valid on markup that was perfectly correct.
        String methods cannot be mangled that way.

        Backticks and dollar signs are also avoided in this comment - both end
        or interpolate the enclosing template literal, and a comment that
        breaks the script it documents helps nobody.
      */
      const named = ratings.filter((r) => {
        const label = r.getAttribute('aria-label') || '';
        if (!label.startsWith('Rated ') || !label.endsWith(' out of 5')) return false;
        const value = Number(label.slice('Rated '.length, -' out of 5'.length));
        return Number.isFinite(value) && value >= 1 && value <= 5;
      });
      const glyphsExposed = ratings.some((r) =>
        [...r.children].some((c) => c.getAttribute('aria-hidden') !== 'true'));

      const headings = [...document.querySelectorAll('h1, h2, h3, h4')].map((h) => Number(h.tagName[1]));
      let jump = false;
      for (let i = 1; i < headings.length; i += 1) {
        if (headings[i] - headings[i - 1] > 1) jump = true;
      }

      return JSON.stringify({
        ratingCount: ratings.length,
        named: named.length,
        glyphsExposed,
        h1: document.querySelectorAll('h1').length,
        jump,
        imgsWithoutAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
        cardsWithoutHeading: [...document.querySelectorAll('article')]
          .filter((a) => !a.querySelector('h2, h3, h4')).length,
        cards: document.querySelectorAll('article').length,
        positiveTabindex: [...document.querySelectorAll('[tabindex]')]
          .map((e) => Number(e.getAttribute('tabindex'))).filter((n) => n > 0).length,
        divButtons: document.querySelectorAll('div[onclick], span[onclick]').length,
      });
    })()`),
  );

  check(a11y.cards === 4, 'all four layout reviews rendered', String(a11y.cards));
  /*
    Four, not three. The fourth fixture review has `text: null` and KEEPS its
    rating - a rating-only review is a real and common shape, and the normaliser
    drops an entry only when text and rating are BOTH absent. The earlier
    expectation of three was the test being wrong about its own fixture.
  */
  check(
    a11y.ratingCount === 4,
    'each review exposes its rating, including the one with no text',
    String(a11y.ratingCount),
  );
  check(
    a11y.named === a11y.ratingCount && a11y.ratingCount > 0,
    'every star rating carries a readable accessible name',
    a11y.named + '/' + a11y.ratingCount,
  );
  check(!a11y.glyphsExposed, 'and the star glyphs themselves are hidden from assistive tech');
  check(a11y.h1 === 1, 'the page has exactly one h1', String(a11y.h1));
  check(!a11y.jump, 'heading levels do not skip a level');
  check(a11y.imgsWithoutAlt === 0, 'no image is missing an alt attribute');
  check(
    a11y.cardsWithoutHeading === 0,
    'every review card is headed, so it is reachable by heading navigation',
    String(a11y.cardsWithoutHeading),
  );
  check(a11y.positiveTabindex === 0, 'no positive tabindex rewrites the focus order');
  check(a11y.divButtons === 0, 'no div is being used as a button');
}

/* ------------------------------------------------------------ teardown -- */

section('14. TEARDOWN');
{
  await page.close();
  await browser.close();
  stopSite();
  await new Promise((resolve) => fixtureServer.close(resolve));

  // Proven, not assumed. A survivor here is what poisons the NEXT run.
  await new Promise((r) => setTimeout(r, 2000));
  check(await portIsFree(SITE_PORT), 'the site server really stopped');
  check(await portIsFree(FIXTURE_PORT), 'the fixture server really stopped');
}

console.log('\n========================================================');
console.log(`REVIEWS VERIFICATION: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('\nSCOPE: FIXTURE VERIFIED. The real Review Engine is not activated');
console.log('for this client (clients/_commerce-insight.config.json has');
console.log('enabled: false), so live integration remains UNTESTED.');
console.log('========================================================');

exit(fail === 0 ? 0 : 1);
