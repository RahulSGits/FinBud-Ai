import { NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth';
import { defaultProviderId, listProviders } from '@/lib/providers';

/** Available voice engines and their configuration status (for Settings). */
export async function GET() {
  try { await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
  return NextResponse.json({ providers: await listProviders(), default: defaultProviderId() });
}
