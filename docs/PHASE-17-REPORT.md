# Phase 17 — Production infrastructure and real media storage

Date: 28 August 2026
Launch switch: **OFF** (`SITE_IS_LAUNCHED = false`)
Schema changes: **none**
New dependencies: **none**

---

## 1. Initial inventory

Everything below was read from source before any code was written. The previous
reports were treated as claims.

### The media system as found

| Concern | Where | State |
| --- | --- | --- |
| Storage abstraction | `src/lib/media/store.ts` | `MediaStore` interface: `put` / `get` / `remove` / `list` / `describe` |
| Local adapter | same | `LocalDiskStore` → `.media-store/`, outside `public/` and `.next/` |
| Production adapter | same | `UnconfiguredStore` — every method throws, deliberately |
| Readiness flag | same | `mediaStorageIsProductionReady()` returned a hard `false` |
| Upload pipeline | `src/lib/media/ingest.ts` | sniff → decode → dimension check → re-encode → hash → store |
| Format rules | `src/lib/media/format.ts` | jpeg/png/webp/avif; `MEDIA_KEY_PATTERN = ^[0-9a-f]{32}\.(jpg\|png\|webp\|avif)$` |
| Key generation | `ingest.ts:199` | `sha256(re-encoded OUTPUT).slice(0,32)` — content-addressed |
| Database model | `prisma/schema.prisma` `MediaAsset` | **metadata only** — key, contentType, width, height, bytes, originalName, uploader |
| Public serving | `src/app/media/[key]/route.ts` | Route handler, `nosniff`, 1-year immutable, `default-src 'none'; sandbox` |
| Upload action | `admin/(dashboard)/media/actions.ts` | auth + rate limit + one-file-only + audit + revalidate |
| Admin picker | `src/components/admin/media-field.tsx` | two `<input type="file">`, one with `capture="environment"` |
| Orphan tooling | `scripts/media-audit.mjs` | reports orphans / missing / broken refs; `--clean` |
| Media suite | `scripts/verify-media.mjs` | 112 assertions across 13 sections |
| CSP | `next.config.ts` / `src/proxy.ts` | `img-src 'self' data: blob: https://i.ytimg.com` |
| Image optimisation | `next.config.ts` | AVIF/WebP, 4 device sizes, 1-week TTL, `remotePatterns` = ytimg only |

### What the inventory established

- **No image bytes are in PostgreSQL** and never were. Step 3 was already
  satisfied; nothing needed changing.
- The content-addressed design is sound: the key is the hash of the
  **re-encoded output**, not of the upload, so identical pictures deduplicate
  and a different picture is always a different URL.
- Because media is proxied through `/media/[key]` on our own origin, moving to
  object storage needs **no CSP change and no `remotePatterns` change**.
- `MEDIA_S3_*` did not exist. The deployment contract declared 11 variables,
  none about storage.
- **There was no pre-flight check for media storage at all.** `store.ts`
  carried a comment saying `describeMediaStorage()` existed "so the pre-flight
  check and the admin can report the truth" — and nothing called it. Storage
  readiness was a human checklist item.
- `describeMediaStorage()`, `localStoreSize()` and `LOCAL_MEDIA_ROOT` were dead
  exports.
- I initially suspected `mediaStorageIsProductionReady()` was dead too. **That
  was wrong** — the admin media page calls it. Checked before recording.

---

## 2. Provider comparison

Pricing verified against each provider's own documentation on 28 August 2026,
not recalled.

### FREE (sufficient for this institute)

| | Cloudflare R2 | Backblaze B2 |
| --- | --- | --- |
| Free storage | 10 GB-month | 10 GB, permanent |
| Free operations | 1M Class A (writes) + 10M Class B (reads) / month | generous |
| Egress | **$0, unmetered** | Free to 3× stored/month; **unmetered free via Cloudflare CDN** |
| S3-compatible | Yes | Yes |
| Private objects | Yes | Yes |
| Lifecycle rules | Yes | Yes |
| India availability | Global, automatic placement | Global |
| Card required | **Yes, even for the free tier** | Yes |
| Lock-in | Low | Low |

### LOW-COST (beyond the free tier)

| | R2 | B2 | AWS S3 |
| --- | --- | --- | --- |
| Storage /GB-month | $0.015 | ~$0.006 | ~$0.023 |
| Class A / million | $4.50 | cheap | metered |
| Class B / million | $0.36 | cheap | metered |
| Egress | **free** | $0.01/GB over 3× | **charged** |

### REJECTED

**Vercel Blob** — the incumbent recommendation in this project's own cost
document, and rejected on two findings from its documentation:

1. **It is not S3-compatible.** It has a proprietary SDK (`put`, `head`, `list`,
   `del`). That is maximum lock-in for the one category of data here that
   cannot be regenerated.
2. **Its Hobby tier does not degrade — it cuts off.** The documentation is
   explicit: exceed the limits and "you will not be able to access Vercel Blob…
   you will have to wait until 30 days have passed." Student photographs
   becoming unreachable for up to a month is not an acceptable failure mode.

Its private-delivery path — which is what this architecture uses — is also
documented as the more expensive one.

**AWS S3** — charges egress. That is precisely the cost that turns a ₹0 bill
into a real one with no warning when a gallery page gets shared, and designing
it out is the whole point.

**Supabase Storage** — metered egress, proprietary SDK, and no advantage here.

### Recommendation

**Cloudflare R2**, accessed through an S3-compatible adapter.

Two things decide it: free unmetered egress removes the only cost that can
surprise a small institute, and the S3 API means the provider is a
configuration value rather than an architecture. If R2 ever becomes a bad
choice, moving to B2, Wasabi, MinIO or S3 is a credential change.

**STATUS: HUMAN ACTION REQUIRED.** No account was opened, no bucket created and
no credential invented.

---

## 3. Final architecture

```
admin upload
   ↓  auth · rate limit · one file only
ingestImage()                          unchanged from Topic 5
   ↓  declared type → magic bytes → dimensions → sharp re-encode → EXIF dropped
   ↓  key = sha256(output)[0:32] + ext
MediaStore.exists(key)                 HEAD — was a full GET
   ↓  miss
MediaStore.put(key, bytes, type)       ← S3MediaStore, signed SigV4
   ↓
MediaAsset row (metadata only)
   ↓
/media/[key]  →  MediaStore.get()  →  visitor
```

`MediaStore` now has four implementations, and which one is chosen is the whole
safety argument:

| Implementation | Chosen when |
| --- | --- |
| `S3MediaStore` | all four `MEDIA_S3_*` set |
| `MisconfiguredStore` | **some** set — refuses everywhere, never falls back |
| `LocalDiskStore` | none set, host keeps its filesystem (a developer) |
| `UnconfiguredStore` | none set, host discards its filesystem (a deploy with no storage) |

### No SDK

`@aws-sdk/client-s3` was rejected: dozens of transitive packages, paid for on
every serverless cold start, to sign four kinds of request. SigV4 is a
documented algorithm over `node:crypto`, which ships with the runtime.
`src/lib/media/sigv4.ts` is ~60 lines and adds **zero dependencies**.

`package.json` dependencies are unchanged: `@prisma/adapter-pg`,
`@prisma/client`, `clsx`, `next`, `react`, `react-dom`, `server-only`, `sharp`,
`tailwind-merge`.

---

## 4. Cost estimate

Photographs are re-encoded to a 1920px longest edge, ≈300 KB each.

| | Free allowance | Realistic use |
| --- | --- | --- |
| Storage | 10 GB | ~30,000 photographs would fit; a few hundred is plausible |
| Writes | 1M/month | a handful a week |
| Reads | 10M/month | rare — `/media/[key]` is one-year immutable and sits behind Next's image cache |
| Egress | unmetered | — |

**Expected recurring cost: ₹0**, with roughly two orders of magnitude of
headroom on every axis. **PASS.**

---

## 5. Storage interface

```ts
interface MediaStore {
  put(key, bytes, contentType): Promise<void>
  get(key): Promise<StoredObject | null>
  exists(key): Promise<boolean>          // added
  lastModified(key): Promise<Date | null> // added
  remove(key): Promise<void>
  list(): Promise<string[]>
  describe(): string
}
```

Two methods were added, each for a concrete reason rather than for completeness:

- **`exists`** — deduplication asked "is this already stored?" with a full
  `get()`. Free on local disk; on remote storage it downloads an entire
  photograph to answer a yes/no, on every duplicate upload. Now one HEAD.
- **`lastModified`** — the reconciliation script cannot otherwise tell an orphan
  from an upload in flight. See §10.

Nothing above the interface knows which implementation it has.

---

## 6. Media lifecycle

| Event | Behaviour |
| --- | --- |
| Upload | object written **first**, `MediaAsset` row second |
| Duplicate upload | `exists()` hit → no write, row kept, "already on the site, reused" |
| Replace | different bytes → different hash → **different URL**. Old object untouched and still valid |
| Record unpublished | photograph keeps its URL; the page simply stops emitting it |
| Consent withdrawn | `present()` returns `photoUrl: null`; the gallery has a **CHECK constraint** making the published+no-consent state unrepresentable |
| Record deleted | object **not** deleted — the bytes may be shared, and the media library refuses to delete anything still referenced |
| Admin deletes media | row **first**, object second |
| Object exists, row missing | ORPHAN — invisible, costs storage, reclaimed by `media:clean` |
| Row exists, object missing | MISSING FILE — reported, **never auto-deleted**; the row is the last evidence of what was lost |
| Record points at nothing | BROKEN REFERENCE — reported; fixing it is an editorial decision, not a script's |

### Why both orders favour orphans

There is no transaction spanning PostgreSQL and object storage, so one half can
fail. Both orderings were chosen so the surviving failure is an **orphan** and
never a **broken reference**: an orphan is invisible and recoverable, a broken
reference is a broken image on a live page and is neither.

- Upload fails after the object is written → orphan. The action reports *"that
  photo was processed but could not be recorded"* — it does **not** claim
  success.
- Delete fails after the row is gone → orphan.

**No distributed transaction was invented.** The asymmetry is the design.

---

## 7. Security model

Everything Topic 5 established is preserved. **Nothing below was weakened.**

| Control | Status |
| --- | --- |
| Authentication on upload | PASS — `requireAdminOrNull()` |
| Authorisation on delete | PASS |
| CSRF | PASS — Next's action Origin/Host check |
| Byte-based validation (magic bytes before any decoder) | PASS |
| SVG rejected | PASS |
| Executable / polyglot rejected | PASS |
| Pixel-bomb protection | PASS — dimensions read from metadata before pixel work |
| EXIF/GPS stripped by re-encoding | PASS |
| Maximum upload size | PASS — 6 MB, with a message a person can act on |
| Uploader's filename never determines the path | PASS — key is a hash of our output |
| Browser MIME type never trusted | PASS |
| Extension never decides safety | PASS |
| Rate limiting | PASS — verified firing at 41 attempts |
| Audit logging | PASS — shape only, never content |
| Consent rules | PASS — enforced by CHECK constraint, not by the form |
| Stale-edit protection | PASS |
| Cache-safe replacement | PASS — content addressing makes it structural |
| Safe object key generation | PASS |

### New surface, and how it is guarded

The S3 adapter is the only new attack surface. Every method calls `assertKey()`
first, so `isMediaKey` refuses anything with a separator, `..`, a null byte, an
encoded escape or a drive letter **before a request URL is built**. Verified: 11
hostile keys, each refused with **zero requests sent**, plus a positive control
proving a well-formed key still works.

**CSP unchanged.** Because media is proxied on our own origin, `img-src` stays
`'self'` — a public bucket would have required adding a third-party host.

---

## 8. Consent behaviour

The architecture question in Step 6 was answered by the existing consent model
rather than by convenience.

**Chosen: B — application media proxy.** It was already the design; Phase 17
confirms it is the right one for object storage and keeps it.

| Option | Why not |
| --- | --- |
| A — public immutable objects | Requires a public bucket, adds a third-party host to `img-src`, and puts photographs on a URL this application can no longer control |
| C — signed URLs | Defeats `next/image` optimisation and CDN caching for **every** legitimate photograph, to defend against somebody who already has a 128-bit content hash — at which point they have the photograph anyway |
| D — bytes in Postgres | Explicitly out of scope, and wrong |

**The bucket is private.** Objects are reachable only through `/media/[key]`.

The protection that matters is not URL secrecy: it is that a photograph without
consent **never receives a published URL**. `present()` returns `photoUrl: null`
unless `consentPhoto` is true, and the gallery's published-requires-consent
CHECK constraint makes the bad state unrepresentable at the database level.

Verified by `verify-media` (112) and `verify-public-isolation` (46): published +
consent → visible; unpublished → absent; consent withdrawn → absent; unsafe path
→ 404; deleted object → 404; replacement → new identity, old URL still serves
old bytes.

---

## 9. Failure handling

`npm run verify:storage` — **49 assertions, 0 failed** — against a mock S3
service that refuses any request without a well-formed SigV4 header, so a
suite that stopped signing would fail rather than pass against a permissive stub.

| Failure | Behaviour | Status |
| --- | --- | --- |
| Credentials missing entirely | ABSENT → local disk (developer) or refusal (ephemeral host) | PASS |
| Credentials **partially** set | `MisconfiguredStore` — refuses everywhere | PASS |
| Invalid credentials (403) | upload throws; nothing stored; secret not in the message | PASS |
| Bucket missing (404) | upload throws; nothing stored | PASS |
| Service failing (500) | upload throws; nothing stored | PASS |
| Network unreachable | upload throws | PASS |
| Hung service | 20-second `AbortSignal.timeout` | PASS |
| Object already exists | dedupe, one HEAD, no re-upload | PASS |
| Duplicate upload | row kept, honest "already on the site" message | PASS |
| Delete of absent object | idempotent success | PASS |
| DB write fails after upload | orphan; **"processed but could not be recorded"**, never "uploaded successfully" | PASS |
| Object missing, row present | reported as MISSING FILE; row preserved | PASS |
| Oversized / malformed / wrong type | refused before storage is touched | PASS |

**The application never claims "uploaded successfully" when the object was not
stored.** The store call precedes the row write, and any throw from it becomes a
refusal message.

---

## 10. Orphan handling

`npm run media:audit` / `media:clean`.

Two defects were found here and both are fixed — see §16.

Safety properties, all now true:

- **Never deletes referenced media** — only objects with no `MediaAsset` row.
- **Never deletes recently uploaded media.** A one-hour grace period, using the
  new `lastModified()`. An object whose age cannot be determined is **kept and
  reported**, not deleted.
- **Never deletes a MISSING FILE row** — the row is the only remaining evidence.
- **Never "fixes" a broken reference** — that is an editorial decision.
- Report-only by default; `--clean` is explicit.
- Works against whichever store is configured.

Demonstrated live: with 9 orphans in the bucket, `--clean` kept all 9 and
reported *"uploaded too recently to be sure it is an orphan"*.

---

## 11. Admin UX behaviour

Audited, not changed — the existing implementation is already standards-based.

`media-field.tsx` renders **two** file inputs rather than one with a toggled
attribute:

```
accept="image/jpeg,image/png,image/webp,image/avif"
accept="…" capture="environment"
```

- **Phone** — the plain input opens the OS photo picker; the `capture` input
  asks the OS to open the camera.
- **Desktop** — `capture` is ignored by desktop browsers rather than erroring,
  so the ordinary file picker opens.
- **No fake camera UI.** There is no custom camera implementation and there
  should not be.

Verified: accept types, cancel, replacement, removal, upload failure, oversized
file, invalid image, accessibility (24×24 targets, labels, focus) — all covered
by `verify-media` and `verify-ux`.

**NOT TESTED:** real camera and gallery behaviour on a physical phone. This
environment has no device. Manual verification required: on Android Chrome and
iOS Safari, confirm that "Take Photo" opens the camera and that the gallery
option opens the photo picker.

One change was made to this page: the storage banner now names where photographs
are actually going, using `describeMediaStorage()` — which had been written in
Topic 5 with a comment claiming the admin used it, and then called by nothing.

---

## 12. Environment variables

| Variable | Secret | Required | Purpose |
| --- | --- | --- | --- |
| `MEDIA_S3_ENDPOINT` | no | as a group | Service address. **No bucket, no path** |
| `MEDIA_S3_BUCKET` | no | as a group | Private bucket name |
| `MEDIA_S3_ACCESS_KEY_ID` | **yes** | as a group | Token id, scoped to one bucket |
| `MEDIA_S3_SECRET_ACCESS_KEY` | **yes** | as a group | Signs every request; never transmitted |
| `MEDIA_S3_REGION` | no | optional | Defaults to `auto` (R2). AWS needs its own |

**All four together or none.** Three of four is refused at runtime and fails
`P-MEDIA-01`.

### Secret audit — Step 9

| Check | Result |
| --- | --- |
| Secret in source | **PASS** — none |
| Secret in git history | **PASS** — `git log --all -S` finds no occurrence |
| Secret in client bundles | **PASS** — 38 chunks scanned, 0 mention `MEDIA_S3` or the test secret; positive control ("Commerce Insight") found in 2, so the scan is not vacuous |
| Secret in error messages | **PASS** — asserted in `verify-storage` and unit tests |
| Secret in logs | **PASS** — errors name operation and HTTP status only |
| `NEXT_PUBLIC_` contains credentials | **PASS** — only `NEXT_PUBLIC_SITE_URL` exists |
| `.env.local` ignored | **PASS** |
| Contract declares every variable | **PASS** — plus a new test asserting it |

---

## 13. Deployment contract changes

- Five variables added to `ENV_CONTRACT` with purpose and remediation.
- **Five new pre-flight checks**, all mechanical:

| Check | What it decides |
| --- | --- |
| `P-MEDIA-01` | configuration is complete or absent, never partial |
| `P-MEDIA-02` | an ephemeral host has durable storage |
| `P-MEDIA-03` | storage is not on a disk this host will discard |
| `P-MEDIA-04` | the endpoint is safe to send credentials to (https, no embedded credential) |
| `P-MEDIA-05` | **NOT TESTED**, honestly — credentials cannot be verified without a live call |

Negative controls were run: three-of-four secrets → `P-MEDIA-01` **FAIL**;
ephemeral host with no storage → `P-MEDIA-02` **FAIL**; loopback endpoint on an
ephemeral host → `P-MEDIA-03` **FAIL**. The checks are real, not decorative.

`P-MEDIA-05` reports NOT TESTED rather than guessing. A pre-flight check that
claimed to have verified a bucket it never contacted would be worse than none.

- `docs/DEPLOYMENT-RUNBOOK.md` — new **Step 4b**, and the backup section now
  records that **`pg_dump` does not back up photographs**.
- `docs/DEPLOYMENT-HUMAN-CHECKLIST.md` — new M1–M8 section.
- `docs/COST-AND-INFRASTRUCTURE.md` — verified pricing, the Vercel Blob
  rejection, and the corrected description of what exists.

---

## 14. Tests performed

| Suite | Result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm test` | **536 passed, 0 failed** (was 505; +31) |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| `verify:storage` **(new)** | **49 / 0** |
| `verify:seo` | 418 / 0 |
| `verify:ux` | 333 / 0 |
| `verify:admin` | 298 / 0 |
| `verify:security` | 262 / 0 |
| `verify:videos` | 232 / 0 |
| `verify:reviews` | 224 / 0 |
| `verify:gallery` | 208 / 0 |
| `verify:map` | 142 / 0 |
| `verify:faculty` | 132 / 0 |
| `verify:teacher` | 123 / 0 |
| `verify:import` | 116 / 0 |
| `verify:media` | **112 / 0 — run entirely against object storage** |
| `verify:cms` | 89 / 0 |
| `verify:integration` | 67 / 0 |
| `verify:e2e` | 62 / 0 |
| `verify:public` | 46 / 0 |
| `verify:constraints` | 43 / 0 |
| `verify:revalidation` | 10 / 0 |
| `verify:production --expect-prelaunch` | 25 / 0 |
| `verify:budget` | 101 / **3** — the same three pre-existing route counts, unchanged |
| `verify:preflight` | **1 failure: `P-DB-12`, demo data present — the gate working** |

**The whole regression was run with `MEDIA_S3_*` active**, i.e. in the
production-like configuration, against a freshly built server.

### The end-to-end proof (Step 11)

`verify:media`'s 112 assertions — upload, validate, decode, re-encode, store,
database row, revalidate, logged-out visitor, replace, consent withdrawal,
delete, cleanup — were run with the application pointed at object storage.

That it was **not** vacuous was checked directly:

```
local .media-store files : 0
objects in the bucket    : 9
```

Nothing touched local disk. Every photograph went to the store through the S3
adapter.

Covered entities: results/toppers, stories, faculty, gallery. Videos hold a
YouTube id and no media object; batches, announcements and enquiries hold none.

### SigV4 correctness

`tests/sigv4.test.ts` checks the signing key derivation against the worked
example published in **AWS's own Signature Version 4 documentation**
(`wJalrXUtnFEMI/…`, `20150830`, `us-east-1`, `iam` →
`c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9`). That is an
external fact this project cannot accidentally satisfy — a mock that recomputed
the signature with the same code would have agreed with a wrong implementation.

---

## 15. Tests not possible

| Item | Why | What must happen later |
| --- | --- | --- |
| **Interoperability with a real provider** | No credentials exist and none were invented. The mock validates request shape; it cannot prove Cloudflare accepts our signature | Upload one photograph after deployment (checklist M7) |
| **Camera / gallery on a real phone** | No device in this environment | Manual pass on Android Chrome and iOS Safari |
| Screen readers | None available | Manual NVDA / VoiceOver pass |
| Firefox / Safari / WebKit | Not installed | Cross-browser pass |
| Live Review Engine | Disabled for this client | Enable and re-run `verify:reviews` |

---

## 16. Defects found

### D-1 · The orphan tooling would not have worked with object storage · **HIGH**

`scripts/media-audit.mjs` read a hard-coded `.media-store` directory with
`readdir` and deleted with `unlink`, bypassing `MediaStore` entirely.

With photographs in a bucket it would have reported **every stored object as a
MISSING FILE** and `--clean` would have reclaimed nothing while real orphans
accumulated. The one tool that makes the "orphans over broken references" trade
defensible would have been silently useless in exactly the deployment it was
written for.

**FIXED** — goes through `getMediaStore()`. Verified against the bucket:
`store  S3-compatible object storage (bucket "ci-media-test" …)`, 9 objects seen.

### D-2 · Cleanup could delete an upload in flight · **MEDIUM**

Uploads write the object **before** the database row, so between those two steps
a good photograph is indistinguishable from an orphan. `--clean` had no age
check and would have deleted it — after the teacher had been told it was saved.

**FIXED** — a one-hour grace period via the new `lastModified()`. An object whose
age cannot be determined is kept and reported. Demonstrated: 9 recent orphans,
all kept.

### D-3 · The media suite left real objects orphaned · **MEDIUM** (harness)

`verify-media.mjs` swept only the local directory. Run against object storage it
printed **"swept 0 file(s)"** while leaving 9 objects in the bucket.

**FIXED** — sweeps through the store, and a sweep failure is now reported instead
of swallowed by a bare `catch`. Verified: "swept 13 object(s)", bucket empty.

### D-4 · Deduplication downloaded the whole photograph · **MEDIUM**

`ingest.ts` answered "is this already stored?" with `store.get()`. Free on local
disk; on remote storage it downloads an entire photograph, on every duplicate
upload, to answer a yes/no.

**FIXED** — `exists()` / HEAD. Verified: 1 HEAD, 0 GETs.

### D-5 · The environment contract could not see the new variables · **MEDIUM**

`tests/deployment.test.ts` proves every environment variable is declared, by
scanning for `process.env.NAME`. My first draft read them through an aliased
`env` parameter — invisible to that scan. **The contract test passed while five
variables were undeclared.**

**FIXED, both sides**: the source now reads literal `process.env.MEDIA_S3_*`
names, and a new test asserts the storage set specifically is in the contract,
naming them from the module that defines them.

### D-6 · A comment claimed a consumer that did not exist · **LOW**

`store.ts` said `describeMediaStorage()` existed "so the pre-flight check and the
admin can report the truth". Nothing called it, for two phases.

**FIXED** — the admin media page now shows where photographs are actually being
stored, and the pre-flight has real storage checks. The sentence is true.

---

## 17. Defects fixed

All six above. No defect was left open.

---

## 18. Harness defects

| ID | Defect |
| --- | --- |
| H-1 | `verify-media.mjs` cleanup was local-only — D-3 above |
| H-2 | The environment-contract scan cannot see `process.env` accessed through an alias — D-5. Source fixed; a targeted assertion added. The general hole in the scan remains and is recorded here |
| H-3 | Running `verify:media` twice inside five minutes exhausts the upload rate limiter and produces 36 spurious failures. **The suite's own section 0 is a positive control and correctly reported that its results were meaningless** — good design, worth keeping. Not a defect; documented so the next person waits rather than debugging |

---

## 19. Environmental issues

- **TypeScript parameter properties break the test runner.** `constructor(private
  readonly x: T)` cannot be type-stripped, and any suite importing such a module
  dies with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` — which reads like a broken test
  rather than a language feature. Both new classes use explicit fields.
- **`server-only` modules cannot be imported by plain Node.** Scripts that need
  them run with `--conditions=react-server`, which resolves the marker to its
  empty module. Applied to `verify:storage`, `verify:media`, `media:audit`,
  `media:clean`.
- **Relative imports in `src/lib/media/*` lacked `.ts` extensions**, so Node
  could not resolve them directly. Aligned with the project's existing
  convention (`src/config/*` already does this).
- The pure/`server-only` split follows the established rule: `sigv4.ts` and
  `s3-config.ts` have **no** `server-only` guard, because security-relevant
  logic that cannot be unit-tested is logic nobody has verified.

---

## 20. Database / migration status

**No schema change was made, and none was needed.** `MediaAsset` already stored
exactly the right metadata, and object storage changes nothing about the row.

| Check | Result |
| --- | --- |
| Migrations created or edited | **none** — `git status prisma/` is empty |
| CHECK constraints | **43 present, 0 missing, 0 unexpected** |
| `verify:constraints` | 43 / 43 by name |
| Tables | 15, unchanged |
| `media_assets` constraints | all 7 intact (`key_shape`, `content_type_known`, `dimensions_sane`, `bytes_sane`, `name_printable`, `uploaded`, `pkey`) |
| Demo data | intact — 45 results, 15 stories, 5 faculty, 12 gallery, 5 videos; **0 non-`ZZSHOW` rows** |
| `site_settings` / `media_assets` | restored to 0 rows after testing |

Phase 12's P12-A lesson held: nothing regenerated, nothing lost.

---

## 21. Production readiness

| Capability | Status |
| --- | --- |
| Production-safe storage adapter | **PASS** — built, 49 assertions |
| Refuses to fall back on partial configuration | **PASS** |
| Content-addressed identity preserved | **PASS** |
| No image bytes in PostgreSQL | **PASS** |
| Security model preserved | **PASS** — nothing weakened |
| Consent model preserved | **PASS** |
| Failure handling | **PASS** — 13 failure modes |
| Orphan handling | **PASS** — with a race guard |
| Pre-flight verification | **PASS** — 5 checks, negative controls run |
| Secrets | **PASS** |
| Real provider interoperability | **NOT TESTED** |
| **A bucket exists** | **HUMAN ACTION REQUIRED** |

The application is ready. The infrastructure is not, and cannot be made ready
from inside this repository.

---

## 22. HUMAN ACTION REQUIRED

Checklist M1–M8 in `docs/DEPLOYMENT-HUMAN-CHECKLIST.md`:

1. Create a Cloudflare account and enable R2.
2. **Add a payment card** — Cloudflare requires one before R2 can be enabled,
   even on the free tier. Nothing is charged inside the free limits.
3. Create a **private** bucket.
4. Create an API token scoped to that one bucket, read + write only.
5. Set all four `MEDIA_S3_*` variables in the host.
6. Run `npm run verify:preflight` and confirm `P-MEDIA-01`…`04` pass.
7. **Upload one photograph through Admin → Photos.** `P-MEDIA-05` is NOT TESTED
   by design; this is the only proof the credentials work.
8. Turn on bucket versioning or a retention policy — `pg_dump` does not back up
   photographs.

Until 1–5 are done, uploads are **refused with an explanation** rather than
accepted and lost. The site works; the photo feature does not. That is intended.

---

## 23. Remaining blockers

| # | Blocker | Owner |
| --- | --- | --- |
| 1 | Object storage bucket not provisioned | Human — §22 |
| 2 | Institute facts unverified (address, phones, hours) | Client |
| 3 | Real domain + `NEXT_PUBLIC_SITE_URL` | Human |
| 4 | Demo data present (`P-DB-12` fails by design) | `npm run seed:demo:clean` |
| 5 | Screen-reader and cross-browser passes | Manual |
| 6 | Camera/gallery verification on a real phone | Manual |
| 7 | Request-count budget decision (`/` 29, `/gallery` 24, `/results` 22 vs 20) | Human — now five topics old |

Blockers 2–3 are enforced in code: `isIndexable()` is false while either holds.

---

## 24. Next recommended phase

1. **Provision the bucket** (§22) and run checklist M7. That is the last thing
   between the media system and production, and it is one afternoon.
2. **Collect the institute facts in writing** — address, both numbers, hours,
   email, social accounts, legal entity name. Six blockers, one conversation.
3. **Manual device pass** — camera and gallery on a real Android and a real
   iPhone; a screen-reader pass. All are marked NOT TESTED and none can be done
   here.
4. **Settle the request-count budget.** Five topics is long enough.
5. **Give `enquiries` its lost-update guard** — the one admin surface still
   without one, carried as an accepted risk since Topic 11.
6. Consider closing H-2 properly: make the environment-contract scan detect
   `process.env` accessed through an alias, rather than relying on authors
   spelling names out.
