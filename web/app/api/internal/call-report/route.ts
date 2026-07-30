import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applyCallReport } from '@/lib/livekit/report';

function authorised(req: NextRequest): boolean {
  const secret = process.env.FINBUD_INTERNAL_SECRET;
  if (!secret) return false;
  return req.headers.get('x-internal-secret') === secret;
}

/** Receives the finished call from the LiveKit worker. */
export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.callLogId) {
    return NextResponse.json({ error: 'callLogId is required' }, { status: 400 });
  }

  try {
    await applyCallReport({
      callId: String(body.callLogId),
      durationSec: Number(body.durationSec ?? 0),
      transcript: Array.isArray(body.transcript) ? body.transcript : null,
      transcriptText: body.transcriptText ?? null,
      summary: body.summary ?? null,
      interested: !!body.interested,
      leadStatus: body.leadStatus ?? 'unknown',
      leadScore: body.leadScore ?? null,
      customerIntent: body.customerIntent ?? null,
      nextAction: body.nextAction ?? null,
      objections: body.objections ?? null,
      recordingUrl: body.recordingUrl ?? null,
    });

    await db.auditLog.create({
      data: { action: 'call.reported', entity: 'Call', entityId: String(body.callLogId) },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('call-report failed:', e);
    return NextResponse.json({ error: 'Could not record the call' }, { status: 500 });
  }
}
