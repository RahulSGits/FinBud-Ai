import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

async function ownCampaign(organizationId: string, id: string) {
  return db.campaign.findFirst({ where: { id, organizationId } });
}

// List a campaign's contacts.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownCampaign(user.organizationId, params.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const contacts = await db.contact.findMany({ where: { campaignId: params.id }, orderBy: { createdAt: 'desc' }, take: 5000 });
  return NextResponse.json(contacts);
}

// Add contacts (from an uploaded CSV or a single manual entry).
// Body: { contacts: [{ name?, phone }] }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownCampaign(user.organizationId, params.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { contacts } = await req.json();
  if (!Array.isArray(contacts) || contacts.length === 0) return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });

  // Normalize + dedupe by phone.
  const clean = contacts
    .map((c: any) => ({ name: (c.name || '').toString().slice(0, 120) || null, phone: (c.phone || '').toString().replace(/[^\d+]/g, '') }))
    .filter((c) => c.phone.replace(/\D/g, '').length >= 6)
    .slice(0, 5000);
  if (clean.length === 0) return NextResponse.json({ error: 'No valid phone numbers found' }, { status: 400 });

  await db.contact.createMany({ 
    data: clean.map((c) => ({ 
      campaignId: params.id, 
      organizationId: user.organizationId!, 
      name: c.name, 
      phone: c.phone 
    })) 
  });
  return NextResponse.json({ added: clean.length }, { status: 201 });
}

// Remove a contact (?contactId=) or clear all (?all=1).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownCampaign(user.organizationId, params.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contactId = req.nextUrl.searchParams.get('contactId');
  const all = req.nextUrl.searchParams.get('all');
  if (all) await db.contact.deleteMany({ where: { campaignId: params.id } });
  else if (contactId) await db.contact.deleteMany({ where: { id: contactId, campaignId: params.id } });
  else return NextResponse.json({ error: 'contactId or all required' }, { status: 400 });

  return NextResponse.json({ ok: true });
}
