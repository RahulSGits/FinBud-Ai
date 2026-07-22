import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { agentToConfig, getVoiceProvider } from '@/lib/providers/voice';

export async function GET() {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized or no organization' }, { status: 401 });
  
  const agents = await db.agent.findMany({ 
    where: { organizationId: user.organizationId }, 
    include: { prompts: { orderBy: { version: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' } 
  });
  return NextResponse.json(agents);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized or no organization' }, { status: 401 });
  
  try {
    const body = await req.json();
    
    // Create Agent and the first PromptVersion in a transaction
    let agent = await db.$transaction(async (tx) => {
      const newAgent = await tx.agent.create({
        data: { 
          organizationId: user.organizationId!,
          name: body.name || 'Unnamed Agent',
          description: body.description,
          provider: body.provider || 'vapi',
          sttProvider: body.sttProvider || null,
          sttModel: body.sttModel || null,
          llmProvider: body.llmProvider || 'openai',
          model: body.model || 'gpt-4o',
          temperature: body.temperature !== undefined ? Number(body.temperature) : 0.7,
          maxTokens: body.maxTokens ? Number(body.maxTokens) : 500,
          voiceProvider: body.voiceProvider || '11labs',
          voiceId: body.voiceId || 'priya', 
          language: body.language || 'en-US', 
          status: 'inactive', 
          firstMessage: body.greeting || body.firstMessage, 
          silenceTimeout: body.silenceTimeout ? Number(body.silenceTimeout) : 10,
          interruptions: body.interruptions ?? true,
          transferEnabled: !!body.transferEnabled, 
          transferNumber: body.transferNumber || null,
          systemPrompt: body.systemPrompt || ''
        },
      });

      await tx.promptVersion.create({
        data: {
          agentId: newAgent.id,
          version: 1,
          systemPrompt: body.systemPrompt || '',
          businessContext: body.businessContext || '',
          callObjective: body.callObjective || '',
          qualificationRules: body.qualificationRules || '',
          closingInstructions: body.closingInstructions || '',
          fallbackRules: body.fallbackRules || '',
          complianceRules: body.complianceRules || '',
        }
      });

      return newAgent;
    });

    // Sync the agent to whichever voice provider it targets. A sync failure
    // must not lose the agent the user just authored, so it is non-fatal.
    let syncError: string | null = null;
    try {
      const provider = getVoiceProvider(agent.provider);
      if (await provider.isConfigured()) {
        const { externalAgentId } = await provider.createAgent(agentToConfig(agent));
        agent = await db.agent.update({
          where: { id: agent.id },
          data: {
            externalAgentId,
            // Keep the legacy column populated for older Vapi rows.
            vapiAssistantId: provider.id === 'vapi' ? externalAgentId : agent.vapiAssistantId,
          },
        });
      } else {
        syncError = `${provider.name} is not configured; agent saved as draft.`;
      }
    } catch (err: any) {
      syncError = err?.message || 'Provider sync failed';
      console.error('Error syncing agent with provider:', err);
    }

    return NextResponse.json({ ...agent, syncError }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  try {
    const body = await req.json();
    const id = body.id;
    if (!id) return NextResponse.json({ error: 'Missing agent id' }, { status: 400 });

    const existingAgent = await db.agent.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existingAgent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    // Update the agent
    const updatedAgent = await db.agent.update({
      where: { id },
      data: {
        name: body.name !== undefined ? body.name : undefined,
        description: body.description !== undefined ? body.description : undefined,
        provider: body.provider !== undefined ? body.provider : undefined,
        sttProvider: body.sttProvider !== undefined ? body.sttProvider : undefined,
        sttModel: body.sttModel !== undefined ? body.sttModel : undefined,
        llmProvider: body.llmProvider !== undefined ? body.llmProvider : undefined,
        model: body.model !== undefined ? body.model : undefined,
        temperature: body.temperature !== undefined ? Number(body.temperature) : undefined,
        maxTokens: body.maxTokens !== undefined ? Number(body.maxTokens) : undefined,
        voiceProvider: body.voiceProvider !== undefined ? body.voiceProvider : undefined,
        voiceId: body.voiceId !== undefined ? body.voiceId : undefined,
        language: body.language !== undefined ? body.language : undefined,
        status: body.status !== undefined ? body.status : undefined,
        firstMessage: body.greeting || body.firstMessage || undefined,
        silenceTimeout: body.silenceTimeout !== undefined ? Number(body.silenceTimeout) : undefined,
        interruptions: body.interruptions !== undefined ? body.interruptions : undefined,
        transferEnabled: body.transferEnabled !== undefined ? !!body.transferEnabled : undefined,
        transferNumber: body.transferNumber !== undefined ? body.transferNumber : undefined,
        systemPrompt: body.systemPrompt !== undefined ? body.systemPrompt : undefined,
      }
    });

    // Push the change to the provider, creating the remote agent if this row
    // has never been synced (e.g. it was saved while keys were missing).
    let agent = updatedAgent;
    let syncError: string | null = null;
    try {
      const provider = getVoiceProvider(agent.provider);
      if (await provider.isConfigured()) {
        const config = agentToConfig(agent);
        const externalId = agent.externalAgentId || agent.vapiAssistantId;

        if (externalId) {
          await provider.updateAgent(externalId, config);
        } else {
          const { externalAgentId } = await provider.createAgent(config);
          agent = await db.agent.update({
            where: { id: agent.id },
            data: {
              externalAgentId,
              vapiAssistantId: provider.id === 'vapi' ? externalAgentId : agent.vapiAssistantId,
            },
          });
        }
      }
    } catch (err: any) {
      syncError = err?.message || 'Provider sync failed';
      console.error('Failed to sync agent update with provider:', err);
    }

    return NextResponse.json({ ...agent, syncError });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const body = await req.json().catch(() => ({}));
  const id = body.id || req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  
  const agent = await db.agent.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Best-effort cleanup of the provider-side agent; never block local deletion.
  const externalId = agent.externalAgentId || agent.vapiAssistantId;
  if (externalId) {
    try {
      const provider = getVoiceProvider(agent.provider);
      if (await provider.isConfigured()) await provider.deleteAgent(externalId);
    } catch (err) {
      console.error('Failed to delete provider agent:', err);
    }
  }

  await db.agent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
