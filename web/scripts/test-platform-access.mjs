// Proves the platform-owner area is closed to company users.
//
//   node scripts/test-platform-access.mjs
//
// A Super Admin panel that a company administrator can reach is worse than no
// panel: it exposes every tenant on the platform to any customer. The
// assertions run against the real authorization helpers and the real database
// constraint, not against the UI.
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(root, '.plat-'));
let pass = 0, fail = 0;

function check(name, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

let probe;
try {
  const out = join(dir, 'authz.mjs');
  execFileSync('npx', ['esbuild', 'lib/authz.ts', '--bundle', '--format=esm', '--platform=node',
    '--external:@prisma/client', '--alias:react=./scripts/_react-stub.mjs',
    `--outfile=${out}`, '--log-level=error'], { cwd: root, stdio: 'inherit' });
  const { isSuperAdmin, assertSuperAdmin, canUseAdminArea, tenant } = await import(out);

  const owner   = { id: 'o', email: 'o', name: 'o', role: 'super_admin', companyId: null };
  const admin   = { id: 'a', email: 'a', name: 'a', role: 'admin', companyId: 'company-a' };
  const manager = { id: 'm', email: 'm', name: 'm', role: 'manager', companyId: 'company-a' };
  const staff   = { id: 'e', email: 'e', name: 'e', role: 'employee', companyId: 'company-a' };
  const viewer  = { id: 'v', email: 'v', name: 'v', role: 'viewer', companyId: 'company-a' };

  console.log('\nOnly the platform owner is a super admin:');
  check('owner', isSuperAdmin(owner), true);
  for (const [label, u] of [['company admin', admin], ['manager', manager], ['employee', staff], ['viewer', viewer]]) {
    check(`${label} is not`, isSuperAdmin(u), false);
  }

  console.log('\nassertSuperAdmin refuses everyone else:');
  let ownerOk = true;
  try { assertSuperAdmin(owner); } catch { ownerOk = false; }
  check('the owner passes', ownerOk, true);
  for (const [label, u] of [['company admin', admin], ['manager', manager], ['employee', staff]]) {
    let threw = false, status = null;
    try { assertSuperAdmin(u); } catch (e) { threw = true; status = e.status; }
    check(`${label} is refused with 403`, [threw, status], [true, 403]);
  }

  console.log('\nThe company-admin area admits admins and the owner, nobody else:');
  check('company admin may', canUseAdminArea(admin), true);
  check('owner may — for support', canUseAdminArea(owner), true);
  check('manager may not', canUseAdminArea(manager), false);
  check('employee may not', canUseAdminArea(staff), false);
  check('viewer may not', canUseAdminArea(viewer), false);

  console.log('\nThe owner is deliberately unscoped, an ordinary user never is:');
  check('owner scope is empty (sees all tenants)', Object.keys(tenant(owner)).length, 0);
  check('admin scope pins their company', tenant(admin), { companyId: 'company-a' });

  console.log('\nThe database refuses a company-less ordinary user:');
  let refused = false;
  try {
    probe = await db.user.create({
      data: { email: `probe-${Date.now()}@test.invalid`, name: 'Probe',
              role: 'admin', status: 'active', passwordHash: 'x' },
    });
  } catch (e) {
    refused = /user_company_matches_role/.test(e.message);
  }
  check('an admin with no company is rejected by the CHECK constraint', refused, true);

  const owners = await db.user.count({ where: { role: 'super_admin', companyId: { not: null } } });
  check('no super admin is trapped inside a company', owners, 0);

  console.log(`\n${pass} passed, ${fail} failed\n`);
} finally {
  if (probe) await db.user.delete({ where: { id: probe.id } }).catch(() => {});
  rmSync(dir, { recursive: true, force: true });
  await db.$disconnect();
}
process.exit(fail === 0 ? 0 : 1);
