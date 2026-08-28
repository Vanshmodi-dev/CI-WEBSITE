/**
 * Reading and validating the media storage configuration.
 *
 * =============================================================================
 * WHY THIS IS A SEPARATE FILE FROM `s3.ts`
 * =============================================================================
 * NO `server-only` GUARD HERE, deliberately — the same reasoning as
 * `validation.ts`, `request-guard.ts`, `location.ts` and `contact-links.ts`.
 * This module touches no I/O, no network and no credentials in use; it reads
 * five environment strings and decides whether they form a usable
 * configuration.
 *
 * That decision is the one that keeps a half-configured deployment from
 * silently writing photographs to a disk it is about to throw away, so it is
 * exactly the kind of logic that must be unit-testable. `s3.ts` keeps the
 * `server-only` guard, because it is the half that signs requests and moves
 * bytes.
 */

/** Everything `S3MediaStore` needs to sign a request. */
export type S3Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export const S3_ENV_VARS = [
  'MEDIA_S3_ENDPOINT',
  'MEDIA_S3_BUCKET',
  'MEDIA_S3_ACCESS_KEY_ID',
  'MEDIA_S3_SECRET_ACCESS_KEY',
] as const;

/**
 * Is this host the machine we are running on?
 *
 * Used in two places that pull in opposite directions: the configuration check
 * relaxes its https requirement for loopback, and the pre-flight check refuses
 * loopback storage on a host whose disk is discarded.
 */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/** Does this configuration point at storage on the machine itself? */
export function isLoopbackEndpoint(endpoint: string): boolean {
  try {
    return isLoopbackHost(new URL(endpoint).hostname);
  } catch {
    return false;
  }
}

export type S3ConfigVerdict =
  | { state: 'absent' }
  | { state: 'partial'; missing: string[] }
  | { state: 'invalid'; reason: string }
  | { state: 'ready'; config: S3Config };

/**
 * Read the storage configuration, and be strict about half-configured.
 *
 * ⚠ THE THREE STATES ARE NOT THE SAME AND MUST NOT COLLAPSE.
 *
 *   absent   nothing is set. A developer's machine. Local disk is correct.
 *   partial  SOME variables are set. This is the dangerous one — it almost
 *            always means a deployment where somebody added three of four
 *            secrets. Falling back to local disk here would "work" and lose
 *            every photograph at the next deploy, which is exactly the failure
 *            Topic 5 refused to ship. It is an ERROR, never a fallback.
 *   ready    all four present and structurally sound.
 */
export function readS3Config(
  override?: Record<string, string | undefined>,
): S3ConfigVerdict {
  /*
    ⚠ EVERY NAME IS READ AS A LITERAL `process.env.X`, ON PURPOSE.

    `tests/deployment.test.ts` proves that every environment variable this
    application reads is declared in the deployment contract, and it does that
    by scanning the source for `process.env.NAME`. An earlier version of this
    function took `env: NodeJS.ProcessEnv = process.env` and read `env.NAME`,
    which is tidier and completely invisible to that scan — the contract test
    passed while it had no idea these five existed.

    Spelling them out costs six lines and puts them back under the guarantee.
    The override parameter is what keeps the function unit-testable.
  */
  const env: Record<string, string | undefined> = override ?? {
    MEDIA_S3_ENDPOINT: process.env.MEDIA_S3_ENDPOINT,
    MEDIA_S3_BUCKET: process.env.MEDIA_S3_BUCKET,
    MEDIA_S3_ACCESS_KEY_ID: process.env.MEDIA_S3_ACCESS_KEY_ID,
    MEDIA_S3_SECRET_ACCESS_KEY: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
    MEDIA_S3_REGION: process.env.MEDIA_S3_REGION,
  };

  const present = S3_ENV_VARS.filter((name) => (env[name] ?? '').trim() !== '');
  if (present.length === 0) return { state: 'absent' };

  if (present.length < S3_ENV_VARS.length) {
    return {
      state: 'partial',
      missing: S3_ENV_VARS.filter((name) => (env[name] ?? '').trim() === ''),
    };
  }

  const endpoint = (env.MEDIA_S3_ENDPOINT ?? '').trim();
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { state: 'invalid', reason: 'MEDIA_S3_ENDPOINT is not a URL.' };
  }
  /*
    HTTPS, EXCEPT ON LOOPBACK.

    Credentials are sent on every request, so plain http to a remote host is
    refused outright. Loopback is different in kind: `http://127.0.0.1:9000` is
    a MinIO instance on the same machine, which is a legitimate — and the
    cheapest possible — self-hosted deployment, and there is no network for
    anything to be intercepted on.

    ⚠ IT IS NOT A GENERAL ESCAPE HATCH. `isLoopbackEndpoint()` below is exported
    so the pre-flight check can FAIL a deployment whose storage is on loopback
    while its filesystem is ephemeral — that combination is local disk wearing a
    different hat, and loses photographs exactly as fast.
  */
  if (parsed.protocol !== 'https:' && !isLoopbackHost(parsed.hostname)) {
    return {
      state: 'invalid',
      reason: 'MEDIA_S3_ENDPOINT must be https — credentials are sent on every request.',
    };
  }
  /*
    The endpoint addresses the SERVICE, not a bucket and not an object. A value
    carrying a path is the commonest configuration mistake (pasting the bucket
    URL from a dashboard) and it produces requests to `/bucket/bucket/key`,
    which fail as 404s that look like missing objects rather than like
    misconfiguration.
  */
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    return {
      state: 'invalid',
      reason: 'MEDIA_S3_ENDPOINT must be the service address with no path (no bucket name).',
    };
  }

  const bucket = (env.MEDIA_S3_BUCKET ?? '').trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    return { state: 'invalid', reason: 'MEDIA_S3_BUCKET is not a valid bucket name.' };
  }

  return {
    state: 'ready',
    config: {
      endpoint: parsed.origin,
      bucket,
      accessKeyId: (env.MEDIA_S3_ACCESS_KEY_ID ?? '').trim(),
      secretAccessKey: (env.MEDIA_S3_SECRET_ACCESS_KEY ?? '').trim(),
      // R2 ignores the region but SigV4 requires one in the scope. "auto" is
      // what Cloudflare documents; a real S3 bucket needs its own.
      region: (env.MEDIA_S3_REGION ?? '').trim() || 'auto',
    },
  };
}
