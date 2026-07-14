import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = await db.whatsAppTemplate.findMany({
    where: { agentId: params.id, agent: { organizationId: user.organizationId } }
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // First verify agent belongs to user
  const agent = await db.agent.findUnique({
    where: { id: params.id, organizationId: user.organizationId }
  });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const { triggerOutcome, templateName, messageBody, isActive } = await req.json();

  const template = await db.whatsAppTemplate.create({
    data: {
      agentId: params.id,
      triggerOutcome,
      templateName,
      messageBody,
      isActive
    }
  });

  return NextResponse.json(template);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await req.json();

  // Make sure it belongs to an agent this user owns
  const template = await db.whatsAppTemplate.findUnique({
    where: { id: templateId },
    include: { agent: true }
  });

  if (!template || template.agent.organizationId !== user.organizationId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.whatsAppTemplate.delete({ where: { id: templateId } });
  return NextResponse.json({ success: true });
}
