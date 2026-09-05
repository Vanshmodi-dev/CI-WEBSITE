/**
 * Storage-usage formatting and provider-payload parsing — PURE.
 *
 * =============================================================================
 * WHY THIS IS A SEPARATE FILE FROM `cloudinary-usage.ts`
 * =============================================================================
 * NO `server-only` GUARD HERE, deliberately — the same split as
 * `cloudinary-config.ts` versus `cloudinary.ts`. This module touches no I/O, no
 * network and no credential; it turns numbers into strings and an untrusted
 * JSON blob into a typed shape.
 *
 * That parsing is the half that must never produce `NaN`, `Infinity`,
 * `undefined` or a fabricated figure on an administrator's screen, so it is
 * exactly the half that must be unit-testable without a Cloudinary account.
 *
 * =============================================================================
 * THE RULE THIS FILE ENFORCES: A MISSING NUMBER IS `null`, NEVER A GUESS
 * =============================================================================
 * Every parser below returns `null` when the provider did not supply a usable
 * value, and every formatter renders `null` as "Not available". There is no
 * branch anywhere that substitutes a default, a zero, or an estimate for a
 * figure we do not actually have. A dashboard that invents a number is worse
 * than one that admits it does not know.
 */

/** What "not available" looks like to a reader. One spelling, used everywhere. */
export const NOT_AVAILABLE = 'Not available';

/**
 * A number we are willing to display, or null.
 *
 * ⚠ `Number.isFinite` REJECTS NaN AND BOTH INFINITIES, which is the whole
 * point: `JSON.parse` will happily hand back a string, and arithmetic on a
 * missing field produces NaN, and `NaN` rendered into JSX is the literal text
 * "NaN" on a teacher's screen.
 */
export function finiteOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/** A non-negative finite number, or null. Byte counts and credits cannot be negative. */
export function nonNegativeOrNull(value: unknown): number | null {
  const n = finiteOrNull(value);
  return n === null || n < 0 ? null : n;
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Bytes, in the unit a person would actually say.
 *
 * 1024-based, because storage providers and operating systems both report this
 * way and a teacher comparing this screen with Cloudinary's own dashboard
 * should see the same number.
 *
 * Zero is NOT "not available" — an empty library genuinely holds 0 B, and
 * saying so is information. Only `null`/rubbish becomes "Not available".
 */
export function formatBytes(value: unknown): string {
  const bytes = nonNegativeOrNull(value);
  if (bytes === null) return NOT_AVAILABLE;
  if (bytes === 0) return '0 B';

  let n = bytes;
  let unit = 0;
  while (n >= 1024 && unit < UNITS.length - 1) {
    n /= 1024;
    unit += 1;
  }

  // Bytes are whole things; anything larger reads better with one decimal, and
  // a trailing ".0" reads like false precision.
  const rounded = unit === 0 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}

/**
 * A percentage, or null when it cannot honestly be computed.
 *
 * ⚠ A ZERO LIMIT RETURNS NULL RATHER THAN INFINITY. That is the case this
 * function exists for: `used / 0` is `Infinity`, and a progress bar driven by
 * Infinity renders as a full red bar telling an administrator they are out of
 * space when in fact the limit is unknown.
 */
export function percentOf(used: unknown, limit: unknown): number | null {
  const u = nonNegativeOrNull(used);
  const l = nonNegativeOrNull(limit);
  if (u === null || l === null || l === 0) return null;
  return Math.round((u / l) * 1000) / 10;
}

/** A percentage for display, or "Not available". */
export function formatPercent(value: unknown): string {
  const n = finiteOrNull(value);
  if (n === null || n < 0) return NOT_AVAILABLE;
  return `${Math.round(n * 10) / 10}%`;
}

/** A plain count. Zero is a real answer; anything unusable is "Not available". */
export function formatCount(value: unknown): string {
  const n = nonNegativeOrNull(value);
  if (n === null) return NOT_AVAILABLE;
  return Math.round(n).toLocaleString('en-IN');
}

/* ==================================================== provider payload ==== */

/**
 * The subset of Cloudinary's `api.usage()` response this application is willing
 * to believe and display.
 *
 * Everything is nullable because everything is optional in practice: the
 * payload shape is documented as `any` by the SDK's own typings, plans differ,
 * and a field that exists today can stop existing.
 */
export type ProviderUsage = {
  plan: string | null;
  creditsUsed: number | null;
  creditsLimit: number | null;
  /** Derived, not taken from the payload's own `used_percent`. */
  creditsPercent: number | null;
  /** Provider-side stored bytes. Authoritative, and NOT the same as our own total. */
  storageBytes: number | null;
  bandwidthBytes: number | null;
  /** How many assets the provider holds, across the whole account. */
  resources: number | null;
  /**
   * The provider's own "as of" date, e.g. "2026-09-04".
   *
   * ⚠ SURFACED IN THE UI ON PURPOSE. Cloudinary aggregates usage daily, so
   * these figures lag by up to a day and will NOT match a photograph uploaded
   * five minutes ago. An administrator comparing the two numbers deserves to
   * know that before concluding something is broken.
   */
  lastUpdated: string | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
};

/** Read one nested `{ usage: number }` shape without throwing on anything. */
function usageOf(node: unknown): number | null {
  if (typeof node !== 'object' || node === null) return null;
  return nonNegativeOrNull((node as { usage?: unknown }).usage);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Turn Cloudinary's `api.usage()` payload into something we will display.
 *
 * ⚠ NEVER THROWS. This runs behind a network call to a third party, on a page
 * whose whole job is observability. A parser that throws on an unexpected shape
 * would take out the admin screen that exists to tell you something is wrong.
 *
 * `creditsPercent` is RECOMPUTED rather than read from the payload's own
 * `used_percent`: the two should agree, and when they do not, the one we can
 * check is the one derived from the two numbers we are also showing.
 */
export function parseProviderUsage(payload: unknown): ProviderUsage {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<
    string,
    unknown
  >;

  const credits = (typeof p.credits === 'object' && p.credits !== null
    ? p.credits
    : {}) as Record<string, unknown>;

  const creditsUsed = nonNegativeOrNull(credits.usage);
  const creditsLimit = nonNegativeOrNull(credits.limit);

  return {
    plan: stringOrNull(p.plan),
    creditsUsed,
    creditsLimit,
    creditsPercent: percentOf(creditsUsed, creditsLimit),
    storageBytes: usageOf(p.storage),
    bandwidthBytes: usageOf(p.bandwidth),
    resources: nonNegativeOrNull(p.resources),
    lastUpdated: stringOrNull(p.last_updated),
    rateLimitRemaining: nonNegativeOrNull(p.rate_limit_remaining),
    rateLimitResetAt: stringOrNull(p.rate_limit_reset_at),
  };
}

/* ============================================================= status ===== */

export type UsageStatus = 'healthy' | 'watch' | 'critical' | 'unknown';

/**
 * How worried should somebody be about the CREDIT allowance?
 *
 * ⚠ THIS IS ABOUT CREDITS, NOT ABOUT STORAGE. Cloudinary's free plan meters a
 * single pool of credits that storage, bandwidth and transformations all draw
 * from, and it publishes NO storage-only allowance. There is therefore no
 * honest "percentage of storage used" to compute, and this function refuses to
 * pretend otherwise: with no credit figure it returns `unknown`, which the UI
 * renders as a statement rather than as a green tick.
 */
export function usageStatus(creditsPercent: number | null): UsageStatus {
  if (creditsPercent === null) return 'unknown';
  if (creditsPercent >= 90) return 'critical';
  if (creditsPercent >= 75) return 'watch';
  return 'healthy';
}

export const STATUS_LABELS: Readonly<Record<UsageStatus, string>> = {
  healthy: 'Healthy',
  watch: 'Getting close',
  critical: 'Nearly full',
  unknown: 'Unknown',
};
