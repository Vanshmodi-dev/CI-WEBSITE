/**
 * Deployment-contract tests.
 *
 * =============================================================================
 * THESE TESTS EXIST TO STOP THE CONTRACT BECOMING PROSE
 * =============================================================================
 * `src/lib/deployment-contract.ts` claims things about this repository: that
 * these tables exist, that these constraints protect consent, that these
 * environment variables are the ones the code reads. Every one of those claims
 * was true when it was written.
 *
 * Phase 12 found `docs/PRODUCTION-SETUP.md` telling an operator to expect 28
 * CHECK constraints, months after the real number became 21. That is what
 * happens to a statement nothing checks.
 *
 * So each claim here is cross-checked against its actual source: the migration
 * SQL, `schema.prisma`, `package.json`, `.env.example`, and the source tree.
 * When the repository changes, these fail - which is the only mechanism that
 * has ever kept documentation honest.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  RUNTIME,
  ENV_CONTRACT,
  ENV_NAMES,
  looksLikePlaceholder,
  looksLikeLocalhost,
  describeDatabaseUrl,
  redact,
  EXPECTED_TABLES,
  EXPECTED_ENUMS,
  EXPECTED_CHECK_CONSTRAINTS,
  CONSENT_CRITICAL_CONSTRAINTS,
  INTEGRITY_CONSTRAINTS,
  EXPECTED_UNIQUE_CONSTRAINTS,
  EXPECTED_FOREIGN_KEYS,
  CONTENT_TABLES,
  DANGEROUS_MIGRATION_PATTERNS,
  SECRET_CONTENT_PATTERNS,
  CLIENT_BUNDLE_FORBIDDEN,
  ROUTES,
  SCORECARD_CATEGORIES,
} from '../src/lib/deployment-contract.ts';
import {
  UNVERIFIED_FACTS,
  unverifiedFacts,
  instituteFactsVerified,
  institute,
} from '../src/config/institute.ts';
import { isIndexable, indexingBlockedBecause } from '../src/config/launch.ts';

/* ------------------------------------------------------------ helpers ---- */

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Every capture group in a regex is `string | undefined` under strict TS, even
 * when the pattern makes it impossible for the group to be absent. Narrowing
 * once here beats a non-null assertion at each of the dozen call sites, and
 * unlike `!` it stays correct if a pattern is later made optional.
 */
function captures(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => m[1]).filter((v): v is string => Boolean(v));
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const migrationDir = path.join(root, 'prisma', 'migrations');
const migrationNames = existsSync(migrationDir)
  ? readdirSync(migrationDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  : [];
const migrationSql = migrationNames
  .map((n) => readFileSync(path.join(migrationDir, n, 'migration.sql'), 'utf8'))
  .join('\n');
const schema = read('prisma/schema.prisma');
const pkg = JSON.parse(read('package.json'));

/* ============================================================== runtime === */

describe('runtime contract', () => {
  test('nodeMinimum matches package.json engines.node', () => {
    assert.equal(
      RUNTIME.nodeMinimum,
      pkg.engines?.node,
      'The contract and package.json are two statements of one fact.',
    );
  });

  test('the pinned Next version matches the dependency', () => {
    assert.equal(RUNTIME.next, pkg.dependencies?.next);
  });

  test('the pinned React version matches the dependency', () => {
    assert.equal(RUNTIME.react, pkg.dependencies?.react);
  });

  test('the Prisma major matches the installed client', () => {
    const major = Number(String(pkg.dependencies?.['@prisma/client']).replace(/[^0-9.]/g, '').split('.')[0]);
    assert.equal(major, RUNTIME.prismaMajor);
  });

  test('the minimum PostgreSQL is not above the version actually verified', () => {
    assert.ok(RUNTIME.postgresMinimumMajor <= RUNTIME.postgresVerifiedMajor);
  });
});

/* ========================================================== environment === */

describe('environment contract', () => {
  test('every process.env read in src/ is documented', () => {
    const files = walk(path.join(root, 'src')).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !f.includes(`generated${path.sep}prisma`),
    );
    const found = new Set<string>();
    for (const file of files) {
      // Comments are stripped: a paragraph naming a variable is documentation,
      // not a read. The preflight's first run flagged its own doc comment.
      for (const name of captures(stripComments(readFileSync(file, 'utf8')), /process\.env\.([A-Z0-9_]+)/g)) {
        found.add(name);
      }
    }
    found.delete('NODE_ENV');
    const undocumented = [...found].filter((n) => !ENV_NAMES.includes(n));
    assert.deepEqual(undocumented, [], `Undocumented environment variables: ${undocumented.join(', ')}`);
  });

  test('every required variable appears in .env.example', () => {
    const example = read('.env.example');
    for (const spec of ENV_CONTRACT.filter((s) => s.requirement !== 'optional')) {
      assert.match(
        example,
        new RegExp(`^\\s*${spec.name}\\s*=`, 'm'),
        `${spec.name} is required but missing from .env.example`,
      );
    }
  });

  test('only NEXT_PUBLIC_ variables are marked client-exposed', () => {
    for (const spec of ENV_CONTRACT) {
      assert.equal(
        spec.clientExposed,
        spec.name.startsWith('NEXT_PUBLIC_'),
        `${spec.name}: Next inlines exactly the NEXT_PUBLIC_ prefix into client JS, nothing else.`,
      );
    }
  });

  test('no secret is also marked client-exposed', () => {
    for (const spec of ENV_CONTRACT) {
      assert.ok(!(spec.secret && spec.clientExposed), `${spec.name} cannot be both secret and client-exposed`);
    }
  });

  test('every spec carries remediation an operator can act on', () => {
    for (const spec of ENV_CONTRACT) {
      assert.ok(spec.remediation.length > 20, `${spec.name} has no useful remediation`);
      assert.ok(spec.purpose.length > 10, `${spec.name} has no stated purpose`);
    }
  });

  test('variable names are unique', () => {
    assert.equal(new Set(ENV_NAMES).size, ENV_NAMES.length);
  });
});

/* ========================================================== placeholders == */

describe('placeholder and localhost detection', () => {
  test('catches the values people actually leave behind', () => {
    for (const value of [
      'CHANGE_ME',
      'change-me',
      'your_secret_here',
      'YOUR_PASSWORD',
      'placeholder',
      'TODO',
      'xxxxx',
      'postgresql://USER:PASSWORD@HOST/DB',
      '<PRODUCTION_DOMAIN>',
      'example',
    ]) {
      assert.ok(looksLikePlaceholder(value), `${value} should read as a placeholder`);
    }
  });

  test('does not flag a real generated secret', () => {
    for (const value of [
      'k3Jd8slQm2vXpR7yTn4bWzA6cF9hGxLe',
      'aGVsbG8td29ybGQtdGhpcy1pcy1yYW5kb20=',
      'https://commerceinsight.in',
    ]) {
      assert.ok(!looksLikePlaceholder(value), `${value} should not read as a placeholder`);
    }
  });

  test('recognises local addresses in every shape they appear', () => {
    for (const value of [
      'http://localhost:3000',
      'postgresql://u:p@127.0.0.1:5432/db',
      'postgres://user:pw@localhost/db',
      'http://[::1]:3000',
      'http://0.0.0.0:8080',
    ]) {
      assert.ok(looksLikeLocalhost(value), `${value} should read as local`);
    }
  });

  test('does not treat a real host as local', () => {
    for (const value of [
      'https://commerceinsight.in',
      'postgresql://u:p@ep-cool-name.ap-southeast-1.aws.neon.tech/db',
      'https://localhost-lookalike.example.com',
    ]) {
      assert.ok(!looksLikeLocalhost(value), `${value} should not read as local`);
    }
  });
});

/* ======================================================= safe reporting === */

describe('database URL description never leaks a credential', () => {
  const url = 'postgresql://someuser:sup3rs3cr3tp4ss@db.example.com:5432/commerce_insight?sslmode=require';

  test('reports only protocol, host and database', () => {
    const info = describeDatabaseUrl(url);
    assert.equal(info.ok, true);
    assert.equal(info.protocol, 'postgresql:');
    assert.equal(info.host, 'db.example.com');
    assert.equal(info.database, 'commerce_insight');
    assert.equal(info.hasCredentials, true);
    assert.equal(info.requiresSsl, true);
  });

  test('no field of the result contains the username or password', () => {
    const serialised = JSON.stringify(describeDatabaseUrl(url));
    assert.ok(!serialised.includes('sup3rs3cr3tp4ss'), 'the password reached the result object');
    assert.ok(!serialised.includes('someuser'), 'the username reached the result object');
  });

  test('rejects a non-postgres URL rather than describing it', () => {
    const info = describeDatabaseUrl('mysql://user:pw@host/db');
    assert.equal(info.ok, false);
    assert.ok(info.problem?.includes('postgresql'));
    assert.equal(info.host, '');
  });

  test('never throws on rubbish', () => {
    for (const value of ['', 'not a url', 'postgresql://', '://', 'null']) {
      assert.doesNotThrow(() => describeDatabaseUrl(value));
      assert.equal(describeDatabaseUrl(value).ok, false);
    }
  });

  test('handles a URL with no database name', () => {
    const info = describeDatabaseUrl('postgresql://u:p@host:5432/');
    assert.equal(info.ok, false);
    assert.match(String(info.problem), /database name/);
  });
});

describe('redaction', () => {
  test('removes credentials from a connection string', () => {
    const out = redact('failed to connect: postgresql://admin:hunter2@db.example.com/ci');
    assert.ok(!out.includes('hunter2'));
    assert.ok(!out.includes('admin:'));
  });

  test('removes key=value secrets in the spellings error messages use', () => {
    const cases: [string, string][] = [
      ['password=hunter2', 'hunter2'],
      ['secret: "abcdef123456"', 'abcdef123456'],
      ['api_key = sk-abcdefghij', 'sk-abcdefghij'],
      ["token:'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'", 'ghp_aaaa'],
    ];
    for (const [input, leaked] of cases) {
      assert.ok(!redact(input).includes(leaked), `redact left ${leaked} in "${input}"`);
    }
  });

  test('leaves harmless text alone', () => {
    const text = 'Migration 20260824124217_init applied to commerce_insight on db.example.com';
    assert.equal(redact(text), text);
  });

  test('never throws on non-string input', () => {
    // The verifier pipes error objects through this. It must not become the
    // thing that crashes a deployment check.
    for (const value of [null, undefined, 42, {}, []] as unknown[]) {
      assert.doesNotThrow(() => redact(value as string));
    }
  });
});

/* ============================================================== schema ==== */

describe('schema contract matches the migration', () => {
  test('there is at least one migration', () => {
    assert.ok(migrationNames.length > 0);
  });

  test('every expected table is created by a migration', () => {
    const created = new Set(captures(migrationSql, /CREATE\s+TABLE\s+"([a-z_]+)"/gi));
    for (const table of EXPECTED_TABLES) {
      assert.ok(created.has(table), `no CREATE TABLE for ${table}`);
    }
  });

  test('the migration creates no table the contract does not know about', () => {
    const created = captures(migrationSql, /CREATE\s+TABLE\s+"([a-z_]+)"/gi);
    const extra = created.filter((t) => !EXPECTED_TABLES.includes(t) && t !== '_prisma_migrations');
    assert.deepEqual(extra, [], `Tables in SQL but not in the contract: ${extra.join(', ')}`);
  });

  test('the removed result_records table is gone from the schema and the SQL', () => {
    // Phase 12 deleted it after proving nothing wrote to it. A migration that
    // recreates it would be a parallel data path outside the consent model.
    //
    // Comments are stripped first. The migration carries a deliberate note
    // explaining why there are 21 constraints rather than 28 - that history is
    // worth keeping, and a test that cannot tell a explanation from a
    // resurrection would force it to be deleted.
    const sql = migrationSql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/result_records/i.test(sql), 'result_records DDL is back in the migration');
    assert.ok(!/model\s+ResultRecord/.test(stripComments(schema)), 'ResultRecord is back in the schema');
  });

  test('every expected enum is created', () => {
    const created = new Set(captures(migrationSql, /CREATE\s+TYPE\s+"(\w+)"/gi));
    for (const name of EXPECTED_ENUMS) {
      assert.ok(created.has(name), `no CREATE TYPE for ${name}`);
    }
  });

  test('every model in schema.prisma maps to an expected table', () => {
    const mapped = captures(schema, /@@map\("([a-z_]+)"\)/g);
    for (const table of mapped) {
      assert.ok(EXPECTED_TABLES.includes(table), `${table} is mapped in the schema but not contracted`);
    }
    assert.equal(mapped.length, EXPECTED_TABLES.length);
  });
});

/* ================================================= the check constraints == */

describe('CHECK constraints - the Phase 12 lesson', () => {
  const inSql = new Set(captures(migrationSql, /ADD\s+CONSTRAINT\s+"([a-zA-Z0-9_]+)"\s+CHECK/gi));

  test('every contracted constraint is created by the migration', () => {
    const missing = EXPECTED_CHECK_CONSTRAINTS.filter((c) => !inSql.has(c));
    assert.deepEqual(
      missing,
      [],
      `Prisma cannot generate these and silently drops them when a migration is regenerated. Missing: ${missing.join(', ')}`,
    );
  });

  test('the migration creates no CHECK constraint the contract does not list', () => {
    const extra = [...inSql].filter((c) => !EXPECTED_CHECK_CONSTRAINTS.includes(c));
    assert.deepEqual(extra, [], `In SQL but not contracted: ${extra.join(', ')}`);
  });

  test('the consent-critical set and the integrity set do not overlap', () => {
    const overlap = CONSENT_CRITICAL_CONSTRAINTS.filter((c) => INTEGRITY_CONSTRAINTS.includes(c));
    assert.deepEqual(overlap, []);
  });

  test('the total is the sum of its parts, with no duplicates', () => {
    assert.equal(
      EXPECTED_CHECK_CONSTRAINTS.length,
      CONSENT_CRITICAL_CONSTRAINTS.length + INTEGRITY_CONSTRAINTS.length,
    );
    assert.equal(new Set(EXPECTED_CHECK_CONSTRAINTS).size, EXPECTED_CHECK_CONSTRAINTS.length);
  });

  test('every consent-critical constraint names a consent or publication rule', () => {
    // A rename that quietly turned a consent rule into something else would
    // otherwise pass every other test here.
    for (const name of CONSENT_CRITICAL_CONSTRAINTS) {
      assert.match(
        name,
        /consent|published/,
        `${name} is listed as consent-critical but does not mention consent or publication`,
      );
    }
  });

  test('both publishable entities are protected', () => {
    // Toppers and stories are the only two things that reach the public site
    // with a person attached. Each needs the same four rules.
    for (const entity of ['toppers', 'student_stories']) {
      for (const rule of [
        'published_requires_consent',
        'name_requires_name_consent',
        'photo_requires_photo_consent',
        'published_at_set',
      ]) {
        assert.ok(
          CONSENT_CRITICAL_CONSTRAINTS.includes(`${entity}_${rule}`),
          `${entity} has no ${rule} constraint`,
        );
      }
    }
  });

  test('photograph consent is enforced separately from every other consent', () => {
    // Story consent does not grant photo consent, and result consent does not
    // either. The database says so independently of the application.
    for (const entity of ['toppers', 'student_stories']) {
      const definition = new RegExp(
        `CONSTRAINT\\s+"${entity}_photo_requires_photo_consent"\\s+CHECK\\s*\\(([\\s\\S]*?)\\);`,
        'i',
      ).exec(migrationSql)?.[1];
      assert.ok(definition, `${entity}_photo_requires_photo_consent not found in SQL`);
      assert.match(String(definition), /consentPhoto/i, 'the photo rule must test consentPhoto');
    }
  });

  test('the audit action constraint lists every action the code records', () => {
    // Phase 12's P12-C: `signed_out` was added to the code and never to the
    // constraint, so every sign-out audit entry was silently discarded for two
    // phases. This is the test that stops the next one drifting.
    const auth = read('src/lib/auth.ts');
    const union = /action:\s*\n?\s*((?:\s*\|?\s*'[a-z_]+'\s*\n?)+)/.exec(auth)?.[1] ?? '';
    const actions = captures(union, /'([a-z_]+)'/g);
    assert.ok(actions.length >= 6, `could not read the audit action union (found ${actions.length})`);

    const constraint = /audit_log_action_known"\s+CHECK\s*\(([\s\S]*?)\);/i.exec(migrationSql)?.[1] ?? '';
    assert.ok(constraint.length > 0, 'audit_log_action_known is missing from the migration');
    for (const action of actions) {
      assert.ok(
        constraint.includes(`'${action}'`),
        `the code records "${action}" but the database constraint would reject it - the entry would be silently discarded`,
      );
    }
  });
});

describe('other database objects', () => {
  test('every unique index is created', () => {
    for (const name of EXPECTED_UNIQUE_CONSTRAINTS) {
      assert.ok(
        migrationSql.includes(`"${name}"`),
        `${name} is missing - this is what stops an import creating a duplicate record`,
      );
    }
  });

  test('every foreign key is created with the contracted delete behaviour', () => {
    for (const fk of EXPECTED_FOREIGN_KEYS) {
      const line = new RegExp(`ADD CONSTRAINT "${fk.name}"[^;]*;`, 'i').exec(migrationSql)?.[0];
      assert.ok(line, `${fk.name} is missing from the migration`);
      assert.ok(
        String(line).toUpperCase().includes(`ON DELETE ${fk.onDelete}`),
        `${fk.name} should be ON DELETE ${fk.onDelete}`,
      );
    }
  });

  test('content tables are all real tables', () => {
    for (const table of CONTENT_TABLES) {
      assert.ok(EXPECTED_TABLES.includes(table), `${table} is listed as content but is not a table`);
    }
  });
});

/* =========================================================== migrations === */

describe('migration files', () => {
  test('every migration is pure ASCII', () => {
    // Phase 12's P12-B. One warning glyph inside a COMMENT aborted the
    // statement after it under a WIN1252 client encoding, and the migration
    // still reported success - so the audit constraint silently did not exist.
    for (const name of migrationNames) {
      const bytes = readFileSync(path.join(migrationDir, name, 'migration.sql'));
      const offender = bytes.findIndex((b) => b > 127);
      assert.equal(
        offender,
        -1,
        `${name} has a non-ASCII byte at offset ${offender}. Comments in a migration are executed, not decoration.`,
      );
    }
  });

  test('no migration contains a destructive statement', () => {
    for (const name of migrationNames) {
      const sql = readFileSync(path.join(migrationDir, name, 'migration.sql'), 'utf8')
        .replace(/--[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      for (const danger of DANGEROUS_MIGRATION_PATTERNS) {
        assert.ok(!danger.pattern.test(sql), `${name} contains ${danger.label}: ${danger.why}`);
      }
    }
  });

  test('the hand-written constraint block carries its warning', () => {
    assert.match(
      migrationSql,
      /HAND-WRITTEN|PRISMA WILL NOT REGENERATE/i,
      'Without the banner, the next person to regenerate the migration deletes every CHECK constraint.',
    );
  });

  test('the dangerous-pattern list detects what it claims to', () => {
    const samples: Record<string, string> = {
      'DROP TABLE': 'DROP TABLE "toppers";',
      'DROP CONSTRAINT': 'ALTER TABLE "toppers" DROP CONSTRAINT "toppers_published_requires_consent";',
      'DROP COLUMN': 'ALTER TABLE "toppers" DROP COLUMN "consentPhoto";',
      TRUNCATE: 'TRUNCATE "enquiries";',
      'DELETE FROM': 'DELETE FROM "toppers" WHERE true;',
      'DROP TYPE': 'DROP TYPE "Programme";',
    };
    for (const danger of DANGEROUS_MIGRATION_PATTERNS) {
      const sample = samples[danger.label];
      assert.ok(sample, `no sample for ${danger.label}`);
      assert.ok(danger.pattern.test(sample), `${danger.label} does not match its own example`);
    }
  });
});

/* ============================================================== secrets === */

describe('secret detection', () => {
  test('detects real credential shapes', () => {
    const samples: [string, string][] = [
      // A key BLOCK, not a bare header: the pattern deliberately requires the
      // body, so that prose naming the format is not reported as a leak.
      [
        'private-key',
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAy8Dbv8prpJ0kKhlGeJYozo2t60EG8L0561g13R29LvMR5hy\n',
      ],
      ['aws-access-key', 'AKIAIOSFODNN7EXAMPLE'],
      ['github-token', 'ghp_abcdefghijklmnopqrstuvwxyz012345'],
      ['slack-token', 'xoxb-123456789012-abcdefghijkl'],
      ['openai-key', 'sk-abcdefghijklmnopqrstuvwxyz'],
      ['resend-key', 're_abcdefghijklmnopqrstuvwx'],
      ['live-database-url', 'postgresql://ciuser:R3alP4ssw0rd@db.example.com/ci'],
    ];
    for (const [id, sample] of samples) {
      const rule = SECRET_CONTENT_PATTERNS.find((p) => p.id === id);
      assert.ok(rule, `no rule with id ${id}`);
      assert.ok(rule!.pattern.test(sample), `${id} failed to match ${sample.slice(0, 24)}...`);
    }
  });

  test('does not flag documentation placeholders', () => {
    for (const sample of [
      'postgresql://USER:PASSWORD@HOST/DB?sslmode=require',
      'postgresql://<user>:<password>@<host>/<db>',
      'DATABASE_URL=""',
      // Prose describing a credential format is documentation, not a leak.
      'the scanner looks for a -----BEGIN PRIVATE KEY----- header',
    ]) {
      const hits = SECRET_CONTENT_PATTERNS.filter((p) => p.pattern.test(sample));
      assert.deepEqual(hits.map((h) => h.id), [], `${sample} was flagged by ${hits.map((h) => h.id).join(', ')}`);
    }
  });

  test('the local-database exemption is declared, not implied', () => {
    // A local connection string cannot authenticate to anything off the
    // machine. Flagging the documented example trains an operator to scroll
    // past the section where the one real finding would appear.
    const rule = SECRET_CONTENT_PATTERNS.find((p) => p.id === 'live-database-url');
    assert.equal(rule?.localhostExempt, true);
    const local = 'postgresql://postgres:postgres@localhost:5432/commerce_insight';
    assert.ok(rule!.pattern.test(local), 'the pattern should still match');
    assert.ok(looksLikeLocalhost(local), 'and the exemption should then apply');
  });

  test('every pattern carries a severity and a human label', () => {
    for (const rule of SECRET_CONTENT_PATTERNS) {
      assert.ok(['critical', 'high'].includes(rule.severity));
      assert.ok(rule.label.length > 3);
    }
  });

  test('no tracked source file contains a real credential', () => {
    // The contract file itself is excluded: it necessarily contains the
    // patterns, and the test above already proves they work.
    const files = [
      ...walk(path.join(root, 'src')),
      ...walk(path.join(root, 'scripts')),
      ...walk(path.join(root, 'tests')),
    ].filter(
      (f) =>
        /\.(ts|tsx|mjs|js)$/.test(f) &&
        !f.includes(`generated${path.sep}prisma`) &&
        !f.endsWith('deployment-contract.ts') &&
        !f.endsWith('deployment.test.ts'),
    );
    for (const file of files) {
      if (statSync(file).size > 2 * 1024 * 1024) continue;
      const text = readFileSync(file, 'utf8');
      for (const rule of SECRET_CONTENT_PATTERNS.filter((p) => p.severity === 'critical')) {
        const match = rule.pattern.exec(text);
        rule.pattern.lastIndex = 0;
        if (match && rule.localhostExempt && looksLikeLocalhost(match[0])) continue;
        assert.ok(!match, `${path.relative(root, file)} matched ${rule.label}`);
      }
    }
  });
});

/* ======================================================= client bundles === */

describe('client bundle rules', () => {
  test('the forbidden patterns match what they describe', () => {
    const samples: Record<string, string> = {
      'connection-string': 'postgresql://user:pass@host.example.com/db',
      'prisma-runtime': 'const c = new PrismaClient()',
      'session-secret-value': 'ADMIN_SESSION_SECRET:"abcdef123456"',
      'enquiry-secret-value': 'ENQUIRY_SECRET="abcdef123456"',
      'password-hash': '$2b$12$abcdefghijklmnop',
      'absolute-source-path': '/home/runner/work/site/src/app/page.tsx',
    };
    for (const rule of CLIENT_BUNDLE_FORBIDDEN) {
      const sample = samples[rule.id];
      assert.ok(sample, `no sample for ${rule.id}`);
      assert.ok(rule.pattern.test(sample), `${rule.id} does not match its own example`);
    }
  });

  test('ordinary client code is not flagged', () => {
    const innocuous = 'export function Card({title}){return <div className="rounded-md">{title}</div>}';
    for (const rule of CLIENT_BUNDLE_FORBIDDEN) {
      assert.ok(!rule.pattern.test(innocuous), `${rule.id} false-positives on ordinary JSX`);
    }
  });
});

/* =============================================================== routes === */

describe('route inventory', () => {
  const appDir = path.join(root, 'src', 'app');

  function discoverRoutes(): Set<string> {
    const found = new Set<string>();
    for (const file of walk(appDir)) {
      const rel = path.relative(appDir, file).split(path.sep).join('/');
      if (!/(^|\/)(page|route)\.(ts|tsx)$/.test(rel)) continue;
      const routePath =
        '/' +
        rel
          .replace(/(^|\/)(page|route)\.(ts|tsx)$/, '')
          .split('/')
          .filter((seg) => seg !== '' && !/^\(.*\)$/.test(seg))
          .join('/');
      found.add(routePath.replace(/\/$/, '') || '/');
    }
    if (existsSync(path.join(appDir, 'robots.ts'))) found.add('/robots.txt');
    if (existsSync(path.join(appDir, 'sitemap.ts'))) found.add('/sitemap.xml');
    return found;
  }

  test('every route on disk is in the contract', () => {
    const contracted = new Set(ROUTES.map((r) => r.path));
    const undocumented = [...discoverRoutes()].filter((r) => !contracted.has(r));
    assert.deepEqual(
      undocumented,
      [],
      `An undocumented route is one nobody decided the auth and crawlability rules for: ${undocumented.join(', ')}`,
    );
  });

  test('route paths are unique', () => {
    const paths = ROUTES.map((r) => r.path);
    assert.equal(new Set(paths).size, paths.length);
  });

  test('no admin route is crawlable or in the sitemap', () => {
    for (const route of ROUTES.filter((r) => r.path.startsWith('/admin'))) {
      assert.equal(route.crawlable, false, `${route.path} must not be crawlable`);
      assert.equal(route.inSitemap, false, `${route.path} must not be in the sitemap`);
    }
  });

  test('every admin route requires auth except sign-in and sign-out', () => {
    for (const route of ROUTES.filter((r) => r.path.startsWith('/admin'))) {
      const reachableSignedOut = route.path === '/admin/login' || route.path === '/admin/logout';
      assert.equal(
        route.requiresAuth,
        !reachableSignedOut,
        `${route.path} has the wrong auth expectation`,
      );
    }
  });

  test('nothing in the sitemap requires authentication', () => {
    for (const route of ROUTES.filter((r) => r.inSitemap)) {
      assert.equal(route.requiresAuth, false, `${route.path} is in the sitemap but requires a session`);
      assert.equal(route.crawlable, true, `${route.path} is in the sitemap but marked uncrawlable`);
    }
  });

  test('the only public route that mutates is the enquiry form', () => {
    const mutatingPublic = ROUTES.filter((r) => r.kind === 'public' && r.mutates).map((r) => r.path);
    assert.deepEqual(
      mutatingPublic,
      ['/admissions'],
      'A public route that writes to the database is an attack surface and needs a deliberate decision.',
    );
  });
});

/* ============================================================ scorecard === */

describe('scorecard', () => {
  test('the categories the brief requires are all present', () => {
    for (const category of [
      'DATABASE',
      'AUTHENTICATION',
      'AUTHORIZATION',
      'CONSENT',
      'SECURITY',
      'ENVIRONMENT',
      'BUILD',
      'PERFORMANCE',
      'SEO',
      'ACCESSIBILITY',
      'IMPORT/EXPORT',
      'CACHING',
      'OBSERVABILITY',
      'BACKUP/RECOVERY',
      'DOMAIN',
      'EMAIL',
      'PRIVACY',
      'REAL DATA',
      'LAUNCH CONTROL',
    ]) {
      assert.ok(SCORECARD_CATEGORIES.includes(category), `missing category: ${category}`);
    }
  });

  test('categories are unique', () => {
    assert.equal(new Set(SCORECARD_CATEGORIES).size, SCORECARD_CATEGORIES.length);
  });
});

/* ====================================================== launch remains === */

describe('every Server Action authorises itself', () => {
  /**
   * WHY THIS IS A TEST AND NOT A REVIEW HABIT (Phase 14).
   *
   * In the App Router, EVERY exported async function in a `'use server'`
   * module is a callable endpoint. Not the ones wired to a form - all of them.
   * So an exported helper is an unauthenticated POST endpoint that nobody
   * decided to publish.
   *
   * Phase 14 found one: `digestOf` in the import actions, marked "exposed for
   * tests" and used by no test. Next had tree-shaken it because nothing
   * imported it, so it was not live - but one client-component import away
   * from being so. It was deleted; this is what stops the next one.
   *
   * Two are unauthenticated by design and are named here rather than pattern-
   * matched, so adding a third is a deliberate act that edits this list.
   */
  const INTENTIONALLY_PUBLIC = [
    { file: 'src/app/(site)/admissions/actions.ts', why: 'the public enquiry form' },
    { file: 'src/app/admin/login/actions.ts', why: 'sign-in cannot require a session' },
  ];

  test('no exported Server Action skips its authorization check', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(root, 'src'))) {
      if (!/\.tsx?$/.test(file) || file.includes(`generated${path.sep}prisma`)) continue;
      const raw = readFileSync(file, 'utf8');
      if (!/^\s*['"]use server['"]/m.test(raw)) continue;

      const relPath = path.relative(root, file).split(path.sep).join('/');
      if (INTENTIONALLY_PUBLIC.some((e) => relPath === e.file)) continue;

      const source = stripComments(raw);
      for (const match of source.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
        const start = match.index ?? 0;
        const next = source.indexOf('\nexport ', start + 1);
        const body = source.slice(start, next === -1 ? source.length : next);
        if (!/requireAdminOrNull\(|requireAdmin\(|getCurrentAdmin\(/.test(body)) {
          offenders.push(`${relPath} :: ${match[1]}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Every exported async function in a "use server" module is a callable endpoint. ` +
        `These have no authorization check: ${offenders.join(', ')}`,
    );
  });

  test('the intentionally public actions still exist where the list says', () => {
    // A stale exemption is worse than none: it would silently excuse a file
    // that had been replaced by something else.
    for (const entry of INTENTIONALLY_PUBLIC) {
      assert.ok(existsSync(path.join(root, entry.file)), `${entry.file} is exempted but does not exist`);
    }
  });
});

describe('institute facts must be verified before launch', () => {
  /**
   * WHY (Phase 14). institute.ts declared UNVERIFIED_FACTS and stated in a
   * comment that they "must all read verified before the site goes public".
   * Nothing read it - not the launch switch, not a test, not the preflight. The
   * site could have been launched, indexed and ranked on an address and two
   * phone numbers carried over from the OLD website, the one an audit found
   * publishing fabricated toppers.
   */

  test('the launch switch cannot be on while a fact is unverified', () => {
    const launch = read('src/config/launch.ts');
    const flagOn = /const\s+SITE_IS_LAUNCHED\s*=\s*true\s*;/.test(launch);
    assert.ok(
      !flagOn || instituteFactsVerified(),
      `SITE_IS_LAUNCHED is true but these facts are still unverified: ${unverifiedFacts().join(', ')}`,
    );
  });

  test('isIndexable() consults the fact gate, not just the flag and the domain', () => {
    const launch = stripComments(read('src/config/launch.ts'));
    const body = /export function isIndexable\(\)[^}]*}/.exec(launch)?.[0] ?? '';
    assert.match(body, /instituteFactsVerified\(\)/, 'the third launch condition is not wired in');
    assert.match(body, /SITE_IS_LAUNCHED/);
    assert.match(body, /hasRealDomain\(\)/);
  });

  test('the site is not indexable right now, and says why', () => {
    assert.equal(isIndexable(), false);
    assert.equal(typeof indexingBlockedBecause(), 'string');
  });

  test('unverifiedFacts() is derived from the status fields, not the array', () => {
    // The array is documentation; a hand-maintained list drifts. They must agree
    // today, and the derived function is what anything else is allowed to use.
    assert.deepEqual([...unverifiedFacts()].sort(), [...UNVERIFIED_FACTS].sort());
  });

  test('every outstanding fact names a real field on the config', () => {
    for (const key of unverifiedFacts()) {
      assert.ok(key in institute, `${key} is reported unverified but is not a field on institute`);
    }
  });

  test('the blocked reason names the outstanding facts once the flag and domain pass', () => {
    // Cannot flip the module constant from here, so assert the message the
    // function would produce is built from the derived list rather than a
    // hardcoded sentence.
    const launch = stripComments(read('src/config/launch.ts'));
    assert.match(launch, /unverifiedFacts\(\)/);
    assert.match(launch, /not confirmed yet/);
  });

  test('no institute fact is silently blank where the UI would show a guess', () => {
    // Absent is honest; a placeholder is not. These must be null, never a
    // plausible-looking invention.
    assert.equal(institute.email, null);
    assert.equal(institute.hours, null);
    assert.equal(institute.googleBusinessProfileUrl, null);
    assert.equal(institute.legalEntityName, null);
    assert.equal(institute.social.youtube, null);
    assert.equal(institute.social.instagram, null);
  });
});

describe('the launch switch is still off', () => {
  test('SITE_IS_LAUNCHED is false', () => {
    const launch = read('src/config/launch.ts');
    assert.match(
      launch,
      /const\s+SITE_IS_LAUNCHED\s*=\s*false\s*;/,
      'Phase 13 is deployment PREPARATION. Turning this on is the launch procedure in the runbook.',
    );
  });

  test('robots.txt disallows everything while the switch is off', () => {
    const robots = stripComments(read('src/app/robots.ts'));
    const preLaunch = /if\s*\(!isIndexable\(\)\)\s*\{[\s\S]*?\n\s{2}\}/.exec(robots)?.[0] ?? '';
    assert.match(preLaunch, /disallow:\s*\['\/'/, 'the pre-launch branch must disallow everything');
    assert.ok(!/sitemap/i.test(preLaunch), 'a pre-launch robots.txt must not advertise a sitemap');
  });

  test('the admin is absent from the sitemap in every branch', () => {
    assert.ok(!/\/admin/.test(stripComments(read('src/app/sitemap.ts'))));
  });
});
