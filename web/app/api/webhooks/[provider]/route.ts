import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { applyCallReport } from '@/lib/livekit/report';
import { db } from '@/lib/db';
import { CallStatus } from '@prisma/client';

/**
 * Is this callback actually from the engine we registered?
 *
 * Voice engines here sign nothing, so the check is a shared token handed to the
 * provider in the callback URL (see webhookUrlFor). Accepted from a header too,
 * so a provider that strips query strings can still be pointed at this route.
 *
 * When no secret is configured the endpoint stays open, because refusing every
 * callback would silently stop results arriving on an existing deployment that
 * has not set the variable yet. That is the weaker of the two failure modes,
 * and it is logged.
 */
function authentic(req: NextRequest): boolean {
  const expected = process.env.FINBUD_INTERNAL_SECRET;
  if (!expected) {
    console.warn(
      '[webhook] FINBUD_INTERNAL_SECRET is not set — accepting unauthenticated call outcomes. ' +
        'Set it here and redeploy so callbacks can be verified.'
    );
    return true;
  }

  const given =
    req.nextUrl.searchParams.get('token') ??
    req.headers.get('x-finbud-secret') ??
    req.headers.get('x-webhook-token') ??
    '';

  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Compare in constant time, and only when the lengths already match —
  // timingSafeEqual throws on a length mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The id a webhook says an event belongs to, or null.
 *
 * Coerced to a string deliberately. Prisma types `id` as `StringFilter | string`,
 * so an object arriving here — `{"callId":{"not":"x"}}` — is a valid *filter*
 * rather than an id, and the updateMany below would match and rewrite every
 * call in the table in one statement. A UUID shape is required as well: these
 * ids are always v4 UUIDs we generated, so anything else is not ours.
 */
function callIdOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

/**
 * Single webhook endpoint for every voice engine. The adapter normalises the
 * payload; persistence is shared, so dashboards update identically regardless
 * of which provider executed the call.
 */
export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    if (!authentic(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const provider = getProvider(params.provider);
    const event = provider.parseWebhook(payload);

    if (event.kind === 'ignored') return NextResponse.json({ ok: true, ignored: true });

    const callId = callIdOf(event.callId);
    if (!callId) return NextResponse.json({ ok: true, ignored: true, reason: 'no call id' });

    if (event.kind === 'status') {
      const status = event.status as CallStatus;
      await db.call.updateMany({ where: { id: callId }, data: { status } }).catch(() => {});
      return NextResponse.json({ ok: true, kind: 'status' });
    }

    if (event.kind === 'transcript') {
      await db.call.updateMany({
        where: { id: callId },
        data: { transcriptText: event.transcript },
      }).catch(() => {});
      return NextResponse.json({ ok: true, kind: 'transcript' });
    }

    // end
    await applyCallReport({
      callId,
      durationSec: event.report.durationSec,
      transcript: event.report.transcript ?? null,
      transcriptText: event.report.transcriptText ?? null,
      summary: event.report.summary ?? null,
      interested: event.report.interested,
      leadStatus: event.report.leadStatus ?? 'unknown',
      leadScore: event.report.leadScore ?? null,
      customerIntent: event.report.customerIntent ?? null,
      nextAction: event.report.nextAction ?? null,
      objections: event.report.objections ?? null,
      recordingUrl: event.report.recordingUrl ?? null,
    });
    return NextResponse.json({ ok: true, kind: 'end' });
  } catch (e) {
    console.error(`[webhook:${params.provider}]`, e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
