// Runs every test suite and reports all of them.
//
//   npm test
//
// Deliberately does not stop at the first failure. These suites cover different
// boundaries — tokens, tenancy, money, row level security, the platform gate —
// and knowing that three of them broke together says something quite different
// from knowing that one did.
//
// The database-backed suites need a local Postgres: npm run pg:start.
import { spawnSync } from 'child_process';

const SUITES = [
  ['edge-jwt', 'test-edge-jwt.mjs', 'session tokens at the edge'],
  ['connstring', 'test-connstring.mjs', 'connection-string repair'],
  ['billing-money', 'test-billing-money.mjs', 'money arithmetic'],
  ['audit', 'test-audit.mjs', 'audit entries carry their tenant'],
  ['tenancy', 'test-tenancy.mjs', 'one company cannot read another'],
  ['rls', 'test-rls.mjs', 'the database refuses cross-tenant rows'],
  ['platform-access', 'test-platform-access.mjs', 'only the owner reaches /platform'],
  ['company-status', 'test-company-status.mjs', 'suspension actually refuses'],
];

const results = [];
for (const [name, file, what] of SUITES) {
  process.stdout.write(`\n▸ ${name} — ${what}\n`);
  const run = spawnSync('node', [`scripts/${file}`], { stdio: 'inherit' });
  results.push([name, run.status === 0]);
}

const failed = results.filter(([, ok]) => !ok);
console.log('\n' + '─'.repeat(58));
for (const [name, ok] of results) console.log(`  ${ok ? '✓' : '✗'}  ${name}`);
console.log('─'.repeat(58));
console.log(
  failed.length
    ? `\n${failed.length} of ${results.length} suites failed: ${failed.map(([n]) => n).join(', ')}\n`
    : `\nAll ${results.length} suites passed.\n`
);
process.exit(failed.length ? 1 : 0);
