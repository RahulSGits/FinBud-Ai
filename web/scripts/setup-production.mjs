// Bring a deployed database up to the state this app expects, in one command.
//
//   DATABASE_URL="<production connection string>" node scripts/setup-production.mjs
//   DATABASE_URL="..."  node scripts/setup-production.mjs --confirm
//
// Dry run unless --confirm. Idempotent: running it twice changes nothing the
// second time.
//
// It does, in order:
//   1. tidy-production.mjs      — rename the accounts, remove fixtures
//   2. create-overdraft-agent   — the Overdraft agent
//   3. create-financebuddha-agent — the Personal Loan agent
//   4. publish both agents to the voice provider, so neither reads "Not synced"
//
// Step 4 is the part that cannot be done with SQL: an agent only becomes
// dialable once the provider has been told about it and has handed back an id.
// It runs the app's own sync path rather than reimplementing it, so an agent
// published by this script is identical to one published by pressing Save.
//
// Needs OMNIDIM_API_KEY (and VOICE_PROVIDER=omnidimension) in the environment
// for step 4. Without them the first three steps still run and the agents
// publish themselves on first use.
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const CONFIRM = process.argv.includes('--confirm');
const root = new URL('..', import.meta.url).pathname;

function run(script, args = []) {
  console.log(`\n─── ${script} ${args.join(' ')}`.padEnd(72, '─'));
  try {
    execFileSync('node', [join('scripts', script), ...args], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    console.error(`\n${script} failed. Stopping before anything further runs.`);
    process.exit(1);
  }
}

/**
 * Publish every agent that has no provider id yet.
 *
 * Uses lib/providers/sync.ts — the same function the Save button calls —
 * compiled on the fly, because it is TypeScript and this is a plain script.
 * Prisma stays external so it uses the DATABASE_URL already in the environment.
 */
async function publishAgents(prisma) {
  const pending = await prisma.agent.findMany({
    where: { externalAgentId: null },
    select: { id: true, name: true, voiceProvider: true },
  });

  if (!pending.length) {
    console.log('  every agent is already published');
    return;
  }

  if (!process.env.OMNIDIM_API_KEY) {
    console.log(`  ${pending.length} agent(s) unpublished, and OMNIDIM_API_KEY is not set.`);
    console.log('  They will publish themselves on the first call. Set the key and re-run to do it now.');
    return;
  }

  // Compiled inside the project, not into the system temp directory: Prisma is
  // deliberately left external so it uses the same client and DATABASE_URL as
  // everything else, and Node resolves an external import relative to the
  // importing file — from /tmp there is no node_modules to find it in.
  const dir = mkdtempSync(join(root, '.sync-'));
  try {
    const out = join(dir, 'sync.mjs');
    execFileSync(
      'npx',
      [
        'esbuild', 'lib/providers/sync.ts',
        '--bundle', '--format=esm', '--platform=node',
        '--external:@prisma/client',
        `--outfile=${out}`, '--log-level=error',
      ],
      { cwd: root, stdio: 'inherit' }
    );

    const { syncAgent } = await import(out);
    for (const agent of pending) {
      const result = await syncAgent(agent.id);
      console.log(
        result.synced
          ? `  published ${agent.name} -> ${result.externalAgentId}`
          : `  FAILED    ${agent.name}: ${result.error}`
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  let host = '(unset)';
  try {
    host = new URL(url).hostname;
  } catch {
    /* leave as unset */
  }

  if (!url) {
    console.error('DATABASE_URL is not set. Point it at the database you want to set up.');
    process.exit(1);
  }

  console.log(`Target database: ${host}`);
  console.log(CONFIRM ? 'Mode: APPLYING CHANGES' : 'Mode: dry run (pass --confirm to apply)');

  // The tidy step is the only destructive one, so it gets the flag; the agent
  // creators are upserts and safe either way, but in a dry run there is nothing
  // to preview from them, so they are skipped too.
  run('tidy-production.mjs', CONFIRM ? ['--confirm'] : []);

  if (!CONFIRM) {
    console.log('\nDry run finished. Re-run with --confirm to apply, create the agents and publish them.');
    return;
  }

  run('create-overdraft-agent.mjs');
  run('create-financebuddha-agent.mjs');

  console.log('\n─── publishing agents '.padEnd(72, '─'));
  const prisma = new PrismaClient();
  try {
    await publishAgents(prisma);

    const counts = {
      users: await prisma.user.count(),
      agents: await prisma.agent.count(),
      contacts: await prisma.contact.count(),
      campaigns: await prisma.campaign.count(),
      calls: await prisma.call.count(),
    };
    console.log(`\nDone. ${JSON.stringify(counts)}`);
    console.log('\nSign in as gaurav@financebuddha.com — the password is unchanged.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
