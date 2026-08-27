# PHASE 16 — TOPIC 9 · VIDEOS

**Status:** COMPLETE. Built, attacked, and verified against a real browser, a
real database and a real logged-out request.

**One-line summary:** the institute can put chosen YouTube videos on the
website, nothing a teacher types can become an iframe source, and a visitor who
does not press play contacts no third party at all.

---

## 1. Scope

**Implemented**

- `/videos` — public page, subject filter, poster-first players.
- A homepage videos band that hides itself below three published videos.
- `/admin/videos`, `/admin/videos/new`, `/admin/videos/[id]` — add, edit,
  reorder, publish, unpublish, remove, with a live preview of the parsed video.
- A URL parser that reduces any pasted YouTube link to an eleven-character id.
- `videos` table + `VideoSubject` enum, one additive migration.
- 22 unit tests, 230 browser/database assertions.
- ZZSHOW demo fixtures whose ids cannot resolve to a real video.

**Deliberately NOT implemented:** the YouTube Data API, channel sync, video
uploads, playlists, durations, view counts, `VideoObject` structured data, a
modal player, and pagination. Each is argued below or in §17.

---

## 2. Documentation inventory

Read before any code was written.

| Document | What it established |
| --- | --- |
| `docs/brief/01-master-directive.md` §20 | Homepage "Learn Beyond the Classroom"; latest videos with thumbnails, titles, categories, dates, watch CTA; a dedicated page; categories "Accounts, Economics, Business Studies, Exam Preparation"; **"only create categories supported by actual content"** |
| `docs/brief/01-master-directive.md` §21 | *"**Where practical**, design the system so that the latest videos can **eventually** be retrieved dynamically using the appropriate YouTube API"*; *"should not need **manual code edits** every time a new video is published"*; **"API credentials must NEVER be exposed in client-side code"** |
| `docs/MASTER-PLAN.html` §14 | `/videos`, ISR 6h, **YouTube Data API**, "Sample the teaching", **"Needs channel ID"** |
| Master Plan band 10 | Homepage: "3 latest videos, thumbnail + title. **Band hidden if the channel has fewer than 3 videos**" |
| Master Plan §04 | Videos moved **above** student stories — "video is the one piece of proof where a visitor can judge teaching quality directly, in seconds" |
| Master Plan page spec | `/videos`: "latest first, **filtered by subject only once each filter has three or more videos**" |
| Master Plan CTA table | `/videos` → "Subscribe on YouTube" / "Explore Courses"; low intent |
| `docs/PHASE-16-REPORT.md` | Topic 9 pre-classified: "Validated YouTube ID/URL only. Click-to-load `youtube-nocookie` embed." **New table: yes**. Also: `playlistItems.list` (1 quota unit) never `search.list` (100); "No iframe until click"; CSP already permits what this phase needs |
| `docs/design/STUDENT-DATA-POLICY.md` | Scope is "toppers, results, student stories, gallery photographs". **Videos are not named** |
| `src/config/nav.ts` | `/videos` withheld from navigation because it "needs the YouTube channel ID (not supplied)" |
| `src/config/institute.ts` | `social.youtube` is **`null`** — no channel supplied |
| `next.config.ts` | CSP already carries `img-src … https://i.ytimg.com` and `frame-src … https://www.youtube-nocookie.com`; `remotePatterns` already allows `i.ytimg.com` |

### The contradiction, stated rather than glossed

Two project documents disagreed about whether videos need a table.

- `prisma/schema.prisma` header: *"Videos → **YouTube is already the database** (§14)"* — i.e. no table.
- `docs/PHASE-16-REPORT.md` topic plan: *"Validated YouTube ID/URL only… **New table: yes**"*.

I did not pick one silently. §4 sets out the decision and its reasons, and the
schema header has been **rewritten** so it no longer states the opposite of what
the code does — the "documentation says X, source does Y" case this task
requires to be fixed or recorded.

---

## 3. Existing architecture reused

Nothing here re-implements a primitive that already existed.

| Reused | From | Used for |
| --- | --- | --- |
| `isValidRecordId()` | Phase 10 | Every id before it reaches Prisma |
| Stale-edit guard (`editToken`, `parseEditToken`, `StaleEditError`) | Topic 4 | Lost-update and republish protection |
| `recordAudit()` | Phase 5 | Every mutation, including the `unpublished` action Topic 8 started using |
| `requireAdmin` / `requireAdminOrNull` | Phase 5 | Every surface |
| `revalidate-public.ts` | Phase 6 | New `revalidateVideos()` alongside the others |
| Admin UI kit, `Field`, `Button`, `Section`, `PageHeader`, `ClosingCta` | Phase 15 | Every screen — no new visual language |
| `listingIndexing()` | Phase 9 | Canonical/robots for the filtered view |
| Deployment contract | Phase 13 | Table, enum, constraints, unique index and routes all registered |
| `verify-gallery.mjs` attack scaffolding | Topic 8 | Direct-action-invocation technique, poster/strip split, `min-w-0` discipline |
| **The existing CSP** | Phase 3 / 16 | **Not one directive changed** |

`MediaField` and the Topic 5 upload pipeline are deliberately **not** used: no
bytes are uploaded for a video. See §4.

---

## 4. Architectural decision

**Chosen: (A) curated YouTube references.** A teacher pastes a link; the server
extracts the eleven-character id and stores that, with the institute's own
title, description and subject.

### Why not (D) channel-based consumption, which the Master Plan describes

1. **It needs credentials that do not exist.** `institute.social.youtube` is
   `null` and no API key was supplied. Inventing either is forbidden, and this
   is the same wall Topic 7 hit with the Review Engine.
2. **It has no editorial gate.** Every upload on the channel would appear on the
   institute's website automatically. This project's central rule is that
   nothing is public until somebody publishes it — enforced on toppers, stories,
   faculty, gallery and reviews. A channel feed would be the one surface that
   publishes itself.
3. **It cannot satisfy the Master Plan's own filter requirement.** "Filtered by
   subject" needs a subject taxonomy; the YouTube API does not provide one.
   Categories would have to be invented from titles, which is guessing.
4. **It creates an SSRF and quota surface** for a feature that works without one.

### Why the directive's §21 is satisfied anyway

§21's stated concern is precise: *"should not need **manual code edits** every
time a new video is published"*. An admin panel removes code edits entirely — a
teacher adds a video in a browser. §21 also says "where practical" and
"eventually", which is the language of a direction of travel, not a requirement
for today.

### Why not (C) uploaded video files

Not asked for by any document, and an infrastructure decision nobody has made.
Video storage and egress are an order of magnitude more expensive than images,
and Topic 5's production media boundary is still unimplemented. Building an
upload pipeline because a gallery upload pipeline exists is exactly what this
task warned against.

### The precedent this follows

Faculty. The same schema header said *"Faculty → stays in code, version control
is the right audit trail"*, and Topic 6 reversed it because the institute could
not correct a teacher's name without a developer. The reasoning is identical
here, and the reversal is recorded in the schema rather than left as a
contradiction.

---

## 5. Data model

One table and one enum. One additive migration:
`prisma/migrations/20260827160000_videos/`.

```
videos
  id, createdAt, updatedAt
  youtubeId    VARCHAR(16) NOT NULL UNIQUE  -- eleven chars of [A-Za-z0-9_-]
  title        VARCHAR(160) NOT NULL        -- the institute's wording
  description  VARCHAR(400) NULL            -- optional, and optional means optional
  subject      VideoSubject NOT NULL
  priority     INTEGER NOT NULL DEFAULT 0
  published    BOOLEAN NOT NULL DEFAULT false
```

**Every field, and why it exists**

- `youtubeId` — the only thing worth storing. **Unique**, so the same video
  cannot appear twice on the page.
- `title` — *our* copy, not YouTube's. A channel title can be edited by whoever
  runs the channel; a website mirroring it inherits that change without anybody
  deciding. Typing it also lets the institute write for a page reader rather
  than for a thumbnail.
- `description` — optional. The Master Plan's card is "thumbnail + title"; a
  sentence is useful and not required.
- `subject` — required by the Master Plan's subject filter. A **closed enum**,
  not free text: free text becomes "Economics", "economics" and "Eco" within a
  month and the filter then advertises three subjects that are one.
- `priority` — deliberate ordering, matching faculty, gallery and announcements.
- `published` — nothing is public until somebody publishes it.

**Deliberately absent**

- **No publication date.** The real date lives on YouTube and is unavailable
  without the API; a hand-typed copy is a number nobody maintains — precisely
  the failure Master Plan §00 names. "Latest first" is served by
  `priority desc, createdAt desc`.
- **No duration, view count, or channel metadata** — facts we do not hold.
- **No embed HTML, no URL, no tracking parameters.** The parser discards
  `&list=`, `&t=`, `&si=` and `?feature=share`; storing them would mean the
  website re-emitting somebody's referral token.

### Constraints added (all verified by name in live PostgreSQL)

| Constraint | What it refuses |
| --- | --- |
| `videos_youtube_id_shape` | Anything that is not `^[A-Za-z0-9_-]{11}$` — URLs, iframes, `javascript:`, 10 or 12 characters, dots, slashes |
| `videos_title_not_blank` | Blank or whitespace-only titles |
| `videos_priority_sane` | Priority outside 0–1000 |
| `videos_text_printable` | Control characters in title or description |
| `videos_youtubeId_key` (unique) | The same video twice |

Indexes: `(published, priority)` and `(published, subject)` — the two orders the
public page queries.

---

## 6. Privacy / consent model

**The Student Data Policy does not name videos**, and no video-specific consent
rule exists anywhere in the documentation.

**This is recorded as a HUMAN DECISION, not invented here.** Topic 6 took the
same position for staff photographs and Topic 8 took the opposite one for
gallery photographs — because the policy names gallery photographs and does not
name staff or videos. Inventing a consent column would be inventing policy.

What is worth stating, and is different from a gallery photograph: **the
institute has already published this video publicly on YouTube itself.**
Embedding it does not make it more public than the institute already made it.
Whether a given video should have been published at all is a decision that
happened on YouTube, before this table saw it.

What is guaranteed technically is the same guarantee everything else has:
`published` defaults to `false`, and the admin says plainly that removing a
video here removes it from the website and **not** from YouTube.

**For the institute to decide:** whether videos showing identifiable students
require the same consent record that gallery photographs do. If the answer is
yes, it is an additive migration of the same shape as `gallery_items` — the
model was built so that adding it later changes nothing else.

---

## 7. CSP / third-party model

**Not one CSP directive was changed.** The policy already carried exactly what
this topic needs and nothing more:

```
img-src   'self' data: blob: https://i.ytimg.com
frame-src 'self' https://www.youtube-nocookie.com https://www.google.com
```

### The result is stronger than "no iframe until click"

Measured in Chrome at 390×844 on `/videos` with four videos:

| | Requests | Third-party origins | iframes |
| --- | --- | --- | --- |
| **On load** | 25 | **0** | **0** |
| **After pressing play once** | 26 | 1 (`www.youtube-nocookie.com`) | 1 |

**A visitor who does not press play contacts Google not at all** — not even for
thumbnails. That is not what I set out to build and is worth naming: `next/image`
proxies the poster from `i.ytimg.com` **server-side**, re-encodes it, and serves
it from our own origin. The visitor's IP, user-agent and referrer never reach
Google unless they choose to watch something.

`img-src https://i.ytimg.com` is therefore not strictly required by our pages
any more. It is left in place because removing it would break the moment
somebody sets `unoptimized` on a thumbnail, and it grants nothing beyond images
from one host.

### CSP enforcement, proven in the browser

Injecting frames from script and listening for `securitypolicyviolation`:

- `https://example.com/` → **blocked**, `frame-src`
- `https://www.youtube.com/embed/…` → **blocked**, `frame-src` — even real
  YouTube is refused; only the nocookie origin is permitted
- `https://www.youtube-nocookie.com/embed/…` → **not blocked** (the control
  proving the policy is not simply refusing everything)

No wildcard and no blanket `https:` in `frame-src`, asserted directly against
the response header.

### The iframe itself

```html
<iframe src="https://www.youtube-nocookie.com/embed/<id>?autoplay=1&rel=0"
        title="<the video's title>"
        allow="autoplay; encrypted-media"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
        loading="lazy">
```

`allow` is the minimum that plays a video. Deliberately absent: `accelerometer`,
`gyroscope`, `clipboard-write`, `web-share`, `camera`, `microphone`,
`geolocation`, `payment` — everything YouTube's own copy-paste snippet includes.

**No `sandbox` attribute**, deliberately. The player requires `allow-scripts`
and `allow-same-origin`, and those two together are equivalent to no sandbox at
all; adding it would be theatre that reads as a control. `frame-src` is the real
control, and it permits exactly one origin.

---

## 8. Security threat model

| Threat | Mitigation | Evidence |
| --- | --- | --- |
| **Arbitrary iframe injection** | Nothing a teacher types is ever stored as a URL. `parseYouTubeId` keeps eleven characters; every URL is rebuilt from them | 22 hostile inputs refused through the real form, none created a row |
| Lookalike hosts | Exact host allowlist against a parsed URL — `youtube.com.evil.example`, `evil.example/youtube.com`, and `www.youtube.com@evil.example` all refused | Unit + browser |
| Dangerous schemes | `javascript:`, `data:`, `file:`, `ftp:`, `blob:`, plain `http:` all refused | Unit + browser |
| Protocol-relative `//host` | Refused explicitly, before `new URL` | Unit |
| Raw embed HTML | Refused; the field is labelled "YouTube video link", and there is nowhere to paste an embed code | Unit + browser |
| Malformed ids | 10 or 12 characters, dots, slashes, channel URLs, search URLs all refused | Unit + browser + CHECK constraint |
| **SSRF** | **No surface exists.** Nothing is fetched from a submitted URL, server-side or otherwise. Titles are typed, not scraped | Loopback, `169.254.169.254`, `[::1]` and private ranges are refused by the allowlist anyway |
| **XSS** | Escaped; nothing executes. An `<iframe src=evil>` payload in a description did not become a frame | 5 payloads stored and rendered; `window.__zzvid_xss` never set |
| **Authorisation** | Anonymous redirected at the edge (307); forged session reaches the action and is refused (303) | Attacks the real delete form's `$ACTION_*` payload |
| **CSRF** | Cross-origin POST with a real session refused | Record survives |
| **IDOR** | Traversal, SQL, 500-char, JSON-object and empty ids delete nothing | Row count unchanged |
| **Stale edit** | Lost-update guard; a stale tab cannot republish an unpublished video; a stripped token is treated as stale | Database asserted |
| Duplicate video | Unique index, with a message a teacher can act on | Second add refused |
| Public endpoint abuse | 12 query-string probes, all 200, no stack trace, nothing reflected, **no iframe served** | Includes 4000-char value, repeated parameter, null byte, SQL |
| Unpublished video leaking | None through any query string | Control asserts 9 hidden rows existed |
| Every rendered id | Round-trips through the parser unchanged | 36 ids on the page, all valid |

**Rate limiting.** Deliberately **not** added, and the reasoning is stated rather
than copied. The operation an attacker would want to abuse is one that costs
something — an upload, an email, an upstream fetch. A video mutation writes one
short row, makes no network call and uploads nothing, and it is behind
authentication, CSRF and a session. Copying the enquiry limiter here would add a
control with no threat model behind it. The two genuinely expensive paths in
this project — media upload and the reviews refresh — already have limiters.

**One observation, not a defect.** A cross-origin server-action POST returns
**500** rather than 4xx. That is Next's own behaviour for a rejected action,
identical for faculty, gallery and every other action on the site, and the
mutation does not occur.

---

## 9. Defects found and fixed

### D-1 · `/announcements` scrolled sideways at 320px — **MEDIUM, PRE-EXISTING**

- **Severity:** Medium. A public page with a horizontal scrollbar on a phone;
  the floating WhatsApp button sat off the right edge.
- **Root cause, after three wrong guesses:** an announcement message is free
  text, and `AnnouncementCard` had no `overflow-wrap`. A single unbreakable run
  widened the card, which widened the **layout viewport** to 353px — and that is
  why it was hard to find: once the viewport expands, every element "fits" again
  and an overflow scan finds nothing. `window.innerWidth` was 353 on that route
  and 320 on every other.
- **Why it looked flaky:** in Topic 8 I saw it once, failed to reproduce it, and
  recorded it as intermittent. **That was wrong.** It reproduced 4/4 here on a
  fresh browser. The Topic 8 conclusion is corrected by this report.
- **What made it appear and disappear:** the offending text was a `ZZSEC` XSS
  payload left in a **stale ISR render** by `verify:security`, which creates such
  a row, asserts on it, and deletes it. The row was gone from the database; the
  cached page was not.
- **The floating button was a symptom, not the cause** — hiding it changed
  nothing. The UX suite reports the "first offender" by position, which pointed
  at the wrong element for two topics.
- **Fix:** `[overflow-wrap:anywhere]` on the announcement message — the same
  one-attribute fix made for review cards (Topic 7) and the gallery and faculty
  admin lists (Topic 8). This is the public-page instance.
- **Verified with a real control:** a 227-character single-word announcement was
  inserted, the site rebuilt so the row genuinely rendered (`rendered: true`),
  and the page measured **320/320**. An earlier attempt measured a cached page
  where the row was absent — an inconclusive test that would have "passed"
  either way.
- **Regression test:** `verify:ux`, now 333 checks, 0 failures.

### D-2 · `/videos` would have lost its pre-launch `noindex` — **PREVENTED, not found**

Topic 8 shipped this defect on `/gallery`: spreading `pageMetadata(...)` and
setting `robots` beside it meant an explicit `robots: undefined` overrode the
site-wide policy. `/videos` was written with `canonical` and `robots` passed
**into** `pageMetadata` from the start, and `verify:seo` asserts the launch-state
`noindex` on it. Recorded because the fix was carried forward deliberately.

### D-3 · `.env.example` advertised two variables no code reads — **LOW, PRE-EXISTING**

- Phase 15 recorded this as finding **F-1**: `.env.example` listed
  `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID` while `ENV_CONTRACT` knew nothing
  about them. Topic 7 closed the `REVIEWS_PAYLOAD_URL` half.
- An entry in that file is an instruction to an operator to set something, and
  setting these would have done nothing.
- **Fix:** removed, with a note saying why and what would bring them back.
  Verified no source file reads either name. **F-1 is now fully closed.**

---

## 10. Test-harness defects

Separated from application defects because each produced a result that was
**not true**.

| # | Harness defect | The false result |
| --- | --- | --- |
| H-1 | `document.querySelector('[name="description"]')` **matched the `<meta name="description">` tag**, which precedes the textarea in document order | The helper set a meta tag's value and threw "Illegal invocation" on an input-element setter. It would have silently filled the wrong element for any field name that collides with a meta name. No earlier suite hit it because no earlier form had a `description` field. Fixed by scoping every field lookup to `form` |
| H-2 | The CSP test decided a frame was blocked by whether `onload` fired | **A CSP-blocked frame still fires `onload`**, on the empty document the browser substitutes. Both frames reported "loaded" and the suite claimed the CSP was not enforced **when it demonstrably was**. Fixed by listening for `securitypolicyviolation`, which is the authoritative signal, plus a control asserting the nocookie origin is *not* blocked |
| H-3 | The "opens in a new tab" assertion covered the whole page | It counted the footer WhatsApp link, the agency credit and the floating button — three pieces of site chrome Topic 9 did not add — and failed 6/9. Scoped to `main`; the three are recorded as an observation in §17 rather than fixed under this topic |
| H-4 | A comment inside a `page.eval` template literal contained backticks | Terminated the literal and broke the script. The third time this project has hit it; the comment now says so |
| H-5 | A test expected `%2e%2e` in a URL path to be refused | **The expectation was wrong, not the parser.** `new URL()` implements WHATWG path resolution, so `/%2e%2e/embed/<id>` resolves to `/embed/<id>` on an allowlisted host — a browser resolves it identically, and the path is discarded anyway. Corrected to assert the true behaviour, with the reasoning recorded |

**One environment artifact, caused by me.** I killed a `verify:videos` run at a
10-minute command timeout. The next run reported four failures (duplicate-id
collisions and a count of `2 -> 6`) that did not reproduce: the interrupted run
most likely left a browser that completed a pending submit **after** the new
run's cleanup. Re-run from a verified-clean database: **230 passed, 0 failed.**
Recorded rather than quietly re-run.

---

## 11. Performance measurements

### Third-party cost — the measurement this topic exists to make

`/videos`, Chrome, 390×844, four videos:

```
On load                25 requests · 0 third-party origins · 0 iframes
After one play click   26 requests · 1 third-party origin  · 1 iframe
```

The delta of a watched video is **one** request to `youtube-nocookie.com`, paid
only by the visitor who asked for it. Six videos on the page still cost zero
iframes until somebody clicks, and one click creates exactly one player — not
one per video.

### Page budget

| Route | JS | CSS | Font | HTML | Total | TTFB | Requests |
| --- | --- | --- | --- | --- | --- | --- | :-: |
| `/videos` | 191.7 KB | 10.0 KB | 89.0 KB | 11.0 KB | **301.8 KB** | 14 ms | **within budget** |
| `/` | 190.0 KB | 10.0 KB | 89.0 KB | 17.3 KB | 306.7 KB | 6 ms | 29 |

**`/videos` passes every budget**, request count included.

**The homepage went from 26 to 29 requests.** The delta is exactly the three
video thumbnails of Master Plan band 10. As in Topic 8, the client player is
**not** shipped to the homepage — `VideoStrip` is a server component rendering
three posters that link to `/videos`, so the busiest page on the site pays no
JavaScript for a band most visitors never scroll to. Homepage JS is unchanged at
190.0 KB.

**The budget number was NOT changed.**

### Newly measured, not newly broken

`/reviews`, `/gallery` and `/videos` were each added to `verify-ux` and
`perf-baseline` in this topic. Topics 7 and 8 added their routes to `verify-seo`
only, so **neither `/reviews` nor `/gallery` had ever been contrast-, overflow-,
console- or budget-checked**. Closing that gap is why the UX suite grew from 270
to 333 checks and why `/gallery` now appears in the budget failures at 24 > 20 —
it was always 24; nothing was measuring it.

| Route | Requests | Status |
| --- | :-: | --- |
| `/` | 29 | 26 before this topic; +3 is band 10 |
| `/gallery` | 24 | **newly measured**, pre-existing |
| `/results` | 22 | pre-existing, reproduced at HEAD in Topic 7 |
| `/videos` | — | **passes** |

---

## 12. Accessibility

### Tested and passing

| Check | Result |
| --- | --- |
| Every play control has a descriptive name (`Play video: <title>`) | 6/6 |
| Play controls are real `<button>`s, keyboard-focusable and activable | yes |
| Activating by keyboard creates the player | yes |
| Every video card is headed (`h3`) | yes |
| Exactly one `h1`; no skipped heading levels | yes |
| Poster images carry `alt=""` (the button is already named) | yes |
| The iframe has a `title` | yes |
| No `div`/`span` used as a button | yes |
| No positive `tabindex` | yes |
| Every external link carries `rel="noopener noreferrer"` | 4/4 in `main` |
| …and announces "(opens in a new tab)" | 4/4 in `main` |
| Filter chips are links with `aria-current` | yes |
| Touch targets ≥ 24×24 at 320px | `/videos` and `/admin/videos` |
| Reduced motion respected | `motion-safe:` / `motion-reduce:` on the only transform |
| Dark-mode AA contrast | via `verify:ux`, 333/333 |
| Responsive at 9 widths × 4 routes | 36 checks |
| **The playing state fits at 320px** | asserted separately — a page test never reaches it |

**No modal.** A dialog was considered and rejected: it is a whole accessibility
surface (focus trap, restore, Escape, inert background) and buys nothing here,
because the card is already 16:9 and already the size you watch at. Rejecting it
also removes the failure it brings — a focus trap somebody gets stuck in.

### NOT tested

- **Real screen readers.** No NVDA, JAWS or VoiceOver run. Semantics were
  verified programmatically; that is not the same as listening to it.
- **The YouTube player's own accessibility** once it loads. It is a third party's
  interface inside an iframe and is outside this application's control.
- **Real touch hardware.** Emulated only.
- **Captions/subtitles.** Whether a video has them is a property of the upload on
  YouTube, not of this website. Nothing here can assert it.
- **Voice control / switch access.**
- **Colour-blindness simulation.**

---

## 13. Browser matrix

| Browser | Status |
| --- | --- |
| **Chrome 151** | **TESTED** — every browser assertion in this report |
| **Edge** | **NOT TESTED** |
| **Firefox** | **NOT TESTED** |
| **Safari / WebKit** | **NOT TESTED** |

The harness (`scripts/browser.mjs`) drives Chrome over CDP; there is no
Playwright in this project and no WebKit on this machine. This topic's browser
surface is small — an `<iframe>`, a `<button>`, and `securitypolicyviolation` —
and all three are long-standing standards; but **supported is not tested**, and
the task asked for Edge specifically, which was not available here.

---

## 14. Regression

Every suite run against a clean production build of the working tree.

| Suite | Result |
| --- | --- |
| `npm test` (unit) | **461 passed, 0 failed** (was 439; +22 video) |
| `verify:videos` | **230 passed, 0 failed** |
| `verify:ux` | **333 passed, 0 failed** (was 270; +63 from new route coverage) |
| `verify:seo` | **418 passed, 0 failed** (was 397) |
| `verify:security` | 262 passed, 0 failed |
| `verify:reviews` | 224 passed, 0 failed |
| `verify:gallery` | 206 passed, 0 failed |
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
| **`verify:preflight`** | **63 passed, 0 failed — SAFE TO DEPLOY** (empty content database) |
| `verify:budget` | 101 passed, **3 failed** — `/` 29, `/gallery` 24, `/results` 22 against 20. See §11 |

**Suite ordering note.** `verify:media` consumes the Topic 5 upload limiter, so
`verify:faculty` immediately afterwards fails on rate limiting. The server is
restarted between them. That is the product limit working; it was not weakened.

---

## 15. Database state

Read from live PostgreSQL, not from the schema file.

| Fact | Value |
| --- | --- |
| Tables | **15** (14 + `videos`) |
| Enums | 7 (+ `VideoSubject`) |
| Hand-written CHECK constraints | **43** — 39 before, 4 added, **none dropped** |
| Unique constraints | `videos_youtubeId_key` added and registered |
| Indexes on `videos` | `videos_pkey`, `videos_youtubeId_key`, `videos_published_priority_idx`, `videos_published_subject_idx` |
| Migrations | 6; one added, **none regenerated** |
| Foreign keys added | none — a video row references nothing |
| Rows after `seed:demo:clean` | **0** |

**Migration safety.** Additive only, pure ASCII (verified byte-wise: 0 bytes >
127), one `CREATE TYPE` and one `CREATE TABLE`. Phase 12's lesson — a
regenerated migration silently dropped 28 hand-written CHECK constraints — is
why the count was read from `pg_constraint` before and after.

**Constraints proven, not assumed.** Before any application code existed, each
illegal state was attempted directly against the database: a full URL, iframe
HTML, a `javascript:` string, ten characters, twelve characters, a dot, a slash,
a blank title, an out-of-range priority — **all refused, each naming its
constraint**. Two positive controls (a real 11-character id, and one using `-`
and `_`) were **accepted**, proving the constraint is not simply rejecting
everything.

**Deployment classification.** `videos` is registered as an **OPERATIONAL**
table, not content: a row holds a YouTube identifier and the institute's own
title. It carries no student data and no photograph — the video itself lives on
YouTube, where the institute already published it. That matches `faculty`
(operational) and differs from `gallery_items` (content), because the policy
names gallery photographs and names neither of the other two.

---

## 16. Production readiness

| Item | Status |
| --- | --- |
| Launch switch | **OFF**, untouched (`SITE_IS_LAUNCHED = false`) |
| Preflight against an empty content database | **SAFE TO DEPLOY** |
| Environment variables | **None added.** Two removed (§9 D-3). No credential created |
| External services | None contacted. No API key, no channel id, no quota to manage |
| CSP | Unchanged |
| Infrastructure | Nothing provisioned |
| Demo data | 5 ZZSHOW rows (4 published), removable to zero |

**What remains a human decision**

1. **Whether videos showing identifiable students need a consent record** (§6).
   The model was built so adding one later is additive.
2. **Whether the request-count budget of 20 should be revised.** Three routes
   now exceed it and I have not changed the number in two topics. It was set
   when "measured 14–15", before faculty photographs, the gallery and videos
   existed.
3. **Whether to pursue the channel feed later.** It needs a channel ID and an
   API key, and it would need an answer to the editorial-gate problem in §4.

---

## 17. Known limitations

Stated rather than hidden.

1. **Videos are curated, not synced.** A new upload on YouTube does not appear
   on the website until a teacher adds it. This is the deliberate trade in §4 —
   editorial control for automation — and it is the opposite of what Master Plan
   §14 envisaged.
2. **Only Chrome was tested.** Edge, Firefox and Safari are NOT TESTED (§13).
3. **No real screen-reader testing** (§12).
4. **Titles can drift.** The institute's title is stored, so if a video is
   renamed or deleted on YouTube the website does not notice. A deleted video
   shows a broken poster and an embed that reports unavailability. Nothing here
   polls YouTube to find out.
5. **`/` and `/gallery` and `/results` exceed the request-count budget** (29, 24,
   22 against 20). `/videos` passes. See §11.
6. **No pagination on `/videos`** — a hard cap of 40. Beyond that the oldest
   low-priority videos stop appearing, silently.
7. **The subject filter appears only when at least two subjects each have three
   or more videos.** With four videos across two subjects the demo shows no
   filter bar at all, which is correct per the Master Plan's threshold but may
   read as a missing feature until the library grows.
8. **No "Most Popular" ordering.** The master directive lists it; it needs view
   counts, which need the API.
9. **Three site-chrome external links** (footer WhatsApp, agency credit, floating
   WhatsApp button) carry `rel="noopener"` but do not announce that they open a
   new tab. Pre-existing, outside Topic 9, recorded rather than fixed.
10. **Demo thumbnails 404** by design — the synthetic ids cannot be a real video,
    so `i.ytimg.com` has nothing to return and the tiles show the placeholder
    background. A demo that embedded real videos would be putting a stranger's
    content under the institute's name.
11. **No `VideoObject` structured data.** It requires `uploadDate`, `duration`
    and `contentUrl` — three facts this application deliberately does not hold.
    YouTube already emits it on its own pages, where the facts are true.

---

## 18. Recommended next topic

**Topic 10 — Map / Location.**

It is the last item in the master directive's homepage flow that is still absent
(`… → GALLERY → LOCATION → FINAL CTA`), the CSP already permits
`https://www.google.com` in `frame-src` for exactly this, and the Phase 16 plan
classifies it as **no new table** — CMS fields plus a validated Maps reference,
with the embed loading on interaction. It is the smallest remaining step that
completes a documented page flow, and it reuses the click-to-load pattern this
topic just built and verified.

Topic 11 (Inventory) and Topic 12 (Admin UX coherence) both read better *after*
Topic 10, because both describe what exists and the map is the last thing that
changes that list.

**The larger unstarted risk remains production media storage** — still the Topic
5 boundary, still unimplemented, and now blocking real photographs for both the
gallery and faculty. It is not a topic in this phase, but it outranks Topics
11–12 if the institute is close to supplying photography.
