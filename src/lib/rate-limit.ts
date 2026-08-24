import 'server-only';

import { getPrisma } from '@/lib/db';
import { LIMITS, type RateLimitVerdict } from '@/lib/burst-limit';

/**
 * Rate limiting for the public enquiry endpoint.
 *
 * TWO LAYERS, because they fail differently:
 *
 * 1. A per-instance in-memory burst limiter. Catches a rapid flood cheaply,
 *    BEFORE any database round trip, so a burst cannot be used to exhaust the
 *    connection pool. On serverless this is per-instance and therefore
 *    bypassable by spreading load — which is exactly why it is not the only
 *    layer.
 *
 * 2. A database-backed sustained limiter, counting recent rows for the same
 *    ipHash. This one is authoritative: it is shared by every instance and
 *    survives restarts.
 *
 * NEITHER IS A SUBSTITUTE FOR EDGE PROTECTION. Volumetric abuse should be
 * stopped before it reaches the application (Vercel WAF, Cloudflare). What
 * these layers guarantee is that a determined individual cannot flood the
 * institute's inbox, and that abuse costs the attacker more than it costs us.
 */

/**
 * Layer 1 lives in src/lib/burst-limit.ts, import-free so it can be unit-tested.
 * Re-exported here so every caller keeps one import site for rate limiting.
 */
export {
  LIMITS,
  peekBurst,
  recordBurstHit,
  peekWindow,
  recordWindowHit,
  checkBurst,
  resetBurstState,
  type RateLimitVerdict,
  type Window,
} from '@/lib/burst-limit';

// ---------------------------------------------------------------------------
// Layer 2 — database-backed sustained limit
// ---------------------------------------------------------------------------

/**
 * Counts persisted enquiries for this ipHash.
 *
 * NOTE ON WHAT THIS DOES AND DOES NOT COVER: only successful submissions
 * create rows, so this limits inbox flooding rather than raw request volume.
 * Requests that fail validation cost one cheap synchronous check and write
 * nothing, and the burst limiter above runs before any database work.
 */
export async function checkSustained(
  ipHash: string,
  now: Date = new Date(),
): Promise<RateLimitVerdict> {
  const prisma = getPrisma();

  const shortCutoff = new Date(now.getTime() - LIMITS.short.windowMs);
  const dailyCutoff = new Date(now.getTime() - LIMITS.daily.windowMs);

  const [shortCount, dailyCount] = await Promise.all([
    prisma.enquiry.count({ where: { ipHash, createdAt: { gte: shortCutoff } } }),
    prisma.enquiry.count({ where: { ipHash, createdAt: { gte: dailyCutoff } } }),
  ]);

  if (shortCount >= LIMITS.short.max) {
    return { allowed: false, scope: 'short', retryAfterMs: LIMITS.short.windowMs };
  }
  if (dailyCount >= LIMITS.daily.max) {
    return { allowed: false, scope: 'daily', retryAfterMs: LIMITS.daily.windowMs };
  }
  return { allowed: true };
}
