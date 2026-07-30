import { NextRequest, NextResponse } from 'next/server';
import { EmbeddingsNotConfiguredError } from '@/lib/knowledge/embed';
import { searchKnowledge } from '@/lib/knowledge/search';

/**
 * Knowledge retrieval for the LiveKit worker.
 *
 * Called mid-call, so it is server-to-server and guarded by the same shared
 * secret as the rest of /api/internal.
 */
function authorised(req: NextRequest): boolean {
  const secret = process.env.FINBUD_INTERNAL_SECRET;
  // Fail closed: an unset secret must not mean "open to everyone".
  if (!secret) return false;
  return req.headers.get('x-internal-secret') === secret;
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const query = String(body?.query ?? '').trim();
  if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

  const requested = Number(body?.limit);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 20) : 5;

  try {
    return NextResponse.json({ results: await searchKnowledge(query, limit) });
  } catch (e) {
    if (e instanceof EmbeddingsNotConfiguredError) {
      // The worker must keep the call going, so answer with no results rather
      // than an error it would have to interpret.
      return NextResponse.json({ results: [], error: e.message }, { status: 503 });
    }
    console.error('knowledge-search failed:', e);
    return NextResponse.json({ results: [], error: 'Knowledge search failed.' }, { status: 502 });
  }
}
