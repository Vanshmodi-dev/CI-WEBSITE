/**
 * MEDIA STORAGE VERIFICATION — a REAL round trip against Cloudinary.
 *
 * =============================================================================
 * WHAT THIS USED TO BE, AND WHY IT CHANGED
 * =============================================================================
 * Until 5 September 2026 this file drove `S3MediaStore` against a mock S3
 * server (`scripts/mock-s3.mjs`) and made 49 assertions without ever leaving
 * the machine. That was the honest thing to do at the time: no bucket existed,
 * no credentials existed, and the suite said so in its own output — "NOT
 * TESTED: interoperability with a real provider."
 *
 * Credentials exist now, so the useful question changed. A mock proves our code
 * is self-consistent; it cannot prove the account works, the folder is
 * writable, the key and secret are the right way round, or that a delete
 * actually deletes. Those are the failures that reach a launch, and only a real
 * network call finds them.
 *
 * The pure-logic half did not disappear — it moved to `tests/media-storage.test.ts`,
 * which runs in `npm test` with no network and no credentials.
 *
 * =============================================================================
 * WHAT IT WRITES, AND WHY IT CANNOT COLLIDE WITH A REAL PHOTOGRAPH
 * =============================================================================
 * Two phases, two isolation strategies, both cleaned up in `finally`:
 *
 *   PHASE B writes to `commerce-insight/_verify/<run id>`. `keyFromResource()`
 *   rejects any public id with a nested path, so `npm run media:clean` cannot
 *   see this asset as an orphan and cannot delete anything real because of it.
 *
 *   PHASE C exercises the production path — `CloudinaryMediaStore` itself,
 *   through the `MediaStore` interface — using a key derived from the SHA-256
 *   of SYNTHETIC BYTES. Storage is content-addressed, so this key can only
 *   collide with a real photograph if that photograph is byte-identical to a
 *   1x1 PNG. It is not a naming convention that keeps these apart; it is the
 *   hash.
 *
 * =============================================================================
 * THE SECRET IS NEVER PRINTED
 * =============================================================================
 * Only the cloud name, the folder and the generated public ids are ever
 * written to the terminal. `readCloudinaryConfig()`'s rejection messages are
 * unit-tested to exclude the secret, and the store's own errors scrub it.
 *
 *   npm run verify:storage
 *
 * Exit code 0 ONLY when the complete round trip succeeded.
 */

import { existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import process from 'node:process';

import { readCloudinaryConfig, MEDIA_FOLDER, VERIFY_FOLDER, publicIdFor }
  from '../src/lib/media/cloudinary-config.ts';

/* ====================================================== environment ======= */

/**
 * Load the same files the application does, HIGHEST PRECEDENCE FIRST.
 *
 * `process.loadEnvFile` never overwrites a variable that is already set, so the
 * FIRST file read wins. `.env.local` therefore has to be read before `.env` to
 * match Next's precedence — reading them the other way round silently inverts
 * it. `scripts/create-admin.mjs` had exactly that bug and it is the reason this
 * comment exists rather than a one-line loop.
 */
function loadLocalEnv() {
  const loaded = [];
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
      loaded.push(file);
    }
  }
  return loaded;
}

/* ========================================================== reporting ===== */

let passed = 0;
let failed = 0;

function check(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return Boolean(condition);
}

function section(title) {
  console.log('');
  console.log(`=== ${title} ===`);
}

/** A 1x1 transparent PNG. Synthetic, valid, and 68 bytes. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** The status behind an SDK rejection, or 0 when it was not an API error. */
function statusOf(error) {
  return error?.http_code ?? error?.error?.http_code ?? 0;
}

/* ============================================================== main ====== */

const loadedFiles = loadLocalEnv();

console.log('========================================================');
console.log('MEDIA STORAGE VERIFICATION — Cloudinary, live round trip');
console.log('========================================================');
console.log(
  `Environment files : ${loadedFiles.length ? loadedFiles.join(', ') : 'none (using the real environment)'}`,
);

section('1. CONFIGURATION');

const verdict = readCloudinaryConfig();

if (verdict.state !== 'ready') {
  const explain = {
    absent:
      'None of CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET is set.\n' +
      'That is correct on a machine with no credentials — media goes to .media-store/ on disk —\n' +
      'but there is nothing for this check to talk to.',
    partial:
      verdict.state === 'partial'
        ? `Half configured. Missing: ${verdict.missing.join(', ')}.\n` +
          'All three together, or none of them. A partial configuration is refused at runtime\n' +
          'rather than falling back to local disk, which loses photographs at the next deploy.'
        : '',
    invalid: verdict.state === 'invalid' ? verdict.reason : '',
  }[verdict.state];

  check(false, 'Cloudinary credentials are configured', verdict.state);
  console.log('');
  console.log(explain);
  console.log('');
  console.log('========================================================');
  console.log('MEDIA STORAGE: NOT VERIFIED — no usable configuration.');
  console.log('========================================================');
  process.exit(1);
}

check(true, 'all three CLOUDINARY_* variables are present and well-formed');
// Cloud name and folder only. Never the key, never the secret.
console.log(`  Cloud             : ${verdict.config.cloudName}`);
console.log(`  Application folder: ${MEDIA_FOLDER}/`);
console.log(`  Verification folder: ${VERIFY_FOLDER}/`);

const { v2: cloudinary } = await import('cloudinary');
cloudinary.config({
  cloud_name: verdict.config.cloudName,
  api_key: verdict.config.apiKey,
  api_secret: verdict.config.apiSecret,
  secure: true,
});

/* Both of these are torn down in `finally`, whatever happens above them. */
const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const verifyPublicId = `${VERIFY_FOLDER}/${runId}`;
const syntheticKey = `${createHash('sha256').update(TINY_PNG).digest('hex').slice(0, 32)}.png`;
const storePublicId = publicIdFor(syntheticKey);

let store = null;

try {
  /* ---------------------------------------------------- phase B -------- */
  section('2. LIVE ROUND TRIP (isolated verification folder)');
  console.log(`  Test asset: ${verifyPublicId}`);

  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: verifyPublicId, resource_type: 'image', overwrite: true },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(TINY_PNG);
  });

  check(Boolean(uploaded), 'the upload returned a result');
  check(uploaded?.public_id === verifyPublicId, 'the asset carries the public id we asked for',
    uploaded?.public_id);
  check(uploaded?.format === 'png', 'the stored format is what we uploaded', uploaded?.format);
  check(
    typeof uploaded?.secure_url === 'string' && uploaded.secure_url.startsWith('https://'),
    'delivery is over https',
  );

  const found = await cloudinary.api.resource(verifyPublicId, { resource_type: 'image' });
  check(found?.public_id === verifyPublicId, 'the Admin API confirms the asset exists');
  check(found?.bytes === TINY_PNG.byteLength, 'the stored byte count matches what we sent',
    `${found?.bytes} bytes`);

  const fetched = await fetch(uploaded.secure_url, { signal: AbortSignal.timeout(20_000) });
  check(fetched.ok, 'the asset is retrievable from the CDN', `HTTP ${fetched.status}`);
  const roundTripped = Buffer.from(await fetched.arrayBuffer());
  check(
    roundTripped.equals(TINY_PNG),
    'THE BYTES THAT COME BACK ARE THE BYTES WE SENT — no transformation applied',
  );

  const destroyed = await cloudinary.uploader.destroy(verifyPublicId, {
    resource_type: 'image',
    invalidate: true,
  });
  check(destroyed?.result === 'ok', 'the delete reported success', destroyed?.result);

  let stillThere = true;
  try {
    await cloudinary.api.resource(verifyPublicId, { resource_type: 'image' });
  } catch (error) {
    stillThere = statusOf(error) !== 404;
  }
  check(!stillThere, 'the asset is GONE after deletion, confirmed by a second lookup');

  const again = await cloudinary.uploader.destroy(verifyPublicId, { resource_type: 'image' });
  check(
    again?.result === 'not found' || again?.result === 'ok',
    'deleting an already-deleted asset is not an error',
    again?.result,
  );

  /* ---------------------------------------------------- phase C -------- */
  section('3. THE PRODUCTION CODE PATH (CloudinaryMediaStore)');
  console.log(`  Synthetic key: ${syntheticKey}`);
  console.log(`  Public id    : ${storePublicId}`);

  const { CloudinaryMediaStore } = await import('../src/lib/media/cloudinary.ts');
  store = new CloudinaryMediaStore(verdict.config);

  check(
    !store.describe().includes(verdict.config.apiSecret),
    'describe() never contains the API secret',
    store.describe(),
  );

  check((await store.exists(syntheticKey)) === false, 'exists() is false before the upload');

  await store.put(syntheticKey, TINY_PNG, 'image/png');
  check(true, 'put() completed');
  check((await store.exists(syntheticKey)) === true, 'exists() is true after the upload');

  const got = await store.get(syntheticKey);
  check(got !== null, 'get() returned an object');
  check(got?.bytes?.equals(TINY_PNG) === true, 'get() returned the exact bytes that were stored');
  check(got?.contentType === 'image/png', 'get() reports the content type from the key',
    got?.contentType);

  const modified = await store.lastModified(syntheticKey);
  check(modified instanceof Date && !Number.isNaN(modified.getTime()),
    'lastModified() returns a real date', modified?.toISOString?.());

  const listed = await store.list();
  check(Array.isArray(listed), 'list() returns an array', `${listed.length} key(s)`);
  check(listed.includes(syntheticKey), 'list() includes the key we just wrote');
  check(
    listed.every((k) => /^[0-9a-f]{32}\.(jpg|png|webp|avif)$/.test(k)),
    'every key list() returns is a valid media key — nothing foreign was adopted',
  );

  await store.remove(syntheticKey);
  /*
    `exists()` is the authoritative check and it is immediate: the Admin API
    answers from Cloudinary itself.
  */
  check((await store.exists(syntheticKey)) === false, 'remove() actually removed it');

  /*
    ⚠ `get()` IS NOT ASSERTED TO BE NULL HERE, AND THAT IS A REAL PROPERTY.

    The first version of this check asserted it and FAILED against live
    Cloudinary: `get()` reads the delivery URL through the CDN, `remove()`
    passes `invalidate: true`, and that purge is asynchronous. So a just-deleted
    object is still served for a few minutes.

    Asserting null would be asserting something Cloudinary does not promise, and
    the suite would fail intermittently for a correct implementation. What IS
    worth holding is that the call stays well-behaved — a 404 must produce null
    rather than an exception, and a cached hit must produce real bytes rather
    than a malformed object. See the long note on `get()` in
    src/lib/media/cloudinary.ts for why the delay is acceptable.
  */
  const afterRemoval = await store.get(syntheticKey);
  check(
    afterRemoval === null || Buffer.isBuffer(afterRemoval.bytes),
    'get() after remove() is well-behaved (null, or a CDN copy pending invalidation)',
    afterRemoval === null ? 'already purged' : 'still cached at the CDN, as expected',
  );

  await store.remove(syntheticKey);
  check(true, 'remove() on an already-removed key is a no-op, not a crash');

  /* --------------------------------------------------- key safety ------ */
  section('4. KEY SAFETY ON THE LIVE STORE');

  for (const hostile of ['../../etc/passwd', 'commerce-insight/x', 'photo.jpg', '']) {
    let refused = false;
    try {
      await store.get(hostile);
    } catch (error) {
      refused = /did not issue/.test(String(error?.message));
    }
    check(refused, `a key we did not issue is refused: ${JSON.stringify(hostile)}`);
  }
} catch (error) {
  failed += 1;
  console.log('');
  console.log('  FAIL  the round trip threw');
  // The store scrubs the secret from its own errors; the SDK does not include
  // it. Printing the message is what makes a 401 diagnosable.
  console.log(`        ${String(error?.message ?? error)}`);
} finally {
  /*
    CLEAN UP WHATEVER SURVIVED, ALWAYS.

    A failure between upload and delete leaves an asset behind, and the whole
    point of a verification is that it does not litter the account it is
    checking. Both deletes are idempotent and neither is allowed to mask the
    real failure, so errors here are swallowed after being reported.
  */
  section('5. CLEANUP');
  for (const [label, publicId] of [
    ['verification asset', verifyPublicId],
    ['production-path asset', storePublicId],
  ]) {
    try {
      const outcome = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      console.log(`  ${label}: ${outcome?.result ?? 'unknown'} (${publicId})`);
    } catch (error) {
      console.log(`  ${label}: CLEANUP FAILED (${publicId}) — ${String(error?.message ?? error)}`);
      console.log('  ⚠ Delete it by hand in the Cloudinary console.');
    }
  }
}

console.log('');
console.log('========================================================');
console.log(`MEDIA STORAGE: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('');
  console.log('Cloudinary is reachable, writable, readable and deletable');
  console.log('with the configured credentials, and the bytes round-trip');
  console.log('unmodified. Nothing was left behind.');
}
console.log('========================================================');

process.exit(failed === 0 ? 0 : 1);
