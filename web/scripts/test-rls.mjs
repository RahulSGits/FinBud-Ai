// Proves the Row Level Security policies actually refuse cross-tenant rows.
//
//   node scripts/test-rls.mjs
//
// The application currently connects as a role carrying BYPASSRLS, so testing
// through it would prove nothing — every policy would be skipped and every
// assertion would pass for the wrong reason. This creates a throwaway role
// WITHOUT that privilege and drives the database as that role, which is the
// only way to observe what the policies really do.
//
// What is asserted, in order of how badly each would hurt:
//   1. No tenant declared  -> no rows. Fail closed, never open.
//   2. Tenant A declared   -> only A's rows, and B's are invisible.
//   3. Writing into another tenant is refused, not silently accepted.
//   4. The super-admin flag crosses tenants deliberately.
//   5. An unset context is NOT treated as elevated.
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const admin = new PrismaClient();
const ROLE = 'finbud_rls_test';
const PASS = 'rls-test-only';
let pass = 0, fail = 0;
let acme, client;

function check(name, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Run a query as the restricted role with a given tenant context. */
async function asTenant(companyId, superAdmin, sql) {
  await client.query('begin');
  try {
    await client.query(`select set_config('app.company_id', $1, true)`, [companyId ?? '']);
    await client.query(`select set_config('app.is_super_admin', $1, true)`, [superAdmin ? 'true' : 'false']);
    const r = await client.query(sql);
    await client.query('commit');
    return r.rows;
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}

try {
  const finbud = await admin.company.findFirst({ where: { slug: 'finance-buddha' } });
  if (!finbud) throw new Error('founding company missing — run migrations first');

  acme = await admin.company.create({
    data: { name: 'RLS Probe Co', slug: `rls-probe-${Date.now()}`, status: 'active' },
  });
  const acmeLead = await admin.contact.create({
    data: { phone: `+9198${Date.now().toString().slice(-8)}`, name: 'Probe Lead', companyId: acme.id },
  });

  // A role that cannot bypass RLS — the whole point of the exercise.
  await admin.$executeRawUnsafe(`drop role if exists ${ROLE}`).catch(() => {});
  await admin.$executeRawUnsafe(`create role ${ROLE} login password '${PASS}' nobypassrls`);
  await admin.$executeRawUnsafe(`grant usage on schema public to ${ROLE}`);
  await admin.$executeRawUnsafe(`grant select, insert, update, delete on all tables in schema public to ${ROLE}`);

  const url = new URL(process.env.DATABASE_URL);
  client = new pg.Client({
    host: url.hostname, port: Number(url.port), database: url.pathname.slice(1),
    user: ROLE, password: PASS,
  });
  await client.connect();

  const sup = await client.query(`select rolbypassrls from pg_roles where rolname = current_user`);
  check('the test role genuinely cannot bypass RLS', sup.rows[0].rolbypassrls, false);

  console.log('\n1. Fail closed — no tenant declared:');
  const none = await asTenant(null, false, `select id from "Contact"`);
  check('sees no contacts at all', none.length, 0);
  const noCo = await asTenant(null, false, `select id from "Company"`);
  check('sees no companies at all', noCo.length, 0);

  console.log('\n2. Scoped to the declared tenant:');
  const acmeRows = await asTenant(acme.id, false, `select id, "companyId" from "Contact"`);
  check('sees its own lead', acmeRows.some((r) => r.id === acmeLead.id));
  check('…and nothing belonging to anyone else',
    acmeRows.every((r) => r.companyId === acme.id));

  const fbRows = await asTenant(finbud.id, false, `select id, "companyId" from "Contact"`);
  check('the other tenant cannot see the probe lead',
    fbRows.some((r) => r.id === acmeLead.id), false);

  const ownCo = await asTenant(acme.id, false, `select id from "Company"`);
  check('sees exactly one company — its own', ownCo.length === 1 && ownCo[0].id === acme.id);

  console.log('\n3. Writes into another tenant are refused:');
  let refused = false;
  try {
    await asTenant(acme.id, false,
      `insert into "Contact" (id, phone, "companyId", status, attempts, "createdAt", "updatedAt")
       values ('rls-x', '+919000000001', '${finbud.id}', 'pending', 0, now(), now())`);
  } catch (e) {
    refused = /row-level security/i.test(e.message);
  }
  check('inserting a row owned by another tenant is blocked', refused);

  const stolen = await asTenant(acme.id, false,
    `update "Contact" set name = 'stolen' where "companyId" = '${finbud.id}' returning id`);
  check('updating another tenant’s rows changes nothing', stolen.length, 0);

  console.log('\n4. The platform owner crosses tenants deliberately:');
  const all = await asTenant(null, true, `select "companyId" from "Contact"`);
  check('a super admin sees both companies',
    all.some((r) => r.companyId === acme.id) && all.some((r) => r.companyId === finbud.id));

  console.log('\n5. An unset context is not elevated access:');
  const empty = await asTenant('', false, `select id from "Contact"`);
  check('empty string is treated as no tenant, not as a wildcard', empty.length, 0);

  console.log(`\n${pass} passed, ${fail} failed\n`);
} finally {
  if (client) await client.end().catch(() => {});
  if (acme) await admin.company.delete({ where: { id: acme.id } }).catch(() => {});
  await admin.$executeRawUnsafe(`drop owned by ${ROLE}`).catch(() => {});
  await admin.$executeRawUnsafe(`drop role if exists ${ROLE}`).catch(() => {});
  await admin.$disconnect();
}
process.exit(fail === 0 ? 0 : 1);
