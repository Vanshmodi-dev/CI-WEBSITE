import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4, as a pure function.
 *
 * =============================================================================
 * WHY THIS IS ITS OWN MODULE, AND WHY IT HAS NO `server-only` GUARD
 * =============================================================================
 * The same reasoning as `validation.ts`, `request-guard.ts` and
 * `contact-links.ts`: this touches no I/O, no network and no environment. It
 * takes a request description and a credential and returns headers.
 *
 * That matters because signing is the part that is silently wrong. A broken
 * validator refuses things loudly; a broken signature comes back as an opaque
 * 403 from a provider, at which point the natural conclusion is "the
 * credentials must be wrong" and hours disappear. Keeping it importable is what
 * lets `tests/sigv4.test.ts` check it against AWS's own published example
 * rather than against itself.
 *
 * =============================================================================
 * NO SDK
 * =============================================================================
 * `@aws-sdk/client-s3` exists and was rejected: dozens of transitive packages,
 * paid for on every serverless cold start, to sign four kinds of request. The
 * algorithm is documented and is about sixty lines over `node:crypto`, which
 * already ships with the runtime. This adds ZERO dependencies.
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac('sha256', key).update(data, 'utf8').digest();

/**
 * The four-step signing key derivation.
 *
 * Exported so it can be checked against the worked example in AWS's own
 * documentation. If this is right, everything downstream of it is arithmetic.
 */
export function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  return hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service),
    'aws4_request',
  );
}

/**
 * Percent-encode one path segment per RFC 3986, which is what a canonical URI
 * requires. `encodeURIComponent` leaves `!'()*` alone; S3 does not.
 *
 * Every key this project stores matches `^[0-9a-f]{32}\.[a-z]+$` and needs no
 * encoding at all. This exists so that stays true by construction.
 */
export function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `20260828T051500Z` and `20260828`, the two forms SigV4 wants. */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export type SignInput = {
  method: 'PUT' | 'GET' | 'HEAD' | 'DELETE';
  /** Already-encoded canonical URI, e.g. `/bucket/key`. */
  canonicalUri: string;
  /** Sorted, encoded `a=1&b=2`, or the empty string. */
  canonicalQuery: string;
  host: string;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  now: Date;
};

/**
 * The headers a signed request must carry.
 *
 * ⚠ ONLY THREE HEADERS ARE SIGNED: host, x-amz-content-sha256, x-amz-date.
 *
 * `Content-Type` is deliberately excluded. Some S3-compatible gateways and
 * proxies normalise or add it in transit, and a signature covering a header
 * that something rewrites fails as a 403 with no explanation. The type is still
 * SENT, so the stored object keeps it; it simply is not part of the signature.
 */
export type SignedHeaders = {
  Authorization: string;
  'x-amz-content-sha256': string;
  'x-amz-date': string;
};

export function signRequest(input: SignInput): SignedHeaders {
  const { amzDate, dateStamp } = amzDates(input.now);
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalHeaders =
    `host:${input.host}\n` +
    `x-amz-content-sha256:${input.payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    input.canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = deriveSigningKey(
    input.secretAccessKey,
    dateStamp,
    input.region,
    input.service,
  );
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    Authorization:
      `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': amzDate,
  };
}
