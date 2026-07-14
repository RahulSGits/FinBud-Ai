import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { getApiKey } from '@/lib/providers';

// Sandbox: chat with your own agent (its persona + knowledge) with NO credits
// and NO real dialing. For QA before going live. Uses the configured OpenAI
// key; falls back to a scripted reply if none is set so it still works locally.
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agentId, messages } = await req.json();
  if (!agentId || !Array.isArray(messages)) return NextResponse.json({ error: 'agentId and messages required' }, { status: 400 });

  if (!user.organizationId) return NextResponse.json({ error: 'Organization required' }, { status: 400 });

  const agent = await db.agent.findFirst({ 
    where: { id: agentId, organizationId: user.organizationId },
    include: { prompts: { where: { isActive: true }, take: 1 } }
  });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  // Lightweight RAG: attach the user's knowledge as context.
  const kbRecord = await db.knowledgeBase.findFirst({ where: { organizationId: user.organizationId, name: 'Default Knowledge Base' } });
  let knowledge: any[] = [];
  if (kbRecord) {
    knowledge = await db.document.findMany({ where: { knowledgeBaseId: kbRecord.id, status: 'active' }, take: 20 });
  }
  const kbContext = knowledge.map((k) => `• ${k.name}: ${k.content.slice(0, 600)}`).join('\n').slice(0, 6000);

  const system = [
    agent.prompts?.[0]?.systemPrompt || 'You are a helpful AI voice assistant. Keep replies short and conversational.',
    'Rules: speak naturally as if on a phone call, keep replies short, no markdown, reply in the caller\'s language.',
    kbContext ? `\nKNOWLEDGE BASE (use when relevant):\n${kbContext}` : '',
  ].join('\n');

  const apiKey = await getApiKey('openai', 'OPENAI_API_KEY');

  // Graceful fallback so the sandbox is usable without any keys configured.
  if (!apiKey) {
    const last = messages[messages.length - 1]?.content || '';
    return NextResponse.json({
      reply: `(sandbox preview — add an OpenAI key in Admin → API Providers for real AI replies) You said: "${last.slice(0, 80)}". As ${agent.name}, I'd respond helpfully and briefly here.`,
      simulated: true,
    });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, ...messages.slice(-12)],
        temperature: 0.7,
        max_tokens: 160,
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `AI error ${res.status}` }, { status: 502 });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || '…';
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: 'Could not reach the AI service' }, { status: 502 });
  }
}
