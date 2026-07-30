import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth';
import { AiNotConfiguredError, generateAgent, isAiConfigured } from '@/lib/ai/prompt-builder';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'AI authoring is unavailable: OPENAI_API_KEY is not configured.' },
      { status: 503 }
    );
  }

  const { description } = await req.json().catch(() => ({}));
  if (!description || String(description).trim().length < 10) {
    return NextResponse.json(
      { error: 'Describe the agent in a sentence or two (at least 10 characters).' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ agent: await generateAgent(String(description)) });
  } catch (e: any) {
    if (e instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    console.error('generate-agent failed:', e);
    return NextResponse.json({ error: e?.message || 'Could not generate the agent.' }, { status: 502 });
  }
}
