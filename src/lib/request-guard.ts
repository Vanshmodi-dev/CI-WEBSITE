/**
 * Same-origin enforcement for Route Handlers.
 *
 * WHY THIS EXISTS. Next.js gives Server Actions an automatic CSRF defence: it
 * compares the request's `Origin` against `Host` and aborts on a mismatch.
 * Route Handlers get nothing of the sort — they are plain HTTP endpoints, and
 * whatever protection they have is whatever they implement.
 *
 * Phase 10 found the gap by exercising it: a cross-origin `POST` to
 * `/admin/logout` carrying `Origin: https://evil.example` returned 303 and
 * cleared the admin's session. Forced logout is a nuisance rather than a
 * takeover, but it is a state change triggered by a third-party page, which is
 * the definition of CSRF — and the next Route Handler this project adds might
 * not be a nuisance.
 *
 * NO `server-only` GUARD HERE, DELIBERATELY — the same reasoning as
 * validation.ts, token.ts and indexing.ts. This module touches no I/O, no
 * environment and no database; it reads two request headers and compares two
 * strings. Keeping it importable means it can be unit-tested, and a security
 * check that cannot be tested is a security check nobody has verified.
 *
 * SameSite=Lax is NOT sufficient on its own here, which is the whole reason
 * this file exists. Lax permits cookies on top-level cross-site navigations,
 * and a form submitted from another origin is one. It also does nothing at all
 * for a browser that does not implement it. Origin checking is the layer that
 * does not depend on either.
 */

/** Requests with no `Origin` header at all. */
export type MissingOriginPolicy = 'allow' | 'reject';

/** The host part of a URL-ish header value, or null if it is not one. */
function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    // "null" (a sandboxed frame), a bare path, or junk. None is same-origin.
    return null;
  }
}

/**
 * Is this request same-origin?
 *
 * `X-Forwarded-Host` is consulted because a platform proxy rewrites `Host`; it
 * is trusted for exactly this comparison and for nothing else, which mirrors
 * what Next.js itself does for Server Actions.
 *
 * `Referer` IS A FALLBACK, NOT A SECOND CHANCE. It is consulted only when
 * `Origin` is absent entirely. Every browser released this decade sends
 * `Origin` on a POST, so in practice this covers only very old clients — but
 * without it those clients cannot sign out at all, and "the security fix broke
 * logout on your phone" is how security fixes get reverted. `Referer` is as
 * unforgeable from a cross-origin page as `Origin` is, and this site's
 * `strict-origin-when-cross-origin` policy guarantees it is present on a
 * same-origin POST and carries the attacker's own origin on a cross-origin one.
 *
 * A REQUEST WITH NEITHER HEADER IS REJECTED. That is a non-browser client, and
 * failing closed is the correct default for a state change. A caller that
 * genuinely needs to accept header-less requests must ask for it explicitly.
 */
export function isSameOrigin(
  request: Request,
  { onMissingOrigin = 'reject' }: { onMissingOrigin?: MissingOriginPolicy } = {},
): boolean {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;

  const originHeader = request.headers.get('origin');
  if (originHeader) return hostOf(originHeader) === host;

  const refererHost = hostOf(request.headers.get('referer'));
  if (refererHost) return refererHost === host;

  return onMissingOrigin === 'allow';
}

/**
 * Guard a state-changing Route Handler.
 *
 * Returns a 403 Response to send back, or null when the request may proceed.
 * The body says nothing useful: a cross-origin caller learns only that it was
 * refused, not what it would have to change.
 */
export function rejectCrossOrigin(request: Request): Response | null {
  if (isSameOrigin(request)) return null;
  return new Response('Forbidden', {
    status: 403,
    headers: { 'Cache-Control': 'no-store' },
  });
}
