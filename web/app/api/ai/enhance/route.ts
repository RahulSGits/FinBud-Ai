import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth';
import { AiNotConfiguredError, enhanceSection, isAiConfigured, type SectionKey } from '@/lib/ai/prompt-builder';

export const maxDuration = 60;

const SECTIONS: SectionKey[] = [
  'firstMessage', 'systemPrompt', 'businessContext', 'callObjective',
  'qualificationRules', 'objectionHandling', 'complianceRules', 'closingScript',
];

export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json({ error: 'AI authoring is unavailable: OPENAI_API_KEY is not configured.' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const section = String(body.section ?? '') as SectionKey;

  if (!SECTIONS.includes(section)) {
    return NextResponse.json({ error: `section must be one of: ${SECTIONS.join(', ')}` }, { status: 400 });
  }

  try {
    const text = await enhanceSection(section, String(body.current ?? ''), {
      name: body.name, description: body.description, callObjective: body.callObjective,
    });
    return NextResponse.json({ text });
  } catch (e: any) {
    if (e instanceof AiNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error('enhance failed:', e);
    return NextResponse.json({ error: e?.message || 'Could not enhance this section.' }, { status: 502 });
  }
}
