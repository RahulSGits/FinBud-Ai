import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthUser();
    if (!session?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.organizationId;

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');

    const contacts = await db.contact.findMany({
      where: {
        organizationId,
        ...(campaignId ? { campaignId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit for now, add pagination later
    });

    return NextResponse.json(contacts);

  } catch (error: any) {
    console.error('Failed to fetch contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
