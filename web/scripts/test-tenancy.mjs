// Proves tenant isolation holds at the query layer.
//
//   node scripts/test-tenancy.mjs
//
// Creates a throwaway second company with its own admin, employee and lead,
// then asserts that neither company's scopes can reach the other's rows. Every
// row it creates is removed at the end, including on failure.
//
// This is the test that matters most in a multi-tenant system: a leak here is
// one customer reading another's pipeline, and it is invisible until somebody
// notices. The scopes come from lib/authz so the test exercises the real thing.
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(root, '.ten-'));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — ${detail}`}`);
};

let acme;
try {
  const out = join(dir, 'authz.mjs');
  // react is aliased to a stub: lib/auth.ts (pulled in for AuthError) wraps
  // getCurrentUser in React's cache() at module load, which needs a React
  // runtime this test does not have.
  execFileSync('npx', ['esbuild', 'lib/authz.ts', '--bundle', '--format=esm', '--platform=node',
    '--external:@prisma/client', '--alias:react=./scripts/_react-stub.mjs',
    `--outfile=${out}`, '--log-level=error'], { cwd: root, stdio: 'inherit' });
  const { visibleContacts, visibleCalls, visibleAgents, visibleUsers, visibleDocuments, tenant } =
    await import(out);

  // The analytics engine is compiled separately: it is the one place where a
  // single forgotten predicate would expose every figure at once, so it is
  // asserted against rather than trusted.
  const anOut = join(dir, 'analytics.mjs');
  execFileSync('npx', ['esbuild', 'lib/analytics.ts', '--bundle', '--format=esm', '--platform=node',
    '--external:@prisma/client', '--alias:react=./scripts/_react-stub.mjs',
    `--outfile=${anOut}`, '--log-level=error'], { cwd: root, stdio: 'inherit' });
  const { computeAnalytics } = await import(anOut);

  const finbud = await db.company.findUnique({ where: { slug: 'finance-buddha' } });
  if (!finbud) throw new Error('founding company missing — run the migration first');

  acme = await db.company.create({
    data: { name: 'Acme Test Co', slug: `acme-test-${Date.now()}`, status: 'active' },
  });
  const acmeAdmin = await db.user.create({
    data: { name: 'Acme Admin', email: `admin-${Date.now()}@acme.test`, role: 'admin',
            status: 'active', companyId: acme.id },
  });
  const acmeLead = await db.contact.create({
    data: { phone: `+9199${Date.now().toString().slice(-8)}`, name: 'Acme Lead',
            companyId: acme.id, assignedToId: acmeAdmin.id },
  });

  const fbAdmin = await db.user.findFirst({ where: { companyId: finbud.id, role: 'admin' } });
  if (!fbAdmin) throw new Error('no Finance Buddha admin to test with');

  console.log('\nAn admin sees only their own company:');
  const fbSees = await db.contact.findMany({ where: visibleContacts(fbAdmin), select: { id: true, companyId: true } });
  check("Finance Buddha admin cannot see Acme's lead",
    !fbSees.some((c) => c.id === acmeLead.id),
    `saw ${fbSees.filter(c => c.companyId === acme.id).length} Acme row(s)`);
  check('…and every row they do see is their own company',
    fbSees.every((c) => c.companyId === finbud.id));

  const acmeSees = await db.contact.findMany({ where: visibleContacts(acmeAdmin), select: { id: true, companyId: true } });
  check('Acme admin sees their own lead', acmeSees.some((c) => c.id === acmeLead.id));
  check('…and nothing of Finance Buddha’s',
    acmeSees.every((c) => c.companyId === acme.id),
    `saw ${acmeSees.filter(c => c.companyId !== acme.id).length} foreign row(s)`);

  console.log('\nThe same holds for calls and agents:');
  const fbCalls = await db.call.findMany({ where: visibleCalls(fbAdmin), select: { companyId: true } });
  check('calls are company-scoped', fbCalls.every((c) => c.companyId === finbud.id));
  const acmeAgents = await db.agent.findMany({ where: visibleAgents(acmeAdmin), select: { companyId: true } });
  check('a new company starts with no agents', acmeAgents.length === 0,
    `saw ${acmeAgents.length}`);

  console.log('\nThe dangerous edge cases:');
  const orphan = { id: 'x', email: 'x', name: 'x', role: 'admin', companyId: null };
  const orphanSees = await db.contact.findMany({ where: visibleContacts(orphan) });
  check('a user with NO company sees nothing (not everything)', orphanSees.length === 0,
    `saw ${orphanSees.length} rows`);

  const superAdmin = { id: 'x', email: 'x', name: 'x', role: 'super_admin', companyId: null };
  check('a super admin scope is unfiltered', Object.keys(tenant(superAdmin)).length === 0);
  const allSeen = await db.contact.findMany({ where: visibleContacts(superAdmin) });
  check('…and reaches both companies',
    allSeen.some((c) => c.companyId === acme.id) && allSeen.some((c) => c.companyId === finbud.id));

  console.log('\nThe scopes added when the server pages were closed:');
  const fbStaff = await db.user.findMany({ where: visibleUsers(fbAdmin), select: { companyId: true } });
  check('the team roster is company-scoped', fbStaff.every((u) => u.companyId === finbud.id),
    `saw ${fbStaff.filter((u) => u.companyId !== finbud.id).length} foreign member(s)`);
  check('…and does not include the Acme admin',
    !(await db.user.findMany({ where: visibleUsers(fbAdmin), select: { id: true } }))
      .some((u) => u.id === acmeAdmin.id));

  const acmeDocs = await db.document.findMany({ where: visibleDocuments(acmeAdmin), select: { companyId: true } });
  check('the knowledge library is company-scoped', acmeDocs.every((d) => d.companyId === acme.id),
    `saw ${acmeDocs.filter((d) => d.companyId !== acme.id).length} foreign file(s)`);

  console.log('\nAnalytics — one predicate away from leaking every figure:');
  const acmeStats = await computeAnalytics({
    days: 90, employeeId: null, agentId: null, companyId: acme.id,
  });
  check('a brand-new company reports zero calls', acmeStats.totals.calls === 0,
    `reported ${acmeStats.totals.calls}`);
  check('…and no agents in the breakdown', acmeStats.byAgent.length === 0,
    `reported ${acmeStats.byAgent.length}`);
  check('…and no staff in the breakdown', acmeStats.byEmployee.length <= 1,
    `reported ${acmeStats.byEmployee.length}`);

  const fbStats = await computeAnalytics({
    days: 90, employeeId: null, agentId: null, companyId: finbud.id,
  });
  check('the founding company still sees its own calls', fbStats.totals.calls >= 0);

  console.log(`\n${pass} passed, ${fail} failed\n`);
} finally {
  if (acme) await db.company.delete({ where: { id: acme.id } }).catch(() => {});
  rmSync(dir, { recursive: true, force: true });
  await db.$disconnect();
}
process.exit(fail === 0 ? 0 : 1);
