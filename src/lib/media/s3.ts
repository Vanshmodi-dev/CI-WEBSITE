import 'server-only';

import { isMediaKey } from './format.ts';
import { signRequest, sha256Hex, encodeSegment } from './sigv4.ts';
import type { MediaStore, StoredObject } from './store.ts';
import type { S3Config } from './s3-config.ts';

/**
 * S3-compatible object storage, signed by hand.
 *
 * =============================================================================
 * WHY THERE IS NO SDK HERE
 * =============================================================================
 * `@aws-sdk/client-s3` is the obvious choice and it was rejected deliberately.
 * It pulls in dozens of transitive packages for four operations — PUT, GET,
 * HEAD, DELETE and a listing — every one of which is a single signed HTTP
 * request. On a serverless host that weight is paid on every cold start, and
 * this project's whole cost argument rests on staying inside a free tier.
 *
 * What is actually required is AWS Signature Version 4, which is a documented
 * algorithm over `node:crypto` primitives that already ship with the runtime.
 * That is what this file is. It adds ZERO dependencies.
 *
 * =============================================================================
 * WHY S3-COMPATIBLE AND NOT A PROVIDER SDK
 * =============================================================================
 * SigV4 against a configurable endpoint is the portable option. The same code
 * addresses Cloudflare R2, Backblaze B2, Wasabi, MinIO and S3 itself, so the
 * provider is a environment variable rather than an architecture. Phase 17 chose
 * R2 for its free egress, but nothing here knows that, and moving is a
 * credential change rather than a rewrite.
 *
 * The alternative — a provider's own SDK, such as `@vercel/blob` — would have
 * been less code and total lock-in.
 *
 * =============================================================================
 * PATH-STYLE ADDRESSING
 * =============================================================================
 * `https://endpoint/bucket/key`, not `https://bucket.endpoint/key`. R2 serves
 * path-style, every S3-compatible implementation supports it, and it means the
 * bucket name never has to be a valid DNS label.
 */

const SERVICE = 's3';

/**
 * Sign and send one request.
 *
 * ⚠ THE SECRET IS NEVER PUT ANYWHERE IT COULD BE LOGGED. It is used to derive
 * the signing key and is not interpolated into a URL, a message or a thrown
 * error. `describe()` below prints the endpoint and bucket and nothing else.
 */
async function signedFetch(
  config: S3Config,
  method: 'PUT' | 'GET' | 'HEAD' | 'DELETE',
  objectKey: string,
  { body, contentType, query }: {
    body?: Uint8Array;
    contentType?: string;
    query?: Record<string, string>;
  } = {},
): Promise<Response> {
  const url = new URL(config.endpoint);
  const host = url.host;

  const encodedBucket = encodeSegment(config.bucket);
  const canonicalUri = objectKey === ''
    ? `/${encodedBucket}`
    : `/${encodedBucket}/${encodeSegment(objectKey)}`;

  // Canonical query: sorted by key, both halves encoded.
  const canonicalQuery = Object.entries(query ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeSegment(k)}=${encodeSegment(v)}`)
    .join('&');

  const payloadHash = sha256Hex(body ?? new Uint8Array(0));

  const headers: Record<string, string> = signRequest({
    method,
    canonicalUri,
    canonicalQuery,
    host,
    payloadHash,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: SERVICE,
    now: new Date(),
  });

  if (contentType) headers['Content-Type'] = contentType;

  const target = `${url.origin}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;

  return fetch(target, {
    method,
    headers,
    body: body ? (body as unknown as BodyInit) : undefined,
    // Never let a hung bucket hold a request open until the platform kills it.
    signal: AbortSignal.timeout(20_000),
  });
}

/**
 * ⚠ ERRORS NAME THE OPERATION AND THE STATUS, NEVER THE CREDENTIAL.
 *
 * These messages reach logs and, through the upload action, an administrator's
 * screen. A 403 here almost always means a wrong key or a wrong bucket, and the
 * remedy is to check the deployment configuration — not to see the secret.
 */
function refuse(operation: string, status: number): never {
  throw new Error(
    `Object storage refused a ${operation} (HTTP ${status}). ` +
      'Check the media storage credentials, bucket name and endpoint in the deployment configuration.',
  );
}

export class S3MediaStore implements MediaStore {
  /*
    A plain field and an assignment, NOT a TypeScript parameter property.

    The test runner executes TypeScript by stripping types rather than
    compiling, and `constructor(private readonly config: X)` is the one common
    construct that cannot be stripped — it emits an assignment that has to be
    generated. Any suite importing this module died at parse with
    ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX, which reads like a broken test rather
    than like a language feature.
  */
  private readonly config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
  }

  /**
   * ⚠ EVERY METHOD RE-CHECKS THE KEY.
   *
   * `isMediaKey` accepts only `^[0-9a-f]{32}\.(jpg|png|webp|avif)$`, so no
   * separator, dot-dot, null byte or encoded escape can reach a request URL.
   * The local store guards the same way at the one place a key becomes a path;
   * here the URL is that place, and the guard sits in front of all of it.
   */
  private assertKey(key: string): void {
    if (!isMediaKey(key)) {
      // The offending value is attacker-supplied and this string reaches a log.
      throw new Error('Refused a storage key this application did not issue.');
    }
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.assertKey(key);
    const response = await signedFetch(this.config, 'PUT', key, {
      body: new Uint8Array(bytes),
      contentType,
    });
    if (!response.ok) refuse('upload', response.status);
  }

  async get(key: string): Promise<StoredObject | null> {
    this.assertKey(key);
    const response = await signedFetch(this.config, 'GET', key);
    if (response.status === 404) return null;
    if (!response.ok) refuse('read', response.status);

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      /*
        The stored type, or a safe default.

        The bytes were re-encoded by us before they were ever written, so the
        type is known good; this header is a convenience, not a trust boundary.
        The serving route sends `nosniff` regardless.
      */
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  /**
   * Does this object exist, without downloading it?
   *
   * The upload path used to answer this with a full `get()`, which on remote
   * storage means paying to download an entire photograph purely to discover
   * that it is already there — on every duplicate upload. A HEAD is one cheap
   * request and the same answer.
   */
  async exists(key: string): Promise<boolean> {
    this.assertKey(key);
    const response = await signedFetch(this.config, 'HEAD', key);
    if (response.status === 404) return false;
    if (!response.ok) refuse('existence check', response.status);
    return true;
  }

  /** From the HEAD response's `Last-Modified`. Null when the object is absent. */
  async lastModified(key: string): Promise<Date | null> {
    this.assertKey(key);
    const response = await signedFetch(this.config, 'HEAD', key);
    if (response.status === 404) return null;
    if (!response.ok) refuse('existence check', response.status);
    const header = response.headers.get('last-modified');
    if (!header) return null;
    const parsed = new Date(header);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /** Idempotent: S3 returns 204 whether or not the object was there. */
  async remove(key: string): Promise<void> {
    this.assertKey(key);
    const response = await signedFetch(this.config, 'DELETE', key);
    if (!response.ok && response.status !== 404) refuse('delete', response.status);
  }

  /**
   * Every key in the bucket, following continuation tokens.
   *
   * Used only by the reconciliation script. The response is XML; keys are
   * extracted with a pattern and then filtered through `isMediaKey`, so
   * anything the bucket holds that this application did not write is ignored
   * rather than acted on.
   */
  async list(): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;

    do {
      const query: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' };
      if (token) query['continuation-token'] = token;

      const response = await signedFetch(this.config, 'GET', '', { query });
      if (!response.ok) refuse('listing', response.status);

      const xml = await response.text();
      for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
        const key = match[1];
        if (key && isMediaKey(key)) keys.push(key);
      }

      const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
      token = truncated
        ? (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) ?? [])[1]
        : undefined;
    } while (token);

    return keys;
  }

  /** Never includes a credential. */
  describe(): string {
    const host = (() => {
      try {
        return new URL(this.config.endpoint).host;
      } catch {
        return 'invalid endpoint';
      }
    })();
    return `S3-compatible object storage (bucket "${this.config.bucket}" at ${host})`;
  }
}
