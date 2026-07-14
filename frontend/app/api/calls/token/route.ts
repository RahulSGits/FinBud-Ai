import { NextResponse } from 'next/server';

// POST /api/calls/token
// Generate a LiveKit token for the frontend to connect to the agent's WebRTC room.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agent_id, user_id } = body;

    if (!agent_id || !user_id) {
      return NextResponse.json({ error: 'Missing agent_id or user_id' }, { status: 400 });
    }

    // In a real implementation:
    // 1. Verify user owns agent or has access.
    // 2. Import livekit-server-sdk
    // 3. const token = new AccessToken('apiKey', 'apiSecret', { identity: `user-₹{user_id}` });
    // 4. token.addGrant({ roomJoin: true, room: `agent-room-₹{agent_id}` });
    // 5. return token.toJwt();

    const mockToken = `ey...livekit...token...for...agent...${agent_id}`;

    return NextResponse.json({ 
      success: true, 
      token: mockToken, 
      ws_url: process.env.LIVEKIT_URL || 'wss://finbud-demo.livekit.cloud' 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
