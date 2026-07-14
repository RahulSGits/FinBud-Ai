import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const call = await db.callLog.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      agent: { select: { name: true } },
      campaign: { select: { name: true } },
      contact: { select: { name: true, phone: true } },
      callEvents: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(call);
}
