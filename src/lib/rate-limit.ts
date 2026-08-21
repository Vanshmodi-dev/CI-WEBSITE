import 'server-only';

import { getPrisma } from '@/lib/db';

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

export const LIMITS = {
  /** In-memory: submissions per ipHash within the burst window. */
  burst: { max: 3, windowMs: 60_000 },
  /** Database: submissions per ipHash in a short window. */
  short: { max: 3, windowMs: 15 * 60_000 },
  /** Database: submissions per ipHash per day. */
  daily: { max: 10, windowMs: 24 * 60 * 60_000 },
} as const;

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; scope: 'burst' | 'short' | 'daily'; retryAfterMs: number };

// ---------------------------------------------------------------------------
// Layer 1 — in-memory burst
// ---------------------------------------------------------------------------

const hits = new Map<string, number[]>();

/**
 * Bounded so the map cannot grow without limit under a distributed flood —
 * an unbounded Map keyed by attacker-controlled input is itself a DoS vector.
 */
const MAX_TRACKED_KEYS = 5_000;

function pruneIfLarge(now: number) {
  if (hits.size < MAX_TRACKED_KEYS) return;
  const cutoff = now - LIMITS.burst.windowMs;
  for (const [key, times] of hits) {
    const live = times.filter((t) => t > cutoff);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
  // Still oversized after pruning: drop oldest arbitrarily rather than grow.
  if (hits.size >= MAX_TRACKED_KEYS) {
    const excess = hits.size - MAX_TRACKED_KEYS + 1;
    let dropped = 0;
    for (const key of hits.keys()) {
      hits.delete(key);
      if (++dropped >= excess) break;
    }
  }
}

export function checkBurst(ipHash: string, now: number = Date.now()): RateLimitVerdict {
  pruneIfLarge(now);
  const cutoff = now - LIMITS.burst.windowMs;
  const recent = (hits.get(ipHash) ?? []).filter((t) => t > cutoff);

  if (recent.length >= LIMITS.burst.max) {
    const oldest = recent[0] ?? now;
    return {
      allowed: false,
      scope: 'burst',
      retryAfterMs: Math.max(0, oldest + LIMITS.burst.windowMs - now),
    };
  }

  recent.push(now);
  hits.set(ipHash, recent);
  return { allowed: true };
}

/** Test seam — resets the in-memory window. */
export function resetBurstState(): void {
  hits.clear();
}

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
