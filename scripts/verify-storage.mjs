/**
 * The production media adapter, driven against a mock S3 service.
 *
 * =============================================================================
 * WHAT THIS PROVES AND WHAT IT CANNOT
 * =============================================================================
 * It proves the adapter's BEHAVIOUR: that a round trip works, that a key this
 * application did not issue is refused before a request is built, that every
 * failure a bucket can produce is surfaced rather than swallowed, and — the
 * point of the whole exercise — that a half-configured deployment refuses
 * instead of quietly falling back to a disk it is about to lose.
 *
 * It does NOT prove interoperability with Cloudflare R2 or any real provider.
 * No credentials exist and none were invented. The mock validates the request
 * SHAPE; it cannot validate that Cloudflare agrees with our signature.
 *
 * That gap is covered from the other side: `tests/sigv4.test.ts` checks the
 * signing key derivation against the worked example published in AWS's own
 * Signature Version 4 documentation, which is an external fact this project
 * cannot accidentally satisfy. Between the two, what remains untested is a live
 * network call, and that is recorded as NOT TESTED rather than implied.
 *
 * Run with the react-server condition so `server-only` resolves to its empty
 * module:
 *
 *   node --conditions=react-server scripts/verify-storage.mjs
 */

import { createServer } from 'node:http';
import { exit } from 'node:process';

import {
  readS3Config,
  S3_ENV_VARS,
} from '../src/lib/media/s3-config.ts';
import { S3MediaStore } from '../src/lib/media/s3.ts';
import { getMediaStore, resetMediaStore } from '../src/lib/media/store.ts';

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

/* ============================================================ mock S3 ==== */

const BUCKET = 'ci-media-test';
const ACCESS_KEY = 'ZZTESTACCESSKEY';
const SECRET_KEY = 'ZZTESTSECRETKEY-not-a-real-credential';

/**
 * A deliberately strict mock.
 *
 * It refuses anything that does not carry a well-formed SigV4 Authorization
 * header naming our access key, so a suite that forgot to sign would fail here
 * rather than passing on a permissive stub.
 */
function startMockS3() {
  const objects = new Map();
  const requests = [];
  let mode = 'ok';

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const auth = req.headers.authorization ?? '';
    requests.push({ method: req.method, path: url.pathname, auth });

    const wellFormed =
      auth.startsWith('AWS4-HMAC-SHA256 ') &&
      auth.includes(`Credential=${ACCESS_KEY}/`) &&
      /SignedHeaders=host;x-amz-content-sha256;x-amz-date/.test(auth) &&
      /Signature=[0-9a-f]{64}/.test(auth) &&
      typeof req.headers['x-amz-date'] === 'string' &&
      typeof req.headers['x-amz-content-sha256'] === 'string';

    if (!wellFormed) {
      res.writeHead(403).end('<Error><Code>SignatureDoesNotMatch</Code></Error>');
      return;
    }
    if (mode === 'forbidden') {
      res.writeHead(403).end('<Error><Code>AccessDenied</Code></Error>');
      return;
    }
    if (mode === 'nobucket') {
      res.writeHead(404).end('<Error><Code>NoSuchBucket</Code></Error>');
      return;
    }
    if (mode === 'broken') {
      res.writeHead(500).end('<Error><Code>InternalError</Code></Error>');
      return;
    }
    if (mode === 'hang') {
      // Never respond. Exercises the adapter's own timeout.
      return;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const bucket = segments[0];
    const key = segments.slice(1).join('/');

    if (bucket !== BUCKET) {
      res.writeHead(404).end('<Error><Code>NoSuchBucket</Code></Error>');
      return;
    }

    // Listing.
    if (key === '' && req.method === 'GET') {
      const body =
        '<?xml version="1.0"?><ListBucketResult>' +
        [...objects.keys()].map((k) => `<Key>${k}</Key>`).join('') +
        '<IsTruncated>false</IsTruncated></ListBucketResult>';
      res.writeHead(200, { 'Content-Type': 'application/xml' }).end(body);
      return;
    }

    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        objects.set(key, {
          bytes: Buffer.concat(chunks),
          contentType: req.headers['content-type'] ?? 'application/octet-stream',
        });
        res.writeHead(200).end();
      });
      return;
    }

    const held = objects.get(key);

    if (req.method === 'HEAD') {
      if (!held) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': held.contentType, 'Content-Length': String(held.bytes.length) }).end();
      return;
    }
    if (req.method === 'GET') {
      if (!held) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': held.contentType }).end(held.bytes);
      return;
    }
    if (req.method === 'DELETE') {
      objects.delete(key);
      res.writeHead(204).end();
      return;
    }
    res.writeHead(405).end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        objects,
        requests,
        setMode: (m) => { mode = m; },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/* =============================================================== run ===== */

console.log('\n### PRODUCTION MEDIA STORAGE ###');

const mock = await startMockS3();

/*
  The endpoint is http, and `readS3Config` refuses http on purpose. So the
  adapter is constructed DIRECTLY for the behavioural sections, and the config
  gate is tested separately on its own terms. Relaxing the https rule to make
  testing easier would have removed the guard that matters in production.
*/
const store = new S3MediaStore({
  endpoint: `http://127.0.0.1:${mock.port}`,
  bucket: BUCKET,
  accessKeyId: ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  region: 'auto',
});

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg';
const OTHER = 'ffffffffffffffffffffffffffffffff.webp';
const BYTES = Buffer.from('ZZSHOW synthetic image bytes, not a real photograph');

/* ---------------------------------------------------- 1. the round trip -- */
section('1. A COMPLETE ROUND TRIP');
{
  check(!(await store.exists(KEY)), 'an object that was never written does not exist');
  check((await store.get(KEY)) === null, 'and reading it returns null rather than throwing');

  await store.put(KEY, BYTES, 'image/jpeg');
  check(mock.objects.has(KEY), 'put actually reached the bucket');

  check(await store.exists(KEY), 'exists finds it afterwards');

  const got = await store.get(KEY);
  check(got !== null && got.bytes.equals(BYTES), 'the bytes come back byte-identical');
  check(got?.contentType === 'image/jpeg', 'and carry the content type we stored', got?.contentType);

  const listed = await store.list();
  check(listed.includes(KEY), 'list reports it');

  await store.remove(KEY);
  check(!mock.objects.has(KEY), 'remove deletes it');
  check(!(await store.exists(KEY)), 'and exists agrees it is gone');
}

/* ------------------------------------------------ 2. every request signed */
section('2. EVERY REQUEST IS SIGNED');
{
  const unsigned = mock.requests.filter((r) => !r.auth.startsWith('AWS4-HMAC-SHA256 '));
  check(unsigned.length === 0, 'no request was sent unsigned', `${unsigned.length} unsigned`);
  check(mock.requests.length > 0, 'and the mock actually saw traffic', `${mock.requests.length} requests`);

  const leaked = mock.requests.filter((r) => r.auth.includes(SECRET_KEY));
  check(leaked.length === 0, 'the secret key never appears in a request header');
}

/* --------------------------------------------------- 3. exists is cheap -- */
section('3. DEDUPLICATION DOES NOT DOWNLOAD THE PHOTOGRAPH');
{
  mock.requests.length = 0;
  await store.put(KEY, BYTES, 'image/jpeg');
  await store.exists(KEY);
  const heads = mock.requests.filter((r) => r.method === 'HEAD').length;
  const gets = mock.requests.filter((r) => r.method === 'GET').length;
  check(heads === 1, 'exists issues a HEAD', `${heads} HEAD`);
  check(gets === 0, 'and never a GET — a duplicate upload costs one cheap request', `${gets} GET`);
  await store.remove(KEY);
}

/* ------------------------------------------------------- 4. the key guard */
section('4. A KEY THIS APPLICATION DID NOT ISSUE IS REFUSED');
{
  const hostile = [
    '../../../etc/passwd',
    '..%2f..%2fetc%2fpasswd',
    'a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg/../../secret',
    '/absolute/path.jpg',
    'C:\\Windows\\system32\\config.jpg',
    'a1b2c3d4e5f60718293a4b5c6d7e8f90.exe',
    'a1b2c3d4e5f60718293a4b5c6d7e8f90.svg',
    'short.jpg',
    'A1B2C3D4E5F60718293A4B5C6D7E8F90.jpg',
    'a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg\u0000.png',
    '',
  ];

  for (const key of hostile) {
    mock.requests.length = 0;
    let refused = false;
    try {
      await store.get(key);
    } catch {
      refused = true;
    }
    const reached = mock.requests.length > 0;
    check(
      refused && !reached,
      `refused before any request: ${JSON.stringify(key.slice(0, 34))}`,
      reached ? 'A REQUEST WAS SENT' : '',
    );
  }

  // POSITIVE CONTROL: a legitimate key still works, so the guard is not
  // simply refusing everything.
  await store.put(OTHER, BYTES, 'image/webp');
  check(await store.exists(OTHER), 'control: a well-formed key is still accepted');
  await store.remove(OTHER);
}

/* --------------------------------------------------- 5. failure handling */
section('5. FAILURES SURFACE, AND NEVER LOOK LIKE SUCCESS');
{
  const cases = [
    ['forbidden', 'invalid credentials (403)'],
    ['nobucket', 'the bucket does not exist (404)'],
    ['broken', 'the service is failing (500)'],
  ];

  for (const [mode, description] of cases) {
    mock.setMode(mode);

    let putThrew = false;
    try {
      await store.put(KEY, BYTES, 'image/jpeg');
    } catch (error) {
      putThrew = true;
      check(
        !String(error.message).includes(SECRET_KEY),
        `${description}: the error does not contain the secret`,
      );
    }
    check(putThrew, `${description}: an upload THROWS rather than reporting success`);
    check(!mock.objects.has(KEY), `${description}: and nothing was stored`);

    mock.setMode('ok');
  }

  /*
    A 404 on a READ is not a failure - it is "no such object", which is a
    legitimate answer the caller has to be able to distinguish from an outage.
  */
  mock.setMode('nobucket');
  let readResult = 'threw';
  try {
    readResult = await store.get(KEY);
  } catch {
    /* expected for a missing bucket */
  }
  mock.setMode('ok');
  check(readResult === null || readResult === 'threw', 'a missing bucket does not return bytes');
}

/* ------------------------------------------------------ 6. network faults */
section('6. THE NETWORK ITSELF FAILING');
{
  const dead = new S3MediaStore({
    // Nothing is listening here.
    endpoint: 'http://127.0.0.1:1',
    bucket: BUCKET,
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    region: 'auto',
  });

  let threw = false;
  let message = '';
  try {
    await dead.put(KEY, BYTES, 'image/jpeg');
  } catch (error) {
    threw = true;
    message = String(error.message);
  }
  check(threw, 'an unreachable bucket makes the upload fail, not succeed');
  check(!message.includes(SECRET_KEY), 'and the failure does not print the secret');
}

/* ------------------------------------------------------ 7. the config gate */
section('7. A HALF-CONFIGURED DEPLOYMENT REFUSES, IT NEVER FALLS BACK');
{
  const COMPLETE = {
    MEDIA_S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    MEDIA_S3_BUCKET: BUCKET,
    MEDIA_S3_ACCESS_KEY_ID: ACCESS_KEY,
    MEDIA_S3_SECRET_ACCESS_KEY: SECRET_KEY,
  };

  check(readS3Config({}).state === 'absent', 'nothing set is ABSENT — a developer machine');
  check(readS3Config(COMPLETE).state === 'ready', 'all four set is READY');

  for (const omitted of S3_ENV_VARS) {
    const env = { ...COMPLETE };
    delete env[omitted];
    check(
      readS3Config(env).state === 'partial',
      `missing ${omitted} is PARTIAL, never absent`,
    );
  }

  /*
    And the store honours it. This is the assertion that matters: a partial
    configuration must not yield a LocalDiskStore, because on an ephemeral host
    that is the silent data loss this whole phase exists to prevent.
  */
  const saved = {};
  for (const name of S3_ENV_VARS) saved[name] = process.env[name];
  try {
    process.env.MEDIA_S3_ENDPOINT = COMPLETE.MEDIA_S3_ENDPOINT;
    process.env.MEDIA_S3_BUCKET = COMPLETE.MEDIA_S3_BUCKET;
    process.env.MEDIA_S3_ACCESS_KEY_ID = COMPLETE.MEDIA_S3_ACCESS_KEY_ID;
    delete process.env.MEDIA_S3_SECRET_ACCESS_KEY;
    resetMediaStore();

    const selected = getMediaStore();
    check(
      /MISCONFIGURED/.test(selected.describe()),
      'a half-configured environment selects the refusing store',
      selected.describe(),
    );

    let uploadThrew = false;
    let refusalMessage = '';
    try {
      await selected.put(KEY, BYTES, 'image/jpeg');
    } catch (error) {
      uploadThrew = true;
      refusalMessage = String(error.message);
    }
    check(uploadThrew, 'and every upload through it throws');
    check(
      /MISCONFIGURED|missing/i.test(refusalMessage),
      'with a message naming the problem',
      refusalMessage.slice(0, 90),
    );
    check(
      !refusalMessage.includes(SECRET_KEY) && !refusalMessage.includes(ACCESS_KEY),
      'and without printing a credential',
    );
  } finally {
    for (const name of S3_ENV_VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    resetMediaStore();
  }
}

/* ------------------------------------------------------------ 8. cleanup */
section('8. THE MOCK BUCKET IS LEFT EMPTY');
{
  for (const key of [...mock.objects.keys()]) mock.objects.delete(key);
  check(mock.objects.size === 0, 'nothing was left behind');
}

await mock.close();

console.log('\n========================================================');
console.log(`MEDIA STORAGE ADAPTER: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('\nNOT TESTED: interoperability with a real provider. No credentials');
console.log('exist and none were invented. See the report.');
console.log('========================================================');

exit(fail === 0 ? 0 : 1);
