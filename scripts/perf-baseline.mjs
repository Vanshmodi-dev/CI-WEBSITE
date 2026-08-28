/**
 * Production performance measurement.
 *
 * Fetches every public route from a REAL `next start` server, then fetches
 * every asset that route references, and reports what a browser actually has to
 * download. Every number below is a byte counted off the socket or a wall-clock
 * reading taken in this process. Nothing is estimated.
 *
 * BYTES ARE COUNTED ON THE WIRE, COMPRESSED. An earlier version of this script
 * used `fetch`, which transparently decompresses — it reported 612 KB of
 * JavaScript for a page that actually transfers a fraction of that. Compressed
 * is the number that matters to a parent on a 4G connection, so this uses raw
 * `node:http` and counts what arrives.
 *
 * WHAT IT CANNOT MEASURE. LCP, CLS and INP are browser-rendering metrics and
 * this script has no browser, so it does not report them and does not guess.
 * What it does measure is what dominates them on a mid-range Android: TTFB,
 * transferred bytes, and the number of render-blocking requests.
 *
 * Usage: BASE_URL=http://localhost:3170 node scripts/perf-baseline.mjs [--json out.json]
 */

import http from 'node:http';
import { env, argv, exit } from 'node:process';
import { writeFileSync } from 'node:fs';

const BASE = env.BASE_URL ?? 'http://localhost:3170';
const SAMPLES = Number(env.SAMPLES ?? 5);

export const ROUTES = [
  '/',
  '/about',
  '/courses',
  '/courses/class-11-commerce',
  // Phase 16, Topic 6. Included so the new page gets the same contrast,
  // overflow, semantics and metadata coverage as every other public route -
  // a page nobody checks is a page that quietly stops meeting the standard.
  '/faculty',
  // Phase 16, Topics 7-9. /reviews, /gallery and /videos were each added to
  // verify-seo when they were built and NOT to this list, so none of them was
  // contrast-, overflow- or console-checked. The comment above says why that
  // matters; all three are added here rather than leaving a third gap.
  '/reviews',
  '/gallery',
  '/videos',
  '/results',
  '/stories',
  '/announcements',
  '/contact',
  '/admissions',
];

/**
 * One raw request. Returns wire bytes (post-compression, as the socket saw
 * them), the decoded body, and TTFB measured to the first body byte.
 */
function raw(url, { decode = true } = {}) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const started = performance.now();
    let ttfb = null;
    let wire = 0;
    const chunks = [];

    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: 'GET',
        headers: { 'Accept-Encoding': 'gzip', Connection: 'close' },
      },
      (res) => {
        res.on('data', (chunk) => {
          if (ttfb === null) ttfb = performance.now() - started;
          wire += chunk.length;
          if (decode) chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            wire,
            ttfb: ttfb ?? performance.now() - started,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Decoded text, for parsing the HTML. */
async function text(url) {
  const res = await fetch(url);
  return res.text();
}

/** Assets are shared between routes; a browser downloads each one once. */
const assetCache = new Map();

async function assetWire(url) {
  if (assetCache.has(url)) return assetCache.get(url);
  let bytes = 0;
  try {
    bytes = (await raw(url, { decode: false })).wire;
  } catch {
    /* an unreachable asset counts as zero rather than crashing the run */
  }
  assetCache.set(url, bytes);
  return bytes;
}

function abs(href) {
  try {
    return new URL(href, BASE).toString();
  } catch {
    return null;
  }
}

/** Everything the HTML tells the browser to fetch, by kind. */
export function referencedAssets(html) {
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const preloadFonts = [
    ...html.matchAll(/<link[^>]+rel="preload"[^>]*href="([^"]+)"[^>]*as="font"/g),
  ].map((m) => m[1]);
  // next/font puts @font-face in the stylesheet, so a font that is NOT
  // preloaded still costs bytes once the CSS parses. Count both, separately.
  const cssFonts = [...html.matchAll(/\/_next\/static\/media\/[^"' )]+\.woff2?/g)].map((m) => m[0]);
  /*
    ⚠ EAGER AND LAZY ARE COUNTED SEPARATELY, AND THAT IS THE WHOLE POINT.

    `requests` used to include every `<img>` in the document. A browser does not
    request a `loading="lazy"` image below the fold, so on any populated page
    the number described something no visitor experiences — and the budget of
    20 was measured, in the comment's own words, at "14-15", which was the size
    of this site when the database was EMPTY.

    The moment there was content to show, the metric started failing and stayed
    failing for three phases, reported each time as "pre-existing". Phase 19
    measured it properly: every public route ships exactly ONE eager image (the
    logo) and lazy-loads the rest, and a real browser at 390px makes 17
    load-critical requests on the homepage — inside the budget all along.

    So `requests` now counts what the browser actually fetches on load, and
    `lazyImageCount` is asserted separately, which turns a metric nobody could
    act on into a genuine guarantee that lazy loading is still in place.
  */
  const allImageTags = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
  const srcOf = (tag) => (tag.match(/\ssrc="([^"]+)"/) ?? [])[1];
  const usable = (v) => Boolean(v) && !v.startsWith('data:');

  const eagerFromTags = allImageTags.filter((t) => !/loading="lazy"/.test(t)).map(srcOf).filter(usable);
  const lazyFromTags = allImageTags.filter((t) => /loading="lazy"/.test(t)).map(srcOf).filter(usable);

  // A preloaded image is fetched immediately by definition.
  const preloadedImages = [
    ...html.matchAll(/<link[^>]+rel="preload"[^>]*as="image"[^>]*href="([^"]+)"/g),
  ].map((m) => m[1]).filter(usable);

  const images = [...eagerFromTags, ...lazyFromTags, ...preloadedImages];
  const eagerImages = [...eagerFromTags, ...preloadedImages];

  return {
    scripts: [...new Set(scripts)],
    styles: [...new Set(styles)],
    fonts: [...new Set([...preloadFonts, ...cssFonts])],
    preloadedFonts: [...new Set(preloadFonts)],
    images: [...new Set(images)],
    /** What a browser fetches on load: everything not `loading="lazy"`. */
    eagerImages: [...new Set(eagerImages)],
  };
}

/** Median, because one cold reading on Windows is mostly noise. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function measure(route) {
  const url = `${BASE}${route}`;
  await raw(url, { decode: false }); // warm; time the steady state

  const samples = [];
  for (let i = 0; i < SAMPLES; i += 1) samples.push((await raw(url, { decode: false })).ttfb);

  const page = await raw(url, { decode: false });
  const html = await text(url);
  const refs = referencedAssets(html);

  const sum = async (list) => {
    let total = 0;
    for (const href of list) {
      const u = abs(href);
      if (u) total += await assetWire(u);
    }
    return total;
  };

  const js = await sum(refs.scripts);
  const css = await sum(refs.styles);
  const fonts = await sum(refs.fonts);
  const images = await sum(refs.images);

  return {
    route,
    status: page.status,
    cache: page.headers['x-nextjs-cache'] ?? '-',
    prerendered: page.headers['x-nextjs-prerender'] === '1',
    ttfbMs: Math.round(median(samples)),
    htmlWire: page.wire,
    htmlUncompressed: Buffer.byteLength(html),
    jsWire: js,
    cssWire: css,
    fontWire: fonts,
    imageWire: images,
    totalWire: page.wire + js + css + fonts + images,
    /*
      The document, its render-blocking assets, and the images a browser
      actually fetches on load. Lazy images are reported below, not counted
      here — see the note in `referencedAssets`.
    */
    requests:
      1 + refs.scripts.length + refs.styles.length + refs.fonts.length + refs.eagerImages.length,
    eagerImageCount: refs.eagerImages.length,
    lazyImageCount: refs.images.length - refs.eagerImages.length,
    scriptCount: refs.scripts.length,
    fontCount: refs.fonts.length,
    preloadedFontCount: refs.preloadedFonts.length,
    imageCount: refs.images.length,
  };
}

const kb = (n) => (n / 1024).toFixed(1);

const invokedDirectly = argv[1] && argv[1].replace(/\\/g, '/').endsWith('perf-baseline.mjs');

if (invokedDirectly) {
  try {
    await raw(`${BASE}/`, { decode: false });
  } catch {
    console.error(`No server at ${BASE}. Run \`npx next start -p 3170\` first.`);
    exit(1);
  }

  const label = env.LABEL ?? 'production';
  console.log(`\n=== PERFORMANCE — ${BASE} (${label}) ===`);
  console.log(`  bytes are COMPRESSED WIRE BYTES; median of ${SAMPLES} TTFB samples`);
  console.log('  assets counted once each, as a browser would cache them\n');

  const rows = [];
  for (const route of ROUTES) rows.push(await measure(route));

  const head = [
    'Route'.padEnd(27),
    'Mode'.padStart(7),
    'TTFB'.padStart(7),
    'HTML'.padStart(8),
    'JS'.padStart(8),
    'CSS'.padStart(7),
    'Font'.padStart(8),
    'Img'.padStart(7),
    'Total'.padStart(9),
    'Req'.padStart(5),
  ].join('');
  console.log(head);
  console.log('-'.repeat(head.length));

  for (const r of rows) {
    console.log(
      [
        r.route.padEnd(27),
        (r.prerendered ? 'static' : 'dynamic').padStart(7),
        `${r.ttfbMs}ms`.padStart(7),
        `${kb(r.htmlWire)}k`.padStart(8),
        `${kb(r.jsWire)}k`.padStart(8),
        `${kb(r.cssWire)}k`.padStart(7),
        `${kb(r.fontWire)}k`.padStart(8),
        `${kb(r.imageWire)}k`.padStart(7),
        `${kb(r.totalWire)}k`.padStart(9),
        String(r.requests).padStart(5),
      ].join(''),
    );
  }

  const worst = rows.reduce((a, b) => (b.totalWire > a.totalWire ? b : a));
  console.log(`\n  heaviest route  ${worst.route} — ${kb(worst.totalWire)} KB transferred`);
  console.log(`  fonts           ${rows[0].fontCount} files, ${rows[0].preloadedFontCount} preloaded`);
  console.log(`  scripts on /    ${rows[0].scriptCount}`);
  console.log(`  slowest TTFB    ${Math.max(...rows.map((r) => r.ttfbMs))} ms`);

  const jsonFlag = argv.indexOf('--json');
  if (jsonFlag !== -1 && argv[jsonFlag + 1]) {
    writeFileSync(argv[jsonFlag + 1], JSON.stringify(rows, null, 2));
    console.log(`\n  written to ${argv[jsonFlag + 1]}`);
  }
}
