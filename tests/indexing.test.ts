import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { listingIndexing } from '../src/lib/indexing.ts';

/**
 * Phase 9 tests.
 *
 * Two kinds live here. The first is the indexing policy — pure, so it is tested
 * directly. The second is a set of repository invariants that Phase 9 decisions
 * DEPEND on: they were true when a byte was removed, and this is what notices
 * if they stop being true. A font weight deleted because nothing used it is
 * only safe for as long as nothing uses it.
 *
 * Everything that needs a running server — canonical tags, sitemap contents,
 * structured data, the launch switch — is verified in scripts/verify-seo.mjs
 * against a real production build, because those are properties of rendered
 * output rather than of a function.
 */

describe('listingIndexing — which URLs a crawler should keep', () => {
  test('the bare listing is self-canonical and inherits sitewide robots', () => {
    const result = listingIndexing({ path: '/results', filtered: false, page: 1 });
    assert.equal(result.canonical, '/results');
    assert.equal(
      result.robots,
      undefined,
      'page 1 must not override the sitewide policy, or it would bypass the launch switch',
    );
  });

  test('a filtered view canonicalises to the bare listing', () => {
    const result = listingIndexing({ path: '/results', filtered: true, page: 1 });
    assert.equal(result.canonical, '/results');
    assert.deepEqual(result.robots, { index: false, follow: true });
  });

  test('a filtered view still says follow, so records stay reachable', () => {
    const { robots } = listingIndexing({ path: '/results', filtered: true, page: 1 });
    assert.equal(robots?.follow, true);
  });

  test('page 2 is self-canonical, NOT canonicalised back to page 1', () => {
    const result = listingIndexing({ path: '/results', filtered: false, page: 2 });
    assert.equal(
      result.canonical,
      '/results?page=2',
      'results have no individual URLs, so page 2 is the only copy of its records',
    );
    assert.deepEqual(result.robots, { index: true, follow: true });
  });

  test('the filter wins over pagination — a slice of a slice is still a slice', () => {
    const result = listingIndexing({ path: '/results', filtered: true, page: 3 });
    assert.equal(result.canonical, '/results');
    assert.equal(result.robots?.index, false);
  });

  test('it works for any listing path, not just /results', () => {
    assert.equal(
      listingIndexing({ path: '/stories', filtered: false, page: 4 }).canonical,
      '/stories?page=4',
    );
  });

  test('page 0 or a negative page is treated as page 1', () => {
    for (const page of [0, -1]) {
      assert.equal(listingIndexing({ path: '/results', filtered: false, page }).canonical, '/results');
    }
  });
});

/* ------------------------------------------- repository invariants ------- */

const SRC = path.join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'generated') continue; // Prisma output, not ours
      out.push(...sourceFiles(full));
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

const sources = sourceFiles(SRC).map((file) => ({ file, text: readFileSync(file, 'utf8') }));

describe('font budget invariants', () => {
  test('nothing renders monospace at weight 500', () => {
    // Phase 9 removed weight 500 from IBM Plex Mono after measuring that no
    // rule used it — 9.8 KB and one request that bought nothing. Reintroducing
    // `font-medium` alongside `font-mono` would silently fall back to 400.
    const offenders = sources.filter(({ text }) =>
      /class(?:Name)?="[^"]*\bfont-mono\b[^"]*\bfont-medium\b|class(?:Name)?="[^"]*\bfont-medium\b[^"]*\bfont-mono\b/.test(
        text,
      ),
    );
    assert.deepEqual(
      offenders.map((o) => path.relative(process.cwd(), o.file)),
      [],
      'add weight 500 back to IBM_Plex_Mono in src/app/layout.tsx before using it',
    );
  });

  test('the eyebrow utility is the only monospace rule in global CSS', () => {
    const css = readFileSync(path.join(SRC, 'app', 'globals.css'), 'utf8');
    const monoRules = css.match(/font-family:\s*var\(--font-mono\)/g) ?? [];
    assert.equal(monoRules.length, 1, 'a second monospace rule changes the font budget');
  });

  test('exactly three font families are declared', () => {
    const layout = readFileSync(path.join(SRC, 'app', 'layout.tsx'), 'utf8');
    const families = layout.match(/next\/font\/google'/g) ?? [];
    assert.equal(families.length, 1, 'fonts must be declared in one import');
    const calls = layout.match(/^const \w+ = (Source_Serif_4|IBM_Plex_Sans|IBM_Plex_Mono)\(/gm) ?? [];
    assert.equal(calls.length, 3, 'a fourth family would break the font budget');
  });
});

describe('public-boundary invariants', () => {
  test('no public page imports the Prisma client directly', () => {
    // Every public read must go through src/lib/public-data.ts, which is where
    // the consent filtering lives. A page reaching past it is how an
    // unpublished record reaches a visitor.
    const publicPages = sources.filter(
      ({ file }) =>
        file.includes(path.join('src', 'app')) &&
        !file.includes(path.join('app', 'admin')) &&
        file.endsWith('page.tsx'),
    );
    assert.ok(publicPages.length >= 8, 'expected to find the public pages');

    for (const { file, text } of publicPages) {
      assert.ok(
        !/from '@\/lib\/db'/.test(text),
        `${path.relative(process.cwd(), file)} must read through @/lib/public-data`,
      );
    }
  });

  test('every public data read passes an explicit limit', () => {
    // `getPublishedStories` used to default to 60 and silently drop the rest.
    // The default is gone; this fails if someone adds one back.
    const dataLayer = readFileSync(path.join(SRC, 'lib', 'public-data.ts'), 'utf8');
    assert.ok(
      /export async function getPublishedStories\(limit: number\)/.test(dataLayer),
      'getPublishedStories must require a limit rather than defaulting to one',
    );
  });
});

describe('the launch switch', () => {
  test('is still off', () => {
    const launch = readFileSync(path.join(SRC, 'config', 'launch.ts'), 'utf8');
    assert.match(
      launch,
      /const SITE_IS_LAUNCHED = false/,
      'Phase 9 must not flip the launch switch — that belongs to deployment',
    );
  });

  test('robots.txt does not advertise a sitemap while disallowing everything', () => {
    const robots = readFileSync(path.join(SRC, 'app', 'robots.ts'), 'utf8');
    const blocked = robots.slice(robots.indexOf('if (!isIndexable())'), robots.indexOf('return {', robots.indexOf('isIndexable()') + 40) + 400);
    assert.ok(
      !/sitemap:/i.test(blocked.split('}')[1] ?? ''),
      'a Disallow-everything file that also lists a sitemap is self-contradictory',
    );
  });
});
