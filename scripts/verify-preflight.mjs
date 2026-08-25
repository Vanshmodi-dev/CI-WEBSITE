/**
 * DEPLOYMENT PRE-FLIGHT.
 *
 *   npm run verify:preflight                  # local development environment
 *   npm run verify:preflight -- --target=production
 *   npm run verify:preflight -- --deep        # also scan git history contents
 *   npm run verify:preflight -- --json=out.json
 *
 * =============================================================================
 * WHAT THIS IS FOR
 * =============================================================================
 * Phase 12 produced a database that `prisma validate` called correct and that
 * `prisma migrate status` called up to date, with the entire consent model
 * unenforced: all 28 CHECK constraints had silently vanished, because Prisma
 * cannot express them and therefore does not know they exist.
 *
 * A deployment checklist written in prose would not have caught that. Nothing
 * would have caught it except asking the database itself, by name, whether the
 * rule that stops a child's photograph being published without permission is
 * actually there.
 *
 * So this asks. Every claim it makes is measured against the repository, the
 * environment, or a live PostgreSQL - never against a document.
 *
 * =============================================================================
 * IT NEVER PRINTS A SECRET
 * =============================================================================
 * Every line of output passes through `redact()`. Values are inspected to
 * answer yes/no questions - is it present, is it long enough, is it a
 * placeholder - and the answers are printed, never the value. A connection
 * string is reported as protocol, host and database name only.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { argv, env, exit, versions } from 'node:process';
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
  EXPECTED_UNIQUE_CONSTRAINTS,
  EXPECTED_FOREIGN_KEYS,
  CONTENT_TABLES,
  OPERATIONAL_TABLES,
  DANGEROUS_MIGRATION_PATTERNS,
  CONSENT_COLUMNS,
  FORBIDDEN_TRACKED_FILES,
  SECRET_CONTENT_PATTERNS,
  SECRET_SCAN_SKIP,
  CLIENT_BUNDLE_FORBIDDEN,
  ADMIN_ONLY_MARKERS,
  ROUTES,
  EXPECTED_PRE_LAUNCH,
} from '../src/lib/deployment-contract.ts';

/* ============================================================ options ===== */

const args = argv.slice(2);
const has = (flag) => args.some((a) => a === flag || a.startsWith(`${flag}=`));
const valueOf = (flag) => {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
};

const TARGET = valueOf('--target') ?? 'local';
const DEEP = has('--deep');
const JSON_OUT = valueOf('--json');
const IS_PRODUCTION_TARGET = TARGET === 'production';

if (TARGET !== 'local' && TARGET !== 'production') {
  console.error(`Unknown --target=${TARGET}. Use "local" or "production".`);
  exit(2);
}

/* ============================================================ plumbing ==== */

const results = [];
let currentSection = '';

const COLOURS = {
  PASS: '\u001B[32m',
  FAIL: '\u001B[31m',
  WARN: '\u001B[33m',
  BLOCKED: '\u001B[35m',
  'NOT APPLICABLE': '\u001B[90m',
  reset: '\u001B[0m',
};

/** Everything printed goes through here. Nothing reaches stdout unredacted. */
function say(text = '') {
  console.log(redact(String(text)));
}

function section(title) {
  currentSection = title;
  say('');
  say(`--- ${title} ${'-'.repeat(Math.max(0, 66 - title.length))}`);
}

/**
 * Record one check.
 *
 * `status` is one of PASS / FAIL / WARN / BLOCKED / NOT APPLICABLE. A non-
 * developer reads the label; the evidence line is what makes it actionable.
 */
function record(id, description, status, evidence, remediation) {
  const entry = {
    id,
    section: currentSection,
    description,
    status,
    evidence: evidence ? redact(String(evidence)) : '',
    remediation: remediation ? redact(String(remediation)) : '',
    required: status !== 'NOT APPLICABLE',
  };
  results.push(entry);

  const colour = COLOURS[status] ?? '';
  const label = status.padEnd(14);
  say(`  ${colour}${label}${COLOURS.reset}${id}  ${description}`);
  if (entry.evidence) say(`                 ${entry.evidence}`);
  if (entry.remediation && (status === 'FAIL' || status === 'BLOCKED' || status === 'WARN')) {
    say(`                 -> ${entry.remediation}`);
  }
  return entry;
}

const pass = (id, d, e) => record(id, d, 'PASS', e);
const fail = (id, d, e, r) => record(id, d, 'FAIL', e, r);
const warn = (id, d, e, r) => record(id, d, 'WARN', e, r);
const blocked = (id, d, e, r) => record(id, d, 'BLOCKED', e, r);
const notApplicable = (id, d, e) => record(id, d, 'NOT APPLICABLE', e);

/**
 * Fail in production, warn locally.
 *
 * Most of this file's judgements differ by target: a missing
 * ADMIN_SESSION_SECRET is a hard blocker on a production host and completely
 * normal on a developer's laptop, where the code generates a per-process one.
 */
const gate = (id, d, e, r) =>
  IS_PRODUCTION_TARGET ? fail(id, d, e, r) : warn(id, d, `${e} (local target)`, r);

function git(args_) {
  try {
    return execFileSync('git', args_, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function readIfExists(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Remove comments before pattern-matching source code.
 *
 * THREE OF THE FIRST FOUR FAILURES THIS SCRIPT REPORTED WERE ITS OWN COMMENTS.
 * `sitemap.ts` was flagged for referencing /admin - in a comment explaining that
 * /admin must never appear there. The deployment contract was flagged for an
 * undocumented variable named `X`, from a doc comment describing this very
 * check. A verifier that reads prose as code cries wolf, and a checklist that
 * cries wolf is one an operator learns to skip.
 *
 * Only used for CODE checks. The secret scan deliberately does NOT strip
 * comments: a credential pasted into a comment is still a credential.
 */
function stripComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ========================================================== 1. RUNTIME === */

function checkRuntime() {
  section('1. RUNTIME');

  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  // -- P-RUN-01 --------------------------------------------------------------
  const declared = pkg.engines?.node ?? '';
  if (declared === RUNTIME.nodeMinimum) {
    pass('P-RUN-01', 'package.json engines.node matches the deployment contract', declared);
  } else {
    fail(
      'P-RUN-01',
      'package.json engines.node matches the deployment contract',
      `package.json says "${declared}", contract says "${RUNTIME.nodeMinimum}"`,
      'Update whichever is wrong. They are two statements of one fact and must agree.',
    );
  }

  // -- P-RUN-02 --------------------------------------------------------------
  const running = versions.node;
  const major = Number(running.split('.')[0]);
  const minMajor = Number(RUNTIME.nodeMinimum.replace(/[^0-9.]/g, '').split('.')[0]);
  if (major >= minMajor) {
    pass('P-RUN-02', 'the Node running this check satisfies the minimum', `node ${running}`);
  } else {
    fail(
      'P-RUN-02',
      'the Node running this check satisfies the minimum',
      `node ${running} is below ${RUNTIME.nodeMinimum}`,
      `Install Node ${RUNTIME.nodeRecommended}.`,
    );
  }

  // -- P-RUN-03 --------------------------------------------------------------
  const nextVersion = pkg.dependencies?.next ?? '';
  if (nextVersion === RUNTIME.next) {
    pass('P-RUN-03', 'Next.js is pinned to the verified version', `next ${nextVersion}`);
  } else {
    warn(
      'P-RUN-03',
      'Next.js is pinned to the verified version',
      `package.json has "${nextVersion}", the contract verified ${RUNTIME.next}`,
      'Re-run the full regression before deploying a different Next version.',
    );
  }

  // -- P-RUN-04 --------------------------------------------------------------
  const prismaVersion = pkg.dependencies?.['@prisma/client'] ?? '';
  const prismaMajor = Number(prismaVersion.replace(/[^0-9.]/g, '').split('.')[0]);
  if (prismaMajor === RUNTIME.prismaMajor) {
    pass('P-RUN-04', 'Prisma major version matches the contract', `@prisma/client ${prismaVersion}`);
  } else {
    fail(
      'P-RUN-04',
      'Prisma major version matches the contract',
      `found major ${prismaMajor}, expected ${RUNTIME.prismaMajor}`,
      'Prisma 7 requires the driver adapter. A different major changes how the client is constructed.',
    );
  }

  // -- P-RUN-05 --------------------------------------------------------------
  // A lockfile is what makes a deployment reproducible. Without it the host
  // resolves its own versions and "it worked locally" stops meaning anything.
  if (existsSync('package-lock.json')) {
    pass('P-RUN-05', 'a lockfile is present for reproducible installs', 'package-lock.json');
  } else {
    fail(
      'P-RUN-05',
      'a lockfile is present for reproducible installs',
      'package-lock.json is missing',
      'Run npm install and commit the lockfile. Deployment must use npm ci.',
    );
  }
}

/* ====================================================== 2. ENVIRONMENT === */

function checkEnvironment() {
  section('2. ENVIRONMENT');

  for (const spec of ENV_CONTRACT) {
    const id = `P-ENV-${spec.name}`;
    const raw = env[spec.name];
    const present = typeof raw === 'string' && raw.length > 0;
    const requiredHere =
      spec.requirement === 'always' ||
      (spec.requirement === 'production' && IS_PRODUCTION_TARGET);

    if (!present) {
      if (requiredHere) {
        gate(id, `${spec.name} is set`, 'not set', spec.remediation);
      } else if (spec.requirement === 'optional') {
        notApplicable(id, `${spec.name} is set`, 'optional, not set - feature is off');
      } else {
        warn(
          id,
          `${spec.name} is set`,
          'not set (production-only; the code generates a per-process value locally)',
          spec.remediation,
        );
      }
      continue;
    }

    // Present. Now everything that can be wrong ABOUT a value without printing it.
    const problems = [];

    if (spec.minLength && raw.length < spec.minLength) {
      problems.push(`only ${raw.length} characters, minimum is ${spec.minLength}`);
    }
    if (looksLikePlaceholder(raw)) {
      problems.push('looks like an unreplaced placeholder');
    }
    if (IS_PRODUCTION_TARGET && looksLikeLocalhost(raw)) {
      problems.push('points at localhost');
    }
    if (raw !== raw.trim()) {
      problems.push('has leading or trailing whitespace');
    }

    if (problems.length > 0) {
      gate(id, `${spec.name} is set and usable`, problems.join('; '), spec.remediation);
    } else {
      const shape = spec.secret ? `set, ${raw.length} characters` : `set: ${raw}`;
      pass(id, `${spec.name} is set and usable`, spec.secret ? shape : redact(shape));
    }
  }

  // -- P-ENV-DISTINCT --------------------------------------------------------
  // Two secrets with the same value is one secret wearing two hats. Compared by
  // hash-free equality; neither is printed either way.
  const enquiry = env.ENQUIRY_SECRET;
  const session = env.ADMIN_SESSION_SECRET;
  if (enquiry && session) {
    if (enquiry === session) {
      fail(
        'P-ENV-DISTINCT',
        'the two application secrets are different values',
        'ENQUIRY_SECRET and ADMIN_SESSION_SECRET are identical',
        'Generate them separately. Sharing one means a leak of either compromises both.',
      );
    } else {
      pass('P-ENV-DISTINCT', 'the two application secrets are different values', 'distinct');
    }
  } else {
    notApplicable(
      'P-ENV-DISTINCT',
      'the two application secrets are different values',
      'both must be set to compare',
    );
  }

  // -- P-ENV-DBURL -----------------------------------------------------------
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    notApplicable('P-ENV-DBURL', 'DATABASE_URL is a well-formed PostgreSQL URL', 'not set');
  } else {
    const info = describeDatabaseUrl(dbUrl);
    // Deliberately NOT written as `postgresql://host/db`. The redactor blanks
    // anything shaped like a connection string, so the first version printed
    // "postgresql://<redacted>" and told the operator nothing - a safe summary
    // redacted into uselessness is no safer and much less useful. Named fields
    // carry the same facts, read better to a non-developer, and survive.
    const summary = `protocol=${info.protocol.replace(':', '')} host=${info.host || '?'} database=${info.database || '?'} ssl=${info.requiresSsl ? 'yes' : 'no'} credentials=${info.hasCredentials ? 'present' : 'absent'}`;
    if (!info.ok) {
      fail(
        'P-ENV-DBURL',
        'DATABASE_URL is a well-formed PostgreSQL URL',
        info.problem ?? 'unusable',
        'Expected postgresql://user:password@host/database. Copy the pooled string from the provider.',
      );
    } else if (IS_PRODUCTION_TARGET && !info.requiresSsl) {
      fail(
        'P-ENV-DBURL',
        'DATABASE_URL is a well-formed PostgreSQL URL',
        `${summary} - no sslmode for a production database`,
        'Append ?sslmode=require. Student records must not cross a network in the clear.',
      );
    } else if (IS_PRODUCTION_TARGET && !info.hasCredentials) {
      fail(
        'P-ENV-DBURL',
        'DATABASE_URL is a well-formed PostgreSQL URL',
        `${summary} - no credentials embedded`,
        'A production database must not accept unauthenticated connections.',
      );
    } else {
      pass('P-ENV-DBURL', 'DATABASE_URL is a well-formed PostgreSQL URL', summary);
    }
  }

  // -- P-ENV-CONTRACT --------------------------------------------------------
  // The contract must still describe the code. Any process.env read in src/
  // that is not in ENV_CONTRACT is a variable an operator was never told about.
  const sourceFiles = walk('src').filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.includes(`generated${path.sep}prisma`),
  );
  const found = new Set();
  for (const file of sourceFiles) {
    const text = stripComments(readIfExists(file) ?? '');
    for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) found.add(m[1]);
  }
  found.delete('NODE_ENV'); // set by the framework, not by an operator.
  const undocumented = [...found].filter((n) => !ENV_NAMES.includes(n));
  const unused = ENV_NAMES.filter((n) => !found.has(n));

  if (undocumented.length === 0) {
    pass(
      'P-ENV-CONTRACT',
      'every environment variable the code reads is in the contract',
      `${found.size} read, all documented${unused.length ? `; ${unused.length} declared but unread` : ''}`,
    );
  } else {
    fail(
      'P-ENV-CONTRACT',
      'every environment variable the code reads is in the contract',
      `undocumented: ${undocumented.join(', ')}`,
      'Add each to ENV_CONTRACT in src/lib/deployment-contract.ts, or stop reading it.',
    );
  }

  // -- P-ENV-EXAMPLE ---------------------------------------------------------
  const example = readIfExists('.env.example');
  if (example === null) {
    fail(
      'P-ENV-EXAMPLE',
      '.env.example lists the required variables',
      '.env.example is missing',
      'It is the only guide an operator has for what to set. Recreate it from ENV_CONTRACT.',
    );
  } else {
    const required = ENV_CONTRACT.filter((s) => s.requirement !== 'optional').map((s) => s.name);
    const missing = required.filter((n) => !new RegExp(`^\\s*${n}\\s*=`, 'm').test(example));
    if (missing.length === 0) {
      pass('P-ENV-EXAMPLE', '.env.example lists the required variables', `${required.length} listed`);
    } else {
      fail(
        'P-ENV-EXAMPLE',
        '.env.example lists the required variables',
        `missing: ${missing.join(', ')}`,
        'Add them with empty values. An operator copies this file to start.',
      );
    }
  }

  // -- P-ENV-EXAMPLE-CLEAN ---------------------------------------------------
  // The template must not contain a real value. This is a file people copy.
  if (example !== null) {
    const suspicious = SECRET_CONTENT_PATTERNS.filter((p) => {
      const match = p.pattern.exec(example);
      p.pattern.lastIndex = 0;
      if (!match) return false;
      return !(p.localhostExempt && looksLikeLocalhost(match[0]));
    });
    if (suspicious.length === 0) {
      pass('P-ENV-EXAMPLE-CLEAN', '.env.example contains no real credential', 'placeholders only');
    } else {
      fail(
        'P-ENV-EXAMPLE-CLEAN',
        '.env.example contains no real credential',
        `matched: ${suspicious.map((s) => s.label).join(', ')}`,
        'Replace with a placeholder and ROTATE the value that leaked.',
      );
    }
  }
}

/* ========================================================== 3. SECRETS === */

function checkSecrets() {
  section('3. SECRETS AND GIT HYGIENE');

  const tracked = git(['ls-files']);
  if (tracked === null) {
    blocked(
      'P-SEC-01',
      'no secret-bearing file is tracked by git',
      'not a git repository, or git is unavailable',
      'Run this inside the repository.',
    );
    return;
  }
  const trackedFiles = tracked.split('\n').filter(Boolean);

  // -- P-SEC-01 --------------------------------------------------------------
  const forbidden = trackedFiles.filter((f) =>
    FORBIDDEN_TRACKED_FILES.some((p) => p.test(f)),
  );
  if (forbidden.length === 0) {
    pass(
      'P-SEC-01',
      'no secret-bearing file is tracked by git',
      `${trackedFiles.length} tracked files, none forbidden`,
    );
  } else {
    fail(
      'P-SEC-01',
      'no secret-bearing file is tracked by git',
      `tracked: ${forbidden.join(', ')}`,
      'git rm --cached the file, add it to .gitignore, and ROTATE every credential it held.',
    );
  }

  // -- P-SEC-02 --------------------------------------------------------------
  const gitignore = readIfExists('.gitignore') ?? '';
  const ignoresEnv = /^\s*\.env\*?\s*$/m.test(gitignore) || /^\s*\.env\.\*\s*$/m.test(gitignore);
  if (ignoresEnv) {
    pass('P-SEC-02', '.gitignore excludes environment files', 'matched .env / .env.*');
  } else {
    fail(
      'P-SEC-02',
      '.gitignore excludes environment files',
      'no .env rule found',
      'Add ".env" and ".env.*" with "!.env.example".',
    );
  }

  // -- P-SEC-03 --------------------------------------------------------------
  // Content scan of the working tree. Every tracked file, minus the noise.
  const findings = [];
  for (const file of trackedFiles) {
    if (SECRET_SCAN_SKIP.some((p) => p.test(file))) continue;
    let text;
    try {
      if (statSync(file).size > 2 * 1024 * 1024) continue;
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const p of SECRET_CONTENT_PATTERNS) {
      // Find the matching LINE rather than just asking whether the file
      // matches: the line is what makes the finding actionable, and it is also
      // what the localhost exemption has to be judged against.
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const match = p.pattern.exec(lines[i]);
        p.pattern.lastIndex = 0;
        if (!match) continue;
        // A connection string pointing at 127.0.0.1 cannot authenticate to
        // anything off this machine. Flagging the documented local example, or
        // the throwaway verification cluster, teaches an operator to scroll
        // past this section - which is how the one real finding gets missed.
        if (p.localhostExempt && looksLikeLocalhost(match[0])) continue;
        findings.push({ file, line: i + 1, ...p });
        break;
      }
    }
  }

  const critical = findings.filter((f) => f.severity === 'critical');
  const high = findings.filter((f) => f.severity === 'high');

  if (critical.length === 0 && high.length === 0) {
    pass(
      'P-SEC-03',
      'no credential appears in a tracked file',
      `${trackedFiles.length - trackedFiles.filter((f) => SECRET_SCAN_SKIP.some((p) => p.test(f))).length} files scanned`,
    );
  } else if (critical.length > 0) {
    fail(
      'P-SEC-03',
      'no credential appears in a tracked file',
      critical.map((f) => `${f.file}:${f.line} ${f.label}`).join(' | '),
      'Remove it, ROTATE the credential immediately, then decide about history. Rotation first - history rewriting does not un-leak anything already cloned.',
    );
  } else {
    warn(
      'P-SEC-03',
      'no credential appears in a tracked file',
      high.map((f) => `${f.file}:${f.line} ${f.label}`).join(' | '),
      'Confirm each is a placeholder or documentation rather than a live value.',
    );
  }

  // -- P-SEC-04 --------------------------------------------------------------
  // History, by filename. Cheap, and catches the common "committed .env once".
  const everAdded = git([
    'log',
    '--all',
    '--diff-filter=A',
    '--name-only',
    '--pretty=format:',
  ]);
  if (everAdded === null) {
    notApplicable('P-SEC-04', 'no secret-bearing file was ever committed', 'history unavailable');
  } else {
    const names = [...new Set(everAdded.split('\n').filter(Boolean))];
    const bad = names.filter((f) => FORBIDDEN_TRACKED_FILES.some((p) => p.test(f)));
    if (bad.length === 0) {
      pass(
        'P-SEC-04',
        'no secret-bearing file was ever committed',
        `${names.length} distinct paths across all history`,
      );
    } else {
      fail(
        'P-SEC-04',
        'no secret-bearing file was ever committed',
        `once present in history: ${bad.join(', ')}`,
        'ROTATE every credential those files held. History rewriting is a separate decision and is NOT performed automatically - a rewrite does not recall clones or forks.',
      );
    }
  }

  // -- P-SEC-05 --------------------------------------------------------------
  if (!DEEP) {
    notApplicable(
      'P-SEC-05',
      'no credential appears anywhere in git history',
      'not scanned - re-run with --deep (slow on a large history)',
    );
  } else {
    const revs = git(['rev-list', '--all']);
    const revList = revs ? revs.split('\n').filter(Boolean) : [];
    const hits = [];
    for (const p of SECRET_CONTENT_PATTERNS.filter((x) => x.severity === 'critical')) {
      const out = git([
        'grep',
        '-I',
        '--no-color',
        '-n',
        '-P',
        // `-e` is required, not optional. Several of these patterns begin with
        // a hyphen ("-----BEGIN ... PRIVATE KEY-----") and git read the first
        // one as an unknown command-line option - so the private-key scan
        // silently examined nothing while reporting that it had run.
        '-e',
        p.pattern.source,
        ...revList,
      ]);
      if (!out || !out.trim()) continue;

      // The same exemption the working-tree scan applies. Without it the deep
      // scan reported the documented `postgres:postgres@localhost` line in
      // .env.example as a leaked credential in every commit containing it -
      // one finding per commit, none of them real.
      const lines = out
        .split('\n')
        .filter(Boolean)
        // SECRET_SCAN_SKIP applies here too. The working-tree scan honoured it
        // and this one did not, so the moment the pattern-testing file was
        // committed the history scan reported every one of its synthetic
        // samples as a leak. Each git grep line reads "<rev>:<path>:<n>:<text>",
        // so the path is the second field.
        .filter((line) => {
          const file = line.split(':')[1] ?? '';
          return !SECRET_SCAN_SKIP.some((skip) => skip.test(file));
        })
        .filter((line) => {
          if (!p.localhostExempt) return true;
          const match = p.pattern.exec(line);
          p.pattern.lastIndex = 0;
          return !(match && looksLikeLocalhost(match[0]));
        });
      if (lines.length === 0) continue;

      hits.push({
        label: p.label,
        count: lines.length,
        sample: lines.slice(0, 3).map((l) => l.split(':').slice(0, 2).join(':')),
      });
    }
    if (hits.length === 0) {
      pass(
        'P-SEC-05',
        'no credential appears anywhere in git history',
        `${revList.length} commits scanned for ${SECRET_CONTENT_PATTERNS.filter((x) => x.severity === 'critical').length} patterns`,
      );
    } else {
      fail(
        'P-SEC-05',
        'no credential appears anywhere in git history',
        hits.map((h) => `${h.label} (${h.count} occurrences) e.g. ${h.sample.join(', ')}`).join(' | '),
        'ROTATE first. Then decide about history rewriting - it is not done automatically and it does not un-leak anything already cloned.',
      );
    }
  }

  // -- P-SEC-06 --------------------------------------------------------------
  // Nothing uncommitted at deploy time. A dirty tree means the thing deployed
  // is not the thing in the repository.
  const status = git(['status', '--porcelain']);
  if (status === null) {
    notApplicable('P-SEC-06', 'the working tree is clean', 'git unavailable');
  } else if (status.trim() === '') {
    pass('P-SEC-06', 'the working tree is clean', 'no uncommitted changes');
  } else {
    const count = status.trim().split('\n').length;
    warn(
      'P-SEC-06',
      'the working tree is clean',
      `${count} uncommitted change(s)`,
      'Commit or stash before deploying, so the deployed commit is identifiable.',
    );
  }
}

/* ===================================================== 4. LAUNCH STATE === */

function checkLaunchState() {
  section('4. LAUNCH CONTROL');

  const launch = readIfExists('src/config/launch.ts') ?? '';

  // -- P-LAUNCH-01 -----------------------------------------------------------
  const match = /const\s+SITE_IS_LAUNCHED\s*=\s*(true|false)\s*;/.exec(launch);
  const flag = match ? match[1] === 'true' : null;

  if (flag === null) {
    fail(
      'P-LAUNCH-01',
      'the launch switch is readable and explicit',
      'SITE_IS_LAUNCHED not found in src/config/launch.ts',
      'The switch must stay a literal boolean so it can be read without executing the app.',
    );
  } else if (flag === EXPECTED_PRE_LAUNCH.siteIsLaunched) {
    pass('P-LAUNCH-01', 'LAUNCH SWITCH: OFF (expected before launch)', 'SITE_IS_LAUNCHED = false');
  } else {
    // Not automatically a failure - it is correct AFTER launch. But it must be
    // deliberate, and Phase 13 expects it off.
    warn(
      'P-LAUNCH-01',
      'LAUNCH SWITCH: ON',
      'SITE_IS_LAUNCHED = true',
      'Correct only if the launch procedure in docs/DEPLOYMENT-RUNBOOK.md has been completed and the institute approved the content.',
    );
  }

  // -- P-LAUNCH-02 -----------------------------------------------------------
  // The second condition. Both must hold for indexing, so both are reported.
  const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? '';
  const realDomain =
    siteUrl.startsWith('https://') &&
    !looksLikeLocalhost(siteUrl) &&
    !siteUrl.includes('.vercel.app');
  pass(
    'P-LAUNCH-02',
    'the second indexing condition is reported',
    `NEXT_PUBLIC_SITE_URL ${siteUrl ? `= ${siteUrl}` : 'is unset'} -> real production domain: ${realDomain ? 'yes' : 'no'}`,
  );

  // -- P-LAUNCH-03 -----------------------------------------------------------
  const indexable = flag === true && realDomain;
  if (indexable === false) {
    pass(
      'P-LAUNCH-03',
      'the site is NOT indexable (expected before launch)',
      'both conditions must be true; at least one is false',
    );
  } else {
    warn(
      'P-LAUNCH-03',
      'the site IS indexable',
      'code flag and production domain both satisfied',
      'Search engines may index this deployment. Intended only after launch approval.',
    );
  }

  // -- P-LAUNCH-04 -----------------------------------------------------------
  // robots.ts must keep the sitemap line out of the pre-launch branch. A
  // "Disallow: /" next to a "Sitemap:" line is a contradictory file.
  const robots = readIfExists('src/app/robots.ts') ?? '';
  const preLaunchBranch = /if\s*\(!isIndexable\(\)\)\s*\{[\s\S]*?\}/.exec(robots)?.[0] ?? '';
  if (preLaunchBranch.includes('sitemap')) {
    fail(
      'P-LAUNCH-04',
      'robots.txt advertises no sitemap before launch',
      'the pre-launch branch of robots.ts mentions a sitemap',
      'Remove it. Disallow: / next to Sitemap: is contradictory and crawlers resolve it inconsistently.',
    );
  } else if (preLaunchBranch.includes("disallow: ['/'") || preLaunchBranch.includes("disallow: ['/',")) {
    pass('P-LAUNCH-04', 'robots.txt disallows everything before launch', 'Disallow: / and /admin');
  } else {
    warn(
      'P-LAUNCH-04',
      'robots.txt disallows everything before launch',
      'could not confirm the pre-launch branch shape',
      'Read src/app/robots.ts and confirm the !isIndexable() branch disallows "/".',
    );
  }

  // -- P-LAUNCH-05 -----------------------------------------------------------
  // /admin must be excluded from the sitemap in every branch.
  const sitemap = stripComments(readIfExists('src/app/sitemap.ts') ?? '');
  if (/\/admin/.test(sitemap)) {
    fail(
      'P-LAUNCH-05',
      '/admin is absent from the sitemap',
      'sitemap.ts references /admin',
      'The admin must never be advertised to a crawler.',
    );
  } else {
    pass('P-LAUNCH-05', '/admin is absent from the sitemap', 'no reference in sitemap.ts');
  }

  // -- P-LAUNCH-06 -----------------------------------------------------------
  // Search Console verification tokens must not be present yet.
  const layout = readIfExists('src/app/layout.tsx') ?? '';
  if (/google-site-verification|googleadservices|gtag\(|GTM-/.test(layout)) {
    warn(
      'P-LAUNCH-06',
      'no Search Console or analytics tag is wired',
      'layout.tsx references a verification or analytics tag',
      'Phase 13 expects none. Add it during launch, not before.',
    );
  } else {
    pass('P-LAUNCH-06', 'no Search Console or analytics tag is wired', 'none in layout.tsx');
  }
}

/* ======================================================= 5. MIGRATIONS === */

function checkMigrations() {
  section('5. MIGRATION SAFETY');

  const dir = 'prisma/migrations';
  if (!existsSync(dir)) {
    fail(
      'P-MIG-01',
      'a migration exists',
      'prisma/migrations is missing',
      'Nothing can be deployed without one.',
    );
    return [];
  }

  const migrations = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  // -- P-MIG-01 --------------------------------------------------------------
  if (migrations.length > 0) {
    pass('P-MIG-01', 'a migration exists', `${migrations.length}: ${migrations.join(', ')}`);
  } else {
    fail('P-MIG-01', 'a migration exists', 'no migration directories', 'Run prisma migrate dev.');
    return [];
  }

  const sqlByMigration = new Map();
  for (const name of migrations) {
    const file = path.join(dir, name, 'migration.sql');
    sqlByMigration.set(name, readIfExists(file) ?? '');
  }
  const allSql = [...sqlByMigration.values()].join('\n');

  // -- P-MIG-02 --------------------------------------------------------------
  // Pure ASCII. Phase 12's P12-B: one non-ASCII character in a COMMENT aborted
  // the statement after it under a WIN1252 client encoding, and the migration
  // still reported success.
  const offenders = [];
  for (const [name, sql] of sqlByMigration) {
    const bytes = Buffer.from(sql, 'utf8');
    const bad = bytes.findIndex((b) => b > 127);
    if (bad !== -1) {
      const upto = sql.slice(0, Math.max(0, bad));
      offenders.push(`${name} at line ${upto.split('\n').length}`);
    }
  }
  if (offenders.length === 0) {
    pass(
      'P-MIG-02',
      'migration SQL is pure ASCII',
      `${migrations.length} file(s), no byte above 127`,
    );
  } else {
    fail(
      'P-MIG-02',
      'migration SQL is pure ASCII',
      offenders.join('; '),
      'A non-ASCII character - even inside a comment - can abort the following statement on a WIN1252 client and the migration will still report success.',
    );
  }

  // -- P-MIG-03 --------------------------------------------------------------
  // Every contracted CHECK constraint must be CREATED by the migration files.
  const createdConstraints = new Set(
    [...allSql.matchAll(/ADD\s+CONSTRAINT\s+"([a-zA-Z0-9_]+)"\s+CHECK/gi)].map((m) => m[1]),
  );
  const missingInSql = EXPECTED_CHECK_CONSTRAINTS.filter((c) => !createdConstraints.has(c));
  if (missingInSql.length === 0) {
    pass(
      'P-MIG-03',
      'the migration creates every contracted CHECK constraint',
      `${EXPECTED_CHECK_CONSTRAINTS.length} constraints present in SQL`,
    );
  } else {
    fail(
      'P-MIG-03',
      'the migration creates every contracted CHECK constraint',
      `absent from SQL: ${missingInSql.join(', ')}`,
      'Prisma cannot generate these. If a migration was regenerated they were silently dropped - restore them from git history.',
    );
  }

  // -- P-MIG-04 --------------------------------------------------------------
  // Dangerous statements. Not banned; they BLOCK pending a human reading them.
  const dangers = [];
  for (const [name, sql] of sqlByMigration) {
    for (const d of DANGEROUS_MIGRATION_PATTERNS) {
      // Strip comments first: a comment mentioning DROP TABLE is not a DROP.
      const code = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (d.pattern.test(code)) dangers.push(`${name}: ${d.label} - ${d.why}`);
    }
  }
  if (dangers.length === 0) {
    pass(
      'P-MIG-04',
      'no migration contains a destructive statement',
      'no DROP TABLE / DROP CONSTRAINT / DROP COLUMN / TRUNCATE / DELETE',
    );
  } else {
    blocked(
      'P-MIG-04',
      'no migration contains a destructive statement',
      dangers.join(' | '),
      'BLOCKED - migration requires review. Read each statement against a database that holds real records before deploying. This is never resolved automatically.',
    );
  }

  // -- P-MIG-05 --------------------------------------------------------------
  // A migration touching a consent column is a consent-model change.
  const consentTouching = [];
  for (const [name, sql] of sqlByMigration) {
    const code = sql.replace(/--[^\n]*/g, '');
    if (!/\bALTER\s+TABLE\b/i.test(code)) continue;
    for (const col of CONSENT_COLUMNS) {
      if (new RegExp(`(DROP|ALTER|RENAME)\\s+COLUMN\\s+"?${col}"?`, 'i').test(code)) {
        consentTouching.push(`${name}: ${col}`);
      }
    }
  }
  if (consentTouching.length === 0) {
    pass('P-MIG-05', 'no migration alters a consent column', `${CONSENT_COLUMNS.length} columns watched`);
  } else {
    blocked(
      'P-MIG-05',
      'no migration alters a consent column',
      consentTouching.join(' | '),
      'BLOCKED - a consent-model change must be read and approved by a person, not applied by a deploy script.',
    );
  }

  // -- P-MIG-06 --------------------------------------------------------------
  // The hand-written block must still carry its warning. This is the comment
  // that stops the next person regenerating the migration.
  const initSql = sqlByMigration.get(migrations[migrations.length - 1]) ?? '';
  if (/PRISMA WILL NOT REGENERATE/i.test(initSql) || /HAND-WRITTEN/i.test(initSql)) {
    pass(
      'P-MIG-06',
      'the hand-written constraint block is signposted',
      'the warning banner is present in the migration',
    );
  } else {
    warn(
      'P-MIG-06',
      'the hand-written constraint block is signposted',
      'no banner found',
      'Without it the next person to regenerate the migration deletes every CHECK constraint, exactly as Phase 12 did.',
    );
  }

  // -- P-MIG-07 --------------------------------------------------------------
  // The schema must not have drifted ahead of the migrations. Compared by
  // model/field names rather than by running Prisma, so this works offline.
  const schema = readIfExists('prisma/schema.prisma') ?? '';
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
  const mapped = [...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map((m) => m[1]);
  const tablesInSql = new Set(
    [...allSql.matchAll(/CREATE\s+TABLE\s+"([a-z_]+)"/gi)].map((m) => m[1]),
  );
  const notInSql = mapped.filter((t) => !tablesInSql.has(t));
  if (models.length === mapped.length && notInSql.length === 0) {
    pass(
      'P-MIG-07',
      'every model in schema.prisma has a table in a migration',
      `${models.length} models, ${tablesInSql.size} tables created`,
    );
  } else {
    fail(
      'P-MIG-07',
      'every model in schema.prisma has a table in a migration',
      notInSql.length
        ? `no CREATE TABLE for: ${notInSql.join(', ')}`
        : `${models.length} models but ${mapped.length} @@map directives`,
      'The schema has changed without a migration. Create one - and check the CHECK constraints survived.',
    );
  }

  return migrations;
}

/* ======================================================== 6. DATABASE ==== */

async function checkDatabase(migrations) {
  section('6. DATABASE');

  const url = env.DATABASE_URL;
  if (!url) {
    const evidence = 'DATABASE_URL is not set, so nothing about the schema can be verified';
    const remedy =
      'Start the local database with `npm run db:test` and export DATABASE_URL, or point this at the target environment.';
    if (IS_PRODUCTION_TARGET) {
      fail('P-DB-00', 'the database is reachable', evidence, remedy);
    } else {
      blocked('P-DB-00', 'the database is reachable', evidence, remedy);
    }
    // Everything downstream is genuinely untested. Say so rather than skipping.
    for (const [id, description] of [
      ['P-DB-01', 'PostgreSQL version is supported'],
      ['P-DB-02', 'every expected table exists'],
      ['P-DB-03', 'every expected enum exists'],
      ['P-DB-04', 'every consent-critical CHECK constraint exists BY NAME'],
      ['P-DB-05', 'every other CHECK constraint exists BY NAME'],
      ['P-DB-06', 'no unexpected CHECK constraint exists'],
      ['P-DB-07', 'every unique constraint exists'],
      ['P-DB-08', 'every foreign key exists with the right delete behaviour'],
      ['P-DB-09', 'consent columns are NOT NULL with safe defaults'],
      ['P-DB-10', 'every migration on disk is applied'],
      ['P-DB-11', 'no migration is recorded as failed'],
      ['P-DB-12', 'content tables are empty'],
    ]) {
      notApplicable(id, description, 'no database connection');
    }
    return;
  }

  let prisma;
  try {
    const { PrismaClient } = await import('../src/generated/prisma/client.ts');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    const [{ version }] = await prisma.$queryRawUnsafe('SELECT version()');
    const info = describeDatabaseUrl(url);
    pass(
      'P-DB-00',
      'the database is reachable',
      `${info.host}/${info.database} - ${String(version).split(',')[0]}`,
    );

    // -- P-DB-01 -------------------------------------------------------------
    const major = Number(/PostgreSQL (\d+)/.exec(String(version))?.[1] ?? 0);
    if (major >= RUNTIME.postgresMinimumMajor) {
      pass(
        'P-DB-01',
        'PostgreSQL version is supported',
        `major ${major} >= ${RUNTIME.postgresMinimumMajor}`,
      );
    } else {
      fail(
        'P-DB-01',
        'PostgreSQL version is supported',
        `major ${major} is below ${RUNTIME.postgresMinimumMajor}`,
        `Use PostgreSQL ${RUNTIME.postgresMinimumMajor} or newer.`,
      );
    }

    // -- P-DB-02 -------------------------------------------------------------
    const tableRows = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const tables = new Set(tableRows.map((r) => r.table_name));
    const missingTables = EXPECTED_TABLES.filter((t) => !tables.has(t));
    const extraTables = [...tables].filter(
      (t) => !EXPECTED_TABLES.includes(t) && t !== '_prisma_migrations',
    );
    if (missingTables.length === 0 && extraTables.length === 0) {
      pass('P-DB-02', 'every expected table exists', `${EXPECTED_TABLES.length} tables, no extras`);
    } else if (missingTables.length > 0) {
      fail(
        'P-DB-02',
        'every expected table exists',
        `missing: ${missingTables.join(', ')}`,
        'Run `npm run db:migrate` against this database.',
      );
    } else {
      warn(
        'P-DB-02',
        'every expected table exists',
        `unexpected table(s): ${extraTables.join(', ')}`,
        'An extra table is usually a dropped model whose migration never ran, or a leftover from manual work.',
      );
    }

    // -- P-DB-03 -------------------------------------------------------------
    const enumRows = await prisma.$queryRawUnsafe(
      `SELECT t.typname AS name FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'e' AND n.nspname = 'public'`,
    );
    const enums = new Set(enumRows.map((r) => r.name));
    const missingEnums = EXPECTED_ENUMS.filter((e) => !enums.has(e));
    if (missingEnums.length === 0) {
      pass('P-DB-03', 'every expected enum exists', `${EXPECTED_ENUMS.length} enums`);
    } else {
      fail(
        'P-DB-03',
        'every expected enum exists',
        `missing: ${missingEnums.join(', ')}`,
        'Run the migration.',
      );
    }

    // -- P-DB-04 / 05 / 06 ---------------------------------------------------
    // THE CHECK THAT PHASE 12 EXISTS FOR. By name, never by count.
    const constraintRows = await prisma.$queryRawUnsafe(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE contype = 'c' AND connamespace = 'public'::regnamespace`,
    );
    const present = new Map(constraintRows.map((r) => [r.name, r.definition]));

    const missingConsent = CONSENT_CRITICAL_CONSTRAINTS.filter((c) => !present.has(c));
    if (missingConsent.length === 0) {
      pass(
        'P-DB-04',
        'every consent-critical CHECK constraint exists BY NAME',
        `${CONSENT_CRITICAL_CONSTRAINTS.length}/${CONSENT_CRITICAL_CONSTRAINTS.length} present`,
      );
    } else {
      fail(
        'P-DB-04',
        'every consent-critical CHECK constraint exists BY NAME',
        `MISSING: ${missingConsent.join(', ')}`,
        'The database can publish a student record without the consent that justifies it. Do not deploy. Prisma silently drops these when a migration is regenerated - restore them and re-apply.',
      );
    }

    const otherExpected = EXPECTED_CHECK_CONSTRAINTS.filter(
      (c) => !CONSENT_CRITICAL_CONSTRAINTS.includes(c),
    );
    const missingOther = otherExpected.filter((c) => !present.has(c));
    if (missingOther.length === 0) {
      pass(
        'P-DB-05',
        'every other CHECK constraint exists BY NAME',
        `${otherExpected.length}/${otherExpected.length} present`,
      );
    } else {
      fail(
        'P-DB-05',
        'every other CHECK constraint exists BY NAME',
        `MISSING: ${missingOther.join(', ')}`,
        'Restore from the migration and re-apply.',
      );
    }

    const unexpected = [...present.keys()].filter(
      (c) => !EXPECTED_CHECK_CONSTRAINTS.includes(c) && !c.endsWith('_not_null'),
    );
    if (unexpected.length === 0) {
      pass(
        'P-DB-06',
        'no unexpected CHECK constraint exists',
        `${present.size} constraints, all contracted`,
      );
    } else {
      warn(
        'P-DB-06',
        'no unexpected CHECK constraint exists',
        `unexpected: ${unexpected.join(', ')}`,
        'Either add it to the contract or find out who added it to the database by hand.',
      );
    }

    // -- P-DB-07 -------------------------------------------------------------
    const indexRows = await prisma.$queryRawUnsafe(
      `SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const indexes = new Set(indexRows.map((r) => r.name));
    const missingUnique = EXPECTED_UNIQUE_CONSTRAINTS.filter((c) => !indexes.has(c));
    if (missingUnique.length === 0) {
      pass(
        'P-DB-07',
        'every unique constraint exists',
        EXPECTED_UNIQUE_CONSTRAINTS.join(', '),
      );
    } else {
      fail(
        'P-DB-07',
        'every unique constraint exists',
        `missing: ${missingUnique.join(', ')}`,
        'toppers_importRef_key is what stops an import creating a duplicate student. Re-apply the migration.',
      );
    }

    // -- P-DB-08 -------------------------------------------------------------
    const fkRows = await prisma.$queryRawUnsafe(
      // confdeltype is a `char`; the Prisma driver cannot deserialize that type,
      // so it is cast in SQL rather than in JavaScript.
      `SELECT conname AS name, confdeltype::text AS del FROM pg_constraint
        WHERE contype = 'f' AND connamespace = 'public'::regnamespace`,
    );
    const fks = new Map(fkRows.map((r) => [r.name, r.del]));
    const DEL = { c: 'CASCADE', n: 'SET NULL', a: 'NO ACTION', r: 'RESTRICT', d: 'SET DEFAULT' };
    const fkProblems = [];
    for (const expected of EXPECTED_FOREIGN_KEYS) {
      const actual = fks.get(expected.name);
      if (!actual) fkProblems.push(`${expected.name} missing`);
      else if (DEL[actual] !== expected.onDelete) {
        fkProblems.push(`${expected.name} deletes ${DEL[actual]}, expected ${expected.onDelete}`);
      }
    }
    if (fkProblems.length === 0) {
      pass(
        'P-DB-08',
        'every foreign key exists with the right delete behaviour',
        EXPECTED_FOREIGN_KEYS.map((f) => `${f.name}=${f.onDelete}`).join(', '),
      );
    } else {
      fail(
        'P-DB-08',
        'every foreign key exists with the right delete behaviour',
        fkProblems.join('; '),
        'subject_scores must CASCADE from toppers; audit_log must SET NULL so deleting an admin does not erase the audit trail.',
      );
    }

    // -- P-DB-09 -------------------------------------------------------------
    // The consent booleans must be NOT NULL and default false. A nullable
    // consent flag is a third state nobody wrote rules for.
    const colRows = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('consentResult','consentName','consentPhoto','consentStory','published')`,
    );
    const colProblems = [];
    for (const c of colRows) {
      if (c.is_nullable !== 'NO') {
        colProblems.push(`${c.table_name}.${c.column_name} is nullable`);
      }
      if (!/false/i.test(String(c.column_default ?? ''))) {
        colProblems.push(`${c.table_name}.${c.column_name} does not default to false`);
      }
    }
    if (colRows.length === 0) {
      fail(
        'P-DB-09',
        'consent columns are NOT NULL with safe defaults',
        'no consent columns found at all',
        'The consent model is absent from this database.',
      );
    } else if (colProblems.length === 0) {
      pass(
        'P-DB-09',
        'consent columns are NOT NULL with safe defaults',
        `${colRows.length} columns, all NOT NULL DEFAULT false`,
      );
    } else {
      fail(
        'P-DB-09',
        'consent columns are NOT NULL with safe defaults',
        colProblems.join('; '),
        'A consent flag must default to "no permission". Anything else means a new row is public by accident.',
      );
    }

    // -- P-DB-10 / 11 --------------------------------------------------------
    let applied = [];
    let failedMigrations = [];
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
           FROM "_prisma_migrations" ORDER BY started_at`,
      );
      applied = rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
      failedMigrations = rows.filter((r) => !r.finished_at || r.rolled_back_at);
    } catch {
      failedMigrations = null;
    }

    if (failedMigrations === null) {
      fail(
        'P-DB-10',
        'every migration on disk is applied',
        '_prisma_migrations table is missing',
        'This database has never been migrated. Run `npm run db:migrate`.',
      );
      notApplicable('P-DB-11', 'no migration is recorded as failed', 'no migration table');
    } else {
      const pending = migrations.filter((m) => !applied.includes(m));
      const unknown = applied.filter((m) => !migrations.includes(m));
      if (pending.length === 0 && unknown.length === 0) {
        pass(
          'P-DB-10',
          'every migration on disk is applied',
          `${applied.length} applied, none pending`,
        );
      } else if (pending.length > 0) {
        fail(
          'P-DB-10',
          'every migration on disk is applied',
          `pending: ${pending.join(', ')}`,
          'Run `npm run db:migrate` (prisma migrate deploy) before serving traffic.',
        );
      } else {
        blocked(
          'P-DB-10',
          'every migration on disk is applied',
          `applied but not in the repository: ${unknown.join(', ')}`,
          'BLOCKED - migration history mismatch. The database has been migrated by a version of the repository this one does not contain. Do not deploy until someone reconciles them.',
        );
      }

      if (failedMigrations.length === 0) {
        pass('P-DB-11', 'no migration is recorded as failed', 'all entries finished cleanly');
      } else {
        blocked(
          'P-DB-11',
          'no migration is recorded as failed',
          failedMigrations.map((m) => m.migration_name).join(', '),
          'BLOCKED - a partially applied migration. Resolve it by hand; never re-run a failed migration blindly against a database holding records.',
        );
      }
    }

    // -- P-DB-12 -------------------------------------------------------------
    const counts = [];
    let contentRows = 0;
    for (const table of CONTENT_TABLES) {
      if (!tables.has(table)) continue;
      const [{ n }] = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM "${table}"`,
      );
      contentRows += n;
      if (n > 0) counts.push(`${table}=${n}`);
    }
    const operational = [];
    for (const table of OPERATIONAL_TABLES) {
      if (!tables.has(table)) continue;
      const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}"`);
      if (n > 0) operational.push(`${table}=${n}`);
    }

    if (IS_PRODUCTION_TARGET) {
      // A production database is EXPECTED to hold data once launched. Report it.
      pass(
        'P-DB-12',
        'content row counts are reported',
        contentRows === 0
          ? 'all content tables empty'
          : `${contentRows} content rows (${counts.join(', ')})`,
      );
    } else if (contentRows === 0) {
      pass(
        'P-DB-12',
        'content tables are empty (no real or fake institute data)',
        `${CONTENT_TABLES.length} tables, 0 rows${operational.length ? `; operational: ${operational.join(', ')}` : ''}`,
      );
    } else {
      fail(
        'P-DB-12',
        'content tables are empty (no real or fake institute data)',
        counts.join(', '),
        'Phase 13 expects a clean local database. Remove test fixtures - every one should carry a ZZTEST-style prefix.',
      );
    }
  } catch (error) {
    // A distinct id, deliberately. The first version reported this under
    // P-DB-00, which had already passed - so the summary listed one id twice
    // with opposite verdicts, and there was nothing to say that the checks
    // after the throw had never run at all.
    const ran = new Set(results.map((r) => r.id));
    fail(
      'P-DB-ERROR',
      'the database checks completed',
      redact(error instanceof Error ? error.message : String(error)),
      'Check DATABASE_URL, the host firewall, and whether the database is running.',
    );
    for (const [id, description] of [
      ['P-DB-01', 'PostgreSQL version is supported'],
      ['P-DB-02', 'every expected table exists'],
      ['P-DB-03', 'every expected enum exists'],
      ['P-DB-04', 'every consent-critical CHECK constraint exists BY NAME'],
      ['P-DB-05', 'every other CHECK constraint exists BY NAME'],
      ['P-DB-06', 'no unexpected CHECK constraint exists'],
      ['P-DB-07', 'every unique constraint exists'],
      ['P-DB-08', 'every foreign key exists with the right delete behaviour'],
      ['P-DB-09', 'consent columns are NOT NULL with safe defaults'],
      ['P-DB-10', 'every migration on disk is applied'],
      ['P-DB-11', 'no migration is recorded as failed'],
      ['P-DB-12', 'content tables are empty'],
    ]) {
      if (!ran.has(id)) blocked(id, description, 'not reached - the database checks stopped early');
    }
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

/* ============================================== 7. BUILD AND BUNDLES ===== */

function checkBuildArtefacts() {
  section('7. BUILD OUTPUT AND CLIENT BUNDLES');

  const dir = '.next';
  if (!existsSync(dir)) {
    blocked(
      'P-BUILD-01',
      'a production build exists to inspect',
      '.next is missing',
      'Run `npm run build` first. Without it the client bundles cannot be scanned.',
    );
    for (const [id, description] of [
      ['P-BUILD-02', 'no secret appears in client JavaScript'],
      ['P-BUILD-03', 'no server-only module reaches the browser'],
      ['P-BUILD-04', 'import and export internals stay out of public chunks'],
    ]) {
      notApplicable(id, description, 'no build to scan');
    }
    return;
  }

  const staticDir = path.join(dir, 'static');
  const chunks = walk(existsSync(staticDir) ? staticDir : dir).filter((f) => f.endsWith('.js'));

  // -- P-BUILD-01 ------------------------------------------------------------
  if (chunks.length > 0) {
    pass('P-BUILD-01', 'a production build exists to inspect', `${chunks.length} client chunks`);
  } else {
    blocked(
      'P-BUILD-01',
      'a production build exists to inspect',
      '.next exists but contains no client JavaScript',
      'Run `npm run build`.',
    );
    return;
  }

  // -- P-BUILD-02 / 03 -------------------------------------------------------
  const hits = [];
  for (const file of chunks) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const rule of CLIENT_BUNDLE_FORBIDDEN) {
      if (rule.pattern.test(text)) {
        hits.push({ file: path.relative(dir, file), ...rule });
      }
    }
    // Actual secret VALUES, not just their names.
    for (const spec of ENV_CONTRACT.filter((s) => s.secret)) {
      const value = env[spec.name];
      if (value && value.length >= 12 && text.includes(value)) {
        hits.push({
          file: path.relative(dir, file),
          id: 'literal-secret',
          severity: 'critical',
          label: `the literal value of ${spec.name}`,
        });
      }
    }
  }

  const criticalHits = hits.filter((h) => h.severity === 'critical');
  const highHits = hits.filter((h) => h.severity === 'high');

  if (criticalHits.length === 0) {
    pass(
      'P-BUILD-02',
      'no secret appears in client JavaScript',
      `${chunks.length} chunks scanned for ${CLIENT_BUNDLE_FORBIDDEN.length} patterns plus live secret values`,
    );
  } else {
    fail(
      'P-BUILD-02',
      'no secret appears in client JavaScript',
      [...new Set(criticalHits.map((h) => `${h.label} in ${h.file}`))].slice(0, 5).join(' | '),
      'Do not deploy. Find the import that crossed the server boundary; `server-only` should have made it a build error.',
    );
  }

  if (highHits.length === 0) {
    pass('P-BUILD-03', 'no server-only module reaches the browser', 'no build-machine paths, no Prisma');
  } else {
    warn(
      'P-BUILD-03',
      'no server-only module reaches the browser',
      [...new Set(highHits.map((h) => `${h.label} in ${h.file}`))].slice(0, 3).join(' | '),
      'Usually a source map path or a dev-only import. Confirm it carries nothing sensitive.',
    );
  }

  // -- P-BUILD-04 ------------------------------------------------------------
  const importLeaks = [];
  for (const file of chunks) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const marker of ADMIN_ONLY_MARKERS) {
      if (text.includes(marker)) importLeaks.push(`${marker} in ${path.relative(dir, file)}`);
    }
  }
  /**
   * An admin chunk legitimately contains these markers - `import-form.tsx` is
   * a client component and `wouldBecomePublic` is a word on its screen. The
   * only finding is a chunk that a PUBLIC page downloads.
   *
   * WHERE THE PUBLIC CHUNK LIST COMES FROM. Next 16 on Turbopack writes no
   * `app-build-manifest.json`, so the first version of this check could not
   * attribute anything and warned instead - which is a check that does nothing
   * while looking like it does something.
   *
   * The prerendered HTML is better than a manifest anyway: it is what the
   * browser actually receives, so the script tags in it are the definitive
   * answer to "what does this page download", and it cannot go stale relative
   * to the build the way a separate manifest can.
   */
  const appDir = path.join(dir, 'server', 'app');
  const prerendered = existsSync(appDir)
    ? walk(appDir).filter((f) => f.endsWith('.html') && !f.includes(`${path.sep}admin`))
    : [];

  const publicChunks = new Set();
  for (const file of prerendered) {
    const html = readIfExists(file) ?? '';
    for (const m of html.matchAll(/\/_next\/static\/[^"'\s]+\.js/g)) {
      publicChunks.add(path.basename(m[0]));
    }
  }

  if (publicChunks.size === 0) {
    warn(
      'P-BUILD-04',
      'import and export internals stay out of public chunks',
      'no prerendered public HTML found to attribute chunks with',
      'Run `npm run build`, then re-run. scripts/verify-import.mjs also checks this over HTTP.',
    );
  } else {
    const publicLeaks = importLeaks.filter((l) =>
      [...publicChunks].some((c) => l.endsWith(c)),
    );
    // /results and /stories render dynamically, so they leave no HTML here.
    // Say so rather than implying full coverage.
    const coverage = `${prerendered.length} prerendered public pages, ${publicChunks.size} distinct chunks`;
    if (publicLeaks.length === 0) {
      pass(
        'P-BUILD-04',
        'import and export internals stay out of public chunks',
        `${coverage}; none carries any of ${ADMIN_ONLY_MARKERS.length} admin markers (/results and /stories are dynamic - covered over HTTP by verify:import)`,
      );
    } else {
      fail(
        'P-BUILD-04',
        'import and export internals stay out of public chunks',
        publicLeaks.slice(0, 3).join(' | '),
        'A public page is downloading admin code. Find the import that crosses the boundary and split it.',
      );
    }
  }
}

/* ============================ 7b. BUILD-TIME ENVIRONMENT (P13-A) ========= */

/**
 * NEXT_PUBLIC_SITE_URL IS BAKED IN AT BUILD TIME, NOT READ AT RUNTIME.
 *
 * Next replaces every `process.env.NEXT_PUBLIC_*` with a literal during the
 * build. Setting it only in the hosting provider's runtime environment - which
 * is where an operator naturally puts environment variables, and where the other
 * three DO work - leaves the built output carrying whatever was set when the
 * build ran.
 *
 * Phase 13 measured what that costs, against a real production build:
 *
 *   - every canonical URL pointed at http://localhost:3000
 *   - the JSON-LD @id values did too
 *   - so did every <loc> in sitemap.xml
 *   - and `hasRealDomain()` read the same baked value, so `isIndexable()` could
 *     never return true - the site would stay noindex no matter what the
 *     operator set SITE_IS_LAUNCHED to
 *
 * The failure is silent and it is worse than a crash: the site works, looks
 * correct, and tells Google that the real content lives on localhost.
 *
 * There is no way to detect this at runtime from inside the app, because by
 * then the literal IS the value. It has to be caught here, by comparing what
 * the build baked against what the environment now says.
 */
function checkBuildTimeEnvironment() {
  section('7b. BUILD-TIME ENVIRONMENT');

  const indexHtml = readIfExists(path.join('.next', 'server', 'app', 'index.html'));
  const configured = env.NEXT_PUBLIC_SITE_URL;

  if (!indexHtml) {
    notApplicable(
      'P-BUILD-05',
      'the built output carries the configured site URL',
      'no prerendered homepage to inspect - run `npm run build`',
    );
    return;
  }

  const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/.exec(indexHtml)?.[1];
  if (!canonical) {
    warn(
      'P-BUILD-05',
      'the built output carries the configured site URL',
      'no canonical link in the prerendered homepage',
      'Check generateMetadata. A page with no canonical cannot be checked for this.',
    );
    return;
  }

  let bakedOrigin;
  try {
    bakedOrigin = new URL(canonical).origin;
  } catch {
    fail(
      'P-BUILD-05',
      'the built output carries the configured site URL',
      `the canonical is not an absolute URL: ${canonical}`,
      'Canonicals must be absolute for a search engine to use them.',
    );
    return;
  }

  if (!configured) {
    // Nothing to compare against. Report what the build actually contains, so
    // an operator can see it rather than assume it.
    const looksLocal = looksLikeLocalhost(bakedOrigin);
    if (IS_PRODUCTION_TARGET) {
      fail(
        'P-BUILD-05',
        'the built output carries the configured site URL',
        `the build baked in ${bakedOrigin}, and NEXT_PUBLIC_SITE_URL is not set here`,
        'Set NEXT_PUBLIC_SITE_URL and BUILD AGAIN. Setting it only at runtime does not change what is already baked in.',
      );
    } else {
      warn(
        'P-BUILD-05',
        'the built output carries the configured site URL',
        `the build baked in ${bakedOrigin}${looksLocal ? ' (local, as expected for a development build)' : ''}`,
        'Before deploying, build with NEXT_PUBLIC_SITE_URL set to the live origin.',
      );
    }
    return;
  }

  const configuredOrigin = (() => {
    try {
      return new URL(configured).origin;
    } catch {
      return null;
    }
  })();

  if (configuredOrigin === null) {
    fail(
      'P-BUILD-05',
      'the built output carries the configured site URL',
      `NEXT_PUBLIC_SITE_URL is not a valid URL`,
      'Set it to an absolute origin such as https://example.com, with no trailing slash.',
    );
  } else if (bakedOrigin === configuredOrigin) {
    pass(
      'P-BUILD-05',
      'the built output carries the configured site URL',
      `both the build and the environment say ${bakedOrigin}`,
    );
  } else {
    fail(
      'P-BUILD-05',
      'the built output carries the configured site URL',
      `the build baked in ${bakedOrigin}, but NEXT_PUBLIC_SITE_URL is now ${configuredOrigin}`,
      'REBUILD. NEXT_PUBLIC_ variables are replaced with literals during the build, so changing this at runtime does nothing: canonicals, JSON-LD and the sitemap would all keep pointing at the old origin, and the launch switch would never see a real domain.',
    );
  }
}

/* ========================================================== 8. ROUTES ==== */

function checkRoutes() {
  section('8. ROUTE INVENTORY');

  // Derive the routes that actually exist from the filesystem, then compare
  // against the contract. A route nobody wrote a rule for is the finding.
  const appDir = 'src/app';
  const files = walk(appDir);
  const discovered = new Set();

  for (const file of files) {
    const rel = path.relative(appDir, file).split(path.sep).join('/');
    const base = path.basename(rel);
    if (!/^(page|route)\.(ts|tsx)$/.test(base)) continue;
    // The root page is `page.tsx` with no leading directory, so the segment
    // stripper needs the leading-slash case to be optional. Without that the
    // root route was discovered as "/page.tsx" and reported as undocumented.
    const routePath =
      '/' +
      rel
        .replace(/(^|\/)(page|route)\.(ts|tsx)$/, '')
        .split('/')
        .filter((seg) => seg !== '' && !/^\(.*\)$/.test(seg)) // route groups are not URL segments
        .join('/');
    discovered.add(routePath.replace(/\/$/, '') || '/');
  }
  // Metadata routes are files, not pages.
  if (existsSync(path.join(appDir, 'robots.ts'))) discovered.add('/robots.txt');
  if (existsSync(path.join(appDir, 'sitemap.ts'))) discovered.add('/sitemap.xml');
  discovered.delete('/robots');
  discovered.delete('/sitemap');

  const contracted = new Set(ROUTES.map((r) => r.path));
  const undocumented = [...discovered].filter((r) => !contracted.has(r));
  const missing = [...contracted].filter(
    (r) => !discovered.has(r) && r !== '/icon.png',
  );

  // -- P-ROUTE-01 ------------------------------------------------------------
  if (undocumented.length === 0) {
    pass(
      'P-ROUTE-01',
      'every route on disk is in the contract',
      `${discovered.size} routes discovered`,
    );
  } else {
    fail(
      'P-ROUTE-01',
      'every route on disk is in the contract',
      `undocumented: ${undocumented.join(', ')}`,
      'Add each to ROUTES in src/lib/deployment-contract.ts with its auth, caching and crawlability rules. An undocumented route is one nobody decided the rules for.',
    );
  }

  // -- P-ROUTE-02 ------------------------------------------------------------
  if (missing.length === 0) {
    pass('P-ROUTE-02', 'every contracted route still exists', `${contracted.size} contracted`);
  } else {
    warn(
      'P-ROUTE-02',
      'every contracted route still exists',
      `in the contract but not on disk: ${missing.join(', ')}`,
      'Remove them from the contract, or find out why the route disappeared.',
    );
  }

  // -- P-ROUTE-03 ------------------------------------------------------------
  // Every admin route must be under the proxy matcher.
  const proxySrc = readIfExists('src/proxy.ts') ?? '';
  const matcher = /matcher:\s*\[([^\]]*)\]/.exec(proxySrc)?.[1] ?? '';
  const adminRoutes = ROUTES.filter((r) => r.path.startsWith('/admin'));
  if (matcher.includes('/admin/:path*')) {
    pass(
      'P-ROUTE-03',
      'every admin route is covered by the proxy matcher',
      `${adminRoutes.length} admin routes under /admin/:path*`,
    );
  } else {
    fail(
      'P-ROUTE-03',
      'every admin route is covered by the proxy matcher',
      `matcher is ${matcher || 'absent'}`,
      'Without it the admin loses its nonce CSP and its no-store cache header.',
    );
  }

  // -- P-ROUTE-04 ------------------------------------------------------------
  // Every admin page must independently enforce authorization. The proxy is
  // explicitly NOT the boundary - it only checks that a cookie is present.
  const adminFiles = files.filter(
    (f) =>
      f.includes(`app${path.sep}admin`) &&
      /(page|route|actions)\.(ts|tsx)$/.test(path.basename(f)),
  );
  const unguarded = [];
  for (const file of adminFiles) {
    const rel = path.relative('.', file).split(path.sep).join('/');
    if (rel.includes('/login/') || rel.includes('/logout/')) continue;
    const text = readIfExists(file) ?? '';
    if (!/requireAdmin\b|requireAdminOrNull\b|getCurrentAdmin\b/.test(text)) {
      // A form component or a pure layout is fine; a page or action is not.
      if (/export\s+default\s+async\s+function|['"]use server['"]/.test(text)) {
        unguarded.push(rel);
      }
    }
  }
  if (unguarded.length === 0) {
    pass(
      'P-ROUTE-04',
      'every admin page and action calls an authorization check',
      `${adminFiles.length} admin modules inspected`,
    );
  } else {
    fail(
      'P-ROUTE-04',
      'every admin page and action calls an authorization check',
      unguarded.join(', '),
      'The proxy only checks that a cookie EXISTS - anyone can set a cookie. Each page must call requireAdmin() and each action requireAdminOrNull().',
    );
  }

  // -- P-ROUTE-05 ------------------------------------------------------------
  // Route handlers are not Server Actions: they get no automatic CSRF check.
  const handlers = files.filter((f) => path.basename(f) === 'route.ts');
  const unprotected = [];
  for (const file of handlers) {
    const text = readIfExists(file) ?? '';
    const rel = path.relative('.', file).split(path.sep).join('/');
    if (!/rejectCrossOrigin|rejectForeignOrigin/.test(text)) unprotected.push(rel);
  }
  if (unprotected.length === 0) {
    pass(
      'P-ROUTE-05',
      'every route handler enforces an origin check',
      `${handlers.length} handlers`,
    );
  } else {
    fail(
      'P-ROUTE-05',
      'every route handler enforces an origin check',
      unprotected.join(', '),
      'Server Actions get an automatic Origin check; route handlers do NOT. Use rejectCrossOrigin for mutations, rejectForeignOrigin for GETs.',
    );
  }
}

/* ================================================ 9. CONFIG INTEGRITY ==== */

function checkConfiguration() {
  section('9. CONFIGURATION INTEGRITY');

  const nextConfig = readIfExists('next.config.ts') ?? '';

  // -- P-CFG-01 --------------------------------------------------------------
  const requiredHeaderNames = [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'X-Frame-Options',
    'Permissions-Policy',
    'Strict-Transport-Security',
  ];
  const absent = requiredHeaderNames.filter((h) => !nextConfig.includes(h));
  if (absent.length === 0) {
    pass(
      'P-CFG-01',
      'every security header is configured',
      `${requiredHeaderNames.length} headers in next.config.ts`,
    );
  } else {
    fail(
      'P-CFG-01',
      'every security header is configured',
      `missing: ${absent.join(', ')}`,
      'Add it to securityHeaders in next.config.ts.',
    );
  }

  // -- P-CFG-02 --------------------------------------------------------------
  if (/typescript:\s*\{\s*ignoreBuildErrors:\s*false/.test(nextConfig)) {
    pass('P-CFG-02', 'type errors fail the build', 'ignoreBuildErrors: false');
  } else if (/ignoreBuildErrors:\s*true/.test(nextConfig)) {
    fail(
      'P-CFG-02',
      'type errors fail the build',
      'ignoreBuildErrors is true',
      'A client project must never deploy with type errors suppressed.',
    );
  } else {
    pass('P-CFG-02', 'type errors fail the build', 'not suppressed (Next default)');
  }

  // -- P-CFG-03 --------------------------------------------------------------
  if (/poweredByHeader:\s*false/.test(nextConfig)) {
    pass('P-CFG-03', 'the X-Powered-By header is disabled', 'poweredByHeader: false');
  } else {
    warn(
      'P-CFG-03',
      'the X-Powered-By header is disabled',
      'not set',
      'Free version disclosure. Set poweredByHeader: false.',
    );
  }

  // -- P-CFG-04 --------------------------------------------------------------
  // The two upload limits must stay in the documented order: ours below Next's,
  // so our message is the one a teacher meets. Phase 12's P12-E.
  const bodyLimit = /bodySizeLimit:\s*'(\d+)mb'/.exec(nextConfig)?.[1];
  const runSrc = readIfExists('src/lib/import/run.ts') ?? '';
  const uploadLimit = /maxBytes:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(runSrc)?.[1];
  if (bodyLimit && uploadLimit) {
    if (Number(bodyLimit) > Number(uploadLimit)) {
      pass(
        'P-CFG-04',
        "the app's upload limit fires before the framework's",
        `app ${uploadLimit}MB < framework ${bodyLimit}MB`,
      );
    } else {
      fail(
        'P-CFG-04',
        "the app's upload limit fires before the framework's",
        `app ${uploadLimit}MB >= framework ${bodyLimit}MB`,
        'The teacher gets a 500 instead of a sentence they can act on. Raise serverActions.bodySizeLimit above UPLOAD_LIMITS.maxBytes.',
      );
    }
  } else {
    warn(
      'P-CFG-04',
      "the app's upload limit fires before the framework's",
      'could not read one of the two limits',
      'Check next.config.ts serverActions.bodySizeLimit against UPLOAD_LIMITS.maxBytes.',
    );
  }

  // -- P-CFG-05 --------------------------------------------------------------
  // The admin CSP must be a nonce policy, and the baseline must not be.
  const proxySrc = readIfExists('src/proxy.ts') ?? '';
  const hasNonce = /nonce-\$\{nonce\}/.test(proxySrc) && /strict-dynamic/.test(proxySrc);
  if (hasNonce) {
    pass(
      'P-CFG-05',
      'the admin runs a nonce CSP',
      "script-src carries a nonce and 'strict-dynamic'",
    );
  } else {
    fail(
      'P-CFG-05',
      'the admin runs a nonce CSP',
      'no nonce policy found in src/proxy.ts',
      'The admin holds the session cookie and every student record. It is where the strict policy belongs.',
    );
  }

  // -- P-CFG-06 --------------------------------------------------------------
  // The baseline must still exist as a fallback if the proxy fails to run.
  if (/frame-ancestors 'none'/.test(nextConfig)) {
    pass(
      'P-CFG-06',
      'a baseline CSP covers every route including /admin',
      'fail-safe: admin falls back to the baseline, not to no policy',
    );
  } else {
    fail(
      'P-CFG-06',
      'a baseline CSP covers every route including /admin',
      'no baseline frame-ancestors directive',
      'If the proxy ever fails to run, admin pages must fall back to a policy rather than to none.',
    );
  }

  // -- P-CFG-07 --------------------------------------------------------------
  // Session cookie attributes, read from the source rather than assumed.
  const authSrc = readIfExists('src/lib/auth.ts') ?? '';
  const cookieProblems = [];
  if (!/httpOnly:\s*true/.test(authSrc)) cookieProblems.push('httpOnly not set');
  if (!/sameSite:\s*'lax'/.test(authSrc)) cookieProblems.push('sameSite not lax');
  if (!/secure:\s*process\.env\.NODE_ENV === 'production'/.test(authSrc)) {
    cookieProblems.push('secure is not conditional on production');
  }
  if (/domain:\s*/.test(authSrc)) cookieProblems.push('a Domain attribute is set');
  if (cookieProblems.length === 0) {
    pass(
      'P-CFG-07',
      'the session cookie is HttpOnly, SameSite=Lax, Secure in production, host-only',
      'all four attributes correct in src/lib/auth.ts',
    );
  } else {
    fail(
      'P-CFG-07',
      'the session cookie is HttpOnly, SameSite=Lax, Secure in production, host-only',
      cookieProblems.join('; '),
      'A session cookie readable by script, or sent to a sibling domain, is a session anyone can take.',
    );
  }

  // -- P-CFG-08 --------------------------------------------------------------
  // Secrets must throw in production rather than falling back to a dev default.
  const cryptoSrc = readIfExists('src/lib/crypto.ts') ?? '';
  const throwsInProd =
    /NODE_ENV === 'production'[\s\S]{0,200}throw new Error/.test(authSrc) &&
    /NODE_ENV === 'production'[\s\S]{0,200}throw new Error/.test(cryptoSrc);
  if (throwsInProd) {
    pass(
      'P-CFG-08',
      'a missing secret refuses to start in production',
      'both auth.ts and crypto.ts throw rather than using a generated fallback',
    );
  } else {
    fail(
      'P-CFG-08',
      'a missing secret refuses to start in production',
      'at least one secret falls back silently',
      'A generated fallback in production makes the session cookie and the form token forgeable, and nothing would be visibly wrong.',
    );
  }

  // -- P-CFG-09 --------------------------------------------------------------
  // Prisma query logging must be off in production: bound parameters include
  // names, phone numbers and message bodies.
  const dbSrc = readIfExists('src/lib/db.ts') ?? '';
  if (/log:\s*process\.env\.NODE_ENV === 'development'/.test(dbSrc)) {
    pass(
      'P-CFG-09',
      'Prisma query logging is off in production',
      "only ['error'] outside development",
    );
  } else if (/log:\s*\[[^\]]*'query'/.test(dbSrc)) {
    fail(
      'P-CFG-09',
      'Prisma query logging is off in production',
      "'query' logging is unconditional",
      'Query logs include bound parameters: names, phone numbers, message bodies. They must not reach a log aggregator.',
    );
  } else {
    warn(
      'P-CFG-09',
      'Prisma query logging is off in production',
      'could not confirm the log configuration',
      'Read src/lib/db.ts.',
    );
  }
}

/* ======================================================== 10. SUMMARY ==== */

function summarise() {
  const required = results.filter((r) => r.required);
  const passed = results.filter((r) => r.status === 'PASS');
  const failed = results.filter((r) => r.status === 'FAIL');
  const warnings = results.filter((r) => r.status === 'WARN');
  const blockers = results.filter((r) => r.status === 'BLOCKED');
  const na = results.filter((r) => r.status === 'NOT APPLICABLE');

  const isBlocked = failed.length > 0 || blockers.length > 0;

  say('');
  say('='.repeat(72));
  say(`DEPLOYMENT PRE-FLIGHT - target: ${TARGET}`);
  say('='.repeat(72));
  say('');
  say(`  REQUIRED CHECKS: ${required.length}`);
  say(`  PASSED:          ${passed.length}`);
  say(`  FAILED:          ${failed.length}`);
  say(`  WARNINGS:        ${warnings.length}`);
  say(`  BLOCKED:         ${blockers.length}`);
  say(`  NOT APPLICABLE:  ${na.length}`);
  say('');

  const launchCheck = results.find((r) => r.id === 'P-LAUNCH-01');
  say(`  LAUNCH SWITCH: ${launchCheck?.evidence.includes('= false') ? 'OFF' : 'SEE P-LAUNCH-01'}`);
  say('');
  say(`  BLOCKED: ${isBlocked}`);
  say('');

  if (failed.length > 0) {
    say('  MUST FIX BEFORE DEPLOYING:');
    for (const f of failed) say(`    ${f.id}  ${f.description}`);
    say('');
  }
  if (blockers.length > 0) {
    say('  REQUIRES HUMAN REVIEW:');
    for (const b of blockers) say(`    ${b.id}  ${b.description}`);
    say('');
  }
  if (warnings.length > 0) {
    say('  WARNINGS (not blocking):');
    for (const w of warnings) say(`    ${w.id}  ${w.description}`);
    say('');
  }
  if (na.length > 0) {
    say('  NOT VERIFIED IN THIS RUN:');
    for (const n of na) say(`    ${n.id}  ${n.description} - ${n.evidence}`);
    say('');
  }

  say(
    isBlocked
      ? '  RESULT: NOT SAFE TO DEPLOY.'
      : warnings.length > 0
        ? '  RESULT: SAFE TO DEPLOY, with the warnings above understood.'
        : '  RESULT: SAFE TO DEPLOY.',
  );
  say('='.repeat(72));

  if (JSON_OUT) {
    const payload = {
      generatedAt: new Date().toISOString(),
      target: TARGET,
      deep: DEEP,
      totals: {
        required: required.length,
        passed: passed.length,
        failed: failed.length,
        warnings: warnings.length,
        blocked: blockers.length,
        notApplicable: na.length,
      },
      blocked: isBlocked,
      checks: results,
    };
    // Written SYNCHRONOUSLY, and the confirmation is printed only after the
    // write returns. The first version used a dynamic import().then(), and the
    // process called exit() before the promise resolved - so it announced a
    // file it had not written. A verifier that reports work it did not do is
    // the one bug this whole phase exists to eliminate.
    const out = JSON.stringify(payload, null, 2);
    try {
      writeFileSync(JSON_OUT, out);
      say(`  Machine-readable results written to ${JSON_OUT}`);
    } catch (error) {
      say(`  COULD NOT WRITE ${JSON_OUT}: ${redact(String(error))}`);
    }
  }

  return isBlocked;
}

/* =========================================================== main ======== */

say('');
say('COMMERCE INSIGHT - DEPLOYMENT PRE-FLIGHT');
say(`target=${TARGET}  deep=${DEEP}`);
say('This never prints a secret. Values are inspected; only answers are shown.');

checkRuntime();
checkEnvironment();
checkSecrets();
checkLaunchState();
const migrations = checkMigrations();
await checkDatabase(migrations);
checkBuildArtefacts();
checkBuildTimeEnvironment();
checkRoutes();
checkConfiguration();

const isBlocked = summarise();
exit(isBlocked ? 1 : 0);
