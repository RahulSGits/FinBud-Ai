import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

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
          llmProvider: body.llmProvider || 'openai',
          model: body.model || 'gpt-4o',
          temperature: body.temperature !== undefined ? Number(body.temperature) : 0.7,
          maxTokens: body.maxTokens ? Number(body.maxTokens) : 500,
          voiceProvider: body.voiceProvider || 'elevenlabs',
          voiceId: body.voiceId || 'priya', 
          language: body.language || 'en-US', 
          status: 'inactive', 
          firstMessage: body.greeting || body.firstMessage, 
          silenceTimeout: body.silenceTimeout ? Number(body.silenceTimeout) : 10,
          interruptions: body.interruptions ?? true,
          transferEnabled: !!body.transferEnabled, 
          transferNumber: body.transferNumber || null 
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

    // Create persistent assistant in Vapi
    try {
      // Import dynamically to avoid top-level dependency issues
      const { getApiKey } = await import('@/lib/providers');
      const vapiKey = await getApiKey('vapi', 'VAPI_API_KEY');
      
      if (vapiKey) {
        const vapiRes = await fetch('https://api.vapi.ai/assistant', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: agent.name,
            firstMessage: agent.firstMessage || 'Hello!',
            model: {
              provider: agent.llmProvider || 'openai',
              model: agent.model || 'gpt-4o-mini',
              messages: [{ role: 'system', content: body.systemPrompt || 'You are an AI assistant.' }],
            },
            voice: {
              provider: agent.voiceProvider || 'elevenlabs',
              voiceId: agent.voiceId || 'eleven_turbo_v2',
            }
          })
        });
        
        if (vapiRes.ok) {
          const vapiData = await vapiRes.json();
          if (vapiData.id) {
            agent = await db.agent.update({
              where: { id: agent.id },
              data: { vapiAssistantId: vapiData.id }
            });
          }
        } else {
          console.error('Failed to create Vapi assistant:', await vapiRes.text());
        }
      }
    } catch (vapiErr) {
      console.error('Error syncing with Vapi:', vapiErr);
    }

    return NextResponse.json(agent, { status: 201 });
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
      }
    });

    // Sync with Vapi if a vapiAssistantId exists and we might be updating fields
    if (updatedAgent.vapiAssistantId) {
      try {
        const { getApiKey } = await import('@/lib/providers');
        const vapiKey = await getApiKey('vapi', 'VAPI_API_KEY');
        if (vapiKey) {
          await fetch(`https://api.vapi.ai/assistant/${updatedAgent.vapiAssistantId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${vapiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: updatedAgent.name,
              firstMessage: updatedAgent.firstMessage || 'Hello!',
              model: {
                provider: updatedAgent.llmProvider || 'openai',
                model: updatedAgent.model || 'gpt-4o-mini',
              },
              voice: {
                provider: updatedAgent.voiceProvider || 'elevenlabs',
                voiceId: updatedAgent.voiceId || 'eleven_turbo_v2',
              }
            })
          });
        }
      } catch (err) {
        console.error('Failed to sync agent update with Vapi:', err);
      }
    }

    return NextResponse.json(updatedAgent);
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
  
  await db.agent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
