/**
 * Real-browser QA: responsive layout, mobile navigation, keyboard, semantics.
 *
 * Everything the project verified before Phase 11 was verified over HTTP —
 * status codes, headers, and the HTML that came back. None of that can answer
 * the questions that decide whether a parent on a phone can actually use this
 * site: does the drawer open, does Escape close it, does focus come back, does
 * anything overflow at 320px, can the whole page be reached with a keyboard.
 *
 * This drives a real headless browser (see scripts/browser.mjs) and asserts on
 * what the layout engine produced, not on what the markup implied.
 *
 * Usage:
 *   BASE_URL=http://localhost:3170 node scripts/verify-ux.mjs
 *   BROWSER=edge  BASE_URL=... node scripts/verify-ux.mjs
 */

import { env, exit } from 'node:process';
import { launch, findBrowser } from './browser.mjs';

const BASE = env.BASE_URL ?? 'http://localhost:3170';
const KIND = env.BROWSER ?? 'chrome';

const PUBLIC_ROUTES = [
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
 * Real device widths, not round numbers.
 * 320 is an iPhone SE (1st gen) and the narrowest width still worth supporting;
 * 360 and 412 are the commonest Android widths in India by a wide margin.
 */
const VIEWPORTS = [
  { w: 320, h: 568, label: 'iPhone SE', mobile: true },
  { w: 360, h: 800, label: 'Android small', mobile: true },
  { w: 375, h: 812, label: 'iPhone X', mobile: true },
  { w: 390, h: 844, label: 'iPhone 14', mobile: true },
  { w: 412, h: 915, label: 'Pixel / Android common', mobile: true },
  { w: 430, h: 932, label: 'iPhone Pro Max', mobile: true },
  { w: 768, h: 1024, label: 'tablet portrait', mobile: false },
  { w: 1024, h: 768, label: 'tablet landscape', mobile: false },
  { w: 1280, h: 900, label: 'desktop', mobile: false },
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
const section = (t) => console.log(`\n=== ${t} ===`);

if (!findBrowser(KIND)) {
  console.log(`\nNOT TESTED — ENVIRONMENT LIMITATION: ${KIND} is not installed.`);
  exit(0);
}

const browser = await launch(KIND);
console.log(`\n### REAL-BROWSER QA — ${browser.version} ###`);
const page = await browser.page();

try {
  /* ============================================ 1. NO RUNTIME ERRORS ==== */
  section(`1. EVERY PUBLIC ROUTE RENDERS CLEANLY (${browser.kind})`);

  await page.viewport(390, 844, { mobile: true });
  for (const route of [...PUBLIC_ROUTES, '/this-route-does-not-exist']) {
    page.clearErrors();
    await page.goto(`${BASE}${route}`);

    // Chrome logs the navigation's own non-200 status as a failed resource
    // load. For the deliberately-missing route that IS the expected outcome,
    // so it is not counted as a page defect.
    const expected404 = route === '/this-route-does-not-exist';
    const consoleNoise = page.consoleErrors.filter(
      (e) => !(expected404 && /404 \(Not Found\)/.test(e)),
    );

    const state = await page.eval(`(() => ({
      title: document.title,
      h1s: document.querySelectorAll('h1').length,
      hasMain: Boolean(document.querySelector('main')),
      hasHeader: Boolean(document.querySelector('header')),
      hasFooter: Boolean(document.querySelector('footer')),
      bodyText: (document.body.innerText || '').length,
    }))()`);

    check(state.bodyText > 100, `${route} renders content`, `${state.bodyText} chars`);
    check(state.h1s === 1, `${route} has exactly one <h1>`, `found ${state.h1s}`);
    check(state.hasMain && state.hasHeader && state.hasFooter, `${route} has header/main/footer landmarks`);
    check(page.pageErrors.length === 0, `${route} throws no runtime error`, page.pageErrors.join(' | ').slice(0, 160));
    check(consoleNoise.length === 0, `${route} logs no console error`, consoleNoise.join(' | ').slice(0, 160));
  }

  /* ============================================ 2. HYDRATION IS REAL ==== */
  section('2. HYDRATION ACTUALLY HAPPENED');

  await page.goto(`${BASE}/`);
  // The click and the assertion must be in SEPARATE evaluations. React schedules
  // state updates; checking for the dialog in the same synchronous tick as the
  // click always reports "not open" and says nothing about hydration.
  const triggerFound = await page.eval(`(() => {
    const trigger = [...document.querySelectorAll('header button')]
      .find((b) => (b.textContent || '').toLowerCase().includes('open menu'));
    if (!trigger) return false;
    trigger.click();
    return true;
  })()`);
  await page.eval('new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)))', true);
  const hydrated = {
    found: triggerFound,
    openedByScript: await page.eval(`Boolean(document.querySelector('[role="dialog"]'))`),
  };
  check(hydrated.found, 'the menu trigger exists in the DOM');
  check(hydrated.openedByScript, 'clicking the trigger opens the drawer — React is hydrated');
  await page.goto(`${BASE}/`);

  /* ================================================ 3. NO OVERFLOW ===== */
  section('3. NO HORIZONTAL OVERFLOW AT ANY REAL DEVICE WIDTH');

  for (const vp of VIEWPORTS) {
    await page.viewport(vp.w, vp.h, { mobile: vp.mobile });
    for (const route of PUBLIC_ROUTES) {
      await page.goto(`${BASE}${route}`);
      const overflow = await page.eval(`(() => {
        const docWidth = document.documentElement.clientWidth;
        const offenders = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          // A couple of pixels of subpixel rounding is not an overflow.
          if (r.right > docWidth + 2 || r.left < -2) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className || '').toString().slice(0, 60),
              right: Math.round(r.right),
              left: Math.round(r.left),
            });
          }
        }
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: docWidth,
          offenders: offenders.slice(0, 4),
        };
      })()`);

      const scrolls = overflow.scrollWidth > overflow.clientWidth + 2;
      check(
        !scrolls,
        `${vp.w}px ${route} does not scroll sideways`,
        `scrollWidth ${overflow.scrollWidth} > ${overflow.clientWidth}; first offender ${JSON.stringify(overflow.offenders[0] ?? null)}`,
      );
    }
  }

  /* ========================================== 4. THE MOBILE DRAWER ===== */
  section('4. MOBILE NAVIGATION DRAWER — the only nav below lg');

  await page.viewport(390, 844, { mobile: true });
  await page.goto(`${BASE}/`);
  page.clearErrors();

  const triggerBox = await page.eval(`(() => {
    const t = [...document.querySelectorAll('header button')]
      .find((b) => (b.textContent || '').toLowerCase().includes('open menu'));
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height,
             expanded: t.getAttribute('aria-expanded'), controls: t.getAttribute('aria-controls') };
  })()`);
  check(Boolean(triggerBox), 'the drawer trigger is present at mobile width');
  check(triggerBox?.expanded === 'false', 'trigger reports aria-expanded="false" when closed');
  check(Boolean(triggerBox?.controls), 'trigger names the element it controls via aria-controls');
  check(
    (triggerBox?.w ?? 0) >= 44 && (triggerBox?.h ?? 0) >= 44,
    'trigger meets the 44px touch-target guideline',
    `${Math.round(triggerBox?.w ?? 0)}x${Math.round(triggerBox?.h ?? 0)}`,
  );

  // OPEN by real pointer event.
  await page.clickAt(triggerBox.x, triggerBox.y);
  const opened = await page.eval(`(() => {
    const d = document.querySelector('[role="dialog"]');
    const t = [...document.querySelectorAll('header button')]
      .find((b) => (b.textContent || '').toLowerCase().includes('open menu'));
    return {
      open: Boolean(d),
      modal: d?.getAttribute('aria-modal'),
      labelled: Boolean(d?.getAttribute('aria-label') || d?.getAttribute('aria-labelledby')),
      expanded: t?.getAttribute('aria-expanded'),
      bodyOverflow: getComputedStyle(document.body).overflow,
      focusInside: Boolean(d && d.contains(document.activeElement)),
      links: d ? d.querySelectorAll('a').length : 0,
    };
  })()`);

  check(opened.open, 'tapping the trigger opens the drawer');
  check(opened.modal === 'true', 'drawer is aria-modal="true"');
  check(opened.labelled, 'drawer has an accessible name');
  check(opened.expanded === 'true', 'trigger updates aria-expanded to "true"');
  check(opened.bodyOverflow === 'hidden', 'body scroll is locked while the drawer is open', `overflow: ${opened.bodyOverflow}`);
  check(opened.focusInside, 'focus moves into the drawer on open');
  check(opened.links >= 5, 'drawer contains the navigation links', `${opened.links} links`);

  /**
   * THE ASSERTION THAT WOULD HAVE CAUGHT THE PHASE 11 DRAWER BUG.
   *
   * Every check above this line passed while the drawer was BROKEN. It opened,
   * it was aria-modal, focus moved into it, and it contained seven links — all
   * true, and all irrelevant, because the panel was 64px tall and the links
   * were clipped out of sight. Presence is not usability.
   *
   * These two assert what a thumb actually experiences: the panel fills the
   * screen, and every navigation link is the element you would hit if you
   * tapped its centre. `elementFromPoint` is the whole point — a link that is
   * clipped, covered or off-screen fails it, however present it is in the DOM.
   */
  const usable = await page.eval(`(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const links = [...d.querySelectorAll('nav a')];
    const blocked = [];
    for (const a of links) {
      const lr = a.getBoundingClientRect();
      const hit = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
      if (!hit || !(hit === a || a.contains(hit) || a.contains(hit.parentElement))) {
        blocked.push((a.getAttribute('href') || '?') + ' covered by ' +
          (hit ? hit.tagName.toLowerCase() : 'nothing'));
      }
    }
    return {
      height: Math.round(r.height),
      viewport: window.innerHeight,
      total: links.length,
      blocked,
    };
  })()`);

  check(
    usable && usable.height >= usable.viewport * 0.9,
    'the drawer fills the screen rather than being clipped by an ancestor',
    `${usable?.height}px tall in a ${usable?.viewport}px viewport`,
  );
  check(
    usable && usable.blocked.length === 0,
    'every navigation link in the drawer is actually tappable',
    usable?.blocked.join(' | '),
  );

  // TAB should not escape the drawer.
  let escapedFocus = false;
  for (let i = 0; i < 14; i += 1) {
    await page.tab();
    const inside = await page.eval(`(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.contains(document.activeElement) : true;
    })()`);
    if (!inside) {
      escapedFocus = true;
      break;
    }
  }
  check(!escapedFocus, 'Tab does not move focus out of the open drawer (focus is trapped)');

  // ESCAPE closes and returns focus.
  await page.escape();
  const afterEscape = await page.eval(`(() => {
    const t = [...document.querySelectorAll('header button')]
      .find((b) => (b.textContent || '').toLowerCase().includes('open menu'));
    return {
      open: Boolean(document.querySelector('[role="dialog"]')),
      bodyOverflow: getComputedStyle(document.body).overflow,
      focusOnTrigger: document.activeElement === t,
      expanded: t?.getAttribute('aria-expanded'),
    };
  })()`);
  check(!afterEscape.open, 'Escape closes the drawer');
  check(afterEscape.bodyOverflow !== 'hidden', 'body scroll is released when the drawer closes');
  check(afterEscape.focusOnTrigger, 'focus returns to the trigger after Escape');
  check(afterEscape.expanded === 'false', 'aria-expanded returns to "false"');

  // The scrim closes it too.
  await page.clickAt(triggerBox.x, triggerBox.y);
  check(await page.eval(`Boolean(document.querySelector('[role="dialog"]'))`), 'drawer reopens after being closed');
  /**
   * THE SCRIM IS ONLY REACHABLE ON WIDER PHONES, AND THAT IS BY DESIGN.
   *
   * The panel is `w-full max-w-sm`, so measured: 320px -> 0px of scrim, 360px
   * -> 0px, 390px -> 6px, 430px -> 46px, 768px -> 384px. On the commonest
   * Indian Android widths the drawer is deliberately full-screen and there is
   * nothing outside it to tap.
   *
   * That is not a defect — Escape, the labelled close button and navigating all
   * dismiss it, and a full-width drawer on a small phone is a normal pattern.
   * But it does mean "tap outside to close" can only be TESTED at a width where
   * the scrim actually exists. An earlier draft of this suite tapped the
   * scrim's centre at 390px, hit the panel instead, and reported a failure that
   * said nothing about the application.
   */
  await page.viewport(430, 932, { mobile: true });
  await page.goto(`${BASE}/`);
  const wideTrigger = await page.eval(`(() => {
    const t = [...document.querySelectorAll('header button')]
      .find((b) => (b.textContent || '').toLowerCase().includes('open menu'));
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await page.clickAt(wideTrigger.x, wideTrigger.y);
  check(await page.eval(`Boolean(document.querySelector('[role="dialog"]'))`), 'drawer opens at 430px');

  const scrim = await page.eval(`(() => {
    const d = document.querySelector('[role="dialog"]');
    const el = document.querySelector('[aria-label="Close menu"]');
    if (!d || !el) return null;
    const dr = d.getBoundingClientRect();
    return { exposed: Math.round(dr.left), x: dr.left / 2, y: dr.top + dr.height / 2 };
  })()`);
  check(Boolean(scrim) && scrim.exposed > 20, 'the scrim is tappable at 430px', `${scrim?.exposed}px exposed`);
  if (scrim) await page.clickAt(scrim.x, scrim.y);
  check(
    !(await page.eval(`Boolean(document.querySelector('[role="dialog"]'))`)),
    'tapping outside the drawer closes it where the scrim is reachable',
  );

  // The close button must work at EVERY width, because on narrow phones it and
  // Escape are the only ways out.
  for (const width of [320, 360, 390]) {
    await page.viewport(width, 800, { mobile: true });
    await page.goto(`${BASE}/`);
    await page.eval(`(() => {
      const t = [...document.querySelectorAll('header button')]
        .find((b) => (b.textContent || '').toLowerCase().includes('open menu'));
      t.click();
    })()`);
    await page.eval('new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)))', true);
    check(
      await page.eval(`Boolean(document.querySelector('[role="dialog"]'))`),
      `${width}px drawer opens`,
    );
    const closed = await page.eval(`(() => {
      const d = document.querySelector('[role="dialog"]');
      const btn = [...d.querySelectorAll('button')]
        .find((b) => (b.textContent || '').toLowerCase().includes('close menu'));
      if (!btn) return 'no close button';
      const r = btn.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) return 'close button too small: ' + Math.round(r.width) + 'x' + Math.round(r.height);
      btn.click();
      return 'clicked';
    })()`);
    await page.eval('new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)))', true);
    check(closed === 'clicked', `${width}px close button is present and 44px`, String(closed));
    check(
      !(await page.eval(`Boolean(document.querySelector('[role="dialog"]'))`)),
      `${width}px the close button dismisses the drawer`,
    );
  }

  // The clipping bug was invisible at desktop widths, so the hit test runs at
  // every phone width rather than only the one the suite happens to sit at.
  for (const width of [320, 360, 375, 390, 412, 430]) {
    await page.viewport(width, 844, { mobile: true });
    await page.goto(`${BASE}/`);
    await page.eval(`(() => {
      const t = [...document.querySelectorAll('header button')]
        .find((b) => (b.textContent || '').toLowerCase().includes('open menu'));
      if (t) t.click();
    })()`);
    await page.eval('new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)))', true);
    const hit = await page.eval(`(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      const links = [...d.querySelectorAll('nav a')];
      let reachable = 0;
      for (const a of links) {
        const lr = a.getBoundingClientRect();
        const el = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
        if (el && (el === a || a.contains(el) || a.contains(el.parentElement))) reachable += 1;
      }
      return { height: Math.round(d.getBoundingClientRect().height), reachable, total: links.length };
    })()`);
    check(
      hit && hit.reachable === hit.total && hit.total >= 5,
      `${width}px every drawer link is tappable`,
      `${hit?.reachable}/${hit?.total} reachable, panel ${hit?.height}px`,
    );
    await page.escape();
  }

  // NAVIGATING from inside the drawer must close it, and must actually navigate.
  await page.viewport(390, 844, { mobile: true });
  await page.goto(`${BASE}/`);
  await page.clickAt(triggerBox.x, triggerBox.y);
  const navHref = await page.eval(`(() => {
    const d = document.querySelector('[role="dialog"]');
    const link = d && [...d.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/results');
    if (!link) return null;
    const r = link.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  check(Boolean(navHref), 'the drawer links to /results');
  if (navHref) {
    await page.clickAt(navHref.x, navHref.y);
    await page.eval('new Promise((r) => setTimeout(r, 1200))', true);
    const afterNav = await page.eval(`(() => ({
      path: location.pathname,
      open: Boolean(document.querySelector('[role="dialog"]')),
      bodyOverflow: getComputedStyle(document.body).overflow,
    }))()`);
    check(afterNav.path === '/results', 'tapping a drawer link navigates', `at ${afterNav.path}`);
    check(!afterNav.open, 'the drawer closes after navigating');
    check(afterNav.bodyOverflow !== 'hidden', 'body scroll is not left locked after navigating');
  }

  // Reopening after a navigation must still work.
  await page.eval(`(() => {
    const t = [...document.querySelectorAll('header button')]
      .find((b) => (b.textContent || '').toLowerCase().includes('open menu'));
    if (t) t.click();
  })()`);
  await page.eval('new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)))', true);
  check(
    await page.eval(`Boolean(document.querySelector('[role="dialog"]'))`),
    'the drawer still opens after a client-side navigation',
  );
  await page.escape();

  // Browser back after navigating from the drawer.
  await page.eval('history.back()');
  await page.eval('new Promise((r) => setTimeout(r, 1200))', true);
  const afterBack = await page.eval(`(() => ({
    path: location.pathname,
    open: Boolean(document.querySelector('[role="dialog"]')),
    bodyOverflow: getComputedStyle(document.body).overflow,
  }))()`);
  check(afterBack.path === '/', 'browser Back returns to the previous page', `at ${afterBack.path}`);
  check(!afterBack.open, 'the drawer is not left open by browser Back');
  check(afterBack.bodyOverflow !== 'hidden', 'browser Back does not leave body scroll locked');

  check(page.pageErrors.length === 0, 'the whole drawer interaction throws nothing', page.pageErrors.join(' | ').slice(0, 200));
  check(page.consoleErrors.length === 0, 'the whole drawer interaction logs no console error', page.consoleErrors.join(' | ').slice(0, 200));

  /* ============================================= 5. KEYBOARD ACCESS ==== */
  section('5. KEYBOARD-ONLY NAVIGATION');

  await page.viewport(1280, 900, { mobile: false });
  await page.goto(`${BASE}/`);

  // The skip link must be the first thing a keyboard user reaches.
  await page.tab();
  const firstStop = await page.eval(`(() => {
    const a = document.activeElement;
    return { tag: a.tagName.toLowerCase(), text: (a.textContent || '').trim().slice(0, 40), href: a.getAttribute && a.getAttribute('href') };
  })()`);
  check(/skip/i.test(firstStop.text), 'the first Tab stop is the skip link', JSON.stringify(firstStop));

  const focusVisible = await page.eval(`(() => {
    const a = document.activeElement;
    const s = getComputedStyle(a);
    return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
  })()`);
  check(
    focusVisible.outline !== 'none' || focusVisible.shadow !== 'none',
    'the focused element has a visible focus indicator',
    JSON.stringify(focusVisible),
  );

  // Walk the whole page. No element may trap focus, and every stop must be
  // something a person can identify.
  const walk = await page.eval(`(() => {
    const seen = [];
    const nameless = [];
    const focusable = [...document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )];
    for (const el of focusable) {
      const name = (
        el.getAttribute('aria-label') ||
        (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
        el.textContent ||
        el.getAttribute('title') ||
        (el.labels && el.labels[0] && el.labels[0].textContent) ||
        el.getAttribute('placeholder') ||
        ''
      ).trim();
      seen.push(el.tagName.toLowerCase());
      if (name.length === 0 && el.getAttribute('aria-hidden') !== 'true') {
        nameless.push(el.tagName.toLowerCase() + '.' + (el.className || '').toString().slice(0, 40));
      }
    }
    return { count: seen.length, nameless };
  })()`);
  check(walk.count > 10, 'the homepage has a real set of focusable controls', `${walk.count}`);
  check(walk.nameless.length === 0, 'every focusable control has an accessible name', walk.nameless.join(', ').slice(0, 200));

  /* ======================================== 6. SEMANTICS AND LABELS ==== */
  section('6. SEMANTICS, LABELS AND ALT TEXT');

  for (const route of PUBLIC_ROUTES) {
    await page.goto(`${BASE}${route}`);
    const semantics = await page.eval(`(() => {
      const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .map((h) => Number(h.tagName[1]));
      let skipped = null;
      for (let i = 1; i < levels.length; i += 1) {
        if (levels[i] - levels[i - 1] > 1) { skipped = levels[i - 1] + ' -> ' + levels[i]; break; }
      }
      const images = [...document.querySelectorAll('img')];
      const badImages = images.filter(
        (i) => !i.hasAttribute('alt') && i.getAttribute('aria-hidden') !== 'true'
      ).length;
      const inputs = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')];
      const unlabelled = inputs.filter((i) => {
        const byLabel = i.labels && i.labels.length > 0;
        const byAria = i.getAttribute('aria-label') || i.getAttribute('aria-labelledby');
        return !byLabel && !byAria;
      }).map((i) => i.name || i.id || i.type);
      const emptyLinks = [...document.querySelectorAll('a[href]')].filter(
        (a) => (a.textContent || '').trim().length === 0 &&
               !a.getAttribute('aria-label') && a.getAttribute('aria-hidden') !== 'true'
      ).length;
      return { skipped, badImages, unlabelled, emptyLinks, headings: levels.length };
    })()`);

    check(semantics.skipped === null, `${route} heading levels do not skip`, `skipped ${semantics.skipped}`);
    check(semantics.badImages === 0, `${route} every image has alt or is aria-hidden`, `${semantics.badImages} without`);
    check(semantics.unlabelled.length === 0, `${route} every form control is labelled`, semantics.unlabelled.join(', '));
    check(semantics.emptyLinks === 0, `${route} no link has an empty accessible name`, `${semantics.emptyLinks}`);
  }

  /* ============================================== 7. TOUCH TARGETS ===== */
  section('7. TOUCH TARGET SIZE AT PHONE WIDTH');

  await page.viewport(360, 800, { mobile: true });
  for (const route of PUBLIC_ROUTES) {
    await page.goto(`${BASE}${route}`);
    const small = await page.eval(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('a[href], button:not([disabled]), input[type=submit]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        // A skip link is 1x1 and clipped until it receives focus - that is the
        // correct implementation of one, not an undersized target. WCAG 2.5.8
        // measures the target as presented when it is available.
        const s2 = getComputedStyle(el);
        const visuallyHidden =
          s2.clipPath === 'inset(50%)' ||
          s2.clip === 'rect(0px, 0px, 0px, 0px)' ||
          (r.width <= 1 && r.height <= 1);
        if (visuallyHidden) continue;

        // WCAG 2.2 AA (2.5.8) requires 24x24 CSS px unless inline in a sentence.
        // A link inside a paragraph is exempt, so those are skipped.
        const inline = el.closest('p, li') && s2.display === 'inline';
        if (inline) continue;
        if (r.width < 24 || r.height < 24) {
          out.push(el.tagName.toLowerCase() + ':' + (el.textContent || '').trim().slice(0, 24) +
                   ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        }
      }
      return out.slice(0, 5);
    })()`);
    check(small.length === 0, `${route} all touch targets meet 24x24 (WCAG 2.5.8)`, small.join(' | '));
  }

  /* ================================================== 8. DARK MODE ===== */
  section('8. DARK MODE — text must remain readable');

  await page.emulateColorScheme('dark');
  await page.viewport(390, 844, { mobile: true });

  for (const route of PUBLIC_ROUTES) {
    await page.goto(`${BASE}${route}`);
    const contrast = await page.eval(`(() => {
      const lum = (rgb) => {
        const [r, g, b] = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const parse = (c) => {
        const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
      };
      const bgOf = (el) => {
        let n = el;
        while (n && n !== document.documentElement) {
          const c = getComputedStyle(n).backgroundColor;
          const p = parse(c);
          if (p && !/rgba\\([^)]*,\\s*0\\)/.test(c)) return p;
          n = n.parentElement;
        }
        return parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
      };
      const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };
      const bad = [];
      const nodes = [...document.querySelectorAll('p, h1, h2, h3, a, span, li, dt, dd, button')];
      for (const el of nodes) {
        const text = (el.textContent || '').trim();
        if (text.length === 0) continue;
        // Only leaf-ish nodes, or we measure a container's colour against itself.
        if (el.children.length > 0 && el.childNodes.length !== 1) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const s = getComputedStyle(el);
        const fg = parse(s.color);
        if (!fg) continue;
        const size = parseFloat(s.fontSize);
        const weight = Number(s.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        const got = ratio(fg, bgOf(el));
        if (got < need) {
          bad.push(text.slice(0, 30) + ' ' + got.toFixed(2) + ':1 (needs ' + need + ')');
        }
      }
      return bad.slice(0, 5);
    })()`);
    check(contrast.length === 0, `${route} dark-mode text meets AA contrast`, contrast.join(' | '));
  }
  await page.emulateColorScheme('light');

  /* ============================================== 9. ZOOM TO 200% ====== */
  section('9. 200% ZOOM (WCAG 1.4.4) — content must not be lost');

  // Emulating 200% zoom on a 1280px screen is a 640px layout viewport.
  await page.viewport(640, 512, { mobile: false });
  for (const route of PUBLIC_ROUTES) {
    await page.goto(`${BASE}${route}`);
    const zoomed = await page.eval(`(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))()`);
    check(
      zoomed.scrollWidth <= zoomed.clientWidth + 2,
      `${route} reflows at 200% zoom without sideways scrolling`,
      `${zoomed.scrollWidth} > ${zoomed.clientWidth}`,
    );
  }

  /* ======================================= 10. REDUCED MOTION ========== */
  section('10. REDUCED MOTION IS HONOURED');

  await page.viewport(390, 844, { mobile: true });
  await page.goto(`${BASE}/`);
  const motion = await page.eval(`(() => {
    const el = document.querySelector('.animate-rise') || document.querySelector('[class*="transition"]');
    if (!el) return { checked: false };
    return { checked: true, duration: getComputedStyle(el).transitionDuration };
  })()`);
  // The rule lives in globals.css under a media query; assert the query exists
  // rather than trying to emulate it, which CDP cannot do per-element.
  // Tailwind v4 emits inside @layer, so the media rule is NOT a direct child of
  // the stylesheet. A one-level walk over cssRules finds nothing and reports a
  // missing rule that is demonstrably being served.
  const hasReducedMotionRule = await page.eval(`(() => {
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.conditionText && rule.conditionText.includes('prefers-reduced-motion')) return true;
        if (rule.cssRules && walk(rule.cssRules)) return true;
      }
      return false;
    };
    for (const sheet of document.styleSheets) {
      try {
        if (walk(sheet.cssRules)) return true;
      } catch { /* cross-origin sheet */ }
    }
    return false;
  })()`);
  check(hasReducedMotionRule, 'a prefers-reduced-motion rule is present in the stylesheet');
  if (motion.checked) ok('motion-bearing elements exist to be governed by it');
} catch (error) {
  console.error('\nHarness error:', error instanceof Error ? `${error.name}: ${error.message}` : error);
  fail += 1;
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

console.log(`\n${'='.repeat(56)}`);
console.log(`REAL-BROWSER QA (${KIND}): ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('='.repeat(56));
exit(fail > 0 ? 1 : 0);
