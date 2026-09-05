import 'server-only';

import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { isMediaKey, CONTENT_TYPE_FOR, type ImageFormat } from './format.ts';
import {
  publicIdFor,
  keyFromResource,
  MEDIA_FOLDER,
  type CloudinaryConfig,
} from './cloudinary-config.ts';
import type { MediaStore, StoredObject } from './store.ts';

/**
 * Cloudinary object storage.
 *
 * =============================================================================
 * WHAT THIS REPLACED, AND WHAT DID NOT CHANGE
 * =============================================================================
 * This file took over from `s3.ts`, which spoke the S3 API to Cloudflare R2
 * over a hand-rolled SigV4 signer. NOTHING ABOVE THE `MediaStore` INTERFACE
 * MOVED: the ingest pipeline still sniffs magic bytes, still re-encodes, still
 * strips EXIF, still content-addresses; `/media/[key]` still serves the bytes
 * under a one-year immutable cache; `media_assets` rows are untouched, and so
 * are their keys.
 *
 * That is the whole point of there having been an interface. The provider was
 * always meant to be a configuration decision, and this migration is the first
 * time that claim was actually tested.
 *
 * =============================================================================
 * WHY THE SDK HERE, WHEN THE S3 STORE REFUSED ONE
 * =============================================================================
 * `s3.ts` argued — correctly — that `@aws-sdk/client-s3` was dozens of
 * transitive packages to sign four kinds of request, and implemented SigV4 by
 * hand instead. The trade is different for Cloudinary and the answer flips:
 *
 *   - Cloudinary's signing scheme is not a published spec with official test
 *     vectors the way SigV4 is. `tests/sigv4.test.ts` could check our signer
 *     against AWS's own worked example; there is no equivalent to check a
 *     hand-rolled Cloudinary signer against, so hand-rolling would mean
 *     shipping unverifiable crypto.
 *   - The cost is one dependency with ONE transitive (`lodash`). Measured, not
 *     assumed: `npm ls` after installing shows nothing else.
 *
 * =============================================================================
 * KEY -> PUBLIC ID, AND WHY THERE IS NO SCHEMA MIGRATION
 * =============================================================================
 * `commerce-insight/<32 hex>`, derived from the key by `publicIdFor`. The
 * mapping is a pure function of data the application already stores, so
 * `media_assets` did not need a `publicId` column, a `provider` column, or a
 * migration. A column would have been a second copy of something derivable —
 * and a second copy is a thing that can disagree.
 *
 * The extension is not part of the public id because Cloudinary keeps the
 * format as its own field. `keyFromResource` puts the two back together.
 */

/** Cloudinary's format names for the four formats we are willing to store. */
const CLOUDINARY_FORMAT_FOR: Readonly<Record<string, ImageFormat>> = {
  jpg: 'jpeg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
};

/** The extension carried by one of our keys. */
function extensionOf(key: string): string {
  return key.slice(key.lastIndexOf('.') + 1);
}

type CloudinaryError = { http_code?: number; error?: { http_code?: number; message?: string }; message?: string };

/** The HTTP status behind an SDK rejection, or 0 when it was not an API error. */
function statusOf(error: unknown): number {
  const e = error as CloudinaryError | null;
  return e?.http_code ?? e?.error?.http_code ?? 0;
}

export class CloudinaryMediaStore implements MediaStore {
  /*
    A plain field and an assignment, NOT a TypeScript parameter property.

    The test runner executes TypeScript by stripping types rather than
    compiling, and `constructor(private readonly config: X)` is the one common
    construct that cannot be stripped — it emits an assignment that has to be
    generated. Any suite importing this module would die at parse with
    ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX, which reads like a broken test rather
    than like a language feature. Inherited verbatim from `s3.ts`, where it was
    learned the hard way.
  */
  private readonly config: CloudinaryConfig;

  constructor(config: CloudinaryConfig) {
    this.config = config;

    /*
      ⚠ THE SDK'S CONFIGURATION IS PROCESS-GLOBAL, AND THAT IS SAFE HERE.

      `cloudinary.config()` mutates a module singleton rather than returning a
      client, and `destroy()`'s option type is a closed shape with no room for
      per-call credentials, so there is no way to avoid it. It is safe because
      `getMediaStore()` in `store.ts` builds exactly one store per process and
      caches it — there is never a second configuration to conflict with.

      If a second Cloudinary account is ever needed in one process, this is the
      line that has to change, and it will not fail quietly: the second store's
      constructor would silently retarget the first.
    */
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
  }

  /**
   * ⚠ EVERY METHOD RE-CHECKS THE KEY, through `publicIdFor`.
   *
   * That function refuses anything `isMediaKey` does not accept, so no
   * separator, dot-dot, null byte or encoded escape can reach a public id. It
   * is the same guard `s3.ts` applied before a request URL was built, in the
   * same place: in front of all of it.
   */

  /**
   * Remove the API secret from anything on its way into an error.
   *
   * Cloudinary does not echo credentials in its error messages, so this has
   * never been observed to fire. It exists because these strings reach logs and
   * an administrator's screen, and "the vendor does not currently do that" is a
   * weaker guarantee than not being able to.
   */
  private scrub(text: string): string {
    return this.config.apiSecret.length > 0
      ? text.split(this.config.apiSecret).join('[redacted]')
      : text;
  }

  /**
   * ⚠ ERRORS NAME THE OPERATION AND THE STATUS, NEVER THE CREDENTIAL.
   *
   * A 401 here almost always means a wrong key or secret, and the remedy is to
   * check the deployment configuration — not to see the secret.
   */
  private refuse(operation: string, error: unknown): never {
    const status = statusOf(error);
    const detail = (error as CloudinaryError)?.error?.message ?? (error as CloudinaryError)?.message;
    throw new Error(
      this.scrub(
        `Cloudinary refused a ${operation}${status ? ` (HTTP ${status})` : ''}` +
          `${detail ? `: ${detail}` : ''}. ` +
          'Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in the deployment configuration.',
      ),
    );
  }

  /**
   * The delivery URL for a key.
   *
   * Built by hand rather than through `cloudinary.url()` so that it is
   * DETERMINISTIC AND UNTRANSFORMED. The SDK's helper applies whatever defaults
   * are configured; a bare upload URL returns the original bytes, which is what
   * "the bytes we serve are the bytes we re-encoded" requires.
   *
   * No version segment: Cloudinary serves the current asset without one, and
   * the key is a content hash, so "current" and "the one we asked for" are the
   * same thing by construction.
   */
  private deliveryUrl(key: string): string {
    const publicId = publicIdFor(key);
    return `https://res.cloudinary.com/${this.config.cloudName}/image/upload/${publicId}.${extensionOf(key)}`;
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const publicId = publicIdFor(key);

    await new Promise<void>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: 'image',
          /*
            Content-addressed, so an overwrite writes identical bytes to the
            same id. `overwrite: true` makes a re-upload after a partial failure
            a no-op rather than an error.
          */
          overwrite: true,
          invalidate: true,
          // The uploaded filename is never trusted and never stored; the id is
          // ours. Both flags stop Cloudinary deriving anything from it.
          use_filename: false,
          unique_filename: false,
          /*
            NOTHING IS TRANSFORMED ON THE WAY IN. The ingest pipeline has
            already sniffed, resized, re-encoded and stripped EXIF; a Cloudinary
            eager transformation here would replace our audited output with
            theirs and break the content hash's meaning.
          */
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          if (!result) {
            reject(new Error('Cloudinary returned no result for an upload.'));
            return;
          }
          resolve();
        },
      );

      Readable.from(bytes).pipe(stream);
    }).catch((error: unknown) => this.refuse('upload', error));

    void contentType; // Determined by our own sniffing; Cloudinary infers its own.
  }

  /**
   * Fetch the stored bytes.
   *
   * ⚠ THE CONTENT TYPE COMES FROM THE KEY, NOT FROM THE RESPONSE.
   *
   * The extension was chosen by `decideFormat()` after sniffing OUR re-encoded
   * output, so it is the authoritative answer and needs no network round trip
   * to confirm. The S3 store read the header instead and defaulted to
   * `application/octet-stream` when it was missing; deriving it locally removes
   * that failure mode entirely. The serving route sends `nosniff` regardless.
   *
   * =========================================================================
   * ⚠ THIS READS THROUGH A CDN, AND IS THEREFORE EVENTUALLY CONSISTENT
   * =========================================================================
   * A DIFFERENCE FROM THE R2 STORE, MEASURED RATHER THAN ASSUMED:
   * `npm run verify:storage` deletes an object and immediately asks for it
   * again, and gets the bytes back. `remove()` passes `invalidate: true`, but
   * Cloudinary's purge is asynchronous — usually minutes.
   *
   * So after a delete: `exists()` and `list()` (Admin API) are authoritative
   * and immediate; `get()` may serve the object for a while longer.
   *
   * WHY THAT IS ACCEPTABLE HERE, and not simply hidden:
   *   - `/media/[key]` already sets `max-age=31536000, immutable`, so every
   *     browser and CDN in front of it was ALWAYS entitled to keep serving a
   *     deleted photograph. R2's immediate 404 never reached those caches
   *     either. This narrows an existing gap rather than opening a new one.
   *   - Consent withdrawal does not depend on this. Unticking permission stops
   *     the site RENDERING the URL — enforced by a database CHECK constraint —
   *     and `docs/COST-AND-INFRASTRUCTURE.md` already records that "the file
   *     remaining in storage is not a publication".
   *   - Reconciliation uses `list()` and `lastModified()`, both Admin API, so
   *     `media:clean` is unaffected.
   *
   * The fix, if this ever stops being acceptable, is an Admin API existence
   * check before the fetch — one extra call on EVERY image served, against a
   * 500/hour rate limit. That trade is not worth making today, and it is
   * written here so the next person can make it deliberately.
   */
  async get(key: string): Promise<StoredObject | null> {
    const url = this.deliveryUrl(key); // Also validates the key.

    let response: Response;
    try {
      response = await fetch(url, {
        // Never let a hung CDN hold a request open until the platform kills it.
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      this.refuse('read', error);
    }

    if (response.status === 404) return null;
    if (!response.ok) this.refuse('read', { http_code: response.status });

    const format = CLOUDINARY_FORMAT_FOR[extensionOf(key)];
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: format ? CONTENT_TYPE_FOR[format] : 'application/octet-stream',
    };
  }

  /**
   * Does this object exist, without downloading it?
   *
   * Asked on EVERY upload, to deduplicate. The Admin API is the authoritative
   * answer — a HEAD against the CDN can be answered from a cached 404 — at the
   * cost of one call against Cloudinary's Admin API rate limit (500/hour on the
   * free tier). At this institute's upload volume, a handful a week, that is
   * not a constraint worth trading correctness for.
   */
  async exists(key: string): Promise<boolean> {
    const publicId = publicIdFor(key);
    try {
      await cloudinary.api.resource(publicId, { resource_type: 'image' });
      return true;
    } catch (error) {
      if (statusOf(error) === 404) return false;
      this.refuse('existence check', error);
    }
  }

  /** From the Admin API's `created_at`. Null when the object is absent. */
  async lastModified(key: string): Promise<Date | null> {
    const publicId = publicIdFor(key);
    try {
      const resource = await cloudinary.api.resource(publicId, { resource_type: 'image' });
      const raw = (resource as { created_at?: unknown }).created_at;
      if (typeof raw !== 'string') return null;
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    } catch (error) {
      if (statusOf(error) === 404) return null;
      this.refuse('existence check', error);
    }
  }

  /**
   * Idempotent: deleting something already gone is a success, not an error.
   *
   * Cloudinary reports that case as `{ result: 'not found' }` with HTTP 200
   * rather than as a rejection, so both the 200 body and a 404 rejection have
   * to be treated as done. The reconciliation script deletes orphans it may
   * race with an administrator over, and turning "already gone" into a crash
   * would make that script unusable.
   */
  async remove(key: string): Promise<void> {
    const publicId = publicIdFor(key);
    try {
      const outcome = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        invalidate: true,
      });
      const result = (outcome as { result?: unknown }).result;
      if (result === 'ok' || result === 'not found') return;
      this.refuse('delete', { message: `unexpected result "${String(result)}"` });
    } catch (error) {
      if (statusOf(error) === 404) return;
      this.refuse('delete', error);
    }
  }

  /**
   * Every key this application holds, following pagination cursors.
   *
   * Used only by the reconciliation script. Scoped to `commerce-insight/` by
   * prefix and then filtered through `keyFromResource`, so anything else in the
   * account — another project's folder, the verification folder, a format we
   * never store — is ignored rather than reported as an orphan for
   * `npm run media:clean` to delete.
   */
  async list(): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;

    do {
      let page: { resources?: unknown; next_cursor?: unknown };
      try {
        page = await cloudinary.api.resources({
          type: 'upload',
          resource_type: 'image',
          prefix: `${MEDIA_FOLDER}/`,
          max_results: 500,
          ...(cursor ? { next_cursor: cursor } : {}),
        });
      } catch (error) {
        this.refuse('listing', error);
      }

      const resources = Array.isArray(page.resources) ? page.resources : [];
      for (const resource of resources) {
        const { public_id: publicId, format } = (resource ?? {}) as Record<string, unknown>;
        const key = keyFromResource(publicId, format);
        if (key && isMediaKey(key)) keys.push(key);
      }

      cursor = typeof page.next_cursor === 'string' ? page.next_cursor : undefined;
    } while (cursor);

    return keys;
  }

  /** Never includes a credential. */
  describe(): string {
    return `Cloudinary (cloud "${this.config.cloudName}", folder "${MEDIA_FOLDER}/")`;
  }
}
