// Reconciling in-flight calls against the engine that ran them.
//
// A finished call reaches us by webhook, and a webhook is one delivery attempt
// to a URL we do not control the routing of. If it was never configured on the
// account, if the deployment URL moved, or if a single POST is dropped, the
// Call row sits at "ringing" until the campaign runner's stale reaper fails it
// fifteen minutes later — and the customer's transcript, summary and lead
// status are lost to us even though the provider still holds all of them.
//
// So we ask. This runs on a schedule (POST/GET /api/calls/sync) and is the
// safety net under every push-based path; the webhook stays the fast path.
import { CallStatus } from '@prisma/client';
import { db } from '../db';
import { applyCallReport } from '../livekit/report';
import { getProvider } from '../providers';

const IN_FLIGHT: CallStatus[] = [CallStatus.initiated, CallStatus.ringing, CallStatus.in_progress];

/**
 * How far along a call each state is.
 *
 * A poll that can only report "still running" must never rewind a row: the
 * webhook and this pass race each other, and a status derived from a log row
 * seconds out of date would otherwise drag a call the webhook has already
 * advanced back to where it started.
 */
const RANK: Record<string, number> = {
  initiated: 0,
  ringing: 1,
  in_progress: 2,
  completed: 3,
  failed: 3,
};

/** Never scan the whole table, however generous a caller is with `limit`. */
const MAX_BATCH = 200;

/**
 * How long a call the provider cannot find is given before it is written off.
 *
 * Matches the campaign runner's stale window, and for the same reason:
 * OmniDimension enforces a ten-minute ceiling of its own, so anything shorter
 * risks closing a call that is genuinely still up.
 */
const ORPHAN_AFTER_MS = 12 * 60_000;

export interface ReconcileOutcome {
  callId: string;
  providerCallId: string;
  provider: string;
  from: CallStatus;
  /** What the engine said, or null when it told us nothing usable. */
  to: CallStatus | null;
  changed: boolean;
  error?: string;
}

export interface ReconcileSummary {
  /** Calls actually put to a provider (rows whose engine cannot poll are not). */
  checked: number;
  /** Rows this pass changed. */
  updated: number;
  /** Subset of `updated` that received a final result. */
  completed: number;
  errors: number;
  results: ReconcileOutcome[];
}

/**
 * Poll every call that is still in flight and old enough to have something to
 * say, and persist whatever came back.
 *
 * Sequential on purpose. This hits a third-party API on a timer, and firing
 * fifty requests in one burst is the shape of traffic that earns a rate limit —
 * at which point the recovery mechanism becomes the outage. One call failing
 * never stops the pass; it is recorded and the loop moves on.
 */
export async function reconcileInFlightCalls(
  opts: { olderThanSec?: number; limit?: number } = {}
): Promise<ReconcileSummary> {
  const olderThanSec = opts.olderThanSec ?? 45;
  const limit = opts.limit ?? 50;

  // A call dialled two seconds ago has nothing to report yet, and asking anyway
  // spends a request per pass on the one answer we could have predicted.
  const cutoff = new Date(Date.now() - Math.max(0, olderThanSec) * 1000);

  const calls = await db.call.findMany({
    where: {
      status: { in: IN_FLIGHT },
      providerCallId: { not: null },
      startedAt: { lt: cutoff },
    },
    // Oldest first: those are the ones closest to being reaped, so they are the
    // ones whose transcript is about to be lost.
    orderBy: { startedAt: 'asc' },
    take: Math.max(1, Math.min(limit, MAX_BATCH)),
    select: {
      id: true,
      status: true,
      providerCallId: true,
      // Needed to age out calls the provider cannot account for, and to release
      // the contact they are holding when that happens.
      startedAt: true,
      contactId: true,
      agent: { select: { voiceProvider: true } },
    },
  });

  const results: ReconcileOutcome[] = [];
  let updated = 0;
  let completed = 0;
  let errors = 0;

  for (const call of calls) {
    // Guaranteed non-null by the where clause above.
    const providerCallId = call.providerCallId as string;

    // The engine is resolved from the call's own agent, never from the
    // platform default — a call placed by an agent on another provider must be
    // asked of the provider that actually ran it.
    const provider = getProvider(call.agent?.voiceProvider);

    // Bound to the provider so the narrowing survives the awaits below.
    const fetchResult = provider.fetchCallResult?.bind(provider);
    // LiveKit's worker pushes its own report and the simulator writes results
    // directly, so neither can be polled. Nothing to do for those rows.
    if (!fetchResult) continue;

    const outcome: ReconcileOutcome = {
      callId: call.id,
      providerCallId,
      provider: provider.id,
      from: call.status,
      to: null,
      changed: false,
    };
    results.push(outcome);

    try {
      const result = await fetchResult(providerCallId);

      // The engine has no record of this call.
      //
      // Usually transient — the id has not propagated yet — so a recent call is
      // left exactly as found: inventing an outcome would fabricate a result
      // for a call nobody can account for.
      //
      // Past the stale window it is not transient. The common cause is a
      // rotated API key: call ids belong to the account that issued them, so
      // every in-flight call becomes permanently unknowable the moment the key
      // changes. Those rows would otherwise sit "ringing" forever, holding a
      // concurrency slot and never releasing their contact. Close them with a
      // reason that names the cause rather than pretending the call happened.
      if (!result) {
        const age = Date.now() - call.startedAt.getTime();
        if (age < ORPHAN_AFTER_MS) continue;

        await db.call.update({
          where: { id: call.id },
          data: {
            status: 'failed',
            endedAt: new Date(),
            failureReason:
              'Not dispatched: the voice provider has no record of this call. It was most likely ' +
              'placed with a different API key, whose call ids the current account cannot read.',
          },
        });
        // Release the contact so it can be dialled again rather than staying
        // stuck at "calling" behind a call that can never report.
        if (call.contactId) {
          await db.contact.updateMany({
            where: { id: call.contactId, status: 'calling' },
            data: { status: 'retry', nextAttemptAt: new Date() },
          });
        }

        outcome.to = 'failed';
        outcome.changed = true;
        updated++;
        continue;
      }

      const next = result.status as CallStatus;
      outcome.to = next;

      if (result.report) {
        // applyCallReport is the ONE place a finished call is persisted: it
        // also advances the contact and closes the campaign. Writing these
        // columns here instead would leave the contact stuck at "calling" and
        // the campaign permanently running.
        await applyCallReport({
          callId: call.id,
          durationSec: result.report.durationSec,
          transcript: result.report.transcript ?? null,
          transcriptText: result.report.transcriptText ?? null,
          summary: result.report.summary ?? null,
          interested: result.report.interested,
          leadStatus: result.report.leadStatus ?? 'unknown',
          leadScore: result.report.leadScore ?? null,
          customerIntent: result.report.customerIntent ?? null,
          nextAction: result.report.nextAction ?? null,
          objections: result.report.objections ?? null,
          recordingUrl: result.report.recordingUrl ?? null,
        });

        // applyCallReport can only ever write "completed", because that is the
        // one ending the webhook path has. A call the engine says never
        // connected must not read as a conversation that took place, so the
        // terminal state is corrected afterwards — status and reason only,
        // nothing applyCallReport is responsible for, and both states are
        // equally out of flight so campaign completion is unaffected.
        if (next === CallStatus.failed) {
          await db.call.update({
            where: { id: call.id },
            data: {
              status: CallStatus.failed,
              // The engine's own word for the ending, kept verbatim: a generic
              // message hides whether this was a busy line, a rejection or a
              // number that never rings.
              failureReason: `Not completed: ${
                result.report.endedReason || 'the provider reported no outcome'
              }`.slice(0, 400),
            },
          });
        }

        outcome.changed = true;
        updated++;
        completed++;
        continue;
      }

      // Still running: the status is the only thing we have learned, so it is
      // the only thing we write.
      if ((RANK[next] ?? 0) > (RANK[call.status] ?? 0)) {
        await db.call.update({ where: { id: call.id }, data: { status: next } });
        outcome.changed = true;
        updated++;
      }
    } catch (err: any) {
      // A transport failure is not an outcome. Record it and carry on — the
      // next pass asks again, and the call keeps its in-flight status until
      // somebody can actually answer for it.
      errors++;
      outcome.error = String(err?.message ?? err).slice(0, 200);
      console.warn(`[reconcile] ${call.id} (${provider.id}/${providerCallId}): ${outcome.error}`);
    }
  }

  const summary: ReconcileSummary = {
    checked: results.length,
    updated,
    completed,
    errors,
    results,
  };

  // Audited only when something actually moved. This runs every minute, and a
  // row per idle poll would bury the trail it is meant to be part of.
  if (updated > 0) {
    await db.auditLog
      .create({
        data: {
          action: 'calls.reconciled',
          entity: 'Call',
          meta: {
            checked: summary.checked,
            updated,
            completed,
            errors,
            calls: results
              .filter((r) => r.changed)
              .map((r) => ({
                callId: r.callId,
                provider: r.provider,
                // Always a string: `to` is only null when nothing changed.
                status: String(r.to ?? 'unknown'),
              })),
          },
        },
      })
      // The audit trail must never be what breaks a recovery pass.
      .catch((e: unknown) => console.warn('[reconcile] audit write failed:', e));
  }

  return summary;
}
