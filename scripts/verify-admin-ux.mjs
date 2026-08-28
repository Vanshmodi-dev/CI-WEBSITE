/**
 * The admin as a THING SOMEBODY USES — every route, including the ones no
 * suite had ever opened.
 *
 * =============================================================================
 * THE HARNESS GAP THIS SUITE EXISTS TO CLOSE
 * =============================================================================
 * Phase 18 asked a question nobody had: which admin routes has anything ever
 * measured? The answer, from reading the suites rather than the reports:
 *
 *   verify-ux.mjs      touch targets, overflow, headings — PUBLIC ROUTES ONLY
 *   verify-admin.mjs   every registry field, and the pages holding them —
 *                      admin LIST and /new routes, and no `[id]` route at all
 *
 * So the pages a teacher reaches by tapping a row in a list — every edit screen
 * in the product — had never been measured at any width. Two defects were
 * sitting in them, and one had been there since the page was written:
 * `/admin/enquiries/[id]` was the only route in the whole admin offering a way
 * back to its list, and its link was 126x23, under the 24x24 floor this project
 * asserts on every public page.
 *
 * A suite that covers the easy half of a surface is not partial coverage. It is
 * a green tick with a hole behind it.
 *
 * =============================================================================
 * WHAT IT MEASURES, AND HOW IT AVOIDS INVENTING DEFECTS
 * =============================================================================
 * Everything here is read from the RENDERED page in a real browser at five
 * widths. Nothing is asserted from source.
 *
 * ⚠ AND IT MEASURES THE RENDERED OUTLINE, NOT THE DOM.
 *
 * The first draft of this sweep reported a broken heading order on
 * /admin/preview: 96 `<h2>` elements sitting between an `<h3>` and an `<h4>`.
 * They are the titles of the 96 CLOSED edit dialogs. A closed `<dialog>` is
 * `display:none` under the UA stylesheet, so none of them is in the
 * accessibility tree and the rendered outline is perfectly ordered — the probe
 * was querying `document.querySelectorAll`, which does not care what is
 * visible, and it would have had this phase "fix" a defect that did not exist.
 *
 * Every check below filters on `getClientRects().length`, and section 0 proves
 * that filter both removes the invisible and keeps the real.
 *
 * Usage:
 *   DATABASE_URL=... ADMIN_PASSWORD=... BASE_URL=http://localhost:3000 \
 *     node scripts/verify-admin-ux.mjs
 */

import { env, exit } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { launch } from './browser.mjs';

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
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const section = (t) => console.log(`\n=== ${t} ===`);

if (!PASSWORD) {
  console.error('ADMIN_PASSWORD is not set.');
  exit(1);
}
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. This suite needs a record on each list to open.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/**
 * The widths the brief names, plus 360 — the commonest Android width in India,
 * and the one the institute owner is most likely to be holding.
 */
const WIDTHS = [320, 360, 390, 768, 1280];

/* ============================================================ THE PROBE == */

/**
 * One read of a rendered page.
 *
 * WHY `getClientRects().length` GATES EVERYTHING. A node that renders no boxes
 * occupies no space, is not in the accessibility tree, and cannot be clicked.
 * Counting one is how a probe invents defects; skipping one is how it misses
 * them. The gate is applied once, here, and section 0 tests it both ways.
 */
const PROBE = String.raw`(() => {
  const de = document.documentElement;
  const rendered = (el) => el.getClientRects().length > 0;

  const overflowBy = de.scrollWidth - de.clientWidth;
  const offenders = [];
  if (overflowBy > 1) {
    for (const el of document.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.right > de.clientWidth + 1) {
        offenders.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 2).join('.') + ' w=' + Math.round(b.width));
        if (offenders.length >= 3) break;
      }
    }
  }

  const small = [];
  for (const el of document.querySelectorAll('a,button,input:not([type=hidden]),select,textarea,[role=button]')) {
    if (!rendered(el)) continue;
    if (el.closest('[aria-hidden=true]')) continue;
    /* A skip link is 1x1 and clipped UNTIL IT RECEIVES FOCUS. That is the
       correct implementation of one, not an undersized target: WCAG 2.5.8
       measures the target as presented when it is available. verify-ux.mjs has
       carried this exemption for the public routes since Phase 11 and this is
       the same control. Section 0 proves this one really does grow. */
    const cs = getComputedStyle(el);
    const clipped = cs.clipPath === 'inset(50%)'
      || cs.clip === 'rect(0px, 0px, 0px, 0px)'
      || (el.getBoundingClientRect().width <= 1 && el.getBoundingClientRect().height <= 1);
    if (clipped) continue;
    /* WCAG 2.5.8 exempts a link sitting inline in a block of prose. The
       exemption is about what the MARKUP says, so it is claimed only for a link
       genuinely inside a text container. */
    if (el.tagName === 'A' && el.closest('p,li,dd,td')) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 23.5 || b.height < 23.5) {
      small.push(el.tagName.toLowerCase() + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 26) + '" ' + Math.round(b.width) + 'x' + Math.round(b.height));
    }
  }

  const unlabelled = [];
  for (const el of document.querySelectorAll('input:not([type=hidden]),select,textarea')) {
    if (!rendered(el)) continue;
    if (el.closest('[aria-hidden=true]') || el.getAttribute('aria-hidden') === 'true') continue;
    const ok = (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'))
      || el.closest('label') || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (!ok) unlabelled.push(el.tagName.toLowerCase() + '[' + (el.type || el.name || '') + ']');
  }

  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(rendered);
  const levels = heads.map((h) => +h.tagName[1]);
  let jump = null;
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] - levels[i - 1] > 1) {
      jump = 'h' + levels[i - 1] + ' "' + heads[i - 1].textContent.trim().slice(0, 24)
        + '" -> h' + levels[i] + ' "' + heads[i].textContent.trim().slice(0, 24) + '"';
      break;
    }
  }

  const clippedTables = [];
  for (const t of document.querySelectorAll('table')) {
    if (!rendered(t)) continue;
    const p = t.parentElement;
    if (!p) continue;
    const cs = getComputedStyle(p);
    const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    if (t.getBoundingClientRect().width > p.getBoundingClientRect().width + 1 && !scrolls) {
      clippedTables.push(Math.round(t.getBoundingClientRect().width) + '>' + Math.round(p.getBoundingClientRect().width));
    }
  }

  const backLinks = [...document.querySelectorAll('a')]
    .filter(rendered)
    .filter((a) => /back to/i.test(a.textContent))
    .map((a) => {
      const b = a.getBoundingClientRect();
      return { text: a.textContent.trim().slice(0, 32), w: Math.round(b.width), h: Math.round(b.height), href: a.getAttribute('href') };
    });

  return {
    overflowBy,
    offenders,
    small: [...new Set(small)],
    unlabelled: [...new Set(unlabelled)],
    h1: [...document.querySelectorAll('h1')].filter(rendered).length,
    jump,
    clippedTables,
    mains: [...document.querySelectorAll('main')].filter(rendered).length,
    renderedHeadings: heads.length,
    domHeadings: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
    backLinks,
  };
})()`;

/* ============================================================== SIGN IN == */

const browser = await launch('chrome');
const page = await browser.page();

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

/* ===================================================== 0. PROVE THE PROBE = */

section('0. CONTROLS — the probe measures what it claims to');
{
  await page.viewport(320, 800, { mobile: true });
  await page.goto(`${BASE}/admin`);
  const clean = await page.eval(PROBE);
  check(clean.overflowBy <= 1, 'control: the dashboard does not overflow at 320px to begin with', `${clean.overflowBy}px`);

  await page.eval(`(() => { const d = document.createElement('div'); d.style.cssText = 'width:900px;height:8px'; document.body.appendChild(d); return 1; })()`);
  const dirty = await page.eval(PROBE);
  check(dirty.overflowBy > 1, 'control: a 900px block at 320px IS detected as overflow', `${dirty.overflowBy}px`);

  await page.goto(`${BASE}/admin`);
  const before = (await page.eval(PROBE)).small.length;
  await page.eval(`(() => { const b = document.createElement('button'); b.textContent = 'zz'; b.style.cssText = 'width:10px;height:10px;display:block'; document.body.appendChild(b); return 1; })()`);
  const after = (await page.eval(PROBE)).small.length;
  check(after === before + 1, 'control: a 10x10 button IS detected as an undersized target', `${before} -> ${after}`);

  /*
    The rendered-outline filter has to do work, and has to not do too much of
    it. /admin/preview is the page that caught the first draft out: 96 of its
    headings live inside closed <dialog> elements and render nothing.
  */
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/admin/preview`);
  const preview = await page.eval(PROBE);
  check(
    preview.domHeadings > preview.renderedHeadings,
    'control: /admin/preview really does hold headings that render nothing',
    `${preview.domHeadings} in the DOM, ${preview.renderedHeadings} rendered`,
  );
  check(preview.renderedHeadings > 10, 'control: and the filter still keeps the real ones', `${preview.renderedHeadings}`);

  /*
    The skip link is EXEMPTED from the touch-target check above, so this proves
    the exemption is honest: 1x1 while unfocused, a real target once focused.
    An exemption nothing checks is a suppressed failure wearing a comment.

    ⚠ IT MUST BE FOCUSED WITH A REAL KEY, NOT WITH `.focus()`.

    The first version called `a.focus()` and measured 1x1, and duly reported
    that the skip link never becomes visible — on the public site as well as the
    admin, which would have been a significant defect had it been true. It is
    not. Focus set from `Runtime.evaluate` does not give the headless page the
    window focus, so `document.hasFocus()` stays false and Chrome applies
    neither `:focus` nor `:focus-visible`; `document.activeElement` reports the
    element anyway, which is what makes the reading so convincing.

    A key dispatched through CDP does give the page focus. Measured both ways:

      a.focus()     activeElement: yes   matches(':focus'): NO    1x1
      page.tab()    activeElement: yes   matches(':focus'): yes   147x52

    `verify-ux.mjs` was checked against this and is sound — its keyboard section
    has always used `page.tab()`.
  */
  await page.viewport(390, 800, { mobile: true });
  await page.goto(`${BASE}/admin`);
  const resting = await page.eval(`(() => {
    const a = [...document.querySelectorAll('a')].find((x) => /skip to content/i.test(x.textContent));
    if (!a) return JSON.stringify({ found: false });
    const r = a.getBoundingClientRect();
    return JSON.stringify({ found: true, size: [Math.round(r.width), Math.round(r.height)] });
  })()`);
  const rest = JSON.parse(resting);
  check(rest.found === true, 'control: the admin has a skip link at all');
  check(rest.size[0] <= 1 && rest.size[1] <= 1, 'control: it is clipped while unfocused', JSON.stringify(rest.size));

  await page.tab();
  await page.eval(`new Promise((r) => setTimeout(r, 200))`, true);
  const focused = await page.eval(`(() => {
    const a = document.activeElement;
    const r = a.getBoundingClientRect();
    return JSON.stringify({
      text: (a.textContent || '').trim().slice(0, 24),
      matchesFocus: a.matches(':focus'),
      size: [Math.round(r.width), Math.round(r.height)],
    });
  })()`);
  const focus = JSON.parse(focused);
  check(/skip to content/i.test(focus.text), 'control: one Tab reaches it — it is the first stop', focus.text);
  check(focus.matchesFocus === true, 'control: and :focus genuinely matches, so the styles below are real');
  check(
    focus.size[0] >= 24 && focus.size[1] >= 24,
    'control: it becomes a real 24x24+ target when focused — so exempting it is honest',
    JSON.stringify(focus.size),
  );
}

/* ================================================== 1. EVERY ADMIN ROUTE = */

/**
 * Ids come from the database rather than being hard-coded, so this follows
 * whatever the machine actually has. An empty list means the detail route is
 * skipped AND SAID SO — a silently skipped route is how a suite claims a
 * coverage it does not have.
 */
const one = async (model) =>
  (await prisma[model].findFirst({ select: { id: true } }))?.id ?? null;

const ids = {
  topper: await one('topper'),
  story: await one('studentStory'),
  faculty: await one('faculty'),
  gallery: await one('galleryItem'),
  video: await one('video'),
  batch: await one('batch'),
  announcement: await one('announcement'),
  enquiry: await one('enquiry'),
};

const LISTS = [
  '/admin', '/admin/enquiries', '/admin/students', '/admin/stories', '/admin/website',
  '/admin/faculty', '/admin/reviews', '/admin/gallery', '/admin/videos', '/admin/batches',
  '/admin/announcements', '/admin/preview', '/admin/media', '/admin/data',
];
const NEW = [
  '/admin/students/new', '/admin/stories/new', '/admin/faculty/new',
  '/admin/gallery/new', '/admin/videos/new', '/admin/batches/new',
  '/admin/announcements/new',
];
const DETAIL = [
  ['/admin/students/', ids.topper], ['/admin/stories/', ids.story],
  ['/admin/faculty/', ids.faculty], ['/admin/gallery/', ids.gallery],
  ['/admin/videos/', ids.video], ['/admin/batches/', ids.batch],
  ['/admin/announcements/', ids.announcement], ['/admin/enquiries/', ids.enquiry],
];

const detailRoutes = [];
for (const [prefix, id] of DETAIL) {
  if (id) detailRoutes.push(prefix + id);
  else console.log(`  SKIP  ${prefix}[id] — no record exists to open`);
}

const ROUTES = [...LISTS, ...NEW, ...detailRoutes];

section(`1. EVERY ADMIN ROUTE AT ${WIDTHS.join(', ')} px (${ROUTES.length} routes)`);
{
  const problems = { overflow: [], small: [], unlabelled: [], h1: [], jump: [], tables: [], mains: [] };

  for (const route of ROUTES) {
    for (const w of WIDTHS) {
      await page.viewport(w, 800, { mobile: w < 768 });
      await page.goto(BASE + route);
      const r = await page.eval(PROBE);
      const at = `${route} @${w}`;
      if (r.overflowBy > 1) problems.overflow.push(`${at}: +${r.overflowBy}px [${r.offenders.join(' | ')}]`);
      if (r.small.length) problems.small.push(`${at}: ${r.small.join(' ; ')}`);
      if (r.unlabelled.length) problems.unlabelled.push(`${at}: ${r.unlabelled.join(',')}`);
      if (r.h1 !== 1) problems.h1.push(`${at}: ${r.h1} h1s`);
      if (r.jump) problems.jump.push(`${at}: ${r.jump}`);
      if (r.clippedTables.length) problems.tables.push(`${at}: ${r.clippedTables.join(',')}`);
      if (r.mains !== 1) problems.mains.push(`${at}: ${r.mains} <main>`);
    }
  }

  check(problems.overflow.length === 0, 'nothing scrolls sideways at any width', problems.overflow.slice(0, 4).join(' || '));
  check(problems.small.length === 0, 'every control meets 24x24 (WCAG 2.5.8)', problems.small.slice(0, 4).join(' || '));
  check(problems.unlabelled.length === 0, 'every visible input has an accessible name', problems.unlabelled.slice(0, 4).join(' || '));
  check(problems.h1.length === 0, 'every page has exactly one rendered h1', problems.h1.slice(0, 4).join(' || '));
  check(problems.jump.length === 0, 'no heading level is skipped in the rendered outline', problems.jump.slice(0, 3).join(' || '));
  check(problems.tables.length === 0, 'no table is clipped without a scrolling parent', problems.tables.slice(0, 3).join(' || '));
  check(problems.mains.length === 0, 'every page has exactly one <main> landmark', problems.mains.slice(0, 3).join(' || '));
  console.log(`  ...measured ${ROUTES.length} routes x ${WIDTHS.length} widths = ${ROUTES.length * WIDTHS.length} renders`);
}

/* ============================================ 2. THE WAY BACK FROM A PAGE = */

/**
 * Of the fifteen pages opened from a list, exactly one had a back link.
 *
 * It matters most at 320-390px, where the sidebar is behind a drawer: the only
 * alternatives were Cancel at the bottom of a long form, or opening the menu.
 */
section('2. EVERY PAGE OPENED FROM A LIST OFFERS A WAY BACK TO IT');
{
  const fromAList = [...NEW, ...detailRoutes];
  const missing = [];
  const undersized = [];
  const wrongTarget = [];

  await page.viewport(390, 800, { mobile: true });
  for (const route of fromAList) {
    await page.goto(BASE + route);
    const r = await page.eval(PROBE);
    const back = r.backLinks[0];
    if (!back) {
      missing.push(route);
      continue;
    }
    if (back.h < 23.5 || back.w < 23.5) undersized.push(`${route}: ${back.w}x${back.h}`);
    const list = '/' + route.split('/').slice(1, 3).join('/');
    if (back.href !== list) wrongTarget.push(`${route}: back points at ${back.href}, expected ${list}`);
  }

  check(missing.length === 0, `all ${fromAList.length} pages reached from a list have a back link`, missing.join(', '));
  check(undersized.length === 0, 'and every back link meets 24x24', undersized.join(' | '));
  check(wrongTarget.length === 0, 'and every back link returns to its own list', wrongTarget.join(' | '));

  /*
    A top-level list must NOT carry one. "Back" from a section is meaningless,
    and it would be one more control between a thumb and the content.
  */
  const strays = [];
  for (const route of LISTS) {
    await page.goto(BASE + route);
    const r = await page.eval(PROBE);
    if (r.backLinks.length > 0) strays.push(`${route}: ${r.backLinks.map((b) => b.text).join(',')}`);
  }
  check(strays.length === 0, 'and no top-level list page carries a stray back link', strays.join(' | '));
}

/* ==================================== 3. THE FOOTER AGREES WITH THE MENU == */

/**
 * Renaming a menu entry used to change the header and leave the footer alone,
 * so one page offered the same destination under two different names. It was
 * reproduced against the live site in Phase 18 and fixed in `getFooterNav`.
 */
section('3. A RENAMED MENU ENTRY IS RENAMED EVERYWHERE');
{
  const KEY = 'nav.results.label';
  const MARKER = 'ZZUX Our Results';
  const existing = await prisma.siteSetting.findUnique({ where: { key: KEY } });

  /**
   * Save one field through the REAL click-to-edit control.
   *
   * ⚠ EVERY STATE CHANGE IN THIS SECTION GOES THROUGH THE EDITOR, INCLUDING THE
   * TEARDOWN.
   *
   * A first version wrote the row with `siteSetting.upsert` and read /about,
   * and both assertions failed — not because the fix was wrong, but because
   * /about is ISR-cached and a direct row write revalidates nothing.
   *
   * The SECOND version fixed the setup and left the teardown writing directly.
   * That was worse: the run passed, deleted the row, and left the rendered page
   * still showing "ZZUX Our Results" — so the NEXT run's controls failed, and
   * the suite had poisoned its own baseline. Exactly the wreckage
   * `verify-admin.mjs` warns about at the top of its snapshot guard.
   *
   * Clearing a field through the editor is the documented undo: it stores an
   * empty value, the registry fallback takes over, and `revalidateFor()` runs.
   */
  const saveField = async (key, value) => {
    await page.viewport(1280, 900);
    await page.goto(`${BASE}/admin/preview`);
    const outcome = await page.eval(`(async () => {
      const only = document.querySelector('input[name="only"][value="' + ${JSON.stringify(key)} + '"]');
      if (!only) return 'NO EDITOR FOR ' + ${JSON.stringify(key)};
      const form = only.closest('form');
      const box = form.querySelector('input[type=text], textarea');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(box, ${JSON.stringify(value)});
      box.dispatchEvent(new Event('input', { bubbles: true }));
      form.querySelector('button[type=submit]').click();
      await new Promise((r) => setTimeout(r, 3000));
      return 'saved';
    })()`, true);
    await new Promise((r) => setTimeout(r, 700));
    return outcome;
  };

  const resultsLink = (region) => {
    const m = region.match(/href="\/results"[^>]*>([^<]*)</);
    return m ? m[1] : null;
  };
  const load = async () => {
    const html = await (await fetch(`${BASE}/about`, { headers: { 'cache-control': 'no-cache' } })).text();
    return {
      header: html.slice(0, html.indexOf('</header>')),
      footer: html.slice(html.indexOf('<footer')),
    };
  };

  /* --- baseline, established through the editor so the cache is current --- */
  check((await saveField(KEY, '')) === 'saved', 'setup: cleared the menu label through the editor');
  const base = await load();
  check(resultsLink(base.header) === 'Results', 'control: with nothing typed the menu shows the shipped wording', String(resultsLink(base.header)));
  check(resultsLink(base.footer) === 'Results', 'control: and so does the footer', String(resultsLink(base.footer)));
  check(
    /href="\/courses"[^>]*>All courses</.test(base.footer),
    'control: the footer keeps its OWN wording where it deliberately differs',
    'expected "All courses" in the footer, not "Courses"',
  );

  /* --- the rename --- */
  check((await saveField(KEY, MARKER)) === 'saved', 'the website editor saved the new menu label');
  const stored = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  check(stored?.value === MARKER, 'control: and it really is in the database', JSON.stringify(stored?.value));

  const renamed = await load();
  check(resultsLink(renamed.header) === MARKER, 'the menu shows the new name', String(resultsLink(renamed.header)));
  check(resultsLink(renamed.footer) === MARKER, 'AND SO DOES THE FOOTER', String(resultsLink(renamed.footer)));

  /* --- undo, through the editor, so the cache is left correct --- */
  await saveField(KEY, existing ? existing.value : '');
  const after = await load();
  check(
    resultsLink(after.footer) === (existing ? existing.value : 'Results'),
    'teardown: clearing it puts the original wording back, everywhere',
    String(resultsLink(after.footer)),
  );

  if (!existing) await prisma.siteSetting.deleteMany({ where: { key: KEY } });
  const left = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  check(
    existing === null ? left === null : left?.value === existing.value,
    'teardown: the settings table is back as it was',
    JSON.stringify(left?.value ?? null),
  );
}

/* ==================================== 4. CHOOSING AN ALREADY-UPLOADED PHOTO */

/**
 * `prisma/schema.prisma` gives "the admin must be able to pick a photo already
 * uploaded" as the FIRST of three reasons the media table exists. It had never
 * been built, so until Phase 18 attaching a photograph required still having
 * the file — on a phone, weeks later, usually untrue.
 */
section('4. THE PHOTO PICKER');
{
  await page.viewport(390, 800, { mobile: true });
  await page.goto(`${BASE}/admin/faculty/new`);

  const opened = await page.eval(String.raw`(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) => /choose an uploaded photo/i.test(b.textContent));
    if (!btn) return 'NO BUTTON';
    const b = btn.getBoundingClientRect();
    if (b.height < 23.5 || b.width < 23.5) return 'BUTTON TOO SMALL ' + Math.round(b.width) + 'x' + Math.round(b.height);
    btn.click();
    await new Promise((r) => setTimeout(r, 2000));
    const dialog = document.querySelector('dialog[open]');
    if (!dialog) return 'DIALOG DID NOT OPEN';
    const labelledBy = dialog.getAttribute('aria-labelledby');
    return JSON.stringify({
      modal: dialog.matches(':modal'),
      labelled: Boolean(labelledBy && document.getElementById(labelledBy)),
      text: dialog.innerText.replace(/\s+/g, ' ').slice(0, 400),
      choices: dialog.querySelectorAll('li button').length,
    });
  })()`, true);

  check(opened !== 'NO BUTTON' && !String(opened).startsWith('BUTTON TOO SMALL'), 'the picker button exists and meets 24x24', String(opened).slice(0, 60));
  check(opened !== 'DIALOG DID NOT OPEN', 'the picker opens a dialog', String(opened).slice(0, 60));

  let info = null;
  try {
    info = JSON.parse(opened);
  } catch {
    /* already reported above */
  }
  if (info) {
    check(info.modal === true, 'it is a MODAL dialog, so the page behind it is inert');
    check(info.labelled === true, 'the dialog has an accessible name');
    check(
      info.choices > 0 || /nothing has been uploaded/i.test(info.text),
      'it lists the uploaded photos, or says plainly that there are none',
      info.text.slice(0, 90),
    );
    check(
      /changes no permission/i.test(info.text),
      'and it says that choosing a photo grants no permission',
    );

    /*
      ⚠ A REAL KEY EVENT, THROUGH THE BROWSER.

      Dispatching `new KeyboardEvent('keydown', { key: 'Escape' })` at the
      dialog does nothing, and the first run of this suite duly reported that
      Escape did not close the picker. Closing on Escape is a USER-AGENT
      behaviour on a modal dialog, not a listener in page JavaScript, and a
      synthetic event is not trusted input. `page.escape()` sends the key
      through CDP, which is the browser actually being typed at.
    */
    const openBefore = await page.eval(`Boolean(document.querySelector('dialog[open]'))`);
    check(openBefore === true, 'control: the picker is open before Escape is pressed');
    await page.escape();
    await page.eval(`new Promise((r) => setTimeout(r, 400))`, true);
    const stillOpen = await page.eval(`Boolean(document.querySelector('dialog[open]'))`);
    check(stillOpen === false, 'Escape closes the picker', `open after Escape: ${stillOpen}`);
  }

  /* The photograph must stay OPTIONAL: opening and cancelling changes nothing. */
  const value = await page.eval(`document.querySelector('input[name=photoUrl]').value`);
  check(value === '', 'cancelling the picker leaves the field empty', JSON.stringify(value));
}

/* =================================================== 5. THE LISTING ACTION */

/**
 * A new `'use server'` export is a new public endpoint, whatever renders it.
 * It must authenticate on its own — the proxy is not the control.
 */
section('5. THE PHOTO-LISTING ACTION AUTHENTICATES ON ITS OWN');
{
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/admin/faculty/new`);
  await page.eval(String.raw`(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) => /choose an uploaded photo/i.test(b.textContent));
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 1800));
    return 1;
  })()`, true);

  const actionRequest = [...page.requests]
    .reverse()
    .find((r) => r.method === 'POST' && Object.keys(r.headers).some((h) => h.toLowerCase() === 'next-action'));

  check(Boolean(actionRequest), 'captured the real listing request from the browser');

  if (actionRequest) {
    const actionId = Object.entries(actionRequest.headers).find(
      ([h]) => h.toLowerCase() === 'next-action',
    )?.[1];
    const adminCookie = await page.cookieHeader(BASE);

    const anon = await fetch(actionRequest.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Next-Action': actionId, Origin: BASE },
      body: '[]',
      redirect: 'manual',
    });
    const anonBody = await anon.text();
    check(anon.status < 500, 'an unauthenticated listing is handled, not crashed', `status ${anon.status}`);
    check(
      !/\/media\/[0-9a-f]{32}\./.test(anonBody),
      'and it returns no photo paths to a signed-out caller',
    );

    const csrf = await fetch(actionRequest.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Next-Action': actionId,
        Origin: 'https://attacker.example',
        Cookie: adminCookie,
      },
      body: '[]',
      redirect: 'manual',
    });
    const csrfBody = await csrf.text();
    check(csrf.status >= 400, 'a cross-origin listing is refused outright', `status ${csrf.status}`);
    check(
      !/\/media\/[0-9a-f]{32}\./.test(csrfBody),
      'and leaks no photo paths across origins',
    );

    /*
      POSITIVE CONTROL. Without this, both assertions above would pass against
      an endpoint that returns nothing to ANYONE — including the admin — and
      the picker could be entirely broken while this section stayed green.
    */
    const good = await fetch(actionRequest.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Next-Action': actionId,
        Origin: BASE,
        Cookie: adminCookie,
      },
      body: '[]',
      redirect: 'manual',
    });
    const goodBody = await good.text();
    const assets = await prisma.mediaAsset.count();
    check(
      assets === 0 || /"status"/.test(goodBody) || goodBody.includes('/media/'),
      'control: the SAME request with a valid session and origin does return a result',
      `${assets} asset(s) in the library, ${goodBody.length} bytes back`,
    );
  }
}

/* ==================================================================== END = */

console.log(`\n${'='.repeat(60)}`);
console.log(`  PASS ${pass}   FAIL ${fail}`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}

await page.close();
await browser.close();
await prisma.$disconnect();
exit(fail === 0 ? 0 : 1);
