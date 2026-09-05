/**
 * Reading and validating the Cloudinary media configuration.
 *
 * =============================================================================
 * WHY THIS IS A SEPARATE FILE FROM `cloudinary.ts`
 * =============================================================================
 * NO `server-only` GUARD HERE, deliberately — the same reasoning the S3
 * configuration carried before it, and the same as `validation.ts`,
 * `request-guard.ts`, `location.ts` and `contact-links.ts`. This module touches
 * no I/O, no network and no credential in use; it reads three environment
 * strings and decides whether they form a usable configuration, and it derives
 * a public id from a key.
 *
 * That decision is the one that keeps a half-configured deployment from
 * silently writing photographs to a disk it is about to throw away, so it is
 * exactly the kind of logic that must be unit-testable. `cloudinary.ts` keeps
 * the `server-only` guard, because it is the half that holds the API secret and
 * moves bytes.
 */

import { isMediaKey } from './format.ts';

/** Everything `CloudinaryMediaStore` needs to authenticate. */
export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

export const CLOUDINARY_ENV_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

/**
 * The one folder this application writes to.
 *
 * Everything the site owns lives under this prefix, which is what makes
 * `list()` — and therefore orphan reconciliation — safe: a Cloudinary account
 * shared with anything else cannot have its other assets enumerated, counted as
 * orphans, and deleted by `npm run media:clean`.
 */
export const MEDIA_FOLDER = 'commerce-insight';

/** The folder the storage verification writes its throwaway asset to. */
export const VERIFY_FOLDER = `${MEDIA_FOLDER}/_verify`;

/**
 * A key becomes a public id, and NOTHING ELSE EVER DOES.
 *
 * ⚠ THIS IS THE WHOLE "no user-controlled public ids" GUARANTEE.
 *
 * `isMediaKey` accepts only `^[0-9a-f]{32}\.(jpg|png|webp|avif)$` — 32 hex
 * characters of a content hash WE computed over bytes WE re-encoded, plus an
 * extension from a closed set. A filename, a caption, a path or anything else a
 * person typed cannot reach this function's output, because none of it can pass
 * that pattern. There is no branch that concatenates user input into a public
 * id.
 *
 * The extension is dropped: Cloudinary stores the format as its own field and
 * appends it to delivery URLs. `keyFromResource` below puts it back.
 */
export function publicIdFor(key: string): string {
  if (!isMediaKey(key)) {
    // The offending value is attacker-supplied and this string reaches a log.
    throw new Error('Refused a storage key this application did not issue.');
  }
  return `${MEDIA_FOLDER}/${key.slice(0, key.lastIndexOf('.'))}`;
}

/** Cloudinary's format names, mapped back onto our extensions. */
const EXTENSION_FOR_CLOUDINARY_FORMAT: Readonly<Record<string, string>> = {
  jpg: 'jpg',
  // Cloudinary normally reports `jpg`, but accepts and occasionally echoes
  // `jpeg`. Both mean the same stored bytes and the same one of our extensions.
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
};

/**
 * Rebuild our key from what the Admin API returned, or null if this resource is
 * not one of ours.
 *
 * Used only by `list()`, and the null branch is load-bearing: anything in the
 * account that this application did not write — a stray upload, another
 * project's folder, a format we never store — is IGNORED rather than reported
 * as an orphan for the cleanup script to delete.
 */
export function keyFromResource(publicId: unknown, format: unknown): string | null {
  if (typeof publicId !== 'string' || typeof format !== 'string') return null;

  const prefix = `${MEDIA_FOLDER}/`;
  if (!publicId.startsWith(prefix)) return null;

  const stem = publicId.slice(prefix.length);
  // A nested folder (the verification folder, for instance) is not a media key.
  if (stem.includes('/')) return null;

  const extension = EXTENSION_FOR_CLOUDINARY_FORMAT[format.toLowerCase()];
  if (!extension) return null;

  const key = `${stem}.${extension}`;
  return isMediaKey(key) ? key : null;
}

export type CloudinaryConfigVerdict =
  | { state: 'absent' }
  | { state: 'partial'; missing: string[] }
  | { state: 'invalid'; reason: string }
  | { state: 'ready'; config: CloudinaryConfig };

/**
 * Read the storage configuration, and be strict about half-configured.
 *
 * ⚠ THE FOUR STATES ARE NOT THE SAME AND MUST NOT COLLAPSE.
 *
 *   absent   nothing is set. A developer's machine. Local disk is correct.
 *   partial  SOME variables are set. This is the dangerous one — it almost
 *            always means a deployment where somebody added two of three
 *            secrets. Falling back to local disk here would "work" and lose
 *            every photograph at the next deploy, which is exactly the failure
 *            the media system was built to refuse. It is an ERROR, never a
 *            fallback.
 *   invalid  all three present, but one is not shaped like what it claims to
 *            be. The commonest case by far is pasting the whole
 *            `cloudinary://key:secret@cloud` URL into one of the three boxes.
 *   ready    all three present and structurally sound.
 */
export function readCloudinaryConfig(
  override?: Record<string, string | undefined>,
): CloudinaryConfigVerdict {
  /*
    ⚠ EVERY NAME IS READ AS A LITERAL `process.env.X`, ON PURPOSE.

    `tests/deployment.test.ts` proves that every environment variable this
    application reads is declared in the deployment contract, and it does that
    by scanning the source for `process.env.NAME`. A tidier
    `env[name]` loop over CLOUDINARY_ENV_VARS is completely invisible to that
    scan — the contract test would pass while having no idea these three exist.

    Spelling them out costs four lines and puts them back under the guarantee.
    The override parameter is what keeps the function unit-testable.
  */
  const env: Record<string, string | undefined> = override ?? {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  };

  const present = CLOUDINARY_ENV_VARS.filter((name) => (env[name] ?? '').trim() !== '');
  if (present.length === 0) return { state: 'absent' };

  if (present.length < CLOUDINARY_ENV_VARS.length) {
    return {
      state: 'partial',
      missing: CLOUDINARY_ENV_VARS.filter((name) => (env[name] ?? '').trim() === ''),
    };
  }

  const cloudName = (env.CLOUDINARY_CLOUD_NAME ?? '').trim();
  const apiKey = (env.CLOUDINARY_API_KEY ?? '').trim();
  const apiSecret = (env.CLOUDINARY_API_SECRET ?? '').trim();

  /*
    THE SHAPES BELOW EXIST TO CATCH ONE MISTAKE IN PARTICULAR.

    Cloudinary's dashboard offers a single `CLOUDINARY_URL` of the form
    `cloudinary://<api_key>:<api_secret>@<cloud_name>`, and pasting that into
    any one of these three boxes is the overwhelmingly common error. Every
    pattern below rejects a value containing `:` or `/`, so that paste fails
    here — with a sentence naming the problem — instead of at the first upload
    with an opaque 401.
  */
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(cloudName)) {
    return {
      state: 'invalid',
      reason:
        'CLOUDINARY_CLOUD_NAME is not a cloud name. It is the short account name only ' +
        '- not a URL, and not the whole cloudinary:// string.',
    };
  }

  if (!/^[0-9]{6,32}$/.test(apiKey)) {
    return {
      state: 'invalid',
      reason:
        'CLOUDINARY_API_KEY is not an API key. Cloudinary issues an all-digit key ' +
        '- not a URL, and not the whole cloudinary:// string.',
    };
  }

  // Length only, and no shape: the secret is the one value we must not make
  // assumptions about, and a wrong guess here would refuse a valid deployment.
  if (apiSecret.length < 16 || /[\s:/]/.test(apiSecret)) {
    return {
      state: 'invalid',
      reason:
        'CLOUDINARY_API_SECRET does not look like an API secret. It is a single ' +
        'opaque token with no spaces, colons or slashes.',
    };
  }

  return { state: 'ready', config: { cloudName, apiKey, apiSecret } };
}
