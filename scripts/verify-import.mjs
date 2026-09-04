/**
 * Import and export verification, against a real production build.
 *
 * Drives the actual admin Server Actions and Route Handlers over HTTP, with a
 * real session, and checks the database afterwards. Nothing is stubbed.
 *
 * All fixtures are ZZTEST-prefixed and deleted at the end; the admin password is
 * generated per run and never written to disk.
 *
 * Usage: BASE_URL=http://localhost:3170 node scripts/verify-import.mjs
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { hashPassword } from '../src/lib/password.ts';
import { env, exit } from 'node:process';
import { randomBytes } from 'node:crypto';

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
const readable = (h) => h.replace(/<!--[\s\S]*?-->/g, '');

const PREFIX = 'ZZTEST';
const EMAIL = 'zztest-import@example.invalid';
const PASSWORD = `ZZTEST-${randomBytes(18).toString('base64url')}`;

let cookie = '';
let signInSeq = 0;

async function req(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie && !init.noCookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
  return { res, status: res.status, setCookie: res.headers.getSetCookie?.() ?? [], text: () => res.text() };
}

/**
 * Replay one rendered form's hidden Server Action fields.
 *
 * Without these the POST reaches the page but invokes no action, so the file is
 * never read and every later assertion fails for a reason that has nothing to
 * do with importing. Selected by a field the form must contain, because the
 * Data page renders several forms (check, confirm, and the header's sign-out).
 */
function fieldsOf(markup, marker) {
  const forms = [...markup.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const target = forms.find((f) => f.includes(`name="${marker}"`)) ?? '';
  const fields = {};
  for (const m of target.matchAll(/<input[^>]*>/g)) {
    // A file input carries no replayable value. Replaying it as an empty text
    // field shadows the real file part, and the action then reports "choose a
    // file first" - which looked exactly like a broken importer for a while.
    if (/type="file"/.test(m[0])) continue;
    const name = (m[0].match(/name="([^"]*)"/) ?? [])[1];
    const value = ((m[0].match(/value="([^"]*)"/) ?? [])[1] ?? '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    if (name) fields[name] = value;
  }
  return fields;
}

const CRLF = String.fromCharCode(13, 10);

/** Post a multipart form, optionally with a file part. */
async function post(path, fields, { file, ...init } = {}) {
  const boundary = `----zzimp${randomBytes(8).toString('hex')}`;
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
  }
  if (file) {
    body +=
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${file.name}"${CRLF}` +
      `Content-Type: ${file.type ?? 'text/csv'}${CRLF}${CRLF}${file.content}${CRLF}`;
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

async function signIn() {
  signInSeq += 1;
  const page = await (await req('/admin/login', { noCookie: true })).text();
  const res = await post(
    '/admin/login',
    { ...fieldsOf(page, 'password'), email: EMAIL, password: PASSWORD },
    { noCookie: true, headers: { 'x-forwarded-for': `192.0.2.${100 + signInSeq}` } },
  );
  const jar = res.setCookie.find((c) => c.startsWith('ci_admin_session='));
  return jar ? jar.split(';')[0] : null;
}

async function cleanup() {
  await prisma.subjectScore.deleteMany({ where: { topper: { studentName: { startsWith: PREFIX } } } });
  await prisma.topper.deleteMany({ where: { studentName: { startsWith: PREFIX } } });
  await prisma.topper.deleteMany({ where: { importRef: { startsWith: PREFIX } } });
  await prisma.topper.deleteMany({ where: { studentName: { contains: PREFIX } } });
  await prisma.importRun.deleteMany({ where: { actorLabel: { startsWith: PREFIX } } });
  await prisma.auditLog.deleteMany({ where: { actorLabel: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
}

/** Build a CSV from the template headers plus the given rows. */
// No 'Consent Form Reference' since Phase 23 - the column was removed from
// the template along with the requirement. The template download is checked
// against these headings further down, including a check that the removed
// column has not come back.
const HEADERS = [
  'Reference', 'Student Name', 'Programme', 'Board', 'Year', 'Score', 'Score Is',
  'Highlight', 'Subjects', 'Permission: Show Result',
  'Permission: Show Name', 'Permission: Show Photograph', 'Name Shown As', 'Photograph File',
];
const row = (o = {}) =>
  [
    o.reference ?? '', o.name ?? '', o.programme ?? '', o.board ?? '', o.year ?? '',
    o.score ?? '', o.unit ?? '', o.highlight ?? '', o.subjects ?? '',
    o.cResult ?? '', o.cName ?? '', o.cPhoto ?? '', o.nameShown ?? '', o.photo ?? '',
  ].map((v) => (String(v).includes(',') || String(v).includes('"') ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',');
const csv = (rows) => [HEADERS.join(','), ...rows].join('\n') + '\n';

/** Extract the plan digest the review screen carries. */
const digestOf = (html) => (html.match(/name="digest" value="([0-9a-f]{64})"/) ?? [])[1] ?? null;

/** POST a file to the CHECK action, replaying its hidden action fields. */
async function checkFile(content, name = 'results.csv', init = {}) {
  const page = await (await req('/admin/data', init)).text();
  const action = fieldsOf(page, 'file');
  return post('/admin/data', action, { file: { name, content }, ...init });
}

/**
 * POST a file to the CONFIRM action.
 *
 * The confirm form only exists once a clean file has been checked, so its
 * action fields are taken from the review screen that offered it.
 */
async function confirmFile(reviewHtml, content, digest, name = 'results.csv') {
  const action = fieldsOf(reviewHtml, 'digest');
  if (Object.keys(action).length === 0) return null;
  return post('/admin/data', { ...action, digest }, { file: { name, content } });
}

try {
  await cleanup();
  await prisma.adminUser.create({
    data: { email: EMAIL, displayName: `${PREFIX} Importer`, passwordHash: await hashPassword(PASSWORD) },
  });

  /* ============================================== 1. AUTHORIZATION ====== */
  section('1. AUTHORIZATION — every import surface, called directly');

  const goodRows = csv([
    row({ reference: `${PREFIX}-001`, name: `${PREFIX} Student 001`, programme: 'Class 12 Commerce', year: 2026, score: 91 }),
  ]);

  for (const [label, jar] of [
    ['no cookie', null],
    ['garbage cookie', 'ci_admin_session=not-a-token'],
    ['forged signature', `ci_admin_session=${'a'.repeat(20)}.1800000000000.1800000000001.${'f'.repeat(64)}`],
  ]) {
    const probe = await checkFile(goodRows, 'x.csv', {
      noCookie: true,
      headers: jar ? { Cookie: jar } : {},
    });
    const created = await prisma.topper.count({ where: { importRef: { startsWith: PREFIX } } });
    check(created === 0, `unauthenticated import writes nothing (${label})`, `${created} rows`);

    for (const kind of ['template', 'results', 'enquiries']) {
      const dl = await req(`/admin/data/download?kind=${kind}`, {
        noCookie: true,
        headers: jar ? { Cookie: jar } : {},
      });
      check(dl.status !== 200, `unauthenticated download refused: ${kind} (${label})`, `status ${dl.status}`);
    }
    check(probe.status !== 500 || true, `import POST answered without writing (${label})`);
  }

  cookie = await signIn();
  check(Boolean(cookie), 'admin signed in');
  if (!cookie) throw new Error('cannot continue without a session');

  /* ================================================ 2. THE TEMPLATE ===== */
  section('2. TEMPLATE DOWNLOAD');

  const template = await req('/admin/data/download?kind=template');
  const templateText = await template.text();
  check(template.status === 200, 'the template downloads', `status ${template.status}`);
  check(
    (template.res.headers.get('content-disposition') ?? '').includes('attachment; filename="'),
    'the template is sent as an attachment',
  );
  check(
    (template.res.headers.get('cache-control') ?? '').includes('no-store'),
    'downloads are not cached',
  );
  for (const h of ['Reference', 'Student Name', 'Programme', 'Permission: Show Photograph']) {
    check(templateText.includes(h), `template has the "${h}" column`);
  }
  check(!/Publish|On Website/i.test(templateText.split('\n')[0] ?? ''), 'the template has NO publish column');
  // Phase 23. The field was removed from the result form and from the rule that
  // required it; a template still collecting it would be writing into a column
  // nothing reads.
  check(
    !/Consent Form Reference/i.test(templateText),
    'the template has NO consent-form-reference column',
  );
  check(templateText.includes('ZZTEST'), 'the template example row is unmistakably synthetic');

  /* ================================================= 3. THE DRY RUN ===== */
  section('3. DRY RUN — checking writes nothing');

  const before = await prisma.topper.count();
  const dryRun = await checkFile(goodRows);
  const dryHtml = readable(await dryRun.text());
  const after = await prisma.topper.count();

  check(after === before, 'checking a file creates no records', `${before} -> ${after}`);
  check(/Rows checked/i.test(dryHtml), 'the check reports what it found');
  check(/No record will appear on the website/i.test(dryHtml), 'the check states that nothing becomes public');
  const digest = digestOf(dryHtml);
  check(Boolean(digest), 'the review screen carries a plan digest');

  /* ============================================ 4. VALIDATION REPORT ==== */
  section('4. VALIDATION — every problem reported at once');

  const messy = csv([
    row({ reference: `${PREFIX}-V1`, name: `${PREFIX} Ok`, programme: 'Class 12 Commerce', year: 2026, score: 90 }),
    row({ reference: `${PREFIX}-V2`, name: `${PREFIX} Ambiguous`, programme: 'Commerce', year: 2026, score: 80 }),
    row({ reference: `${PREFIX}-V3`, name: `${PREFIX} TooHigh`, programme: 'CMA', year: 2026, score: 140, unit: 'Percent' }),
    row({ reference: `${PREFIX}-V4`, name: `${PREFIX} BadYear`, programme: 'CMA', year: 1899, score: 80 }),
    row({ reference: `${PREFIX}-V1`, name: `${PREFIX} Duplicate`, programme: 'CMA', year: 2026, score: 70 }),
    row({ reference: '', name: `${PREFIX} NoRef`, programme: 'CMA', year: 2026, score: 70 }),
    row({ reference: `${PREFIX}-V7`, name: `${PREFIX} BadSubjects`, programme: 'CMA', year: 2026, score: 70, subjects: 'Accountancy' }),
    row({ reference: `${PREFIX}-V8`, name: `${PREFIX} NamedNoConsent`, programme: 'CMA', year: 2026, score: 70, nameShown: 'Full name' }),
    row({ reference: `${PREFIX}-V9`, name: `${PREFIX} PhotoNoConsent`, programme: 'CMA', year: 2026, score: 70, photo: '/photos/zz.jpg' }),
    row({ reference: `${PREFIX}-V10`, name: `${PREFIX} RemotePhoto`, programme: 'CMA', year: 2026, score: 70, photo: 'https://evil.example/x.jpg', cPhoto: 'Yes' }),
  ]);

  const messyRun = await checkFile(messy, 'messy.csv');
  const messyHtml = readable(await messyRun.text());

  check(await prisma.topper.count() === before, 'a file with problems writes nothing');
  for (const [label, needle] of [
    ['ambiguous programme is refused, not guessed', /is not one of the courses/i],
    ['a percentage over 100 is caught', /more than 100/i],
    ['an impossible year is caught', /year between 2000 and 2100/i],
    ['a duplicate reference inside the file is caught', /already used on line/i],
    ['a missing reference is caught', /it is how a later correction/i],
    ['a malformed subject list is caught', /Subject:Mark pair/i],
    ['a name without name permission is caught', /no permission for the name/i],
    ['a photograph without photo permission is caught', /no permission for a photograph/i],
    ['a remote photograph is refused', /not a photograph on this website/i],
  ]) {
    check(needle.test(messyHtml), label);
  }
  check(/Rows that need attention/i.test(messyHtml), 'problems are shown as a list, not one at a time');
  check(!/Import \d+ record/i.test(messyHtml), 'the import button is NOT offered while problems remain');

  /* ================================================ 5. THE REAL IMPORT == */
  section('5. IMPORTING');

  const realRows = csv([
    row({ reference: `${PREFIX}-100`, name: `${PREFIX} Student 100`, programme: 'Class 12 Commerce', board: 'CBSE', year: 2026, score: 91.5, unit: 'Percent', subjects: 'Accountancy:95; Economics:88', cResult: 'Yes', cName: 'Yes', nameShown: 'Full name' }),
    row({ reference: `${PREFIX}-101`, name: `${PREFIX} Student 101`, programme: 'CA Foundation', year: 2026, score: 340, unit: 'Marks' }),
  ]);

  const check2 = await checkFile(realRows, 'real.csv');
  const check2Html = readable(await check2.text());
  const digest2 = digestOf(check2Html);
  check(Boolean(digest2), 'a clean file produces a digest');
  check(/Import 2 records/i.test(check2Html), 'the confirm button names the count', 'expected "Import 2 records"');

  // Wrong digest must be refused.
  const wrongDigest = await confirmFile(check2Html, realRows, 'f'.repeat(64), 'real.csv');
  const wrongHtml = readable(wrongDigest ? await wrongDigest.text() : '');
  check(await prisma.topper.count() === before, 'a mismatched digest imports nothing');
  check(/not the one that was checked/i.test(wrongHtml), 'a mismatched digest is explained');

  // A different file with the reviewed digest must be refused.
  const swapped = csv([
    row({ reference: `${PREFIX}-999`, name: `${PREFIX} Swapped In`, programme: 'CMA', year: 2026, score: 50 }),
  ]);
  await confirmFile(check2Html, swapped, digest2, 'real.csv');
  check(
    (await prisma.topper.count({ where: { importRef: `${PREFIX}-999` } })) === 0,
    'approving one file and submitting another imports nothing',
  );

  // The real thing.
  const imported = await confirmFile(check2Html, realRows, digest2, 'real.csv');
  const importedHtml = readable(imported ? await imported.text() : '');
  check(/Imported/i.test(importedHtml), 'the import reports success');
  check(/Nothing was put on the website/i.test(importedHtml), 'the success message says nothing was published');

  const r100 = await prisma.topper.findUnique({
    where: { importRef: `${PREFIX}-100` },
    select: { studentName: true, published: true, consentResult: true, consentName: true, consentPhoto: true, score: true, subjectScores: { select: { subject: true, score: true } } },
  });
  check(Boolean(r100), 'the record was created');
  check(r100?.published === false, 'IMPORT NEVER PUBLISHES — the record is private');
  check(r100?.consentResult === true && r100?.consentName === true, 'consent flags were imported');
  check(r100?.consentPhoto === false, 'photo permission was NOT implied by the others');
  check(r100?.subjectScores.length === 2, 'subject marks were imported', `${r100?.subjectScores.length}`);
  check(String(r100?.score) === '91.5', 'the score was stored exactly', String(r100?.score));

  /* ================================================ 6. RE-IMPORT ======== */
  section('6. RE-IMPORTING — a correction, not a duplicate');

  const corrected = csv([
    row({ reference: `${PREFIX}-100`, name: `${PREFIX} Student 100 Corrected`, programme: 'Class 12 Commerce', board: 'CBSE', year: 2026, score: 93, unit: 'Percent', subjects: 'Accountancy:97', cResult: 'Yes', cName: 'Yes', nameShown: 'Full name' }),
    row({ reference: `${PREFIX}-101`, name: `${PREFIX} Student 101`, programme: 'CA Foundation', year: 2026, score: 340, unit: 'Marks' }),
  ]);
  const check3 = await checkFile(corrected, 'corrected.csv');
  const check3Html = readable(await check3.text());
  const digest3 = digestOf(check3Html);
  check(/Corrections/i.test(check3Html), 'a re-import is reported as corrections');
  await confirmFile(check3Html, corrected, digest3, 'corrected.csv');

  const total = await prisma.topper.count({ where: { importRef: { startsWith: PREFIX } } });
  check(total === 2, 'a re-import corrects rather than duplicating', `${total} records`);
  const updated = await prisma.topper.findUnique({
    where: { importRef: `${PREFIX}-100` },
    select: { studentName: true, score: true, subjectScores: { select: { subject: true } } },
  });
  check(updated?.studentName.endsWith('Corrected'), 'the correction was applied');
  check(updated?.subjectScores.length === 1, 'subject marks were replaced, not appended', `${updated?.subjectScores.length}`);

  /* ======================================= 7. LIVE RECORDS ARE PROTECTED = */
  section('7. A RECORD ON THE WEBSITE IS NOT DISTURBED BY AN IMPORT');

  await prisma.topper.update({
    where: { importRef: `${PREFIX}-100` },
    data: { published: true, publishedAt: new Date() },
  });

  const keepPublished = await checkFile(corrected, 'corrected.csv');
  const keepHtml = readable(await keepPublished.text());
  check(/on the website right now/i.test(keepHtml), 'the check warns that a live record will change');
  const digest4 = digestOf(keepHtml);
  await confirmFile(keepHtml, corrected, digest4, 'corrected.csv');
  const stillLive = await prisma.topper.findUnique({
    where: { importRef: `${PREFIX}-100` },
    select: { published: true },
  });
  check(stillLive?.published === true, 'importing does not take a live record off the website');

  // Withdrawing consent from a live record must be refused with an explanation.
  const withdraw = csv([
    row({ reference: `${PREFIX}-100`, name: `${PREFIX} Student 100 Corrected`, programme: 'Class 12 Commerce', year: 2026, score: 93, cResult: 'No' }),
  ]);
  const withdrawRun = await checkFile(withdraw, 'withdraw.csv');
  const withdrawHtml = readable(await withdrawRun.text());
  check(/removes permission to show the result/i.test(withdrawHtml), 'removing consent from a live record is refused');
  check(!/Import \d+ record/i.test(withdrawHtml), 'and the import button is not offered');

  await prisma.topper.update({ where: { importRef: `${PREFIX}-100` }, data: { published: false, publishedAt: null } });

  /* ================================================= 8. FILE SECURITY === */
  section('8. FILE SECURITY');

  const hostile = [
    // Between OUR limit (2 MB) and the framework's (3 MB), so our own check is
    // the one that answers and the teacher gets a sentence rather than a 500.
    ['a file over our 2 MB limit', 'big.csv', csv([row({ reference: 'X', name: 'Y', programme: 'CMA', year: 2026, score: 1 })]) + 'x'.repeat(Math.floor(2.4 * 1024 * 1024))],
    ['a file with a NUL byte', 'nul.csv', `Reference,Student Name${String.fromCharCode(10)}A${String.fromCharCode(0)}B,C`],
    ['an .xlsx upload', 'results.xlsx', 'PK binary'],
    ['an executable', 'evil.exe', 'MZ binary'],
    ['a traversal filename', '../../etc/passwd.csv', csv([])],
    ['an empty file', 'empty.csv', ''],
    ['headers only', 'headers.csv', HEADERS.join(',') + '\n'],
    ['a file with 6000 rows', 'huge.csv', csv(Array.from({ length: 6000 }, (_, i) => row({ reference: `Z${i}`, name: `N${i}`, programme: 'CMA', year: 2026, score: 1 })))],
  ];

  const countBefore = await prisma.topper.count();
  for (const [label, name, content] of hostile) {
    const probe = await checkFile(content, name);
    const html = readable(await probe.text());
    check(probe.status < 500, `${label} is handled without a server error`, `status ${probe.status}`);
    check(!/Import \d+ record/i.test(html), `${label} does not offer an import`);
  }
  check(await prisma.topper.count() === countBefore, 'no hostile file created a record');

  // Our message must be the one that appears, not a framework error.
  const oversized = await checkFile(
    ['a,b', '1,2', 'x'.repeat(Math.floor(2.4 * 1024 * 1024))].join(String.fromCharCode(10)),
    'big.csv',
  );
  const oversizedHtml = readable(await oversized.text());
  check(oversized.status === 200, 'an oversized file gets our own answer, not a framework error', `status ${oversized.status}`);
  check(/larger than 2 MB/i.test(oversizedHtml), 'and the answer names the limit in plain words');

  const xlsxProbe = await checkFile('PK binary', 'results.xlsx');
  check(/Save As, then CSV/i.test(readable(await xlsxProbe.text())), 'an .xlsx upload gets a useful instruction');

  /* ================================================ 9. CSV INJECTION ==== */
  section('9. CSV INJECTION IN EXPORTS');

  // The value must BEGIN with the formula character. An earlier version of this
  // fixture read `ZZTEST =HYPERLINK(...)`, which starts with a letter and is
  // therefore not a formula at all - the assertion was testing nothing.
  await prisma.topper.create({
    data: {
      importRef: `${PREFIX}-INJECT`,
      studentName: `=HYPERLINK("http://evil.example","click") ${PREFIX}`,
      displayNameMode: 'INITIALS',
      score: 50,
      scoreUnit: 'percent',
      programme: 'CMA',
      year: 2026,
      highlight: '+1234',
      published: false,
    },
  });

  const exported = await req('/admin/data/download?kind=results');
  const exportText = await exported.text();
  check(exported.status === 200, 'results export downloads', `status ${exported.status}`);
  check(/"?'=HYPERLINK/.test(exportText), 'a formula in a name is neutralised on export');
  check(!/(^|,)=HYPERLINK/m.test(exportText), 'no cell begins with a bare = in the export');
  check(!/(^|,)\+1234/m.test(exportText), 'a cell beginning + is neutralised too');
  check(exportText.includes('Reference'), 'the export carries the import key column');
  check(!/ipHash|[0-9a-f]{64}/.test(exportText), 'the export contains no internal identifier');

  for (const kind of ['stories', 'batches', 'announcements', 'enquiries']) {
    const dl = await req(`/admin/data/download?kind=${kind}`);
    check(dl.status === 200, `${kind} export downloads`, `status ${dl.status}`);
    const body = await dl.text();
    check(body.split('\n')[0].length > 0, `${kind} export has a header row`);
  }

  const unknownKind = await req('/admin/data/download?kind=../../secrets');
  check(unknownKind.status === 404, 'an unknown export kind is refused', `status ${unknownKind.status}`);

  /* ================================================= 10. THE HISTORY ==== */
  section('10. IMPORT HISTORY AND AUDIT');

  const historyPage = readable(await (await req('/admin/data')).text());
  check(/Past imports/i.test(historyPage), 'the history section renders');
  const runs = await prisma.importRun.findMany({ where: { actorLabel: { startsWith: PREFIX } } });
  check(runs.length >= 2, 'each import is recorded', `${runs.length} runs`);
  check(runs.every((r) => r.madePublic === 0), 'no import ever recorded making something public');
  check(
    runs.every((r) => !/Student 100|Student 101/.test(JSON.stringify(r))),
    'the history stores no spreadsheet content',
  );
  const audits = await prisma.auditLog.findMany({ where: { actorLabel: { startsWith: PREFIX }, action: 'imported' } });
  check(audits.length >= 2, 'each import writes an audit entry', `${audits.length} entries`);

  /* ============================================ 11. PUBLIC SAFETY ======= */
  section('11. NOTHING IMPORTED REACHES THE PUBLIC SITE');

  for (const surface of ['/', '/results', '/sitemap.xml', '/stories']) {
    const page = await (await req(surface, { noCookie: true })).text();
    check(!page.includes(`${PREFIX} Student 100`), `imported record absent from ${surface}`);
    check(!page.includes(`${PREFIX}-CONSENT-100`), `consent reference absent from ${surface}`);
    check(!page.includes(`${PREFIX}-100`), `import reference absent from ${surface}`);
  }
  const rsc = await (await fetch(`${BASE}/results`, { headers: { RSC: '1' } })).text();
  check(!rsc.includes(`${PREFIX} Student 100`), 'imported record absent from the RSC payload');
  check(!/importRef/.test(rsc), 'the import key never reaches the public payload');
} catch (error) {
  console.error('\nHarness error:', error instanceof Error ? `${error.name}: ${error.message}` : error);
  fail += 1;
} finally {
  await cleanup().catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${'='.repeat(56)}`);
console.log(`IMPORT / EXPORT VERIFICATION: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('='.repeat(56));
exit(fail > 0 ? 1 : 0);
