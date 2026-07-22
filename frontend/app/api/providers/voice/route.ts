import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { getVoiceProvider, isMockMode, listVoiceProviders } from '@/lib/providers/voice';

/**
 * Voice providers available to the agent builder, plus the voice catalogue for
 * a given provider. The UI never hardcodes provider names.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const providers = await listVoiceProviders();
  const selected = req.nextUrl.searchParams.get('provider');

  let voices: Awaited<ReturnType<ReturnType<typeof getVoiceProvider>['listVoices']>> = [];
  if (selected) {
    try {
      voices = await getVoiceProvider(selected).listVoices();
    } catch (err) {
      console.error('Failed to list voices:', err);
    }
  }

  return NextResponse.json({ providers, voices, mockMode: isMockMode() });
}
