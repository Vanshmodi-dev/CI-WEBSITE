import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/lib/auth';
import { rejectCrossOrigin } from '@/lib/request-guard';
import { SITE_URL } from '@/lib/seo';

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

  const response = NextResponse.redirect(new URL('/admin/login', SITE_URL), {
    status: 303,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
