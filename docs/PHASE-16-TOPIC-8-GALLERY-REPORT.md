# PHASE 16 — TOPIC 8 · GALLERY

**Status:** COMPLETE. Built, attacked, and verified against a real browser, a
real database and a real logged-out request.

**One-line summary:** the institute gallery exists, a teacher can manage it
without touching code, and a photograph of a person cannot reach the public site
until somebody records that the institute holds permission for it.

---

## 1. Scope

**Implemented**

- `/gallery` — public page, category filter, fullscreen viewer.
- A homepage gallery band that hides itself when there is nothing to show.
- `/admin/gallery`, `/admin/gallery/new`, `/admin/gallery/[id]` — add, edit,
  replace the photograph, reorder, publish, withdraw, delete.
- A consent model for gallery photographs, enforced in three independent places.
- `gallery_items` table + `GalleryCategory` enum, one additive migration.
- 23 unit tests, 206 browser/database assertions.
- ZZSHOW demo fixtures covering every consent state.

**Deliberately NOT implemented:** videos, map, inventory, pagination, per-photo
routes, image structured data, EXIF handling, albums, tags, or a second
uploader. None is asked for by Topic 8 and each is a decision for its own topic.

---

## 2. Documentation inventory

Read before any code was written.

| Document | What it established |
| --- | --- |
| `docs/brief/01-master-directive.md` §22 | Categories (All, Classrooms, Students, Events, Achievements, Seminars, Celebrations); masonry/grid; **fullscreen viewer**; optimised images; **"only use categories that correspond to real content"** |
| `docs/brief/01-master-directive.md` homepage flow | `... YOUTUBE → GALLERY → LOCATION → FINAL CTA → FOOTER` — a homepage band is specified |
| `docs/brief/02-vision-brief.md` §Gallery | `/gallery`; "categories + fullscreen viewer"; explicitly **not** "48 random photos in a grid" |
| **`docs/design/STUDENT-DATA-POLICY.md`** | Line 4 puts **gallery photographs** in scope. Publication is not authorised until a record says so; `consentRef` is not nullable on a published record; `consentPhoto` is "never implied by anything else"; `published` never defaults true |
| `docs/PHASE-16-REPORT.md` | Topic 8 pre-classified: "New model. **Consent required** — the policy names gallery photographs." Migrations additive only |
| `docs/PHASE-15-REPORT.md` | Gallery was class **E**: no model, no route, no component |
| `src/config/nav.ts` | `/gallery` was withheld from navigation because "needs photography (not supplied)" — the rule being that a route appears in the menu only if its page exists |
| `docs/COST-AND-INFRASTRUCTURE.md` (via Topic 5) | Allowed formats `jpg/jpeg/png/webp/avif`; **SVG forbidden**; ~2 MB cap; delete file when record deleted |

**No contradiction was found** between these documents.

**One genuine tension, resolved rather than assumed.** The existing consent gate
`blockersForPublishing()` is keyed to a *student record* — it requires
`studentName` and `displayNameMode`, because a `Topper` row is about one
identified student and the question is how much of that student to show. A
photograph is not about one student; a prize-giving may contain thirty or none.
Passing a fabricated `studentName` in to reuse the function would have been worse
than not reusing it: it would make the student rules *appear* to apply while
evaluating fields that mean nothing here. So the **policy** is reused and the
**function** is not — see §5.

---

## 3. Existing architecture reused

Nothing in this topic re-implements a primitive that already existed.

| Reused | From | Used for |
| --- | --- | --- |
| `MediaField` | Topic 5 | The photo picker. Take Photo / Choose file / capture attribute — unchanged |
| `ingestImage`, magic-byte sniffing, sharp re-encode, SHA-256 keys | Topic 5 | Every byte that enters the gallery |
| `/media/[key]` route | Topic 5 | Serving |
| `isSafePhotoPath()` | Phase 4 / Topic 5 | Path validation, on write **and** on read |
| `isValidRecordId()` | Phase 10 | Every id before it reaches Prisma |
| Stale-edit guard (`editToken`, `parseEditToken`, `StaleEditError`) | Topic 4 | Lost-update and consent-restore protection |
| `recordAudit()` | Phase 5 | Every mutation |
| `requireAdmin` / `requireAdminOrNull` | Phase 5 | Every surface |
| `revalidate-public.ts` | Phase 6 | New `revalidateGallery()` alongside the others |
| Admin UI kit, `Field`, `Button`, `Section`, `PageHeader`, `ClosingCta` | Phase 15 | Every screen — no new visual language |
| `listingIndexing()` | Phase 9 | Canonical/robots for the filtered view |
| Deployment contract | Phase 13 | Table, enum, constraints and routes all registered |
| `verify-faculty.mjs` attack scaffolding | Topic 6 | The direct-action-invocation technique in §6 |

**No new dependency was added.** No CSP directive was changed.

---

## 4. Data model

One table and one enum. One additive migration:
`prisma/migrations/20260827100000_gallery/`.

```
gallery_items
  id, createdAt, updatedAt
  imageUrl      VARCHAR(500)  NOT NULL   -- the photograph IS the record
  alt           VARCHAR(200)  NOT NULL   -- required: it is what a screen reader gets
  caption       VARCHAR(300)  NULL       -- optional editorial line
  category      GalleryCategory NOT NULL
  priority      INTEGER NOT NULL DEFAULT 0
  published     BOOLEAN NOT NULL DEFAULT false
  showsPeople   BOOLEAN NOT NULL DEFAULT true    -- conservative default
  consentRef    VARCHAR(200)  NULL
  consentPhoto  BOOLEAN NOT NULL DEFAULT false
```

**Why a new table was genuinely required.** `MediaAsset` records the *bytes* —
key, content type, dimensions, uploader. It has no caption, no alt text, no
category, no ordering, no publication state and, critically, **no consent
columns**. Adding them to `MediaAsset` would mean every uploaded file carries a
publication and consent state whether or not it is in the gallery, and a photo
used on a faculty card would then have gallery consent fields nobody maintains.
The media library stays a library; this table is an editorial record that points
at one.

**Fields deliberately NOT added:** `title` (the caption carries it), `date`
(`createdAt` exists and no document asks for a displayed date), `photographer`,
`location`, `tags`, `album`, `width`/`height` (already on `MediaAsset`), and any
per-student link — a gallery photograph is not about one student, which is the
whole reason the consent shape differs.

**Categories** are a closed enum, not free text: free text would accumulate
"Classroom", "classrooms" and "Class rooms" within a month and the public filter
would advertise three categories that are one. `All` is not stored — it is the
absence of a filter.

### Constraints added (all verified by name in live PostgreSQL)

| Constraint | What it refuses |
| --- | --- |
| `gallery_items_published_requires_consent` | A published photograph that shows people, without **both** a non-blank `consentRef` and `consentPhoto` |
| `gallery_items_image_is_site_relative` | Absolute URLs, protocol-relative URLs, traversal, backslashes, colons |
| `gallery_items_alt_not_blank` | Blank or whitespace-only alt text |
| `gallery_items_priority_sane` | Priority outside 0–1000 |
| `gallery_items_text_printable` | Control characters in alt, caption or consent reference |

Indexes: `(published, priority)` and `(published, category)` — the two orders the
public page actually queries.

---

## 5. Consent model

### The rule

```
public  ⟺  published
           AND isSafePhotoPath(imageUrl)
           AND ( NOT showsPeople  OR  (consentRef is non-blank AND consentPhoto) )
```

Implemented **once**, in `src/lib/gallery.ts`, and imported by all four surfaces
that need it: the save action, the admin list, the admin form, and the public
read path. A second implementation of a consent rule is a second answer waiting
to disagree, and the one that disagrees quietly is the one that publishes a
photograph it should not have.

### `showsPeople` defaults to TRUE, and the default is the point

A photograph of an empty classroom needs nobody's permission, and demanding a
consent reference for a picture of furniture would be inventing policy in the
opposite direction. But the safe default when nobody has said either way is that
there *are* people in it. So a teacher must deliberately declare a photograph
people-free to publish it without a reference, rather than deliberately declare
it sensitive to protect it. **Fail closed means the unset state is the protected
state.**

### The complete path

```
upload (Topic 5: magic bytes → re-encode → SHA-256 key)
   ↓
MediaAsset row + /media/<key>
   ↓
gallery_items row     ← consent recorded HERE, on the editorial record
   ↓
galleryBlockers()     ← same function in the browser and on the server
   ↓
save action           ← refuses to set published:true with blockers outstanding
   ↓
CHECK constraint      ← refuses the illegal row for every other writer
   ↓
getPublishedGallery() ← filters in the WHERE clause, then re-checks each row
   ↓
public /gallery
```

### Withdrawal takes the photograph down; it does not fail the save

A teacher unticking "Permission to publish this photograph" on a live record is
almost always doing one thing: somebody has asked for it to come down. Refusing
the save until they *also* untick "Show on the website" is defensible and wrong,
because of what happens meanwhile — **the photograph stays public while they
work out what the error message wants.** So withdrawal forces `published: false`
and the admin says so plainly. Verified end to end in §6, case C.

### Three independent enforcement points, and why each exists

1. **The action** — the gate a teacher meets, with wording they can act on.
2. **The CHECK constraint** — the gate everything else meets: a direct query, a
   future import, a script written in a hurry. Topic 5 found the stories action
   writing an unvalidated photo path for its entire existence with nothing
   downstream compensating.
3. **The read path** — catches rows that are *already* wrong. This is not
   redundant: the constraint permits any path starting with `/` and free of
   traversal, which is strictly weaker than `isSafePhotoPath`. `/media/x.svg`
   satisfies the constraint and will never render. Proven by unit test.

---

## 6. Security model

Every row is an executed assertion, not an intention.

| Threat | Mitigation | Evidence |
| --- | --- | --- |
| **Case A** valid consent | Publishes | §2 of the suite; visible to a logged-out fetch |
| **Case B** missing consent | Record still SAVED, `published` forced false | Database row asserted; absent from `/gallery` and `/` |
| Half consent (reference only / tick only) | Neither alone publishes | Both asserted separately — the permissions are independent, not a ladder |
| **Case C** withdrawn consent | Unpublished by the same save; gone from the public page | Asserted from the database **and** by polling the logged-out page until it disappears |
| **Case D** stale admin tab | Lost-update guard refuses; consent not restored; photograph stays down | Tab A loads consented → consent withdrawn → Tab A saves unchanged → refused |
| Stale tab with the token stripped | Treated as stale | A form that cannot prove its version does not overwrite one |
| **Case E** unauthorised | Anonymous delete redirected at the edge (307) | Named as the *proxy* refusing, not miscredited to the action |
| **Case F** direct action invocation | Forged session reaches the action and is refused (303) | Attacks the **delete form**, whose `$ACTION_*` fields are read from served HTML — a genuine invocation, not a malformed body producing a meaningless 500 |
| **Case G** forged/cross origin | Refused outright | Cross-origin POST with a real session |
| IDOR | Malformed ids delete nothing | Traversal, SQL, 500-char, JSON-object and empty ids all replayed; row count unchanged; victim alive |
| Malformed id on the edit route | `notFound()`, never a 500 | Four shapes checked |
| **XSS** | Escaped; nothing executes | 6 payloads in alt and caption, stored and rendered; `window.__zzgal_xss` never set in a real browser; payload confirmed to sit *inside* the alt attribute without breaking out |
| **Path traversal / media forgery** | 14 hostile paths refused, none created a record | `../`, `/media/../..`, `C:\`, `%2e%2e`, `javascript:`, `data:`, `http:`, `https:`, `//`, `.svg`, `.html`, query, fragment |
| Required-photo bypass | Refused server-side | And the form *says* required, so label and validation agree |
| Blank alt | Refused | Action and CHECK constraint |
| **Public endpoint abuse** | 13 query-string probes, all 200, no stack trace, nothing reflected | Includes 4000-char value, repeated parameter (arrives as an array), null byte, traversal, SQL, `<script>` |
| Non-public photograph leaking via any query string | None | And a control asserts **6 hidden rows existed**, so the check is not vacuous |
| CSP / headers | Untouched | No new origin; `verify:security` 262/262 |

**Rate limiting.** Deliberately *not* added to gallery mutations. The one
expensive, abusable operation is the **upload**, which already goes through
Topic 5's limiter — gallery reuses that control and adds no second upload path. A
create/edit/delete of a text row by an authenticated admin is not a threat the
enquiry limiter's shape fits, and copying it would be adding a control without a
threat model. The Topic 5 limiter was observed working during regression: it
refused faculty uploads after the media suite consumed the window.

**One observation, not a defect.** A cross-origin server-action POST returns
**500** rather than 4xx. That is Next's own behaviour for a rejected action, it
is identical for faculty and every other action on the site, and the mutation
does not occur. Recorded because "no 5xx" is a rule this project applies to
*public* endpoints, and this is an authenticated admin endpoint refusing an
attack.

---

## 7. Defects found

### D-1 · `/gallery` lost its pre-launch `noindex` — **HIGH**

- **Severity:** High. The gallery would have been indexable before launch, on a
  site whose launch switch is deliberately off.
- **Root cause:** `generateMetadata` spread `pageMetadata(...)` and then set
  `robots` beside it. `listingIndexing()` returns **no** robots value for an
  unfiltered view, and an explicit `robots: undefined` *overrides* a spread key
  rather than deferring to it — so the site-wide policy was clobbered.
- **Reproduced:** `verify:seo` — `/gallery is noindex while SITE_IS_LAUNCHED is
  false — robots=""`.
- **Fix:** pass `canonical` and `robots` **into** `pageMetadata`, which merges
  them with the launch policy. This is the call shape `/results` already used;
  the defect was mine for merging by hand.
- **Regression test:** the existing SEO suite, now covering `/gallery` (added to
  `PUBLIC_ROUTES`).
- **Verified:** unfiltered `/gallery` serves `noindex, nofollow, nocache`;
  filtered serves `noindex, follow` with canonical to the bare path.

### D-2 · The admin gallery list scrolled sideways — **MEDIUM**

- **Severity:** Medium. At 320px the page became **1542px** wide, putting Edit
  and Remove off-screen — the controls a teacher needs to *fix* the record.
- **Root cause:** a flex child defaults to `min-width: auto`, so it refuses to
  shrink below its widest unbreakable content. A long hyphen-free description —
  a pasted URL, or the attack strings this project's own suites store — widened
  the card and the page.
- **Reproduced:** deliberately, with a 157-character single-word alt.
  `{"scroll":1542,"client":320}`.
- **Fix:** `min-w-0` on the content column, `[overflow-wrap:anywhere]` on the
  three free-text lines.
- **Regression test:** `verify:gallery` §12 measures 4 routes × 9 widths.
- **Verified:** 320/320 with the hostile string still in the database.

### D-3 · Gallery tile buttons had no accessible name — **MEDIUM**

- **Severity:** Medium. Tiles without a caption announced nothing useful.
- **Root cause:** the button's only content was an image. Per spec that image's
  alt *does* name the button, but it describes what the photograph shows rather
  than what pressing it does; where a caption existed, the computed name was alt
  and caption run together.
- **Reproduced:** `verify:ux` — "every focusable control has an accessible name".
- **Fix:** explicit `aria-label={`View photograph: ${alt}`}` on the tile, and
  `aria-label={`Gallery: ${alt}`}` on the homepage strip link. The image keeps
  its own alt.
- **Verified:** `verify:ux` 270/270.

### D-4 · Topic 8 pushed the homepage request count from 22 to 30 — **MEDIUM**

- **Severity:** Medium. A budget regression this topic introduced.
- **Root cause:** an 8-photograph homepage band, plus the client-side viewer
  component being shipped to the homepage.
- **Fix, in two parts:**
  1. The band shows **4**, not 8.
  2. The homepage no longer uses `GalleryViewer`. A new `GalleryStrip` server
     component renders linked tiles that go **to /gallery** — better behaviour
     (a visitor tapping a homepage photo wants the gallery, not a lightbox over
     the homepage) and it ships no JavaScript.
- **Re-measured:** 30 → **26**. See §9 for the honest remaining position.
- **The budget number was NOT changed.**

### D-5 · `media-audit.mjs` could not see faculty or gallery — **MEDIUM, PRE-EXISTING**

- **Severity:** Medium. No data loss, but a safety net with a hole in it.
- **Root cause:** the audit scanned only `topper` and `studentStory`. Faculty
  gained `photoUrl` in Topic 6 and was never added, so every faculty photograph
  was reported as "unreferenced, nothing uses it", and a faculty record pointing
  at a missing file could **never** be reported as a broken reference — the one
  state the script exists to fail on. Topic 8 would have added a second hole.
- **Not data loss:** `--clean` removes only orphan *files* (stored bytes with no
  `media_assets` row) and never acts on the unreferenced list. Confirmed by
  reading the clean path before concluding.
- **Fix:** both tables added to the scan; gallery's `imageUrl` mapped to the
  shape the loop reads.
- **Verified with both controls:** referenced keys 0 → 1 when a gallery row and
  a faculty row point at a real key; and a gallery row pointing at a missing key
  now produces `BROKEN REFERENCES FOUND — used by gallery:<id>`, which was
  impossible before.

### D-6 · `/admin/faculty` had the identical overflow defect — **MEDIUM, PRE-EXISTING, OUT OF SCOPE**

- **Reproduced:** a 407-character single-word bio made `/admin/faculty`
  **3774px** wide at 320px.
- **Fix:** `[overflow-wrap:anywhere]` on the bio line, one attribute.
- **⚠ This is outside Topic 8's scope.** It was found by the Topic 8 probe, it is
  the identical class as D-2, and leaving a proven 3774px overflow in place while
  fixing the same thing next door made no sense. It is flagged here explicitly so
  it can be reverted if you would rather it were handled as its own item.
- **Verified:** `verify:faculty` 130/130.

---

## 8. Test-harness defects

Distinguished from application defects because every one of these produced a
result that was **not true**.

| # | Harness defect | The false result |
| --- | --- | --- |
| H-1 | The stale-edit test stripped the version token **before** clicking the consent checkboxes | Each click is a React state update, and the re-render restored the controlled hidden input. The token came back, the save was an ordinary save, and the suite reported a **stale-edit failure that was really the harness undoing its own attack**. Fixed by stripping last, with a control asserting the token really was removed |
| H-2 | The leak detector matched hidden rows by `imageUrl` | Media keys are **content hashes**, so uploading the same fixture for a public row and a hidden row produces the *same* URL. The URL was on the page because of the public row and the check blamed the hidden one — **a false positive on a privacy assertion**, which trains the next reader to discount the one check that matters. Fixed: identify rows by `alt` (unique, required, rendered verbatim); still check URLs, but only those no public row uses |
| H-3 | The audit section queried `createdAt` | The column is `at`. Threw mid-suite — loud, unlike the Phase 12 version of this class, which was silent |
| H-4 | My rating-count/`\d` regex habits | Avoided this time: the suite uses string methods inside `page.eval`, and comments there contain no backticks or `$` |

**Also observed, not fixed:** `verify:ux` reported `320px /announcements does not
scroll sideways — 353 > 320` on one run and passed on the next two, with no code
change between them. Direct measurement of `/announcements` at 320px found **no
overflow and no offending element**. Reported as **intermittent**; I did not
change anything and am not claiming to have fixed it.

**A harness limitation, deliberately not "fixed":** `verify-ux`'s accessible-name
computation does not consider a nested `<img alt>`. Broadening it would change
assertions on every route in a shared suite. D-3 was fixed in the product
instead, which is the better answer anyway.

---

## 9. Performance

Measured on a local production build.

### Homepage request count — the honest position

| Tree | Requests to `/` |
| --- | --- |
| Pre-topic (HEAD `e7defe6`, **reproduced by stashing during Topic 7**) | **22** — already over the budget of 20 |
| Topic 8, first cut (8 photographs + client viewer) | 30 |
| Topic 8, shipped (4 photographs, server-rendered strip) | **26** |

The remaining delta over the pre-topic tree is **exactly the four photographs**,
which is irreducible for a band whose purpose is to show photographs. Removing
the band entirely would return to 22 and would contradict the master directive's
homepage flow.

**Two things worth knowing about that number.** `verify-budget` counts *assets
referenced in the HTML*, not requests a browser makes — it does not run a
browser and does not scroll. A real-browser measurement at 1280×900 found the
homepage fetches **3 images on load and none of them are gallery photographs**;
they are lazy and below the fold. And every byte-based budget passes: **JS
190.0 KB** (limit 200), **CSS 9.7 KB** (20), **fonts 89.0 KB** (100), **total
304.9 KB** (320).

**I did not change the budget.** Whether the request-count limit of 20 should be
revised — it was set when "measured 14–15", before faculty photographs and before
any gallery existed — is a deliberate decision for you, not something to edit
quietly to make my own change pass.

### `/gallery` on a phone (390 × 844, real browser)

```
33 requests · 10 image requests · 62 KB of images · 351 KB total
CLS < 0.1 · no image served at more than 3× its displayed size
```

**Image strategy, and why.** Fixed 4:3 tiles with `object-cover`, so the layout
is known before any photograph loads and the grid cannot shift (measured CLS).
`sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"` tells the
optimiser the *displayed* width — the single biggest weight mistake a gallery can
make is serving a 1920px render into a 160px box, and the suite asserts no image
exceeds 3× its displayed size. Grid tiles are lazy (`next/image` default, not
overridden); nothing is preloaded. The viewer loads a larger render only when
somebody opens it. The page is capped at **60 photographs**, enforced in the
query so a database with 600 rows costs the same as one with 60.

**Masonry was rejected deliberately.** A CSS `columns` masonry reflows reading
order down each column, so visual order and tab order stop matching — on a page
whose only interactive elements are these tiles, that is a real cost for a look.
The brief says "masonry/grid"; this is the grid half.

---

## 10. Accessibility

### Tested and passing

| Check | Result |
| --- | --- |
| Viewer is a native `<dialog>`, closed at rest | yes |
| Opens as a **modal** (`:modal`), so the page behind is inert | yes |
| Focus moves inside on open | yes |
| **Focus returns to the tile that opened it** on close | yes |
| Dialog has an accessible name | yes |
| Visible Close control | yes |
| Position announced ("Photograph 3 of 8") | yes |
| Arrow keys move between photographs | yes |
| Tiles are real `<button>`s, keyboard-activable | yes |
| Every tile has an explicit accessible name | yes (D-3) |
| Every image has non-empty alt | yes — alt is *required* by the form and by a CHECK constraint |
| No `div`/`span` used as a button | yes |
| Exactly one `h1`; no skipped heading levels | yes |
| Touch targets ≥ 24×24 at 320px | `/gallery` and `/admin/gallery` |
| Filter chips are links with `aria-current` | yes — they are different URLs, which is what a link is for |
| Reduced motion respected | `motion-safe:` / `motion-reduce:` on the only transform |
| Dark-mode AA contrast | via `verify:ux`, 270/270 |
| Open viewer fits at 320px | asserted separately — a page test never sees this state |

### NOT tested

- **Real screen readers.** No NVDA, JAWS or VoiceOver run. Semantics were
  verified programmatically; that is not the same as listening to it.
- **Real touch hardware.** Emulated only.
- **Voice control / switch access.**
- **Escape via a genuine key press.** The suite calls `dialog.close()`, which is
  the same code path every route out of the dialog uses (the `close` event), but
  it is not a synthetic Escape keystroke.
- **Backdrop-click to dismiss.** Not implemented and not asserted.
- **Colour-blindness simulation.**

---

## 11. Browser coverage

| Browser | Status |
| --- | --- |
| **Chrome 151** | **TESTED** — every browser assertion in this report |
| **Edge** | **NOT TESTED** |
| **Firefox** | **NOT TESTED** |
| **Safari / WebKit** | **NOT TESTED** |

The harness (`scripts/browser.mjs`) drives Chrome over CDP; there is no
Playwright in this project and no WebKit available on this machine. `<dialog>`
and `showModal()` are supported in all four, and `:modal` — which one assertion
uses — is likewise; but **supported is not tested**, and Safari in particular has
had `<dialog>` focus-return quirks worth checking on real hardware before launch.

---

## 12. Regression

Every suite run against a clean production build of the working tree.

| Suite | Result |
| --- | --- |
| `npm test` (unit) | **439 passed, 0 failed** (was 416; +23 gallery) |
| `verify:gallery` | **206 passed, 0 failed** |
| `verify:reviews` | 224 passed, 0 failed |
| `verify:seo` | 397 passed, 0 failed |
| `verify:ux` | 270 passed, 0 failed |
| `verify:security` | 262 passed, 0 failed |
| `verify:faculty` | 130 passed, 0 failed |
| `verify:teacher` | 121 passed, 0 failed |
| `verify:import` | 116 passed, 0 failed |
| `verify:media` | 112 passed, 0 failed |
| `verify:cms` | 71 passed, 0 failed |
| `verify:integration` | 67 passed, 0 failed |
| `verify:e2e` | 62 passed, 0 failed |
| `verify:public` | 46 passed, 0 failed |
| `verify:constraints` | 43 passed, 0 failed |
| `verify:revalidation` | 10 passed, 0 failed |
| `typecheck` / `lint` | clean |
| `media:audit` | no broken references |
| **`verify:preflight`** | **63 passed, 0 failed — SAFE TO DEPLOY** (against an empty content database) |
| `verify:budget` | 78 passed, **2 failed** — `/` 26 > 20 and `/results` 22 > 20. See §9 |

**Suite ordering note.** `verify:media` consumes the Topic 5 upload limiter, so
`verify:faculty` run immediately afterwards fails on rate limiting. The server is
restarted between them. This is the product limit working; it was **not**
weakened.

---

## 13. Database state

Read from live PostgreSQL, not from the schema file.

| Fact | Value |
| --- | --- |
| Tables | 14 (13 + `gallery_items`) |
| Enums | 6 (+ `GalleryCategory`) |
| Hand-written CHECK constraints | **39** — 34 before, 5 added, **none dropped** |
| Migrations | 5; one added, **none regenerated** |
| Indexes on `gallery_items` | pkey, `(published, priority)`, `(published, category)` |
| Foreign keys added | none — a gallery row points at a media *path*, not a row, so deleting a photo cannot cascade into editorial content |
| Rows after `seed:demo:clean` | **0** |

**Migration safety.** Additive only, pure ASCII (verified byte-wise: 0 bytes >
127), one `CREATE TYPE` and one `CREATE TABLE`, nothing existing touched. Phase
12's lesson — a regenerated migration silently dropped 28 hand-written CHECK
constraints — is why the constraint count was read from `pg_constraint` before
and after.

**Constraints proven, not assumed.** Before any application code existed, each
illegal state was attempted directly against the database: no consent, reference
only, tick only, whitespace reference, absolute URL, traversal, blank alt,
out-of-range priority — **all refused, each naming its constraint**. Two positive
controls (published with nobody in it; published with full consent) were
**accepted**, proving the constraint is not simply rejecting everything.

**Deployment classification.** `gallery_items` is registered as a **CONTENT**
table, not operational — the policy names gallery photographs alongside toppers,
results and stories, all of which are content. Proven: with the demo dataset
loaded, preflight refuses to deploy; with an empty database it passes; and a
**single** gallery row alone is enough to block it.

---

## 14. Production readiness

| Item | Status |
| --- | --- |
| Launch switch | **OFF**, untouched (`SITE_IS_LAUNCHED = false`) |
| Preflight against an empty content database | SAFE TO DEPLOY |
| Media storage | **Still the Topic 5 boundary.** The local adapter works; the production adapter is declared and unimplemented. Gallery inherits this exactly and adds nothing — no gallery photograph survives a deploy to ephemeral storage, and preflight says so |
| Environment | No new variable. No new external origin. No credential created |
| Infrastructure | Nothing provisioned, nothing contacted |
| Demo data | 12 ZZSHOW rows (8 public), removable to zero; blocks deployment while present, by design |

---

## 15. Known limitations

Stated rather than hidden.

1. **Production media storage is still unimplemented** (Topic 5's boundary).
   This is the largest environment-dependent gap and gallery makes it more
   visible, because a gallery is mostly photographs.
2. **Only Chrome was tested.** §11.
3. **No real screen-reader testing.** §10.
4. **`/` and `/results` exceed the request-count budget** (26 and 22 vs 20).
   `/results` is pre-existing and proven so; `/`'s excess over the pre-topic
   baseline is the four photographs. §9.
5. **No pagination on `/gallery`** — a hard cap of 60 instead. Beyond 60
   photographs the oldest low-priority ones stop appearing, silently. That is a
   deliberate simplification and it will need revisiting if the institute uploads
   more than 60.
6. **No bulk upload.** Photographs are added one at a time. Fine for tens,
   tedious for hundreds.
7. **No reordering UI beyond a priority number.** No drag-and-drop.
8. **Deleting a gallery record does not delete the file** — deliberate, matching
   faculty: media keys are content hashes, so two records may share one file.
   `media:audit` reports unreferenced files and `media:clean` reclaims them.
9. **`showsPeople` is a teacher's judgement.** Nothing detects faces. A
   photograph wrongly marked people-free publishes without a consent reference.
   The conservative default and the wording ("if you are not sure, leave it
   ticked") are the mitigation; there is no technical one.
10. **A consent *reference* is a free-text string.** The system records that the
    institute claims to hold a form; it cannot verify one exists. This matches
    how `consentRef` already works for toppers and stories.
11. **The intermittent `/announcements` UX measurement.** §8.
12. **D-6 is out of scope** and can be reverted.

---

## 16. Next recommended topic

**Topic 9 — Videos.**

It is the last content type in the master directive's homepage flow that is still
absent (`YOUTUBE → GALLERY → LOCATION`), gallery has just proved the pattern it
needs — new model, admin CRUD, public band that hides itself, additive migration,
deployment-contract registration — and the CSP already permits
`youtube-nocookie.com` and `i.ytimg.com` with no change required. It is the
smallest remaining step that completes a documented page flow.

One caveat to carry in: Topic 9 needs a **YouTube channel ID**, which the
institute has not supplied. Per `docs/PHASE-16-REPORT.md` the intended approach
is a validated ID/URL with a click-to-load embed — buildable and verifiable with
a fixture, exactly as Topic 7 was, but **live integration will again be
untestable** and the report must say so in those words.

The larger unstarted risk is **production media storage**, which is not a topic
in this phase but blocks real photographs from surviving a deploy. If the
institute is close to supplying photography, that outranks Topic 9.
