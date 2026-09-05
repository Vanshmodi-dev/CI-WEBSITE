import 'server-only';

import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { logUnexpected } from '@/lib/log';
import { nonNegativeOrNull } from './usage-format.ts';

/**
 * What THIS APPLICATION knows it has stored.
 *
 * =============================================================================
 * THIS IS NOT "HOW FULL IS CLOUDINARY"
 * =============================================================================
 * Two different questions live on the storage screen and they must not be
 * blended:
 *
 *   1. What has this website uploaded?  <- HERE. `media_assets`, our own rows,
 *      accurate to the second, and the number a teacher can act on.
 *   2. What does Cloudinary say the account is using?  <- `cloudinary-usage.ts`.
 *      Account-wide, aggregated daily, and includes anything else that account
 *      is ever used for.
 *
 * They will not match, and that is correct rather than a bug. Presenting either
 * as the other is how a dashboard starts lying.
 *
 * =============================================================================
 * AGGREGATED IN THE DATABASE, NOT IN MEMORY
 * =============================================================================
 * One `aggregate` call, so the row count, the byte total, the largest file and
 * the most recent upload all come back without loading a single asset row into
 * this process. The library page loads 200 rows because it renders 200
 * thumbnails; this screen renders four numbers and should read four numbers.
 */

export type MediaStorageSummary = {
  /** Rows in `media_assets`. Zero is a real, correct answer. */
  assetCount: number;
  /** Sum of the stored byte counts, or null if it could not be determined. */
  totalBytes: number | null;
  /** The single largest stored asset, or null when the library is empty. */
  largestBytes: number | null;
  /** When the most recent upload happened, or null when the library is empty. */
  lastUploadAt: Date | null;
};

export type MediaStorageResult =
  | { status: 'ok'; summary: MediaStorageSummary }
  | { status: 'no-database' }
  | { status: 'unavailable'; reason: string };

/**
 * Prisma's `_sum` over an `Int` column comes back through a PostgreSQL
 * `bigint`, and drivers differ on whether that arrives as a number or a BigInt.
 * Both are handled here rather than assumed, because the failure mode of
 * assuming is `[object BigInt]` rendered onto the page.
 *
 * The magnitude is never a concern in practice — `Number.MAX_SAFE_INTEGER`
 * bytes is about 9 petabytes — but a BigInt that reaches JSX still breaks the
 * render, so the conversion is explicit.
 */
function toNumber(value: unknown): number | null {
  if (typeof value === 'bigint') {
    // Beyond this, precision is gone and the number would be a polite fiction.
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(value);
  }
  return nonNegativeOrNull(value);
}

/**
 * Read the media library's size straight from the database.
 *
 * ⚠ NEVER THROWS. This feeds an observability screen. A storage widget that
 * takes out the page it lives on has inverted its own purpose, so a database
 * failure is reported as a status rather than raised.
 */
export async function getMediaStorageSummary(): Promise<MediaStorageResult> {
  if (!isDatabaseConfigured()) return { status: 'no-database' };

  try {
    const result = await getPrisma().mediaAsset.aggregate({
      _count: { _all: true },
      _sum: { bytes: true },
      _max: { bytes: true, uploadedAt: true },
    });

    const assetCount = toNumber(result._count?._all) ?? 0;

    /*
      AN EMPTY LIBRARY IS NOT AN ERROR, AND ITS TOTAL IS 0 — NOT "unknown".

      `_sum` returns null when there are no rows, which is SQL being correct
      about the sum of nothing. Reporting that as "Not available" would tell an
      administrator with no photographs that something had gone wrong. The
      distinction that matters is "no rows" (0 B) versus "rows exist but the
      total could not be read" (null), and only the second is a failure.
    */
    const totalBytes = assetCount === 0 ? 0 : toNumber(result._sum?.bytes);
    const largestBytes = assetCount === 0 ? null : toNumber(result._max?.bytes);
    const lastUploadAt =
      result._max?.uploadedAt instanceof Date ? result._max.uploadedAt : null;

    return {
      status: 'ok',
      summary: { assetCount, totalBytes, largestBytes, lastUploadAt },
    };
  } catch (error) {
    logUnexpected('media.storage.summary_failed', error);
    return { status: 'unavailable', reason: 'The database did not answer.' };
  }
}
