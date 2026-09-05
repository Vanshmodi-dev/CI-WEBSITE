import 'server-only';

import { cache } from 'react';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { logUnexpected } from '@/lib/log';
import { getSiteContent } from '@/lib/site-content';
import { keyFromPath } from '@/lib/media/format';
import {
  SHARE_CARD_PATH,
  SHARE_CARD_SIZE,
  validateShareImage,
} from '@/config/site-content';
import { institute } from '@/config/institute';
import { pageMetadata, type PageMetadataArgs } from '@/lib/seo';
import type { Metadata } from 'next';

/**
 * THE PICTURE ON AN UNFURLED LINK.
 *
 * =============================================================================
 * WHAT WAS WRONG BEFORE THIS FILE
 * =============================================================================
 * `pageMetadata()` emitted `twitter:card = summary_large_image` on every public
 * page and never emitted an image, and no `opengraph-image` file existed. A
 * card format that is nothing but a large picture, declared with no picture in
 * it. Every link the institute sent - and the WhatsApp deep link is the primary
 * conversion path, Master Plan section 07 - unfurled as a grey rectangle.
 *
 * It was invisible from inside the product: nothing on any page renders
 * `og:image`, no test read the emitted metadata, and the only place the defect
 * shows is somebody else's chat window.
 *
 * =============================================================================
 * WHY THE FILE CONVENTION DOES NOT SOLVE THIS
 * =============================================================================
 * The obvious fix is `src/app/opengraph-image.png`, which Next resolves for a
 * route segment and inherits down the tree. It was tried and MEASURED, and it
 * does not work here: `openGraph` is replaced wholesale by a child segment
 * rather than deep-merged, and every public page sets its own `openGraph`
 * through `pageMetadata()`. The built HTML for /courses carried og:title,
 * og:description, og:url and no og:image with the convention file in place.
 *
 * So the image has to travel through `pageMetadata()` itself, which is why
 * every public page resolves it and passes it in.
 *
 * =============================================================================
 * WHY THIS IS A SEPARATE MODULE FROM `seo.ts`
 * =============================================================================
 * `src/lib/seo.ts` is pure and synchronous, imports no database, and is unit
 * tested as such. Resolving the chosen image needs `getSiteContent()` and a
 * Prisma read, so it lives here behind `server-only` and `seo.ts` simply
 * accepts the answer as an argument. The pure half stays testable in plain
 * Node; the half that touches the database cannot be imported into a client
 * bundle by accident.
 */

export type ShareImage = {
  /**
   * Site-relative. `metadataBase` in the root layout is what turns this into
   * the absolute URL a crawler needs, so the value stays correct across the
   * preview domain, the production domain and localhost without this module
   * knowing which one it is running on.
   */
  url: string;
  alt: string;
  /**
   * Omitted when we do not know them for certain.
   *
   * `og:image:width` and `og:image:height` let WhatsApp lay out the card before
   * it has finished downloading the picture. They are worth emitting - and
   * worth omitting rather than guessing, because a declared size that does not
   * match the bytes produces a stretched card, which is worse than a card that
   * renders a moment later.
   */
  width?: number;
  height?: number;
};

/**
 * The generated brand card. Committed, so it is always there.
 *
 * The alt text describes the picture rather than selling the institute: it is
 * read aloud by a screen reader on a shared link, where a marketing sentence
 * would be an interruption rather than information.
 */
const DEFAULT_SHARE_IMAGE: ShareImage = {
  url: SHARE_CARD_PATH,
  alt: `${institute.name} — ${institute.tagline}`,
  width: SHARE_CARD_SIZE.width,
  height: SHARE_CARD_SIZE.height,
};

/**
 * The institute's chosen picture, or the brand card.
 *
 * ⚠ THE STORED VALUE IS RE-VALIDATED HERE, AND THAT IS NOT BELT AND BRACES.
 *
 * It is the same rule `getContactBlock()` applies to the coordinates and the
 * email address, and the argument is stronger for this field than for either of
 * those. The value went through `validateShareImage` in the save action, but
 * this row is what other people's servers are told to fetch and publish beside
 * the institute's name. A row that is ALREADY wrong - written by a direct
 * query, by a future import, or by a code path somebody adds later that forgets
 * the registry - would otherwise become a picture on a card the institute did
 * not choose. Re-checking costs one function call and removes the whole class.
 *
 * Anything that fails falls back to the brand card. There is no degraded state
 * in which this returns nothing, because "nothing" is the defect it fixes.
 */
export const getShareImage = cache(async (): Promise<ShareImage> => {
  let chosen: string;
  try {
    const content = await getSiteContent();
    chosen = (content['seo.shareImage'] ?? '').trim();
  } catch (error) {
    logUnexpected('share-image.content.failed', error);
    return DEFAULT_SHARE_IMAGE;
  }

  if (chosen === '' || validateShareImage(chosen) !== null) {
    return DEFAULT_SHARE_IMAGE;
  }
  if (chosen === SHARE_CARD_PATH) return DEFAULT_SHARE_IMAGE;

  const key = keyFromPath(chosen);
  if (key === null) return DEFAULT_SHARE_IMAGE;

  /*
    The dimensions come from `media_assets`, which exists partly for this - the
    schema gives "metadata the admin shows" as one of the three reasons the
    table is justified, and reading a width beats decoding the image on every
    render.

    A MISSING ROW IS NOT A REASON TO DROP THE PICTURE. The bytes are addressed
    by the key in the path, not by this row, so a manifest that has lost its
    entry still serves a perfectly good image - it just cannot say how big it
    is. Falling back to the brand card here would replace the institute's own
    chosen photograph over a missing metadata row, which is the wrong trade.
  */
  const url = chosen;
  const alt = `${institute.name} — ${institute.tagline}`;

  if (!isDatabaseConfigured()) return { url, alt };

  try {
    const asset = await getPrisma().mediaAsset.findUnique({
      where: { key },
      select: { width: true, height: true },
    });
    if (!asset) return { url, alt };
    return { url, alt, width: asset.width, height: asset.height };
  } catch (error) {
    logUnexpected('share-image.dimensions.failed', error);
    return { url, alt };
  }
});

/**
 * `pageMetadata()` with the share image already resolved.
 *
 * WHY EVERY PUBLIC PAGE CALLS THIS RATHER THAN `pageMetadata` DIRECTLY.
 *
 * The image is the same on every page, so every page needing to remember to
 * fetch and pass it is exactly the kind of per-call-site obligation that gets
 * forgotten by the eleventh page - and forgetting it is silent, because a
 * missing `og:image` looks like nothing at all until somebody shares that one
 * page in a chat. One wrapper means a new public page gets a share card by
 * writing the same line every other page already has.
 *
 * `getShareImage()` is wrapped in React `cache()`, so the fourteen calls this
 * adds across a render collapse to one query.
 */
export async function publicPageMetadata(
  args: Omit<PageMetadataArgs, 'image'>,
): Promise<Metadata> {
  return pageMetadata({ ...args, image: await getShareImage() });
}
