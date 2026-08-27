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
import { readdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { isMediaKey, keyFromPath, mediaPath } from '../src/lib/media/format.ts';

const CLEAN = argv.includes('--clean');
const ROOT = path.join(process.cwd(), '.media-store');

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
    return (await readdir(ROOT)).filter((entry) => isMediaKey(entry));
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
console.log(`  store            ${ROOT}`);
console.log(`  files on disk    ${files.length}`);
console.log(`  rows recorded    ${rows.length}`);
console.log(`  referenced keys  ${referencedBy.size}`);

console.log('\n--- orphan files (stored, no row) ---');
if (orphanFiles.length === 0) console.log('  none');
for (const key of orphanFiles) {
  let size = 0;
  try {
    size = (await stat(path.join(ROOT, key))).size;
  } catch {
    /* raced with a delete; the size is cosmetic */
  }
  console.log(`  ${key}  ${Math.round(size / 1024)} KB`);
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
  for (const key of orphanFiles) {
    await unlink(path.join(ROOT, key)).catch(() => {});
    await unlink(path.join(ROOT, `${key}.json`)).catch(() => {});
    removed += 1;
    console.log(`  removed ${key}`);
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
