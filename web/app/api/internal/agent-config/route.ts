import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Agent configuration for the LiveKit worker.
 *
 * Server-to-server only, guarded by a shared secret. This is what makes agents
 * authored in the dashboard drive live calls without redeploying the worker.
 */
function authorised(req: NextRequest): boolean {
  const secret = process.env.FINBUD_INTERNAL_SECRET;
  // Fail closed: an unset secret must not mean "open to everyone".
  if (!secret) return false;
  return req.headers.get('x-internal-secret') === secret;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const agentId = req.nextUrl.searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'agentId is required' }, { status: 400 });

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  // Structured sections, in the order they should appear in the prompt.
  const sections = [
    { title: 'Business context', body: agent.businessContext },
    { title: 'Call objective', body: agent.callObjective },
    { title: 'Qualification rules', body: agent.qualificationRules },
    { title: 'Objection handling', body: agent.objectionHandling },
    { title: 'Compliance', body: agent.complianceRules },
    { title: 'Closing', body: agent.closingScript },
  ].filter((s) => (s.body ?? '').trim());

  return NextResponse.json({
    agentId: agent.id,
    name: agent.name,
    firstMessage: agent.firstMessage,
    systemPrompt: agent.systemPrompt,
    sections,
    llmModel: agent.llmModel,
    sttModel: agent.sttModel,
    ttsModel: agent.ttsModel,
    voiceId: agent.voiceId,
    language: agent.language,
    transferEnabled: agent.transferEnabled,
    transferNumber: agent.transferNumber,
  });
}
