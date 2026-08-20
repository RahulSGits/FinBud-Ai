// Proves audit entries carry the tenant they belong to.
//
//   node scripts/test-audit.mjs
//
// AuditLog has had a companyId since tenancy landed, and twenty-nine of thirty
// writes did not set it: every company's history piled into one untenanted
// heap, invisible to the table's own RLS policy and unreadable per customer.
// The fix was to pass the actor rather than the column, so the last check here
// is the one that matters most — it fails if any new write goes straight to
// db.auditLog.create and skips the helper.
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(root, '.aud-'));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — ${detail}`}`);
};

try {
  const out = join(dir, 'audit.mjs');
  execFileSync('npx', ['esbuild', 'lib/audit.ts', '--bundle', '--format=esm', '--platform=node',
    '--external:@prisma/client', `--outfile=${out}`, '--log-level=error'],
    { cwd: root, stdio: 'inherit' });
  const { auditData } = await import(out);

  const actor = { id: 'user-1', companyId: 'co-1' };
  const owner = { id: 'owner-1', companyId: null };

  const basic = auditData(actor, { action: 'agent.created', entity: 'Agent', entityId: 'a1' });
  check('the actor’s company is recorded', basic.companyId === 'co-1', String(basic.companyId));
  check('the actor is recorded', basic.userId === 'user-1', String(basic.userId));
  check('entityId is carried through', basic.entityId === 'a1');
  check('meta is omitted when absent', !('meta' in basic), JSON.stringify(basic));

  const noEntity = auditData(actor, { action: 'settings.updated', entity: 'Setting' });
  check('a missing entityId becomes null, not undefined', noEntity.entityId === null);

  const withMeta = auditData(actor, { action: 'x', entity: 'Y', meta: { changed: ['plan'] } });
  check('meta is carried through', JSON.stringify(withMeta.meta) === '{"changed":["plan"]}');

  // The platform owner belongs to no company, so their own actions have no
  // tenant unless one is named.
  const platform = auditData(owner, { action: 'company.updated', entity: 'Company' });
  check('an owner with no company files under no tenant', platform.companyId === null,
    String(platform.companyId));

  const filed = auditData(owner, { action: 'company.updated', entity: 'Company', companyId: 'co-9' });
  check('an explicit company wins over the actor’s', filed.companyId === 'co-9', String(filed.companyId));

  // The distinction that makes the override safe: an explicit null must mean
  // "no tenant", not "fall back to the actor's".
  const explicitNull = auditData(actor, { action: 'platform.thing', entity: 'X', companyId: null });
  check('an explicit null is honoured, not overridden by the actor',
    explicitNull.companyId === null, String(explicitNull.companyId));

  const noActor = auditData(null, { action: 'call.reported', entity: 'Call', companyId: 'co-2' });
  check('a webhook with no actor still records the tenant',
    noActor.userId === null && noActor.companyId === 'co-2');

  // ---- the regression guard --------------------------------------------
  // Every audit write must go through the helper. Without this, the thirty
  // first call site quietly reintroduces exactly the bug this file exists for.
  const sources = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e)) sources.push(p);
    }
  })(join(root, 'app'));
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e)) sources.push(p);
    }
  })(join(root, 'lib'));

  const offenders = [];
  let writes = 0;
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    let i = 0;
    while ((i = text.indexOf('auditLog.create', i)) !== -1) {
      writes++;
      // The helper call appears within the create's own argument, which is
      // never more than a couple of lines away.
      const window = text.slice(i, i + 200);
      if (!window.includes('auditData(')) {
        offenders.push(`${file.replace(root, '')}:${text.slice(0, i).split('\n').length}`);
      }
      i += 15;
    }
  }

  check(`all ${writes} audit writes go through auditData`, offenders.length === 0,
    offenders.join(', '));

  console.log(`\n${pass} passed, ${fail} failed\n`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(fail === 0 ? 0 : 1);
