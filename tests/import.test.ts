import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parseCsv, toCsv, neutraliseCell, safeDownloadName, CSV_LIMITS } from '../src/lib/csv.ts';
import { buildPlan, parseSubjects, buildPreview, type ExistingRecord } from '../src/lib/import/plan.ts';
import { COLUMNS, templateRows, PROGRAMME_VALUES } from '../src/lib/import/columns.ts';

/**
 * Phase 12 tests for the pure layers.
 *
 * Everything that needs a server lives in scripts/verify-import.mjs, which
 * drives the real Server Actions over HTTP. These cover the parsing and the
 * decision-making underneath, where a unit test is sharper.
 */

const HEADERS = COLUMNS.map((c) => c.header);
const csvOf = (rows: string[][]) =>
  [HEADERS, ...rows].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');

/** A row builder keyed by column, so tests read as intent rather than position. */
function rowOf(values: Partial<Record<string, string>>): string[] {
  return COLUMNS.map((c) => values[c.key] ?? '');
}

const valid = {
  reference: 'ZZTEST-001',
  studentName: 'ZZTEST Student 001',
  programme: 'Class 12 Commerce',
  year: '2026',
  score: '91',
};

function planFor(rows: string[][], existing: ExistingRecord[] = []) {
  const parsed = parseCsv(csvOf(rows));
  assert.ok(parsed.ok, 'fixture should parse');
  return buildPlan({ headers: parsed.table.headers, rows: parsed.table.rows, existing });
}

/* ------------------------------------------------------------ csv -------- */

describe('CSV parsing', () => {
  test('handles quoting, embedded commas, newlines and escaped quotes', () => {
    const r = parseCsv('a,b\n"x,y","say ""hi"""\n');
    assert.ok(r.ok);
    assert.deepEqual(r.table.rows[0], { a: 'x,y', b: 'say "hi"' });
  });

  test('accepts CRLF, LF and a byte-order mark', () => {
    for (const text of ['a,b\r\n1,2\r\n', 'a,b\n1,2\n', '\u{FEFF}a,b\n1,2\n']) {
      const r = parseCsv(text);
      assert.ok(r.ok, JSON.stringify(text));
      assert.equal(r.table.rowCount, 1);
    }
  });

  test('matches headings whatever the capitals and spacing', () => {
    const r = parseCsv('  Student   NAME ,Year\nZZTEST,2026\n');
    assert.ok(r.ok);
    assert.deepEqual(r.table.headers, ['student name', 'year']);
  });

  test('skips a row that is nothing but commas', () => {
    const r = parseCsv('a,b\n1,2\n,,\n3,4\n');
    assert.ok(r.ok);
    assert.equal(r.table.rowCount, 2);
  });

  test('refuses an unclosed quote rather than guessing where it ends', () => {
    const r = parseCsv('a,b\n"oops,2\n');
    assert.equal(r.ok, false);
  });

  test('refuses a duplicate heading', () => {
    const r = parseCsv('a,a\n1,2\n');
    assert.equal(r.ok, false);
  });

  test('refuses binary content', () => {
    const r = parseCsv(`a,b\n1,${String.fromCharCode(0)}2\n`);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, /binary/i);
  });

  test('enforces every bound, and says which one', () => {
    const wide = parseCsv(Array(CSV_LIMITS.maxColumns + 5).fill('c').map((c, i) => c + i).join(',') + '\n');
    assert.equal(wide.ok, false);
    if (!wide.ok) assert.match(wide.message, /columns/i);

    const tall = parseCsv('a\n' + '1\n'.repeat(CSV_LIMITS.maxRows + 10));
    assert.equal(tall.ok, false);
    if (!tall.ok) assert.match(tall.message, /rows/i);

    const long = parseCsv(`a\n"${'x'.repeat(CSV_LIMITS.maxCellLength + 10)}"\n`);
    assert.equal(long.ok, false);
    if (!long.ok) assert.match(long.message, /characters/i);
  });
});

describe('CSV writing and formula injection', () => {
  test('neutralises every character a spreadsheet treats as a formula', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
      assert.equal(neutraliseCell(`${lead}CMD()`), `'${lead}CMD()`, lead);
    }
  });

  test('leaves an ordinary value alone', () => {
    for (const v of ['ZZTEST Student', '91.5', 'Class 12 Commerce', '']) {
      assert.equal(neutraliseCell(v), v);
    }
  });

  test('a formula survives a round trip as inert text', () => {
    const out = toCsv([{ header: 'Name', value: (r: { n: string }) => r.n }], [{ n: '=HYPERLINK("http://evil.example")' }]);
    assert.ok(!/^Name\r\n=/m.test(out), 'no cell may begin with a bare =');
    const back = parseCsv(out);
    assert.ok(back.ok);
    assert.match(back.table.rows[0]?.name ?? '', /^'=HYPERLINK/);
  });

  test('the export begins with a byte-order mark so Excel reads UTF-8', () => {
    const out = toCsv([{ header: 'A', value: () => 'x' }], [{}]);
    assert.equal(out.charCodeAt(0), 0xfeff);
  });

  test('download names cannot carry a path or a quote', () => {
    assert.equal(safeDownloadName('../../etc/passwd'), 'etc-passwd');
    assert.equal(safeDownloadName('"; rm -rf /'), 'rm-rf');
    assert.equal(safeDownloadName(''), 'export');
    assert.ok(!safeDownloadName('a"b\nc').includes('"'));
  });
});

/* ----------------------------------------------------------- template ---- */

describe('the import template', () => {
  test('has no column that could publish a record', () => {
    const publishing = COLUMNS.filter((c) => /publish|on website|live|visible/i.test(c.header));
    assert.deepEqual(publishing, [], 'a spreadsheet cell must never publish a student');
  });

  test('every example is unmistakably synthetic', () => {
    for (const c of COLUMNS) {
      if (c.example.length === 0) continue;
      // Allowed: the ZZTEST marker, a value drawn from the accepted-values list
      // for that column, or a bare number. Nothing that reads like a person.
      const looksSynthetic =
        c.example.startsWith('ZZTEST') ||
        /^(Class|CA|CMA|CBSE|RBSE|ICAI|Percent|Marks|Initials|Full|First|Yes|No)$/i.test(c.example) ||
        /^(Class|CA|CMA)\s/.test(c.example) ||
        /^[0-9.]+$/.test(c.example) ||
        c.example.includes('Accountancy');
      assert.ok(looksSynthetic, `"${c.example}" must not look like real institute data`);
    }
  });

  test('the template file has a heading row and one example row', () => {
    const rows = templateRows();
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.length, COLUMNS.length);
    assert.equal(rows[1]?.length, COLUMNS.length);
  });

  test('every column documents what it means and what is accepted', () => {
    for (const c of COLUMNS) {
      assert.ok(c.meaning.length > 20, `${c.header} needs a real explanation`);
      assert.ok(c.accepted.length > 5, `${c.header} needs accepted values: "${c.accepted}"`);
    }
  });

  test('no accepted programme spelling is ambiguous', () => {
    // "Commerce" alone could mean Class 11 or Class 12.
    assert.equal(PROGRAMME_VALUES.has('commerce'), false);
  });
});

/* --------------------------------------------------------- validation ---- */

describe('row validation', () => {
  test('a well-formed row plans a create', () => {
    const plan = planFor([rowOf(valid)]);
    assert.equal(plan.ok, true);
    assert.equal(plan.creates.length, 1);
    assert.equal(plan.problems.length, 0);
  });

  test('reports EVERY problem, not just the first', () => {
    const plan = planFor([
      rowOf({ ...valid, reference: 'A1', programme: 'Commerce' }),
      rowOf({ ...valid, reference: 'A2', year: '1899' }),
      rowOf({ ...valid, reference: 'A3', score: '140' }),
      rowOf({ ...valid, reference: '' }),
    ]);
    assert.ok(plan.problems.length >= 4, `expected 4+, got ${plan.problems.length}`);
    const lines = new Set(plan.problems.map((p) => p.line));
    assert.equal(lines.size, 4, 'each bad row should be reported');
  });

  test('every problem names the row, the column and what to do', () => {
    const plan = planFor([rowOf({ ...valid, programme: 'Commerce' })]);
    const problem = plan.problems[0];
    assert.ok(problem);
    assert.equal(problem.line, 2, 'line 1 is the header, so the first data row is line 2');
    assert.equal(problem.column, 'Programme');
    assert.ok(problem.problem.length > 10);
    assert.ok(problem.expected.length > 10);
  });

  test('no message leaks a database detail', () => {
    const plan = planFor([
      rowOf({ ...valid, reference: 'B1', programme: 'nonsense' }),
      rowOf({ ...valid, reference: 'B2', year: 'abc' }),
      rowOf({ ...valid, reference: 'B3', score: 'abc' }),
      rowOf({ ...valid, reference: 'B4', photoPath: 'https://evil.example/x.jpg' }),
    ]);
    for (const p of plan.problems) {
      const text = `${p.problem} ${p.expected}`;
      assert.ok(
        !/prisma|constraint|enum|varchar|violates|P20\d\d|null|undefined/i.test(text),
        `teacher-facing text must not read like a database error: "${text}"`,
      );
    }
  });

  test('an ambiguous programme is an error, never a guess', () => {
    const plan = planFor([rowOf({ ...valid, programme: 'Commerce' })]);
    assert.equal(plan.creates.length, 0);
    assert.match(plan.problems[0]?.expected ?? '', /say which class/i);
  });

  test('a percentage over 100 is caught, but marks over 100 are fine', () => {
    assert.equal(planFor([rowOf({ ...valid, score: '140', scoreUnit: 'Percent' })]).ok, false);
    assert.equal(planFor([rowOf({ ...valid, score: '340', scoreUnit: 'Marks' })]).ok, true);
  });

  test('a duplicate reference inside one file is caught and points at the first row', () => {
    const plan = planFor([rowOf(valid), rowOf({ ...valid, studentName: 'ZZTEST Other' })]);
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.duplicateLines, [3]);
    assert.match(plan.problems[0]?.problem ?? '', /already used on line 2/);
  });

  test('a missing required column stops the whole file with one clear message', () => {
    const withoutReference = parseCsv(
      [HEADERS.slice(1).join(','), 'ZZTEST,Class 12 Commerce,,2026,91,,,,,,,,,'].join('\n'),
    );
    assert.ok(withoutReference.ok);
    const plan = buildPlan({
      headers: withoutReference.table.headers,
      rows: withoutReference.table.rows,
      existing: [],
    });
    assert.equal(plan.ok, false);
    assert.match(plan.problems[0]?.problem ?? '', /missing from the file/i);
  });
});

describe('subject marks', () => {
  test('parses a well-formed list', () => {
    const r = parseSubjects('Accountancy:95; Economics:88');
    assert.deepEqual(r, { subjects: [{ subject: 'Accountancy', score: 95 }, { subject: 'Economics', score: 88 }] });
  });

  test('an empty list is not an error', () => {
    assert.deepEqual(parseSubjects(''), { subjects: [] });
  });

  test('a pair with no colon is an error, not a silent drop', () => {
    // A missing subject on a published result is a wrong result.
    assert.ok('error' in parseSubjects('Accountancy'));
  });

  test('a non-numeric mark is an error', () => {
    assert.ok('error' in parseSubjects('Accountancy:excellent'));
  });

  test('the same subject twice is an error', () => {
    assert.ok('error' in parseSubjects('Accountancy:90; Accountancy:95'));
  });

  test('a trailing percent sign is accepted', () => {
    assert.deepEqual(parseSubjects('Accountancy:95%'), { subjects: [{ subject: 'Accountancy', score: 95 }] });
  });
});

/* ------------------------------------------------------------ consent ---- */

describe('consent safety', () => {
  test('nothing an import can do makes a record public', () => {
    const plan = planFor([
      rowOf({
        ...valid,
        consentResult: 'Yes',
        consentName: 'Yes',
        consentPhoto: 'Yes',
        nameDisplay: 'Full name',
        photoPath: '/photos/zz.jpg',
      }),
    ]);
    assert.equal(plan.ok, true);
    assert.equal(plan.wouldBecomePublic, 0, 'an import must never publish');
    assert.equal(plan.preview[0]?.resultVisible, false);
  });

  test('a full name without name permission is refused', () => {
    const plan = planFor([rowOf({ ...valid, nameDisplay: 'Full name' })]);
    assert.equal(plan.ok, false);
    assert.match(plan.problems[0]?.problem ?? '', /no permission for the name/i);
  });

  test('a photograph without photo permission is refused', () => {
    const plan = planFor([rowOf({ ...valid, photoPath: '/photos/zz.jpg' })]);
    assert.equal(plan.ok, false);
    assert.match(plan.problems[0]?.problem ?? '', /no permission for a photograph/i);
  });

  test('result and name permission do NOT imply photo permission', () => {
    const plan = planFor([
      rowOf({
        ...valid,
        consentResult: 'Yes',
        consentName: 'Yes',
        photoPath: '/photos/zz.jpg',
      }),
    ]);
    assert.equal(plan.ok, false, 'a photograph needs its own permission');
  });

  test('a remote or traversing photograph path is refused', () => {
    for (const p of ['https://evil.example/x.jpg', '../../etc/passwd', '//evil.example/x.jpg', '/photos/x.php']) {
      const plan = planFor([rowOf({ ...valid, photoPath: p, consentPhoto: 'Yes' })]);
      assert.equal(plan.ok, false, p);
    }
  });

  test('a consent value that is not yes or no is an error', () => {
    const plan = planFor([rowOf({ ...valid, consentResult: 'maybe' })]);
    assert.equal(plan.ok, false);
  });

  test('a blank consent column means no, not yes', () => {
    const plan = planFor([rowOf(valid)]);
    assert.equal(plan.creates[0]?.consentResult, false);
    assert.equal(plan.creates[0]?.consentName, false);
    assert.equal(plan.creates[0]?.consentPhoto, false);
  });
});

describe('records that are already on the website', () => {
  const live: ExistingRecord = {
    importRef: 'ZZTEST-001',
    published: true,
    consentResult: true,
    consentName: true,
    consentPhoto: false,
    displayNameMode: 'FULL',
    photoUrl: null,
  };

  test('a correction is an update, not a duplicate', () => {
    const plan = planFor(
      [rowOf({ ...valid, consentResult: 'Yes' })],
      [live],
    );
    assert.equal(plan.creates.length, 0);
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updatesToLiveRecords, 1);
  });

  test('removing result permission from a live record is refused with an explanation', () => {
    const plan = planFor([rowOf({ ...valid, consentResult: 'No' })], [live]);
    assert.equal(plan.ok, false);
    assert.match(plan.problems[0]?.problem ?? '', /on the website now/i);
    assert.match(plan.problems[0]?.expected ?? '', /take the record off the website/i);
  });

  /*
    THIS TEST ASSERTED THE OPPOSITE UNTIL PHASE 23.

    A row that left the consent-form reference blank while correcting a live
    record used to be refused, because the database would have rejected the
    write. That requirement is gone for results, the column is gone from the
    template, and the row below is now simply a correction. Inverted rather than
    deleted: a removed rule that quietly comes back is what a test like this
    catches.
  */
  test('a correction no longer has to carry a consent-form reference', () => {
    const plan = planFor([rowOf({ ...valid, consentResult: 'Yes' })], [live]);
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.problems, []);
    assert.equal(plan.updates.length, 1);
  });

  test('the preview of a live record reflects what is actually shown', () => {
    const plan = planFor(
      [rowOf({ ...valid, consentResult: 'Yes', consentName: 'Yes', nameDisplay: 'Full name' })],
      [live],
    );
    const view = plan.preview[0];
    assert.equal(view?.resultVisible, true);
    assert.equal(view?.nameShown, 'ZZTEST Student 001');
    assert.equal(view?.photoShown, false);
  });
});

describe('the visibility preview', () => {
  test('explains why a record stays private, in the teacher\'s language', () => {
    const plan = planFor([rowOf(valid)]);
    const reasons = plan.preview[0]?.reasons ?? [];
    assert.ok(reasons.length > 0);
    assert.ok(
      reasons.some((r) => /never puts a record on the website/i.test(r)),
      'the first thing it should say is that importing does not publish',
    );
    for (const r of reasons) {
      assert.ok(!/consentRef|published|boolean|enum/i.test(r), `not teacher language: "${r}"`);
    }
  });

  test('is built from the same rules the website uses', () => {
    // If this drifts, two answers to "is this child's photograph public?" exist.
    const record = {
      line: 2,
      importRef: 'R',
      studentName: 'ZZTEST Student',
      displayNameMode: 'FULL' as const,
      photoUrl: '/photos/zz.jpg',
      score: 90,
      scoreUnit: 'percent',
      programme: 'CMA',
      board: null,
      year: 2026,
      highlight: null,
        consentResult: true,
      consentName: true,
      consentPhoto: false,
      subjects: [],
      action: 'update' as const,
      currentlyPublished: true,
    };
    const view = buildPreview(record);
    assert.equal(view.nameShown, 'ZZTEST Student');
    assert.equal(view.photoShown, false, 'photo permission is missing, so no photo');
    assert.ok(view.reasons.some((r) => /photograph stays private/i.test(r)));
  });
});

/* -------------------------------------------------- schema invariants ---- */

describe('schema invariants Phase 12 depends on', () => {
  const migrationDir = path.join(process.cwd(), 'prisma', 'migrations');

  function migrationSql(): string {
    const dirs = readdirSync(migrationDir).filter((d) => !d.endsWith('.toml'));
    return dirs
      .map((d) => readFileSync(path.join(migrationDir, d, 'migration.sql'), 'utf8'))
      .join('\n');
  }

  test('every audited action is permitted by the database', () => {
    // Phase 10 added `signed_out` and did not add it to the CHECK constraint, so
    // every sign-out audit entry was silently rejected for two whole phases.
    const sql = migrationSql();
    const authSource = readFileSync(path.join(process.cwd(), 'src', 'lib', 'auth.ts'), 'utf8');
    const union = authSource.slice(authSource.indexOf('export async function recordAudit'));
    const actions = [...union.matchAll(/\|\s*'([a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(actions.length >= 6, `expected the action union, found ${actions.length}`);
    const constraint = sql.slice(sql.indexOf('audit_log_action_known'));
    for (const action of actions) {
      assert.ok(
        constraint.includes(`'${action}'`),
        `the database rejects the audited action "${action}" - add it to audit_log_action_known`,
      );
    }
  });

  test('the consent constraints still exist', () => {
    const sql = migrationSql();
    for (const name of [
      'toppers_published_requires_consent',
      'toppers_photo_requires_photo_consent',
      'toppers_name_requires_name_consent',
      'student_stories_published_requires_consent',
      'student_stories_photo_requires_photo_consent',
    ]) {
      assert.ok(sql.includes(name), `${name} is missing - regenerating a migration drops these silently`);
    }
  });

  test('the migration is pure ASCII', () => {
    // A single non-ASCII character in a comment aborted the last statement with
    // SQLSTATE 22P05 under a WIN1252 client encoding, silently losing a
    // constraint.
    const sql = migrationSql();
    const offenders = [...sql].filter((c) => c.charCodeAt(0) > 127);
    assert.deepEqual(offenders, [], 'migration SQL must be ASCII only');
  });

  test('the dead ResultRecord model is gone', () => {
    const schema = readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    assert.ok(!schema.includes('model ResultRecord'));
    // Look for DDL, not for the word. The migration explains in a comment why
    // seven constraints went away with the table, and that comment is worth
    // keeping - a naive substring check would forbid it.
    const sql = migrationSql();
    assert.ok(!/CREATE TABLE "result_records"/.test(sql), 'the table must not be created');
    assert.ok(!/ALTER TABLE "result_records"/.test(sql), 'nothing may alter it');
    assert.ok(!/ON "result_records"/.test(sql), 'nothing may index it');
  });
});
