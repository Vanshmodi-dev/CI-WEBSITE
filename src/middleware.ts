import { NextResponse, type NextRequest } from 'next/server';

/**
 * Admin route guard.
 *
 * ⚠ THIS IS NOT THE SECURITY BOUNDARY.
 *
 * It only checks whether a session cookie is PRESENT — it cannot verify the
 * signature, because middleware runs on the Edge runtime where node:crypto and
 * the database are unavailable. Anyone can set a cookie.
 *
 * The real checks are `requireAdmin()` in every admin page and
 * `requireAdminOrNull()` in every admin server action, both of which verify the
 * HMAC and re-read the account from the database.
 *
 * What this buys is a fast redirect for a signed-out browser, so nobody waits
 * on a database round trip to be told to sign in.
 */
const SESSION_COOKIE = 'ci_admin_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The sign-in page and the sign-out endpoint must stay reachable.
  if (pathname === '/admin/login' || pathname === '/admin/logout') {
    return NextResponse.next();
  }

  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
