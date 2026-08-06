// Runs the real OmniDimension adapter against a real call id and prints what
// the reconciler would persist.
//
//   node scripts/probe-call-result.mjs <providerCallId>
//
// Read-only: it fetches a call log and parses it. It never dispatches a call
// and never writes to the database.
//
// This exists because the parsing between "the API answered" and "the dashboard
// shows a transcript" is where results were being lost silently — a fetch that
// succeeds and is then discarded looks identical, from the outside, to a call
// that produced nothing.
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// No dotenv in this project's dependencies — Prisma loads .env on its own, and
// nothing else needed it until now. Parse the handful of values directly rather
// than adding a dependency for one script.
for (const file of ['.env', '.env.local']) {
  let text;
  try {
    text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  } catch {
    continue;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const id = process.argv[2];
if (!id) {
  console.error('usage: node scripts/probe-call-result.mjs <providerCallId>');
  process.exit(1);
}

const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'probe-'));

try {
  const out = join(dir, 'omni.mjs');
  execFileSync(
    'npx',
    [
      'esbuild', 'lib/providers/omnidimension.ts',
      '--bundle', '--format=esm', '--platform=node',
      '--external:@prisma/client', '--external:../db', '--external:./db',
      `--outfile=${out}`, '--log-level=error',
    ],
    { cwd: root, stdio: 'inherit' }
  );

  const mod = await import(out);
  const Provider = mod.OmniDimensionProvider;
  const provider = new Provider();

  console.log(`configured: ${await provider.isConfigured()}`);
  console.log(`fetching call ${id} …\n`);

  const result = await provider.fetchCallResult(id);

  if (!result) {
    console.log('RESULT: null  — the reconciler would treat this call as unknown.');
    process.exit(2);
  }

  console.log(`status: ${result.status}`);
  const r = result.report;
  if (!r) {
    console.log('(no report — call not finished)');
    process.exit(0);
  }

  console.log(`durationSec:    ${r.durationSec}`);
  console.log(`recordingUrl:   ${r.recordingUrl ?? '(none)'}`);
  console.log(`interested:     ${r.interested}`);
  console.log(`leadStatus:     ${r.leadStatus ?? '(none)'}`);
  console.log(`leadScore:      ${r.leadScore ?? '(none)'}`);
  console.log(`customerIntent: ${r.customerIntent ?? '(none)'}`);
  console.log(`endedReason:    ${r.endedReason ?? '(none)'}`);
  console.log(`summary:        ${(r.summary ?? '(none)').slice(0, 200)}`);
  console.log(`\ntranscriptText (${(r.transcriptText ?? '').length} chars):`);
  console.log((r.transcriptText ?? '(none)').slice(0, 800));
  console.log(`\ntranscript turns: ${Array.isArray(r.transcript) ? r.transcript.length : '(not an array)'}`);
  if (Array.isArray(r.transcript)) {
    for (const t of r.transcript.slice(0, 6)) console.log('  ', JSON.stringify(t).slice(0, 160));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
