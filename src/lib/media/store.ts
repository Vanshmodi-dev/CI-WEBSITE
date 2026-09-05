import 'server-only';

import { mkdir, readFile, writeFile, unlink, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isMediaKey } from './format.ts';
import { CloudinaryMediaStore } from './cloudinary.ts';
import { readCloudinaryConfig } from './cloudinary-config.ts';

/**
 * Where uploaded images live.
 *
 * =============================================================================
 * THE STORAGE BOUNDARY IS EXPLICIT BECAUSE PRODUCTION STORAGE DOES NOT EXIST
 * =============================================================================
 * `docs/COST-AND-INFRASTRUCTURE.md` records the deployment target as Vercel,
 * whose filesystem is EPHEMERAL, and names Vercel Blob as the recommended photo
 * storage — recommended, not provisioned. There are no credentials, and this
 * phase does not invent any.
 *
 * Writing a local-filesystem implementation and calling it done would be the
 * exact failure the brief names: it works on this laptop and silently loses
 * every photograph on the first deploy. So the local implementation exists, is
 * labelled development-only, and the production path REFUSES TO START rather
 * than pretending.
 *
 * Everything valuable in this topic — sniffing, re-encoding, limits,
 * authorisation, consent, caching, deletion semantics — sits ABOVE this
 * interface and does not change when a real adapter arrives. Adding one is
 * implementing three methods.
 *
 * =============================================================================
 * WHY NOT `public/`
 * =============================================================================
 * `public/` is a BUILD-TIME directory. Writing to it at runtime appears to work
 * under `next start` and does nothing at all on a serverless host, which is the
 * worst combination: it passes local testing and fails in production. Files go
 * outside it, and are served by a route handler that can apply headers and
 * refuse unknown keys.
 */

export type StoredObject = {
  bytes: Buffer;
  contentType: string;
};

export interface MediaStore {
  /** Write bytes under a key we generated. Overwriting the same key is a no-op
   *  by content: the key IS the hash, so identical bytes deduplicate. */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  /**
   * Is this object already stored?
   *
   * Separate from `get` because on remote storage they cost very different
   * things. The upload path asks this question on every single upload to
   * deduplicate, and answering it with a full `get()` means downloading an
   * entire photograph to learn that it is already there. A HEAD is one cheap
   * request and the same answer.
   */
  exists(key: string): Promise<boolean>;
  /** Idempotent: deleting something already gone is a success, not an error. */
  remove(key: string): Promise<void>;
  /** Every key currently held. Used by the reconciliation script only. */
  list(): Promise<string[]>;
  /**
   * When this object was written, or null if it is not there.
   *
   * Exists for ONE reason: the reconciliation script must not delete an object
   * that is mid-upload. An upload writes the object and then the database row,
   * so between those two steps a perfectly good photograph looks exactly like
   * an orphan. Without an age there is no way to tell the difference, and
   * `media:clean` running at the wrong moment would delete a photograph the
   * teacher had just successfully uploaded.
   */
  lastModified(key: string): Promise<Date | null>;
  /** For diagnostics and the preflight check. */
  describe(): string;
}

/* ------------------------------------------------------------ local disk -- */

/**
 * Development storage.
 *
 * Deliberately NOT under `public/` and NOT under `.next/`, so a build cannot
 * publish it and `next build` cannot wipe it.
 */
const LOCAL_ROOT = path.join(process.cwd(), '.media-store');

class LocalDiskStore implements MediaStore {
  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    assertKey(key);
    await mkdir(LOCAL_ROOT, { recursive: true });
    await writeFile(this.fileFor(key), bytes);
    await writeFile(this.metaFor(key), JSON.stringify({ contentType }), 'utf8');
  }

  async get(key: string): Promise<StoredObject | null> {
    assertKey(key);
    try {
      const bytes = await readFile(this.fileFor(key));
      let contentType = 'application/octet-stream';
      try {
        const meta = JSON.parse(await readFile(this.metaFor(key), 'utf8')) as {
          contentType?: unknown;
        };
        if (typeof meta.contentType === 'string') contentType = meta.contentType;
      } catch {
        /* Missing sidecar: fall through with the safe default. */
      }
      return { bytes, contentType };
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertKey(key);
    try {
      await stat(this.fileFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async lastModified(key: string): Promise<Date | null> {
    assertKey(key);
    try {
      return (await stat(this.fileFor(key))).mtime;
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    assertKey(key);
    // Idempotent on purpose: deletion is retried by the reconciliation script,
    // and a second attempt must not turn a cleaned-up file into an error.
    await unlink(this.fileFor(key)).catch(() => {});
    await unlink(this.metaFor(key)).catch(() => {});
  }

  async list(): Promise<string[]> {
    try {
      const entries = await readdir(LOCAL_ROOT);
      return entries.filter((e) => isMediaKey(e));
    } catch {
      return [];
    }
  }

  describe(): string {
    return `local disk (${LOCAL_ROOT}) — DEVELOPMENT ONLY, not durable in production`;
  }

  /**
   * ⚠ THE ONLY PLACE A KEY BECOMES A PATH.
   *
   * `assertKey` has already refused anything not matching `^[0-9a-f]{32}\.ext$`,
   * so there is no separator, no dot-dot and no drive letter left to join. The
   * `basename` is belt and braces: if the pattern above is ever loosened by
   * somebody who has not read this, the join still cannot escape the root.
   */
  private fileFor(key: string): string {
    return path.join(LOCAL_ROOT, path.basename(key));
  }

  private metaFor(key: string): string {
    return path.join(LOCAL_ROOT, `${path.basename(key)}.json`);
  }
}

/* ---------------------------------------------------------- unavailable -- */

/**
 * The production stand-in. Every method refuses, loudly.
 *
 * This is not a stub to be filled in later and forgotten — it is the thing that
 * makes "media storage is not provisioned" impossible to miss, because the
 * first upload attempt says so in words rather than throwing a type error deep
 * inside a write.
 */
class UnconfiguredStore implements MediaStore {
  private fail(): never {
    throw new Error(
      'MEDIA STORAGE IS NOT CONFIGURED FOR PRODUCTION. ' +
        'The deployment target has an ephemeral filesystem, so uploads would be ' +
        'lost on the next deploy. Provision object storage (Vercel Blob is the ' +
        'documented recommendation in docs/COST-AND-INFRASTRUCTURE.md) and ' +
        'implement a MediaStore adapter for it.',
    );
  }
  async put(): Promise<void> { this.fail(); }
  async get(): Promise<StoredObject | null> { this.fail(); }
  async exists(): Promise<boolean> { this.fail(); }
  async lastModified(): Promise<Date | null> { this.fail(); }
  async remove(): Promise<void> { this.fail(); }
  async list(): Promise<string[]> { this.fail(); }
  describe(): string {
    return 'NOT CONFIGURED — production media storage has not been provisioned';
  }
}

/* ---------------------------------------------------------------- entry -- */

function assertKey(key: string): void {
  if (!isMediaKey(key)) {
    // Never echo the offending value into the message: it is attacker-supplied
    // and this string reaches a log.
    throw new Error('Refused a storage key this application did not issue.');
  }
}

/**
 * Is durable storage available?
 *
 * Read by the pre-flight check, by the admin media banner, and by the store
 * selection below. Until Phase 17 this returned a hard `false`, because there
 * was no production adapter to be ready.
 */
export function mediaStorageIsProductionReady(): boolean {
  return readCloudinaryConfig().state === 'ready';
}

/**
 * Is this process running on a host whose disk is thrown away?
 *
 * ⚠ NOT `NODE_ENV === 'production'`. That was the first implementation and it
 * was wrong in a way only testing found: `next start` sets NODE_ENV to
 * production, so running a production BUILD on a laptop — which is exactly how
 * this project is verified — selected the refusing adapter and every legitimate
 * upload failed. "Production build" and "deployed to an ephemeral host" are
 * different questions and only the second one matters here.
 *
 * The platform variables below are set by the hosts themselves. A VPS, a
 * container with a mounted volume, or a developer's machine sets none of them
 * and keeps its disk, so local storage is genuinely correct there.
 */
function hostDiscardsItsDisk(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY ||
      process.env.CF_PAGES,
  );
}

/**
 * The store that refuses because the configuration is half-finished.
 *
 * ⚠ THIS IS THE MOST IMPORTANT BRANCH IN THIS FILE.
 *
 * A deployment with three of the four storage secrets set is overwhelmingly
 * likely to be a mistake in progress, not a decision. Falling back to local
 * disk there would APPEAR to work — uploads succeed, photographs display — and
 * then lose every one of them at the next deploy. That is precisely the failure
 * Topic 5 refused to ship, and it would be worse arriving by accident.
 *
 * So a partial or malformed configuration is an error EVERYWHERE, including on
 * a developer's machine, where it is a typo worth hearing about immediately.
 */
class MisconfiguredStore implements MediaStore {
  // A plain field, not a parameter property - the test runner strips types
  // rather than compiling, and cannot emit the implicit assignment.
  private readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }
  private fail(): never {
    throw new Error(
      `MEDIA STORAGE IS MISCONFIGURED: ${this.reason} ` +
        'Refusing to fall back to local disk, which would lose every photograph ' +
        'on the next deploy. Fix the configuration or unset the storage variables entirely.',
    );
  }
  async put(): Promise<void> { this.fail(); }
  async get(): Promise<StoredObject | null> { this.fail(); }
  async exists(): Promise<boolean> { this.fail(); }
  async lastModified(): Promise<Date | null> { this.fail(); }
  async remove(): Promise<void> { this.fail(); }
  async list(): Promise<string[]> { this.fail(); }
  describe(): string {
    return `MISCONFIGURED — ${this.reason}`;
  }
}

let store: MediaStore | null = null;

/**
 * Choose the store, once.
 *
 * The order of these branches is the whole safety argument:
 *
 *   1. half-configured  -> refuse, loudly. Never a fallback.
 *   2. fully configured -> the real thing, wherever we are running. This is
 *                          what lets the production path be exercised locally.
 *   3. nothing set, host keeps its disk    -> local disk. A developer.
 *   4. nothing set, host discards its disk -> refuse. A deploy with no storage.
 */
export function getMediaStore(): MediaStore {
  if (store) return store;

  const verdict = readCloudinaryConfig();

  if (verdict.state === 'partial') {
    store = new MisconfiguredStore(
      `these variables are missing: ${verdict.missing.join(', ')}.`,
    );
  } else if (verdict.state === 'invalid') {
    store = new MisconfiguredStore(verdict.reason);
  } else if (verdict.state === 'ready') {
    store = new CloudinaryMediaStore(verdict.config);
  } else if (hostDiscardsItsDisk()) {
    /*
      On an ephemeral host the local adapter is NOT offered, even though it
      would appear to work for the length of one deploy. A photograph that
      uploads successfully, displays correctly, and vanishes at the next deploy
      is worse than an upload that refuses outright: the first loses data
      quietly, and nobody finds out until a parent asks where their child's
      photo went.
    */
    store = new UnconfiguredStore();
  } else {
    store = new LocalDiskStore();
  }

  return store;
}

/** What the pre-flight check and the admin banner report. */
export function describeMediaStorage(): {
  durable: boolean;
  ephemeralHost: boolean;
  description: string;
} {
  return {
    durable: mediaStorageIsProductionReady(),
    ephemeralHost: hostDiscardsItsDisk(),
    description: getMediaStore().describe(),
  };
}

/** Test seam. */
export function resetMediaStore(): void {
  store = null;
}

/** Where the local store keeps its files. Used by the reconciliation script. */
export const LOCAL_MEDIA_ROOT = LOCAL_ROOT;

/** Bytes currently held, for diagnostics. Never throws. */
export async function localStoreSize(): Promise<{ files: number; bytes: number }> {
  try {
    const entries = await readdir(LOCAL_ROOT);
    let bytes = 0;
    let files = 0;
    for (const entry of entries) {
      if (!isMediaKey(entry)) continue;
      files += 1;
      bytes += (await stat(path.join(LOCAL_ROOT, entry))).size;
    }
    return { files, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}
