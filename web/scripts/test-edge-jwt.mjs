// Proves lib/edge-jwt.ts agrees with the jose signer in lib/auth.ts.
//
//   node scripts/test-edge-jwt.mjs
//
// Middleware stopped using jose to verify session cookies, so nothing else
// guarantees the two still agree. Getting this wrong is not subtle in effect:
// too strict and every signed-in user is bounced to /login, too lax and a
// forged cookie walks into /admin. Both directions are checked here.
//
// The token is produced by the real jose SignJWT with the exact chain
// createSession uses, so this is a compatibility test, not a self-consistency
// one — verifying against a token this file made up would prove nothing.
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SignJWT } from 'jose';

const SECRET = 'test-secret-value-do-not-use-in-production';
const OTHER_SECRET = 'a-completely-different-secret-value-here';
const bytes = (s) => new TextEncoder().encode(s);

// The exact chain from lib/auth.ts createSession().
function sign(claims, { secret = SECRET, expiresIn = '7d', alg = 'HS256' } = {}) {
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg })
    .setSubject(claims.sub ?? 'user_123')
    .setIssuedAt();
  if (expiresIn !== null) jwt = jwt.setExpirationTime(expiresIn);
  return jwt.sign(bytes(secret));
}

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        expected ${JSON.stringify(expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

async function main() {
  // Compiled on the fly: the module is TypeScript, and importing the real file
  // is the whole point — a hand-copied duplicate would drift from what ships.
  const dir = mkdtempSync(join(tmpdir(), 'edge-jwt-'));
  const out = join(dir, 'edge-jwt.mjs');
  let verifySessionToken;
  try {
    execFileSync(
      'npx',
      ['esbuild', 'lib/edge-jwt.ts', '--format=esm', `--outfile=${out}`, '--log-level=error'],
      { cwd: new URL('..', import.meta.url).pathname, stdio: 'inherit' }
    );
    ({ verifySessionToken } = await import(out));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('\nAccepts what lib/auth.ts issues:');

  check(
    'a freshly signed admin token',
    await verifySessionToken(
      await sign({ sub: 'user_admin', email: 'a@b.com', role: 'admin' }),
      SECRET
    ),
    { id: 'user_admin', role: 'admin' }
  );

  check(
    'a freshly signed employee token',
    await verifySessionToken(
      await sign({ sub: 'user_emp', email: 'e@b.com', role: 'employee' }),
      SECRET
    ),
    { id: 'user_emp', role: 'employee' }
  );

  console.log('\nRejects everything else:');

  check('no token', await verifySessionToken(undefined, SECRET), null);
  check('empty token', await verifySessionToken('', SECRET), null);
  check('no secret configured', await verifySessionToken(await sign({}), undefined), null);
  check('not a JWT at all', await verifySessionToken('garbage', SECRET), null);
  check('two segments only', await verifySessionToken('a.b', SECRET), null);

  check(
    'signed with a different secret',
    await verifySessionToken(await sign({ role: 'admin' }, { secret: OTHER_SECRET }), SECRET),
    null
  );

  check(
    'expired an hour ago',
    await verifySessionToken(await sign({ role: 'admin' }, { expiresIn: '-1h' }), SECRET),
    null
  );

  check(
    'no exp claim',
    await verifySessionToken(await sign({ role: 'admin' }, { expiresIn: null }), SECRET),
    null
  );

  // The classic forgery: keep the header and payload, drop the signature and
  // relabel the algorithm as "none".
  const real = await sign({ role: 'employee' });
  const [, payloadB64] = real.split('.');
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .toString('base64url');
  check(
    'alg:none forgery',
    await verifySessionToken(`${noneHeader}.${payloadB64}.`, SECRET),
    null
  );

  // Privilege escalation: take a valid employee token, rewrite the role to
  // admin, keep the original signature.
  const empToken = await sign({ sub: 'user_emp', role: 'employee' });
  const [h, p, s] = empToken.split('.');
  const tampered = JSON.parse(Buffer.from(p, 'base64url').toString());
  tampered.role = 'admin';
  check(
    'payload tampered to role=admin',
    await verifySessionToken(
      `${h}.${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${s}`,
      SECRET
    ),
    null
  );

  check(
    'signature bytes flipped',
    await verifySessionToken(`${h}.${p}.${s.slice(0, -4)}AAAA`, SECRET),
    null
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
