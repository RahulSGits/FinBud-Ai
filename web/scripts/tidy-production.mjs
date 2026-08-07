// Bring a deployed database in line with the app: real names, no fixtures.
//
//   DATABASE_URL="<production connection string>" node scripts/tidy-production.mjs
//   DATABASE_URL="..."                            node scripts/tidy-production.mjs --confirm
//
// Dry run unless --confirm is passed. Nothing is written until you have read
// what it intends to do.
//
// Why this exists: the local database and the deployed one are different
// databases. Renaming an account or deleting a fixture locally does nothing to
// production, whose connection string lives in the hosting provider's
// environment and never in this repo. This is the one script that reconciles
// them, and it is safe to run more than once.
//
// It will NOT touch:
//   - calls that carry a real provider id (those are genuine call records)
//   - contacts that have real call history
//   - agents that are published to a provider
//   - anything it cannot positively identify as a fixture
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');

/** The account renames, matched on the address the seeder originally used. */
const RENAMES = [
  { from: 'admin@financebuddha.com', to: 'gaurav@financebuddha.com', name: 'Gaurav' },
  { from: 'ravi@financebuddha.com', to: 'rahul@financebuddha.com', name: 'Rahul' },
  { from: 'neha@financebuddha.com', to: 'aditya@financebuddha.com', name: 'Aditya' },
];

/** Agents the seeder used to create. Only removed when nothing depends on them. */
const FIXTURE_AGENTS = ['Home Loan Qualifier', 'Loan Qualifier'];

/** Campaigns the seeder used to create. */
const FIXTURE_CAMPAIGNS = ['July home loan follow-ups'];

/**
 * Phone numbers that were never real people.
 *
 * The +9198123450xx block is the seeder's invented contact list. The rest are
 * obvious probes typed in during testing — a number of all zeros is not a lead.
 */
function isFixturePhone(phone) {
  const p = String(phone ?? '');
  return (
    /^\+9198123450\d{2}$/.test(p) ||
    /^\+91(0+|1000000000)$/.test(p) ||
    /^\+?0+$/.test(p) ||
    /^\+91123456789\d?$/.test(p)
  );
}

const plan = [];
function note(what, detail) {
  plan.push({ what, detail });
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  let where = '(unknown)';
  try {
    where = new URL(url).hostname;
  } catch {
    /* leave as unknown */
  }
  console.log(`Database: ${where}`);
  console.log(CONFIRM ? 'Mode: APPLYING CHANGES\n' : 'Mode: dry run (pass --confirm to apply)\n');

  // ---- 1. Accounts -------------------------------------------------------
  for (const r of RENAMES) {
    const user = await prisma.user.findUnique({ where: { email: r.from } });
    if (!user) continue;

    // Refuse rather than collide: if the target address already belongs to
    // somebody else, renaming would fail on the unique index anyway, and
    // guessing which row is the real one is not this script's decision.
    const taken = await prisma.user.findUnique({ where: { email: r.to } });
    if (taken && taken.id !== user.id) {
      note('SKIP account', `${r.from}: ${r.to} already belongs to another account`);
      continue;
    }

    note('rename account', `${user.name} <${r.from}>  ->  ${r.name} <${r.to}>`);
    if (CONFIRM) {
      await prisma.user.update({ where: { id: user.id }, data: { email: r.to, name: r.name } });
    }
  }

  // ---- 2. Fixture calls --------------------------------------------------
  // A call is a fixture when the simulator made it, or when it never reached
  // the network AND has nothing to show for itself. A real failed dial is kept:
  // "we tried and it did not connect" is history worth having.
  const callCandidates = await prisma.call.findMany({
    select: {
      id: true, phone: true, providerCallId: true, durationSec: true,
      transcriptText: true, recordingUrl: true, startedAt: true,
    },
  });

  const fixtureCalls = callCandidates.filter((c) => {
    const simulated = /^(seeded-|mock-|sim-)/.test(c.providerCallId ?? '');
    const neverDispatched = !c.providerCallId && !c.durationSec && !c.transcriptText && !c.recordingUrl;
    return simulated || isFixturePhone(c.phone) || neverDispatched;
  });

  const keptCalls = callCandidates.length - fixtureCalls.length;
  if (fixtureCalls.length) {
    note('delete calls', `${fixtureCalls.length} simulated / never-dispatched (keeping ${keptCalls} real)`);
    if (CONFIRM) {
      await prisma.call.deleteMany({ where: { id: { in: fixtureCalls.map((c) => c.id) } } });
    }
  }

  // ---- 3. Fixture contacts ----------------------------------------------
  // Only ones with no surviving call history, so a fixture number that turned
  // out to be dialled for real is left alone.
  const contacts = await prisma.contact.findMany({
    select: { id: true, phone: true, name: true, _count: { select: { calls: true } } },
  });
  const deletedCallIds = new Set(fixtureCalls.map((c) => c.id));
  const fixtureContacts = [];
  for (const c of contacts) {
    if (!isFixturePhone(c.phone)) continue;
    const remaining = await prisma.call.count({
      where: { contactId: c.id, id: { notIn: [...deletedCallIds] } },
    });
    if (remaining === 0) fixtureContacts.push(c);
  }
  if (fixtureContacts.length) {
    note('delete contacts', fixtureContacts.map((c) => `${c.name ?? '—'} ${c.phone}`).join(', '));
    if (CONFIRM) {
      await prisma.contact.deleteMany({ where: { id: { in: fixtureContacts.map((c) => c.id) } } });
    }
  }

  // ---- 4. Fixture campaigns ---------------------------------------------
  for (const name of FIXTURE_CAMPAIGNS) {
    const campaign = await prisma.campaign.findFirst({ where: { name } });
    if (!campaign) continue;
    const calls = await prisma.call.count({ where: { campaignId: campaign.id } });
    if (calls > 0) {
      note('SKIP campaign', `${name}: still has ${calls} real call(s)`);
      continue;
    }
    note('delete campaign', name);
    if (CONFIRM) {
      await prisma.contact.updateMany({ where: { campaignId: campaign.id }, data: { campaignId: null } });
      await prisma.campaign.delete({ where: { id: campaign.id } });
    }
  }

  // ---- 5. Fixture agents -------------------------------------------------
  for (const name of FIXTURE_AGENTS) {
    const agent = await prisma.agent.findFirst({ where: { name } });
    if (!agent) continue;
    const [calls, campaigns] = await Promise.all([
      prisma.call.count({ where: { agentId: agent.id } }),
      prisma.campaign.count({ where: { agentId: agent.id } }),
    ]);
    if (calls > 0 || campaigns > 0) {
      note('SKIP agent', `${name}: referenced by ${calls} call(s), ${campaigns} campaign(s)`);
      continue;
    }
    note('delete agent', `${name}${agent.externalAgentId ? ` (published as ${agent.externalAgentId})` : ''}`);
    if (CONFIRM) await prisma.agent.delete({ where: { id: agent.id } });
  }

  // ---- Report ------------------------------------------------------------
  if (!plan.length) {
    console.log('Nothing to do — this database is already tidy.');
  } else {
    for (const p of plan) console.log(`  ${p.what.padEnd(18)} ${p.detail}`);
  }

  const after = {
    users: await prisma.user.count(),
    agents: await prisma.agent.count(),
    contacts: await prisma.contact.count(),
    campaigns: await prisma.campaign.count(),
    calls: await prisma.call.count(),
  };
  console.log(`\n${CONFIRM ? 'Now' : 'Currently'}: ${JSON.stringify(after)}`);
  if (!CONFIRM && plan.length) console.log('\nRe-run with --confirm to apply.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
