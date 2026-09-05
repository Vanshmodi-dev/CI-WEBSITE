# Media storage — Cloudinary

**Migrated:** 5 September 2026, from Cloudflare R2.
**Verified:** `npm run verify:storage` — 30 assertions, live round trip.

---

## What changed, and what deliberately did not

The storage **provider** changed. The media **architecture** did not.

| | Before | After |
| --- | --- | --- |
| Provider | Cloudflare R2, S3 API | Cloudinary, official SDK |
| Signing | Hand-rolled SigV4 (`sigv4.ts`) | `cloudinary` SDK |
| Interface | `MediaStore` | **`MediaStore` — unchanged** |
| Public URL | `/media/<key>` | **`/media/<key>` — unchanged** |
| Key | `<32 hex>.<ext>`, content hash | **unchanged** |
| `media_assets` | key, contentType, width, height, bytes, originalName, uploadedAt, uploadedBy | **unchanged — no migration** |
| Ingest pipeline | sniff → dimensions → re-encode → EXIF strip → hash | **unchanged** |
| Cache headers | `max-age=31536000, immutable`, `nosniff` | **unchanged** |

Everything above the `MediaStore` interface was untouched, which is what that
interface existed for. This migration is the first time the claim was tested.

## Why there is no database migration

The Cloudinary public id is a **pure function of the key we already store**:

```
key        0123456789abcdef0123456789abcdef.webp
public id  commerce-insight/0123456789abcdef0123456789abcdef
```

`publicIdFor()` in `src/lib/media/cloudinary-config.ts` is the only thing that
produces one, and it refuses anything `isMediaKey()` refuses. A `publicId`
column would have been a second copy of something derivable — and a second copy
is a thing that can disagree with the first.

The format is not part of the public id because Cloudinary stores it as its own
field; `keyFromResource()` reassembles the two for orphan reconciliation.

**Every existing `media_assets` row remains valid.** Nothing in the table
referred to R2.

## The "no user-controlled public ids" guarantee

A public id is where a storage key becomes a remote address. The whole defence
is that only a content hash can become one:

- `isMediaKey` accepts only `^[0-9a-f]{32}\.(jpg|png|webp|avif)$`
- that hash is SHA-256 of bytes **we re-encoded**, never bytes we received
- the uploaded filename is never trusted, never stored as a path, never used
- `publicIdFor()` throws rather than sanitising, and never echoes the offending
  value into the message (it reaches a log)

`tests/media-storage.test.ts` asserts this against traversal, encoded
separators, foreign prefixes, uppercase hashes, wrong lengths and empty strings.

## Deletion

`CloudinaryMediaStore.remove()` calls `uploader.destroy(publicId, { invalidate: true })`
and treats **both** `{ result: 'ok' }` and `{ result: 'not found' }` as success.
Already-gone is not an error — the reconciliation script races with
administrators by design, and a crash there would make `media:clean` unusable.

Authorization is unchanged and sits **above** the store:
`requireAdminOrNull()` in `src/app/admin/(dashboard)/media/actions.ts`. There is
no endpoint that accepts a public id from a client.

## ⚠ One real behaviour change: deletion is eventually consistent at the CDN

`get()` reads the Cloudinary delivery URL, so **a deleted photograph may still
be served for a few minutes** while the `invalidate` purge propagates. Measured,
not assumed: `verify:storage` deletes an asset and immediately gets bytes back.

- `exists()` and `list()` use the Admin API and are **immediate and authoritative**
- reconciliation (`media:audit`, `media:clean`) uses those, so it is unaffected
- `/media/<key>` already sent `max-age=31536000, immutable`, so browsers and
  CDNs were **always** entitled to keep serving a deleted photograph. R2's
  instant 404 never reached those caches either. This narrows an existing gap
  rather than opening a new one.
- consent withdrawal does not depend on it: unticking permission stops the site
  **rendering** the URL, enforced by a database CHECK constraint

The fix, if it ever stops being acceptable, is an Admin API existence check
before each fetch — one extra call on every image served, against a 500/hour
rate limit. Not worth it today; written down so the choice stays deliberate.

## Rate limits worth knowing

`exists()` is called on **every upload** (to deduplicate) and uses the Admin
API, capped at **500 calls/hour** on Cloudinary's free tier. At this institute's
volume — a handful of uploads a week — that is not a constraint. It would become
one under a bulk import of hundreds of photographs in one sitting.

## Environment

```
CLOUDINARY_CLOUD_NAME     the short account name only
CLOUDINARY_API_KEY        all digits
CLOUDINARY_API_SECRET     SECRET — server-only, never NEXT_PUBLIC_
```

**All three together, or none of them.** Two of three is refused everywhere,
including locally: a half-configured deployment that fell back to local disk
would accept uploads, display them, and lose every one at the next deploy.

The commonest mistake is pasting the whole `cloudinary://key:secret@cloud` URL
into one of the three boxes. `readCloudinaryConfig()` rejects that with a
sentence naming the problem, and `tests/media-storage.test.ts` asserts it for
each of the three slots.

`P-MEDIA-03` in the pre-flight fails the deploy if any `NEXT_PUBLIC_*` variable
contains "CLOUDINARY" — because Next inlines those into client JavaScript, and a
secret that acquires that prefix is published to every visitor and stays
published in build artefacts. Rotation is then the only remedy.

## Verifying

```bash
npm run verify:storage
```

Uploads a synthetic 1×1 PNG, confirms it exists, fetches it back, asserts the
bytes are **byte-identical** (no transformation applied), deletes it, confirms
it is gone, then exercises `CloudinaryMediaStore` itself through the same round
trip. Cleans up in `finally` whatever happens. Exits non-zero unless every step
passes. **Never prints the API secret.**

Two isolation strategies, both deliberate:

- the raw-SDK phase writes to `commerce-insight/_verify/<run id>`, and
  `keyFromResource()` rejects nested paths so `media:clean` can never see it
- the store phase uses a key derived from the SHA-256 of synthetic bytes, so it
  can only collide with a real photograph that is byte-identical to a 1×1 PNG.
  It is not a naming convention that keeps these apart — it is the hash.

## What was removed

`src/lib/media/s3.ts`, `src/lib/media/s3-config.ts`, `src/lib/media/sigv4.ts`,
`tests/sigv4.test.ts`, `scripts/mock-s3.mjs`, and the five `MEDIA_S3_*` entries
in the deployment contract and `.env.example`.

There was never an `@aws-sdk` dependency to remove — `sigv4.ts` implemented AWS
Signature V4 by hand over `node:crypto` precisely to avoid one. Cloudinary's SDK
is the first storage dependency this project has ever had; it brings exactly one
transitive package (`lodash`).

`tests/deployment.test.ts` asserts the retired names stay out of the contract,
so this cannot quietly regress.

---

# Storage usage monitor

**Added:** 5 September 2026 · **Location:** Admin → Media → **Storage usage**
(`/admin/media/storage`) · **Admin only.**

## The one rule this screen follows

**Every number names its source, and a number with no trustworthy source is not
shown.** The screen exists to be trusted; its failure mode is not a crash but a
plausible figure nobody can account for.

## Two sections, two sources, never blended

| | This website's photos | Cloudinary account |
| --- | --- | --- |
| **Source** | `media_assets` aggregation | Cloudinary Admin API `api.usage()` |
| **Scope** | What this site uploaded | The whole account |
| **Freshness** | Live, to the second | Aggregated **daily** by Cloudinary |
| **Shows** | Space used, photos stored, largest photo, last upload | Plan, monthly credits, account storage, bandwidth, asset count |

They will not match. That is correct: the account is account-wide and a day
behind, and the screen says so on the page rather than in a comment.

## ⚠ Why there is no "storage remaining"

Cloudinary's free plan meters **one pool of credits** that storage, bandwidth
and transformations all draw from. `api.usage()` reports `credits.limit` (25)
and publishes **no storage-only allowance anywhere**.

So 25 credits cannot be converted into gigabytes, and any bar built on that
conversion would be invented. The page therefore shows:

- a **progress bar for credits**, which have a real published limit, and
- **"Storage remaining: not available"**, with the reason, for storage.

`usageStatus()` returns `unknown` — not `healthy` — when no credit figure
exists, so an unmeasured account never shows a green tick.

## What is cached, and what happens when the provider fails

Provider figures are cached **in process for 10 minutes**
(`PROVIDER_CACHE_TTL_MS`). The Admin API allows 500 calls/hour on the free tier
and the same budget is spent by `exists()` on every upload, so a `force-dynamic`
page must not call it per render.

- **Refresh usage** bypasses the cache. It is admin-only and bounded to
  **5 refreshes/minute per administrator**, server-side — the button's
  `disabled` state is a courtesy, not a control.
- If Cloudinary is unreachable, the page keeps rendering the **last known
  figures** under a notice saying so, with the time they were fetched.
- If credentials are absent, the section explains that rather than showing zeros.
- A provider failure **never** takes out the page. Storage monitoring is
  observability, not a dependency of anything.

The cache is per process, so on a serverless host each instance keeps its own
copy and "last checked" may differ between them. Accepted: the underlying
figures are already a day old, and the alternative is a schema change.

## Security

- `cloudinary-usage.ts` and `storage-usage.ts` are `import 'server-only'` —
  importing either from a client component is a **build error**.
- `CLOUDINARY_API_SECRET` is not `NEXT_PUBLIC_`-prefixed, so Next can never
  inline it into client JavaScript. `P-MEDIA-03` in the pre-flight fails the
  deploy if any `NEXT_PUBLIC_*` variable contains "CLOUDINARY".
- What crosses to the browser is the parsed `ProviderUsage` type: plan name,
  credit counts, byte counts, dates. It has **no field** for a cloud name, API
  key or secret, and a test asserts a payload carrying those cannot leak them
  through it.
- The refresh Server Action **takes no parameters**. There is nothing a client
  can pass to steer which Cloudinary resource is queried.
- The page and the action both re-authenticate via `requireAdmin()` /
  `requireAdminOrNull()`; `tests/deployment.test.ts` fails the build if any
  exported Server Action skips that.

## Where the allowance comes from

From Cloudinary itself (`credits.limit`), on every fetch. **No allowance is
hardcoded and none is configurable**, deliberately — a hand-maintained limit is
a number that silently goes stale when the plan changes. If Cloudinary stops
reporting a limit, the bar disappears and the page says the allowance is
unknown.

## Verifying it

- `node --test tests/storage-usage.test.ts` — 27 assertions on the pure layer:
  byte formatting, zero-vs-unknown, `NaN`/`Infinity` guards, partial provider
  payloads, and that no credential can travel through the parsed shape.
- `npm run verify:admin-ux` — the route is in `SUBPAGES`, so it is swept for
  touch targets, heading order, labels and overflow at 320/360/390/768/1280 px.
- `npm run verify:storage` — the live Cloudinary round trip, unchanged.
