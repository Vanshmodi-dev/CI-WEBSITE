'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminOrNull } from '@/lib/auth';
import { peekWindow, recordWindowHit } from '@/lib/burst-limit';
import { getProviderUsage } from '@/lib/media/cloudinary-usage';
import type { RefreshState } from './state';

/**
 * Ask Cloudinary for fresh usage figures.
 *
 * =============================================================================
 * EVERY EXPORTED ASYNC FUNCTION IN A 'use server' MODULE IS A PUBLIC ENDPOINT
 * =============================================================================
 * Phase 14 established this: it can be POSTed directly, with no page rendered
 * and no form present. So this module exports exactly ONE function, it
 * re-authenticates rather than trusting whatever rendered the button, and it
 * takes NO parameters from the caller.
 *
 * That last point is deliberate. The action accepts nothing a client could use
 * to steer it — no public id, no resource type, no account identifier. There is
 * exactly one Cloudinary call it can make, against the one account this
 * deployment is configured for. A client cannot query arbitrary Cloudinary
 * resources through it, because there is nothing to pass.
 *
 * =============================================================================
 * WHAT COMES BACK, AND WHAT DOES NOT
 * =============================================================================
 * The return value is a status and a sentence. The usage figures themselves are
 * re-read by the page on revalidation from `getProviderUsage`, which is
 * `server-only`. The cloud name, API key and API secret are not part of any
 * type that crosses to the browser.
 */

/**
 * Five refreshes a minute, per administrator.
 *
 * Cloudinary allows 500 Admin API calls an hour on the free tier and the SAME
 * budget is spent by `exists()` on every upload. A held-down refresh button is
 * the obvious way to spend it on nothing, so the button is bounded here rather
 * than relying on the client's disabled state — which is a UI convenience, not
 * a control.
 */
const REFRESH_WINDOW = { max: 5, windowMs: 60_000 };

export async function refreshProviderUsage(): Promise<RefreshState> {
  const admin = await requireAdminOrNull();
  if (!admin) return { status: 'error', message: 'Please sign in again.' };

  const limitKey = `media-usage-refresh:${admin.id}`;
  if (!peekWindow(limitKey, REFRESH_WINDOW).allowed) {
    return {
      status: 'error',
      message: 'Checked very recently. Please wait a moment before refreshing again.',
    };
  }
  recordWindowHit(limitKey, REFRESH_WINDOW);

  const result = await getProviderUsage({ force: true });

  if (result.status === 'not-configured') {
    return { status: 'error', message: result.reason };
  }
  if (result.status === 'unavailable') {
    // Not a crash and not a lie: the page keeps rendering the last good figures
    // under a notice saying they are stale.
    return { status: 'error', message: result.reason };
  }

  revalidatePath('/admin/media/storage');
  return { status: 'done', message: 'Usage refreshed from Cloudinary.' };
}
