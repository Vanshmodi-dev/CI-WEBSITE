# PHASE 16 — TOPIC 7

**Status:** FIXTURE VERIFIED — LIVE NOT TESTED. See §15. Inventory and threat model were
written before any code.

---

## 1. Scope

Implemented: a server-side consumer of the Review Engine's published payload —
defensive normaliser, version handling, failure behaviour, public rendering, and
an admin diagnostics panel.

**Not implemented, deliberately:** any review storage, any review editor, any
review moderation, any `Review`/`AggregateRating` structured data, and any live
connection. See §15.

## 2. Review Engine inventory

Read at `../tp-reviews-engine`:

| File | What it settled |
| --- | --- |
| `README.md` | "A scheduled job collects a client's published reviews … writes a small static JSON payload to a public branch served over HTTPS. The client's website reads that JSON. **Nothing else.**" |
| `schemas/payload.v1.schema.json` | The full contract: `schema_version`, `artifact`, `client`, `listing`, `provenance`, `stats`, `reviews[]`, `pagination`, `notices`. |
| `frontend/SAFETY.md` | The consumer rules. See the four that changed this design, below. |
| `frontend/recipes/nextjs-app-router.md` | Server-side fetch, `next: { revalidate }`, `payload ?? {}` on failure, never `notFound()`. |
| `examples/static/reviews.json` | A real payload — **which violates its own schema**, see §5. |
| `clients/_commerce-insight.config.json` | `enabled: false`, `publish.schema_org: false`, `display.order: newest`, `display.latest_count: 20`, `display.include_rating_only: true`. |

### A. What the engine is responsible for

Harvesting, reconciling against a private ledger, deciding what may be
published, and writing the payload. **It is the publish gate.** There is no
per-review `published` field in the schema because a review that is not cleared
for publication never reaches the payload at all.

### B. What this website is responsible for

Fetching one static file server-side, distrusting it, and rendering it.

### C–D. What crosses the boundary, and what must not

Crosses: ratings, review text, author display names and initials, dates,
source, owner replies, and the freshness/provenance block.

**Must not cross:** anything that would make a visitor's browser contact a
review source. `SAFETY.md` §3 states INV-01 — *"the visitor's browser never
contacts a review source"* — and §7 lists "lazy-loading avatars from the
source's CDN" as a thing that "looks helpful and is not", because it breaks
INV-01. **So `author_avatar_url` is read and discarded.** Initials are rendered
instead. That also means no new CSP origin and no new `remotePatterns` entry.

### E–F. Trusted vs untrusted

**Nothing in the payload is trusted.** It is our own system, but it crosses an
application boundary, and its own example already disagrees with its own schema.
The only thing treated as authoritative is the *fact of publication*: a review
present in the payload has passed the engine's gate.

### G–K. Behaviour under trouble

Taken from Master Plan §13, which already specified this:

| Payload state | What the site does |
| --- | --- |
| `completeness: "full"` | Render, plus "Synced from Google · date" |
| `notices: ["harvest_partial"]` | Render, but the count is labelled "showing recent reviews" rather than presented as a total |
| `notices: ["awaiting_first_full_harvest"]` | **Band hidden entirely** |
| Fetch fails, 404, 500, timeout, malformed, empty | **Band hidden entirely** |

`SAFETY.md` §4: *"A failure is never the visitor's problem … No error text."*
The site therefore shows no "reviews unavailable" message. It shows nothing.

## 3. Data flow

```
Review Engine (scheduled, offline)
  -> reviews.json on a public HTTPS branch
  -> server-side fetch, revalidate 6h, size-capped, timeout-bounded
  -> defensive normalisation into a small internal type
  -> our own React components (server-rendered)
  -> visitor
```

The visitor's browser makes **zero** review-related requests: the payload is
fetched on the server and the markup arrives already rendered. That is stronger
than the engine's own recipe, which fetches from the browser.

**No database.** No table, no migration, no local copy. The engine remains the
single source of truth, per Master Plan Decision 02.

## 4. Trust boundary

`raw text -> size check -> JSON.parse -> shape checks -> per-field normalisation
-> bounded internal type`.

There is no `as Payload` anywhere. The normaliser accepts `unknown` and returns
a type whose every field it constructed itself.

## 5. Schema handling — and why strict validation would be wrong

`schema_version` must be exactly `1`. Anything else — 2, `"1"`, absent, `null`,
`NaN` — is refused, and refusal means the band does not render.

**But the payload is NOT validated strictly against the JSON Schema, and that is
deliberate.** The engine's own published example violates its own schema twice:

| Violation | Schema says | Example has |
| --- | --- | --- |
| `reviews[].id` | `^[0-9a-f]{32}$` | 64 hex characters |
| `reviews[].owner_reply` | `additionalProperties: false` | an extra `date_precision` key |

A strict validator would reject that payload outright and the reviews band would
never appear. `additionalProperties: false` is a **publisher-side** rule — it
stops an internal field leaking into a published artifact. A consumer that
enforced it would break on every forward-compatible addition the engine ever
makes.

So the consumer rule is: **ignore what you do not recognise, refuse what is
unsafe, bound what is unbounded.** The id is treated as an opaque hex token of
bounded length and is never used as a path or a URL.

## 6. Files added and changed

**Added**

| File | What it is |
| --- | --- |
| `src/lib/reviews/payload.ts` | The defensive normaliser. Pure, no imports, `unknown` in, a type it constructed itself out. |
| `src/lib/reviews/fetch.ts` | `server-only`. Protocol allowlist, timeout, size ceiling, cache policy. Never throws. |
| `src/app/(site)/reviews/page.tsx` | The public page. `revalidate = 21600`. |
| `src/components/domain/review-provenance.tsx` | Says where the reviews came from and how complete they are. |
| `src/app/admin/(dashboard)/reviews/page.tsx` | Diagnostics. No create, edit, delete, hide or reply. |
| `src/app/admin/(dashboard)/reviews/actions.ts` | One Server Action that clears a cache and can change nothing. |
| `src/app/admin/(dashboard)/reviews/refresh-button.tsx` | The button for it. |
| `tests/reviews.test.ts` | 49 unit tests over the normaliser. |
| `scripts/verify-reviews.mjs` | 224 browser assertions against a local fixture. |

**Changed**

| File | Change |
| --- | --- |
| `src/app/(site)/page.tsx` | A reviews band that renders only when there is a payload with reviews in it. |
| `src/components/domain/public-cards.tsx` | Added `StarRating` and `ReviewCard`. |
| `src/config/nav.ts` | `/reviews` registered, and added to `HIDDEN_UNTIL_POPULATED`. |
| `src/app/sitemap.ts` | `/reviews` listed, without a `lastModified` we cannot support. |
| `src/lib/deployment-contract.ts` | `REVIEWS_PAYLOAD_URL` registered as optional; `/reviews` and `/admin/reviews` registered as routes. |
| `src/components/admin/shell.tsx` | Reviews in the admin navigation. |
| `scripts/verify-seo.mjs` | `/reviews` added to `PUBLIC_ROUTES` — see §12. |
| `package.json` | `verify:reviews` script. |

**Not touched:** `prisma/schema.prisma`, `prisma/migrations/**`. `git status prisma/`
is empty.

## 7. Database — the four things that had to remain true

Checked against the running PostgreSQL, not against intent.

| Claim | How it was checked | Result |
| --- | --- | --- |
| No reviews table exists | `information_schema.tables` in schema `public` | 13 tables, **0** matching `/review/i` |
| No review data is stored here | there is no table to store it in, and no Prisma model | holds |
| No migration was added or edited | `git status --porcelain prisma/` | empty |
| The hand-written CHECK constraints survive | `pg_constraint` where `contype='c'` | **34** present, none dropped |

The 34 are the Phase 12 set plus those introduced by the `site_settings`,
`media_assets` and `faculty` migrations. `npm run verify:constraints` exercises
them against the database and reports **43 passed, 0 failed**.

## 8. Security properties, and the evidence for each

Every row below is an executed assertion, not a design intention.

| Property | Evidence |
| --- | --- |
| INV-01 — the visitor's browser never contacts a review source | §1 of the suite records every request the browser makes while loading `/` and `/reviews`: **zero** to the payload origin. The payload is read on the server. |
| Review text cannot execute | `<script>`, `<img onerror>`, `javascript:` and an SVG payload are all rendered as visible text; the browser reports no script execution and no injected element. |
| No third-party review markup | No `Review`, `AggregateRating`, `ratingValue` or `reviewCount` appears in any HTML or JSON-LD on any route. `schema_org` in the payload is read and discarded. |
| Provenance cannot be forged | A payload claiming a different source label, a fabricated total, or `completeness: "full"` alongside a partial harvest is degraded to what can be supported. |
| No upstream detail reaches the browser | Neither route contains `REVIEWS_PAYLOAD_URL`, the fixture host, or the fixture port. |
| No review code in a client bundle | Every `<script src>` on `/reviews` was fetched and searched: no `normalisePayload`, no env var name. |
| The payload cannot amplify | Refused on `content-length` over 512 KB, and again on measured bytes; capped at 20 reviews; per-field length ceilings. |
| An upstream failure is never the visitor's problem | 12 failure modes — unset URL, `file:`/`data:`/`javascript:` URLs, plaintext to a non-loopback host, DNS failure, connection refused, 404, 500, HTML-served-as-200, oversized body, malformed JSON, wrong schema version, timeout — every one returns **200** with the neutral empty state, no stack trace, no upstream URL. |
| Fail closed | Each of those hides the band rather than rendering something partial. |
| CSP unchanged | No `connect-src` entry was needed, because the browser makes no request. `frame-ancestors 'none'` and `X-Frame-Options: DENY` are untouched. `npm run verify:security` reports 262 passed, 0 failed. |
| The admin cannot author a review | The screen has zero inputs and no create/edit/delete/hide/reply control; the single Server Action clears a cache. Anonymous access is redirected. |

## 9. Defects found and fixed

### 9.1 Product defects

| # | Defect | Why it mattered | Fix |
| --- | --- | --- | --- |
| P-1 | The plaintext-URL guard keyed on `NODE_ENV !== 'production'` | `next start` sets `NODE_ENV=production`, so a production build on a laptop — which is how this project is verified — refused the fixture URL and rendered nothing. Every attack assertion then passed vacuously. **The same mistake Topic 5 made with media storage.** | Key on a loopback hostname instead. Stricter, not looser: a deployed server configured with `http://reviews.example.com` is now refused, which the old rule would have allowed whenever `NODE_ENV` was unset. |
| P-2 | A review card could not shrink below its widest unbreakable word | A grid item defaults to `min-width: auto`. One reviewer writing a long hyphen-free run widened the card, the grid and the document: `/reviews` **and the homepage** scrolled sideways at 320, 360, 375, 390, 412, 430 and 768px. Nothing in the payload is under our control. | `min-w-0` on the card and `overflow-wrap: anywhere` on the review and reply text. |
| P-3 | Review cards had no heading | The cards were a wall of quotes with no landmark, so a screen-reader user could not move between reviews by heading. | The reviewer's name is an `<h3>`, styled as body text — the visual weight belongs to the review, not to the stranger's name. |

### 9.2 Harness defects — every one of which had produced a false result

Recorded because each was a test lying, and the pattern is the point.

| # | Defect | The false result it produced |
| --- | --- | --- |
| H-1 | A refresh click was treated as a successful cache clear whenever the rate-limit message was absent | Any other failure of the action was read as success, so the next scenario ran against the **previous** scenario's cached payload. Section 10 reported three failures against a normaliser that was provably correct; sections whose assertions are all negative would have passed for entirely the wrong reason. Fixed by requiring the action's own confirmation, falling back to a restart. |
| H-2 | The suite ran `next start` against whatever was already in `.next` | It reported 16 layout failures against source that had already been fixed — and would just as happily have reported zero against source that had not. Fixed: the suite now builds its own artifact every run. |
| H-3 | A zombie `next start` from an earlier session held port 3310 | Every render assertion failed while pointing at correct code. Fixed with a `portIsFree()` refusal, a Windows tree-kill, and teardown assertions that the ports were actually released. The same zombie later turned up on port 3000 during regression — see §12. |
| H-4 | Prose assertions used regexes over raw HTML | React splits interpolated text (`2<!-- --> <!-- -->reviews`), so correct output failed. Fixed with a `visibleText()` helper reading `innerText`. |
| H-5 | The product's 6-per-hour refresh limit was silently exhausted mid-suite | The suite needs ~21 cache clears; from the 7th on they were refused, so later scenarios tested stale payloads. Fixed by restarting the site — **the product limit was not weakened**. |
| H-6 | A regex inside a `page.eval` template literal | A template literal eats `\d`, so `/^Rated \d out of 5$/` became `/^Rated d out of 5$/` and reported 0 of 4 accessible names valid on markup that was correct. Fixed with string methods. |
| H-7 | Content assertions read the page once after a scenario switch | `revalidatePath` marks a page stale rather than rebuilding it inline, so the first request can still serve the previous render. Fixed with a bounded poll that reports how many requests it took. |
| H-8 | `useFixture` was named like a React hook | ESLint's `rules-of-hooks` failed the lint run. Renamed `withFixture` rather than suppressing the rule. |

## 10. Accessibility

Measured in Chrome at 1280px unless stated.

| Check | Result |
| --- | --- |
| Star ratings expose a readable name | 4 of 4 carry `Rated N out of 5` on a `role="img"` group |
| Star glyphs are hidden from assistive tech | all `aria-hidden` |
| Exactly one `h1` | yes |
| Heading levels do not skip | yes |
| Every review card is headed | 4 of 4 |
| No image missing `alt` | yes |
| No positive `tabindex` | yes |
| No `div` used as a button | yes |
| Touch targets ≥ 24×24 at 320px on `/reviews` and `/admin/reviews` | yes |
| Dark-mode AA contrast on `/reviews` | passes as part of `verify:ux` (270 passed, 0 failed) |

## 11. Responsive

Widths 320, 360, 375, 390, 412, 430, 768, 1024, 1280 on `/reviews`, `/` and
`/admin/reviews` — 27 checks, all passing after P-2.

The layout fixture is deliberately hostile: a ~300-character review, a
70-character unbreakable token, a one-word review, and a review with a rating
and no text at all. No card overflows its own box at 320px.

## 12. Performance

Local production build, warm, median of six requests.

| Route | Server render | HTML | JS chunks | JS bytes | Requests |
| --- | --- | --- | --- | --- | --- |
| `/reviews` | 17 ms | 52 KB | 9 | 154 KB | 21 |
| `/` | 17 ms | 117 KB | 9 | 151 KB | 29 |
| `/faculty` | 18 ms | 60 KB | — | — | — |

`/reviews` ships the **same nine shared chunks** as every other page. There is no
reviews-specific client chunk, because there is no reviews client code.

The payload is fetched at most once every six hours, matched to the harvest
cadence rather than to our traffic, and tagged so the admin button can expire it.

**One budget check fails, and it is pre-existing.** `npm run verify:budget`
reports `/` and `/results` at 22 requests against a budget of 20. This was
proven pre-existing rather than assumed: the working tree was stashed, HEAD
(`e7defe6`, Phase 16 faculty) was rebuilt and measured, and it produced the
**identical** `22 > 20` on both routes with none of Topic 7 present. The excess
is Next's RSC link prefetching plus two demo student photographs; no request
belongs to reviews.

## 13. SEO

`/reviews` is listed in the sitemap without a `lastModified`, because the
freshness of these reviews belongs to the engine's harvest and not to anything
this application publishes.

It is in `HIDDEN_UNTIL_POPULATED`, so its **menu entry** stays hidden until a
teacher turns it on — the same treatment `/faculty` already had, and the reason
`nav.ts` gives for that treatment explicitly keeps such routes in the sitemap.

`/reviews` was added to `PUBLIC_ROUTES` in `verify-seo.mjs` so the new page gets
the same metadata, canonical, contrast, overflow and semantics coverage as every
other public route. `npm run verify:seo`: **376 passed, 0 failed**.

No `Review` or `AggregateRating` markup was added anywhere.

## 14. Regression

All suites run against a clean production build of the working tree.

| Suite | Result |
| --- | --- |
| `npm test` (unit) | 416 passed, 0 failed |
| `verify:reviews` | **224 passed, 0 failed** |
| `verify:security` | 262 passed, 0 failed |
| `verify:seo` | 376 passed, 0 failed |
| `verify:ux` | 270 passed, 0 failed |
| `verify:cms` | 71 passed, 0 failed |
| `verify:media` | 112 passed, 0 failed |
| `verify:faculty` | 130 passed, 0 failed |
| `verify:teacher` | 121 passed, 0 failed |
| `verify:import` | 116 passed, 0 failed |
| `verify:integration` | 67 passed, 0 failed |
| `verify:e2e` | 62 passed, 0 failed |
| `verify:public` | 46 passed, 0 failed |
| `verify:constraints` | 43 passed, 0 failed |
| `verify:revalidation` | 10 passed, 0 failed |
| `typecheck` / `lint` | clean |
| `verify:budget` | 78 passed, 2 failed — **pre-existing, proven at HEAD** (§12) |
| `verify:preflight` | 1 failure: `P-DB-12 content tables are empty` — **correct behaviour**, see below |

Three failures during the regression run were environmental, not defects, and
are recorded because each briefly looked like one:

1. **A zombie `next start` owned port 3000.** My own server never bound, and the
   suites measured a stale build whose CSS chunk no longer existed — which
   presented as dark-mode contrast failures, 200%-zoom reflow failures and a
   missing `prefers-reduced-motion` rule, all at once. Killing it and rebuilding
   cleared all of them.
2. **An aborted `verify:public` run left `ZZDEMO` rows behind**, and the build
   prerendered the homepage while they existed, so `/` requested a fixture image
   that does not exist and logged a 400. Rebuilding against a clean database
   fixed it. The rows were removed by the suite's own cleanup on a successful
   re-run.
3. **`verify:faculty` tripped the upload rate limiter**, because `verify:media`
   had just consumed the window in the same server process. Restarting the
   server and re-running gave 130 passed, 0 failed. The product limit was not
   changed.

`P-DB-12` fails because the local database holds ZZSHOW demo content and nothing
else (`seed:demo:count` reports "Non-ZZSHOW content rows: 0"). That check exists
to stop demo data being deployed, so it is the gate doing its job, not a defect.

## 15. Verification status — the distinction that must not be blurred

### **FIXTURE VERIFIED — LIVE NOT TESTED**

**What was verified against a real HTTP server:** everything in §8, §10, §11 and
§12. The suite starts an actual HTTP server on port 3311, serves real payloads
over a real socket, and drives a real Chrome against a real production build. It
is not a mock: the fetch, the timeout, the size ceiling, the JSON parse, the
normaliser, the render and the CSP are all genuinely exercised.

**What was NOT verified:** any contact with the real Review Engine. The engine is
not activated for this client — `clients/_commerce-insight.config.json` has
`enabled: false` — and no Google Business Profile credentials exist. No
credentials were invented and no production review data was manufactured.

**What this means in practice:** the consumer is proven to behave correctly
against payloads shaped like the engine's published contract, including its own
example and including hostile variants. Whether the engine, once activated,
publishes exactly that contract is **untested and cannot be tested here.** The
first live payload must be checked against `/admin/reviews`, which exists for
precisely that.

Every review string used anywhere in this work is prefixed `ZZREV` and lives only
in test fixtures.

## 16. What this deliberately does not do

- No reviews table, no review storage, no migration.
- No review CMS, no moderation, no replies, no hiding, no reordering. The admin
  screen explains why, in plain language, to the teacher who will look for those
  controls.
- No `Review` or `AggregateRating` structured data for third-party reviews, and
  `schema_org` in the payload is discarded rather than trusted.
- No avatars. The normaliser reads `author_avatar_url` and `author_profile_url`
  and throws them away — loading them is the specific temptation that breaks
  INV-01.
- No live connection, and no invented credentials to fake one.

## 17. Residual risks

| Risk | Status |
| --- | --- |
| The live payload may differ from the published contract | Unavoidable here. The consumer fails closed on anything it does not recognise, and `/admin/reviews` reports why. |
| The engine could publish a payload we degrade more than intended | A partial harvest suppresses the total and the average rather than stating a number we cannot support. Visible on the admin screen. |
| A reviewer's name is rendered as given | It is public on Google already; it is escaped, length-bounded, and never used in an attribute or a URL. |
| `REVIEWS_PAYLOAD_URL` could be set to a plaintext non-loopback URL | Refused before a request exists. |
| The 6-per-hour refresh limit is per server process | Acceptable: it bounds our load on the data origin, and a restart clearing it is not a security boundary. |
| Pre-existing request-count budget breach on `/` and `/results` | Proven pre-existing at HEAD. Not addressed here — it is outside this topic and fixing it means changing prefetch behaviour site-wide. |

## 18. For whoever activates this

1. Activate Commerce Insight in the Review Engine and let it publish a payload.
2. Set `REVIEWS_PAYLOAD_URL` to the published `reviews.json` URL. **https only**
   — plaintext is refused unless it is loopback. Do not prefix it
   `NEXT_PUBLIC_`; it is read on the server and a public prefix would inline it
   into client JavaScript.
3. Open `/admin/reviews`. It will say whether the connection works and what
   visitors are seeing. If it does not work, it says why in plain language.
4. Turn on the **Reviews** menu entry in Website text once there are reviews
   worth linking to.
5. The band appears on the homepage on its own. Nothing else needs switching on.

## 19. Verdict

Topic 7 is complete as specified: a defensive, server-side, read-only consumer of
the Review Engine with no storage, no editor, no structured-data claims, and no
invented data — **fixture verified, live untested**, and honest about which is
which.

Three product defects were found and fixed, two of them (the sideways scroll and
the missing card headings) affecting real visitors on real screens. Eight harness
defects were found and fixed; every one of them had produced a passing or failing
result that was not true, which remains the most valuable thing this process
produces.

The launch switch remains OFF. Topics 8–12 have not been started.
