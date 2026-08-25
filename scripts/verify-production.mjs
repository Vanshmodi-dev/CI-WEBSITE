/**
 * PRODUCTION SMOKE TEST - read-only, non-destructive.
 *
 *   BASE_URL=https://example.com npm run verify:production
 *   npm run verify:production -- --base=https://example.com
 *   npm run verify:production -- --base=http://localhost:3000 --expect-prelaunch
 *
 * =============================================================================
 * WHAT THIS DOES AND DOES NOT DO
 * =============================================================================
 * It makes GET requests and reads the responses. It never posts, never signs
 * in, never mutates, and never touches the database. Running it against a live
 * site is safe; that is the point, because the moment you need it is right
 * after a deployment when nobody wants to experiment.
 *
 * It requires an explicit BASE_URL. There is no default and no fallback to
 * localhost: a smoke test that silently checks the wrong site reports green for
 * a deployment nobody verified.
 *
 * =============================================================================
 * IT HAS NEVER BEEN RUN AGAINST A PRODUCTION SITE
 * =============================================================================
 * There is no production site. Phase 13 verified this script against a local
 * production build, and the report says exactly that. Checks that genuinely
 * cannot be evaluated over plain HTTP - HSTS, certificate validity - report
 * NOT APPLICABLE rather than passing quietly.
 */

import { argv, env, exit } from 'node:process';

/* ============================================================ options ===== */

const args = argv.slice(2);
const valueOf = (flag) => {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
};

const BASE = (valueOf('--base') ?? env.BASE_URL ?? '').replace(/\/$/, '');
const EXPECT_PRELAUNCH = args.includes('--expect-prelaunch') || env.EXPECT_PRELAUNCH === '1';

if (!BASE) {
  console.error(
    'No target. Pass --base=https://your-domain or set BASE_URL.\n' +
      'There is deliberately no default: a smoke test that checks the wrong site is worse than none.',
  );
  exit(2);
}

let origin;
try {
  origin = new URL(BASE);
} catch {
  console.error(`BASE_URL is not a valid URL: ${BASE}`);
  exit(2);
}

const IS_HTTPS = origin.protocol === 'https:';
const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(origin.hostname);

/* =========================================================== plumbing ===== */

const results = [];

function record(id, description, status, evidence, remediation) {
  results.push({ id, description, status, evidence: evidence ?? '', remediation: remediation ?? '' });
  console.log(`  ${status.padEnd(14)}${id}  ${description}`);
  if (evidence) console.log(`                 ${evidence}`);
  if (remediation && status !== 'PASS') console.log(`                 -> ${remediation}`);
}
const pass = (id, d, e) => record(id, d, 'PASS', e);
const fail = (id, d, e, r) => record(id, d, 'FAIL', e, r);
const warn = (id, d, e, r) => record(id, d, 'WARN', e, r);
const na = (id, d, e) => record(id, d, 'NOT APPLICABLE', e);

function section(title) {
  console.log('');
  console.log(`--- ${title} ${'-'.repeat(Math.max(0, 66 - title.length))}`);
}

/** GET without following redirects, so a redirect is observable. */
async function get(pathname, { redirect = 'manual', headers = {} } = {}) {
  const url = pathname.startsWith('http') ? pathname : `${BASE}${pathname}`;
  try {
    const response = await fetch(url, {
      redirect,
      headers: { 'user-agent': 'commerce-insight-smoke-test', ...headers },
    });
    const body = response.status < 400 || response.status === 404 ? await response.text() : '';
    return { ok: true, status: response.status, headers: response.headers, body, url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), url };
  }
}

/* ======================================================= 1. REACHABLE ==== */

async function checkReachable() {
  section('1. REACHABILITY AND TRANSPORT');

  const home = await get('/');
  if (!home.ok) {
    fail(
      'S-NET-01',
      'the site responds',
      home.error,
      'Nothing else can be checked. Confirm the deployment finished and DNS resolves.',
    );
    return null;
  }
  if (home.status === 200) {
    pass('S-NET-01', 'the site responds', `GET / -> 200`);
  } else {
    fail(
      'S-NET-01',
      'the site responds',
      `GET / -> ${home.status}`,
      'The homepage must return 200. A 500 here means the app started but cannot render.',
    );
  }

  // -- S-NET-02 --------------------------------------------------------------
  if (IS_HTTPS) {
    pass('S-NET-02', 'the site is served over HTTPS', origin.origin);
  } else if (IS_LOCAL) {
    na('S-NET-02', 'the site is served over HTTPS', 'local target - TLS is terminated by the host in production');
  } else {
    fail(
      'S-NET-02',
      'the site is served over HTTPS',
      `${origin.protocol}// on a non-local host`,
      'Student names and enquiry details must not cross a network in the clear.',
    );
  }

  // -- S-NET-03 --------------------------------------------------------------
  // The http -> https redirect. Only meaningful against a real domain.
  if (IS_HTTPS) {
    const insecure = await get(`http://${origin.host}/`);
    if (!insecure.ok) {
      warn('S-NET-03', 'plain HTTP redirects to HTTPS', insecure.error, 'Could not reach port 80. Confirm with a browser.');
    } else if (insecure.status >= 300 && insecure.status < 400) {
      const location = insecure.headers.get('location') ?? '';
      if (location.startsWith('https://')) {
        pass('S-NET-03', 'plain HTTP redirects to HTTPS', `${insecure.status} -> ${location}`);
      } else {
        fail('S-NET-03', 'plain HTTP redirects to HTTPS', `${insecure.status} -> ${location}`, 'The redirect must target https://.');
      }
    } else {
      fail(
        'S-NET-03',
        'plain HTTP redirects to HTTPS',
        `http:// answered ${insecure.status} without redirecting`,
        'Enable the host\'s automatic HTTPS redirect.',
      );
    }
  } else {
    na('S-NET-03', 'plain HTTP redirects to HTTPS', 'target is not https');
  }

  return home;
}

/* ========================================================= 2. HEADERS ==== */

async function checkHeaders() {
  section('2. SECURITY HEADERS');

  const home = await get('/');
  if (!home.ok) {
    fail('S-HDR-00', 'headers can be read', home.error);
    return;
  }
  const h = home.headers;

  const expectations = [
    ['S-HDR-01', 'content-security-policy', "frame-ancestors 'none'", 'Clickjacking protection.'],
    ['S-HDR-02', 'x-content-type-options', 'nosniff', 'Stops a browser guessing that an upload is HTML.'],
    ['S-HDR-03', 'referrer-policy', 'strict-origin', 'A record URL must not leak in a Referer header.'],
    ['S-HDR-04', 'x-frame-options', 'DENY', 'The older companion to frame-ancestors.'],
    ['S-HDR-05', 'permissions-policy', 'camera=()', 'The site needs no device permissions.'],
  ];

  for (const [id, header, expected, why] of expectations) {
    const value = h.get(header);
    if (!value) {
      fail(id, `${header} is present`, 'header absent', `${why} Add it to securityHeaders in next.config.ts.`);
    } else if (!value.includes(expected)) {
      fail(id, `${header} is present and correct`, `value does not contain "${expected}"`, why);
    } else {
      pass(id, `${header} is present and correct`, value.length > 90 ? `${value.slice(0, 90)}...` : value);
    }
  }

  // -- S-HDR-06 --------------------------------------------------------------
  // HSTS is only meaningful over TLS, and browsers ignore it on plain HTTP.
  const hsts = h.get('strict-transport-security');
  if (!IS_HTTPS) {
    na('S-HDR-06', 'strict-transport-security is set', 'only meaningful over HTTPS; not evaluated');
  } else if (!hsts) {
    fail(
      'S-HDR-06',
      'strict-transport-security is set',
      'header absent over HTTPS',
      'Without it the first visit of every session is downgradeable.',
    );
  } else {
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    if (maxAge >= 15_552_000) {
      pass('S-HDR-06', 'strict-transport-security is set', hsts);
    } else {
      warn('S-HDR-06', 'strict-transport-security is set', `max-age=${maxAge} is under six months`, 'Raise it once HTTPS is known good.');
    }
  }

  // -- S-HDR-07 --------------------------------------------------------------
  const powered = h.get('x-powered-by');
  if (powered) {
    warn('S-HDR-07', 'no version disclosure header', `x-powered-by: ${powered}`, 'Set poweredByHeader: false.');
  } else {
    pass('S-HDR-07', 'no version disclosure header', 'x-powered-by absent');
  }

  // -- S-HDR-08 --------------------------------------------------------------
  /**
   * The public CSP is the documented unsafe-inline baseline; the admin's is a
   * nonce policy. Checking they are DIFFERENT is what proves the proxy ran.
   *
   * MEASURED ON /admin/login, NOT /admin. `/admin` answers a 307 to a signed-out
   * client, and a redirect carries the baseline headers only - the proxy returns
   * it before attaching the nonce. The first version of this check fetched
   * /admin, found no nonce on a bodyless redirect, and reported a CSP failure
   * against an admin panel whose CSP was correct.
   *
   * /admin/login is the right probe: it is under the same proxy matcher, it
   * renders a real page, and it is reachable without credentials - so this stays
   * a read-only check that needs no account.
   */
  const publicCsp = h.get('content-security-policy') ?? '';
  const admin = await get('/admin/login');
  const adminCsp = admin.ok ? (admin.headers.get('content-security-policy') ?? '') : '';

  if (!adminCsp) {
    warn('S-HDR-08', 'the admin runs a stricter CSP than the public site', 'no CSP on /admin', 'Check the proxy is deployed.');
  } else if (/'nonce-[A-Za-z0-9+/=]{16,}'/.test(adminCsp) && adminCsp.includes("'strict-dynamic'")) {
    pass(
      'S-HDR-08',
      'the admin runs a stricter CSP than the public site',
      `admin has a nonce and strict-dynamic; public baseline is ${publicCsp.includes("'unsafe-inline'") ? 'the documented unsafe-inline' : 'different'}`,
    );
  } else {
    fail(
      'S-HDR-08',
      'the admin runs a stricter CSP than the public site',
      'the admin CSP carries no nonce',
      'The proxy did not run. The admin is falling back to the weaker baseline - functional, but not the intended policy.',
    );
  }

  // -- S-HDR-09 --------------------------------------------------------------
  const adminCache = admin.ok ? (admin.headers.get('cache-control') ?? '') : '';
  if (adminCache.includes('no-store')) {
    pass('S-HDR-09', 'admin responses are never cached', adminCache);
  } else if (!admin.ok) {
    warn('S-HDR-09', 'admin responses are never cached', 'could not reach /admin/login');
  } else {
    fail(
      'S-HDR-09',
      'admin responses are never cached',
      `cache-control: ${adminCache || 'absent'}`,
      'Admin responses are per-account and must never sit in a shared cache.',
    );
  }

  // -- S-HDR-10 --------------------------------------------------------------
  /**
   * The fail-safe. next.config.ts sets a baseline CSP for EVERY route including
   * /admin, and the proxy overrides it. If the proxy ever fails to run, admin
   * responses must fall back to a policy rather than to none at all.
   *
   * The signed-out redirect is the cleanest place to observe that, because the
   * proxy returns it before attaching the nonce - so what arrives is exactly the
   * fallback.
   */
  const redirect = await get('/admin');
  const redirectCsp = redirect.ok ? (redirect.headers.get('content-security-policy') ?? '') : '';
  if (!redirect.ok) {
    warn('S-HDR-10', 'admin responses fall back to a policy, never to none', redirect.error);
  } else if (redirectCsp.includes("frame-ancestors 'none'")) {
    pass(
      'S-HDR-10',
      'admin responses fall back to a policy, never to none',
      'the signed-out redirect still carries the baseline CSP',
    );
  } else {
    fail(
      'S-HDR-10',
      'admin responses fall back to a policy, never to none',
      'the admin redirect carries no CSP at all',
      'The baseline in next.config.ts should cover every route. Without it, a proxy failure means an admin page with no policy.',
    );
  }
}

/* ========================================================== 3. ROUTES ==== */

async function checkPublicRoutes() {
  section('3. PUBLIC PAGES');

  const pages = ['/', '/about', '/courses', '/results', '/stories', '/announcements', '/admissions', '/contact'];
  const failures = [];
  for (const page of pages) {
    const response = await get(page);
    if (!response.ok || response.status !== 200) {
      failures.push(`${page} -> ${response.ok ? response.status : response.error}`);
    }
  }
  if (failures.length === 0) {
    pass('S-PUB-01', 'every public page returns 200', `${pages.length} pages`);
  } else {
    fail('S-PUB-01', 'every public page returns 200', failures.join(', '), 'A 500 on a public page is visible to every visitor.');
  }

  // -- S-PUB-02 --------------------------------------------------------------
  const missing = await get('/this-page-does-not-exist-zztest');
  if (missing.ok && missing.status === 404) {
    const looksLikeStack = /at\s+\w+\s*\(|node_modules|\.tsx?:\d+/.test(missing.body);
    if (looksLikeStack) {
      fail('S-PUB-02', 'a missing page returns a clean 404', 'the 404 body contains what looks like a stack trace', 'Visitors must never see internals.');
    } else {
      pass('S-PUB-02', 'a missing page returns a clean 404', '404 with a rendered page');
    }
  } else {
    fail('S-PUB-02', 'a missing page returns a clean 404', `-> ${missing.ok ? missing.status : missing.error}`, 'An unknown path must 404, not 200 and not 500.');
  }

  // -- S-PUB-03 --------------------------------------------------------------
  // No debug output anywhere a visitor can see it.
  const home = await get('/');
  const debugMarkers = [
    ['a stack trace', /\bat\s+\w+\s*\([^)]*\.tsx?:\d+/],
    ['a filesystem path', /[A-Za-z]:\\Users\\|\/home\/[a-z0-9_-]+\//],
    ['a Prisma error code', /\bP\d{4}\b/],
    ['a raw SQL statement', /\bSELECT\s+.+\s+FROM\s+"/i],
    ['a TODO marker', /\bTODO\b|\bFIXME\b/],
    ['placeholder text', /\blorem ipsum\b/i],
  ];
  const found = home.ok ? debugMarkers.filter(([, p]) => p.test(home.body)) : [];
  if (!home.ok) {
    warn('S-PUB-03', 'no debug output is visible to a visitor', 'could not read the homepage');
  } else if (found.length === 0) {
    pass('S-PUB-03', 'no debug output is visible to a visitor', `${debugMarkers.length} markers checked`);
  } else {
    fail('S-PUB-03', 'no debug output is visible to a visitor', found.map(([label]) => label).join(', '), 'Remove it before launch.');
  }
}

/* ===================================================== 4. ADMIN GUARD ==== */

async function checkAdminGuard() {
  section('4. ADMIN IS NOT REACHABLE WITHOUT SIGNING IN');

  // Every protected path, signed out. No credentials are used and none exist.
  const protectedPaths = [
    '/admin',
    '/admin/students',
    '/admin/stories',
    '/admin/batches',
    '/admin/announcements',
    '/admin/enquiries',
    '/admin/data',
    '/admin/preview',
  ];

  const leaks = [];
  for (const p of protectedPaths) {
    const response = await get(p);
    if (!response.ok) {
      leaks.push(`${p} -> ${response.error}`);
      continue;
    }
    const redirected = response.status >= 300 && response.status < 400;
    const location = response.headers.get('location') ?? '';
    if (!redirected || !location.includes('/admin/login')) {
      leaks.push(`${p} -> ${response.status} ${location}`);
    }
  }
  if (leaks.length === 0) {
    pass('S-ADM-01', 'every admin page redirects to sign-in when signed out', `${protectedPaths.length} paths`);
  } else {
    fail('S-ADM-01', 'every admin page redirects to sign-in when signed out', leaks.join(', '), 'An admin page reachable without a session exposes student records.');
  }

  // -- S-ADM-02 --------------------------------------------------------------
  const login = await get('/admin/login');
  if (login.ok && login.status === 200) {
    pass('S-ADM-02', 'the sign-in page is reachable', '200');
  } else {
    fail('S-ADM-02', 'the sign-in page is reachable', `-> ${login.ok ? login.status : login.error}`, 'Nobody can administer the site if this is broken.');
  }

  // -- S-ADM-03 --------------------------------------------------------------
  // A forged cookie must not get in. The value is obvious nonsense; this is not
  // a credential-guessing attempt and it cannot succeed by accident.
  const forged = await get('/admin', { headers: { cookie: 'ci_admin_session=zztest-forged-not-a-real-token' } });
  if (!forged.ok) {
    warn('S-ADM-03', 'a forged session cookie is rejected', forged.error);
  } else if (forged.status >= 300 && forged.status < 400) {
    pass('S-ADM-03', 'a forged session cookie is rejected', `${forged.status} -> sign-in`);
  } else if (forged.status === 200) {
    fail(
      'S-ADM-03',
      'a forged session cookie is rejected',
      '200 with an invented cookie',
      'CRITICAL. The session signature is not being verified. Do not leave this deployed.',
    );
  } else {
    pass('S-ADM-03', 'a forged session cookie is rejected', `${forged.status}`);
  }

  // -- S-ADM-04 --------------------------------------------------------------
  const download = await get('/admin/data/download?kind=results');
  if (!download.ok) {
    warn('S-ADM-04', 'the export endpoint refuses a stranger', download.error);
  } else if (download.status === 200) {
    fail(
      'S-ADM-04',
      'the export endpoint refuses a stranger',
      '200 - student data returned without a session',
      'CRITICAL. Take the site down until this is fixed.',
    );
  } else {
    pass('S-ADM-04', 'the export endpoint refuses a stranger', `${download.status}`);
  }
}

/* ========================================================= 5. INDEXING === */

async function checkIndexing() {
  section('5. INDEXING AND CANONICALS');

  const robots = await get('/robots.txt');
  if (!robots.ok || robots.status !== 200) {
    fail('S-SEO-01', 'robots.txt is served', `-> ${robots.ok ? robots.status : robots.error}`);
    return;
  }

  const disallowsEverything = /^\s*Disallow:\s*\/\s*$/m.test(robots.body);
  const allowsRoot = /^\s*Allow:\s*\/\s*$/m.test(robots.body);

  if (EXPECT_PRELAUNCH) {
    if (disallowsEverything && !allowsRoot) {
      pass('S-SEO-01', 'robots.txt disallows everything (pre-launch)', 'Disallow: /');
    } else {
      fail(
        'S-SEO-01',
        'robots.txt disallows everything (pre-launch)',
        allowsRoot ? 'Allow: / - this site is open to crawlers' : 'no Disallow: / found',
        'The launch switch appears to be ON. If that is not intended, set SITE_IS_LAUNCHED = false and redeploy.',
      );
    }
    // A pre-launch site must not advertise a sitemap.
    if (/^\s*Sitemap:/m.test(robots.body)) {
      fail('S-SEO-02', 'no sitemap is advertised before launch', 'robots.txt contains a Sitemap: line', 'Disallow: / next to Sitemap: is a contradictory file.');
    } else {
      pass('S-SEO-02', 'no sitemap is advertised before launch', 'no Sitemap: line');
    }
  } else {
    if (allowsRoot) {
      pass('S-SEO-01', 'robots.txt allows crawling (launched)', 'Allow: /');
    } else {
      fail('S-SEO-01', 'robots.txt allows crawling (launched)', 'still disallowing', 'Both launch conditions must be true: SITE_IS_LAUNCHED and a real https:// NEXT_PUBLIC_SITE_URL.');
    }
    if (/^\s*Sitemap:\s*https:\/\//m.test(robots.body)) {
      pass('S-SEO-02', 'the sitemap is advertised', /Sitemap:.*/.exec(robots.body)?.[0] ?? '');
    } else {
      fail('S-SEO-02', 'the sitemap is advertised', 'no absolute Sitemap: line', 'Search Console needs it.');
    }
  }

  // -- S-SEO-03 --------------------------------------------------------------
  if (!/Disallow:\s*\/admin/m.test(robots.body)) {
    fail('S-SEO-03', '/admin is disallowed in robots.txt', 'no /admin rule', 'One of three independent layers keeping the admin out of search.');
  } else {
    pass('S-SEO-03', '/admin is disallowed in robots.txt', 'Disallow: /admin');
  }

  // -- S-SEO-04 --------------------------------------------------------------
  const sitemap = await get('/sitemap.xml');
  if (!sitemap.ok || sitemap.status !== 200) {
    fail('S-SEO-04', 'sitemap.xml is served', `-> ${sitemap.ok ? sitemap.status : sitemap.error}`);
  } else if (sitemap.body.includes('/admin')) {
    fail('S-SEO-04', 'sitemap.xml excludes /admin', 'the sitemap lists an admin URL', 'The admin must never be advertised.');
  } else {
    const count = (sitemap.body.match(/<loc>/g) ?? []).length;
    pass('S-SEO-04', 'sitemap.xml is served and excludes /admin', `${count} URLs`);
  }

  // -- S-SEO-05 --------------------------------------------------------------
  // Canonicals must be absolute and on the deployed origin. A canonical
  // pointing at localhost is how a staging deploy de-indexes the real site.
  const home = await get('/');
  const canonical = home.ok ? /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/.exec(home.body)?.[1] : null;
  if (!canonical) {
    warn('S-SEO-05', 'the homepage declares an absolute canonical', 'no canonical link found', 'Check generateMetadata.');
  } else if (!canonical.startsWith('http')) {
    fail('S-SEO-05', 'the homepage declares an absolute canonical', `relative canonical: ${canonical}`, 'Canonicals must be absolute.');
  } else if (new URL(canonical).host !== origin.host) {
    fail(
      'S-SEO-05',
      'the homepage declares an absolute canonical on this origin',
      `canonical points at ${new URL(canonical).host}, this is ${origin.host}`,
      'NEXT_PUBLIC_SITE_URL does not match where the site is deployed. This tells Google the real site is somewhere else.',
    );
  } else {
    pass('S-SEO-05', 'the homepage declares an absolute canonical on this origin', canonical);
  }

  // -- S-SEO-06 --------------------------------------------------------------
  const metaRobots = home.ok ? /<meta[^>]+name="robots"[^>]+content="([^"]+)"/.exec(home.body)?.[1] : null;
  if (EXPECT_PRELAUNCH) {
    if (metaRobots && /noindex/.test(metaRobots)) {
      pass('S-SEO-06', 'pages carry noindex before launch', metaRobots);
    } else {
      fail('S-SEO-06', 'pages carry noindex before launch', metaRobots ?? 'no robots meta tag', 'The second layer after robots.txt.');
    }
  } else if (metaRobots && /noindex/.test(metaRobots)) {
    fail('S-SEO-06', 'pages are indexable after launch', `still noindex: ${metaRobots}`, 'The launch switch has not taken effect.');
  } else {
    pass('S-SEO-06', 'pages are indexable after launch', metaRobots ?? 'no override - inherits the sitewide policy');
  }
}

/* ========================================================== 6. CACHING === */

async function checkCaching() {
  section('6. CACHING');

  // A public page should be cacheable; an admin page must not be. Header shapes
  // vary by host, so this reports rather than dictates - except for /admin,
  // where no-store is not negotiable.
  const home = await get('/');
  const cache = home.ok ? (home.headers.get('cache-control') ?? '') : '';
  if (!home.ok) {
    warn('S-CACHE-01', 'the homepage declares a cache policy', 'unreachable');
  } else if (cache.includes('no-store')) {
    warn(
      'S-CACHE-01',
      'the homepage is cacheable',
      `cache-control: ${cache}`,
      'no-store on a public page disables ISR. Expect slower pages and more database load.',
    );
  } else {
    pass('S-CACHE-01', 'the homepage declares a cache policy', cache || 'none set - the host decides');
  }

  const admin = await get('/admin/login');
  const adminCache = admin.ok ? (admin.headers.get('cache-control') ?? '') : '';
  if (adminCache.includes('no-store')) {
    pass('S-CACHE-02', 'admin pages are not cacheable', adminCache);
  } else if (!admin.ok) {
    warn('S-CACHE-02', 'admin pages are not cacheable', 'unreachable');
  } else {
    fail('S-CACHE-02', 'admin pages are not cacheable', adminCache || 'no cache-control', 'A cached admin page can be served to the wrong person.');
  }
}

/* ========================================================== summary ====== */

function summarise() {
  const passed = results.filter((r) => r.status === 'PASS');
  const failed = results.filter((r) => r.status === 'FAIL');
  const warnings = results.filter((r) => r.status === 'WARN');
  const skipped = results.filter((r) => r.status === 'NOT APPLICABLE');

  console.log('');
  console.log('='.repeat(72));
  console.log(`PRODUCTION SMOKE TEST - ${BASE}`);
  console.log('='.repeat(72));
  console.log('');
  console.log(`  CHECKS RUN:     ${results.length - skipped.length}`);
  console.log(`  PASSED:         ${passed.length}`);
  console.log(`  FAILED:         ${failed.length}`);
  console.log(`  WARNINGS:       ${warnings.length}`);
  console.log(`  NOT APPLICABLE: ${skipped.length}`);
  console.log('');
  if (failed.length > 0) {
    console.log('  MUST FIX:');
    for (const f of failed) console.log(`    ${f.id}  ${f.description}`);
    console.log('');
  }
  console.log(failed.length > 0 ? '  RESULT: FAILED.' : '  RESULT: OK.');
  console.log('='.repeat(72));
  return failed.length > 0;
}

/* ============================================================= main ====== */

console.log('');
console.log('COMMERCE INSIGHT - PRODUCTION SMOKE TEST');
console.log(`target: ${BASE}`);
console.log(`mode:   ${EXPECT_PRELAUNCH ? 'expecting a PRE-LAUNCH site (noindex)' : 'expecting a LAUNCHED site (indexable)'}`);
console.log('read-only: this makes GET requests and changes nothing.');

const reachable = await checkReachable();
if (reachable) {
  await checkHeaders();
  await checkPublicRoutes();
  await checkAdminGuard();
  await checkIndexing();
  await checkCaching();
}

exit(summarise() ? 1 : 0);
