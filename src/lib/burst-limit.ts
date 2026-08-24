/**
 * The in-memory burst limiter — PURE, so it can be unit-tested.
 *
 * Split out of rate-limit.ts in Phase 11, for the same reason token.ts was
 * split from crypto.ts and indexing.ts from seo.ts: rate-limit.ts imports
 * `server-only` and the Prisma client, which makes it unreachable from Node's
 * test runner. A limiter that cannot be tested is a limiter nobody has checked,
 * and Phase 11 found out the hard way what that costs — see `peekBurst`.
 *
 * There is no I/O here, no environment and no database. It is a Map of
 * timestamps and the rules for reading it.
 */

export const LIMITS = {
  /** In-memory: submissions per key within the burst window. */
  burst: { max: 3, windowMs: 60_000 },
  /** Database: submissions per key in a short window. */
  short: { max: 3, windowMs: 15 * 60_000 },
  /** Database: submissions per key per day. */
  daily: { max: 10, windowMs: 24 * 60 * 60_000 },
} as const;

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; scope: 'burst' | 'short' | 'daily'; retryAfterMs: number };

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
      if ((dropped += 1) >= excess) break;
    }
  }
}

/**
 * Is this key currently over its burst limit? DOES NOT CONSUME A SLOT.
 *
 * ⚠ THE SPLIT BETWEEN CHECKING AND CHARGING IS THE WHOLE POINT.
 *
 * A rate limit exists to make ABUSE expensive, not to make USE expensive. For
 * the enquiry form the two coincide — every submission is a submission — so
 * `checkBurst` charges each call. For sign-in they do not, and Phase 11
 * measured what conflating them cost: a teacher entering the CORRECT password
 * four times inside a minute was refused with "Too many attempts", because a
 * success cost exactly as much as a guess.
 *
 * That is not hypothetical. The institute's devices sit behind one public IP,
 * Phase 10 made signing out revoke every session, and a phone plus a laptop
 * plus one browser restart is already four sign-ins.
 */
export function peekBurst(key: string, now: number = Date.now()): RateLimitVerdict {
  pruneIfLarge(now);
  const cutoff = now - LIMITS.burst.windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= LIMITS.burst.max) {
    const oldest = recent[0] ?? now;
    return {
      allowed: false,
      scope: 'burst',
      retryAfterMs: Math.max(0, oldest + LIMITS.burst.windowMs - now),
    };
  }
  return { allowed: true };
}

/** Charge one slot against this key. Call it for the events you want to limit. */
export function recordBurstHit(key: string, now: number = Date.now()): void {
  pruneIfLarge(now);
  const cutoff = now - LIMITS.burst.windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  hits.set(key, recent);
}

/** Check and charge in one step. Correct where every call is itself the event. */
export function checkBurst(key: string, now: number = Date.now()): RateLimitVerdict {
  const verdict = peekBurst(key, now);
  if (!verdict.allowed) return verdict;
  recordBurstHit(key, now);
  return { allowed: true };
}

/** Test seam — resets the in-memory window. */
export function resetBurstState(): void {
  hits.clear();
}
