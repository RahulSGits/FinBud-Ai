import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getApiKey } from '@/lib/providers';

// Internal endpoint used by the voice server to fetch the agent persona and
// the provider keys for a call. Secured by a shared secret — never exposed
// to the browser. (Keys live in the admin panel / DB, resolved here.)
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret');
  if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const callId = req.nextUrl.searchParams.get('callId');
  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });

  const agent = await db.agent.findUnique({ 
    where: { id: agentId as string },
    include: { prompts: { where: { isActive: true }, take: 1 } }
  });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const openai = await getApiKey('openai', 'OPENAI_API_KEY');

  return NextResponse.json({
    callId,
    agent: {
      id: agent.id,
      name: agent.name,
      systemPrompt: agent.prompts?.[0]?.systemPrompt || 'You are a helpful AI voice assistant. Keep responses short and conversational.',
      firstMessage: agent.firstMessage || 'Hello! How can I help you today?',
      voice: agent.voiceId,
      language: agent.language,
      ttsProvider: agent.voiceProvider,
      transferEnabled: agent.transferEnabled && !!agent.transferNumber,
      transferNumber: agent.transferNumber || '',
    },
    keys: { openai },
  });
}
