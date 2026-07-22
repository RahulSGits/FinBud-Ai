import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';
import {
  agentToConfig,
  getVoiceProvider,
  isMockMode,
  VoiceProviderError,
} from '@/lib/providers/voice';

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agentId, phone, campaignId, contactId } = await req.json();
  if (!agentId || !phone) {
    return NextResponse.json({ error: 'agentId and phone are required' }, { status: 400 });
  }

  const agent = await db.agent.findFirst({
    where: { id: agentId, organizationId: user.organizationId },
    include: { prompts: { where: { isActive: true }, take: 1 } },
  });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const provider = getVoiceProvider(agent.provider);

  // Created up front so the provider webhook has an id to correlate against.
  const callLog = await db.callLog.create({
    data: {
      organizationId: user.organizationId,
      agentId: agent.id,
      campaignId: campaignId || null,
      contactId: contactId || null,
      phone,
      direction: 'outbound',
      status: 'initiated',
    },
  });

  const fromNumber = await db.phoneNumber.findFirst({
    where: { organizationId: user.organizationId, status: 'active' },
  });

  try {
    const result = await provider.startCall({
      to: phone,
      externalAgentId: agent.externalAgentId || agent.vapiAssistantId,
      fromNumberId: fromNumber?.sid || null,
      config: agentToConfig(agent),
      metadata: { callLogId: callLog.id },
    });

    await db.callLog.update({
      where: { id: callLog.id },
      data: { providerCallId: result.providerCallId, status: result.status },
    });

    return NextResponse.json({
      ok: true,
      callId: callLog.id,
      providerCallId: result.providerCallId,
      provider: provider.id,
      status: result.status,
      mock: isMockMode(),
    });
  } catch (err) {
    await db.callLog.update({
      where: { id: callLog.id },
      data: { status: 'failed', outcome: 'Dial failed' },
    });

    if (err instanceof VoiceProviderError) {
      return NextResponse.json(
        { error: err.message, provider: err.provider, detail: err.detail },
        { status: err.status }
      );
    }
    console.error('Failed to start call:', err);
    return NextResponse.json({ error: 'Failed to start call' }, { status: 500 });
  }
}
