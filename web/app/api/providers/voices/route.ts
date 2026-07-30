import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth';
import { getProvider } from '@/lib/providers';

/** Loaded dynamically from the provider — never hardcoded in the UI. */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
  const provider = getProvider(req.nextUrl.searchParams.get('provider'));
  try {
    const items = await provider.listVoices();
    return NextResponse.json({ provider: provider.id, items });
  } catch (e: any) {
    return NextResponse.json({ provider: provider.id, items: [], error: e?.message });
  }
}
