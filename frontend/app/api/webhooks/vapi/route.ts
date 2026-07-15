import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const event = payload.message;

    if (!event) return NextResponse.json({ ok: true });

    // Extract callLogId
    const callLogId = event.call?.metadata?.callLogId;
    if (!callLogId) {
      console.error('Vapi webhook missing callLogId metadata:', event.type);
      return NextResponse.json({ error: 'Missing callLogId' }, { status: 400 });
    }

    if (event.type === 'status-update') {
      // Handle call.started, call.ringing, call.in-progress, call.ended
      const status = event.status; // 'ringing', 'in-progress', 'ended'
      await db.callLog.update({
        where: { id: callLogId },
        data: { status }
      });
      return NextResponse.json({ ok: true });
    }

    if (event.type === 'transcript-update' || event.type === 'transcript') {
      // We can append to the CallTranscript model
      const transcriptText = event.transcript || event.text || '';
      await db.callTranscript.upsert({
        where: { callLogId: callLogId },
        create: { callLogId, transcript: transcriptText },
        update: { transcript: transcriptText }
      });
      return NextResponse.json({ ok: true });
    }

    if (event.type !== 'end-of-call-report') {
      return NextResponse.json({ ok: true });
    }

    const durationSec = event.call?.endedAt && event.call?.startedAt 
      ? Math.floor((new Date(event.call.endedAt).getTime() - new Date(event.call.startedAt).getTime()) / 1000) 
      : (event.endedReason ? 0 : 0);
      
    const recordingUrl = event.recordingUrl;
    const summary = event.summary;
    const transcriptJSON = JSON.stringify(event.transcript || []);
    
    // We can also extract structured data if Vapi's extraction is configured
    // Let's assume Vapi handles basic extraction, otherwise we can map it
    const analysis = event.analysis || {};
    const successEvaluation = analysis.successEvaluation || 'false';
    const interested = successEvaluation.toLowerCase() === 'true';

    // Update our DB
    await db.callLog.update({
      where: { id: callLogId },
      data: {
        status: 'completed',
        duration: durationSec,
        outcome: event.endedReason || 'Completed',
        recordingUrl: recordingUrl || null,
        transcript: transcriptJSON,
        summary: summary || null,
        interested: interested,
        leadStatus: interested ? 'interested' : 'not_interested',
        // If Vapi structured data was used, extract it:
        customerIntent: analysis.customAnalysis?.intent || null,
        nextAction: analysis.customAnalysis?.nextAction || null,
        objections: analysis.customAnalysis?.objections || null,
      }
    });

    // TRIGGER WHATSAPP AUTOMATION asynchronously (don't block the webhook response)
    import('@/services/whatsapp').then(({ WhatsAppService }) => {
      WhatsAppService.evaluateConditionalTriggers(callLogId).catch(console.error);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Vapi Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
