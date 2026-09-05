import 'server-only';

import { v2 as cloudinary } from 'cloudinary';
import { logUnexpected } from '@/lib/log';
import { readCloudinaryConfig } from './cloudinary-config.ts';
import { parseProviderUsage, type ProviderUsage } from './usage-format.ts';

/**
 * Cloudinary account usage, read server-side and cached.
 *
 * =============================================================================
 * WHY THIS IS NOT PART OF `CloudinaryMediaStore`
 * =============================================================================
 * The store implements `MediaStore` — put, get, exists, remove, list. Every one
 * of those is on the path of a real user action, and every one must work or the
 * feature is broken.
 *
 * This is observability. It answers "how full is the account", it is allowed to
 * fail, and when it fails the admin screen must still render. Bolting it onto
 * the store would put an optional, rate-limited, third-party call inside the
 * interface that serving a photograph depends on.
 *
 * =============================================================================
 * THE SECRET NEVER LEAVES THIS PROCESS
 * =============================================================================
 * `import 'server-only'` makes importing this from a client component a BUILD
 * error, and `CLOUDINARY_API_SECRET` is not prefixed `NEXT_PUBLIC_`, so Next
 * will never inline it into client JavaScript. What crosses to the browser is
 * the parsed `ProviderUsage` — plan name, credit counts, byte counts, dates.
 * The cloud name, the API key and the secret are NOT part of that type and are
 * never returned from here.
 *
 * =============================================================================
 * RATE LIMITS ARE THE REASON FOR THE CACHE
 * =============================================================================
 * Cloudinary's Admin API allows 500 calls/hour on the free tier, and the same
 * budget is spent by `exists()` on every upload. A `force-dynamic` admin page
 * that called it on each render would burn that budget on page refreshes.
 *
 * So: a ten-minute in-process cache, and a manual refresh that bypasses it. The
 * refresh path is separately rate limited by its caller.
 *
 * ⚠ THE CACHE IS PER PROCESS AND THAT IS ACCEPTED. On a serverless host each
 * instance keeps its own copy, so a second instance may show a slightly
 * different "last refreshed". The alternative — a shared cache table — is a
 * schema change and a write path for a number that is already a day old when it
 * arrives. Not worth it. See `lastUpdated` below.
 */

/** Ten minutes. Cloudinary aggregates daily, so anything shorter buys nothing. */
const CACHE_TTL_MS = 10 * 60_000;

export type ProviderUsageResult =
  /** Fresh or cached figures. */
  | { status: 'ok'; usage: ProviderUsage; fetchedAt: number; fromCache: boolean }
  /** No credentials. A developer machine, or a deployment without media storage. */
  | { status: 'not-configured'; reason: string }
  /**
   * The call failed. `last` carries the most recent good answer if this process
   * ever had one, so the screen can show real figures under a "temporarily
   * unavailable" notice rather than going blank.
   */
  | { status: 'unavailable'; reason: string; last: { usage: ProviderUsage; fetchedAt: number } | null };

type CacheEntry = { usage: ProviderUsage; fetchedAt: number };

let cache: CacheEntry | null = null;

/** Test seam, and the way a deployment clears a stale answer without a restart. */
export function resetProviderUsageCache(): void {
  cache = null;
}

/** What the UI shows as "cached until". Exported so the page need not guess. */
export const PROVIDER_CACHE_TTL_MS = CACHE_TTL_MS;

/**
 * Read account usage.
 *
 * @param force - bypass the cache. Only ever set by the manual refresh action,
 *                which is admin-only and separately rate limited.
 *
 * ⚠ NEVER THROWS, and never returns a fabricated figure. Every field the
 * provider did not supply arrives as `null` from `parseProviderUsage` and is
 * rendered as "Not available".
 */
export async function getProviderUsage(
  { force = false }: { force?: boolean } = {},
): Promise<ProviderUsageResult> {
  const verdict = readCloudinaryConfig();

  if (verdict.state !== 'ready') {
    const reason =
      verdict.state === 'absent'
        ? 'Cloudinary is not configured on this environment.'
        : verdict.state === 'partial'
          ? `Cloudinary is half configured. Missing: ${verdict.missing.join(', ')}.`
          : verdict.reason;
    return { status: 'not-configured', reason };
  }

  const now = Date.now();
  if (!force && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { status: 'ok', usage: cache.usage, fetchedAt: cache.fetchedAt, fromCache: true };
  }

  try {
    cloudinary.config({
      cloud_name: verdict.config.cloudName,
      api_key: verdict.config.apiKey,
      api_secret: verdict.config.apiSecret,
      secure: true,
    });

    /*
      A hung third party must not hold an admin page open until the platform
      kills the function. `api.usage()` has no timeout option of its own, so the
      race is the timeout.
    */
    const payload = await Promise.race([
      cloudinary.api.usage(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 8_000),
      ),
    ]);

    const usage = parseProviderUsage(payload);
    cache = { usage, fetchedAt: now };
    return { status: 'ok', usage, fetchedAt: now, fromCache: false };
  } catch (error) {
    /*
      ⚠ THE ERROR IS LOGGED, NOT SHOWN.

      A Cloudinary rejection can carry request context, and this string would
      reach an administrator's screen. The reader gets a sentence they can act
      on; the detail goes to the server log, which is where an operator looks.
    */
    logUnexpected('media.provider_usage_failed', error);

    const rateLimited =
      (error as { http_code?: number })?.http_code === 420 ||
      (error as { http_code?: number })?.http_code === 429;

    return {
      status: 'unavailable',
      reason: rateLimited
        ? 'Cloudinary is rate limiting requests. Try again in a little while.'
        : 'Cloudinary did not answer. This does not affect the website or stored photos.',
      last: cache,
    };
  }
}
