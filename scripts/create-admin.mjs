/**
 * Create or update the admin account.
 *
 *   node scripts/create-admin.mjs "sir@commerceinsight.example" "Sir"
 *
 * The password is READ FROM A PROMPT, never from an argument. A password in
 * argv shows up in shell history and in the process list on a shared machine.
 *
 * There is deliberately no self-registration in the app: an admin account is
 * created by someone with server access, on purpose, once.
 */

import { createInterface } from 'node:readline';
import { stdin, stdout, argv, exit, env } from 'node:process';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/lib/password.ts';

const [, , emailArg, nameArg] = argv;

if (!emailArg || !nameArg) {
  console.error('Usage: node scripts/create-admin.mjs "<email>" "<display name>"');
  exit(1);
}

if (!env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is not set. Put it in .env.local first — see docs/PHASE-4.5-DB-VERIFICATION.md.',
  );
  exit(1);
}

const email = emailArg.trim().toLowerCase();
const displayName = nameArg.trim();

if (!email.includes('@')) {
  console.error('That does not look like an email address.');
  exit(1);
}

/** Reads without echoing, so the password never appears on screen. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const onData = (char) => {
      const s = String(char);
      if (s === '\n' || s === '\r' || s === '') {
        stdin.removeListener('data', onData);
      } else {
        stdout.write('[2K[200D' + question + '*'.repeat(rl.line.length));
      }
    };
    stdout.write(question);
    stdin.on('data', onData);
    rl.question('', (answer) => {
      rl.close();
      stdout.write('\n');
      resolve(answer);
    });
  });
}

const password = await askHidden('New password: ');
const again = await askHidden('Confirm password: ');

if (password !== again) {
  console.error('Those passwords do not match.');
  exit(1);
}
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  exit(1);
}

const passwordHash = await hashPassword(password);

const { PrismaClient } = await import('../src/generated/prisma/client.ts');
const { PrismaPg } = await import('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

try {
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash, displayName, active: true },
    create: { email, displayName, passwordHash },
    select: { id: true, email: true, displayName: true },
  });
  // The hash is never printed, and neither is the password.
  console.log(`\nAdmin ready: ${admin.displayName} <${admin.email}>`);
  console.log('Sign in at /admin/login');
} catch (error) {
  console.error('\nCould not create the admin account.');
  console.error(error instanceof Error ? error.message : error);
  exit(1);
} finally {
  await prisma.$disconnect();
}
