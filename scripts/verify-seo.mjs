/**
 * SEO, indexing and public-boundary verification against a production build.
 *
 * Reads the REAL pages a crawler would read — no stubs, no snapshots — and
 * asserts the things that are expensive to get wrong: a canonical pointing at
 * the wrong URL, a filtered view leaking into the index, a sitemap listing a
 * page that 404s, structured data claiming something the page does not say, or
 * a consent field reaching a visitor's browser.
 *
 * The last group is not really SEO. It is here because this is the suite that
 * reads every public byte the site emits, which makes it the cheapest place to
 * prove the Phase 8 boundary still holds.
 *
 * Usage: BASE_URL=http://localhost:3170 node scripts/verify-seo.mjs
 */

import { env, exit } from 'node:process';

const BASE = env.BASE_URL ?? 'http://localhost:3170';

/** Public routes a visitor or crawler can reach. /admin is deliberately absent. */
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/courses',
  '/courses/class-11-commerce',
  '/courses/class-12-commerce',
  '/courses/ca-foundation',
  '/courses/ca-intermediate',
  '/courses/cma',
  // Phase 16, Topic 6. Included so the new page gets the same contrast,
  // overflow, semantics and metadata coverage as every other public route -
  // a page nobody checks is a page that quietly stops meeting the standard.
  '/faculty',
  // Phase 16, Topic 7. Listed for the same reason as /faculty: the route is
  // registered and in the sitemap even while its MENU entry is hidden until it
  // has content (HIDDEN_UNTIL_POPULATED in src/config/nav.ts), so it must meet
  // the same metadata, contrast, overflow and semantics standard as the rest.
  '/reviews',
  '/results',
  '/stories',
  '/announcements',
  '/contact',
  '/admissions',
];

/** Field names that must never appear in anything a browser receives. */
const CONSENT_FIELDS = [
  'consentRef',
  'consentResult',
  'consentName',
  'consentPhoto',
  'consentStory',
  'displayNameMode',
  'publishedAt',
];

/** Structured-data properties we have no verified fact for. */
const FORBIDDEN_SCHEMA = [
  'aggregateRating',
  'review',
  'ratingValue',
  'reviewCount',
  'foundingDate',
  'founder',
  'numberOfStudents',
  'alumni',
  'award',
  'priceRange',
  'offers',
  'potentialAction',
];

let pass = 0;
let fail = 0;
const failures = [];
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

/**
 * React inserts `<!-- -->` between adjacent JSX expressions during SSR, so
 * `{count} of {total}` arrives as `12<!-- --> of <!-- -->80`. Three phases of
 * this project have lost time to that. Strip them before matching text.
 */
const readable = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

const pages = new Map();
async function page(path) {
  if (!pages.has(path)) {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    pages.set(path, { status: res.status, headers: res.headers, html: await res.text() });
  }
  return pages.get(path);
}

const attr = (html, re) => (html.match(re) ?? [])[1] ?? null;
const title = (html) => attr(html, /<title>([^<]*)<\/title>/);
const description = (html) =>
  attr(html, /<meta name="description" content="([^"]*)"/);
const canonical = (html) => attr(html, /<link rel="canonical" href="([^"]*)"/);
const robotsMeta = (html) => attr(html, /<meta name="robots" content="([^"]*)"/);
const jsonLdBlocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );

/* ============================================================ metadata ==== */

console.log('\n=== 1. METADATA ON EVERY PUBLIC ROUTE ===\n');

const titles = new Map();
const descriptions = new Map();

for (const route of PUBLIC_ROUTES) {
  const { status, html } = await page(route);
  if (status !== 200) {
    bad(`${route} responds 200`, `got ${status}`);
    continue;
  }

  const t = title(html);
  const d = description(html);
  const c = canonical(html);

  check(Boolean(t && t.trim()), `${route} has a <title>`, t ?? 'missing');
  check(Boolean(d && d.trim().length > 40), `${route} has a real meta description`);
  check(Boolean(c), `${route} has a canonical URL`, c ?? 'missing');
  // Next strips the trailing slash from the root canonical to match
  // `trailingSlash: false`; `https://host` and `https://host/` are the same URL.
  check(
    c === `${BASE}${route}` || (route === '/' && c === BASE),
    `${route} canonical is self-referential`,
    `got ${c}`,
  );

  if (t) {
    if (titles.has(t)) bad(`${route} title is unique`, `duplicates ${titles.get(t)}`);
    else {
      titles.set(t, route);
      ok(`${route} title is unique`);
    }
  }
  if (d) {
    if (descriptions.has(d)) {
      bad(`${route} description is unique`, `duplicates ${descriptions.get(d)}`);
    } else {
      descriptions.set(d, route);
      ok(`${route} description is unique`);
    }
  }

  check(
    /<html lang="en-IN"/.test(html),
    `${route} declares lang="en-IN"`,
  );
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  check(h1s === 1, `${route} has exactly one <h1>`, `found ${h1s}`);

  for (const og of ['og:title', 'og:description', 'og:url', 'og:site_name', 'og:locale']) {
    check(
      html.includes(`property="${og}"`),
      `${route} has ${og}`,
    );
  }
  check(html.includes('name="twitter:card"'), `${route} has twitter:card`);
}

/* ================================================ canonical + indexing ==== */

console.log('\n=== 2. CANONICAL AND INDEXING POLICY FOR FILTERED VIEWS ===\n');

for (const path of [
  '/results?year=2025',
  '/results?programme=CLASS_11',
  '/results?year=2025&programme=CMA',
]) {
  const { html } = await page(path);
  const c = canonical(html);
  const r = robotsMeta(html) ?? '';

  check(c === `${BASE}/results`, `${path} canonicalises to /results`, `got ${c}`);
  check(/noindex/.test(r), `${path} carries noindex`, `robots="${r}"`);
  check(/follow/.test(r) && !/nofollow/.test(r), `${path} still says follow`, `robots="${r}"`);
}

/**
 * An unrecognised filter value is narrowed away by `asProgramme`, so the page
 * IS the unfiltered page and must be indistinguishable from it. Asserting
 * equality rather than a specific robots string keeps this test meaningful
 * after launch, when the sitewide noindex no longer masks the difference.
 */
{
  const junk = await page('/results?programme=NOT_A_PROGRAMME');
  const plain = await page('/results');
  check(
    canonical(junk.html) === canonical(plain.html),
    'an unrecognised programme value canonicalises like the unfiltered page',
  );
  check(
    (robotsMeta(junk.html) ?? '') === (robotsMeta(plain.html) ?? ''),
    'an unrecognised programme value is not treated as a filtered duplicate',
  );
}

for (const [path, expectedCanonical] of [
  ['/results?page=2', '/results?page=2'],
  ['/stories?page=2', '/stories?page=2'],
]) {
  const { html } = await page(path);
  check(
    canonical(html) === `${BASE}${expectedCanonical}`,
    `${path} is self-canonical (pagination is not a duplicate)`,
    `got ${canonical(html)}`,
  );
}

/* ==================================================== the launch switch === */

console.log('\n=== 3. THE LAUNCH SWITCH STILL HOLDS ===\n');

for (const route of [...PUBLIC_ROUTES, '/results?page=2', '/stories?page=2']) {
  const { html } = await page(route);
  const r = robotsMeta(html) ?? '';
  check(
    /noindex/.test(r),
    `${route} is noindex while SITE_IS_LAUNCHED is false`,
    `robots="${r}"`,
  );
}

const robotsTxt = await (await fetch(`${BASE}/robots.txt`)).text();
check(/Disallow:\s*\/\s*$/m.test(robotsTxt), 'robots.txt disallows everything pre-launch');
check(/Disallow:\s*\/admin/.test(robotsTxt), 'robots.txt disallows /admin explicitly');
check(
  !/Sitemap:/i.test(robotsTxt),
  'robots.txt does not advertise a sitemap while disallowing everything',
);

/* ========================================================== sitemap ====== */

console.log('\n=== 4. SITEMAP ===\n');

const sitemapXml = await (await fetch(`${BASE}/sitemap.xml`)).text();
const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

check(locs.length > 0, 'sitemap.xml contains URLs', `${locs.length} entries`);
check(
  sitemapXml.startsWith('<?xml'),
  'sitemap.xml is well-formed XML',
);
check(
  !locs.some((u) => u.includes('/admin')),
  'sitemap contains no /admin URL',
);
check(!locs.some((u) => u.includes('?')), 'sitemap contains no query-string variants');
check(
  new Set(locs).size === locs.length,
  'sitemap has no duplicate URLs',
);

const expectedInSitemap = PUBLIC_ROUTES.map((r) => `${BASE}${r}`);
for (const url of expectedInSitemap) {
  check(locs.includes(url), `sitemap lists ${url.replace(BASE, '') || '/'}`);
}
for (const url of locs) {
  if (!expectedInSitemap.includes(url)) {
    bad('sitemap lists only known routes', `unexpected ${url}`);
  }
}
if (locs.every((u) => expectedInSitemap.includes(u))) {
  ok('sitemap lists only known routes');
}

for (const url of locs) {
  const res = await fetch(url, { redirect: 'manual' });
  check(res.status === 200, `sitemap URL resolves: ${url.replace(BASE, '') || '/'}`, `${res.status}`);
}

// lastmod is a claim about content, so it must never be present for a page
// whose content we do not track.
const entries = [...sitemapXml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
const lastmodFor = (path) => {
  const block = entries.find((e) => e.includes(`<loc>${BASE}${path}</loc>`));
  return block ? ((block.match(/<lastmod>([^<]+)<\/lastmod>/) ?? [])[1] ?? null) : null;
};
check(lastmodFor('/about') === null, '/about has no invented lastmod (static prose)');
check(lastmodFor('/contact') === null, '/contact has no invented lastmod (static prose)');

/* ======================================================= structured data == */

console.log('\n=== 5. STRUCTURED DATA ===\n');

const homeBlocks = jsonLdBlocks((await page('/')).html);
check(homeBlocks.length >= 1, 'homepage emits JSON-LD', `${homeBlocks.length} block(s)`);

let graph = null;
for (const block of homeBlocks) {
  try {
    const parsed = JSON.parse(block);
    ok('JSON-LD block parses as JSON');
    if (parsed['@graph']) graph = parsed;
  } catch (error) {
    bad('JSON-LD block parses as JSON', String(error).slice(0, 80));
  }
}

check(Boolean(graph), 'sitewide JSON-LD uses a single @graph');
if (graph) {
  const types = graph['@graph'].map((n) => n['@type']);
  check(types.includes('EducationalOrganization'), 'graph contains EducationalOrganization');
  check(types.includes('WebSite'), 'graph contains WebSite');
  check(graph['@context'] === 'https://schema.org', 'graph declares @context');

  const org = graph['@graph'].find((n) => n['@type'] === 'EducationalOrganization');
  const site = graph['@graph'].find((n) => n['@type'] === 'WebSite');
  check(Boolean(org['@id']), 'organisation has an @id for cross-reference');
  check(site.publisher?.['@id'] === org['@id'], 'WebSite.publisher resolves to the organisation');
  check(site.inLanguage === 'en-IN', 'WebSite declares inLanguage');

  const serialised = JSON.stringify(graph);
  for (const forbidden of FORBIDDEN_SCHEMA) {
    check(
      !serialised.includes(`"${forbidden}"`),
      `graph does not claim ${forbidden}`,
    );
  }

  // Everything the graph asserts must also be visible on the page, or it is a
  // claim made only to a machine.
  const contactHtml = readable((await page('/contact')).html);
  check(
    contactHtml.includes(org.address.addressLocality),
    'schema locality appears in visible page content',
  );
  check(
    contactHtml.replace(/\s|&nbsp;/g, '').includes(org.telephone.replace('+91', '')),
    'schema telephone appears in visible page content',
  );
}

const courseHtml = (await page('/courses/ca-foundation')).html;
const courseBlocks = jsonLdBlocks(courseHtml).map((b) => JSON.parse(b));
const breadcrumb = courseBlocks.find((b) => b['@type'] === 'BreadcrumbList');
const course = courseBlocks.find((b) => b['@type'] === 'Course');
check(Boolean(course), 'course page emits Course');
check(Boolean(breadcrumb), 'course page emits BreadcrumbList');
if (breadcrumb) {
  check(breadcrumb.itemListElement.length === 2, 'breadcrumb has two levels');
  check(
    breadcrumb.itemListElement.every((i, n) => i.position === n + 1),
    'breadcrumb positions are 1..n',
  );
  for (const item of breadcrumb.itemListElement) {
    check(
      readable(courseHtml).includes(item.name),
      `breadcrumb "${item.name}" is also visible on the page`,
    );
  }
}
if (course) {
  check(
    course.provider?.['@id']?.includes('#organisation'),
    'Course.provider references the organisation by @id',
  );
}

/* ================================================ public boundary ======== */

console.log('\n=== 6. NOTHING PRIVATE REACHES A PUBLIC PAGE ===\n');

const publicScripts = new Set();
for (const route of PUBLIC_ROUTES) {
  const { html } = await page(route);

  for (const field of CONSENT_FIELDS) {
    if (html.includes(field)) bad(`${route} does not leak "${field}"`, 'found in HTML');
  }
  check(
    !CONSENT_FIELDS.some((f) => html.includes(f)),
    `${route} HTML contains no consent or internal field`,
  );
  check(!/href="\/admin/.test(html), `${route} links nowhere into /admin`);
  check(
    !/ZZTEST-ENQUIRY|ZZTEST-CONSENT/.test(html),
    `${route} exposes no enquiry or consent-reference data`,
  );

  for (const m of html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)) {
    publicScripts.add(m[1]);
  }
}

for (const src of publicScripts) {
  const body = await (await fetch(`${BASE}${src}`)).text();
  const found = CONSENT_FIELDS.filter((f) => body.includes(f));
  if (found.length > 0) {
    bad(`chunk ${src} carries no consent field`, found.join(', '));
  }
}
check(
  publicScripts.size > 0,
  'public routes reference JavaScript chunks',
  `${publicScripts.size} unique`,
);
ok(`no consent field appears in any of the ${publicScripts.size} public chunks`);

/* ======================================================= broken links ==== */

console.log('\n=== 7. NO BROKEN INTERNAL LINKS ===\n');

const linkTargets = new Set();
for (const route of PUBLIC_ROUTES) {
  const { html } = await page(route);
  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) linkTargets.add(m[1]);
}
for (const target of [...linkTargets].sort()) {
  const res = await fetch(`${BASE}${target}`, { redirect: 'manual' });
  const good = res.status === 200 || (target.startsWith('/admin') && res.status === 307);
  check(good, `internal link resolves: ${target}`, `${res.status}`);
}

/* =========================================================== summary ===== */

console.log(`\n=== SEO VERIFICATION: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  exit(1);
}
