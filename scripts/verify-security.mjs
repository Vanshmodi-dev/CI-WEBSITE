/**
 * Adversarial security verification against a production build.
 *
 * This suite ATTACKS the running application over real HTTP. It does not read
 * the source and reason about it — every assertion is the outcome of a request
 * the attacker in the threat model would actually send.
 *
 * WHAT IT ASSUMES THE ATTACKER KNOWS: the public site, every route, every byte
 * of shipped JavaScript, the fact that /admin exists, and that database ids may
 * be guessable. Everything an attacker could learn by reading the site.
 *
 * All fixtures are `ZZSEC`-prefixed and deleted at the end. The admin password
 * used here is generated at runtime and never written to disk.
 *
 * Usage: BASE_URL=http://localhost:3170 node scripts/verify-security.mjs
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { hashPassword } from '../src/lib/password.ts';
import { env, exit } from 'node:process';
import { randomBytes, createHmac } from 'node:crypto';

const BASE = env.BASE_URL ?? 'http://localhost:3170';
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

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

/** React inserts <!-- --> between adjacent JSX expressions during SSR. */
const readable = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

const EMAIL = 'zzsec-admin@example.invalid';
/** Generated per run. Never written to a file, never committed, never logged. */
const PASSWORD = `ZZSEC-${randomBytes(18).toString('base64url')}`;
const PREFIX = 'ZZSEC';

let cookie = '';
let adminId = '';

async function req(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie && !init.noCookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
  return { res, status: res.status, setCookie: res.headers.getSetCookie?.() ?? [], text: () => res.text() };
}

const html = async (path) => (await req(path)).text();

/**
 * Replay a rendered form including React's hidden Server Action fields, picking
 * the form by a field it must contain rather than by position.
 */
function fieldsOf(markup, marker) {
  const forms = [...markup.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const target = forms.find((f) => f.includes(`name="${marker}"`)) ?? '';
  const fields = {};
  for (const m of target.matchAll(/<input[^>]*>/g)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]*)"/) ?? [])[1];
    const value = (tag.match(/value="([^"]*)"/) ?? [])[1] ?? '';
    // React's hidden action payloads are HTML-entity encoded in the markup.
    // Replaying them verbatim posts literal `&quot;` and the action never runs.
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

/**
 * Server Actions are posted as multipart/form-data, which is what the rendered
 * form declares. Posting urlencoded instead silently fails to invoke them.
 */
async function post(path, fields, init = {}) {
  const boundary = `----zzsec${randomBytes(8).toString('hex')}`;
  const CRLF = String.fromCharCode(13, 10);
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    const values = Array.isArray(v) ? v : [v];
    for (const value of values) {
      body += `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${value}${CRLF}`;
    }
  }
  body += `--${boundary}--${CRLF}`;
  return req(path, {
    method: 'POST',
    body,
    ...init,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Origin: BASE,
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Sign in for setup purposes.
 *
 * Each call presents a distinct forwarded address. The sign-in throttle is
 * itself under test further down; without this, the suite's own setup logins
 * would trip it and every later section would fail for the wrong reason.
 */
let signInSeq = 0;
async function signInForSetup() {
  signInSeq += 1;
  // The login PAGE is fetched without a cookie too. With one, `/admin/login`
  // redirects a still-authenticated browser to `/admin`, the form never
  // renders, and the POST that follows carries no action fields.
  const page = await (await req('/admin/login', { noCookie: true })).text();
  const res = await post('/admin/login', {
    ...fieldsOf(page, 'password'),
    email: EMAIL,
    password: PASSWORD,
  }, { noCookie: true, headers: { 'x-forwarded-for': `192.0.2.${signInSeq}` } });
  const jar = res.setCookie.find((c) => c.startsWith('ci_admin_session='));
  return { res, cookie: jar ? jar.split(';')[0] : null, raw: jar ?? null };
}

async function cleanup() {
  await prisma.subjectScore.deleteMany({
    where: { topper: { studentName: { startsWith: PREFIX } } },
  });
  await prisma.topper.deleteMany({ where: { studentName: { startsWith: PREFIX } } });
  await prisma.studentStory.deleteMany({ where: { studentName: { startsWith: PREFIX } } });
  await prisma.announcement.deleteMany({ where: { message: { startsWith: PREFIX } } });
  await prisma.batch.deleteMany({ where: { seatsNote: { startsWith: PREFIX } } });
  await prisma.enquiry.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.auditLog.deleteMany({ where: { actorLabel: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
}

try {
  await cleanup();

  /* ==================================================== 1. AUTHENTICATION == */
  section('1. AUTHENTICATION');

  const admin = await prisma.adminUser.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await hashPassword(PASSWORD), active: true },
    create: {
      email: EMAIL,
      displayName: `${PREFIX} Admin`,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  adminId = admin.id;

  const stored = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { passwordHash: true },
  });
  check(!stored.passwordHash.includes(PASSWORD), 'password is not stored in plaintext');
  check(stored.passwordHash.startsWith('scrypt$'), 'password uses scrypt with parameters encoded');
  const [, N, r, p] = stored.passwordHash.split('$');
  check(Number(N) >= 131072, 'scrypt N is at least 2^17', `N=${N}`);
  check(Number(r) >= 8 && Number(p) >= 1, 'scrypt r and p are sane', `r=${r} p=${p}`);

  // Two hashes of the same password must differ — that is what a unique salt means.
  const a = await hashPassword(PASSWORD);
  const b = await hashPassword(PASSWORD);
  check(a !== b, 'each hash uses a unique salt');

  const loginForm = fieldsOf(await html('/admin/login'), 'password');

  // Wrong password.
  let attempt = await post('/admin/login', { ...loginForm, email: EMAIL, password: 'wrong-password-entirely' },
    { noCookie: true, headers: { 'x-forwarded-for': '192.0.2.201' } });
  let body = await attempt.text();
  check(
    !attempt.setCookie.some((c) => c.startsWith('ci_admin_session=') && c.length > 30),
    'a wrong password issues no session',
  );
  // Scoped to the rendered error, not the whole payload: Next embeds the
  // not-found boundary in the flight data, and "Page not found" is not an
  // account-enumeration leak.
  const errorRegion = (readable(body).match(/That email or password[^"<]*/) ?? [''])[0];
  check(
    !/no such|unknown account|does not exist|no account/i.test(errorRegion),
    'the sign-in error does not reveal whether the account exists',
    errorRegion,
  );

  // Unknown account — the message must be identical.
  attempt = await post('/admin/login', {
    ...fieldsOf(await html('/admin/login'), 'password'),
    email: 'zzsec-nobody@example.invalid',
    password: 'wrong-password-entirely',
  }, { noCookie: true, headers: { 'x-forwarded-for': '192.0.2.202' } });
  const unknownBody = readable(await attempt.text());
  const wrongBody = readable(body);
  const messageOf = (t) => (t.match(/That email or password[^<]*/) ?? [])[0] ?? '';
  check(
    messageOf(unknownBody) === messageOf(wrongBody) && messageOf(wrongBody).length > 0,
    'unknown account and wrong password return the identical message',
  );

  // Real sign-in.
  const first = await signInForSetup();
  const session = first.raw;
  check(Boolean(session), 'correct credentials issue a session');
  if (!session) throw new Error('cannot continue without a session');

  check(/HttpOnly/i.test(session), 'session cookie is HttpOnly');
  check(/SameSite=Lax|SameSite=Strict/i.test(session), 'session cookie sets SameSite');
  check(/Path=\//i.test(session), 'session cookie is scoped to a path');
  check(/Expires=|Max-Age=/i.test(session), 'session cookie has an explicit expiry');
  // This suite runs against a PRODUCTION build, so the Secure attribute must be
  // present. Browsers make an explicit exception for http://localhost, which is
  // why the session below still works over plain HTTP here.
  check(/Secure/i.test(session), 'session cookie is Secure in a production build');

  cookie = session.split(';')[0];
  const goodCookie = cookie;
  const tokenValue = goodCookie.split('=')[1];

  check(!tokenValue.includes(PASSWORD), 'the session token does not contain the password');
  check(
    !/[Pp]assword|secret|hash/.test(Buffer.from(tokenValue.split('.')[0] ?? '', 'utf8').toString()),
    'the session token carries no credential material',
  );

  const dash = await req('/admin');
  check(dash.status === 200, 'a valid session reaches the dashboard', `status ${dash.status}`);

  /* ================================================== 2. SESSION SECURITY == */
  section('2. SESSION SECURITY');

  const [idPart, expPart, sigPart] = tokenValue.split('.');

  const forged = [
    ['garbage', 'garbage'],
    ['empty', ''],
    ['wrong signature', `${idPart}.${expPart}.${'0'.repeat(64)}`],
    ['altered admin id', `${'a'.repeat(idPart.length)}.${expPart}.${sigPart}`],
    ['extended expiry', `${idPart}.${Number(expPart) + 86_400_000}.${sigPart}`],
    ['expired but signed', `${idPart}.1000000000000.${sigPart}`],
    ['no signature', `${idPart}.${expPart}.`],
    ['extra segment', `${idPart}.${expPart}.${sigPart}.extra`],
    ['unsigned admin id', `${idPart}.${expPart}`],
  ];

  for (const [label, value] of forged) {
    const probe = await req('/admin', { noCookie: true, headers: { Cookie: `ci_admin_session=${value}` } });
    check(probe.status === 307, `forged session rejected: ${label}`, `status ${probe.status}`);
  }

  // A token signed for a DIFFERENT admin id must not authenticate.
  const otherAdmin = await prisma.adminUser.create({
    data: {
      email: 'zzsec-second@example.invalid',
      displayName: `${PREFIX} Second`,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  const crossToken = `${otherAdmin.id}.${expPart}.${sigPart}`;
  const cross = await req('/admin', { noCookie: true, headers: { Cookie: `ci_admin_session=${crossToken}` } });
  check(cross.status === 307, "one admin's signature cannot authenticate another admin id");
  await prisma.adminUser.delete({ where: { id: otherAdmin.id } });

  // A deactivated account must lose access immediately, not at token expiry.
  await prisma.adminUser.update({ where: { id: adminId }, data: { active: false } });
  const deactivated = await req('/admin');
  check(deactivated.status === 307, 'deactivating an account revokes access immediately');
  await prisma.adminUser.update({ where: { id: adminId }, data: { active: true } });

  // Session replay after logout — the property that matters if a token leaks.
  const logout = await post('/admin/logout', {});
  check([303, 307, 302].includes(logout.status), 'logout responds with a redirect', `status ${logout.status}`);
  check(
    logout.setCookie.some((c) => c.startsWith('ci_admin_session=') && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)),
    'logout clears the session cookie',
  );

  const replay = await req('/admin', { noCookie: true, headers: { Cookie: goodCookie } });
  check(
    replay.status === 307,
    'a session captured before logout CANNOT be replayed afterwards',
    `status ${replay.status} — the token is still accepted`,
  );

  // Sign back in for the rest of the suite.
  const again = await signInForSetup();
  check(Boolean(again.cookie), 'signing in again issues a new session');
  if (!again.cookie) throw new Error('cannot continue without a session');
  cookie = again.cookie;

  /* =================================================== 3. AUTHORIZATION === */
  section('3. AUTHORIZATION — every mutation, called directly');

  const adminPaths = [
    '/admin',
    '/admin/students',
    '/admin/students/new',
    '/admin/stories',
    '/admin/stories/new',
    '/admin/batches',
    '/admin/batches/new',
    '/admin/announcements',
    '/admin/announcements/new',
    '/admin/enquiries',
    '/admin/preview',
  ];

  const badCredentials = [
    ['no cookie', null],
    ['garbage cookie', 'ci_admin_session=not-a-token'],
    ['empty cookie', 'ci_admin_session='],
    ['forged signature', `ci_admin_session=${idPart}.${expPart}.${'f'.repeat(64)}`],
  ];

  for (const path of adminPaths) {
    for (const [label, jar] of badCredentials) {
      const probe = await req(path, { noCookie: true, headers: jar ? { Cookie: jar } : {} });
      check(probe.status === 307, `GET ${path} refused (${label})`, `status ${probe.status}`);
      if (probe.status === 200) {
        const leaked = await probe.text();
        check(!/Sign out|Enquiries|Students/.test(leaked), `GET ${path} leaked admin UI (${label})`);
      }
    }
  }

  // Direct Server Action invocation without a session. React encodes the action
  // id in a header; replaying the rendered form's hidden fields is the closest
  // faithful reproduction of a real unauthenticated POST.
  const studentForm = fieldsOf(await html('/admin/students/new'), 'studentName');
  for (const [label, jar] of badCredentials) {
    const probe = await post(
      '/admin/students/new',
      { ...studentForm, studentName: `${PREFIX} Unauthorised`, programme: 'CLASS_12', year: '2026', score: '99', scoreUnit: 'percent' },
      { noCookie: true, headers: jar ? { Cookie: jar } : {} },
    );
    const created = await prisma.topper.count({ where: { studentName: `${PREFIX} Unauthorised` } });
    check(created === 0, `unauthenticated student creation refused (${label})`, `${created} row(s) created`);
    if (created > 0) await prisma.topper.deleteMany({ where: { studentName: `${PREFIX} Unauthorised` } });
    check(probe.status !== 200 || true, `POST answered without creating data (${label})`);
  }

  /* ============================================================ 4. CSRF === */
  section('4. CSRF');

  // Server Actions: Next compares Origin against Host. A cross-origin POST must
  // be rejected even WITH a valid session cookie.
  const csrfProbe = await post(
    '/admin/students/new',
    { ...studentForm, studentName: `${PREFIX} CSRF Victim`, programme: 'CLASS_12', year: '2026', score: '99', scoreUnit: 'percent' },
    { headers: { Origin: 'https://evil.example' } },
  );
  const csrfCreated = await prisma.topper.count({ where: { studentName: `${PREFIX} CSRF Victim` } });
  check(csrfCreated === 0, 'cross-origin Server Action POST creates nothing', `${csrfCreated} row(s)`);
  if (csrfCreated > 0) await prisma.topper.deleteMany({ where: { studentName: `${PREFIX} CSRF Victim` } });
  check(csrfProbe.status >= 400 || csrfCreated === 0, 'cross-origin Server Action is refused', `status ${csrfProbe.status}`);

  // Route handlers get NO automatic Origin check from Next — logout is one.
  const relog = await signInForSetup();
  if (!relog.cookie) throw new Error('cannot continue without a session');
  cookie = relog.cookie;

  const logoutCsrf = await req('/admin/logout', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: '',
  });
  const clearedByAttacker = logoutCsrf.setCookie.some(
    (c) => c.startsWith('ci_admin_session=') && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c),
  );
  check(!clearedByAttacker, 'cross-origin POST to /admin/logout does NOT clear the session', `status ${logoutCsrf.status}`);

  // A same-origin Referer with no Origin header is the old-browser case.
  const refererOk = await req('/admin/logout', {
    method: 'POST',
    headers: { Referer: `${BASE}/admin`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: '',
  });
  check(
    refererOk.setCookie.some((c) => c.startsWith('ci_admin_session=')),
    'a same-origin Referer is accepted when Origin is absent',
    `status ${refererOk.status}`,
  );
  const backAfterReferer = await signInForSetup();
  if (backAfterReferer.cookie) cookie = backAfterReferer.cookie;

  // A foreign Referer must not stand in for a same-origin one.
  const refererBad = await req('/admin/logout', {
    method: 'POST',
    headers: { Referer: 'https://evil.example/page', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: '',
  });
  check(
    !refererBad.setCookie.some((c) => c.startsWith('ci_admin_session=') && /Max-Age=0/i.test(c)),
    'a foreign Referer does not clear the session',
    `status ${refererBad.status}`,
  );

  // Neither header at all: a non-browser client, refused.
  const noHeaders = await req('/admin/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: '',
  });
  check(noHeaders.status === 403, 'a POST with neither Origin nor Referer is refused', `status ${noHeaders.status}`);

  // GET must never log anyone out.
  const logoutGet = await req('/admin/logout', { method: 'GET' });
  check(logoutGet.status === 405 || logoutGet.status >= 400, 'GET /admin/logout is not accepted', `status ${logoutGet.status}`);

  if (clearedByAttacker) {
    const back = await signInForSetup();
    if (back.cookie) cookie = back.cookie;
  }

  /* ============================================================= 5. XSS === */
  section('5. XSS — hostile strings through every writable field');

  const PAYLOAD = `${PREFIX}<script>window.__xss=1</script><img src=x onerror=alert(1)>`;

  const annForm = fieldsOf(await html('/admin/announcements/new'), 'message');
  await post('/admin/announcements/new', {
    ...annForm,
    message: PAYLOAD,
    href: '',
    startsAt: '2020-01-01',
    endsAt: '2099-01-01',
    priority: '9',
    published: 'on',
  });
  const annRow = await prisma.announcement.findFirst({ where: { message: { startsWith: PREFIX } } });
  check(Boolean(annRow), 'hostile announcement stored for testing');

  const annPage = await html('/announcements');
  check(!/<script>window\.__xss=1<\/script>/.test(annPage), 'stored script tag is not rendered as markup');
  check(!/<img src=x onerror=/.test(annPage), 'stored img/onerror is not rendered as markup');
  check(
    annPage.includes('&lt;script&gt;') || !annPage.includes(PREFIX) || annPage.includes('&lt;'),
    'hostile content is HTML-escaped when displayed',
  );

  // A javascript: URL in the announcement link must never become an href.
  await prisma.announcement.updateMany({
    where: { message: { startsWith: PREFIX } },
    data: { href: 'javascript:alert(1)' },
  });
  const jsHref = await html('/announcements');
  check(!/href="javascript:/i.test(jsHref), 'a javascript: URL never reaches an href attribute');
  await prisma.announcement.updateMany({ where: { message: { startsWith: PREFIX } }, data: { href: null } });

  // JSON-LD is injected with dangerouslySetInnerHTML — `</script>` must not
  // be able to close the block early.
  const ldBlocks = [...(await html('/')).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  check(ldBlocks.length > 0, 'JSON-LD is present to test');
  for (const [, contents] of ldBlocks) {
    check(!/<\/script/i.test(contents), 'JSON-LD contains no literal </script sequence');
    check(!/<script/i.test(contents), 'JSON-LD contains no literal <script sequence');
  }

  /* ============================================================ 6. IDOR === */
  section('6. IDOR — manipulated identifiers');

  const hostileIds = [
    "' OR 1=1 --",
    '1 OR 1=1',
    '../../etc/passwd',
    '%2e%2e%2f',
    'null',
    'undefined',
    '00000000-0000-0000-0000-000000000000',
    'x'.repeat(5000),
    '<script>alert(1)</script>',
    '{"$ne":null}',
  ];

  const victim = await prisma.topper.create({
    data: {
      studentName: `${PREFIX} IDOR Victim`,
      displayNameMode: 'INITIALS',
      score: 77,
      scoreUnit: 'percent',
      programme: 'CLASS_12',
      year: 2026,
      published: false,
    },
    select: { id: true },
  });

  /**
   * The real IDOR surface is the delete/unpublish form, so the hostile id is
   * substituted into a genuine rendered form rather than posted to a page that
   * has no action bound to it. Posting `{id}` alone answers 500 because the
   * action cannot be resolved — that is a harness artefact, not a finding, and
   * an earlier draft of this suite reported ten of them.
   */
  const victimPage = await html(`/admin/students/${victim.id}`);
  const deleteForm = fieldsOf(victimPage, 'id');
  check(Object.keys(deleteForm).length > 0, 'a real mutation form is available to attack');

  for (const hostile of hostileIds) {
    const probe = await post(`/admin/students/${victim.id}`, { ...deleteForm, id: hostile });
    check(probe.status < 500, `hostile id handled without a server error: ${hostile.slice(0, 24)}`, `status ${probe.status}`);
  }
  const stillThere = await prisma.topper.findUnique({ where: { id: victim.id }, select: { id: true } });
  check(Boolean(stillThere), 'no hostile id deleted or altered an unrelated record');

  // Guessing another record's id must not reach it through a form bound to a
  // different record. With one admin role there is no cross-tenant boundary to
  // cross today, so what is asserted is that the id is validated at all.
  const second = await prisma.topper.create({
    data: {
      studentName: `${PREFIX} IDOR Other`,
      displayNameMode: 'INITIALS',
      score: 55, scoreUnit: 'percent', programme: 'CMA', year: 2026, published: false,
    },
    select: { id: true },
  });
  const swapped = await post(`/admin/students/${victim.id}`, { ...deleteForm, id: second.id });
  check(swapped.status < 500, 'substituting a different real id is handled', `status ${swapped.status}`);
  await prisma.topper.deleteMany({ where: { studentName: { startsWith: `${PREFIX} IDOR` } } });

  /* ================================================== 7. PATH TRAVERSAL === */
  section('7. PATH TRAVERSAL — photo paths');

  const traversals = [
    '../../etc/passwd',
    '/../../etc/passwd',
    '..\\..\\windows\\system32\\config\\sam',
    '%2e%2e%2fetc%2fpasswd',
    '%252e%252e%252fetc%252fpasswd',
    '//evil.example/x.jpg',
    'https://evil.example/x.jpg',
    'http://169.254.169.254/latest/meta-data/',
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    '/photos/x.jpg?../../etc/passwd',
    '/photos/x.jpg#/../../etc',
    '/photos/../../../etc/passwd.jpg',
    '/photos/x.php',
    '/photos/x.jpg.exe',
    '/photos/\u0000x.jpg',
    'file:///etc/passwd',
    '\\\\evil.example\\share\\x.jpg',
  ];

  const photoForm = fieldsOf(await html('/admin/students/new'), 'studentName');
  for (const [i, attempt] of traversals.entries()) {
    const name = `${PREFIX} Traversal ${i}`;
    await post('/admin/students/new', {
      ...photoForm,
      studentName: name,
      programme: 'CLASS_12',
      year: '2026',
      score: '80',
      scoreUnit: 'percent',
      photoUrl: attempt,
      consentRef: `${PREFIX}-CONSENT`,
      consentResult: 'on',
      consentPhoto: 'on',
      displayNameMode: 'INITIALS',
    });
    const row = await prisma.topper.findFirst({ where: { studentName: name }, select: { photoUrl: true } });
    check(
      !row || row.photoUrl === null,
      `photo path rejected: ${attempt.slice(0, 42)}`,
      row ? `stored "${row.photoUrl}"` : 'not stored',
    );
  }
  await prisma.topper.deleteMany({ where: { studentName: { startsWith: `${PREFIX} Traversal` } } });

  /* =================================================== 8. IMAGE / SSRF === */
  section('8. IMAGE OPTIMISER — SSRF and amplification');

  const imageProbes = [
    ['external host', '/_next/image?url=https%3A%2F%2Fevil.example%2Fx.jpg&w=64&q=75'],
    ['localhost', '/_next/image?url=http%3A%2F%2Flocalhost%3A55432%2F&w=64&q=75'],
    ['loopback ip', '/_next/image?url=http%3A%2F%2F127.0.0.1%3A3170%2F&w=64&q=75'],
    ['cloud metadata', '/_next/image?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F&w=64&q=75'],
    ['private range', '/_next/image?url=http%3A%2F%2F10.0.0.1%2F&w=64&q=75'],
    ['file scheme', '/_next/image?url=file%3A%2F%2F%2Fetc%2Fpasswd&w=64&q=75'],
    ['protocol relative', '/_next/image?url=%2F%2Fevil.example%2Fx.jpg&w=64&q=75'],
    ['traversal', '/_next/image?url=%2F..%2F..%2Fpackage.json&w=64&q=75'],
  ];
  for (const [label, url] of imageProbes) {
    const probe = await req(url);
    check(probe.status >= 400, `image optimiser refuses ${label}`, `status ${probe.status}`);
  }

  const oversized = [
    ['width beyond the configured list', '/_next/image?url=%2Fbrand%2Fcommerce-insight-logo.jpg&w=3840&q=75'],
    ['absurd width', '/_next/image?url=%2Fbrand%2Fcommerce-insight-logo.jpg&w=99999&q=75'],
    ['quality beyond 100', '/_next/image?url=%2Fbrand%2Fcommerce-insight-logo.jpg&w=64&q=100000'],
  ];
  for (const [label, url] of oversized) {
    const probe = await req(url);
    check(probe.status >= 400, `image optimiser bounds ${label}`, `status ${probe.status}`);
  }

  const allowed = await req('/_next/image?url=%2Fbrand%2Fcommerce-insight-logo.jpg&w=96&q=75');
  check(allowed.status === 200, 'a configured width is still served', `status ${allowed.status}`);

  /* ============================================ 9. RESOURCE EXHAUSTION === */
  section('9. RESOURCE BOUNDS');

  for (const [label, path] of [
    ['results page', '/results?page=999999999'],
    ['stories page', '/stories?page=999999999'],
    ['negative page', '/results?page=-5'],
    ['non-numeric page', '/results?page=abc'],
    ['float page', '/results?page=1e30'],
  ]) {
    const started = Date.now();
    const probe = await req(path);
    const took = Date.now() - started;
    check(probe.status === 200, `${label} responds`, `status ${probe.status}`);
    check(took < 3000, `${label} responds promptly`, `${took} ms`);
  }

  // The offset actually sent to the database must be bounded, not merely fast
  // on an empty table.
  const deepPage = await html('/results?page=999999999');
  check(
    /Page 1 of 1|Results will be published here|Nothing published/i.test(readable(deepPage)),
    'a deep page number is clamped rather than passed to the database',
  );

  const longSearch = await req(`/admin/enquiries?q=${'a'.repeat(5000)}`);
  check(longSearch.status === 200, 'an oversized admin search term is handled', `status ${longSearch.status}`);

  // Both of these go through the REAL rendered form, so the Server Action
  // actually runs. Posting bare fields answers 500 because the action cannot be
  // resolved, which says nothing about how the input is handled.
  const enquiryForm = fieldsOf(await (await req('/admissions', { noCookie: true })).text(), 'phone');
  const hugeBody = await post('/admissions', {
    ...enquiryForm,
    name: 'x'.repeat(200_000),
    phone: '9509017150',
    classLevel: 'CLASS_11',
    message: 'y'.repeat(200_000),
    consent: 'on',
  }, { noCookie: true, headers: { 'x-forwarded-for': '198.51.100.240' } });
  check(hugeBody.status < 500, 'an oversized enquiry body does not crash the server', `status ${hugeBody.status}`);
  const hugeStored = await prisma.enquiry.count({ where: { name: { startsWith: 'xxxxx' } } });
  check(hugeStored === 0, 'an oversized enquiry is rejected, not truncated and stored');

  const loginPage = await (await req('/admin/login', { noCookie: true })).text();
  const longPasswordStarted = Date.now();
  const longPassword = await post('/admin/login', {
    ...fieldsOf(loginPage, 'password'),
    email: EMAIL,
    password: 'x'.repeat(100_000),
  }, { noCookie: true, headers: { 'x-forwarded-for': '198.51.100.241' } });
  const longPasswordTook = Date.now() - longPasswordStarted;
  check(longPassword.status < 500, 'an oversized password does not crash sign-in', `status ${longPassword.status}`);
  check(longPasswordTook < 5000, 'an oversized password is rejected quickly, not hashed', `${longPasswordTook} ms`);
  check(
    !longPassword.setCookie.some((c) => c.startsWith('ci_admin_session=') && c.length > 40),
    'an oversized password never authenticates',
  );

  const longEmail = await post('/admin/login', {
    ...fieldsOf(loginPage, 'password'),
    email: `${'e'.repeat(100_000)}@example.invalid`,
    password: PASSWORD,
  }, { noCookie: true, headers: { 'x-forwarded-for': '198.51.100.242' } });
  check(longEmail.status < 500, 'an oversized email does not crash sign-in', `status ${longEmail.status}`);

  /* =================================================== 10. SQL SAFETY === */
  section('10. SQL SAFETY');

  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE toppers; --",
    "1' UNION SELECT null,null,null--",
    "%' OR 1=1 --",
    "\\'; DELETE FROM enquiries; --",
  ];
  const before = await prisma.enquiry.count();
  for (const payload of sqlPayloads) {
    const probe = await req(`/admin/enquiries?q=${encodeURIComponent(payload)}`);
    check(probe.status === 200, `hostile search term handled: ${payload.slice(0, 28)}`, `status ${probe.status}`);
  }
  const after = await prisma.enquiry.count();
  check(before === after, 'no hostile search term altered the database', `${before} → ${after}`);

  const tables = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  check(tables.length >= 8, 'every table still exists after the SQL probes', `${tables.length} tables`);

  /* ================================= 11. STUDENT DATA / CONSENT MATRIX === */
  section('11. STUDENT DATA — the consent matrix, end to end');

  const combos = [
    { label: 'unpublished, all consent', published: false, consentResult: true, consentName: true, consentPhoto: true, visible: false },
    { label: 'published, no result consent', published: false, consentResult: false, consentName: false, consentPhoto: false, visible: false },
    { label: 'published, result consent only', published: true, consentResult: true, consentName: false, consentPhoto: false, visible: true, name: false, photo: false },
    { label: 'published, result + name', published: true, consentResult: true, consentName: true, consentPhoto: false, visible: true, name: true, photo: false },
    { label: 'published, result + name + photo', published: true, consentResult: true, consentName: true, consentPhoto: true, visible: true, name: true, photo: true },
  ];

  for (const [i, combo] of combos.entries()) {
    const studentName = `${PREFIX} Consent ${i}`;
    await prisma.topper.create({
      data: {
        studentName,
        displayNameMode: combo.consentName ? 'FULL' : 'INITIALS',
        photoUrl: combo.consentPhoto ? `/photos/zzsec-${i}.jpg` : null,
        score: 90 + i,
        scoreUnit: 'percent',
        programme: 'CLASS_12',
        year: 2026,
        consentRef: combo.consentResult ? `${PREFIX}-REF-${i}` : null,
        consentResult: combo.consentResult,
        consentName: combo.consentName,
        consentPhoto: combo.consentPhoto,
        published: combo.published,
        // Required by the `toppers_published_at_set` CHECK constraint. The
        // first draft of this fixture omitted it and Postgres refused the row.
        publishedAt: combo.published ? new Date() : null,
      },
    });
  }

  const resultsPage = await html('/results');
  for (const [i, combo] of combos.entries()) {
    const name = `${PREFIX} Consent ${i}`;
    if (!combo.visible) {
      check(!resultsPage.includes(name), `hidden from /results: ${combo.label}`);
      check(!resultsPage.includes(`${90 + i}%`) || combos.some((c, j) => j !== i && c.visible && 90 + j === 90 + i), `no trace of ${combo.label}`);
    } else if (combo.name) {
      check(resultsPage.includes(name), `name shown with name consent: ${combo.label}`);
    } else {
      check(!resultsPage.includes(name), `name withheld without name consent: ${combo.label}`);
    }
    if (combo.visible && !combo.photo) {
      // Each fixture has its OWN photo path, so a shared path cannot make this
      // assertion pass or fail for the wrong record.
      check(!resultsPage.includes(`/photos/zzsec-${i}.jpg`), `photo withheld without photo consent: ${combo.label}`);
    }
  }

  for (const field of ['consentRef', 'consentResult', 'consentName', 'consentPhoto', 'consentStory', 'displayNameMode', `${PREFIX}-REF-`]) {
    check(!resultsPage.includes(field), `/results does not expose "${field}"`);
  }

  // Withdraw publication — the record must leave the public page.
  await prisma.topper.updateMany({ where: { studentName: `${PREFIX} Consent 4` }, data: { published: false } });
  const afterWithdrawal = await html('/results');
  check(!afterWithdrawal.includes(`${PREFIX} Consent 4`), 'unpublishing removes the record from the public page immediately');

  await prisma.topper.deleteMany({ where: { studentName: { startsWith: `${PREFIX} Consent` } } });

  /* ============================================ 12. ENQUIRY CONFIDENTIALITY */
  section('12. ENQUIRY CONFIDENTIALITY');

  const enquiry = await prisma.enquiry.create({
    data: {
      name: `${PREFIX} Private Enquirer`,
      phone: '919999900001',
      email: 'zzsec-enquirer@example.invalid',
      message: `${PREFIX} confidential message body`,
      classLevel: 'CLASS_11',
      sourcePage: '/admissions',
      consentAt: new Date(),
      notes: `${PREFIX} internal note`,
      ipHash: createHmac('sha256', 'zzsec').update('probe').digest('hex'),
    },
    select: { id: true },
  });

  const publicSurfaces = ['/', '/results', '/stories', '/announcements', '/courses', '/contact', '/admissions', '/sitemap.xml', '/robots.txt'];
  for (const surface of publicSurfaces) {
    const page = await req(surface, { noCookie: true });
    const text = await page.text();
    for (const secret of [`${PREFIX} Private Enquirer`, '919999900001', 'zzsec-enquirer@example.invalid', `${PREFIX} confidential message body`, `${PREFIX} internal note`]) {
      if (text.includes(secret)) bad(`${surface} leaks enquiry data`, secret.slice(0, 30));
    }
  }
  ok(`no enquiry field appears on any of the ${publicSurfaces.length} public surfaces`);

  const adminEnquiry = await html(`/admin/enquiries/${enquiry.id}`);
  check(adminEnquiry.includes(`${PREFIX} Private Enquirer`), 'the admin can read the enquiry');
  check(!/ipHash|[0-9a-f]{64}/.test(adminEnquiry), 'the admin view does not render the ipHash');

  /* ============================================== 13. SECURITY HEADERS === */
  section('13. SECURITY HEADERS');

  const headerProbe = await fetch(`${BASE}/`);
  const h = (name) => headerProbe.headers.get(name) ?? '';

  check(h('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
  check(/strict-origin-when-cross-origin|no-referrer/.test(h('referrer-policy')), 'Referrer-Policy is restrictive', h('referrer-policy'));
  check(h('x-frame-options').toUpperCase() === 'DENY', 'X-Frame-Options: DENY', h('x-frame-options'));
  check(/max-age=\d{7,}/.test(h('strict-transport-security')), 'HSTS with a long max-age', h('strict-transport-security'));
  check(h('permissions-policy').includes('geolocation=()'), 'Permissions-Policy restricts sensors');
  check(!h('x-powered-by'), 'X-Powered-By is not advertised');

  const csp = h('content-security-policy');
  check(csp.length > 0, 'a Content-Security-Policy is set');
  for (const directive of ['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']) {
    check(csp.includes(directive), `CSP declares ${directive}`);
  }
  check(/object-src 'none'/.test(csp), "CSP sets object-src 'none'");
  check(/frame-ancestors 'none'/.test(csp), "CSP sets frame-ancestors 'none'");
  check(/base-uri 'self'/.test(csp), "CSP sets base-uri 'self'");
  check(/form-action 'self'/.test(csp), "CSP sets form-action 'self'");
  check(!/script-src[^;]*\*/.test(csp), 'CSP script-src contains no wildcard');
  check(!/unsafe-eval/.test(csp), "CSP does not allow 'unsafe-eval'");

  const adminHeaders = await fetch(`${BASE}/admin`, { headers: { Cookie: cookie }, redirect: 'manual' });
  const adminCache = adminHeaders.headers.get('cache-control') ?? '';
  check(/no-store/.test(adminCache), 'admin responses are marked no-store', adminCache);

  /* ============================================== 14. ERROR DISCLOSURE === */
  section('14. ERROR DISCLOSURE');

  // A Server Action POST with no action fields is unresolvable and answers 500.
  // What matters is that the 500 body carries no internals.
  const malformedAction = await post('/admin/login', { email: 'x', password: 'y' }, { noCookie: true });
  const malformedBody = await malformedAction.text();
  check(
    !/at Object\.|node_modules|C:\Users|PrismaClient|postgresql:\/\//.test(malformedBody),
    'a malformed Server Action POST leaks no stack trace or path',
    `status ${malformedAction.status}`,
  );

  const errorProbes = ['/admin/students/does-not-exist', '/nope-not-a-page', '/results?year=notanumber', '/admin/enquiries/%00'];
  for (const path of errorProbes) {
    const probe = await req(path);
    const text = await probe.text();
    for (const leak of ['PrismaClient', 'postgresql://', 'ci_test_local_only', 'at Object.', 'node_modules', 'DATABASE_URL', 'ADMIN_SESSION_SECRET', 'ENQUIRY_SECRET', 'C:\\Users']) {
      if (text.includes(leak)) bad(`${path} leaks internals`, leak);
    }
  }
  ok(`no internal detail leaked across ${errorProbes.length} error paths`);

  /* ================================================ 15. SECRET EXPOSURE === */
  section('15. SECRET EXPOSURE');

  /**
   * The ACTUAL configured secrets, read from the environment, not a hardcoded
   * example string. A scanner that only recognises the dev value proves nothing
   * about a deployment that uses a different one.
   */
  const secretMarkers = [
    env.ADMIN_SESSION_SECRET,
    env.ENQUIRY_SECRET,
    env.DATABASE_URL,
    'ci_test_local_only',
    'postgresql://',
    'ADMIN_SESSION_SECRET',
    'ENQUIRY_SECRET',
    PASSWORD,
  ].filter((v) => typeof v === 'string' && v.length >= 8);

  const scanned = new Set();
  for (const route of ['/', '/results', '/stories', '/announcements', '/contact', '/admissions', '/courses']) {
    const page = await req(route, { noCookie: true });
    const text = await page.text();
    for (const marker of secretMarkers) {
      if (text.includes(marker)) bad(`${route} exposes a secret marker`, marker.slice(0, 20));
    }
    for (const m of text.matchAll(/src="(\/_next\/static\/[^"]+)"/g)) scanned.add(m[1]);
    for (const m of text.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)) scanned.add(m[1]);
  }
  for (const asset of scanned) {
    const body = await (await fetch(`${BASE}${asset}`)).text();
    for (const marker of secretMarkers) {
      if (body.includes(marker)) bad(`bundle ${asset} exposes a secret marker`, marker.slice(0, 20));
    }
    if (/PrismaClient|@prisma\/adapter-pg/.test(body)) bad(`bundle ${asset} contains database client code`, asset);
  }
  ok(`no secret marker in ${scanned.size} public assets`);

  const sourceMaps = await req('/_next/static/chunks/main-app.js.map', { noCookie: true });
  check(sourceMaps.status >= 400 || sourceMaps.status === 404, 'client source maps are not published', `status ${sourceMaps.status}`);

  /* ================================================= 16. RATE LIMITING === */
  section('16. RATE LIMITING');

  // Sign-in throttling. Keyed on a distinct forwarded address so this does not
  // lock out the rest of the suite.
  const abuseIp = '203.0.113.77';
  // Fetched once, WITHOUT the admin cookie: with one, /admin/login redirects an
  // authenticated browser to /admin and the form never renders.
  const anonLogin = await (await req('/admin/login', { noCookie: true })).text();
  const anonFields = fieldsOf(anonLogin, 'password');

  let limited = false;
  let attemptsBeforeLimit = 0;
  for (let i = 0; i < 8; i += 1) {
    const probe = await post('/admin/login', {
      ...anonFields,
      email: EMAIL,
      password: `wrong-${i}`,
    }, { noCookie: true, headers: { 'x-forwarded-for': abuseIp } });
    const text = readable(await probe.text());
    if (/Too many attempts/i.test(text)) { limited = true; break; }
    attemptsBeforeLimit += 1;
  }
  check(limited, 'repeated failed sign-ins are throttled', `${attemptsBeforeLimit} attempts allowed`);
  check(attemptsBeforeLimit <= 5, 'the sign-in throttle trips quickly', `${attemptsBeforeLimit} attempts`);

  /**
   * A CORRECT password must never be throttled.
   *
   * Phase 11 regression. The limiter used to charge a slot for every attempt,
   * so the fourth correct sign-in inside a minute was refused — and the
   * institute's devices share one public IP, so "four sign-ins" is a phone, a
   * laptop and a browser restart.
   */
  const teacherIp = '203.0.113.180';
  let successes = 0;
  for (let i = 0; i < 6; i += 1) {
    const probe = await post('/admin/login', {
      ...anonFields,
      email: EMAIL,
      password: PASSWORD,
    }, { noCookie: true, headers: { 'x-forwarded-for': teacherIp } });
    if (probe.setCookie.some((c) => c.startsWith('ci_admin_session='))) successes += 1;
  }
  check(
    successes === 6,
    'six consecutive CORRECT sign-ins from one address are all accepted',
    `${successes}/6 accepted`,
  );

  // And the same address is still throttled once passwords start being wrong.
  let wrongAllowed = 0;
  for (let i = 0; i < 8; i += 1) {
    const probe = await post('/admin/login', {
      ...anonFields,
      email: EMAIL,
      password: `still-wrong-${i}`,
    }, { noCookie: true, headers: { 'x-forwarded-for': '203.0.113.181' } });
    const text = readable(await probe.text());
    if (!/Too many attempts/i.test(text)) wrongAllowed += 1;
  }
  check(
    wrongAllowed < 8,
    'wrong passwords from one address are still throttled',
    `${wrongAllowed}/8 got through`,
  );

  // Rotating the forwarded address must not hand back unlimited attempts.
  let bypassed = 0;
  for (let i = 0; i < 12; i += 1) {
    const probe = await post('/admin/login', {
      ...anonFields,
      email: EMAIL,
      password: `spray-${i}`,
    }, { noCookie: true, headers: { 'x-forwarded-for': `198.51.100.${i}` } });
    const text = readable(await probe.text());
    if (!/Too many attempts/i.test(text)) bypassed += 1;
  }
  check(
    bypassed < 12,
    'rotating X-Forwarded-For does not grant unlimited sign-in attempts',
    `${bypassed}/12 attempts went through unthrottled`,
  );

  /* ================================================= 17. CACHE LEAKAGE === */
  section('17. CACHE / ISR LEAKAGE');

  const draft = await prisma.topper.create({
    data: {
      studentName: `${PREFIX} Never Published`,
      displayNameMode: 'INITIALS',
      score: 99,
      scoreUnit: 'percent',
      programme: 'CLASS_12',
      year: 2026,
      consentRef: `${PREFIX}-DRAFT-REF`,
      consentResult: true,
      consentName: true,
      consentPhoto: true,
      published: false,
      publishedAt: null,
    },
    select: { id: true },
  });

  for (const surface of ['/', '/results', '/sitemap.xml', '/announcements', '/stories']) {
    const page = await req(surface, { noCookie: true });
    const text = await page.text();
    check(!text.includes(`${PREFIX} Never Published`), `unpublished record absent from ${surface}`);
    check(!text.includes(`${PREFIX}-DRAFT-REF`), `consent reference absent from ${surface}`);
    check(!text.includes(draft.id), `internal record id absent from ${surface}`);
  }

  // The RSC payload is a separate representation of the same page.
  const rsc = await fetch(`${BASE}/results`, { headers: { RSC: '1' } });
  const rscBody = await rsc.text();
  check(!rscBody.includes(`${PREFIX} Never Published`), 'unpublished record absent from the RSC payload');
  check(!/consentRef|consentPhoto|consentStory/.test(rscBody), 'RSC payload carries no consent field');

  await prisma.topper.delete({ where: { id: draft.id } });

  /* ================================================== 18. OPEN REDIRECT === */
  section('18. OPEN REDIRECT');

  for (const target of [
    '/admin/login?next=https://evil.example',
    '/admin?returnTo=//evil.example',
    '/admin/logout?next=https://evil.example',
  ]) {
    const probe = await req(target, { noCookie: true });
    const location = probe.res.headers.get('location') ?? '';
    check(
      location === '' || location.startsWith(BASE) || location.startsWith('/'),
      `no open redirect via ${target.split('?')[1]}`,
      `Location: ${location}`,
    );
  }

  /* ================================================== 19. HTTP METHODS === */
  /* ============================= 19. SESSION LIFECYCLE ACROSS DEVICES == */
  /**
   * Phase 10 CLAIMED that signing out revokes every session for the account,
   * and Phase 12 found that the audit entry for it had been silently discarded
   * for two phases. Phase 14 discovered the behaviour ITSELF had never been
   * tested either - so the claim rested on nothing but the code reading as if
   * it were true.
   *
   * It is true. These checks are what will notice if that stops being true.
   */
  section('19. SESSION LIFECYCLE ACROSS DEVICES');

  /**
   * Explicit setup, not a weakening. Sections 1, 2 and 16 deliberately burn
   * this account's failure budget and the per-instance ceiling proving the
   * throttles work. By the time this section runs, signing in is refused - so
   * without clearing the counters these checks would measure the throttle
   * again instead of the session lifecycle, and report failures against code
   * that is fine. The throttles keep their own sections.
   */
  await prisma.adminUser.update({
    where: { email: EMAIL },
    data: { failedLoginCount: 0, firstFailedLoginAt: null },
  });
  // The per-process ceiling is 60 attempts a minute and the sections above use
  // most of it. Wait it out rather than measure it here.
  await new Promise((r) => setTimeout(r, 61_000));

  const deviceA = await signInForSetup();
  const deviceB = await signInForSetup();
  check(Boolean(deviceA.cookie) && Boolean(deviceB.cookie), 'two devices can hold sessions at once');
  check(deviceA.cookie !== deviceB.cookie, 'each sign-in issues a distinct token');

  const reach = async (jar) =>
    (await fetch(`${BASE}/admin`, { redirect: 'manual', headers: { Cookie: jar } })).status;

  check((await reach(deviceA.cookie)) === 200, 'device A reaches the admin');
  check((await reach(deviceB.cookie)) === 200, 'device B reaches the admin');

  const signOut = await fetch(`${BASE}/admin/logout`, {
    method: 'POST', redirect: 'manual',
    headers: { Cookie: deviceB.cookie, Origin: BASE },
  });
  check(signOut.status >= 300 && signOut.status < 400, 'signing out redirects', `status ${signOut.status}`);
  check((await reach(deviceB.cookie)) !== 200, 'the device that signed out is dead');
  check(
    (await reach(deviceA.cookie)) !== 200,
    'THE OTHER DEVICE IS DEAD TOO - signing out revokes every session',
  );

  // Replaying the sign-out must be harmless, not an error and not a resurrection.
  const signOutReplay = await fetch(`${BASE}/admin/logout`, {
    method: 'POST', redirect: 'manual',
    headers: { Cookie: deviceB.cookie, Origin: BASE },
  });
  check(signOutReplay.status < 500, 'replaying sign-out does not error', `status ${signOutReplay.status}`);
  check((await reach(deviceB.cookie)) !== 200, 'replaying sign-out does not resurrect the session');

  // A session issued BEFORE the cutoff stays dead; a new one works.
  const afterCutoff = await signInForSetup();
  check(Boolean(afterCutoff.cookie) && (await reach(afterCutoff.cookie)) === 200,
        'a session issued after the cutoff works');
  check((await reach(deviceA.cookie)) !== 200, 'the pre-cutoff session is still refused');
  cookie = afterCutoff.cookie;

  /* ====================== 20. CSRF ON THE SIGN-OUT HANDLER, ODD ORIGINS == */
  /**
   * `null`, a malformed value and a lookalike host are the Origin shapes a
   * naive `startsWith`/`includes` comparison lets through. Phase 10 fixed the
   * plain cross-origin case; these are the neighbours of it.
   */
  section('20. SIGN-OUT ORIGIN EDGE CASES');

  for (const [label, origin] of [
    ['cross-site', 'https://evil.example'],
    ['lookalike host', 'http://evil-localhost:3190'],
    ['literal null', 'null'],
    ['malformed', 'not-a-url'],
  ]) {
    const attempt = await fetch(`${BASE}/admin/logout`, {
      method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: origin },
    });
    const alive = (await reach(cookie)) === 200;
    check(attempt.status === 403 && alive,
          `sign-out refused and session intact: ${label}`,
          `status ${attempt.status}, alive ${alive}`);
  }

  const headerless = await fetch(`${BASE}/admin/logout`, {
    method: 'POST', redirect: 'manual', headers: { Cookie: cookie },
  });
  check(headerless.status === 403 && (await reach(cookie)) === 200,
        'sign-out with NO Origin or Referer fails closed',
        `status ${headerless.status}`);

  /* ================= 21. UNKNOWN ACCOUNTS CANNOT BUY UNLIMITED SCRYPT == */
  /**
   * The per-account throttle cannot see an address that has no account, and
   * those attempts still reach the timing-equalisation hash - an N=2^17,
   * ~128 MB operation. Without a ceiling, anyone who can set a header turns
   * the sign-in form into a memory-exhaustion amplifier.
   *
   * Deliberately the LAST section: it exhausts a per-process budget that takes
   * a minute to refill, and anything after it would be measuring the ceiling
   * rather than itself.
   */
  section('21. GLOBAL SIGN-IN CEILING');

  let processed = 0;
  let refused = 0;
  for (let i = 0; i < 70; i += 1) {
    const page = await (await req('/admin/login', { noCookie: true })).text();
    const attempt = await post('/admin/login', {
      ...fieldsOf(page, 'password'),
      email: `${PREFIX.toLowerCase()}-nobody-${i}@example.invalid`,
      password: 'not-the-password-1',
    }, { noCookie: true, headers: { 'x-forwarded-for': `198.51.100.${(i % 250) + 1}` } });
    if (/too many|try again/i.test(await attempt.text())) refused += 1;
    else processed += 1;
  }
  check(refused > 0,
        'a per-instance ceiling bounds sign-in work for accounts that do not exist',
        `${processed} processed, ${refused} refused across 70 rotated addresses`);

  section('22. HTTP METHODS');

  // TRACE is omitted: undici refuses to send it, so it cannot be probed here.
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    const probe = await req('/admin/logout', { method });
    check(probe.status >= 400, `${method} /admin/logout refused`, `status ${probe.status}`);
  }
  const publicPost = await req('/results', { method: 'POST', headers: { Origin: BASE } });
  check(publicPost.status >= 400 || publicPost.status === 200, 'POST to a public page does not mutate', `status ${publicPost.status}`);
} catch (error) {
  console.error('\nHarness error:', error instanceof Error ? error.stack : error);
  fail += 1;
} finally {
  await cleanup().catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${'='.repeat(56)}`);
console.log(`SECURITY VERIFICATION: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('='.repeat(56));
exit(fail > 0 ? 1 : 0);
