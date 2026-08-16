// Turning what a call *claimed* into something a person can check.
//
// The engine's post-call extraction is a language model's reading of a phone
// call. It is useful, and it is a guess. Those guesses used to be written
// straight onto the Contact as fact — a model that mistook politeness for
// interest quietly changed a lead's status, and nothing recorded that a machine
// had decided it or what it heard.
//
// This module records each claim as a finding: the claim, the words from the
// transcript that support it, and whether they were actually found there.
// Nothing here changes a Contact. Only applying a finding does, and applying is
// something a person does.
//
// The idea is borrowed from Comp AI's CRM (github.com/trycompai/crm), whose
// rule is that nothing about a person is guessed — tools report observed facts,
// and weak evidence becomes a suggestion for review rather than a database
// write. FinBud had exactly the inverse problem, so the same discipline applies
// almost unchanged.
import { FindingKind, FindingState, Prisma } from '@prisma/client';
import { db } from '../db';

/** A claim the engine made about one call. */
export interface ExtractedClaim {
  kind: FindingKind;
  value: string;
}

/**
 * Phrases that flatly contradict an "interested" reading.
 *
 * Deliberately narrow: only unambiguous refusals. "Maybe later" is not here,
 * because a soft maybe genuinely is a lead. Hindi included because roughly half
 * of these calls switch language partway through, and a refusal in the
 * customer's own language is the one most likely to be misread as warmth.
 */
const REFUSALS = [
  'not interested',
  'no thank you',
  'no thanks',
  'do not call',
  "don't call",
  'stop calling',
  'remove my number',
  'not required',
  'not needed',
  'does not need',
  "don't need",
  'nahi chahiye',
  'nahin chahiye',
  'zarurat nahi',
  'mujhe nahi chahiye',
];

/** Normalise for comparison: case, curly quotes and runs of whitespace. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Only the customer's turns — what the agent said is not evidence about them. */
function customerLines(transcriptText: string | null): string[] {
  if (!transcriptText) return [];
  return transcriptText
    .split('\n')
    .filter((l) => /^customer:/i.test(l))
    .map((l) => l.replace(/^customer:\s*/i, '').trim())
    .filter(Boolean);
}

/**
 * Find the customer's own words that support a claim.
 *
 * Returns the line itself, so the reviewer reads what was actually said rather
 * than a paraphrase. Only the customer's turns are searched: the agent saying
 * "so you're interested?" is not evidence that they were.
 */
function findQuote(claim: ExtractedClaim, transcriptText: string | null): string | null {
  const lines = customerLines(transcriptText);
  if (!lines.length) return null;

  // Match on the claim's own significant words. Short words carry no signal and
  // would match almost any sentence.
  const terms = normalise(claim.value)
    .split(/[^a-z0-9ऀ-ॿ]+/)
    .filter((w) => w.length > 3);

  if (!terms.length) return null;

  let best: { line: string; hits: number } | null = null;
  for (const line of lines) {
    const hay = normalise(line);
    const hits = terms.filter((t) => hay.includes(t)).length;
    if (hits && (!best || hits > best.hits)) best = { line, hits };
  }

  // At least half the claim's terms must appear, so a single incidental word
  // does not get promoted to evidence.
  return best && best.hits >= Math.ceil(terms.length / 2) ? best.line : null;
}

/** Did the customer plainly refuse, whatever the engine concluded? */
function refused(transcriptText: string | null): boolean {
  const lines = customerLines(transcriptText).map(normalise);
  return lines.some((l) => REFUSALS.some((r) => l.includes(r)));
}

/**
 * Record what a call claimed, with its evidence.
 *
 * Idempotent per (call, kind): re-reconciling a call updates its reading rather
 * than stacking duplicates. A finding a person has already reviewed is left
 * exactly as they left it — re-running extraction must never quietly reopen a
 * decision somebody made.
 */
export async function recordFindings(opts: {
  callId: string;
  contactId: string | null;
  /** The tenant the call belongs to, so findings are scoped like everything else. */
  companyId: string | null;
  transcriptText: string | null;
  claims: ExtractedClaim[];
}): Promise<{ created: number; updated: number; contradicted: number }> {
  const { callId, contactId, companyId, transcriptText, claims } = opts;
  if (!claims.length) return { created: 0, updated: 0, contradicted: 0 };
  // A finding belongs to the call's company. Without one there is nothing to
  // scope it to, and an unscoped finding is invisible to every reviewer.
  if (!companyId) return { created: 0, updated: 0, contradicted: 0 };

  const customerRefused = refused(transcriptText);
  let created = 0;
  let updated = 0;
  let contradicted = 0;

  for (const claim of claims) {
    const value = claim.value.trim();
    if (!value) continue;

    const quote = findQuote(claim, transcriptText);

    // A claim of interest on a call where the customer plainly said no. These
    // are surfaced first, because they are the ones that would do damage if
    // applied without being read.
    const conflict =
      claim.kind === FindingKind.interest &&
      customerRefused &&
      /^(interested|true|yes|positive)$/i.test(value);
    if (conflict) contradicted++;

    const existing = await db.callFinding.findUnique({
      where: { callId_kind: { callId, kind: claim.kind } },
      select: { id: true, state: true },
    });

    if (existing) {
      // Never reopen a reviewed decision.
      if (existing.state !== FindingState.suggested) continue;
      await db.callFinding.update({
        where: { id: existing.id },
        data: { value, quote, quoteVerified: !!quote, contradicted: conflict, contactId },
      });
      updated++;
    } else {
      await db.callFinding.create({
        data: {
          callId,
          contactId,
          companyId,
          kind: claim.kind,
          value,
          quote,
          quoteVerified: !!quote,
          contradicted: conflict,
        },
      });
      created++;
    }
  }

  return { created, updated, contradicted };
}

/**
 * Build the claim list from a call report.
 *
 * Only fields the engine actually returned. An absent field is not a claim, and
 * inventing "unknown" findings would bury the real ones.
 */
export function claimsFromReport(report: {
  leadStatus?: string | null;
  interested?: boolean;
  customerIntent?: string | null;
  nextAction?: string | null;
  objections?: string | null;
}): ExtractedClaim[] {
  const out: ExtractedClaim[] = [];

  if (report.leadStatus && report.leadStatus !== 'unknown') {
    out.push({ kind: FindingKind.interest, value: report.leadStatus });
  } else if (report.interested) {
    out.push({ kind: FindingKind.interest, value: 'interested' });
  }
  if (report.customerIntent) out.push({ kind: FindingKind.intent, value: report.customerIntent });
  if (report.nextAction) out.push({ kind: FindingKind.next_action, value: report.nextAction });
  if (report.objections) out.push({ kind: FindingKind.objection, value: report.objections });

  return out;
}

/** Findings awaiting a human, worst first. */
export function pendingFindings(where: Prisma.CallFindingWhereInput = {}) {
  return db.callFinding.findMany({
    where: { state: FindingState.suggested, ...where },
    orderBy: [{ contradicted: 'desc' }, { createdAt: 'desc' }],
    include: {
      call: { select: { id: true, phone: true, startedAt: true, durationSec: true } },
      contact: { select: { id: true, name: true, phone: true, status: true } },
    },
  });
}
