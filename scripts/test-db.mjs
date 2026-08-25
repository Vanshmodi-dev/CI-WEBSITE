/**
 * Start a real PostgreSQL instance for local verification.
 *
 *   node scripts/test-db.mjs serve    # boots on 55432 and holds it open
 *   node scripts/test-db.mjs start    # boots and exits (server dies with it)
 *   node scripts/test-db.mjs stop     # shuts down, then PROVES it
 *   node scripts/test-db.mjs status   # what is actually running
 *
 * WHY THIS EXISTS. Phase 4.5 and Phase 5 both had to report that the CHECK
 * constraints "have never executed". A hosted database needs an account only
 * the owner can create, so this runs genuine PostgreSQL binaries locally
 * instead - the constraints execute for real, against the real engine.
 *
 * THIS IS A DEVELOPMENT TOOL. It is a devDependency, it never ships, and the
 * data directory is git-ignored. It is NOT the production database; choosing
 * that is a separate decision documented in
 * docs/PHASE-5.5-DATABASE-VERIFICATION.md.
 *
 * The credentials below are deliberately trivial and local-only: the server
 * listens on 127.0.0.1, holds nothing but throwaway ZZTEST rows, and is torn
 * down after the run. They are not secrets and must never be reused anywhere.
 *
 * =============================================================================
 * WHY `stop` IS THIS ELABORATE - PHASE 13
 * =============================================================================
 * It used to print "PostgreSQL stopped and data directory removed." while nine
 * postgres.exe processes were still running and still serving on 55432.
 *
 * The mechanism: `serve` starts the server as a CHILD of that process, and
 * `stop` ran in a DIFFERENT process where it constructed a fresh
 * EmbeddedPostgres object with no child to stop. Its `pg.stop()` threw, the
 * `catch` swallowed it, and the script then deleted the data directory out from
 * under a live postmaster before reporting success.
 *
 * A command that says "stopped" when nothing stopped is worse than one that
 * fails: the next thing to run inherits a database it believes is gone, and
 * Phase 12 lost real time to exactly that. For a tool whose whole job is
 * verifying deployment state, a false success is the one unacceptable bug.
 *
 * So `stop` now shuts the server down through PostgreSQL's own `pg_ctl`, waits
 * for the port to actually close, VERIFIES it, and only then removes the data
 * directory. If it cannot stop the server it says so and exits non-zero.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import path from 'node:path';
import { argv, exit, cwd, platform } from 'node:process';

const DATA_DIR = path.join(cwd(), '.tmp-pgdata');
const PORT = 55432;
const HOST = '127.0.0.1';
const USER = 'ci_test';
const PASSWORD = 'ci_test_local_only';
const DATABASE = 'commerce_insight_test';

export const TEST_DATABASE_URL = `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/${DATABASE}`;

const BIN_DIR = path.join(
  cwd(),
  'node_modules',
  '@embedded-postgres',
  platform === 'win32' ? 'windows-x64' : platform === 'darwin' ? 'darwin-arm64' : 'linux-x64',
  'native',
  'bin',
);

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

/* ------------------------------------------------------ observation ------ */

/**
 * Is anything accepting connections on the port?
 *
 * This is the only question that actually matters, and it is deliberately
 * asked of the network rather than of a process list: a server we cannot see
 * is still a server the next script will connect to.
 */
function portIsOpen(timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: HOST, port: PORT });
    const done = (answer) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** The postmaster PID, straight from PostgreSQL's own lock file. */
async function postmasterPid() {
  const lock = path.join(DATA_DIR, 'postmaster.pid');
  if (!existsSync(lock)) return null;
  try {
    const first = (await readFile(lock, 'utf8')).split('\n')[0]?.trim();
    const pid = Number(first);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Every live postgres process started from THIS repository's binaries. */
function ourPostgresPids() {
  try {
    if (platform === 'win32') {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "Get-CimInstance Win32_Process -Filter \"Name='postgres.exe'\" | Select-Object -ExpandProperty ProcessId",
        ],
        { encoding: 'utf8' },
      );
      return out.split('\n').map((l) => Number(l.trim())).filter(Boolean);
    }
    const out = execFileSync('pgrep', ['-f', 'postgres'], { encoding: 'utf8' });
    return out.split('\n').map((l) => Number(l.trim())).filter(Boolean);
  } catch {
    return [];
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until the port closes, or give up. Returns whether it closed. */
async function waitForPortToClose(totalMs = 15_000) {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    if (!(await portIsOpen())) return true;
    await sleep(300);
  }
  return !(await portIsOpen());
}

/* ---------------------------------------------------------- commands ----- */

async function start() {
  // Refuse rather than trample. Running initdb over a live server's directory
  // is how the old `stop` corrupted things.
  if (await portIsOpen()) {
    console.error(
      `Something is already listening on ${HOST}:${PORT}.\n` +
        'Run `node scripts/test-db.mjs status` to see what, then `stop` it.',
    );
    exit(1);
  }

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
  console.log(`PostgreSQL ready on ${HOST}:${PORT}, database "${DATABASE}"`);
  return pg;
}

/**
 * Shut down, then prove it.
 *
 * Order matters and is the whole point: shut down, WAIT, verify the port is
 * closed, and only then delete the data directory. Deleting first is what let
 * the old version report success over a running server.
 */
async function stop() {
  const wasOpen = await portIsOpen();
  const pid = await postmasterPid();

  if (!wasOpen && !existsSync(DATA_DIR)) {
    console.log(`Nothing running on ${HOST}:${PORT}, and no data directory. Nothing to do.`);
    return true;
  }

  let method = 'none';

  // 1. PostgreSQL's own tool. `-m fast` rolls back open transactions and
  //    closes cleanly; `-w` waits for the shutdown to finish rather than
  //    returning the moment the signal is sent.
  const pgCtl = path.join(BIN_DIR, platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
  if (wasOpen && existsSync(pgCtl) && existsSync(path.join(DATA_DIR, 'postmaster.pid'))) {
    try {
      execFileSync(pgCtl, ['-D', DATA_DIR, '-m', 'fast', '-w', '-t', '20', 'stop'], {
        stdio: 'ignore',
      });
      method = 'pg_ctl fast';
    } catch {
      // Falls through to the signal path below.
    }
  }

  // 2. Signal the postmaster directly. SIGINT is PostgreSQL's "fast shutdown".
  if (method === 'none' && wasOpen && pid) {
    try {
      if (platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGINT');
      }
      method = platform === 'win32' ? 'taskkill' : 'SIGINT';
    } catch {
      // Falls through to the verification below, which will report the truth.
    }
  }

  const closed = wasOpen ? await waitForPortToClose() : true;

  if (!closed) {
    const survivors = ourPostgresPids();
    console.error(
      `FAILED TO STOP PostgreSQL.\n` +
        `  ${HOST}:${PORT} is still accepting connections after ${method} .\n` +
        (survivors.length ? `  live postgres processes: ${survivors.join(', ')}\n` : '') +
        `  The data directory has been LEFT IN PLACE - deleting it under a running\n` +
        `  server is what made the old version of this command lie.\n` +
        `  Stop the process by hand, then run this again.`,
    );
    return false;
  }

  // 3. Only now is it safe to remove the directory.
  await rm(DATA_DIR, { recursive: true, force: true }).catch(() => {});

  const dirGone = !existsSync(DATA_DIR);
  if (!dirGone) {
    console.error(
      `PostgreSQL stopped (${method}), but ${DATA_DIR} could not be removed.\n` +
        '  Something still holds a handle to it. Remove it by hand.',
    );
    return false;
  }

  // 4. And say only what was actually verified.
  console.log(
    wasOpen
      ? `PostgreSQL stopped (${method}); ${HOST}:${PORT} closed; data directory removed.`
      : 'PostgreSQL was not running; data directory removed.',
  );
  return true;
}

async function status() {
  const open = await portIsOpen();
  const pid = await postmasterPid();
  const pids = ourPostgresPids();

  console.log(`port ${HOST}:${PORT}   ${open ? 'ACCEPTING CONNECTIONS' : 'closed'}`);
  console.log(`data directory     ${existsSync(DATA_DIR) ? DATA_DIR : 'absent'}`);
  console.log(`postmaster.pid     ${pid ?? 'absent'}`);
  console.log(`postgres processes ${pids.length ? pids.join(', ') : 'none'}`);

  // The exact inconsistency Phase 13 set out to make impossible to miss.
  if (!open && pids.length > 0) {
    console.log(
      '\nNOTE: postgres processes exist but nothing is listening on this port.\n' +
        '      They may belong to another project or another port.',
    );
  }
  if (open && !existsSync(DATA_DIR)) {
    console.log(
      '\nWARNING: a server is running but its data directory is gone.\n' +
        '         Stop it before starting another.',
    );
  }
  return open;
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
if (command === 'serve') {
  await serve();
} else if (command === 'start') {
  await start();
} else if (command === 'stop') {
  exit((await stop()) ? 0 : 1);
} else if (command === 'status') {
  await status();
} else {
  console.error('Usage: node scripts/test-db.mjs serve|start|stop|status');
  exit(1);
}
