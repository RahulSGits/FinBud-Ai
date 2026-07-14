import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

// Mark a call's lead as interested (or not) and — when interested and the
// user has WhatsApp follow-up enabled — auto-send the WhatsApp message.
// Callable by the call's owner (session) OR the voice server (internal secret).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { callId, interested = true, customerName } = body;
  if (!callId) return NextResponse.json({ error: 'callId required' }, { status: 400 });

  const call = await db.callLog.findUnique({ where: { id: callId } });
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

  // Authorize: internal secret (voice server) or the owning user.
  const internal = req.headers.get('x-internal-secret');
  const isInternal = !!process.env.INTERNAL_API_SECRET && internal === process.env.INTERNAL_API_SECRET;
  let user = null;
  if (!isInternal) {
    user = await getAuthUser();
    if (!user || user.organizationId !== call.organizationId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else {
    // If internal, just fetch the first user of the org? No need for user object if we just want to send whatsapp. 
    // We should get the org instead, but the code expects user. Let's get the owner of the organization.
    user = await db.user.findFirst({ where: { organizationId: call.organizationId, role: 'owner' } }) || 
           await db.user.findFirst({ where: { organizationId: call.organizationId } });
  }

  await db.callLog.update({
    where: { id: call.id },
    data: { interested: !!interested, outcome: interested ? 'Interested' : (call.outcome || 'Not Interested') },
  });

  // Note: WhatsApp messages for 'Interested' are now handled asynchronously by Exotel WhatsAppService
  // via webhook triggers, configured in WhatsAppTemplate for the agent.

  return NextResponse.json({ ok: true, interested: !!interested });
}
