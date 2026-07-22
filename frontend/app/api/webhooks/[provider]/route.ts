import { NextRequest, NextResponse } from 'next/server';
import { applyVoiceEvent, getVoiceProvider } from '@/lib/providers/voice';

/**
 * Single webhook endpoint for every voice provider.
 * The adapter normalises the payload; persistence is shared.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const payload = await req.json();
    const provider = getVoiceProvider(params.provider);

    const event = provider.parseWebhook(payload);
    if (event.kind === 'ignored') {
      return NextResponse.json({ ok: true, ignored: true });
    }

    await applyVoiceEvent(event);
    return NextResponse.json({ ok: true, kind: event.kind });
  } catch (error) {
    console.error(`[webhook:${params.provider}]`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
