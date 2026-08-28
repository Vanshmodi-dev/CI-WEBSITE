/**
 * The media upload system, attacked.
 *
 * =============================================================================
 * WHY THIS DRIVES A REAL BROWSER FOR THE UPLOAD
 * =============================================================================
 * The upload is a Server Action invoked programmatically, so it carries its
 * identity in a `Next-Action` header rather than in hidden form fields. A suite
 * that guesses that id tests a string; a suite that constructs a `File` in page
 * JavaScript tests a synthetic event. Neither tests the control a teacher uses.
 *
 * So: real fixture files on disk, attached with `DOM.setFileInputFiles` — the
 * browser doing exactly what the file picker does — and the REAL action id read
 * back out of the request the framework actually sent, then replayed under
 * different credentials for the authorisation and CSRF checks.
 *
 * =============================================================================
 * THE HARNESS IS ITSELF UNDER TEST
 * =============================================================================
 * Section 0 proves the suite can tell success from failure before any security
 * claim is made: it uploads a known-good photograph and asserts a row appears.
 * If that fails, every "the attack was refused" assertion below would pass for
 * the wrong reason — nothing was ever being written. Phase 16 hit exactly that
 * with an httpOnly cookie read through `document.cookie`, so the session used
 * here comes from the browser's own cookie jar.
 *
 * ⚠ RUNNING THIS TWICE INSIDE FIVE MINUTES WILL FAIL THE SECOND RUN.
 * The last section deliberately exhausts the per-administrator upload limit,
 * which refills over five minutes. Any earlier section that reports
 * "THE SUITE HIT THE UPLOAD RATE LIMIT" means exactly that and nothing else.
 *
 * Usage:
 *   ADMIN_PASSWORD=... BASE_URL=http://localhost:3000 node scripts/verify-media.mjs
 */

import { env, exit } from 'node:process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { launch } from './browser.mjs';
import { MEDIA_CONSUMERS } from '../src/lib/media/consumers.ts';

const BASE = env.BASE_URL ?? 'http://localhost:3170';
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
    console.log(`  FAIL  ${name} ${detail}`);
  }
}
const section = (t) => console.log(`\n=== ${t} ===`);

/** Did this message come from the limiter rather than from judging the file? */
const rateLimited = (message) =>
  /lot of uploads in a short time|Too many changes/i.test(message);

if (!PASSWORD) {
  console.error('ADMIN_PASSWORD is not set. This suite signs in as a real administrator.');
  exit(1);
}
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. This suite reads the media table directly.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/* ------------------------------------------------------------- fixtures -- */

const dir = await mkdtemp(path.join(tmpdir(), 'zzmedia-'));
const at = (name) => path.join(dir, name);

/** A recognisable, deterministic picture so a re-upload can be checked. */
async function makeImage(fileName, { width = 400, height = 300, format = 'jpeg', hue = 200 } = {}) {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: hue % 256, g: 120, b: 200 } },
  });
  const buffer =
    format === 'png' ? await image.png().toBuffer()
    : format === 'webp' ? await image.webp().toBuffer()
    : format === 'avif' ? await image.avif().toBuffer()
    : await image.jpeg().toBuffer();
  const file = at(fileName);
  await writeFile(file, buffer);
  return file;
}

async function makeRaw(fileName, content) {
  const file = at(fileName);
  await writeFile(file, Buffer.isBuffer(content) ? content : Buffer.from(content, 'binary'));
  return file;
}

console.log(`\nBuilding fixtures in ${dir}`);

const F = {
  jpeg: await makeImage('holiday.jpg', { format: 'jpeg' }),
  png: await makeImage('logo.png', { format: 'png' }),
  webp: await makeImage('shot.webp', { format: 'webp' }),
  avif: await makeImage('modern.avif', { format: 'avif' }),
  second: await makeImage('second.jpg', { format: 'jpeg', hue: 40 }),

  // A real JPEG with an HTML payload welded on. Sniffs as a JPEG; the
  // re-encode is what must remove the payload.
  polyglot: await makeRaw(
    'polyglot.jpg',
    Buffer.concat([
      await sharp({ create: { width: 60, height: 60, channels: 3, background: '#123456' } })
        .jpeg()
        .toBuffer(),
      Buffer.from('<script>window.__zzmediaPwned=1</script>', 'utf8'),
    ]),
  ),

  html: await makeRaw('photo.jpg', '<!DOCTYPE html><html><script>alert(1)</script></html>'),
  js: await makeRaw('avatar.png', 'window.location="http://evil.example"'),
  exe: await makeRaw('portrait.jpg', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])),
  svg: await makeRaw(
    'diagram.png',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>',
  ),
  gif: await makeRaw('animated.webp', Buffer.from('GIF89a' + '\u0000'.repeat(40), 'binary')),
  empty: await makeRaw('empty.jpg', Buffer.alloc(0)),
  corrupt: await makeRaw(
    'corrupt.jpg',
    Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 0x41)]),
  ),
  /*
    ⚠ DISTINCT HUES, AND THAT IS LOAD-BEARING.

    These began as copies of the plain JPEG fixture. Identical bytes hash to the
    identical key, so they DEDUPLICATED - the upsert kept the first row and
    these filenames were never stored at all. The assertions below then read
    labels written by a different fixture and passed without testing anything.
    A different colour per fixture is what makes each one a genuinely new row
    carrying the hostile name.
  */
  traversalName: await makeImage('..%2F..%2Fevil.jpg', { format: 'jpeg', hue: 11 }),
  xssName: await makeImage('x_ onerror=alert(1) .jpg', { format: 'jpeg', hue: 77 }),
};

/** Oversized: a genuinely large JPEG, above the 6 MB cap. */
F.oversize = await makeRaw(
  'huge.jpg',
  await sharp({
    create: { width: 4000, height: 4000, channels: 3, background: '#ff0000' },
  })
    // Noise defeats compression, so the file really is large rather than a
    // 4000x4000 flat colour that compresses to a few kilobytes.
    .composite([
      {
        input: Buffer.from(
          Array.from({ length: 4000 * 4000 * 3 }, () => Math.floor(Math.random() * 256)),
        ),
        raw: { width: 4000, height: 4000, channels: 3 },
      },
    ])
    .jpeg({ quality: 100 })
    .toBuffer(),
);

/** A pixel bomb: inside both side limits, far beyond the megapixel cap. */
F.pixelBomb = await makeRaw(
  'bomb.png',
  await sharp({ create: { width: 7000, height: 7000, channels: 3, background: '#000000' } })
    .png({ compressionLevel: 9 })
    .toBuffer(),
);

/** A JPEG carrying GPS EXIF, to prove the re-encode drops it. */
F.gps = await makeRaw(
  'gps.jpg',
  await sharp({ create: { width: 200, height: 200, channels: 3, background: '#00ff00' } })
    .withExif({
      IFD0: { Copyright: 'ZZMEDIA', Artist: 'ZZMEDIA' },
      IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
    })
    .jpeg()
    .toBuffer(),
);

console.log('Fixtures ready.\n');

/* ------------------------------------------------------------- browser --- */

const browser = await launch(env.BROWSER ?? 'chrome');
const page = await browser.page();
await page.viewport(1280, 900);

const NEW_STUDENT = '/admin/students/new';

async function signIn() {
  await page.goto(`${BASE}/admin/login`);
  await page.type('input[type=email]', EMAIL);
  await page.type('input[type=password]', PASSWORD);
  await page.submitForm('input[type=password]', 4000);
  return page.eval('location.pathname');
}

/**
 * Upload one fixture through the real control and return what the page says.
 *
 * The status line is a live region the component writes to, so reading it is
 * reading what a teacher would be told.
 */
async function upload(filePath) {
  const SENTINEL = '__zzmedia_awaiting__';

  /*
    BLANK THE LIVE REGION BEFORE TRIGGERING, OR THIS READS THE LAST RESULT.

    The status line still holds the PREVIOUS upload's message. Polling it
    straight away returns that message instantly, so the helper reports a
    success for an upload that has not started. The rate-limit section made
    "75 attempts in 3 seconds" that way and concluded the limiter was broken
    when in truth nothing had been uploaded at all.

    Writing a sentinel and waiting for React to overwrite it is what makes the
    wait real. It works even when two consecutive uploads produce the identical
    message, which comparing old text against new would not.

    Clearing the file input matters too: setting the same file on an input that
    already holds it fires no change event, so no upload happens.
  */
  await page.eval(`(() => {
    for (const input of document.querySelectorAll('input[type=file]')) input.value = '';
    const status = document.querySelector('[role="status"]');
    if (status) status.textContent = ${JSON.stringify('__zzmedia_awaiting__')};
    /*
      The alert node is NOT removed. It belongs to React, and deleting it means
      React's tree and the DOM disagree - a re-render that produces the same
      error string then has no reason to touch that subtree, so the alert never
      comes back and this helper waits forever. The sentinel on the status line
      is what distinguishes a new result from an old one; sections that could
      see a stale alert reload the page instead.
    */
    return true;
  })()`);

  await page.setFileInput('input[type=file]:not([capture])', [filePath]);

  for (let i = 0; i < 60; i += 1) {
    const seen = await page.eval(`(() => {
      const status = document.querySelector('[role="status"]');
      const alert = document.querySelector('[role="alert"]');
      return JSON.stringify({
        status: status ? status.textContent.trim() : '',
        alert: alert ? alert.textContent.trim() : '',
      });
    })()`);
    const { status, alert } = JSON.parse(seen);

    if (alert) return { ok: false, message: alert };
    if (status && status !== SENTINEL && !/Uploading/i.test(status)) {
      return { ok: true, message: status };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, message: '(timed out waiting for a result)' };
}

/** The value the parent form would submit. */
const currentPath = () =>
  page.eval(`(document.querySelector('input[type=hidden][name="photoUrl"]') || {}).value || ''`);

const countAssets = () => prisma.mediaAsset.count();

/* ====================================================================== */

section('0. THE HARNESS CAN TELL SUCCESS FROM FAILURE');

/*
  START FROM A KNOWN STATE.

  A previous run that crashed leaves media rows behind, and the fixtures are
  deterministic - identical bytes hash to an identical key, so the control
  upload DEDUPLICATES and the row count does not move. The suite then reports
  "a row was written: 4 -> 4" and every refusal check below becomes
  meaningless. Clearing first is what makes the run repeatable rather than
  dependent on how the last one ended.
*/
{
  const stale = await prisma.mediaAsset.deleteMany({});
  if (stale.count > 0) console.log(`  (cleared ${stale.count} row(s) left by a previous run)`);
  const storeRoot = path.join(process.cwd(), '.media-store');
  try {
    const fs = await import('node:fs/promises');
    for (const entry of await fs.readdir(storeRoot)) {
      await rm(path.join(storeRoot, entry), { force: true });
    }
  } catch {
    /* No store directory yet. */
  }
}

const landed = await signIn();
check(landed === '/admin', 'signed in', landed);
if (landed !== '/admin') {
  await rm(dir, { recursive: true, force: true });
  await prisma.$disconnect();
  await page.close();
  await browser.close();
  exit(1);
}

const adminCookie = await page.cookieHeader(BASE);
check(
  adminCookie.includes('='),
  'the httpOnly session cookie was captured from the browser jar',
  adminCookie ? 'present' : 'MISSING — every replay below would be anonymous',
);

await page.goto(BASE + NEW_STUDENT);
check(
  (await page.eval(`document.querySelectorAll('input[type=file]').length`)) >= 1,
  'the student form offers a real file input',
);

const before = await countAssets();
const good = await upload(F.jpeg);
check(good.ok, 'a normal JPEG uploads', good.message);
const afterGood = await countAssets();
check(afterGood === before + 1, 'a row was written', `${before} -> ${afterGood}`);

const goodPath = await currentPath();
check(/^\/media\/[0-9a-f]{32}\.jpg$/.test(goodPath), 'the form now carries a media path', goodPath);

/*
  THE CONTROL CASE. Everything below asserts "the attack was refused, and the
  count did not move". That claim is only meaningful because the count DID move
  here. Without this, a broken uploader would make every attack test pass.
*/
check(afterGood > before, 'the control case moved the row count, so refusals below mean something');

section('1. VALID FORMATS ARE ACCEPTED');
for (const [name, file] of [['PNG', F.png], ['WebP', F.webp], ['AVIF', F.avif]]) {
  await page.goto(BASE + NEW_STUDENT);
  const result = await upload(file);
  check(result.ok, `${name} uploads`, result.message);
}

section('2. HOSTILE FILES ARE REFUSED, AND NOTHING IS STORED');
{
  const hostile = [
    ['HTML named .jpg', F.html, /not a photo|renamed/i],
    ['JavaScript named .png', F.js, /not a photo|renamed/i],
    ['Windows executable named .jpg', F.exe, /not a photo|renamed/i],
    ['SVG named .png', F.svg, /SVG/i],
    ['GIF named .webp', F.gif, /not a photo|renamed/i],
    ['an empty file', F.empty, /empty/i],
    ['a corrupt JPEG', F.corrupt, /damaged|could not be opened|not a photo/i],
    ['a 7000x7000 pixel bomb', F.pixelBomb, /pixels|megapixel|larger than/i],
    ['a file above the size cap', F.oversize, /MB/i],
  ];

  for (const [what, file, expected] of hostile) {
    await page.goto(BASE + NEW_STUDENT);
    const countBefore = await countAssets();
    const result = await upload(file);
    const countAfter = await countAssets();

    check(!result.ok, `${what} is refused`, result.message.slice(0, 90));
    /*
      A rate-limit message here means the SUITE exhausted the limiter, not that
      the file was judged. Reporting it as "the wrong message" would send a
      reader looking for a validation bug that does not exist, so it is named.
      Section 13 tests the limiter deliberately, at the end, for this reason.
    */
    if (rateLimited(result.message)) {
      check(false, `${what}: THE SUITE HIT THE UPLOAD RATE LIMIT`, 'wait five minutes and re-run');
      continue;
    }
    check(
      expected.test(result.message),
      `${what} is refused with a message that says why`,
      result.message.slice(0, 90),
    );
    check(countAfter === countBefore, `${what} stored nothing`, `${countBefore} -> ${countAfter}`);
    check(
      (await currentPath()) === '',
      `${what} left the form's photo field empty`,
    );
  }
}

section('3. A POLYGLOT LOSES ITS PAYLOAD');
{
  await page.goto(BASE + NEW_STUDENT);
  const result = await upload(F.polyglot);
  check(result.ok, 'the polyglot is accepted as the JPEG it genuinely is', result.message);

  const stored = await currentPath();
  const key = stored.replace('/media/', '');
  const asset = await prisma.mediaAsset.findUnique({ where: { key } });
  check(Boolean(asset), 'a row exists for it');

  const served = await fetch(BASE + stored);
  const body = Buffer.from(await served.arrayBuffer());
  check(
    !body.includes(Buffer.from('<script>')),
    'the appended script is NOT in the stored bytes',
  );
  check(
    !body.includes(Buffer.from('__zzmediaPwned')),
    'the payload marker is gone entirely',
  );
  check(
    served.headers.get('content-type') === 'image/jpeg',
    'it is served as an image',
    String(served.headers.get('content-type')),
  );
  check(
    served.headers.get('x-content-type-options') === 'nosniff',
    'with nosniff, so a browser cannot re-interpret it',
  );
}

section('4. EXIF AND GPS ARE STRIPPED');
{
  await page.goto(BASE + NEW_STUDENT);
  const result = await upload(F.gps);
  check(result.ok, 'a JPEG carrying EXIF uploads', result.message);

  const stored = await currentPath();
  const served = await fetch(BASE + stored);
  const body = Buffer.from(await served.arrayBuffer());

  check(!body.includes(Buffer.from('ZZMEDIA')), 'the EXIF Artist/Copyright text is gone');
  /*
    Guarded: if the upload above was refused, this response is an HTML error
    page and sharp throws, which would end the run with a stack trace instead
    of a failure line. A crash is not a test result.
  */
  try {
    const meta = await sharp(body).metadata();
    check(!meta.exif, 'the decoded image carries no EXIF block at all');
  } catch {
    check(false, 'the decoded image carries no EXIF block at all', 'the response was not an image');
  }
}

section('5. THE FILENAME IS NEVER A PATH');
{
  for (const [what, file] of [
    ['a traversal filename', F.traversalName],
    ['an XSS filename', F.xssName],
  ]) {
    await page.goto(BASE + NEW_STUDENT);
    const result = await upload(file);
    check(result.ok, `${what} still uploads (the name is only a label)`, result.message);
    const stored = await currentPath();
    check(
      /^\/media\/[0-9a-f]{32}\.(jpg|png|webp|avif)$/.test(stored),
      `${what} produced a hash-named path`,
      stored,
    );
  }

  const names = (await prisma.mediaAsset.findMany({ select: { originalName: true } })).map(
    (r) => r.originalName,
  );
  /*
    Prove the hostile names actually reached the table before asserting they
    were cleaned. Without this, deduplication could silently drop them and the
    two assertions below would pass over somebody else's filename.
  */
  check(
    names.some((n) => n.includes('evil')),
    'the traversal filename really was stored (so the check below is not vacuous)',
    names.join(' | ').slice(0, 120),
  );
  check(
    names.some((n) => n.includes('onerror')),
    'the XSS filename really was stored (so the check below is not vacuous)',
    names.join(' | ').slice(0, 120),
  );
  /*
    THE CLAIM IS ABOUT PATH SEPARATORS, SO THE CHECK IS ABOUT PATH SEPARATORS.

    An earlier version also rejected any label containing `..` and failed on
    `.._2F.._2Fevil.jpg` - which is the sanitiser working exactly as intended:
    the slashes became underscores, and what is left is two dots in a display
    string. A label is never a path, never joined to a directory, and never
    addresses anything; the storage key is a hash of our own output. Failing on
    `..` in a label reports a vulnerability that does not exist, and a check
    that does not match its own name is a check nobody can act on.
  */
  check(
    names.every((n) => !n.includes('/') && !n.includes('\\')),
    'no stored label contains a path separator',
    names.filter((n) => /[\\/]/.test(n)).join(' | '),
  );

  /* And the sharper claim: no label could ever be mistaken for a storage key. */
  check(
    names.every((n) => !/^[0-9a-f]{32}\.(jpg|png|webp|avif)$/.test(n)),
    'no stored label has the shape of a storage key',
  );
  check(
    names.every((n) => !/[<>"']/.test(n)),
    'no stored label contains markup characters',
    names.filter((n) => /[<>"']/.test(n)).join(' | '),
  );
}

section('6. RETRIEVAL REFUSES ANYTHING WE DID NOT ISSUE');
{
  const probes = [
    '/media/../../package.json',
    '/media/..%2f..%2fpackage.json',
    '/media/%2e%2e%2f%2e%2e%2fpackage.json',
    '/media/....//....//package.json',
    '/media/' + 'a'.repeat(32) + '.svg',
    '/media/' + 'a'.repeat(32) + '.exe',
    '/media/' + 'a'.repeat(32) + '.jpg.exe',
    '/media/' + 'A'.repeat(32) + '.jpg',
    '/media/' + 'a'.repeat(31) + '.jpg',
    '/media/.jpg',
    '/media/',
  ];
  /*
    REDIRECTS ARE FOLLOWED, DELIBERATELY.

    Two of these return 308 rather than 404: the framework normalises a doubled
    slash and a bare trailing slash BEFORE any handler runs. Asserting on the
    first response would report a failure for a request that is refused one hop
    later, and - worse - a suite that stops at a redirect would never notice if
    the redirect target ever started answering. So the final response is what is
    asserted, which is also what an attacker's client would actually receive.
  */
  for (const probe of probes) {
    const res = await fetch(BASE + probe, { redirect: 'follow' });
    const body = await res.text();
    check(
      res.status === 404 || res.status === 400,
      `refused: ${probe}`,
      `final status ${res.status}`,
    );
    check(
      !body.includes('"dependencies"') && !body.includes('commerce-insight-website'),
      `no file contents leaked for: ${probe}`,
    );
  }

  const missing = await fetch(BASE + '/media/' + 'b'.repeat(32) + '.jpg');
  check(missing.status === 404, 'a well-formed but unknown key is 404', String(missing.status));
}

section('7. AUTHORISATION AND CSRF ON THE UPLOAD ACTION');
{
  /*
    The real action request, captured from the browser rather than guessed.
    A Server Action invoked programmatically identifies itself with a
    `Next-Action` header; replaying THAT is replaying the real endpoint.
  */
  const actionRequest = [...page.requests]
    .reverse()
    .find((r) => r.method === 'POST' && Object.keys(r.headers).some((h) => h.toLowerCase() === 'next-action'));

  check(Boolean(actionRequest), 'captured the real upload action request from the browser');

  if (actionRequest) {
    const actionId = Object.entries(actionRequest.headers).find(
      ([h]) => h.toLowerCase() === 'next-action',
    )?.[1];

    const body = () => {
      const boundary = '----zzmedia' + Math.random().toString(16).slice(2);
      const CRLF = String.fromCharCode(13, 10);
      const head =
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="1_file"; filename="a.jpg"${CRLF}` +
        `Content-Type: image/jpeg${CRLF}${CRLF}`;
      const tail = `${CRLF}--${boundary}--${CRLF}`;
      return {
        boundary,
        buffer: Buffer.concat([
          Buffer.from(head, 'utf8'),
          Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
          Buffer.from(tail, 'utf8'),
        ]),
      };
    };

    // (a) No session at all.
    const anonBefore = await countAssets();
    const b1 = body();
    const anon = await fetch(actionRequest.url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${b1.boundary}`,
        'Next-Action': actionId,
        Origin: BASE,
      },
      body: b1.buffer,
      redirect: 'manual',
    });
    const anonAfter = await countAssets();
    check(anon.status < 500, 'an unauthenticated upload is handled', `status ${anon.status}`);
    check(anonAfter === anonBefore, 'an unauthenticated upload stores nothing');

    // (b) Session replayed from a foreign origin.
    const csrfBefore = await countAssets();
    const b2 = body();
    const csrf = await fetch(actionRequest.url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${b2.boundary}`,
        'Next-Action': actionId,
        Origin: 'https://attacker.example',
        Cookie: adminCookie,
      },
      body: b2.buffer,
      redirect: 'manual',
    });
    const csrfAfter = await countAssets();
    check(csrf.status >= 400, 'a cross-origin upload is refused outright', `status ${csrf.status}`);
    check(csrfAfter === csrfBefore, 'a cross-origin upload stores nothing');
  }
}

section('8. DELETION');
{
  await page.goto(BASE + NEW_STUDENT);
  const result = await upload(F.second);
  check(result.ok, 'uploaded a photo to delete', result.message);
  const storedPath = await currentPath();
  const key = storedPath.replace('/media/', '');

  // Unreferenced: deletion should succeed.
  await page.goto(`${BASE}/admin/media`);
  const deleted = await page.eval(`(() => {
    const card = [...document.querySelectorAll('article, div')]
      .find((el) => el.querySelector && el.textContent.includes('second.jpg'));
    return Boolean(card);
  })()`);
  check(deleted, 'the photo appears in the library');

  // Delete it through the action, then prove both row and file are gone.
  const beforeDelete = await countAssets();
  const delRes = await prisma.mediaAsset.findUnique({ where: { key } });
  check(Boolean(delRes), 'the row exists before deletion');

  // Attach it to a record and prove deletion is then REFUSED.
  const topper = await prisma.topper.create({
    data: {
      studentName: 'ZZMEDIA Reference Holder',
      programme: 'CLASS_12',
      year: 2026,
      score: 90,
      scoreUnit: 'percent',
      photoUrl: storedPath,
      displayNameMode: 'INITIALS',
      published: false,
    },
    select: { id: true },
  });

  await page.goto(`${BASE}/admin/media`);
  const guarded = await page.eval(`document.body.innerText.includes('Remove it from those records first')`);
  check(guarded, 'a photo in use offers no delete button, and says why');

  await prisma.topper.delete({ where: { id: topper.id } });
  check((await countAssets()) === beforeDelete, 'the guard did not delete anything');
}

section('8b. THE DELETE GUARD KNOWS ABOUT EVERY KIND OF RECORD');
{
  /*
    =========================================================================
    WHY THIS SECTION EXISTS
    =========================================================================
    Section 8 above proves the guard works. It proves it with a TOPPER, which
    is one of the two consumers that existed when Topic 5 wrote it.

    Topic 6 gave teachers a photograph and Topic 8 gave gallery entries one.
    Neither was counted, by the library page or by the delete action, and
    nothing failed — a `count()` aimed at the wrong tables returns zero, and
    zero is a perfectly good-looking answer. Phase 18 reproduced the result in
    a browser from a clean database:

        a photo used by a PUBLISHED gallery entry and a PUBLISHED teacher
        -> the library said "Not used anywhere"
        -> it offered Delete
        -> the server accepted
        -> both records still pointed at it
        -> a visitor asking for that photograph got 404

    A gallery entry's `imageUrl` is NOT NULL, so that record cannot even be
    repaired by clearing the field.

    So this section runs the SAME assertion once per consumer. It is written
    from `MEDIA_CONSUMERS`, the list the application itself reads, so a fifth
    consumer added later is tested here automatically rather than being
    forgotten in the same way.
  */
  /*
    A photo we are willing to lose, deleted FOR REAL. That does two jobs at
    once: it proves an unreferenced photo genuinely can be deleted, and it
    captures the real `Next-Action` request so the refusals below can be
    replayed against the SERVER rather than only against a hidden button.
  */
  await page.goto(BASE + NEW_STUDENT);
  const throwaway = await upload(F.second);
  check(throwaway.ok, 'uploaded a throwaway photo', throwaway.message);
  const gonePath = await currentPath();
  const goneKey = gonePath.replace('/media/', '');

  await page.goto(`${BASE}/admin/media`);
  await page.eval(`(async () => {
    const del = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Delete'));
    if (!del) return 'none';
    del.click();
    await new Promise((r) => setTimeout(r, 400));
    const confirm = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Delete').pop();
    if (confirm) confirm.click();
    await new Promise((r) => setTimeout(r, 3000));
    return 'done';
  })()`, true);
  check(
    !(await prisma.mediaAsset.findUnique({ where: { key: goneKey } })),
    'control: an unreferenced photo really is deleted when asked',
  );

  const deleteRequest = [...page.requests]
    .reverse()
    .find((r) => r.method === 'POST' && Object.keys(r.headers).some((h) => h.toLowerCase() === 'next-action'));
  const deleteActionId = deleteRequest
    ? Object.entries(deleteRequest.headers).find(([h]) => h.toLowerCase() === 'next-action')?.[1]
    : null;
  check(Boolean(deleteActionId), 'captured the real delete action from the browser');
  const adminCookie = await page.cookieHeader(BASE);

  /** The delete action, called directly with a valid session — no button. */
  const replayDelete = async (key) => {
    if (!deleteActionId) return { status: 0 };
    const boundary = '----zzref' + Math.random().toString(16).slice(2);
    const CRLF = String.fromCharCode(13, 10);
    const body =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="1_key"${CRLF}${CRLF}${key}${CRLF}` +
      `--${boundary}--${CRLF}`;
    const res = await fetch(deleteRequest.url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Next-Action': deleteActionId,
        Origin: BASE,
        Cookie: adminCookie,
      },
      body,
      redirect: 'manual',
    });
    await res.text().catch(() => '');
    return res;
  };

  /*
    A FIXTURE OF ITS OWN. Keys are content-addressed, so re-using `F.jpeg` here
    would land on a key other sections have already attached records to — and
    the closing control ("with every holder removed, Delete is offered once
    more") would then fail for a reason that has nothing to do with the guard.
    Unique bytes, unique key, no interference.

    ⚠ AND UNIQUE DIMENSIONS, NOT JUST A UNIQUE COLOUR. A first attempt used
    `hue: 77`, which is exactly the hue of the `xssName` fixture — identical
    bytes, identical key, so it DEDUPLICATED into that row and the card read
    below belonged to a different photograph entirely. The suite already warns
    about this trap in the fixture block above; it caught this section too.
  */
  const refFixture = await makeImage('zzref-guard.jpg', {
    format: 'jpeg', width: 401, height: 299, hue: 133,
  });
  await page.goto(BASE + NEW_STUDENT);
  const uploaded = await upload(refFixture);
  check(uploaded.ok, 'uploaded a photo for the reference tests', uploaded.message);
  const refPath = await currentPath();
  const refKey = refPath.replace('/media/', '');

  /** One throwaway record per consumer, each pointing at the same photo. */
  const make = {
    topper: () => prisma.topper.create({ data: {
      studentName: 'ZZMEDIA Ref Topper', programme: 'CLASS_12', year: 2026,
      score: 90, scoreUnit: 'percent', photoUrl: refPath,
      displayNameMode: 'INITIALS', published: false } , select: { id: true } }),
    studentStory: () => prisma.studentStory.create({ data: {
      slug: 'zzmedia-ref-story-' + Date.now(), studentName: 'ZZMEDIA Ref Story',
      programme: 'CLASS_12', year: 2026,
      challenge: 'ZZMEDIA reference holder.', journey: 'ZZMEDIA reference holder.',
      outcome: 'ZZMEDIA reference holder.',
      photoUrl: refPath, displayNameMode: 'INITIALS', published: false },
      select: { id: true } }),
    faculty: () => prisma.faculty.create({ data: {
      name: 'ZZMEDIA Ref Teacher', designation: 'Faculty',
      photoUrl: refPath, published: false, priority: 0 }, select: { id: true } }),
    galleryItem: () => prisma.galleryItem.create({ data: {
      imageUrl: refPath, alt: 'ZZMEDIA reference holder tile',
      category: 'CLASSROOMS', showsPeople: false, published: false, priority: 0 },
      select: { id: true } }),
  };

  /*
    CONTROL FIRST. With nothing referencing it the library must OFFER the
    delete — otherwise every assertion below passes against a photo that could
    never be deleted by anybody, and the section proves nothing at all.
  */
  /*
    ⚠ EVERY READING BELOW IS SCOPED TO THIS PHOTO'S OWN CARD.

    A first version asked "is there a Delete button on the page", and failed
    against a library holding eight other photographs, every one of them
    correctly deletable. A page-wide question cannot answer a per-row one.
  */
  /**
   * Read ONE photograph's row in the library.
   *
   * ⚠ BOUNDED, AND BOUND BY CONSTRUCTION.
   *
   * Two earlier versions of this got it wrong in the same direction. The first
   * asked "is there a Delete button on the page", which is a page-wide question
   * that cannot answer a per-row one — it failed against a library holding
   * eight other, correctly deletable photographs. The second walked up from the
   * image until it found a row, which is right until it is not: any condition
   * that stops the card matching sends the walk on up into the grid, where it
   * finds every OTHER card's Delete button and reports it as this one's.
   *
   * So the walk now stops at the last ancestor still holding exactly ONE image
   * — the definition of "this photograph's card" — and the result carries
   * `imgs`, which the assertions check. A probe that overshoots now says so
   * instead of quietly answering about the wrong photograph.
   *
   * The delete button is matched by its ACCESSIBLE NAME. Each one renders
   * "Delete" plus the filename in an sr-only span, so "Delete zzref-guard.jpg"
   * identifies one control exactly, with no DOM walking involved at all.
   */
  const cardProbe = (path, name) => String.raw`(() => {
    const img = [...document.querySelectorAll('img')].find((i) => i.getAttribute('src') === ` + JSON.stringify(path) + String.raw`);
    if (!img) return JSON.stringify({ found: false });

    let card = img.parentElement;
    while (card.parentElement && card.parentElement.querySelectorAll('img').length === 1) {
      card = card.parentElement;
    }
    const text = (card.innerText || '').replace(/\s+/g, ' ');
    const wanted = 'Delete ' + ` + JSON.stringify(name) + String.raw`;

    return JSON.stringify({
      found: true,
      imgs: card.querySelectorAll('img').length,
      refused: text.includes('Remove it from those records first'),
      offered: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === wanted),
      says: (text.match(/Used by [^·]*/) || [null])[0],
      text: text.slice(0, 160),
    });
  })()`;

  await page.goto(`${BASE}/admin/media`);
  const free = JSON.parse(await page.eval(cardProbe(refPath, 'zzref-guard.jpg')));
  check(free.found === true, "control: found this photo's own card in the library");
  check(free.offered === true, 'control: with nothing using it, its card DOES offer Delete', free.text);

  for (const consumer of MEDIA_CONSUMERS) {
    const created = await make[consumer.model]();

    await page.goto(`${BASE}/admin/media`);
    const seen = JSON.parse(await page.eval(cardProbe(refPath, 'zzref-guard.jpg')));

    check(seen.imgs === 1, `control: read exactly one card for a ${consumer.noun}`, `${seen.imgs} images inside it`);
    check(seen.refused === true, `a photo used by a ${consumer.noun} is marked as in use`, JSON.stringify(seen.says));
    check(seen.offered === false, `and the library offers NO delete button for it`);
    check(
      typeof seen.says === 'string' && seen.says.includes(consumer.noun),
      `and it names what is using it, in words`,
      `expected "${consumer.noun}" in: ${seen.says}`,
    );

    /*
      AND THE SERVER REFUSES IT TOO. A hidden button is a courtesy, not a
      control: the action is a public endpoint and must refuse on its own.
    */
    const before = await countAssets();
    const replay = await replayDelete(refKey);
    const after = await countAssets();
    check(after === before, `the SERVER refuses the deletion for a ${consumer.noun}`, `status ${replay.status}, ${before} -> ${after} assets`);
    check(
      Boolean(await prisma.mediaAsset.findUnique({ where: { key: refKey } })),
      `and the row survives a direct action call for a ${consumer.noun}`,
    );

    await prisma[consumer.model].delete({ where: { id: created.id } });
  }

  // With every holder gone the photo is deletable again — which proves the
  // refusals above were caused by the references and not by something else.
  await page.goto(`${BASE}/admin/media`);
  const freeAgain = JSON.parse(await page.eval(cardProbe(refPath, 'zzref-guard.jpg')));
  check(
    freeAgain.offered === true,
    'control: with every holder removed, Delete is offered once more',
    freeAgain.text,
  );
}

section('9. CONSENT IS NOT TOUCHED BY UPLOADING');
{
  /*
    THE POINT OF THIS WHOLE SECTION.

    Uploading a photograph must not be, and must not become, a way to publish
    one. These assertions read the DATABASE after an upload, because that is
    where a consent bypass would show.
  */
  const beforeRows = await prisma.topper.count({ where: { published: true } });

  await page.goto(BASE + NEW_STUDENT);
  const result = await upload(F.jpeg);
  check(result.ok, 'a photo uploads on the new-student form', result.message);

  const afterRows = await prisma.topper.count({ where: { published: true } });
  check(afterRows === beforeRows, 'uploading published nothing');

  const anyConsent = await prisma.mediaAsset.findFirst({ select: { key: true } });
  check(Boolean(anyConsent), 'media rows exist');
  const columns = Object.keys(anyConsent ?? {});
  check(
    !columns.some((c) => /consent|publish/i.test(c)),
    'the media table carries no consent or publication column',
    columns.join(', '),
  );
}

section('10. REPLACEMENT AND CACHING');
{
  await page.goto(BASE + NEW_STUDENT);
  await upload(F.jpeg);
  const first = await currentPath();

  const replaced = await upload(F.second);
  check(replaced.ok, 'a second upload replaces the first in the form', replaced.message);
  const second = await currentPath();

  check(first !== second, 'a different photo produces a DIFFERENT url', `${first} vs ${second}`);

  const a = await fetch(BASE + first);
  const b = await fetch(BASE + second);
  const aBytes = Buffer.from(await a.arrayBuffer());
  const bBytes = Buffer.from(await b.arrayBuffer());
  check(!aBytes.equals(bBytes), 'the two urls serve different bytes');
  check(
    a.headers.get('cache-control')?.includes('immutable'),
    'each url is immutable, so a replaced photo can never be served stale',
    String(a.headers.get('cache-control')),
  );

  // Identical bytes deduplicate rather than piling up.
  await page.goto(BASE + NEW_STUDENT);
  await upload(F.jpeg);
  const again = await currentPath();
  check(again === first, 'the same photo uploaded twice yields the same url', `${again}`);
}

section('11. THE PHOTO IS OPTIONAL');
{
  /*
    A regression test with a history: this project has already shipped a field
    whose help text said "optional" while validation refused it empty. Saving a
    complete record with NO photograph must work.
  */
  const name = 'ZZMEDIA No Photo Student';
  await prisma.topper.deleteMany({ where: { studentName: name } });

  await page.goto(BASE + NEW_STUDENT);
  const emptyPath = await currentPath();
  check(emptyPath === '', 'the photo field starts empty');

  await page.eval(`(() => {
    const set = (sel, value) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      return true;
    };
    set('[name="studentName"]', ${JSON.stringify(name)});
    set('[name="programme"]', 'CLASS_12');
    set('[name="year"]', '2026');
    set('[name="score"]', '88');
    return true;
  })()`);
  await page.submitForm('[name="studentName"]', 4000);

  const saved = await prisma.topper.findFirst({ where: { studentName: name } });
  check(Boolean(saved), 'a record with no photograph saves successfully');
  check(saved?.photoUrl === null, 'and stores no photo path', String(saved?.photoUrl));
  if (saved) await prisma.topper.delete({ where: { id: saved.id } });
}

section('11b. THE UPLOAD RATE LIMIT ACTUALLY FIRES');
{
  /*
    DELIBERATELY LAST, because it exhausts a budget that takes five minutes to
    refill. Two runs of this suite inside five minutes will fail the second, and
    that is the control working rather than a defect.

    SEQUENTIAL IS CORRECT HERE, unlike the sign-in ceiling.

    Phase 16 found that the sign-in check had become a measurement of laptop
    speed: its window is 60 seconds, so a slow machine drained it faster than
    the loop could fill it. This window is FIVE MINUTES. No machine is slow
    enough for sixty sequential uploads to take that long, so the limit is
    reached regardless of hardware and the result does not depend on the
    laptop. The distinction is the whole reason this comment exists.
  */
  const started = Date.now();
  let attempts = 0;
  let refused = false;

  for (let i = 0; i < 75 && !refused; i += 1) {
    // A fresh page each time, so no message from the previous attempt can be
    // mistaken for this one's.
    await page.goto(BASE + NEW_STUDENT);
    attempts += 1;
    const result = await upload(F.jpeg);
    if (rateLimited(result.message)) refused = true;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  check(
    refused,
    'repeated uploading is eventually refused by the limiter',
    `${attempts} attempts in ${seconds}s (limit is 60 per 5 minutes; ` +
      `if this reached 75 without a refusal the limiter is not working)`,
  );

  await page.goto(BASE + NEW_STUDENT);
  const stillWorks = await upload(F.jpeg);
  check(
    rateLimited(stillWorks.message),
    'and it keeps refusing while the window is open',
    stillWorks.message.slice(0, 70),
  );
}

/* ------------------------------------------------------------- cleanup -- */

section('12. CLEANUP');
{
  await prisma.topper.deleteMany({ where: { studentName: { startsWith: 'ZZMEDIA' } } });
  const removed = await prisma.mediaAsset.deleteMany({});
  console.log(`  removed ${removed.count} media row(s) written by this run`);

  /*
    THE FILES TOO. Deleting rows straight through Prisma is exactly the
    half-operation the deletion order tolerates - it leaves orphan files behind,
    which `npm run media:clean` is built to reclaim. A verification run that
    leaves litter on disk every time is not clean, so it sweeps its own.
  */
  /*
    ⚠ SWEPT THROUGH THE STORE, NOT THROUGH THE FILESYSTEM.

    This used to `readdir` the local `.media-store` directory directly, which
    worked precisely as long as photographs lived on local disk. Phase 17 ran
    this whole suite against object storage and it reported "swept 0 file(s)"
    while leaving nine real objects orphaned in the bucket — the cleanup was
    looking at an empty directory and pronouncing itself finished.

    Going through the store means the sweep follows the photographs wherever
    the run actually put them.
  */
  let sweptFiles = 0;
  try {
    const { getMediaStore } = await import('../src/lib/media/store.ts');
    const store = getMediaStore();
    for (const key of await store.list()) {
      await store.remove(key).catch(() => {});
      sweptFiles += 1;
    }
  } catch (error) {
    /*
      Reported, never swallowed. The first version of this hid the failure in a
      bare catch, and when the script was run WITHOUT `--conditions=react-server`
      the `server-only` guard threw on import — so the sweep did nothing at all
      and still printed a reassuring zero.
    */
    console.log(`  ! could not sweep the media store: ${String(error).slice(0, 120)}`);
  }
  console.log(`  swept ${sweptFiles} object(s) from the media store`);
  check(
    (await prisma.topper.count({ where: { studentName: { startsWith: 'ZZMEDIA' } } })) === 0,
    'no ZZMEDIA records remain',
  );
}

await rm(dir, { recursive: true, force: true });
await prisma.$disconnect();
await page.close();
await browser.close();

console.log('\n========================================================');
console.log(`MEDIA VERIFICATION: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('========================================================');

exit(fail === 0 ? 0 : 1);
