import { type NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from './lib/edge-jwt';

// Middleware only decides *where to send an unauthenticated browser*. It is not
// the security boundary — every API route and server page re-checks the session
// itself, so a middleware bypass cannot expose data.
const PROTECTED = ['/dashboard', '/admin'];
const ADMIN_ONLY = ['/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth = PROTECTED.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const session = await verifySessionToken(
    request.cookies.get('finbud_session')?.value,
    process.env.AUTH_SECRET
  );

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Return the user where they were headed once they sign in.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Employees hitting an admin route go to their own dashboard rather than a
  // dead end.
  if (ADMIN_ONLY.some((p) => pathname.startsWith(p)) && session.role !== 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
