import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/lib/auth';
import { rejectCrossOrigin } from '@/lib/request-guard';

/**
 * Sign out. POST only, same-origin only.
 *
 * A GET would let any page log the admin out with an <img> tag, and would be
 * triggered by link prefetching. Clearing a session is a state change, so it
 * takes a POST.
 *
 * ⚠ POST ALONE IS NOT ENOUGH, which Phase 10 established by trying it. Route
 * Handlers do not get the automatic Origin/Host check that Next.js applies to
 * Server Actions, so a cross-origin form post from any page cleared the admin's
 * session and returned 303. `rejectCrossOrigin` closes that.
 *
 * Signing out now also REVOKES every outstanding session for the account, not
 * just the cookie in this browser — see `signOut` in src/lib/auth.ts.
 */
export async function POST(request: NextRequest) {
  const refused = rejectCrossOrigin(request);
  if (refused) return refused;

  await signOut();

  /*
    BACK TO THE SIGN-IN PAGE ON THE HOST THEY WERE ACTUALLY USING.

    ⚠ THIS USED TO REDIRECT TO `SITE_URL`, THE CONFIGURED CANONICAL ORIGIN.

    That is right for a canonical link and wrong for a redirect. It ignores the
    host the request arrived on, so signing out sent the admin to whatever
    NEXT_PUBLIC_SITE_URL happened to say — a different port, the apex instead of
    the www host, or the production domain from a preview deployment. Topic 11
    hit it as a plain bug: on a server running on port 3170, clicking "Log out"
    left the browser sitting on /admin, because the redirect pointed at
    localhost:3000 and nothing was listening there.

    Worth recording how it stayed hidden. The teacher-workflow suite asserts
    that signing out lands on /admin/login, and it PASSED — because it had
    always been run against port 3000, the one port where the hard-coded origin
    happens to be correct. The assertion was real, the coverage was real, and
    the test was quietly measuring the environment rather than the behaviour.

    `nextUrl` carries the request's own origin, including the forwarded host a
    platform proxy sets, so the redirect now stays where the admin already is.
  */
  const target = request.nextUrl.clone();
  target.pathname = '/admin/login';
  target.search = '';

  const response = NextResponse.redirect(target, { status: 303 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
