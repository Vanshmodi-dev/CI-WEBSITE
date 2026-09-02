import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { adminCsp as buildAdminCsp } from '@/lib/csp';

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
 *
 * PHASE 22 MOVED THE DIRECTIVES to `src/lib/csp.ts`, which assembles this
 * policy and the public baseline from one set of shared parts. The reasoning
 * above is unchanged and is still the place to read it; what changed is that a
 * directive both policies are meant to share can no longer drift in one and not
 * the other, which is exactly how the i.ytimg.com bug above happened.
 */
function adminCsp(nonce: string): string {
  /*
    ⚠ 'unsafe-eval' IS ADDED FOR THE DEV SERVER ONLY, AND CANNOT SHIP.

    React's development build probes `eval()` when it reads the RSC payload and
    logs a console error on every admin page if the policy forbids it. The
    measurement behind that, and why it is not our code, is in src/lib/csp.ts.

    `process.env.NODE_ENV` is not read at runtime here. The bundler replaces it
    with the literal "production" while building, so this call site is emitted
    as `{dev: !1}` — a constant, not a lookup. Checked in the built output:
    `.next/server/chunks/[root-of-the-server]__*.js` contains the call as
    `(r,{dev:!1})`.

    To be exact about what that does and does not buy: the STRING
    `'unsafe-eval'` is still present in that chunk, inside the builder's body,
    because the builder itself is not inlined. It is unreachable, not absent.
    The guarantee is that no production code path can pass `dev: true`, not that
    the bytes are gone — and the header a browser actually receives is what
    `scripts/verify-security.mjs` asserts on against a running production build.

    `'strict-dynamic'` makes a browser ignore `'self'` and `'unsafe-inline'` in
    script-src; it does NOT make it ignore `'unsafe-eval'`, which is why this
    works here and why it would be a real weakening if it ever shipped.
  */
  return buildAdminCsp(nonce, { dev: process.env.NODE_ENV === 'development' });
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
