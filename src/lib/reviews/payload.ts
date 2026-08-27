/**
 * The Review Engine payload, distrusted — PURE, no imports.
 *
 * =============================================================================
 * WHY THIS EXISTS AT ALL
 * =============================================================================
 * The payload is produced by our own system, and it still crosses an
 * application boundary. Two facts make distrust the only defensible position:
 *
 *   1. It is fetched over HTTPS from a host this application does not control
 *      at runtime. Anything that can answer that URL can shape this input.
 *   2. THE ENGINE'S OWN PUBLISHED EXAMPLE VIOLATES ITS OWN SCHEMA. `reviews[].id`
 *      is declared `^[0-9a-f]{32}$` and the example carries 64 hex characters;
 *      `owner_reply` is declared `additionalProperties: false` and the example
 *      carries an extra `date_precision`. A consumer that trusted the schema
 *      would refuse the engine's real output.
 *
 * So there is no `as Payload` anywhere in this file. Every field on the way out
 * is one this module constructed, from a value it checked.
 *
 * =============================================================================
 * WHY THIS IS NOT A STRICT SCHEMA VALIDATOR
 * =============================================================================
 * `additionalProperties: false` is a PUBLISHER-side rule. It stops an internal
 * ledger field leaking into a public artifact, which is the engine's problem and
 * the engine's to enforce. A CONSUMER that enforced it would break the moment
 * the engine adds a field — every forward-compatible change would blank the
 * reviews band on every client site simultaneously.
 *
 * The consumer rule is therefore: ignore what you do not recognise, refuse what
 * is unsafe, bound what is unbounded.
 */

/* -------------------------------------------------------------- limits --- */

/**
 * Bounds. Each is derived from the engine's own configuration or its own
 * description of the artifact, not chosen for the look of the number.
 */
export const REVIEW_LIMITS = {
  /**
   * 512 KB of JSON.
   *
   * The engine describes what it writes as "a small static JSON payload".
   * `display.latest_count` is 20 and a review with text is on the order of a
   * kilobyte, so a real payload is tens of kilobytes. 512 KB is roughly
   * twenty-five times the expected size — comfortably above anything
   * legitimate, and far below a figure at which parsing costs real memory.
   */
  maxBytes: 512 * 1024,

  /**
   * 20 reviews rendered.
   *
   * Taken from `display.latest_count: 20` in the Commerce Insight client
   * config, so this agrees with what the engine was configured to publish
   * rather than inventing a second opinion about it.
   */
  maxReviews: 20,

  /**
   * 1200 characters of review text.
   *
   * `SAFETY.md` §5 clamps rows so "one 2,000-character review" cannot dominate
   * a section. The engine already models truncation with its own
   * `text_truncated` flag, so shortening further is a supported state rather
   * than a distortion — and anything past this is set aside as amplification.
   */
  maxTextLength: 1200,

  /** A display name. Anything longer is not a name. */
  maxNameLength: 80,
  /** Initials for the monogram tile. */
  maxInitialsLength: 4,
  /** An owner's reply is a reply, not an essay. */
  maxReplyLength: 800,
  /** Free-text labels that reach the page as provenance. */
  maxLabelLength: 120,
} as const;

/** The only payload version this consumer understands. */
export const SUPPORTED_SCHEMA_VERSION = 1;

/* --------------------------------------------------------------- types --- */

export type SafeReview = {
  /** Opaque, bounded, hex. Used as a React key and for nothing else. */
  id: string;
  /** Null when the reviewer is anonymous or the name failed its checks. */
  authorName: string | null;
  /** Always present: falls back to a letter derived from the name. */
  initials: string;
  /** 1–5, or null for a rating-only review the engine chose to include. */
  rating: number | null;
  text: string | null;
  /** True when the engine truncated it, or when we did. */
  textTruncated: boolean;
  /** ISO date, or null. Never a guess. */
  date: string | null;
  ownerReply: { text: string; date: string | null } | null;
};

export type ReviewFreshness =
  /** Everything the engine holds, and it holds everything. */
  | { kind: 'full'; syncedAt: string | null }
  /** Reviews are real; the count is not a total. */
  | { kind: 'partial'; syncedAt: string | null };

export type SafeReviewPayload = {
  reviews: SafeReview[];
  /** What the engine says about the listing, bounded. */
  sourceLabel: string;
  freshness: ReviewFreshness;
  /** The engine's own count, when it is trustworthy. Null when partial. */
  totalCount: number | null;
  meanRating: number | null;
};

export type PayloadVerdict =
  | { ok: true; payload: SafeReviewPayload }
  /**
   * `reason` is for a server log and an admin screen. It NEVER reaches a
   * visitor: `SAFETY.md` §4 is explicit that a failure is not the visitor's
   * problem, so the band simply does not render.
   */
  | { ok: false; reason: string };

/* ------------------------------------------------------------- helpers --- */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A bounded, single-line string, or null.
 *
 * Control characters are stripped rather than rejected. A stray one in a review
 * body is far more likely to be a scraping artefact than an attack, and
 * refusing the whole review over it would lose real content — while leaving it
 * in would put invisible junk on the page.
 */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, max);
}

/**
 * An integer rating in 1–5, or null.
 *
 * `include_rating_only: true` in the client config means a review with a rating
 * and no text is a legitimate thing to publish, so a missing rating is not an
 * error — but a rating of 0, 6, -1, 4.5 or "5" is not something to render, and
 * guessing what was meant would be inventing a rating.
 */
function cleanRating(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 5) return null;
  return value;
}

/**
 * A date the page can print, or null.
 *
 * The engine publishes several precisions (`day`, `month`, `year`) and its own
 * confidence in each. Rather than reproduce that, anything that does not parse
 * to a real date is dropped: a review with no date reads perfectly well, and a
 * wrong date is worse than none.
 */
function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  // A date far outside plausibility is a malformed value that happened to
  // parse, not a review from 1970 or 2153.
  const year = parsed.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return parsed.toISOString();
}

/**
 * The review id, treated as an opaque token.
 *
 * The schema says 32 hex characters; the engine publishes 64. Rather than pick
 * a side, this accepts hex of a bounded length — which is enough to guarantee
 * the value can never be a path segment, a URL, an attribute break or a script.
 * It is used as a React key and for deduplication. Nothing else.
 */
function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8,128}$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Initials for the monogram.
 *
 * The engine supplies `author_initials`, but it may be null or nonsense, so a
 * name-derived fallback exists. Letters only: a reviewer called "<script>"
 * must not produce a tile containing anything but letters.
 */
function initialsFor(name: string | null, supplied: unknown): string {
  const fromEngine = typeof supplied === 'string' ? supplied.replace(/[^\p{L}]/gu, '') : '';
  if (fromEngine.length > 0) {
    return fromEngine.slice(0, REVIEW_LIMITS.maxInitialsLength).toUpperCase();
  }
  if (!name) return '';
  const parts = name
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ''))
    .filter((part) => part.length > 0);
  if (parts.length === 0) return '';
  const first = [...(parts[0] ?? '')][0] ?? '';
  const last = parts.length > 1 ? ([...(parts[parts.length - 1] ?? '')][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/* --------------------------------------------------------- one review --- */

function normaliseReview(raw: unknown): SafeReview | null {
  if (!isObject(raw)) return null;

  const id = cleanId(raw.id);
  // No usable id means no stable key and no way to deduplicate. Dropped rather
  // than given a generated one, which would make the same review appear twice
  // across two renders.
  if (!id) return null;

  const authorName = cleanText(raw.author_name, REVIEW_LIMITS.maxNameLength);
  const rawText = cleanText(raw.text, Number.MAX_SAFE_INTEGER);

  let text = rawText;
  let textTruncated = raw.text_truncated === true;
  if (text && text.length > REVIEW_LIMITS.maxTextLength) {
    text = text.slice(0, REVIEW_LIMITS.maxTextLength);
    textTruncated = true;
  }

  const rating = cleanRating(raw.rating);

  /*
    A review with neither a rating nor any text has nothing to show. The engine
    would not normally publish one, but a malformed payload can produce it, and
    an empty card looks like a rendering fault.
  */
  if (rating === null && text === null) return null;

  let ownerReply: SafeReview['ownerReply'] = null;
  if (isObject(raw.owner_reply)) {
    const replyText = cleanText(raw.owner_reply.text, REVIEW_LIMITS.maxReplyLength);
    if (replyText) {
      ownerReply = { text: replyText, date: cleanDate(raw.owner_reply.date) };
    }
  }

  return {
    id,
    authorName,
    initials: initialsFor(authorName, raw.author_initials),
    rating,
    text,
    textTruncated,
    date: cleanDate(raw.date),
    ownerReply,
  };

  /*
    ⚠ `author_avatar_url` AND `author_profile_url` ARE READ AND DISCARDED.

    Not an oversight. `frontend/SAFETY.md` §3 states INV-01 — the visitor's
    browser never contacts a review source — and §7 lists "lazy-loading avatars
    from the source's CDN" among the things that look helpful and are not,
    because it breaks exactly that. Rendering either would put a request to a
    third party on a page the institute does not control, add a CSP origin, and
    hand a reviewer's identity to whoever is watching. Initials cost nothing and
    break nothing.
  */
}

/* ------------------------------------------------------- whole payload --- */

/**
 * Turn whatever came back into something safe to render, or refuse it.
 *
 * Never throws. Hostile and malformed input is the expected case, and an
 * exception escaping here becomes a 500 on a public page — which
 * `SAFETY.md` §4 forbids more directly than any of this: a failure is not the
 * visitor's problem.
 */
export function normalisePayload(raw: unknown): PayloadVerdict {
  if (!isObject(raw)) return { ok: false, reason: 'payload is not an object' };

  /*
    VERSION FIRST, AND STRICTLY.

    An unknown version is refused rather than optimistically read as v1.
    Silently interpreting v2 as v1 is how a field that changed meaning ends up
    rendered under its old meaning — the one failure mode a version number
    exists to prevent.
  */
  if (raw.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `unsupported schema_version: ${describe(raw.schema_version)}`,
    };
  }

  /*
    The engine publishes several artifacts from one schema — `reviews`,
    `latest`, `stats`, `schema_org`, `index`. Only the first two carry reviews.
    A `stats` artifact has no `reviews` array at all, and rendering a band from
    it would produce an empty section rather than a hidden one.
  */
  if (raw.artifact !== 'reviews' && raw.artifact !== 'latest') {
    return { ok: false, reason: `unexpected artifact: ${describe(raw.artifact)}` };
  }

  const stats = isObject(raw.stats) ? raw.stats : {};
  const notices = Array.isArray(raw.notices) ? raw.notices : [];

  /*
    THE ONE NOTICE THAT HIDES THE BAND.

    Master Plan §13: `awaiting_first_full_harvest` means the engine has not yet
    completed a full pass, so what it holds is not representative. Showing three
    reviews from a business with ninety would misrepresent it, which is the
    opposite of what this integration is for.
  */
  if (notices.includes('awaiting_first_full_harvest')) {
    return { ok: false, reason: 'awaiting_first_full_harvest' };
  }

  const completeness = typeof stats.completeness === 'string' ? stats.completeness : '';
  const partial =
    completeness === 'partial' ||
    completeness === 'full_capped' ||
    notices.includes('harvest_partial') ||
    notices.includes('harvest_capped');

  /*
    A `failed` harvest is not a degraded state to label - it is a state where
    what we hold may be arbitrarily wrong. Hidden, like a fetch failure.
  */
  if (completeness === 'failed' || notices.includes('source_unavailable')) {
    return { ok: false, reason: `harvest state: ${completeness || 'source_unavailable'}` };
  }

  const rawReviews = Array.isArray(raw.reviews) ? raw.reviews : [];

  /*
    DEDUPLICATED ON THE ENGINE'S OWN STABLE ID.

    The schema calls `id` the identity of a review and pairs it with a
    `revision`, so the id is the documented identity and is what deduplication
    uses. Two entries with the same id are the same review, and the FIRST is
    kept because the array is already in the engine's chosen order
    (`display.order: newest`) - keeping the last would silently reorder.

    Reviews with DIFFERENT ids are never merged, however similar their text.
    Two people can leave the same sentence, and deciding they are one review
    would delete somebody's review on a guess.
  */
  const seen = new Set<string>();
  const reviews: SafeReview[] = [];
  for (const entry of rawReviews) {
    if (reviews.length >= REVIEW_LIMITS.maxReviews) break;
    const review = normaliseReview(entry);
    if (!review) continue;
    if (seen.has(review.id)) continue;
    seen.add(review.id);
    reviews.push(review);
  }

  const listing = isObject(raw.listing) ? raw.listing : {};
  const sourceLabel = sourceLabelFor(listing.source);

  const syncedAt = cleanDate(stats.last_full_harvest_at) ?? cleanDate(raw.generated_at);

  /*
    THE COUNT IS ONLY SHOWN WHEN IT IS A TOTAL.

    Master Plan §13: on a partial harvest the count is labelled "showing recent
    reviews" rather than presented as a total. Passing a number through here
    while the harvest is partial would invite exactly the claim the plan
    refuses, so `totalCount` is null and the component has nothing to print.
  */
  const totalCount =
    !partial && typeof stats.total_count === 'number' && Number.isInteger(stats.total_count)
      ? Math.max(0, stats.total_count)
      : null;

  const meanRating =
    typeof stats.mean_rating === 'number' &&
    Number.isFinite(stats.mean_rating) &&
    stats.mean_rating >= 0 &&
    stats.mean_rating <= 5
      ? Math.round(stats.mean_rating * 10) / 10
      : null;

  return {
    ok: true,
    payload: {
      reviews,
      sourceLabel,
      freshness: partial ? { kind: 'partial', syncedAt } : { kind: 'full', syncedAt },
      totalCount,
      meanRating,
    },
  };
}

/**
 * The platform name shown to a visitor.
 *
 * An ALLOWLIST, not a passthrough. `listing.source` is a free string in the
 * schema, and it is rendered next to the reviews as a provenance claim — "from
 * Google" is a statement about where this came from. Echoing whatever arrived
 * would let a malformed or hostile payload label its contents as coming from
 * somewhere they did not, which is the one lie this section must not tell.
 * Anything unrecognised degrades to a true, unspecific statement.
 */
function sourceLabelFor(source: unknown): string {
  return source === 'google' ? 'Google' : 'a verified review platform';
}

/** A safe description of an unexpected value, for a log line. Never the value. */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'number' || type === 'boolean') return String(value);
  if (type === 'string') return `string(${(value as string).length})`;
  return type;
}
