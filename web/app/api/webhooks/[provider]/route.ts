import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { applyCallReport } from '@/lib/livekit/report';
import { db } from '@/lib/db';
import { CallStatus } from '@prisma/client';

/**
 * Single webhook endpoint for every voice engine. The adapter normalises the
 * payload; persistence is shared, so dashboards update identically regardless
 * of which provider executed the call.
 */
export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const payload = await req.json().catch(() => ({}));
    const provider = getProvider(params.provider);
    const event = provider.parseWebhook(payload);

    if (event.kind === 'ignored') return NextResponse.json({ ok: true, ignored: true });

    if (event.kind === 'status') {
      const status = event.status as CallStatus;
      await db.call.updateMany({ where: { id: event.callId }, data: { status } }).catch(() => {});
      return NextResponse.json({ ok: true, kind: 'status' });
    }

    if (event.kind === 'transcript') {
      await db.call.updateMany({
        where: { id: event.callId },
        data: { transcriptText: event.transcript },
      }).catch(() => {});
      return NextResponse.json({ ok: true, kind: 'transcript' });
    }

    // end
    await applyCallReport({
      callId: event.callId,
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
