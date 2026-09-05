/**
 * Create or update the admin account.
 *
 *   npm run create-admin -- "sir@commerceinsight.example" "Sir"
 *   node scripts/create-admin.mjs "sir@commerceinsight.example" "Sir"
 *
 * The password is READ FROM A PROMPT, never from an argument. A password in
 * argv shows up in shell history and in the process list on a shared machine.
 *
 * There is deliberately no self-registration in the app: an admin account is
 * created by someone with server access, on purpose, once.
 */

import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { stdin, stdout, argv, exit, env, version } from 'node:process';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/lib/password.ts';
import { setAdminPassword } from '../src/lib/admin-password.ts';

/* ====================================================== environment ======= */

/**
 * LOAD `.env.local` THE WAY THE APPLICATION DOES.
 *
 * =============================================================================
 * WHAT WAS WRONG
 * =============================================================================
 * This script read `process.env.DATABASE_URL` and stopped with "DATABASE_URL is
 * not set" whenever it was run the documented way. Nothing was wrong with the
 * environment: `next dev` and `next start` load `.env.local` THEMSELVES, so the
 * application has always had the value, and a plain `node scripts/...` does not
 * — Node had no idea the file existed. The instruction in the error message
 * ("put it in .env.local first") was therefore telling the operator to do the
 * thing they had already done, which is the worst kind of error message.
 *
 * The workaround people reached for was exporting the variable by hand before
 * every run. That is fragile, it is different on PowerShell and on bash, and it
 * puts a live connection string into shell history.
 *
 * =============================================================================
 * WHY `process.loadEnvFile` AND NOT `dotenv`
 * =============================================================================
 * `dotenv` is present in node_modules and `prisma.config.ts` imports it, but it
 * is NOT a declared dependency of this project — it arrives transitively, and a
 * first-party script that depends on a package nobody declared breaks quietly
 * the day a dependency drops it.
 *
 * `process.loadEnvFile` is built into Node, so there is nothing to declare and
 * nothing to keep in step. It also has the two behaviours wanted here:
 *
 *   · it strips the quotes around a value, which `.env.local` uses;
 *   · a variable ALREADY SET in the real environment WINS over the file, which
 *     is exactly Next's own precedence. Exporting DATABASE_URL to point at
 *     something else for one command still works and is not silently ignored.
 *
 * ⚠ `.env.local` IS LOADED FIRST, AND THAT IS WHAT MAKES IT WIN.
 *
 * `process.loadEnvFile` never overwrites a variable that is already present in
 * `process.env` — the same rule that lets a real exported value beat the file
 * also means THE FIRST FILE READ WINS. This loop used to read `.env` first and
 * `.env.local` second while its comment claimed the opposite ("a local file
 * overrides a shared one"), so `.env` silently took precedence — the reverse of
 * Next's own order, where `.env.local` beats `.env`.
 *
 * Nothing was visibly wrong while both files held the same DATABASE_URL. The
 * failure it was waiting to cause is the standard layout — a shared `.env` and
 * a personal `.env.local` pointing somewhere else — where this script would
 * have created the admin account in one database while `next start` read the
 * other, and the only symptom would be a correct password rejected at
 * /admin/login.
 *
 * Reading `.env.local` first gives it precedence, which matches Next and
 * matches what this comment always said. Neither file is required to exist.
 */
function loadLocalEnv() {
  if (typeof process.loadEnvFile !== 'function') {
    console.error(
      `This script needs Node 20.12 or newer to read .env.local (running ${version}).\n` +
        'Either upgrade Node, or set DATABASE_URL in the environment before running.',
    );
    exit(1);
  }

  // Highest precedence first: loadEnvFile does not overwrite what is already set.
  const loaded = [];
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
      loaded.push(file);
    }
  }
  return loaded;
}

/**
 * Say WHERE this is about to write, without saying how to get in.
 *
 * `docs/PHASE-4.5-DB-VERIFICATION.md` sets the rule this follows: print the
 * host and the database name, "never the user, password or full string". That
 * is not a formality here — in this project's own `.env.local` the connection
 * string's PASSWORD is the part that reads like a test label, so a well-meaning
 * "which database is this?" line that printed a substring of the URL would put
 * the password on screen and into the terminal scrollback.
 *
 * So the URL is parsed and only two fields are ever read out of it.
 */
function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, database: parsed.pathname.replace(/^\//, '') || '(default)' };
  } catch {
    return null;
  }
}

/* ============================================================ arguments === */

const [, , emailArg, nameArg] = argv;

if (!emailArg || !nameArg) {
  console.error('Usage: npm run create-admin -- "<email>" "<display name>"');
  exit(1);
}

const email = emailArg.trim().toLowerCase();
const displayName = nameArg.trim();

if (!email.includes('@')) {
  console.error('That does not look like an email address.');
  exit(1);
}
if (displayName.length === 0) {
  console.error('The display name cannot be empty.');
  exit(1);
}

const loadedFiles = loadLocalEnv();

if (!env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is not set.\n' +
      (loadedFiles.length > 0
        ? `Read ${loadedFiles.join(' and ')}, but neither defines DATABASE_URL.`
        : 'No .env or .env.local file was found in the project root.') +
      '\nSee docs/PHASE-4.5-DB-VERIFICATION.md.',
  );
  exit(1);
}

const target = describeTarget(env.DATABASE_URL);
if (!target) {
  console.error('DATABASE_URL is set but is not a valid connection URL.');
  exit(1);
}

console.log(`DATABASE_URL loaded: yes${loadedFiles.length ? ` (from ${loadedFiles.join(', ')})` : ' (from the environment)'}`);
console.log(`Database host      : ${target.host}`);
console.log(`Database name      : ${target.database}`);
console.log('');

/* ============================================================== prompts === */

/**
 * Read a secret from the terminal without putting it on screen.
 *
 * =============================================================================
 * WHY THIS IS RAW MODE AND NOT `readline`
 * =============================================================================
 * The previous version asked `readline` for the line and then repainted it with
 * asterisks on every keypress. That works on a terminal, but it is a repair
 * applied AFTER the fact: readline echoes the character first, so the plaintext
 * is briefly on screen, and the masking reaches into `rl.line`, an internal.
 *
 * It also had a failure mode with real consequences. With stdin PIPED rather
 * than typed, readline echoed the whole line and the repaint never caught it -
 * measured here, the password appeared in full in the captured output. Anyone
 * driving this from a script would have written their password into a log.
 *
 * Raw mode removes the class: the terminal echoes nothing, and this function
 * decides what appears - one asterisk per character. Ctrl-C is handled
 * explicitly because raw mode stops the terminal generating SIGINT, and a
 * prompt you cannot escape is its own kind of bug.
 *
 * When stdin is NOT a terminal the line is read with NO echo whatsoever, so
 * automation stays possible without ever printing the secret.
 */
let pipedLines = null;

async function readPipedLines() {
  if (pipedLines === null) {
    const chunks = [];
    for await (const chunk of stdin) chunks.push(chunk);
    pipedLines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
  }
  return pipedLines;
}

function askHiddenTty(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          // Ctrl-C. Raw mode swallowed the signal, so leave deliberately.
          cleanup();
          stdout.write('\n');
          exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        // Ignore every other control character, including arrow-key escapes.
        if (ch < ' ') continue;
        value += ch;
        stdout.write('*');
      }
    };
    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

async function askHidden(question) {
  if (stdin.isTTY) return askHiddenTty(question);
  const lines = await readPipedLines();
  const value = lines.shift() ?? '';
  // The PROMPT is echoed so a transcript still reads sensibly. The value is not.
  stdout.write(`${question}\n`);
  return value;
}

/** A visible yes/no. Defaults to NO, because the risky answer is yes. */
async function askConfirm(question) {
  if (!stdin.isTTY) {
    const lines = await readPipedLines();
    const answer = lines.shift() ?? '';
    stdout.write(`${question} [y/N] ${answer}\n`);
    return /^y(es)?$/i.test(answer.trim());
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

/* ============================================================== database == */

const { PrismaClient } = await import('../src/generated/prisma/client.ts');
const { PrismaPg } = await import('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

try {
  /*
    LOOK BEFORE WRITING.

    `upsert` below is the documented behaviour of this script - it is titled
    "create or update" and updating is how an owner changes a forgotten
    password. What it did NOT do was say so: running it against an address that
    already existed silently replaced that account's password, with output
    ("Admin ready") identical to having created a new one.

    Email is `@unique`, so there is no duplicate-account risk either way. The
    risk is a reset nobody meant to perform, so the reset is now something the
    operator confirms rather than discovers.
  */
  const existing = await prisma.adminUser.findUnique({
    where: { email },
    select: { displayName: true, active: true, createdAt: true },
  });

  if (existing) {
    console.log(`An account already exists for ${email}:`);
    console.log(`  name    : ${existing.displayName}`);
    console.log(`  active  : ${existing.active ? 'yes' : 'no'}`);
    console.log(`  created : ${existing.createdAt.toISOString().slice(0, 10)}`);
    console.log('');
    console.log('Continuing will REPLACE its password and set the display name to');
    console.log(`"${displayName}". It will not create a second account.`);
    console.log('');
    console.log('It will also SIGN OUT every device currently signed in as this');
    console.log('account. Anyone using it will have to sign in again with the new');
    console.log('password - including you, in a browser you already had open.');
    console.log('');

    const ok = await askConfirm('Reset the password for this account?');
    if (!ok) {
      console.log('Nothing was changed.');
      await prisma.$disconnect();
      exit(0);
    }
    console.log('');
  }

  const password = await askHidden('Admin password: ');
  const again = await askHidden('Confirm password: ');

  if (password !== again) {
    console.error('Those passwords do not match.');
    exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    exit(1);
  }

  // scrypt, via the application's own hashing. Nothing here invents a scheme,
  // and the plaintext is never written anywhere but this variable.
  const passwordHash = await hashPassword(password);

  /*
    ONE CALL, BECAUSE THE PASSWORD AND THE REVOCATION ARE ONE OPERATION.

    This used to upsert `{ passwordHash, displayName, active }` here and stop.
    That left `sessionsValidFrom` where it was, so every session opened with the
    OLD password stayed valid for the rest of its eight hours - on every device,
    including the one whose access the password change was meant to end.

    `setAdminPassword` writes the hash and the revocation boundary in the same
    statement. See src/lib/admin-password.ts for why it is a function rather
    than two more lines in this file.
  */
  const admin = await setAdminPassword(prisma, { email, displayName, passwordHash });

  // The hash is never printed, and neither is the password.
  console.log('');
  console.log(`Admin ${admin.existed ? 'updated' : 'created'}: ${admin.displayName} <${admin.email}>`);
  if (admin.existed) {
    console.log('All previously signed-in devices for this account are now signed out.');
  }
  console.log('Sign in at /admin/login');
} catch (error) {
  console.error('\nCould not create the admin account.');
  console.error(error instanceof Error ? error.message : error);
  exit(1);
} finally {
  await prisma.$disconnect();
}
