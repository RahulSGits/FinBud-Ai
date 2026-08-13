// Proves lib/db.ts repairs a mangled connection string without harming a good one.
//
//   node scripts/test-connstring.mjs
//
// The password in a Postgres URL routinely contains characters that are
// structural in a URL, and pasting it unencoded produces a string that looks
// correct and cannot connect. Getting the repair wrong in the lax direction
// leaves the outage in place; wrong in the strict direction it corrupts a
// working credential. Both are checked.
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(root, '.conn-'));
let pass = 0, fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    console.log(`        expected ${expected}`);
    console.log(`        actual   ${actual}`);
  }
}

try {
  const out = join(dir, 'db.mjs');
  execFileSync('npx', ['esbuild', 'lib/db.ts', '--bundle', '--format=esm', '--platform=node',
    '--external:@prisma/client', `--outfile=${out}`, '--log-level=error'], { cwd: root, stdio: 'inherit' });
  const { repairConnectionString: fix } = await import(out);

  const HOST = 'aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres';

  console.log('\nRepairs a password pasted raw:');
  check('@ and # and $',
    fix(`postgresql://u.abc:Rahul#1299@Sing$05@${HOST}`),
    `postgresql://u.abc:Rahul%231299%40Sing%2405@${HOST}`);
  check('a single @',
    fix(`postgresql://u:p@ss@${HOST}`),
    `postgresql://u:p%40ss@${HOST}`);
  check('a slash',
    fix(`postgresql://u:a/b@${HOST}`),
    `postgresql://u:a%2Fb@${HOST}`);

  console.log('\nLeaves a working string exactly as it is:');
  const encoded = `postgresql://u.abc:Rahul%231299%40Sing%2405@${HOST}`;
  check('already encoded', fix(encoded), encoded);
  const local = 'postgresql://postgres:postgres@127.0.0.1:55432/postgres';
  check('local dev', fix(local), local);
  const plain = `postgresql://user:simplepass@${HOST}`;
  check('no special characters', fix(plain), plain);
  const noCreds = 'postgresql://aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres';
  check('no credentials at all', fix(noCreds), noCreds);
  check('not a URL', fix('nonsense'), 'nonsense');

  console.log(`\n${pass} passed, ${fail} failed\n`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(fail === 0 ? 0 : 1);
