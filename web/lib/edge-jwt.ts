// HS256 verification using the Edge runtime's own Web Crypto.
//
// lib/auth.ts signs and verifies with jose, which is the right tool there: it
// runs in Node, where nothing about jose is a problem. Middleware is different.
// It is compiled for the Edge runtime, and importing jose drags its JWE branch
// along, which reaches for CompressionStream and makes every build report
// "Compiled with warnings". The warning is cosmetic — that code path is
// unreachable for a signed-only token — but it is also avoidable, because
// middleware needs exactly one operation that crypto.subtle does natively.
//
// This lives in its own module rather than inside middleware.ts so it can be
// tested directly against tokens jose actually produced. A verifier that is
// wrong in the strict direction logs every user out; wrong in the lax direction
// it lets strangers in. Neither is something to find out in production, so
// scripts/test-edge-jwt.mjs exercises both directions against this file.
//
// Uses only Web Crypto, atob, TextEncoder/TextDecoder — all present in the Edge
// runtime, Node 18+, and the browser. No Node built-ins, by design.

export interface EdgeSession {
  id: string;
  role: string;
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Verify a session token and return its subject and role, or null.
 *
 * Deliberately strict: the algorithm is pinned to HS256 rather than read from
 * the header, so a token presenting "none" — or an asymmetric alg, where the
 * public key would be handed to HMAC as if it were the shared secret — is
 * rejected outright instead of being verified on the attacker's terms.
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined
): Promise<EdgeSession | null> {
  if (!token || !secret) return null;

  try {
    const parts = token.split('.');
    // Exactly three. A JWE has five, and letting one through here would mean
    // verifying a segment that is not the signature.
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64)));
    if (header?.alg !== 'HS256') return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // crypto.subtle.verify compares in constant time. Never do this by hand.
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));

    // A valid signature is not enough — an expired token is still correctly
    // signed. createSession always sets exp, so its absence means the token did
    // not come from us; treat that as invalid rather than as "never expires".
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload?.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload?.nbf === 'number' && payload.nbf > now) return null;
    if (!payload?.sub) return null;

    return { id: String(payload.sub), role: String(payload.role ?? '') };
  } catch {
    // Malformed base64, malformed JSON, a truncated cookie — all mean "not a
    // session we issued", which is the same answer as a bad signature.
    return null;
  }
}
