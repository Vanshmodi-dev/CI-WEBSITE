/**
 * Does the Website Editor actually change the public website?
 *
 * THE QUESTION THIS ANSWERS. Every other suite can pass on a CMS that is
 * quietly broken: the unit tests prove the registry resolves correctly, the
 * security suite proves the editor is behind authentication, and neither of
 * them proves that a teacher typing a new headline changes what a stranger
 * sees. That round trip — save in the admin, fetch as a logged-out visitor,
 * find the new text — is the entire point of the feature, and it crosses a
 * server action, a database write, ISR revalidation and a cold public request.
 *
 * So this drives a real browser for the admin half and a plain anonymous
 * `fetch` for the public half. Using the same browser for both would prove
 * only that the person who made the edit can see it.
 *
 * IT PUTS EVERYTHING BACK. The run edits live content, so it restores the
 * original value at the end and asserts the restore worked. A verification
 * that leaves test text on the website is a defect, not a test.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... BASE_URL=http://localhost:3170 \
 *     node scripts/verify-cms.mjs
 */

import { env, exit } from 'node:process';
import { launch } from './browser.mjs';

const BASE = env.BASE_URL ?? 'http://localhost:3170';
const EMAIL = env.ADMIN_EMAIL ?? 'admin@localhost.invalid';
const PASSWORD = env.ADMIN_PASSWORD ?? '';

/**
 * Unmistakably synthetic, and prefixed like every other test fixture in this
 * project so a stray row is identifiable at a glance.
 */
const MARKER = 'ZZCMS Heading Under Test';

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

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/** Anonymous fetch — no admin cookie, the way a visitor arrives. */
async function publicHtml(path) {
  const res = await fetch(BASE + path, { headers: { 'cache-control': 'no-cache' } });
  return res.text();
}

/**
 * Fetch a public page until it carries `needle`, and report how many requests
 * that took.
 *
 * ⚠ WHY THIS IS NOT "RETRY UNTIL GREEN".
 *
 * `revalidatePath` marks an ISR page stale; it does not rebuild it inline. The
 * first anonymous request after a save can therefore still be served the
 * previous render while the new one is produced behind it. Phase 16 measured
 * exactly that: one assertion said the edit was not public, and the very next
 * assertion, a few hundred milliseconds later, said it was.
 *
 * Asserting on a single request measures that race, not the product. Asserting
 * with no bound would hide a genuinely broken revalidation forever. So this
 * polls a SMALL fixed number of times and RETURNS THE COUNT, which the caller
 * prints - a value that starts needing three or four requests is a regression
 * worth seeing, and it stays visible instead of being smoothed away.
 */
async function waitForPublic(path, needle, tries = 6) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const html = await publicHtml(path);
    if (html.includes(needle)) return { found: true, attempt, html };
    if (attempt < tries) await new Promise((r) => setTimeout(r, 250));
  }
  return { found: false, attempt: tries, html: await publicHtml(path) };
}

/**
 * Set a controlled input's value the way a person would.
 *
 * React installs its own value setter on the input's prototype and tracks the
 * last value it wrote. Assigning `input.value` directly bypasses that tracker,
 * so React believes nothing changed and the form submits the OLD value — the
 * test would then "pass" while proving nothing. Going through the prototype
 * descriptor and dispatching a bubbling `input` event is what makes React see
 * it.
 */
function setInputScript(selector, value) {
  return `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return null;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`;
}

if (!PASSWORD) {
  console.error(
    'ADMIN_PASSWORD is not set. This suite signs in as a real administrator; ' +
      'it will not guess a password.',
  );
  exit(1);
}

try {
  await fetch(BASE);
} catch {
  console.error(`No server at ${BASE}. Run \`npx next start\` first.`);
  exit(1);
}

const browser = await launch(env.BROWSER ?? 'chrome');
const page = await browser.page();
await page.viewport(1280, 900);

/* ------------------------------------------------------------------------ */

section('1. THE EDITOR IS BEHIND AUTHENTICATION');
{
  const res = await fetch(`${BASE}/admin/website`, { redirect: 'manual' });
  check(
    res.status === 307 || res.status === 302 || res.status === 303,
    'an anonymous request to the editor is redirected, not served',
    `status ${res.status}`,
  );
  const body = await res.text();
  check(!body.includes('Homepage wording'), 'the redirect body carries no editor content');
}

section('2. SIGN IN');
await page.goto(`${BASE}/admin/login`);
await page.type('input[type=email]', EMAIL);
await page.type('input[type=password]', PASSWORD);
await page.submitForm('input[type=password]', 4000);
const landed = await page.eval('location.pathname');
check(landed === '/admin', 'signed in', landed);
if (landed !== '/admin') {
  console.error('Cannot continue without a session.');
  await page.close();
  await browser.close();
  exit(1);
}

section('3. THE EDITOR RENDERS EVERY GROUP');
await page.goto(`${BASE}/admin/website`);
const original = await page.eval(
  `(document.querySelector('[name="home.heroTitleLine1"]') || {}).value`,
);
{
  const groups = await page.eval(`(() => {
    const text = document.body.innerText;
    return {
      contact: text.includes('Contact details'),
      home: text.includes('Homepage wording'),
      about: text.includes('About page'),
      courses: text.includes('Programme descriptions'),
      nav: text.includes('Menu and footer'),
    };
  })()`);
  check(groups.contact, 'contact group renders');
  check(groups.home, 'homepage group renders');
  check(groups.about, 'about group renders');
  check(groups.courses, 'programme group renders');
  check(groups.nav, 'menu group renders');
  check(
    typeof original === 'string' && original.length > 0,
    'a field is pre-filled with what the site says today',
    JSON.stringify(original),
  );
}

section('4. AN EDIT REACHES A LOGGED-OUT VISITOR');
{
  const before = await publicHtml('/');
  check(before.includes(original), 'the homepage shows the original headline before the edit');
  check(!before.includes(MARKER), 'the marker is not already present');

  const wrote = await page.eval(setInputScript('[name="home.heroTitleLine1"]', MARKER));
  check(wrote === MARKER, 'the new value was typed into the field');
  await page.submitForm('[name="home.heroTitleLine1"]', 4000);

  check(
    await page.eval(`document.body.innerText.includes('Saved.')`),
    'the editor confirms the save',
  );

  const after = await publicHtml('/');
  check(after.includes(MARKER), 'the edited headline is on the PUBLIC homepage');
  check(!after.includes(original), 'the original headline is gone', 'stale ISR cache?');
}

section('5. VALIDATION REFUSES BAD INPUT');
{
  await page.goto(`${BASE}/admin/website`);
  const phoneBefore = await page.eval(
    `(document.querySelector('[name="contact.phonePrimary"]') || {}).value`,
  );
  await page.eval(setInputScript('[name="contact.phonePrimary"]', '12345'));
  await page.submitForm('[name="contact.phonePrimary"]', 4000);

  check(
    /10-digit mobile number/.test(await page.eval('document.body.innerText')),
    'a malformed phone number is refused with a plain-language message',
  );

  const digits = phoneBefore.replace(/\D/g, '').slice(-10);
  const contactPage = await publicHtml('/contact');
  check(
    contactPage.replace(/\D/g, '').includes(digits),
    'the refused value never reached the public site',
  );
}

section('6. AN UNREGISTERED KEY CANNOT BE WRITTEN');
{
  /*
    The save loop iterates over the REGISTRY and reads the form, never the
    other way round, so an extra field in the payload is not rejected with an
    error - it is simply never looked at. This proves the payload really did
    carry it and that the site is unaffected. That no ROW was written is
    asserted separately by inspecting the database, because a suite driving a
    browser cannot see the table.
  */
  await page.goto(`${BASE}/admin/website`);
  const added = await page.eval(`(() => {
    const form = document.querySelector('[name="home.heroTitleLine1"]').form;
    const extra = document.createElement('input');
    extra.type = 'hidden';
    extra.name = 'evil.injectedKey';
    extra.value = 'ZZCMS should never be stored';
    form.appendChild(extra);
    return form.querySelectorAll('[name="evil.injectedKey"]').length;
  })()`);
  check(added === 1, 'the unregistered field was added to the payload');

  await page.submitForm('[name="home.heroTitleLine1"]', 4000);
  const html = await publicHtml('/');
  check(
    !html.includes('should never be stored'),
    'the unregistered value appears nowhere on the public site',
  );
}

section('7. PUT IT BACK');
{
  await page.goto(`${BASE}/admin/website`);
  await page.eval(setInputScript('[name="home.heroTitleLine1"]', original));
  await page.submitForm('[name="home.heroTitleLine1"]', 4000);

  const restored = await publicHtml('/');
  check(restored.includes(original), 'the original headline is back on the public homepage');
  check(!restored.includes(MARKER), 'the test marker is gone from the public site');
}


/* ==================================================================== */
/* PHASE 16, TOPIC 4 — CLICK-TO-EDIT PREVIEW                            */
/* ==================================================================== */

/**
 * Everything below drives the preview surface rather than the group editor,
 * because the preview is where a teacher will actually work and it is the
 * surface that posts single-field saves with a lost-update token.
 */

const PREVIEW = '/admin/preview';
const XSS = '<script>window.__zzcmsPwned = 1</script>';

/** Hidden inputs of the form whose markup contains `marker`. */
function fieldsOf(markup, marker) {
  const forms = [...markup.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const target = forms.find((f) => f.includes(marker)) ?? '';
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

/** Server Actions are posted as multipart/form-data, as the form declares. */
async function postAction(path, fields, { cookie, origin } = {}) {
  const boundary = '----zzcms' + Math.random().toString(16).slice(2);
  const CRLF = String.fromCharCode(13, 10);
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
  }
  body += `--${boundary}--${CRLF}`;

  return fetch(BASE + path, {
    method: 'POST',
    body,
    redirect: 'manual',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Origin: origin ?? BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
}

/**
 * The admin session cookie, taken from the BROWSER'S cookie jar.
 *
 * Not `document.cookie`: the session cookie is httpOnly, so JavaScript in the
 * page cannot see it and every "authenticated" replay below would silently be
 * anonymous. See the note on `cookieHeader` in scripts/browser.mjs.
 */
const adminCookie = await page.cookieHeader(BASE);
check(
  adminCookie.includes('='),
  'the signed-in session cookie was captured for replay',
  adminCookie ? `${adminCookie.split(';').length} cookie(s)` : 'none — the replays below would be anonymous',
);

section('8. THE PREVIEW LISTS EVERY REGISTERED FIELD, AND NOTHING ELSE');

await page.goto(BASE + PREVIEW);

const previewKeys = await page.eval(
  `JSON.stringify([...document.querySelectorAll('input[name="only"]')].map((i) => i.value))`,
);
const listed = JSON.parse(previewKeys);

check(listed.length > 0, 'the preview renders editable fields', `${listed.length} found`);
check(
  new Set(listed).size === listed.length,
  'no field is listed twice',
);

/*
  The registry is the authority. Rather than hardcoding a count that goes stale,
  the editor page renders one input per registered field in each group; the two
  surfaces are built from the same list, so they must agree.
*/
await page.goto(BASE + '/admin/website');
const editorKeys = JSON.parse(
  await page.eval(
    `JSON.stringify([...document.querySelectorAll('form input[name], form textarea[name]')]
      .map((i) => i.name)
      .filter((n) => n.includes('.') && !n.startsWith('$')))`,
  ),
);
const missing = listed.filter((k) => !editorKeys.includes(k));
check(
  missing.length === 0,
  'every field in the preview also exists in the editor',
  missing.join(', '),
);

section('9. A SINGLE-FIELD EDIT REACHES A LOGGED-OUT VISITOR');

await page.goto(BASE + PREVIEW);
const beforeEdit = await page.eval(
  `(document.querySelector('input[name="only"][value="home.ctaTitle"]') || {}).value`,
);
check(beforeEdit === 'home.ctaTitle', 'the closing-invitation heading is editable from the preview');

const NEW_CTA = 'ZZCMS Preview Edit Worked';
{
  const markup = await page.eval('document.documentElement.outerHTML');
  const fields = fieldsOf(markup, 'value="home.ctaTitle"');
  fields['home.ctaTitle'] = NEW_CTA;

  const res = await postAction(PREVIEW, fields, { cookie: adminCookie });
  check(res.status < 400, 'the single-field save was accepted', `status ${res.status}`);

  const seen = await waitForPublic('/', NEW_CTA);
  check(
    seen.found,
    'the edited heading is on the PUBLIC homepage',
    `after ${seen.attempt} anonymous request(s)`,
  );
}

section('9b. A BAND THE INSTITUTE HAS NOT FILLED IN DOES NOT EXIST');
{
  /*
    =========================================================================
    THE TWO BANDS THE BLUEPRINT ASKS FOR AND NOBODY COULD BUILD
    =========================================================================
    §9 and §10 of the master directive, and Sections 2 and 3 of the vision
    brief, both describe a credibility strip and a why-us band on the homepage.
    Both give example content — "5000+ Students", "18+ Years Experience",
    "Doubt Support" — and both attach the same condition in the client's own
    words: "Fake numbers bilkul nahi" and "actual offerings sir se verify."

    Every example is exactly the kind of figure the previous site invented, so
    the bands could not be written into the page. What was missing was the
    other half of §9: "the UI should be designed so these values can be
    dynamically updated later."

    Phase 20 built that. The rule this section defends is the one that makes it
    safe: a band exists ONLY when a human has supplied complete content. A
    figure with nothing naming it, or a heading with no points under it, must
    render nothing at all — because a half-filled credibility strip is how an
    unverified number reaches a visitor.
  */
  const KEYS = [
    'home.trust.1.value', 'home.trust.1.label',
    'home.why.heading', 'home.why.1.title', 'home.why.1.body',
  ];
  /*
    This suite talks HTTP and a browser, never the database. That is fine here:
    every one of these fields has an EMPTY fallback, so what the editor shows
    is exactly what is stored — there is no fallback standing in front of it.
  */
  const currentValue = async (key) => {
    await page.goto(BASE + PREVIEW);
    return page.eval(
      '(() => {' +
        '  const only = document.querySelector(\'input[name="only"][value=\' + ' +
        JSON.stringify(JSON.stringify(key)) +
        ' + \']\');' +
        '  if (!only) return null;' +
        "  const box = only.closest('form').querySelector('input[type=text], textarea');" +
        '  return box ? box.value : null;' +
        '})()',
    );
  };
  const before = {};
  for (const key of KEYS) before[key] = await currentValue(key);

  const save = async (key, value) => {
    await page.goto(BASE + PREVIEW);
    const markup = await page.eval('document.documentElement.outerHTML');
    const fields = fieldsOf(markup, `value="${key}"`);
    fields[key] = value;
    return postAction(PREVIEW, fields, { cookie: adminCookie });
  };
  const home = async () => publicHtml('/');

  /* --- start from genuinely empty --------------------------------------- */
  for (const key of KEYS) await save(key, '');
  await new Promise((r) => setTimeout(r, 500));
  let html = await home();
  check(!html.includes('ZZBAND'), 'control: with nothing supplied, neither band is on the page');

  /* --- HALF a statistic must not appear ---------------------------------- */
  await save('home.trust.1.value', '5000+');
  await new Promise((r) => setTimeout(r, 500));
  html = await home();
  check(
    !html.includes('5000+'),
    'a figure with nothing naming it stays hidden',
    'an unlabelled number reached the homepage',
  );

  /* --- the completed pair appears ---------------------------------------- */
  await save('home.trust.1.label', 'ZZBAND students taught');
  const shown = await waitForPublic('/', 'ZZBAND students taught');
  check(shown.found, 'a completed figure appears', `after ${shown.attempt} anonymous request(s)`);
  check((await home()).includes('5000+'), 'and it carries the number the teacher typed');

  /* --- a heading with no points is not a band ---------------------------- */
  await save('home.why.heading', 'ZZBAND Why this institute');
  await new Promise((r) => setTimeout(r, 500));
  check(
    !(await home()).includes('ZZBAND Why this institute'),
    'a why-us heading with no points under it stays hidden',
  );

  await save('home.why.1.title', 'ZZBAND Concept first');
  const why = await waitForPublic('/', 'ZZBAND Concept first');
  check(why.found, 'adding a point brings the band in', `after ${why.attempt} request(s)`);
  check(
    (await home()).includes('ZZBAND Why this institute'),
    'and the heading comes with it',
  );

  /* --- clearing takes it away again -------------------------------------- */
  for (const key of KEYS) await save(key, '');
  await new Promise((r) => setTimeout(r, 700));
  html = await home();
  check(!html.includes('ZZBAND') && !html.includes('5000+'), 'clearing the fields removes both bands');

  /* --- and the page is otherwise unharmed -------------------------------- */
  check(html.includes('</footer>') && html.length > 5000, 'control: the homepage still renders');

  // Put back whatever was stored.
  for (const key of KEYS) {
    const was = before[key];
    if (was !== null && was !== undefined && was !== '') await save(key, was);
  }
}

section('10. AN UNREGISTERED KEY IS REFUSED, NOT WRITTEN');
{
  await page.goto(BASE + PREVIEW);
  const markup = await page.eval('document.documentElement.outerHTML');
  const fields = fieldsOf(markup, 'value="home.ctaTitle"');

  // Swap the target for a key that is not in the registry.
  fields.only = 'evil.injectedKey';
  fields['evil.injectedKey'] = 'ZZCMS unregistered value';

  const res = await postAction(PREVIEW, fields, { cookie: adminCookie });
  check(res.status < 500, 'the request is handled, not crashed', `status ${res.status}`);

  const home = await publicHtml('/');
  const contact = await publicHtml('/contact');
  check(
    !home.includes('ZZCMS unregistered value') && !contact.includes('ZZCMS unregistered value'),
    'the unregistered value appears nowhere on the public site',
  );
  check(
    (await publicHtml('/')).includes(NEW_CTA),
    'the legitimate value was not disturbed by the refused request',
  );
}

section('11. A KEY FROM ANOTHER GROUP IS REFUSED');
{
  /*
    `only` is checked against the GROUP'S fields, not the registry at large.
    A real key from a different group must be refused: the lost-update token
    the form carries was computed over this group's rows and does not cover it.
  */
  await page.goto(BASE + PREVIEW);
  const markup = await page.eval('document.documentElement.outerHTML');
  const fields = fieldsOf(markup, 'value="home.ctaTitle"');
  fields.only = 'contact.city';
  fields['contact.city'] = 'ZZCMS Wrong Group';

  await postAction(PREVIEW, fields, { cookie: adminCookie });
  const contact = await publicHtml('/contact');
  check(
    !contact.includes('ZZCMS Wrong Group'),
    'a real key from another group is not written',
  );
}

section('12. A STALE EDIT CANNOT OVERWRITE A NEWER CHANGE');
{
  /*
    Two editors open on the same field. The first saves; the second still holds
    the token from before that save. The second save must be refused, not
    silently applied on top.
  */
  await page.goto(BASE + PREVIEW);
  const staleMarkup = await page.eval('document.documentElement.outerHTML');
  const staleFields = fieldsOf(staleMarkup, 'value="home.ctaTitle"');

  // Editor one saves.
  const firstFields = { ...staleFields, 'home.ctaTitle': 'ZZCMS First Editor Wins' };
  await postAction(PREVIEW, firstFields, { cookie: adminCookie });
  const firstLanded = await waitForPublic('/', 'ZZCMS First Editor Wins');
  check(
    firstLanded.found,
    'the first save landed',
    `after ${firstLanded.attempt} anonymous request(s)`,
  );

  // Editor two saves with the token it captured BEFORE that.
  const secondFields = { ...staleFields, 'home.ctaTitle': 'ZZCMS Second Editor Clobbers' };
  await postAction(PREVIEW, secondFields, { cookie: adminCookie });

  const afterStale = await publicHtml('/');
  check(
    !afterStale.includes('ZZCMS Second Editor Clobbers'),
    'the stale save did NOT overwrite the newer value',
  );
  check(
    afterStale.includes('ZZCMS First Editor Wins'),
    'the newer value survived the stale save',
  );
}

section('13. VALIDATION AND CANCEL');
{
  await page.goto(BASE + PREVIEW);
  const markup = await page.eval('document.documentElement.outerHTML');
  const fields = fieldsOf(markup, 'value="contact.postalCode"');
  fields['contact.postalCode'] = 'not-a-pin';

  await postAction(PREVIEW, fields, { cookie: adminCookie });
  const contact = await publicHtml('/contact');
  check(!contact.includes('not-a-pin'), 'an invalid PIN code is never persisted');
  check(contact.includes('302033'), 'the previous PIN code is still shown');
}
{
  /*
    Cancel is a client-side dismissal: no request is made at all. The
    observable claim is therefore "opening the editor and dismissing it changes
    nothing", which is what is asserted here.
  */
  await page.goto(BASE + PREVIEW);
  const before = await publicHtml('/');
  await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim().startsWith('Edit'));
    btn.click();
    return true;
  })()`);
  const dialogOpen = await page.eval(`document.querySelectorAll('dialog[open]').length`);
  check(dialogOpen === 1, 'clicking Edit opens exactly one dialog', String(dialogOpen));

  await page.eval(`(() => {
    const dlg = document.querySelector('dialog[open]');
    const input = dlg.querySelector('input[type=text], textarea');
    const proto = input.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set
      .call(input, 'ZZCMS Cancelled Text');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    [...dlg.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Cancel').click();
    return true;
  })()`);

  const stillOpen = await page.eval(`document.querySelectorAll('dialog[open]').length`);
  check(stillOpen === 0, 'Cancel closes the dialog');

  const after = await publicHtml('/');
  check(after === before, 'Cancel changed nothing on the public site');
  check(!after.includes('ZZCMS Cancelled Text'), 'the cancelled text was never published');
}

section('14. AUTHORISATION AND CSRF ON THE SINGLE-FIELD SAVE');
{
  await page.goto(BASE + PREVIEW);
  const markup = await page.eval('document.documentElement.outerHTML');
  const base = fieldsOf(markup, 'value="home.ctaTitle"');

  // (a) No session cookie at all.
  const anon = { ...base, 'home.ctaTitle': 'ZZCMS Anonymous Write' };
  const anonRes = await postAction(PREVIEW, anon);
  check(anonRes.status < 500, 'an unauthenticated action post is handled', `status ${anonRes.status}`);
  check(
    !(await publicHtml('/')).includes('ZZCMS Anonymous Write'),
    'an unauthenticated post does NOT mutate content',
  );

  // (b) A foreign Origin, with the session cookie replayed.
  const csrf = { ...base, 'home.ctaTitle': 'ZZCMS Cross Origin Write' };
  const csrfRes = await postAction(PREVIEW, csrf, {
    cookie: adminCookie,
    origin: 'https://attacker.example',
  });
  /*
    Next's own Server Action origin check refuses this before our code runs -
    the server log reads "does not match `origin` header ... Aborting the
    action." It surfaces as a 500 rather than a 403, which is the framework's
    choice, not ours.

    The assertion is therefore that it was NOT accepted. An earlier version of
    this check asserted `status < 500` and failed, which would have read as an
    application defect when what it actually found was the CSRF guard working.
  */
  check(
    csrfRes.status >= 400,
    'a cross-origin action post is refused outright',
    `status ${csrfRes.status}`,
  );
  check(
    !(await publicHtml('/')).includes('ZZCMS Cross Origin Write'),
    'a cross-origin post does NOT mutate content',
  );
}

section('15. AN XSS PAYLOAD IS RENDERED AS TEXT, NOT EXECUTED');
{
  await page.goto(BASE + PREVIEW);
  const markup = await page.eval('document.documentElement.outerHTML');
  const fields = fieldsOf(markup, 'value="home.ctaTitle"');
  fields['home.ctaTitle'] = XSS;

  await postAction(PREVIEW, fields, { cookie: adminCookie });

  /*
    POLLED, like every other post-save assertion in this suite.

    This one fetched once and began failing in Topic 6: the homepage gained a
    faculty query, regeneration got a little slower, and a race that used to
    resolve inside the first request stopped doing so. The payload WAS being
    saved and escaped correctly - the check was reading the previous render.

    A single fetch after `revalidatePath` measures how fast the page rebuilds,
    not whether it escapes. The count is reported so a regression in
    revalidation is still visible rather than smoothed away.
  */
  const escaped = await waitForPublic('/', '&lt;script&gt;');
  const html = escaped.html;
  check(
    !html.includes('<script>window.__zzcmsPwned'),
    'the payload is not present as live markup',
  );
  check(
    escaped.found,
    'the payload IS present, escaped, as text',
    `after ${escaped.attempt} anonymous request(s)`,
  );

  // And prove it in a real browser rather than by reading bytes.
  await page.goto(BASE + '/');
  const pwned = await page.eval(`Boolean(window.__zzcmsPwned)`);
  check(pwned === false, 'the payload did not execute in a real browser');

  const visible = await page.eval(`document.body.innerText.includes('<script>')`);
  check(visible === true, 'the visitor sees the literal text, which is the correct rendering');
}

section('16. RESTORE EVERYTHING TOPIC 4 TOUCHED');
{
  await page.goto(BASE + PREVIEW);
  const markup = await page.eval('document.documentElement.outerHTML');
  const fields = fieldsOf(markup, 'value="home.ctaTitle"');
  fields['home.ctaTitle'] = '';

  await postAction(PREVIEW, fields, { cookie: adminCookie });

  const restored = await waitForPublic('/', 'Ready to take the next step?');
  const html = restored.html;
  check(
    restored.found,
    'clearing the field restored the original wording',
    `after ${restored.attempt} anonymous request(s)`,
  );
  check(!html.includes('ZZCMS'), 'no test text remains on the public homepage');
  check(!html.includes('&lt;script&gt;'), 'the XSS payload is gone');
}


section('17. THE PREVIEW AND ITS EDITOR ON SMALL SCREENS');
{
  /*
    Phase 11 found a mobile drawer that existed, reported the right ARIA, and
    could not actually be operated. "The element is present" is not the claim
    worth testing; "it fits, and it can be worked" is.
  */
  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1280]) {
    await page.viewport(width, 800, { mobile: width < 640 });
    await page.goto(BASE + PREVIEW);
    const overflow = await page.eval(`(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))()`);
    check(
      overflow.scroll <= overflow.client,
      `${width}px — the preview does not scroll sideways`,
      `${overflow.scroll} > ${overflow.client}`,
    );
  }
}

{
  await page.viewport(320, 800, { mobile: true });
  await page.goto(BASE + PREVIEW);

  /*
    THE SAME TWO EXCEPTIONS verify-ux.mjs APPLIES, ON PURPOSE.

    A first version of this check omitted them and reported two offenders: the
    1x1 skip link, and an inline "the live site" link inside a paragraph. Both
    are correct implementations, and WCAG 2.5.8 exempts both - a visually
    hidden control is measured as presented when it is available, and a link
    inline in a sentence is explicitly out of scope. Inventing a stricter rule
    here than the public suite applies would have made the two suites disagree
    about the same standard, which is how a rule stops being believed.
  */
  const targets = await page.eval(`(() => {
    const small = [];
    for (const el of document.querySelectorAll('a[href], button:not([disabled]), input[type=submit]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      const s2 = getComputedStyle(el);
      const visuallyHidden =
        s2.clipPath === 'inset(50%)' ||
        s2.clip === 'rect(0px, 0px, 0px, 0px)' ||
        (r.width <= 1 && r.height <= 1);
      if (visuallyHidden) continue;

      const inline = el.closest('p, li') && s2.display === 'inline';
      if (inline) continue;

      if (r.height < 24 || r.width < 24) {
        small.push(el.tagName.toLowerCase() + ':' + (el.textContent || '').trim().slice(0, 24) +
                   ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      }
    }
    return JSON.stringify(small.slice(0, 5));
  })()`);
  const tooSmall = JSON.parse(targets);
  check(
    tooSmall.length === 0,
    '320px — every control meets the 24x24 minimum (WCAG 2.5.8)',
    tooSmall.join(' | '),
  );

  // Open an editor at the narrowest width and check it is actually usable.
  await page.eval(`(() => {
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim().startsWith('Edit')).click();
    return true;
  })()`);

  const dialog = await page.eval(`(() => {
    const d = document.querySelector('dialog[open]');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const save = [...d.querySelectorAll('button')].find((b) => b.textContent.includes('Save'));
    const cancel = [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel');
    const input = d.querySelector('input[type=text], textarea');
    return {
      fits: r.width <= document.documentElement.clientWidth,
      hasSave: Boolean(save),
      hasCancel: Boolean(cancel),
      hasInput: Boolean(input),
      labelled: Boolean(d.getAttribute('aria-labelledby')),
      labelText: d.getAttribute('aria-labelledby')
        ? (document.getElementById(d.getAttribute('aria-labelledby')) || {}).textContent
        : null,
      inputLabelled: input
        ? Boolean(document.querySelector('label[for="' + input.id + '"]'))
        : false,
      focusInside: d.contains(document.activeElement),
    };
  })()`);

  check(Boolean(dialog), 'the editor opens at 320px');
  if (dialog) {
    check(dialog.fits, 'the editor fits inside a 320px viewport');
    check(dialog.hasInput, 'it has a text control');
    check(dialog.hasSave, 'it offers Save');
    check(dialog.hasCancel, 'it offers Cancel');
    check(dialog.labelled, 'the dialog is named for assistive technology', String(dialog.labelText));
    check(dialog.inputLabelled, 'the text control has a real <label for=...>');
    /*
      `showModal()` moves focus into the dialog and makes the rest of the page
      inert. Setting the `open` attribute instead renders something that looks
      identical and leaves the page behind it fully focusable, which is the
      Phase 11 defect in a different costume.
    */
    check(dialog.focusInside, 'focus moved into the dialog, so it is truly modal');
  }

  /*
    A REAL key press through the browser, not a synthetic KeyboardEvent.

    A dispatched event does not trigger the browser's own dialog handling, so
    a synthetic Escape would prove only that our JavaScript ran - and <dialog>
    closes on Escape because the BROWSER does it, which is precisely the
    behaviour worth confirming.
  */
  await page.escape();
  const closed = await page.eval(`document.querySelectorAll('dialog[open]').length`);
  check(closed === 0, 'Escape closes the editor');

  await page.viewport(1280, 900);
}

section('14. THE THREE FIELDS THAT BECOME AN OUTBOUND LINK');
{
  /*
    Topic 12 added `social.youtube`, `social.instagram` and `contact.email`.

    Every other editable field on this site is rendered as TEXT, where React's
    escaping is the whole defence. These three end up inside an `href` in the
    footer of every page, so they are the only place where an administrator's
    typing becomes a DESTINATION rather than words.

    `tests/contact-links.test.ts` proves the parser refuses these strings. This
    proves the SERVER does — a correct parser is worth nothing if the action
    forgets to call it, which is exactly the defect Topic 5 found in the stories
    action after it had been in production for months.

    Every rejection is paired with a positive control further down: the same
    field must still accept a real profile URL. A validator that refused
    everything would sail through the negative half alone.
  */
  const readField = async (key) => {
    await page.goto(BASE + PREVIEW);
    return page.eval(
      `(document.querySelector('[name="' + ${JSON.stringify(key)} + '"]') || {}).value`,
    );
  };

  const save = async (key, value) => {
    await page.goto(BASE + PREVIEW);
    const markup = await page.eval('document.documentElement.outerHTML');
    const fields = fieldsOf(markup, `value="${key}"`);
    fields[key] = value;
    return postAction(PREVIEW, fields, { cookie: adminCookie });
  };

  const attacks = [
    ['social.youtube', 'javascript:alert(1)', 'a javascript: URL'],
    ['social.youtube', 'https://youtube.com.attacker.example/@x', 'a lookalike host'],
    ['social.youtube', 'https://youtube.com@evil.example/x', 'credentials disguising the host'],
    ['social.instagram', 'https://evilinstagram.com/x', 'a host that merely ends with the real one'],
    ['social.instagram', 'data:text/html,<script>alert(1)</script>', 'a data: URL'],
    ['contact.email', 'a" onmouseover="alert(1)@x.com', 'an address carrying an attribute break'],
    ['contact.email', 'nobody', 'a string that is not an address'],
  ];

  for (const [key, payload, description] of attacks) {
    await save(key, payload);

    const stored = await readField(key);
    check(
      stored !== payload,
      `${key} refuses ${description}`,
      stored === payload ? 'IT WAS STORED' : 'not stored',
    );

    const home = await publicHtml('/');
    check(
      !home.includes(payload),
      `and ${description} never reaches the public page`,
    );
  }

  // POSITIVE CONTROLS — the same fields must still take a real value.
  for (const [key, good] of [
    ['social.youtube', 'https://www.youtube.com/@zzcmsmarker'],
    ['social.instagram', 'https://www.instagram.com/zzcmsmarker'],
    ['contact.email', 'zzcms-marker@example.com'],
  ]) {
    await save(key, good);
    check(
      (await readField(key)) === good,
      `control: ${key} still accepts a real value`,
      await readField(key),
    );
  }

  // And back to the empty state these three ship in.
  for (const key of ['social.youtube', 'social.instagram', 'contact.email']) {
    await save(key, '');
  }
  check(
    (await readField('contact.email')) === '',
    'the three link fields are left as this suite found them',
  );
}

console.log('\n========================================================');
console.log(`CMS VERIFICATION: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('========================================================');

await page.close();
await browser.close();
exit(fail === 0 ? 0 : 1);
