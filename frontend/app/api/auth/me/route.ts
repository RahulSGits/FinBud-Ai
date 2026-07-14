import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let org: any = null;
  let waSettings: any = null;
  
  if (user.organizationId) {
    org = await db.organization.findUnique({ where: { id: user.organizationId } });
    waSettings = await db.whatsAppSettings.findUnique({ where: { organizationId: user.organizationId } });
  }

  return NextResponse.json({
    id: user.id, 
    email: user.email, 
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt,
    company: org?.name || '',
    phone: org?.phone || '',
    website: org?.website || '',
    industry: org?.industry || '',
    whatsappEnabled: waSettings?.enabled || false,
    whatsappTemplate: waSettings?.defaultTemplate || ''
  });
}
