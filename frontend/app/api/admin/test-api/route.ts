import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';

export async function POST(req: Request) {
  try {
    // Admin-only: this endpoint reports whether each provider key is valid,
    // which is an oracle an unauthenticated caller must never have. It also
    // spends real API quota on every call.
    const user = await getAuthUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { provider } = await req.json();

    switch (provider) {
      case 'OpenAI': {
        const key = process.env.OPENAI_API_KEY;
        if (!key || key.includes('placeholder')) return NextResponse.json({ success: false, error: 'Key not configured' });
        
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` }
        });
        
        if (res.ok) return NextResponse.json({ success: true });
        const error = await res.json().catch(() => ({}));
        return NextResponse.json({ success: false, error: error.error?.message || 'Invalid API Key' });
      }

      case 'Vapi Native': {
        const key = process.env.VAPI_API_KEY;
        if (!key || key.includes('placeholder')) return NextResponse.json({ success: false, error: 'Key not configured' });
        
        const res = await fetch('https://api.vapi.ai/assistant', {
          headers: { Authorization: `Bearer ${key}` }
        });
        
        if (res.ok) return NextResponse.json({ success: true });
        const error = await res.json().catch(() => ({}));
        return NextResponse.json({ success: false, error: error.message || 'Invalid API Key' });
      }

      case 'ElevenLabs': {
        const key = process.env.ELEVENLABS_API_KEY;
        if (!key || key.includes('placeholder')) return NextResponse.json({ success: false, error: 'Key not configured' });
        
        const res = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': key }
        });
        
        if (res.ok) return NextResponse.json({ success: true });
        return NextResponse.json({ success: false, error: 'Invalid API Key' });
      }

      case 'Deepgram': {
        const key = process.env.DEEPGRAM_API_KEY;
        if (!key || key.includes('placeholder')) return NextResponse.json({ success: false, error: 'Key not configured' });
        
        const res = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { Authorization: `Token ${key}` }
        });
        
        if (res.ok) return NextResponse.json({ success: true });
        return NextResponse.json({ success: false, error: 'Invalid API Key' });
      }

      case 'Sarvam AI': {
        const key = process.env.SARVAM_API_KEY;
        if (!key || key.includes('placeholder')) return NextResponse.json({ success: false, error: 'Key not configured' });
        
        // Let's do a dummy TTS request or check their docs for a status ping, but usually just hitting an endpoint with the key is enough.
        // Assuming Sarvam has some endpoints. If we don't know a safe one, we might get 400 Bad Request if the key is valid but payload is wrong, and 401 if key is invalid.
        const res = await fetch('https://api.sarvam.ai/text-to-speech', {
          method: 'POST',
          headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: ["test"], target_language_code: "hi-IN", speaker: "meera" })
        });
        
        // 401 or 403 means invalid key. 200 or 400 means key is likely valid but payload might be malformed (still implies key works).
        if (res.status !== 401 && res.status !== 403) return NextResponse.json({ success: true });
        return NextResponse.json({ success: false, error: 'Invalid API Key' });
      }

      default:
        return NextResponse.json({ success: false, error: 'Unknown provider' });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
