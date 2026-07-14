import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

// Update the signed-in user's profile / company details.
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, any> = {};
  for (const f of ['fullName', 'company', 'phone', 'website', 'industry', 'whatsappTemplate']) {
    if (typeof body[f] === 'string') data[f] = body[f].trim();
  }
  if (typeof body.whatsappEnabled === 'boolean') data.whatsappEnabled = body.whatsappEnabled;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: { ...(data.fullName ? { fullName: data.fullName } : {}) }
  });

  if (user.organizationId) {
    const orgData: any = {};
    if (data.company) orgData.name = data.company;
    if (data.phone) orgData.phone = data.phone;
    if (data.website) orgData.website = data.website;
    if (data.industry) orgData.industry = data.industry;
    
    if (Object.keys(orgData).length > 0) {
      await db.organization.update({ where: { id: user.organizationId }, data: orgData });
    }

    if (data.whatsappEnabled !== undefined || data.whatsappTemplate !== undefined) {
      const waData: any = {};
      if (data.whatsappEnabled !== undefined) waData.enabled = data.whatsappEnabled;
      // Note: For now we'll just ignore whatsappTemplate since we don't have defaultTemplate field in WhatsAppSettings.
      // We will add logic for default template if needed, but WhatsAppTemplates are separate records now.
      if (Object.keys(waData).length > 0) {
        await db.whatsAppSettings.upsert({
          where: { organizationId: user.organizationId },
          create: { organizationId: user.organizationId, ...waData },
          update: waData
        });
      }
    }
  }

  return NextResponse.json({ success: true, id: updatedUser.id });
}
