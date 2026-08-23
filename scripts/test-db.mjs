/**
 * Start a real PostgreSQL instance for local verification.
 *
 *   node scripts/test-db.mjs start   # boots on 55432, prints nothing secret
 *   node scripts/test-db.mjs stop
 *
 * WHY THIS EXISTS. Phase 4.5 and Phase 5 both had to report that the CHECK
 * constraints "have never executed". A hosted database needs an account only
 * the owner can create, so this runs genuine PostgreSQL binaries locally
 * instead — the constraints execute for real, against the real engine.
 *
 * THIS IS A DEVELOPMENT TOOL. It is a devDependency, it never ships, and the
 * data directory is git-ignored. It is NOT the production database; choosing
 * that is a separate decision documented in
 * docs/PHASE-5.5-DATABASE-VERIFICATION.md.
 *
 * The credentials below are deliberately trivial and local-only: the server
 * listens on 127.0.0.1, holds nothing but throwaway DEMO rows, and is torn down
 * after the run. They are not secrets and must never be reused anywhere.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { argv, exit, cwd } from 'node:process';

const DATA_DIR = path.join(cwd(), '.tmp-pgdata');
const PORT = 55432;
const USER = 'ci_test';
const PASSWORD = 'ci_test_local_only';
const DATABASE = 'commerce_insight_test';

export const TEST_DATABASE_URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;

function makeServer() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: () => {},
    // Surfaced rather than swallowed: a silent handler here cost real
    // debugging time, because the thrown error arrived as `undefined`.
    onError: (message) => console.error('[postgres]', String(message).slice(0, 400)),
  });
}

async function start() {
  // initdb refuses a non-empty directory, and it creates the directory itself.
  await rm(DATA_DIR, { recursive: true, force: true }).catch(() => {});

  const pg = makeServer();
  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(DATABASE);
  } catch {
    // Already exists on a re-run; harmless.
  }
  console.log(`PostgreSQL ready on 127.0.0.1:${PORT}, database "${DATABASE}"`);
}

async function stop() {
  const pg = makeServer();
  try {
    await pg.stop();
  } catch {
    // Not running.
  }
  await rm(DATA_DIR, { recursive: true, force: true }).catch(() => {});
  console.log('PostgreSQL stopped and data directory removed.');
}

async function serve() {
  await start();
  // embedded-postgres runs postgres as a CHILD of this process, so the server
  // dies when this script exits. Holding the event loop open keeps it alive
  // for the migration, the app and the test suite to connect to.
  console.log('Holding the server open. Ctrl-C or `node scripts/test-db.mjs stop` to end.');
  await new Promise(() => {});
}

const command = argv[2];
if (command === 'serve') await serve();
else if (command === 'start') await start();
else if (command === 'stop') await stop();
else {
  console.error('Usage: node scripts/test-db.mjs serve|start|stop');
  exit(1);
}
