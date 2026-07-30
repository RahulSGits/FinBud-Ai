// A real PostgreSQL server for local development, with nothing to install.
//
//   node scripts/local-postgres.mjs start|stop|status|destroy
//   (or: npm run pg:start / pg:stop / pg:status)
//
// Uses the PostgreSQL binaries shipped by the `embedded-postgres` package, so
// there is no Docker, Homebrew or system Postgres requirement. The schema needs
// no extensions, so this is a faithful stand-in for the Supabase deployment —
// point DATABASE_URL at either and the same migration applies.
//
// Data lives under /tmp/finbud-pg and does not survive a reboot; it is a
// development convenience, never a production store.
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);

export const PORT = 55432;
export const USER = 'postgres';
export const PASSWORD = 'postgres';
export const DATABASE = 'postgres';
export const URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;

// The cluster lives under the home directory, NOT /tmp: macOS clears /tmp on
// reboot, which silently destroys the database and leaves the app throwing
// "Server error" at the login screen with no obvious cause.
//
// The socket is the one thing that does stay in /tmp — PostgreSQL refuses a
// Unix socket path over 103 bytes, sockets are ephemeral anyway, and the data
// directory's real path is comfortably longer than that limit.
const ROOT = join(homedir(), '.finbud-pg');
const DATA = join(ROOT, 'data');
const SOCKET = '/tmp/finbud-pg-sock';
const LOG = join(ROOT, 'server.log');

/** Locate the platform-specific binaries the embedded-postgres package pulls in. */
function binDir() {
  const platform = `${process.platform}-${process.arch}`;
  const pkg = `@embedded-postgres/${platform}`;
  try {
    // Resolve the package entry (dist/index.js) and walk up to the package
    // root: these packages don't expose ./package.json through `exports`, so
    // resolving that path directly fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
    return join(dirname(dirname(require.resolve(pkg))), 'native', 'bin');
  } catch {
    throw new Error(
      `No PostgreSQL binaries for ${platform}. Run \`npm install\` first, or set ` +
        'DATABASE_URL to a Postgres you already have (Supabase, Docker, Postgres.app).'
    );
  }
}

function run(bin, args, opts = {}) {
  const res = spawnSync(join(binDir(), bin), args, { encoding: 'utf8', ...opts });
  if (res.error) throw res.error;
  return res;
}

function isRunning() {
  return run('pg_ctl', ['-D', DATA, 'status']).status === 0;
}

function start() {
  if (existsSync(DATA) && isRunning()) {
    console.log(`Already running on port ${PORT}.`);
    return;
  }

  if (!existsSync(DATA)) {
    mkdirSync(ROOT, { recursive: true });
    mkdirSync(SOCKET, { recursive: true });
    const pwfile = join(ROOT, 'pwfile');
    writeFileSync(pwfile, PASSWORD);

    console.log('Initialising a new cluster…');
    const init = run('initdb', [
      '-D', DATA, '-U', USER, `--pwfile=${pwfile}`, '-E', 'UTF8', '--locale=C',
    ]);
    if (init.status !== 0) {
      throw new Error(`initdb failed:\n${init.stderr || init.stdout}`);
    }
    rmSync(pwfile, { force: true });
  }

  mkdirSync(SOCKET, { recursive: true });
  const res = run('pg_ctl', [
    '-D', DATA,
    '-o', `-p ${PORT} -k ${SOCKET} -c listen_addresses=127.0.0.1`,
    '-l', LOG,
    '-w', 'start',
  ]);

  if (res.status !== 0) {
    throw new Error(`Could not start PostgreSQL. See ${LOG}\n${res.stderr || res.stdout}`);
  }

  console.log(`PostgreSQL listening on 127.0.0.1:${PORT}`);
  console.log(`DATABASE_URL="${URL}"`);
  console.log('\nNext: npm run db:migrate && npm run db:seed');
}

function stop() {
  if (!existsSync(DATA) || !isRunning()) {
    console.log('Not running.');
    return;
  }
  const res = run('pg_ctl', ['-D', DATA, '-m', 'fast', '-w', 'stop']);
  console.log(res.status === 0 ? 'Stopped.' : res.stderr || res.stdout);
}

function status() {
  const up = existsSync(DATA) && isRunning();
  console.log(up ? `Running on 127.0.0.1:${PORT}` : 'Not running.');
  process.exitCode = up ? 0 : 1;
}

function destroy() {
  if (existsSync(DATA) && isRunning()) stop();
  rmSync(ROOT, { recursive: true, force: true });
  console.log('Cluster deleted. `start` will create a fresh one.');
}

const COMMANDS = { start, stop, status, destroy };
const command = process.argv[2] ?? 'start';

if (!COMMANDS[command]) {
  console.error(`Usage: node scripts/local-postgres.mjs ${Object.keys(COMMANDS).join('|')}`);
  process.exit(1);
}

try {
  COMMANDS[command]();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
