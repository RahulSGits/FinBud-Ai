import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const logs = await db.callLog.findMany({
    where: { organizationId: user.organizationId },
    include: { 
      agent: { select: { name: true } }, 
      campaign: { select: { name: true } },
      contact: { select: { name: true } }
    },
    orderBy: { startedAt: 'desc' },
    take: 200,
  });

  const mapped = logs.map(l => ({
    ...l,
    customerName: l.contact?.name || ''
  }));

  return NextResponse.json(mapped);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  const durationSec = Number(body.duration) || 0;

  const log = await db.callLog.create({
    data: { 
      organizationId: user.organizationId, 
      agentId: body.agentId, 
      campaignId: body.campaignId, 
      contactId: body.contactId,
      phone: body.phone, 
      duration: durationSec, 
      outcome: body.outcome, 
      cost: body.cost ?? 0,
      direction: body.direction || 'outbound',
      status: body.status || 'completed'
    },
  });

  return NextResponse.json(log, { status: 201 });
}
