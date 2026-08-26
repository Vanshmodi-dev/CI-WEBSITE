# Phase 16, Topic 5 — the media upload system

**Status:** see "Test results" and "Production readiness" at the foot. Written
before implementation and updated with measured results as work proceeded.

---

## 1. Inventory — what already existed

| Thing | Where | Verdict |
| --- | --- | --- |
| `isSafePhotoPath()` | `src/lib/validation.ts` | **Reuse.** Already refuses `..`, `//host`, backslashes, `:?#`, whitespace, and anything not `.jpg/.jpeg/.png/.webp/.avif`. Hardened in an earlier phase and unit-tested. |
| Photo path on students | `admin/students/actions.ts` | Validated with `isSafePhotoPath` before write. Correct. |
| Photo path on stories | `admin/stories/actions.ts` | **UNSAFE — see D5-1.** Accepted any 500-character string with no path validation at all. |
| Consent gate on read | `src/lib/student-display.ts` | `present()` returns `photoUrl` only when `consentPhoto` is true. **Reuse unchanged.** It did *not* re-check the path shape — see D5-2. |
| Publish blockers | `blockersForPublishing()` | **Reuse unchanged.** A photo without `consentPhoto` blocks publication. |
| Upload handling | `src/lib/import/run.ts`, `admin/data/actions.ts` | **Reuse the pattern:** bound before decoding, rate-limit per administrator with `peekWindow`/`recordWindowHit`, never use the uploaded filename as a path, keep it only as a display label. |
| Rate limiting | `src/lib/burst-limit.ts` | **Reuse.** `peekWindow(key, window)` / `recordWindowHit(key, window)`. |
| Audit | `recordAudit()` in `src/lib/auth.ts` | **Reuse.** Action list is CHECK-constrained; `created`/`updated`/`deleted` already exist, so no constraint change. |
| Stale-edit guard | `src/lib/stale-edit.ts` | **Reuse unchanged.** |
| Image rendering | `next/image`, `remotePatterns: [i.ytimg.com]` | **Reuse.** A site-relative path needs no remote pattern; nothing else is permitted a remote URL. |
| Image library | `sharp` 0.35.3, present as Next's own image-optimisation dependency | **Reuse** — see §3. |
| Body size cap | `next.config.ts` `serverActions.bodySizeLimit` | Raised 3 MB -> 8 MB. The media cap (6 MB) must sit **below** it so the teacher meets our message, not a framework 500. |
| Storage for uploads | **nothing** | Had to be built. See §4. |

### What did NOT exist and is therefore new

There was no upload path for images at all. The admin asked a teacher to type
`/photos/example.jpg` into a text box, and the file had to reach `public/`
through a developer. That is the dependency this topic removes.

---

## 2. Threat model, written before the code

Each row names the attack, the control, and **where** the control lives. Where
two controls appear, that is deliberate: they fail differently.

| # | Threat | Control |
| :-: | --- | --- |
| T1 | Executable/HTML/JS renamed `.jpg` | Format decided by **magic bytes of the content**, never by filename or browser MIME. Then a full decode; anything sharp cannot decode is refused. |
| T2 | MIME spoofing (`Content-Type: image/png` on a script) | The browser-supplied `type` is **never read**. |
| T3 | Extension spoofing | The extension is **derived from the sniffed format**, not from the upload. |
| T4 | Polyglot (valid JPEG with an appended payload) | The stored bytes are a **re-encode**, not the upload. Trailing data cannot survive a decode/encode round trip. |
| T5 | SVG (script in an image) | SVG has no magic-byte entry in the allowlist and sharp's svg input is never reached. Explicitly refused with its own message. |
| T6 | Decompression / pixel bomb | `limitInputPixels` on the decoder **plus** an explicit width/height/megapixel cap checked from metadata before any pixel work. |
| T7 | Oversized upload | Size checked **before the bytes are read**, and again after. Below the framework body cap so the error is ours, and again in the browser so an oversized file never leaves it. |
| T8 | Path traversal in filename (`../../evil.jpg`, `..\\`, encoded, null bytes) | The filename is **never a path component**. The storage key is `sha256(re-encoded bytes)` + an extension from the sniffed format. |
| T9 | Path traversal on retrieval (`/media/../../etc/passwd`) | The route handler accepts only `^[0-9a-f]{32}\.(jpg\|png\|webp\|avif)$` and refuses everything else before touching the store. |
| T10 | Unicode/long/control-character filenames | Kept only as a display label, sanitised by the existing `displayFilename()`, escaped by React, never used to address anything. |
| T11 | XSS via filename or alt text | Everything renders as text through React. No `dangerouslySetInnerHTML` anywhere near media. |
| T12 | Unauthenticated upload | `requireAdminOrNull()` first, before any work. |
| T13 | CSRF | Server Actions under Next's origin check, unchanged; `/admin` also runs the stricter nonce CSP from `src/proxy.ts`. |
| T14 | IDOR on media id | Ids are content hashes, not sequential. Every mutation re-authenticates. Deletion refuses anything still referenced. |
| T15 | Resource exhaustion by repeated upload | Per-administrator sliding window, reusing the import limiter. |
| T16 | EXIF / GPS leakage | The re-encode carries **no** metadata forward; orientation is baked in and then discarded. Asserted by a test that uploads a GPS-tagged JPEG and reads the output back. |
| T17 | SSRF / remote ingestion | **No remote URL import exists and none is added.** Uploads accept a local `File` only. |
| T18 | Cache showing a replaced image | Ids are **content-addressed**, so a different image is a different URL. Replacement cannot serve a stale byte. |
| T19 | Broken public reference during replacement | Replacement **never deletes first**. The new file is written and the record repointed; the old file stays until explicitly cleaned. |
| T20 | Orphaned files | Deletion removes the database row first, then the file. An orphan file is recoverable; a row pointing at a missing file is a broken page. Reconciliation script reports both. |
| T21 | Consent bypass | Uploading writes **no** consent field and **no** `published` flag. Publication continues to run through `blockersForPublishing()` and the database CHECK constraints. |
| T22 | Media reachable merely because uploaded | Serving is a route handler, not `public/`. It refuses ids that are not in the store. |
| T23 | Content-type confusion on serve | The stored, sniffed type is sent with `X-Content-Type-Options: nosniff`. |

### Threats explicitly accepted, and why

- **A logged-out visitor can fetch `/media/<id>` if they know the id.** The id
  is a 128-bit content hash and is not enumerable. Media is *content*, and the
  student-photo protection that matters is the consent gate on the **page**:
  `present()` returns no `photoUrl` at all without `consentPhoto`, so the URL is
  never published. Signed URLs were considered and rejected: they would break
  `next/image` optimisation and CDN caching for every legitimate image, in
  exchange for defending against an attacker who already has a 32-character
  hash. This is recorded rather than glossed over.

---

## 3. Image processing — reusing `sharp`, and declaring it

`sharp` 0.35.3 is already installed: Next.js uses it for `/_next/image`. The
project's own `COST-AND-INFRASTRUCTURE.md` already specifies "re-encode through
`sharp`" as a requirement for when uploads exist.

It is now **declared in `package.json`** rather than used transitively. That is
not a new install — the binary is already on disk and already required by the
framework — but relying on another package's dependency graph for a security
control is not a dependency you can reason about. If Next ever drops it, an
undeclared import fails at runtime, in the upload path, in production.

Re-encoding is the single strongest control here: it is what defeats polyglots
(T4), strips EXIF and GPS (T16), and normalises orientation. `sharp` is
server-only and never enters a client bundle.

---

## 4. Storage — the decision, stated honestly

**The deployment target has an ephemeral filesystem.**
`docs/COST-AND-INFRASTRUCTURE.md` names Vercel as the host and Vercel Blob as
the recommended photo storage, and records that Blob is **not provisioned** and
has no credentials.

So the code is written against a `MediaStore` interface with two
implementations:

| Implementation | Status |
| --- | --- |
| `LocalDiskStore` | **Development only.** Writes to `.media-store/`, outside `public/` and gitignored. |
| Production adapter | **NOT BUILT — no credentials exist and none are invented.** The factory refuses to start in production with a message naming exactly what is missing. |

**This system is therefore NOT production-ready for media, and this document
does not claim otherwise.** What is production-ready is everything around the
storage boundary: validation, authorisation, consent, serving, caching and
deletion semantics all sit above the interface and do not change when a real
adapter is added. Adding one is implementing three methods.

Files are stored **outside `public/`** deliberately. `public/` is a build-time
directory; writing to it at runtime works under `next start` and does nothing on
a serverless host, which is exactly the kind of "works on my laptop" storage the
brief warns against.

---

## 5. Identifiers, and why they are content hashes

A stored object is `<sha256(re-encoded bytes) first 32 hex>.<ext>`.

Three properties follow, and each one removes a class of bug:

1. **No attacker-chosen path component.** The name is derived from bytes we
   produced, not from anything uploaded.
2. **Replacement cannot be cached wrongly** (T18). Different image, different
   hash, different URL. No cache-busting query string, no CDN purge, no "try
   refreshing".
3. **Identical uploads deduplicate.** Uploading the same photograph twice costs
   one file.

---

*(Sections 6 onward — implementation, security results, consent, browser/UX,
performance, defects, test results, limitations — are written from measured
results below.)*

---

## 6. The pipeline, in order

Cheapest refusal first. Doing it the other way round hands anyone with a session
a denial-of-service: a 6 MB file of noise would cost a full decode before being
rejected.

| # | Step | Where | Refuses |
| :-: | --- | --- | --- |
| 1 | Authenticate | `uploadMedia` | anonymous, expired, signed-out |
| 2 | Rate limit per administrator | `peekWindow` | 60 uploads / 5 min |
| 3 | One file only | `formData.getAll('file')` | multi-file payloads |
| 4 | Size, from `file.size` | `checkSize` | > 6 MB, before reading |
| 5 | Size, from the bytes | `checkSize` | a browser lying about `size` |
| 6 | **Magic bytes** | `decideFormat` | everything not JPEG/PNG/WebP/AVIF |
| 7 | Decode + `limitInputPixels` | `sharp` | pixel bombs, corrupt files |
| 8 | Sniffed format vs decoder | `normaliseFormat` | container tricks |
| 9 | Dimensions from metadata | `checkDimensions` | > 8000px, > 40 MP |
| 10 | **Re-encode** | `reencode` | polyglots, EXIF, GPS, ICC, orientation |
| 11 | Hash the OUTPUT | `createHash` | — produces the key |
| 12 | Store, then record, then audit | store + Prisma | — |

There is also a **client-side size check** in `MediaField`. It is not a security
control and nothing depends on it; it exists because without it a file above the
framework's body limit was rejected before the action ran, the promise rejected,
and the control sat on "Uploading photo…" forever with no message. See D5-4.

## 7. Consent boundary

**Uploading a photograph is not permission to publish it.**

`admin/media/actions.ts` writes no `published`, no `consentPhoto`, no
`consentRef`, and touches no student or story row. It stores bytes and returns a
path. Publication continues to run through `blockersForPublishing()` and the
database CHECK constraints, exactly as before.

The `media_assets` table carries **no consent or publication column at all**, and
the suite asserts that by reading the table's own column names rather than by
trusting this paragraph.

`MediaField`'s "Remove" clears the record's reference and **does not delete the
file**, because the bytes may be used by another record and destroying them
would break a page somebody else is looking at.

## 8. Deletion, replacement, orphans

**Deletion order is database row first, then the file**, and the order is the
whole decision. There is no transaction spanning Postgres and a file store, so:

- row first → a failure leaves an **orphan file**: costs disk, referenced by
  nothing, served to nobody, reclaimed by `npm run media:clean`.
- file first → a failure leaves a **broken reference**: a live page showing a
  broken image.

An orphan is recoverable and invisible. A broken reference is neither.

A photo still referenced by a student or story is **refused outright** — the
library hides the delete button and says why, and the action refuses regardless
of what the browser sends.

**Replacement never deletes first.** The new file is written and the record
repointed; the old file stays. A failed upload therefore cannot leave a record
with no photograph.

`scripts/media-audit.mjs` reports orphan files, missing files, broken references
and unreferenced assets, and exits non-zero **only** for broken references —
the others are either normal or merely untidy, and a tool that fails for
untidiness gets ignored.

## 9. Caching

Storage keys are `sha256(stored bytes)`, so **a different image is a different
URL**. Responses carry `Cache-Control: public, max-age=31536000, immutable`.

Replacement is therefore immune to caching by construction: there is no
cache-busting query string, no CDN purge, and nobody is ever told to refresh.
Verified by uploading A, replacing with B, and fetching both URLs anonymously.

## 10. Test results — measured

`npm run verify:media`, production build, real PostgreSQL, real browser.

| Section | Result |
| --- | :-: |
| 0. The harness can tell success from failure | PASS |
| 1. JPEG, PNG, WebP, AVIF accepted | PASS |
| 2. HTML/JS/EXE/SVG/GIF/empty/corrupt/pixel-bomb/oversize refused, nothing stored | PASS |
| 3. Polyglot payload removed by the re-encode | PASS |
| 4. EXIF and GPS stripped | PASS |
| 5. Hostile filenames stored as labels only | PASS |
| 6. 11 traversal/extension probes on retrieval | PASS |
| 7. Unauthenticated and cross-origin uploads refused, nothing stored | PASS |
| 8. Deletion refused while referenced | PASS |
| 9. Consent untouched by uploading | PASS |
| 10. Replacement produces a new immutable URL | PASS |
| 11. A record with no photograph saves | PASS |
| 11b. Rate limit fires | PASS |

**Unit:** `tests/media.test.ts` — 32 checks over sniffing, limits, key shape and
path round-tripping, including 15 hostile file types and 27 traversal strings.

⚠ **Running the suite twice inside five minutes fails the second run.** The last
section deliberately exhausts the upload limit, which refills over five minutes.
Any earlier section reporting `THE SUITE HIT THE UPLOAD RATE LIMIT` means that
and nothing else.

## 11. Accessibility and responsive

- Buttons are `<button>`, never clickable `<div>`s.
- The file inputs are `sr-only` and `aria-hidden`; the visible buttons are the
  accessible controls.
- Outcome is announced through a `role="status"` `aria-live="polite"` region —
  polite, because an upload finishing must not interrupt typing.
- Errors use `role="alert"`.
- The preview frame is `aria-hidden` with `alt=""`: it previews a choice the
  surrounding controls already describe, and announcing it adds a stop that
  tells a screen-reader user nothing new.
- In the library, `alt` is the teacher's own filename, escaped by React.

**NOT TESTED: screen readers.** No screen-reader environment exists here and no
such claim is made.

## 12. Known limitations

1. **Production media storage is not provisioned.** Local disk only. On a host
   that discards its disk, uploads refuse rather than silently losing photos.
2. **`/media/<key>` is unauthenticated.** Accepted risk, reasoned in §2.
3. **No cropping.** Images are resized to fit 1920px, never cropped, so nothing
   is destroyed. Aspect-ratio handling is CSS `object-cover` at the display site.
4. **No bulk upload.** One file per operation, deliberately.
5. **The rate limiter is per-process**, like every other limiter here. On a
   multi-instance deployment the effective limit is per instance. Documented in
   `burst-limit.ts` since it was written; not introduced by this topic.
6. **Screen readers untested.** See §11.

## 13. Deployment requirements before launch

- [ ] Provision object storage (Vercel Blob is the documented recommendation).
- [ ] Implement a `MediaStore` adapter for it — three methods.
- [ ] Set `mediaStorageIsProductionReady()` to reflect reality.
- [ ] Re-run `npm run verify:media` against the real adapter.

Until all four are done, **this system is not production-ready for media**, and
the admin says so in a banner on the photo library rather than leaving the
teacher to find out.
