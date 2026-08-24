/**
 * Performance budget — a regression tripwire, not a target.
 *
 * -----------------------------------------------------------------------------
 * WHERE THESE NUMBERS COME FROM
 * -----------------------------------------------------------------------------
 * Every limit below is the measured value plus deliberate headroom, taken from
 * a production build serving 1,000 synthetic published results, 80 stories, 30
 * batches and 12 announcements. None of them is aspirational. The point is to
 * fail when something GROWS, not to describe a site we wish we had.
 *
 * The JavaScript figure has history. Master Plan §18 set 120 KB gzip for the
 * homepage. Phase 3 measured 188.8 KB and showed the cause was not our code: a
 * route with no client components at all shipped byte-for-byte the same bundle,
 * because that is the Next 16 + React 19 App Router floor. Phase 3 recommended
 * ~200 KB as a tripwire. Phase 9 re-measured five phases later and found
 * 189.6 KB — 0.8 KB of growth across four phases of feature work, which
 * confirms both the diagnosis and the number. 200 KB stands.
 *
 * THE UNCOMPRESSED HTML LIMIT IS THE IMPORTANT ONE. Gzip hides unbounded lists:
 * the stories page was serving 224 KB of HTML that compressed to 12.8 KB,
 * because repeated markup compresses beautifully. The browser still has to
 * parse all 224 KB. That limit is what catches "render every row" before it
 * ships again.
 *
 * WHAT THIS DOES NOT CHECK. LCP, CLS and INP need a browser; they belong to
 * Lighthouse (lighthouserc.json), which owns the experience budgets. This owns
 * the byte budgets.
 *
 * Usage: BASE_URL=http://localhost:3170 node scripts/verify-budget.mjs
 */

import { env, exit } from 'node:process';
import { ROUTES, measure } from './perf-baseline.mjs';

const KB = 1024;

const BUDGET = {
  /** Framework floor is ~190 KB; anything past 200 KB is our code growing. */
  jsWire: 200 * KB,
  /** Measured 8.7 KB. Tailwind emits only what is used; 20 KB means it stopped. */
  cssWire: 20 * KB,
  /** Measured 89 KB across two variable fonts, both on the critical path. */
  fontWire: 100 * KB,
  /** Serif + sans. A third preloaded family would be a design decision. */
  preloadedFontCount: 2,
  /** Measured max 12.0 KB at scale. */
  htmlWire: 20 * KB,
  /** Measured max 118 KB at scale. Catches unpaginated lists. */
  htmlUncompressed: 150 * KB,
  /** Measured max 299.9 KB. */
  totalWire: 320 * KB,
  /** Measured 14–15. */
  requests: 20,
};

/**
 * TTFB is measured and printed but NOT enforced.
 *
 * A Windows development box running Postgres, Node and the test harness on one
 * core tells you nothing reliable about a Vercel function talking to a hosted
 * database. Asserting a number here would be asserting a number about this
 * laptop. The measurement is kept because a 10× jump still means something.
 */
const TTFB_REPORT_ONLY = true;

const BASE = env.BASE_URL ?? 'http://localhost:3170';

let pass = 0;
let fail = 0;
const failures = [];

function assert(condition, name, detail) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    failures.push(`${name} — ${detail}`);
    console.log(`  FAIL  ${name} — ${detail}`);
  }
}

const kb = (n) => `${(n / KB).toFixed(1)} KB`;

try {
  await fetch(BASE);
} catch {
  console.error(`No server at ${BASE}. Run \`npx next start -p 3170\` first.`);
  exit(1);
}

console.log('\n=== PERFORMANCE BUDGET ===');
console.log('  compressed wire bytes, production build\n');

const header = [
  'Route'.padEnd(27),
  'JS'.padStart(9),
  'CSS'.padStart(8),
  'Font'.padStart(9),
  'HTML'.padStart(9),
  'HTML raw'.padStart(10),
  'Total'.padStart(10),
  'TTFB'.padStart(7),
].join('');
console.log(header);
console.log('-'.repeat(header.length));

for (const route of ROUTES) {
  const m = await measure(route);

  console.log(
    [
      route.padEnd(27),
      kb(m.jsWire).padStart(9),
      kb(m.cssWire).padStart(8),
      kb(m.fontWire).padStart(9),
      kb(m.htmlWire).padStart(9),
      kb(m.htmlUncompressed).padStart(10),
      kb(m.totalWire).padStart(10),
      `${m.ttfbMs}ms`.padStart(7),
    ].join(''),
  );

  assert(m.jsWire <= BUDGET.jsWire, `${route} JS within budget`, `${kb(m.jsWire)} > ${kb(BUDGET.jsWire)}`);
  assert(m.cssWire <= BUDGET.cssWire, `${route} CSS within budget`, `${kb(m.cssWire)} > ${kb(BUDGET.cssWire)}`);
  assert(m.fontWire <= BUDGET.fontWire, `${route} fonts within budget`, `${kb(m.fontWire)} > ${kb(BUDGET.fontWire)}`);
  assert(
    m.preloadedFontCount <= BUDGET.preloadedFontCount,
    `${route} preloads no extra fonts`,
    `${m.preloadedFontCount} > ${BUDGET.preloadedFontCount}`,
  );
  assert(m.htmlWire <= BUDGET.htmlWire, `${route} HTML within budget`, `${kb(m.htmlWire)} > ${kb(BUDGET.htmlWire)}`);
  assert(
    m.htmlUncompressed <= BUDGET.htmlUncompressed,
    `${route} uncompressed HTML within budget`,
    `${kb(m.htmlUncompressed)} > ${kb(BUDGET.htmlUncompressed)} — an unpaginated list?`,
  );
  assert(
    m.totalWire <= BUDGET.totalWire,
    `${route} total transfer within budget`,
    `${kb(m.totalWire)} > ${kb(BUDGET.totalWire)}`,
  );
  assert(m.requests <= BUDGET.requests, `${route} request count within budget`, `${m.requests} > ${BUDGET.requests}`);
}

console.log(
  TTFB_REPORT_ONLY
    ? '\n  TTFB is reported, not enforced — this box is not production.'
    : '',
);
console.log(`\n=== BUDGET: ${pass} checks passed, ${fail} failed ===`);
if (fail > 0) {
  console.log('\nOver budget:');
  for (const f of failures) console.log(`  - ${f}`);
  exit(1);
}
