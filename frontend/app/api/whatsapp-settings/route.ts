import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';

export async function GET() {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await db.whatsAppSettings.findUnique({
    where: { organizationId: user.organizationId }
  });

  return NextResponse.json(settings || {});
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { apiKey, apiToken, accountSid, subdomain, whatsappNumber, isActive } = await req.json();

  const settings = await db.whatsAppSettings.upsert({
    where: { organizationId: user.organizationId },
    update: { apiKey, apiToken, accountSid, subdomain, whatsappNumber, isActive },
    create: {
      organizationId: user.organizationId,
      apiKey,
      apiToken,
      accountSid,
      subdomain,
      whatsappNumber,
      isActive: isActive !== false
    }
  });

  return NextResponse.json(settings);
}
