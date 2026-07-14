import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const campaigns = await db.campaign.findMany({
    where: { organizationId: user.organizationId },
    include: {
      agent: { select: { name: true, voiceId: true } },
      _count: {
        select: { contacts: true, callLogs: true }
      },
      callLogs: {
        where: { interested: true },
        select: { id: true }
      }
    },
    orderBy: { createdAt: 'desc' },
  });
  
  const mapped = campaigns.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    createdAt: c.createdAt,
    totalContacts: c._count.contacts,
    contactsCalled: c._count.callLogs,
    successCount: c.callLogs.length
  }));
  
  return NextResponse.json(mapped);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const body = await req.json();
  const campaign = await db.campaign.create({
    data: { 
      organizationId: user.organizationId, 
      name: body.name, 
      agentId: body.agentId, 
      status: 'draft',
      businessHours: body.businessHours ? JSON.stringify(body.businessHours) : null,
      callLimits: body.callLimits ? Number(body.callLimits) : null,
    },
  });
  
  // If contacts are provided, create them
  if (body.contacts && Array.isArray(body.contacts) && body.contacts.length > 0) {
    await db.contact.createMany({
      data: body.contacts.map((c: any) => ({
        organizationId: user.organizationId,
        campaignId: campaign.id,
        phone: c.phone,
        name: c.name || null,
        status: 'pending'
      }))
    });
  }
  
  return NextResponse.json(campaign, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const body = await req.json();
  const campaign = await db.campaign.findFirst({ where: { id: body.id, organizationId: user.organizationId } });
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  
  const updated = await db.campaign.update({ 
    where: { id: body.id }, 
    data: { 
      name: body.name, 
      status: body.status,
    } 
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { id } = await req.json();
  const campaign = await db.campaign.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  
  await db.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
