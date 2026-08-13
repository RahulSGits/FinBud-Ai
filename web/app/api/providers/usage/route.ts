import { NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth';
import { assertAdmin, errorResponse } from '@/lib/authz';
import { providerUsage } from '@/lib/providers/usage';

export const dynamic = 'force-dynamic';

/**
 * Voice-engine spend, and whether the account has run out of credit.
 *
 * Read-only. There used to be a POST here for recording a balance by hand;
 * OmniDimension exposes no balance to an ordinary API key, so that number was
 * only ever as fresh as the last person to type it, and it has been removed
 * along with the panel that collected it. What remains is measured or reported
 * by the engine itself.
 *
 * Admin-only: this is cost data, and it is a live call out to the engine, which
 * is why it is a route rather than part of the settings page render.
 */
export async function GET() {
  try {
    const user = await requireUser();
    assertAdmin(user);
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  return NextResponse.json(await providerUsage());
}
