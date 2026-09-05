import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { PageHeader, Card, Notice, StatusPill } from '@/components/admin/ui';
import { formatDateTime } from '@/lib/admin-format';
import { getMediaStorageSummary } from '@/lib/media/storage-usage';
import { getProviderUsage, PROVIDER_CACHE_TTL_MS } from '@/lib/media/cloudinary-usage';
import {
  formatBytes,
  formatCount,
  formatPercent,
  usageStatus,
  STATUS_LABELS,
  NOT_AVAILABLE,
  type ProviderUsage,
} from '@/lib/media/usage-format';
import { RefreshUsageButton } from './refresh-button';

export const metadata: Metadata = { title: 'Storage usage' };

/** Reads live figures and a session. Never a cached page. */
export const dynamic = 'force-dynamic';

/**
 * Storage usage.
 *
 * =============================================================================
 * TWO NUMBERS, TWO SOURCES, NEVER BLENDED
 * =============================================================================
 * This screen answers "how much room is left?" and the honest answer has two
 * halves that do not add up to one figure:
 *
 *   THIS WEBSITE'S PHOTOS   `media_assets`. Live, exact, ours. What the
 *                           institute has uploaded through this admin.
 *
 *   CLOUDINARY ACCOUNT      The provider's own numbers. Account-wide, and
 *                           aggregated DAILY - so they lag, and they include
 *                           anything else that account is ever used for.
 *
 * They will disagree, and the page says so rather than picking one and calling
 * it the truth.
 *
 * =============================================================================
 * ⚠ WHY THERE IS NO "STORAGE REMAINING" NUMBER
 * =============================================================================
 * Cloudinary's free plan meters ONE pool of CREDITS that storage, bandwidth and
 * transformations all draw from. `api.usage()` reports `credits.limit` (25) and
 * publishes NO storage-only allowance anywhere.
 *
 * So "25 credits" cannot be converted into "N GB", and any progress bar built
 * on that conversion would be invented. The credit bar below is real because
 * credits have a real published limit. The storage figure has no bar, and says
 * why, because the alternative is fake precision on the one screen whose entire
 * job is to be trusted.
 */
export default async function StorageUsagePage() {
  await requireAdmin();

  const [storage, provider] = await Promise.all([
    getMediaStorageSummary(),
    getProviderUsage(),
  ]);

  const usage: ProviderUsage | null =
    provider.status === 'ok'
      ? provider.usage
      : provider.status === 'unavailable' && provider.last
        ? provider.last.usage
        : null;

  const fetchedAt =
    provider.status === 'ok'
      ? provider.fetchedAt
      : provider.status === 'unavailable' && provider.last
        ? provider.last.fetchedAt
        : null;

  const status = usageStatus(usage?.creditsPercent ?? null);

  return (
    <>
      <PageHeader
        title="Storage usage"
        description="How much space this website's photos take up, and what Cloudinary reports for the account holding them."
        back={{ href: '/admin/media', label: 'Back to photos' }}
        action={<RefreshUsageButton />}
      />

      {/* ================================================ our own figures == */}

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[18px] font-semibold text-heading">
            This website&rsquo;s photos
          </h2>
          <span className="text-[13px] text-muted">Live, from this site&rsquo;s own records</span>
        </div>

        {storage.status === 'no-database' ? (
          <div className="mt-4">
            <Notice tone="danger" title="No database">
              <p>Photo figures cannot be counted because the database is not configured.</p>
            </Notice>
          </div>
        ) : storage.status === 'unavailable' ? (
          <div className="mt-4">
            <Notice tone="warn" title="Could not count the photos">
              <p>{storage.reason} The website and the stored photos are unaffected.</p>
            </Notice>
          </div>
        ) : (
          <>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
              <Figure label="Space used" value={formatBytes(storage.summary.totalBytes)} big />
              <Figure label="Photos stored" value={formatCount(storage.summary.assetCount)} big />
              <Figure label="Largest photo" value={formatBytes(storage.summary.largestBytes)} />
              <Figure
                label="Last upload"
                value={
                  storage.summary.lastUploadAt
                    ? formatDateTime(storage.summary.lastUploadAt)
                    : 'No photos yet'
                }
              />
            </dl>

            {storage.summary.assetCount === 0 ? (
              <p className="mt-5 text-[13px] text-muted">
                Nothing has been uploaded yet. Photos are added from a record&rsquo;s own
                page &mdash; a teacher, a gallery entry, a student result.
              </p>
            ) : null}
          </>
        )}

        <Source>
          Counted directly from this website&rsquo;s <code>media_assets</code> records,
          not from Cloudinary. Accurate to the second.
        </Source>
      </Card>

      {/* ================================================ provider figures = */}

      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[18px] font-semibold text-heading">
            Cloudinary account
          </h2>
          {usage ? (
            <StatusPill
              tone={
                status === 'critical' ? 'warn' : status === 'watch' ? 'warn' : status === 'healthy' ? 'published' : 'draft'
              }
            >
              {STATUS_LABELS[status]}
            </StatusPill>
          ) : null}
        </div>

        {provider.status === 'not-configured' ? (
          <div className="mt-4">
            <Notice tone="info" title="Cloudinary is not configured here">
              <p>
                {provider.reason} Photos on this environment are stored on the local
                disk for development, so there is no account to report on.
              </p>
            </Notice>
          </div>
        ) : null}

        {provider.status === 'unavailable' ? (
          <div className="mt-4">
            <Notice tone="warn" title="Could not reach Cloudinary just now">
              <p>
                {provider.reason}
                {usage && fetchedAt
                  ? ` Showing the last figures we received, from ${formatDateTime(new Date(fetchedAt))}.`
                  : ''}
              </p>
            </Notice>
          </div>
        ) : null}

        {usage ? (
          <>
            {/* --------------------------------------------- credits ----- */}
            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-small font-semibold text-text">Monthly credits</h3>
                <p className="font-mono text-small tabular-nums text-text">
                  {usage.creditsUsed === null || usage.creditsLimit === null
                    ? NOT_AVAILABLE
                    : `${usage.creditsUsed} / ${usage.creditsLimit}`}
                </p>
              </div>

              {/*
                THE ONLY PROGRESS BAR ON THIS PAGE, because credits are the only
                metric with a real published limit. It is rendered only when the
                percentage is genuinely calculable.
              */}
              {usage.creditsPercent !== null ? (
                <div
                  className="mt-2 h-2 overflow-hidden rounded-sm border border-rule bg-surface"
                  role="progressbar"
                  aria-valuenow={usage.creditsPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Cloudinary monthly credits used"
                >
                  <div
                    className={
                      status === 'critical'
                        ? 'h-full bg-danger'
                        : status === 'watch'
                          ? 'h-full bg-warn'
                          : 'h-full bg-ok'
                    }
                    style={{ width: `${Math.min(100, Math.max(0, usage.creditsPercent))}%` }}
                  />
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-muted">
                  Cloudinary did not report a credit allowance, so no percentage is shown.
                </p>
              )}

              <p className="mt-2 text-[13px] text-muted">
                {usage.creditsPercent === null
                  ? 'Credits used is unknown.'
                  : `${formatPercent(usage.creditsPercent)} of this month's credits used.`}{' '}
                Storage, bandwidth and image transformations all draw from this one pool.
              </p>
            </div>

            {/* --------------------------------------------- figures ----- */}
            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
              <Figure label="Plan" value={usage.plan ?? NOT_AVAILABLE} />
              <Figure label="Storage (account)" value={formatBytes(usage.storageBytes)} />
              <Figure label="Bandwidth this month" value={formatBytes(usage.bandwidthBytes)} />
              <Figure label="Assets in account" value={formatCount(usage.resources)} />
            </dl>

            {/* --------------------------------------------- honesty ----- */}
            <div className="mt-6">
              <Notice tone="info" title="Storage remaining: not available">
                <p>
                  Cloudinary&rsquo;s free plan does not publish a storage-only allowance
                  &mdash; it meters one pool of credits that storage, bandwidth and
                  transformations all draw from. There is no honest way to turn{' '}
                  {usage.creditsLimit === null ? 'that allowance' : `${usage.creditsLimit} credits`}{' '}
                  into a number of gigabytes, so this page does not show one.
                </p>
              </Notice>
            </div>

            <Source>
              Reported by Cloudinary&rsquo;s Admin API for the whole account, which may
              hold more than this website.{' '}
              {usage.lastUpdated
                ? `Cloudinary aggregates these figures daily; these are as of ${usage.lastUpdated}, so a photo uploaded today may not be counted yet.`
                : 'Cloudinary aggregates these figures daily, so they lag behind recent uploads.'}{' '}
              {fetchedAt
                ? `Last checked ${formatDateTime(new Date(fetchedAt))}; cached for ${Math.round(PROVIDER_CACHE_TTL_MS / 60_000)} minutes.`
                : ''}
              {usage.rateLimitRemaining !== null
                ? ` ${formatCount(usage.rateLimitRemaining)} Admin API requests remain in the current hour.`
                : ''}
            </Source>
          </>
        ) : null}
      </Card>
    </>
  );
}

/* ---------------------------------------------------------- fragments ---- */

/**
 * One labelled figure.
 *
 * A `<dl>` pair rather than two `<div>`s: the label and the number are a
 * term-and-definition, and marking them up as one lets a screen reader read
 * "Space used, 2.4 MB" instead of two unrelated strings.
 */
function Figure({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd
        className={
          big
            ? 'mt-1 font-display text-[24px] font-bold leading-tight tabular-nums text-heading'
            : 'mt-1 text-base font-medium tabular-nums text-text'
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** Where a number came from. Every figure on this page carries one. */
function Source({ children }: { children: React.ReactNode }) {
  return (
    <p className="measure mt-5 border-t border-rule pt-4 text-[13px] leading-relaxed text-muted">
      <span className="font-medium text-text">Source: </span>
      {children}
    </p>
  );
}
