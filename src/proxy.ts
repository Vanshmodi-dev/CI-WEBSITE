import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';

/**
 * Admin route guard, and the admin's stricter Content Security Policy.
 *
 * Renamed from `middleware.ts` in Phase 10: Next.js 16 deprecated the
 * `middleware` file convention in favour of `proxy`, and this file is the admin
 * route guard, so it belongs to a security phase rather than an SEO one.
 *
 * =============================================================================
 * ⚠ THIS IS NOT THE SECURITY BOUNDARY.
 * =============================================================================
 *
 * It only checks whether a session cookie is PRESENT — it cannot verify the
 * signature, because a proxy may run on the Edge runtime where node:crypto and
 * the database are unavailable. Anyone can set a cookie.
 *
 * The real checks are `requireAdmin()` in every admin page and
 * `requireAdminOrNull()` in every admin server action, both of which verify the
 * HMAC, re-read the account, and check the session has not been revoked. Phase
 * 10 verified this by calling every admin route and every admin mutation
 * directly with a forged cookie.
 *
 * What this buys is a fast redirect for a signed-out browser, so nobody waits
 * on a database round trip to be told to sign in.
 *
 * =============================================================================
 * THE CSP DECISION — a stricter policy where it can be afforded
 * =============================================================================
 *
 * Phase 9 found that `script-src 'self'` broke the site: Next streams the React
 * Server Component payload as inline `<script>` blocks, and blocking them meant
 * React never hydrated. Phase 9 restored function with `'unsafe-inline'` and
 * left the permanent decision here.
 *
 * Three options were measured, not assumed:
 *
 *   A. NONCES EVERYWHERE. Next's own guide is explicit: nonces require dynamic
 *      rendering, and "static optimization and Incremental Static Regeneration
 *      (ISR) are disabled". The publish-and-revalidate architecture that Phase
 *      8 verified end to end is built on ISR. Rejected for the public site.
 *
 *   B. experimental.sri. Built and measured in Phase 9: it adds `integrity` to
 *      the seven EXTERNAL script tags and leaves all five inline blocks
 *      unhashed, so the violation remains. It does not solve this problem, and
 *      it is experimental.
 *
 *   C. 'unsafe-inline' everywhere. Works, and weakens the XSS defence on every
 *      page equally — including the ones that hold the session cookie and
 *      render student names, marks and enquiry details.
 *
 * NONE OF THOSE IS THE ANSWER, BECAUSE THE QUESTION IS NOT SITEWIDE.
 *
 * Every `/admin` route is already `force-dynamic`. Nonces cost ISR, and the
 * admin has no ISR to lose. So the admin gets option A and the public site gets
 * option C, which puts the strict policy exactly where the session cookie and
 * the student data live, and accepts the weaker one only on pages that render
 * no user-controlled HTML at all.
 *
 * FAIL-SAFE, NOT FAIL-OPEN. `next.config.ts` sets the baseline CSP for every
 * route including `/admin`. This function OVERRIDES it for admin requests with
 * the stricter nonce policy. If this file ever fails to run, admin pages fall
 * back to the baseline rather than to no policy at all.
 */

const SESSION_COOKIE = 'ci_admin_session';

/**
 * The admin policy.
 *
 * `'strict-dynamic'` is what makes the nonce work for a framework: scripts the
 * nonced bootstrap loads inherit its trust, so Next's own chunks do not each
 * need a nonce. It also causes browsers to IGNORE `'self'` and any host list in
 * `script-src`, which is the point — allowlists stop mattering.
 *
 * `'unsafe-inline'` IS ALSO PRESENT, AND IT IS NOT A WEAKENING. Any browser
 * that understands nonces ignores `'unsafe-inline'` entirely when a nonce is
 * given — that is specified behaviour, not a quirk. What it buys is the old
 * browser that understands neither: without it, such a browser blocks every
 * inline script and the admin panel breaks exactly the way Phase 9 found the
 * public site broken. With it, that browser falls back to the same policy the
 * public site already runs under.
 *
 * `https:` is deliberately NOT added as a companion fallback. The usual advice
 * pairs it with `'strict-dynamic'`, but this admin loads scripts from its own
 * origin only, so `'self'` already covers the fallback case and `https:` would
 * widen the policy for old browsers to no purpose.
 *
 * `style-src` keeps `'unsafe-inline'`: React injects inline <style> during
 * streaming SSR, and a nonce cannot be attached to styles React emits itself.
 * That is the same documented compromise the baseline makes, and it is far less
 * dangerous than inline script.
 */
function adminCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    /*
      ⚠ i.ytimg.com IS DELIBERATE, AND ITS ABSENCE WAS A BUG.

      The public CSP in `next.config.ts` has allowed YouTube's poster host since
      Topic 9. The admin's did not — and the admin renders those posters in two
      places that exist precisely to be looked at: the video list, so a teacher
      can tell one video from another, and the form's live preview, whose own
      comment says it "proves the link resolved to the video the teacher meant".

      Both were blocked by this line. The preview proved nothing, and every
      thumbnail in the admin was a broken image. Found in Phase 21 by reading
      the console on each admin route rather than by looking at the pages.

      This admits ONE external image host, the same one the public site already
      uses. Images do not execute; `script-src`, `object-src` and `frame-src`
      are untouched, and `frame-src 'none'` still means no YouTube player can
      ever load inside the admin.
    */
    "img-src 'self' data: blob: https://i.ytimg.com",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The sign-in page and the sign-out endpoint must stay reachable.
  const alwaysReachable = pathname === '/admin/login' || pathname === '/admin/logout';

  if (!alwaysReachable) {
    const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
    if (!hasCookie) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      // The original path is deliberately NOT carried across. A `?next=`
      // parameter that survives a redirect is the seed of an open redirect, and
      // the admin has one landing page anyway.
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // A fresh nonce per request. Next reads it back out of this header and
  // attaches it to the framework's own script tags.
  const nonce = randomBytes(16).toString('base64');
  const csp = adminCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  // Admin responses are per-account and must never be held by a shared cache.
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
