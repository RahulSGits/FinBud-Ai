import { type NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from './lib/edge-jwt';

// Middleware only decides *where to send an unauthenticated browser*. It is not
// the security boundary — every API route and server page re-checks the session
// itself, so a middleware bypass cannot expose data.
const PROTECTED = ['/dashboard', '/admin', '/platform'];
/** Company-administrator area. */
const ADMIN_ONLY = ['/admin'];
/**
 * The platform owner's area.
 *
 * A separate prefix rather than taking over /admin, which is already the
 * company-administrator area across fifteen pages and every link between them.
 * Renaming those to /app to free up /admin would be a large, purely cosmetic
 * migration; a distinct prefix gets the same separation for none of the risk.
 */
const PLATFORM_ONLY = ['/platform'];

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

  // Anyone but the platform owner is sent to their own area.
  if (PLATFORM_ONLY.some((p) => pathname.startsWith(p)) && session.role !== 'super_admin') {
    const url = request.nextUrl.clone();
    url.pathname = session.role === 'admin' ? '/admin' : '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Employees hitting an admin route go to their own dashboard rather than a
  // dead end.
  //
  // super_admin is admitted here as well: the platform owner needs to be able
  // to look at a company's own screens for support. Before this, `role !==
  // 'admin'` bounced them to /dashboard — which they also cannot use, having no
  // company — so the account was locked out of the entire application.
  if (
    ADMIN_ONLY.some((p) => pathname.startsWith(p)) &&
    session.role !== 'admin' &&
    session.role !== 'super_admin'
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/platform/:path*'],
};
