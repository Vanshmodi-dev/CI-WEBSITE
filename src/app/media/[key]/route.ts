import { NextResponse } from 'next/server';
import { getMediaStore } from '@/lib/media/store';
import { isMediaKey } from '@/lib/media/format';

/**
 * Serving an uploaded image.
 *
 * =============================================================================
 * WHY A ROUTE HANDLER AND NOT `public/`
 * =============================================================================
 * `public/` is a build-time directory. Files written into it at runtime appear
 * to work under `next start` and do nothing at all on a serverless host — the
 * worst failure mode available, because it passes local testing.
 *
 * A handler also lets three things be true that a static directory cannot make
 * true: the response carries the content type WE determined by sniffing rather
 * than one inferred from a name, it carries `nosniff` so a browser cannot
 * second-guess that, and an id we did not issue is refused before anything
 * touches storage.
 *
 * =============================================================================
 * WHAT THIS DELIBERATELY DOES NOT DO: REQUIRE A SESSION
 * =============================================================================
 * These URLs are public, and that is a decision rather than an oversight.
 *
 * The key is a 128-bit content hash, so it cannot be enumerated or guessed. The
 * protection that matters for a student photograph is not secrecy of the URL —
 * it is that the URL is NEVER PUBLISHED without consent: `present()` in
 * `student-display.ts` returns `photoUrl: null` unless `consentPhoto` is true,
 * so a photo without permission has no address anywhere on the site.
 *
 * Signed URLs were considered and rejected. They would defeat `next/image`
 * optimisation and CDN caching for every legitimate photograph on the site, in
 * exchange for defending against somebody who has already obtained a
 * 32-character hash — at which point they have the photograph anyway.
 *
 * This is recorded in the threat model as an accepted risk rather than left for
 * a reader to infer.
 */

/** Immutable by construction: the key IS the hash of the bytes. */
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  /*
    ⚠ THE TRAVERSAL DEFENCE, AND IT IS THIS LINE.

    `isMediaKey` accepts only `^[0-9a-f]{32}\.(jpg|png|webp|avif)$`. Anything
    carrying a slash, a backslash, a dot-dot, a null byte, an encoded separator
    or a drive letter fails it and is refused HERE — before any path is built,
    before storage is consulted, before a filesystem call exists to be tricked.

    Next has already decoded the segment by this point, so a double-encoded
    `%252e%252e` arrives as `%2e%2e` and still fails the pattern. There is no
    branch that concatenates user input onto a directory.
  */
  if (!isMediaKey(key)) {
    return new NextResponse('Not found', { status: 404 });
  }

  let object;
  try {
    object = await getMediaStore().get(key);
  } catch {
    /*
      Production storage is not provisioned, so the store throws by design.
      A 404 rather than a 500: an image that cannot be served is a missing
      image, and the operational failure belongs in the logs and the pre-flight
      check, not in a response to a visitor.
    */
    return new NextResponse('Not found', { status: 404 });
  }

  if (!object) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(new Uint8Array(object.bytes), {
    status: 200,
    headers: {
      'Content-Type': object.contentType,
      // The stored type was decided by sniffing OUR re-encoded output. nosniff
      // stops a browser overriding that and treating the response as anything
      // else - the last defence against content-type confusion.
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': String(object.bytes.byteLength),
      // Safe to cache forever: a different image is a different key, so a stale
      // response is impossible. This is what makes replacement work without
      // cache-busting query strings or asking anyone to refresh.
      'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
      // Belt and braces for a hypothetical future format whose bytes a browser
      // might try to render as a document.
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
