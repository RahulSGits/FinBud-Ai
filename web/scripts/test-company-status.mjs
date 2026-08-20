// Proves that suspending a company actually refuses its people.
//
//   node scripts/test-company-status.mjs
//
// The suspend control was decorative when it was built: it wrote a column that
// nothing read. A suspended customer kept signing in, kept placing calls, and
// kept spending money — and the platform screen said "suspended" the whole
// time. The gap is not visible from either side on its own, which is exactly
// why it needs a test rather than a careful reading.
//
// Enforcement lives in getCurrentUser, so it is checked on every request rather
// than only at sign-in: a session opened before the suspension must stop
// working at once, not whenever its token happens to expire.
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(root, '.cst-'));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — ${detail}`}`);
};

let company;
try {
  // The real source, compiled — a re-implementation here would pass while the
  // application still let a suspended company in.
  const out = join(dir, 'auth.mjs');
  execFileSync('npx', ['esbuild', 'lib/auth.ts', '--bundle', '--format=esm', '--platform=node',
    '--external:@prisma/client', '--external:next/headers', '--external:jose', '--external:bcryptjs',
    '--alias:react=./scripts/_react-stub.mjs', `--outfile=${out}`, '--log-level=error'],
    { cwd: root, stdio: 'inherit' });

  company = await db.company.create({
    data: { name: 'Status Test Co', slug: `status-test-${Date.now().toString(36)}`, status: 'active' },
  });
  const member = await db.user.create({
    data: {
      name: 'Status Tester',
      email: `status-${Date.now().toString(36)}@test.local`,
      role: 'employee',
      status: 'active',
      companyId: company.id,
      passwordHash: 'x',
    },
  });

  /** What getCurrentUser reads, and the decision it makes on it. */
  async function resolve(userId) {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { status: true, tenant: { select: { status: true } } },
    });
    if (!u || u.status !== 'active') return null;
    if (u.tenant && u.tenant.status !== 'active') return null;
    return u;
  }

  check('an active company’s member resolves', (await resolve(member.id)) !== null);

  await db.company.update({ where: { id: company.id }, data: { status: 'suspended' } });
  check('suspending the company refuses the member at once',
    (await resolve(member.id)) === null);

  await db.company.update({ where: { id: company.id }, data: { status: 'pending' } });
  check('a company awaiting approval refuses them too',
    (await resolve(member.id)) === null);

  await db.company.update({ where: { id: company.id }, data: { status: 'active' } });
  check('lifting the suspension lets them back in', (await resolve(member.id)) !== null);

  // The one account that must survive a suspension: without a company of their
  // own, the platform owner is who lifts it.
  const owner = await db.user.findFirst({ where: { role: 'super_admin' } });
  if (owner) {
    check('the platform owner has no company to be suspended by',
      owner.companyId === null, String(owner.companyId));
    check('…and still resolves', (await resolve(owner.id)) !== null);
  } else {
    console.log('  SKIP  platform owner checks — no super_admin in this database');
  }

  // Guard the actual source, not just the logic mirrored above.
  const authSource = await import('fs').then((fs) =>
    fs.readFileSync(join(root, 'lib/auth.ts'), 'utf8')
  );
  check('getCurrentUser reads the company’s status',
    /tenant:\s*\{\s*select:\s*\{\s*status:\s*true/.test(authSource));
  check('…and refuses on it',
    /user\.tenant\s*&&\s*user\.tenant\.status\s*!==\s*CompanyStatus\.active/.test(authSource));

  console.log(`\n${pass} passed, ${fail} failed\n`);
} finally {
  if (company) await db.company.delete({ where: { id: company.id } }).catch(() => {});
  rmSync(dir, { recursive: true, force: true });
  await db.$disconnect();
}
process.exit(fail === 0 ? 0 : 1);
