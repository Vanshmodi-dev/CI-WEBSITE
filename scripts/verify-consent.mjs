/**
 * "Please take my child's photograph down."
 *
 * =============================================================================
 * WHY THIS SUITE EXISTS SEPARATELY FROM THE ENTITY SUITES
 * =============================================================================
 * `verify-gallery` proves a gallery photograph can be withdrawn. Nothing proved
 * the same for a student RESULT or a STORY, and those are the two records that
 * carry a named child's face. The flow is also the one the institute will
 * actually be asked to perform, by a parent, on the phone, in a hurry — so it
 * is tested as one journey rather than as three unrelated assertions.
 *
 * Every withdrawal here goes through the REAL admin form: the checkbox a
 * teacher would untick, then Save. Nothing writes `consentPhoto` directly,
 * because the question is not whether the column can change — it is whether the
 * person answering the phone can make the photograph disappear.
 *
 * ⚠ WHAT THIS SUITE DELIBERATELY DOES NOT CLAIM.
 *
 * Withdrawing consent removes the photograph from every page. It does NOT
 * delete the bytes: the object stays addressable at its own content-hash URL
 * until somebody deletes it in the photo library, which is a second, explicit
 * action. Section 4 asserts that plainly rather than glossing over it, because
 * a parent asking for a photograph to be "taken down" usually means the bytes
 * as well, and the person handling the request needs to know it is two steps.
 * The complete procedure is written up in docs/DEPLOYMENT-HUMAN-CHECKLIST.md.
 *
 * Usage:
 *   DATABASE_URL=... ADMIN_PASSWORD=... BASE_URL=http://localhost:3000  *     node scripts/verify-consent.mjs
 */

import { env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { launch } from '../scripts/browser.mjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

const BASE = env.BASE_URL ?? 'http://localhost:3000';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
const browser = await launch('chrome');
const page = await browser.page();

let pass = 0;
let fail = 0;
const failures = [];
const check = (ok, name, detail = '') => {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

await page.goto(`${BASE}/admin/login`);
await page.type('input[type=email]', env.ADMIN_EMAIL ?? 'admin@localhost.invalid');
await page.type('input[type=password]', env.ADMIN_PASSWORD);
await page.submitForm('input[type=password]', 4000);

const anon = async (p) => (await fetch(BASE + p, { headers: { 'cache-control': 'no-cache' } })).text();
/*
  Selected by NAME rather than by id. The gallery form gives its consent boxes
  stable ids (`g-consentPhoto`); the student and story forms do not, because the
  shared Checkbox primitive wraps the input in its label and needs no id/htmlFor
  pairing to be accessible. `name` is what the form actually submits and is
  present on all of them, so it is the one selector that works everywhere.
*/
const untick = async (name) =>
  page.eval(
    `(() => { const c = document.querySelector('input[type=checkbox][name=' + ${JSON.stringify(JSON.stringify(name))} + ']'); if (!c) return 'MISSING'; if (c.checked) c.click(); return String(c.checked); })()`,
  );

/* Upload one photograph and reuse it, so the run costs one upload. */
const IMG = fileURLToPath(new URL('../public/zzshow-media/zzshow-gallery-02.png', import.meta.url));
await page.goto(`${BASE}/admin/gallery/new`);
await page.setFileInput('input[type=file]:not([capture])', [IMG]);
await page.eval('new Promise((r) => setTimeout(r, 3000))', true);
const PHOTO = await page.eval("document.querySelector('input[name=imageUrl]').value");
check(Boolean(PHOTO), 'setup: uploaded one photograph to withdraw', PHOTO);

/* ============================ 1 · A PUBLISHED RESULT WITH A PHOTOGRAPH ==== */
console.log('\n=== 1. A STUDENT RESULT ===');
{
  const topper = await prisma.topper.create({
    data: {
      studentName: 'ZZWDR Result Child', programme: 'CLASS_12', year: 2026,
      score: 95, scoreUnit: 'percent', photoUrl: PHOTO,
      displayNameMode: 'FULL', consentName: true, consentPhoto: true,
      consentResult: true, consentRef: 'ZZWDR-FORM-R', published: true, publishedAt: new Date(),
    },
    select: { id: true },
  });

  let html = await anon('/results');
  check(html.includes(PHOTO.split('/').pop()), 'control: the photograph is on /results before withdrawal');

  // The parent asks. The teacher unticks the photograph permission and saves.
  await page.goto(`${BASE}/admin/students/${topper.id}`);
  const before = await untick('consentPhoto');
  check(before === 'false', 'the photograph permission was unticked in the real form', String(before));
  await page.submitForm('input[name=studentName]', 3500);

  const row = await prisma.topper.findUnique({ where: { id: topper.id } });
  check(row?.consentPhoto === false, 'the database records the withdrawal', String(row?.consentPhoto));

  html = await anon('/results');
  check(!html.includes(PHOTO.split('/').pop()), 'THE PHOTOGRAPH IS GONE from /results');
  check(html.includes('ZZWDR Result Child') || row?.published === false,
    'context: the result itself is still handled per its own permissions');

  await prisma.topper.delete({ where: { id: topper.id } });
}

/* ============================ 2 · A PUBLISHED STORY WITH A PHOTOGRAPH ==== */
console.log('\n=== 2. A STUDENT STORY ===');
{
  const story = await prisma.studentStory.create({
    data: {
      slug: 'zzwdr-story-' + Date.now(), studentName: 'ZZWDR Story Child',
      programme: 'CLASS_12', year: 2026,
      challenge: 'ZZWDR challenge.', journey: 'ZZWDR journey.', outcome: 'ZZWDR outcome.',
      photoUrl: PHOTO, displayNameMode: 'FULL', consentRef: 'ZZWDR-FORM-S',
      consentStory: true, consentName: true, consentPhoto: true, published: true, publishedAt: new Date(),
    },
    select: { id: true },
  });

  let html = await anon('/stories');
  check(html.includes(PHOTO.split('/').pop()), 'control: the photograph is on /stories before withdrawal');

  await page.goto(`${BASE}/admin/stories/${story.id}`);
  const storyUnticked = await untick('consentPhoto');
  check(storyUnticked === 'false', 'the photograph permission was unticked in the real form', String(storyUnticked));
  await page.submitForm('input[name=studentName]', 3500);

  const row = await prisma.studentStory.findUnique({ where: { id: story.id } });
  check(row?.consentPhoto === false, 'the database records the withdrawal', String(row?.consentPhoto));

  html = await anon('/stories');
  check(!html.includes(PHOTO.split('/').pop()), 'THE PHOTOGRAPH IS GONE from /stories');

  await prisma.studentStory.delete({ where: { id: story.id } });
}

/* ================================ 3 · A GALLERY PHOTOGRAPH OF PEOPLE ===== */
console.log('\n=== 3. A GALLERY PHOTOGRAPH ===');
{
  const item = await prisma.galleryItem.create({
    data: {
      imageUrl: PHOTO, alt: 'ZZWDR gallery children at a prize-giving',
      category: 'EVENTS', showsPeople: true, consentRef: 'ZZWDR-FORM-1',
      consentPhoto: true, published: true, priority: 0,
    },
    select: { id: true },
  });

  let html = await anon('/gallery');
  check(html.includes(PHOTO.split('/').pop()), 'control: the photograph is on /gallery before withdrawal');

  await page.goto(`${BASE}/admin/gallery/${item.id}`);
  await untick('consentPhoto');
  await page.submitForm('input[name=alt]', 3500);

  const row = await prisma.galleryItem.findUnique({ where: { id: item.id } });
  check(row?.consentPhoto === false, 'the database records the withdrawal', String(row?.consentPhoto));
  check(row?.published === false, 'and the entry was taken off the website with it', String(row?.published));

  html = await anon('/gallery');
  check(!html.includes(PHOTO.split('/').pop()), 'THE PHOTOGRAPH IS GONE from /gallery');

  await prisma.galleryItem.delete({ where: { id: item.id } });
}

/* ==================== 4 · THE PHOTOGRAPH IS STILL SERVED, AND SHOULD IT BE? */
console.log('\n=== 4. THE OBJECT ITSELF ===');
{
  const res = await fetch(BASE + PHOTO);
  console.log(`    GET ${PHOTO} -> ${res.status}`);
  console.log(
    '    NOTE: the bytes remain addressable by their content hash until the ' +
      'photo is deleted in the library. Nothing on the site links to them.',
  );
  check(res.status === 200, 'context: the object is still retrievable by its exact URL');
}

/* ================================= 5 · A STALE ADMIN TAB CANNOT UNDO IT === */
console.log('\n=== 5. A STALE TAB CANNOT PUT IT BACK ===');
{
  const item = await prisma.galleryItem.create({
    data: {
      imageUrl: PHOTO, alt: 'ZZWDR stale tab subject', category: 'EVENTS',
      showsPeople: true, consentRef: 'ZZWDR-FORM-2', consentPhoto: true,
      published: true, priority: 0,
    },
    select: { id: true },
  });

  // Tab A opens the form while everything is still consented.
  await page.goto(`${BASE}/admin/gallery/${item.id}`);
  const token = await page.eval("document.querySelector('[name=editedAt]').value");
  check(token.length > 0, 'control: the stale tab holds a version token', token.slice(0, 20));

  // Consent is withdrawn elsewhere.
  await prisma.galleryItem.update({
    where: { id: item.id },
    data: { consentPhoto: false, published: false },
  });

  // Tab A saves, unchanged — every box still ticked as it was loaded.
  await page.submitForm('input[name=alt]', 3500);

  const row = await prisma.galleryItem.findUnique({ where: { id: item.id } });
  check(row?.consentPhoto === false, 'the stale save did NOT restore the permission', String(row?.consentPhoto));
  check(row?.published === false, 'and did NOT put the photograph back on the website', String(row?.published));

  const html = await anon('/gallery');
  check(!html.includes('ZZWDR stale tab subject'), 'a visitor still cannot see it');

  await prisma.galleryItem.delete({ where: { id: item.id } });
}

/* ---------------------------------------------------------------- clean -- */
await prisma.topper.deleteMany({ where: { studentName: { startsWith: 'ZZWDR' } } });
await prisma.studentStory.deleteMany({ where: { studentName: { startsWith: 'ZZWDR' } } });
await prisma.galleryItem.deleteMany({ where: { alt: { startsWith: 'ZZWDR' } } });
const key = PHOTO.replace('/media/', '');
await prisma.mediaAsset.deleteMany({ where: { key } });

console.log(`\n=== CONSENT WITHDRAWAL: ${pass} passed, ${fail} failed ===`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}

await page.close();
await browser.close();
await prisma.$disconnect();
exit(fail === 0 ? 0 : 1);
