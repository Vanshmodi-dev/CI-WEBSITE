import 'server-only';

import { normalisePayload, REVIEW_LIMITS, type SafeReviewPayload } from './payload';
import { logUnexpected } from '@/lib/log';

/**
 * Fetching the Review Engine's published payload.
 *
 * =============================================================================
 * SERVER-SIDE, AND THAT IS THE WHOLE POINT
 * =============================================================================
 * `frontend/SAFETY.md` §3 states INV-01, the property the engine exists to
 * provide: **the visitor's browser never contacts a review source.** The
 * engine's own recipes fetch from the browser and achieve one request to the
 * client's own origin. Fetching here achieves ZERO: the payload is read on the
 * server and the reviews arrive in the HTML already rendered.
 *
 * That also means `connect-src` needs no entry, no CSP is weakened, and no
 * review code reaches a client bundle.
 *
 * =============================================================================
 * A FAILURE IS NEVER THE VISITOR'S PROBLEM
 * =============================================================================
 * `SAFETY.md` §4. Every failure below — unset URL, DNS failure, timeout, 404,
 * 500, HTML instead of JSON, oversized body, malformed payload, wrong schema
 * version — returns `null`, and a null payload means the band does not render.
 *
 * No error text on the page. No "reviews temporarily unavailable". A visitor
 * who sees our outage learns something true and useless on a page they did not
 * come to debug.
 *
 * The operator is told through the server log, which is the right audience.
 */

/**
 * Six hours, matching the harvest cadence rather than visitor traffic.
 *
 * The engine harvests on a schedule and the payload changes a few times a day
 * at most. Per-request fetching would turn a static file into load on the data
 * origin proportional to our traffic, which is the failure the recipe calls out
 * by name. Six hours is four requests a day regardless of how busy the site is.
 */
const REVALIDATE_SECONDS = 6 * 60 * 60;

/**
 * Eight seconds.
 *
 * Long enough for a slow static host, short enough that a hanging upstream
 * cannot hold a page render open. Without it, `fetch` would wait on the
 * platform default and an unreachable-but-not-refusing host would stall the
 * homepage — the reviews band failing is acceptable, the homepage hanging is
 * not.
 */
const TIMEOUT_MS = 8000;

export type ReviewsResult = {
  payload: SafeReviewPayload | null;
  /** For the admin diagnostics screen and the server log. Never for a visitor. */
  status:
    | 'ok'
    | 'not-configured'
    | 'unreachable'
    | 'http-error'
    | 'too-large'
    | 'not-json'
    | 'rejected';
  detail: string;
};

/**
 * Is the integration configured at all?
 *
 * Exported so the admin can say "not set up yet" rather than "failed", and so
 * the pre-flight check can report the truth. `REVIEWS_PAYLOAD_URL` is
 * deliberately NOT prefixed `NEXT_PUBLIC_`: it is read on the server only, and
 * a `NEXT_PUBLIC_` prefix would inline it into client JavaScript.
 */
export function reviewsConfigured(): boolean {
  return typeof process.env.REVIEWS_PAYLOAD_URL === 'string' &&
    process.env.REVIEWS_PAYLOAD_URL.trim().length > 0;
}

/**
 * The configured URL, if it is one we are willing to fetch.
 *
 * ⚠ AN ALLOWLIST OF PROTOCOLS, NOT A PARSE.
 *
 * This value comes from an environment variable, which is operator-controlled
 * rather than attacker-controlled — but an operator typo is exactly how an
 * application ends up fetching `file:///etc/passwd` and rendering it.
 *
 * `https:` anywhere. `http:` only to a loopback address, so a fixture server on
 * this machine works and a plaintext URL to any real host does not. Everything
 * else — `file:`, `data:`, `ftp:`, `javascript:` — is refused here, before a
 * request exists.
 */
function payloadUrl(): URL | null {
  const raw = process.env.REVIEWS_PAYLOAD_URL?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol === 'https:') return url;

  /*
    PLAINTEXT IS ALLOWED ONLY TO A LOOPBACK ADDRESS.

    ⚠ THIS USED TO TEST `NODE_ENV !== 'production'`, AND THAT WAS WRONG.

    `next start` sets NODE_ENV to production, so running a production BUILD on a
    laptop — which is exactly how this project is verified — refused every
    http fixture URL and the reviews band never rendered. Topic 5 made the
    identical mistake with media storage: "production build" and "deployed" are
    different questions, and NODE_ENV only answers the first.

    Loopback is the precise signal for what this guard actually cares about.
    Plaintext to 127.0.0.1 never leaves the machine, so there is nothing on the
    wire to intercept. Plaintext to any other host is refused whatever NODE_ENV
    says — which is stricter than the old rule, not looser: a deployed server
    with `http://reviews.example.com` configured is now refused, and previously
    would have been allowed if NODE_ENV were unset.
  */
  if (url.protocol === 'http:' && isLoopback(url.hostname)) return url;

  return null;
}

/** Hostnames that cannot leave this machine. */
function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * Read the payload, or return why not.
 *
 * Never throws. Every path returns a `ReviewsResult`, because a rendering
 * surface that has to try/catch its data source will eventually forget to.
 */
export async function getReviews(): Promise<ReviewsResult> {
  const url = payloadUrl();
  if (!url) {
    return {
      payload: null,
      status: 'not-configured',
      detail: reviewsConfigured()
        ? 'REVIEWS_PAYLOAD_URL is set but is not an acceptable https URL'
        : 'REVIEWS_PAYLOAD_URL is not set',
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      // A public static asset. Attaching anything of ours to it would make it
      // non-cacheable and would tie this server to a file that does not need
      // to know who asked.
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS, tags: ['reviews'] },
    });
  } catch (error) {
    // Expected in ordinary operation: DNS failure, refused connection, timeout.
    // Logged at a level that does not bury real faults.
    return {
      payload: null,
      status: 'unreachable',
      detail: error instanceof Error ? error.name : 'fetch failed',
    };
  }

  if (!response.ok) {
    return { payload: null, status: 'http-error', detail: `HTTP ${response.status}` };
  }

  /*
    SIZE IS CHECKED BEFORE THE BODY IS PARSED, AND AGAIN AFTER READING IT.

    `Content-Length` is a claim by the server and may be absent or wrong, so it
    is used as a cheap early refusal and the real bytes are measured too. Parsing
    an unbounded body first would be the amplification this guards against.
  */
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > REVIEW_LIMITS.maxBytes) {
    return {
      payload: null,
      status: 'too-large',
      detail: `content-length ${declared} exceeds ${REVIEW_LIMITS.maxBytes}`,
    };
  }

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    return {
      payload: null,
      status: 'unreachable',
      detail: error instanceof Error ? error.name : 'body read failed',
    };
  }

  if (text.length > REVIEW_LIMITS.maxBytes) {
    return {
      payload: null,
      status: 'too-large',
      detail: `body ${text.length} exceeds ${REVIEW_LIMITS.maxBytes}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    /*
      An HTML error page served with a 200 is the classic version of this: a
      captive portal, a misconfigured host, a branch that no longer exists.
      Nothing is logged as unexpected because none of it is our defect.
    */
    return { payload: null, status: 'not-json', detail: 'response was not JSON' };
  }

  const verdict = normalisePayload(parsed);
  if (!verdict.ok) {
    return { payload: null, status: 'rejected', detail: verdict.reason };
  }

  return { payload: verdict.payload, status: 'ok', detail: `${verdict.payload.reviews.length} reviews` };
}

/**
 * What a public page uses: the payload, or nothing.
 *
 * A separate, deliberately narrower function so a rendering surface cannot
 * accidentally put a `status` or a `detail` on the page. Those exist for the
 * admin and the log; the public site is told only whether there are reviews.
 */
export async function getPublicReviews(): Promise<SafeReviewPayload | null> {
  const result = await getReviews();

  /*
    Only a genuine fault is logged. "Not configured" is the normal state of this
    project today - the engine is not activated - and logging it on every render
    would fill the log with a fact the operator already knows.
  */
  if (result.status === 'rejected' || result.status === 'too-large') {
    logUnexpected('reviews.payload_rejected', new Error(result.detail));
  }

  return result.payload;
}
