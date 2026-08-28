/**
 * Reconcile what is stored against what is referenced.
 *
 * =============================================================================
 * WHY THIS EXISTS, AND WHY IT IS NOT DECORATION
 * =============================================================================
 * There is no transaction spanning PostgreSQL and a file store. Deleting a
 * photograph is therefore two operations that can half-succeed, and the ORDER
 * chosen in `admin/media/actions.ts` decides which half-failure is possible:
 * the database row goes first, so a failure leaves an ORPHAN FILE rather than a
 * broken reference. An orphan costs disk and is invisible; a reference pointing
 * at missing bytes is a broken image on a live page.
 *
 * That trade is only defensible if something actually reclaims the orphans.
 * This is that something.
 *
 * It reports four states, and each one means something different:
 *
 *   ORPHAN FILE      stored, no row. Safe to remove. The expected residue of a
 *                    half-failed deletion.
 *   MISSING FILE     row exists, bytes gone. A broken image if anything uses
 *                    it. Never deleted automatically - the row is the only
 *                    remaining evidence of what was lost.
 *   BROKEN REFERENCE a student or story points at a path with no stored file.
 *                    The serious one: a visitor sees a broken image.
 *   UNREFERENCED     stored and recorded, but nothing uses it. NOT a fault -
 *                    a library is allowed to hold photographs not yet placed.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/media-audit.mjs           # report only
 *   DATABASE_URL=... node scripts/media-audit.mjs --clean   # remove orphan FILES
 */

import { env, argv, exit } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { keyFromPath, mediaPath } from '../src/lib/media/format.ts';
import { getMediaStore } from '../src/lib/media/store.ts';

const CLEAN = argv.includes('--clean');
/*
  ⚠ THROUGH THE STORE, NOT THROUGH THE FILESYSTEM.

  This script used to `readdir` a hard-coded `.media-store` directory and
  `unlink` out of it. That worked for exactly one deployment shape — a machine
  keeping its own disk — and would have been silently useless the moment
  photographs moved to object storage: every stored object would have been
  reported as a MISSING FILE, and `--clean` would have had nothing to clean
  while real orphans accumulated in the bucket.

  Going through `getMediaStore()` means the audit follows the photographs
  wherever they actually live.

  Run with the react-server condition, so `server-only` resolves to its empty
  module:

    node --conditions=react-server scripts/media-audit.mjs
*/
const store = getMediaStore();

/**
 * How recently uploaded an object has to be before cleanup leaves it alone.
 *
 * ⚠ THIS CLOSES A REAL RACE.
 *
 * An upload writes the OBJECT first and the database row second — deliberately,
 * so that a half-failure leaves a recoverable orphan rather than a broken
 * reference. The consequence is that between those two steps a perfectly good
 * photograph is indistinguishable from an orphan, and a `--clean` running at
 * that moment would delete a photograph the teacher had just been told was
 * saved.
 *
 * An hour is far longer than the window really is (milliseconds locally, a
 * network round trip remotely) and costs nothing: an orphan that survives one
 * extra hour is an orphan cleaned on the next run.
 */
const GRACE_MS = 60 * 60 * 1000;

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/** Keys physically present. Sidecar `.json` files are ignored. */
async function storedKeys() {
  try {
    return await store.list();
  } catch {
    return [];
  }
}

const [files, rows, toppers, stories, faculty, gallery] = await Promise.all([
  storedKeys(),
  prisma.mediaAsset.findMany({ select: { key: true, originalName: true, bytes: true } }),
  prisma.topper.findMany({
    where: { photoUrl: { not: null } },
    select: { id: true, photoUrl: true },
  }),
  prisma.studentStory.findMany({
    where: { photoUrl: { not: null } },
    select: { id: true, photoUrl: true },
  }),
  /*
    FACULTY AND GALLERY WERE MISSING FROM THIS SCAN.

    Faculty gained a `photoUrl` in Topic 6 and was never added here, so every
    faculty photograph was reported as "unreferenced, nothing uses it" and a
    faculty record pointing at a file that no longer exists could never be
    reported as a BROKEN REFERENCE - which is the one state this script exists
    to fail on. No data was lost, because `--clean` only removes orphan FILES
    and never acts on the unreferenced list, but the safety net had a hole in it
    exactly the size of one table.

    Topic 8 would have added a second hole. Both are closed here.
  */
  prisma.faculty.findMany({
    where: { photoUrl: { not: null } },
    select: { id: true, photoUrl: true },
  }),
  /* Gallery's column is `imageUrl`; it is mapped to the shape this loop
     reads rather than the loop growing a special case. */
  prisma.galleryItem
    .findMany({ select: { id: true, imageUrl: true } })
    .then((rows) => rows.map((r) => ({ id: r.id, photoUrl: r.imageUrl }))),
]);

const stored = new Set(files);
const recorded = new Set(rows.map((r) => r.key));

/** Every key any record points at, and who points at it. */
const referencedBy = new Map();
for (const [kind, list] of [
  ['result', toppers],
  ['story', stories],
  ['faculty', faculty],
  ['gallery', gallery],
]) {
  for (const record of list) {
    const key = keyFromPath(record.photoUrl);
    /*
      A photoUrl that is NOT a /media/ path is not a fault: paths under
      /zzshow-media/ and /photos/ predate the upload system and are legitimate
      static files. Only /media/ keys are this store's responsibility.
    */
    if (!key) continue;
    if (!referencedBy.has(key)) referencedBy.set(key, []);
    referencedBy.get(key).push(`${kind}:${record.id}`);
  }
}

const orphanFiles = files.filter((key) => !recorded.has(key));
const missingFiles = rows.filter((row) => !stored.has(row.key));
const brokenRefs = [...referencedBy.entries()].filter(([key]) => !stored.has(key));
const unreferenced = rows.filter((row) => !referencedBy.has(row.key));

console.log('\n=== MEDIA AUDIT ===');
console.log(`  store            ${store.describe()}`);
console.log(`  files on disk    ${files.length}`);
console.log(`  rows recorded    ${rows.length}`);
console.log(`  referenced keys  ${referencedBy.size}`);

console.log('\n--- orphan files (stored, no row) ---');
if (orphanFiles.length === 0) console.log('  none');
const now = Date.now();
const orphanAges = new Map();
for (const key of orphanFiles) {
  const when = await store.lastModified(key).catch(() => null);
  orphanAges.set(key, when);
  const age = when ? `${Math.round((now - when.getTime()) / 60000)} min old` : 'age unknown';
  console.log(`  ${key}  ${age}`);
}

console.log('\n--- missing files (row exists, bytes gone) ---');
if (missingFiles.length === 0) console.log('  none');
for (const row of missingFiles) console.log(`  ${row.key}  "${row.originalName}"`);

console.log('\n--- BROKEN REFERENCES (a record points at nothing) ---');
if (brokenRefs.length === 0) console.log('  none');
for (const [key, users] of brokenRefs) {
  console.log(`  ${mediaPath(key)}  used by ${users.join(', ')}`);
}

console.log('\n--- unreferenced (recorded, nothing uses it) ---');
console.log(`  ${unreferenced.length} photo(s). This is normal: a library may hold`);
console.log('  photographs that have not been placed on a record yet.');

if (CLEAN) {
  console.log('\n--- cleaning orphan FILES ---');
  /*
    Only orphan files are removed, and only orphan files.

    A missing-file row is NOT deleted: the row is the last remaining record
    that the photograph ever existed, and destroying it turns a recoverable
    problem into an unanswerable one. A broken reference is not "fixed" either
    - blanking a record's photoUrl is an editorial decision about somebody's
    published page, not a job for a cleanup script.
  */
  let removed = 0;
  let skipped = 0;
  for (const key of orphanFiles) {
    /*
      An object younger than the grace period may be an upload in flight, whose
      database row is about to be written. Age unknown is treated the same way:
      when the store cannot say how old something is, the safe answer is to
      leave it and report it, not to delete it.
    */
    const when = orphanAges.get(key) ?? null;
    if (!when || now - when.getTime() < GRACE_MS) {
      skipped += 1;
      console.log(`  kept    ${key}  (uploaded too recently to be sure it is an orphan)`);
      continue;
    }
    await store.remove(key).catch(() => {});
    removed += 1;
    console.log(`  removed ${key}`);
  }
  if (skipped > 0) {
    console.log(`\n  ${skipped} recent orphan(s) left alone. Re-run later to reclaim them.`);
  }
  console.log(`  ${removed} orphan file(s) removed`);
} else if (orphanFiles.length > 0) {
  console.log('\n  Re-run with --clean to remove the orphan files listed above.');
}

await prisma.$disconnect();

/*
  A broken reference is the only state that fails this script. The others are
  either normal or merely untidy, and a cleanup tool that exits non-zero for
  untidiness gets ignored.
*/
const failed = brokenRefs.length > 0;
console.log(
  `\n=== RESULT: ${failed ? 'BROKEN REFERENCES FOUND' : 'no broken references'} ===\n`,
);
exit(failed ? 1 : 0);
