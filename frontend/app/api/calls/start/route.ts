import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { getApiKey, getProviderConfig } from '@/lib/providers';

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agentId, phone, campaignId, contactId } = await req.json();
  if (!agentId || !phone) return NextResponse.json({ error: 'agentId and phone are required' }, { status: 400 });

  const agent = await db.agent.findFirst({ 
    where: { id: agentId, organizationId: user.organizationId },
    include: { prompts: { where: { isActive: true }, take: 1 } }
  });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const vapiKey = await getApiKey('vapi', 'VAPI_API_KEY');
  if (!vapiKey) {
    return NextResponse.json({ error: 'Vapi API key is not configured.' }, { status: 503 });
  }

  // Pre-create the call record so the webhook can find it
  const callLog = await db.callLog.create({
    data: { 
      organizationId: user.organizationId, 
      agentId: agent.id, 
      campaignId: campaignId || null,
      contactId: contactId || null,
      phone, 
      direction: 'outbound', 
      status: 'initiated' 
    },
  });

  const exotelConfig = await getProviderConfig('exotel');
  // If Exotel is configured in Vapi, you typically use the phone number ID registered in Vapi.
  // For this generic implementation, we use VAPI_PHONE_NUMBER_ID or fallback to a default Vapi number.
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || exotelConfig.vapi_phone_number_id;

  const vapiPayload: any = {
    customer: { number: phone },
  };

  // If the agent is synced with Vapi, we just pass the persistent ID
  if (agent.vapiAssistantId) {
    vapiPayload.assistantId = agent.vapiAssistantId;
    
    // We can still override the assistant configuration dynamically if needed for metadata
    vapiPayload.assistantOverrides = {
      metadata: { callLogId: callLog.id },
    };
  } else {
    // Fallback for agents created before the Vapi Sync update
    vapiPayload.assistant = {
      firstMessage: agent.firstMessage || 'Hello!',
      model: {
        provider: agent.llmProvider || 'openai',
        model: agent.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: agent.prompts?.[0]?.systemPrompt || 'You are an AI assistant.' }],
      },
      voice: {
        provider: agent.voiceProvider || 'exote',
        voiceId: agent.voiceId || 'eleven_turbo_v2',
      },
      metadata: { callLogId: callLog.id },
    };
  }

  if (phoneNumberId) {
    vapiPayload.phoneNumberId = phoneNumberId;
  }

  const res = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${vapiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(vapiPayload),
  });

  if (!res.ok) {
    const err = await res.text();
    await db.callLog.update({ where: { id: callLog.id }, data: { status: 'failed', outcome: 'Dial failed' } });
    return NextResponse.json({ error: 'Failed to start call with Vapi', detail: err.slice(0, 300) }, { status: 502 });
  }

  const call = await res.json();
  await db.callLog.update({ where: { id: callLog.id }, data: { providerCallId: call.id, status: 'ringing' } });

  return NextResponse.json({ ok: true, callId: callLog.id, vapiId: call.id, status: 'ringing' });
}
