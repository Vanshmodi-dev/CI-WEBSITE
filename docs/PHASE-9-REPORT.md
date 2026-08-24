# Phase 9 — SEO and performance engineering

**Date:** 24 August 2026
**Baseline:** `73d1421` (Phase 8)

---

## 1. Executive summary

Phase 9 measured the site before changing it, and the measurement found something
the previous six phases had not: **the production site did not hydrate at all.**
The Content Security Policy set in Phase 3 blocked every one of the five inline
scripts Next.js uses to deliver the React Server Component payload, so React
never started. In practice the mobile navigation drawer — the only navigation
below the `lg` breakpoint, on a site built mobile-first for parents on Android —
could not open. Lighthouse reported it in the first run of the phase.

Four more real defects followed from measuring rather than assuming: `/stories`
silently discarded every story past the sixtieth while serving 224 KB of HTML;
an active filter chip rendered at 1.97:1 contrast in dark mode; the site had no
favicon and 404'd on every page load; and the year filter chips ignored the
programme filter, which Phase 8 had already flagged.

All five are fixed. Alongside them: fonts on the critical path fell 25%, the
sitemap now derives its dates from real content instead of the build clock,
filtered URLs are kept out of the index without being blocked from crawling, and
the byte budgets are now enforced by a script rather than described in a
document.

**Automated checks: 276 → 697.** Lighthouse desktop: Performance 100,
Accessibility 100, Best Practices 100, zero console errors. The database ends
the phase with **0 rows in every table**, and no institute fact was invented.

---

## 2. Baseline measurements

Taken from a production build (`next start`), before any Phase 9 change.
**All byte figures are compressed wire bytes counted off the socket.**

> An earlier draft of the measurement script used `fetch`, which transparently
> decompresses, and reported 612 KB of JavaScript for a page that transfers
> 189.6 KB. Every number below is what the socket actually carried.

### 2A. Empty database — the current real state

| Route | TTFB | HTML | JS | CSS | Font | Total | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 9 ms | 7.4 KB | 189.6 KB | 8.9 KB | 118.6 KB | 324.4 KB | 17 |
| `/about` | 11 ms | 7.6 KB | 189.6 KB | 8.9 KB | 118.6 KB | 324.6 KB | 17 |
| `/courses` | 7 ms | 7.2 KB | 189.6 KB | 8.9 KB | 118.6 KB | 324.2 KB | 17 |
| `/courses/[slug]` | 8 ms | 7.2 KB | 189.6 KB | 8.9 KB | 118.6 KB | 324.2 KB | 17 |
| `/results` | 33 ms | 8.9 KB | 189.6 KB | 8.9 KB | 118.6 KB | 325.9 KB | 17 |
| `/stories` | 12 ms | 7.0 KB | 189.6 KB | 8.9 KB | 118.6 KB | 324.0 KB | 17 |
| `/announcements` | 9 ms | 6.7 KB | 189.6 KB | 8.9 KB | 118.6 KB | 323.7 KB | 17 |
| `/contact` | 9 ms | 7.1 KB | 189.6 KB | 8.9 KB | 118.6 KB | 324.1 KB | 17 |
| `/admissions` | 27 ms | 10.1 KB | 192.1 KB | 8.9 KB | 118.6 KB | 329.6 KB | 18 |

### 2B. 1,000 synthetic students — realistic scale

Fixture: 1,000 published+consented results, 3,000 subject scores, 80 stories, 30
batches, 12 announcements, 500 enquiries. Every row prefixed `ZZTEST`, all
deleted afterwards (§23).

| Route | TTFB | HTML (wire) | **HTML (raw)** | Total | Requests |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 8 ms | 10.3 KB | 79.0 KB | 327.3 KB | 17 |
| `/results` | 19 ms | 11.9 KB | 118.3 KB | 328.9 KB | 17 |
| `/stories` | 9 ms | 12.8 KB | **223.7 KB** | 329.9 KB | 17 |

That 223.7 KB is the finding of the table. Compressed it looks harmless at
12.8 KB, because repeated markup compresses beautifully — but the browser still
parses all 223.7 KB. It is also the number that exposed the truncation bug: the
page was rendering 60 of 80 published stories and saying nothing about the other
twenty.

### 2C. Font composition

| Family | Latin file(s) | Bytes | Preloaded |
| --- | ---: | ---: | :-: |
| Source Serif 4 | 1 (variable, 400/600/700) | 49.7 KB | yes |
| IBM Plex Sans | 1 (variable, 400/500/600) | 39.3 KB | yes |
| IBM Plex Mono | **3 (static, one per weight)** | **29.5 KB** | yes |

118.6 KB of font, all five files on the critical path, competing with the CSS at
the exact moment the LCP text needed to paint.

### 2D. Public queries at 1,000 published results

`EXPLAIN (ANALYZE, BUFFERS)` against real PostgreSQL 18.4:

| Query | Plan | Execution |
| --- | --- | ---: |
| results page 1 | index scan + top-N heapsort | 0.27 ms |
| results filtered (programme + year) | bitmap index scan on `toppers_programme_year_idx` | 0.08 ms |
| year facet grouped | bitmap index scan on `toppers_programme_year_idx` | **0.163 ms** |

**No index was added, and no migration was written.** The existing indexes are
used, and at this scale the queries are effectively free. Adding an index to a
query that executes in a sixth of a millisecond would have been work performed
to look thorough.

### 2E. Build output — rendering mode per route

`/` `/about` `/courses` `/announcements` `/contact` static · `/courses/[slug]`
SSG ×5 · `/results` dynamic · `/admissions` dynamic · `/admin/*` dynamic.

---

## 3. Performance budgets

The existing budget was inspected before anything new was written.

**Master Plan §18 set 120 KB gzip of homepage JavaScript.** Phase 3 measured
188.8 KB, and proved the cause was not application code by measuring a route
with *no client components at all* and getting byte-for-byte the same bundle.
Phase 3 recommended ~200 KB as a regression tripwire and left the decision open.

**Phase 9 re-measured five phases later: 189.6 KB.** 0.8 KB of growth across four
phases of feature work. That confirms both the diagnosis and the number, so
**200 KB is now encoded** rather than merely recommended.

`scripts/verify-budget.mjs` enforces, per public route:

| Budget | Limit | Measured (worst route) | Why this number |
| --- | ---: | ---: | --- |
| JavaScript | 200 KB | 192.1 KB | Framework floor confirmed twice, five phases apart |
| CSS | 20 KB | 8.7 KB | Tailwind emits only what is used; 20 KB means it stopped |
| Fonts (critical path) | 100 KB | 89.0 KB | Two variable families |
| Preloaded font files | 2 | 2 | A third family is a design decision, not an accident |
| HTML (wire) | 20 KB | 12.2 KB | At 1,000 records |
| **HTML (uncompressed)** | **150 KB** | 116.3 KB | **The one that catches unpaginated lists** |
| Total transfer | 320 KB | 300.2 KB | |
| Requests | 20 | 15 | |

The uncompressed-HTML limit is the important one. `/stories` at 223.7 KB would
have failed it; that is precisely the bug it exists to catch.

**TTFB is measured and printed but not enforced.** A Windows development box
running PostgreSQL, Node and the harness on one machine says nothing reliable
about a Vercel function talking to a hosted database. Asserting a number there
would be asserting a number about this laptop.

**LCP, CLS and TBT stay with Lighthouse**, which owns the experience budgets —
see §12.

---

## 4. Server versus client rendering

The site is server-first and stays that way. Every public route was audited.

| Route | Rendering | Client JS of our own | Justification |
| --- | --- | --- | --- |
| `/` | Static (ISR 15m) | none | Server Components throughout |
| `/about` | Static | none | Static prose |
| `/courses` | Static (ISR 1h) | none | Reads batches server-side |
| `/courses/[slug]` | SSG ×5 (ISR 1h) | none | `generateStaticParams` over published courses |
| `/results` | Dynamic | none | Reads `searchParams`; see §5 |
| `/stories` | Dynamic | none | Reads `searchParams`; see §5 |
| `/announcements` | Static (ISR 15m) | none | Window enforced in SQL |
| `/contact` | Static | none | Static prose |
| `/admissions` | Dynamic | `enquiry-form.tsx` | `useActionState`; works without JS |
| *(all routes)* | — | `site-header.tsx` | Mobile drawer: focus trap, Escape, `aria-modal` |

**Two client components on the entire public site**, both justified:

- **`site-header.tsx`** — the mobile drawer needs real interactivity, and it does
  the accessible version of it: Escape closes, focus moves to the close button
  and returns to the trigger, `aria-modal` and `aria-expanded` are set. Removing
  the client boundary would mean removing that.
- **`enquiry-form.tsx`** — `useActionState` for inline validation, and it
  degrades to a plain form post without JavaScript.

**No library was added.** No state library, no animation library, no carousel, no
icon package — the four SVG glyphs in the header are still inline, because a
dependency for four glyphs costs more than it saves.

**Converting either component to a Server Component would save nothing
measurable.** Phase 3 established, and Phase 9 re-confirmed, that a route with
zero client components ships the same bundle: the App Router baseline is the
floor. The saving would be accessibility, not bytes.

---

## 5. Rendering strategy

Decided from measurement, not preference.

| Route | Strategy | Reasoning |
| --- | --- | --- |
| `/` | ISR 15 min + `revalidatePath` | Shows the notice banner; publishing refreshes it immediately |
| `/about`, `/contact` | Static | No data |
| `/courses` | ISR 1 h + `revalidatePath` | Batch list |
| `/courses/[slug]` | SSG + ISR 1 h | Five known slugs; batches revalidate on publish |
| `/announcements` | ISR 15 min + `revalidatePath` | Window enforced in SQL |
| `/results` | **Dynamic — kept, and the misleading `revalidate` removed** | See below |
| `/stories` | **Static → dynamic, deliberately** | See below |
| `/admissions` | Dynamic | Fresh anti-spam token per render |

### `/results` — dynamic is correct; the `revalidate` export was not

Phase 8 flagged `/results` as "possibly dynamic when it need not be". Measured:
it reads `searchParams`, which makes it dynamic, and it carried
`export const revalidate = 3600` — **which is inert on a dynamic route**. That
line had sat there for three phases stating the page was cached for an hour when
it was rendered fresh every time. A comforting number describing nothing.

It is removed, with a comment explaining why there is no replacement. Dynamic is
the right answer: the queries execute in 0.163 ms and the render measured 19 ms
against 1,000 published results.

`revalidateResults()` still calls `revalidatePath('/results')`, which is a no-op
for this route. It is kept — and now documented as a no-op — because `/` genuinely
is cached and genuinely does show a results band, and because deleting the line
would tell the next reader that results are not meant to refresh.

### `/stories` — static to dynamic, with the trade stated

Pagination requires `searchParams`, which costs the ISR cache. That trade was
made knowingly:

| | Before | After |
| --- | ---: | ---: |
| Stories rendered | 60 of 80 (silently) | 12, with "Showing 12 of 80" on screen |
| HTML, uncompressed | 223.7 KB | 71.1 KB |
| Rendering | Static (ISR 1 h) | Dynamic, 26 ms |

A cached page that omits a fifth of the content is not the faster option; it is
the wrong one.

An alternative — `/stories/2` as real static paths via `generateStaticParams` —
would keep ISR *and* give better URLs. It is a larger change and inconsistent
with `/results`; recorded in §22 as an option, not done here.

### Publishing still updates the site immediately

Re-verified after every rendering change: `verify-revalidation.mjs` 9/9,
`verify-integration.mjs` 47/47. A teacher publishes, the public page reflects it,
no redeploy.

---

## 6. The results filter fix

Phase 8 deferred: *"Year-chip counts on `/results` ignore the active programme
filter."*

Fixed at the query layer, and the mirror-image defect fixed with it.

Each facet is now scoped to **the other** filter, never to itself:

- year chips are scoped to the active **programme** — so they still list every
  year available for that programme, rather than collapsing to the one selected;
- programme chips are scoped to the active **year**.

Both grouped in the database with `_count`. Counting in JavaScript would have
meant fetching all 1,000 rows to count them.

Verified at 1,000 synthetic results:

| Query | Year chips | Programme chips |
| --- | --- | --- |
| none | 250 each | 200 each |
| `?programme=CLASS_11` | **50 each** | 200 each |
| `?year=2025` | 250 each | **50 each** |
| `?year=2020&programme=CMA` | — | *"Nothing published for that filter yet"* |
| `?programme=NOT_A_PROGRAMME` | identical to unfiltered | identical to unfiltered |

The counts are also exposed to assistive technology (`aria-label="2025 — 50
results"`) without changing the visible chip design.

**Cost: none measurable.** A/B of the data layer over 60 runs: three queries
6.71 ms median, four queries 5.99 ms median. The added query runs inside the
existing `Promise.all` and hides in the latency already there.

---

## 7. Technical SEO

Every public route now carries, and is asserted to carry, a unique `<title>`, a
unique meta description over 40 characters, a self-referential canonical, the
five Open Graph properties, `twitter:card`, `lang="en-IN"`, and exactly one
`<h1>`. 13 routes × ~12 assertions.

**No SEO copy was invented.** Titles and descriptions are assembled from
`src/config/institute.ts` and the programme label table. The filtered results
title reads `Results — Class 11 Commerce 2025` because those words come from the
label table and the database, not from a copywriter trying to please a crawler.

`not-found.tsx` gained a title and an explicit `noindex, follow`.

---

## 8. Canonical URL strategy

One rule, in `src/lib/indexing.ts`, applied to `/results` and `/stories`.

| View | Canonical | Robots | Why |
| --- | --- | --- | --- |
| Unfiltered, page 1 | itself | *inherits sitewide* | The real page |
| Filtered (`?year=`, `?programme=`) | the bare path | `noindex, follow` | A navigation state, not a document |
| Paginated (`?page=N`) | **itself** | `index, follow` | Page 2 is the only copy of its records |
| Unrecognised filter value | the bare path | *inherits sitewide* | Narrowed away by `asProgramme` |

The paginated case is the one most often got wrong. Canonicalising `?page=2` back
to page 1 is the common reflex — and here it would tell Google to ignore the only
copy of those results, because results and stories have no individual URLs. Each
page is therefore self-canonical, which is also Google's stated guidance.

Filtered views keep `follow` so the crawler still walks through them to the
records. They are **not** blocked in robots.txt: a URL the crawler cannot read is
a URL whose `noindex` it never sees and whose links it cannot follow.

**The launch switch cannot be punched through, one page at a time.** A page-level
`robots` key overrides the layout's sitewide `noindex`. `pageMetadata` therefore
applies an `index: true` instruction **only when `isIndexable()` already agrees**;
a `noindex` instruction is always honoured, because it can only ever narrow.
Asserted on every route and every paginated variant.

**Trailing slashes:** Next's default (`trailingSlash: false`) 308-redirects
`/about/` to `/about`. The root canonical renders as the bare origin, which is
the same URL as origin + `/`.

---

## 9. Sitemap

Rewritten to derive from content rather than from the clock.

**Before:** every entry carried `lastModified: new Date()` — a claim that all
nine pages changed at the moment of the last deploy. Not merely imprecise: a
claim we cannot support, and one a crawler learns to discount.

**Now:** `lastPublishedAt()` reads the real `max(updatedAt)` of published content
through the **same visibility predicates the public pages use**, so an
unpublished record cannot move a date. Pages whose change history we do not track
(`/about`, `/courses`, `/admissions`, `/contact`) carry **no `lastmod` at all**,
because omitting is honest and inventing is not.

The sitemap is now content-derived, so it is revalidated: `revalidate = 3600`,
plus `revalidatePath('/sitemap.xml')` from every publish helper.

Asserted (§4 of `verify-seo.mjs`): well-formed XML · 13 entries, all resolving
200 · no `/admin` · no query-string variants · no duplicates · exactly the
expected route set, nothing more · no `lastmod` on untracked pages. At 1,000
synthetic students: 13 entries, 9 with `lastmod`, **0 containing `ZZTEST`** —
individual student records have no URLs and appear nowhere.

---

## 10. Robots strategy

**The launch switch was not touched.** `SITE_IS_LAUNCHED` is still `false`, and a
unit test now fails if Phase 9 flipped it.

Two changes, both audit findings:

1. **The `Sitemap:` line is removed from the pre-launch response.** `Disallow: /`
   next to `Sitemap:` is a self-contradictory file — one line says stay out, the
   next hands over a list of everything to visit. Crawlers resolve that
   inconsistently and there was no reason to find out how. The sitemap is
   submitted by hand at launch.
2. **`/admin` is now listed explicitly in both branches.** `Disallow: /` already
   covers it pre-launch; the redundant line exists so that whoever relaxes the
   pre-launch rule cannot relax the admin rule by accident at the same moment.

Three independent layers still guard `/admin`: robots.txt, `noindex` on the
pages, and absence from the sitemap.

---

## 11. Structured data

Audited, extended and constrained.

**Added:** `WebSite` (name, url, `inLanguage`, publisher-by-`@id`) and
`BreadcrumbList` on course pages. Both emitted as a single `@graph` in the root
layout so the WebSite's publisher reference resolves to the organisation rather
than describing a second, unrelated institute.

**Improved:** `Course.provider` now references the organisation by `@id` instead
of redeclaring its name and URL, so the two cannot drift apart.

**Deliberately absent, and now enforced by test** — `aggregateRating`, `review`,
`ratingValue`, `reviewCount`, `foundingDate`, `founder`, `numberOfStudents`,
`alumni`, `award`, `priceRange`, `offers`, `potentialAction`.

Two of those deserve their reasons stated:

- **No `SearchAction`.** It declares a site-search endpoint. This site has no
  search. The snippet is everywhere online; using it would advertise a feature
  that does not exist.
- **No `offers` / `hasCourseInstance`.** Their absence makes the `Course` entity
  **ineligible for a Course rich result**. That is the correct trade. We do not
  hold the institute's fees, dates or delivery mode, and a rich result built on
  invented ones would be a lie with a star rating on it.

**Structured data must match visible content**, and this is asserted: the schema
locality and telephone are checked against the rendered `/contact` HTML, and every
breadcrumb name is checked against the rendered course page. No hidden claims.

⚠ **The NAP in the structured data is still `unverified`.** The address and phone
carried over from the previous site — which also published fabricated toppers.
Publishing them as machine-readable claims is a launch blocker, not a Phase 9
one: see §19.

---

## 12. Lighthouse and Core Web Vitals

Production build, real Chrome, three routes measured before and six after.

### Desktop preset

| Route | Perf | A11y | Best Practices | SEO | LCP | CLS | TBT | Console errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **`/` before** | 100 | 100 | **93** | 66 | 0.7 s | 0 | 30 ms | **5** |
| `/` after | 100 | 100 | **100** | 66 | 0.8 s | 0 | 50 ms | **0** |
| `/results` after | 100 | 100 | 100 | 66 | 0.7 s | 0 | 20 ms | 0 |
| `/stories` after | 100 | 100 | 100 | 66 | 0.7 s | 0 | 50 ms | 0 |
| `/courses/ca-foundation` after | 100 | 100 | 100 | 66 | 0.7 s | 0 | 60 ms | 0 |
| `/contact` after | 100 | 100 | 100 | 66 | 0.7 s | 0 | 50 ms | 0 |
| `/admissions` after | 100 | 100 | 100 | 66 | 0.7 s | 0 | 20 ms | 0 |

`/results` scored **96 on accessibility before** the contrast fix in §13.

**SEO 66 is a single audit: `is-crawlable`.** Every other SEO audit passes. It
fails because the site is deliberately `noindex` until launch, and it will become
100 the moment the switch is flipped. Nothing was done to make that number look
better.

### Mobile preset — the honest number

Default preset: simulated slow 4G, 4× CPU throttling. This is the audience.

| Route | Perf | A11y | BP | FCP | LCP | CLS | TBT | Total bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 75 | 100 | 100 | 1.6 s | **3.4 s** | 0 | **550 ms** | 315 KiB |
| `/results` | 79 | 100 | 100 | 1.0 s | 3.1 s | 0 | 570 ms | 310 KiB |
| `/stories` | 85 | 100 | 100 | 1.0 s | 2.9 s | 0 | 430 ms | 304 KiB |

**This misses Master Plan §18 (LCP ≤ 2000 ms, TBT ≤ 200 ms) and it is reported
rather than hidden.**

Diagnosed, not guessed. Lighthouse attributes 1,041 ms of mobile main-thread work
to script evaluation, **829 ms of it inside the react-dom chunk** — React
hydrating the App Router tree on a throttled CPU. This is the same finding Phase
3 reached from the other direction, and the route back to §18 runs through the
framework choice, not through tuning. The LCP element is a text paragraph whose
phases are 14% TTFB and the remainder render delay behind one render-blocking
stylesheet (166 ms).

*Mobile was not measured before the phase, so there is no before/after
comparison for these figures. Not measured — the baseline Lighthouse run used the
desktop preset only.*

`lighthouserc.json` is now the **mobile** gate at the measured floor plus
headroom, and `lighthouserc.desktop.json` holds the **original §18 budgets
unchanged**, which the site meets comfortably. Keeping them in separate files
means the strict budgets stay enforced somewhere instead of being quietly
relaxed to accommodate the throttled run.

**Nothing was done to game the score.** No content hidden, no functionality
disabled, no audit silenced except `is-crawlable`, which was already off.

---

## 13. Bugs discovered

### 🔴 BUG 1 — the production site never hydrated (since Phase 3)

`script-src 'self'` blocked all five inline `<script>self.__next_f.push(…)`
blocks that carry the RSC payload. Chrome reported four CSP violations and
`Minified React error #412`. React did not start.

**Impact:** the mobile navigation drawer could not open. Below `lg` that is the
only navigation on the site. The enquiry form fell back to a plain post (it was
built to, which is the one piece of luck here).

**What was tried first.** `experimental.sri` was enabled, built and measured: it
adds `integrity` to the seven *external* script tags and leaves all five inline
blocks unhashed. It does not solve this.

**Why not a nonce.** Next's own guide is explicit that nonce-based CSP requires
every page to be dynamically rendered — *"static optimization and Incremental
Static Regeneration (ISR) are disabled"*. This site's entire
publish-and-revalidate architecture is ISR, verified end to end in Phase 8.
Trading that away inside a performance phase, to fix a bug, is the wrong order of
operations.

**Fixed** with the documented no-nonce configuration: `script-src 'self'
'unsafe-inline'`. The cost is stated plainly in `next.config.ts` — an injected
inline script would now execute. Mitigating: every string on this site passes
through React's escaping, there is no `dangerouslySetInnerHTML` outside our own
JSON-LD, and no user-supplied HTML is rendered anywhere.

⚠ **Phase 10 owns the permanent policy.** See §21.

The old comment on that CSP read *"deliberately strict … we must not weaken it."*
It was written without measuring, and the policy it defended broke the site.

### 🔴 BUG 2 — `/stories` silently discarded stories, and served 224 KB

`getPublishedStories` defaulted to `take: 60` and the page rendered all of them
with no total and no pagination. Measured at 80 published stories: **twenty were
missing with nothing on screen to say so.** A teacher could publish a story, see
it nowhere, and have no way to find out why.

**Fixed:** paginated at 12, total stated on screen, and `limit` is now a
**required** parameter so no caller can inherit the old default. HTML fell from
223.7 KB to 71.1 KB. A unit test fails if a default is added back.

Same class as the Phase 6 `take: 300` truncation in `listToppers`. Third
occurrence of "a silent cap in a data function" across the project.

### 🔴 BUG 3 — unreadable text in dark mode (WCAG 2.2 AA failure)

The active filter chip on `/results` measured **1.97:1** — Lighthouse's number.
Cause: `bg-navy-50` is a raw palette class that does **not** change with the
theme, while `text-heading` does. In dark mode that painted `#7fb0ff` on
`#ebf4ff`.

Not one instance — a class of bug. Eight sites where a fixed light background sat
under a theme-swapping text token: the results chip, two card hover states, the
secondary button hover, and four in the admin.

**Fixed** with a `--selected` token that swaps with the theme (light `#ebf4ff`,
dark `#182534`), verified at 7.06:1 against heading, 12.32:1 against body and
5.84:1 against muted text. Left alone: `bg-navy-50 text-navy-700` and the
white-on-band button, where both sides are fixed and therefore consistent.

`/results` accessibility: 96 → 100.

### 🟠 BUG 4 — no favicon; `/favicon.ico` 404 on every page load

The site had no icon at all. Blank tab, a 404 logged on every visit, and nothing
for Google to show beside a mobile search result.

**Fixed.** `src/app/icon.png` (96×96), `src/app/apple-icon.png` (180×180) and
`public/favicon.ico` (48×48), generated by `scripts/make-icons.mjs` — a one-off
tool, not a build step.

⚠ **It is a crop of the master artwork, and the client should confirm it.** The
full lock-up downsized to 96px is an illegible smear, so the script extracts the
emblem — arc, cap, quill, open book — as favicons conventionally do. **It is a
crop and a resize, nothing else:** the white background is kept exactly as it is,
and no attempt is made to fake transparency. Replaceable by dropping a new file
at the same path.

### 🟠 BUG 5 — year chips ignored the programme filter

Phase 8's deferred item. Fixed at the query layer — §6.

### 🟡 BUG 6 — `export const revalidate = 3600` on `/results` was inert

Stated a one-hour cache on a route that renders per request. Removed, with a
comment explaining why there is no replacement. §5.

### 🟡 BUG 7 — sitemap `lastModified` was the build clock

Every entry claimed today's date. Now content-derived, or absent. §9.

### 🟡 BUG 8 — robots.txt advertised a sitemap while disallowing everything

Self-contradictory. `Sitemap:` removed from the pre-launch branch. §10.

### 🟡 BUG 9 — IBM Plex Mono weight 500 was downloaded and used nowhere

9.8 KB and one request that bought nothing. Removed; a unit test fails if a
`font-mono` + `font-medium` pairing appears. §14.

### 🟡 BUG 10 — image srcset offered widths up to 3840px for a 40px logo

Browsers never picked them, but the URLs are public and each is a real
image-optimisation job a server can be asked to perform. `deviceSizes` and
`imageSizes` narrowed to what the site renders. §15.

### 🟡 BUG 11 — an unknown `MODE` in the isolation harness silently did nothing

`MODE=clean` (the mode is `cleanup`) left fixtures behind and exited 0, which
then failed three assertions in a *different* suite. Silent success is the one
outcome this project rejects everywhere else. Now refuses with an error.

*(Found the honest way: it cost me a debugging detour during this phase.)*

---

## 14. Font optimisation

Design system unchanged. No family added, none replaced.

| | Before | After |
| --- | ---: | ---: |
| Font files preloaded | 5 | **2** |
| Bytes on the critical path | 118.6 KB | **89.0 KB** (−25%) |
| Total font bytes fetched | 118.6 KB | 108.7 KB |

Two changes:

1. **IBM Plex Mono weight 500 removed** — verified unused before deleting.
2. **IBM Plex Mono `preload: false`** — it sets the 11px uppercase `.eyebrow`
   label and admin chrome, never an LCP element. It has no business competing
   with the headline font. `display: swap` covers the swap-in.

Serif and sans stay preloaded: they are variable fonts, one file each covers
every weight, and they set the text that *is* the largest contentful paint.

`adjustFontFallback` remains on (the default) and CLS measured 0 on every route.

**Deferred, with a number attached:** `subsets: ['latin']` controls *preloading
only* — Next still emits `@font-face` for every unicode range. Measured: **41 of
49 blocks are Cyrillic, Greek, Vietnamese and Latin-Extended, 13.5 KB raw = 27%
of the one render-blocking stylesheet.** Those files never download, but the
declarations are parsed. Removing them requires `next/font/local` with vendored
woff2 files. §22.

---

## 15. Image optimisation

Audited: two `next/image` call sites (the header logo, and portraits in the
public cards). No other images exist, because the institute has supplied none.

- **The logo is 639 bytes as AVIF at 48px.** `formats: ['image/avif',
  'image/webp']` was already correct.
- **`priority` on the header logo was evaluated and kept.** It is not the LCP
  element — that is text — but at 639 bytes it costs nothing and avoids a late
  pop-in above the fold.
- **`deviceSizes` and `imageSizes` narrowed** to `[640, 828, 1080, 1920]` and
  `[48, 64, 96, 128, 256]`. Next's defaults offered sixteen widths up to 3840px.
- **`minimumCacheTTL` raised to one week.** An optimised render is immutable for
  a given source, width and quality.
- Portraits carry explicit `width`/`height` and `object-cover`; CLS measured 0.

**The logo artwork was not modified.** It remains the white-background JPEG with
no alpha channel, used only on light grounds, with `<LogoWordmark>` on dark. No
transparency was faked. The favicon is a crop and a resize of the same file.

Architecturally the pipeline is ready for real student photographs: consent-gated
at the data layer, fixed dimensions, AVIF-first, path-hardened by
`isSafePhotoPath`. **No photograph was invented, synthetic or otherwise** — the
scale fixture sets `consentPhoto: false` on all 1,000 records for exactly that
reason.

---

## 16. CSS optimisation

| | Before | After |
| --- | ---: | ---: |
| Stylesheets | 1 | 1 |
| Wire bytes | 8.9 KB | 8.7 KB |
| Raw bytes | 49.1 KB | 49.1 KB |

Tailwind v4 already emits only what is used. **Nothing was removed**: the
`prefers-reduced-motion` block, the `:focus-visible` ring, the `.sr-only` skip
link and the reading-measure utility are all still there — §19 was treated as a
constraint, not a suggestion.

One `--selected` token was **added** (§13, Bug 3). 27% of the file is `@font-face`
declarations for scripts the site will never render (§14).

---

## 17. Database and query performance

At 1,000 published results, 3,000 subject scores, 80 stories, 500 enquiries.

| Property | Finding |
| --- | --- |
| Indexes | Existing ones are used; planner confirmed by `EXPLAIN ANALYZE` |
| Execution time | 0.08–0.27 ms per public query |
| Pagination | `/results` 24/page, `/stories` 12/page — both surfaced on screen |
| Columns | Every query uses `select`; consent columns are read then consumed server-side |
| Relations | `subjectScores` fetched via one batched `IN` — not N+1 |
| In-memory filtering | **None.** Every predicate is SQL |
| Silent truncation | **Eliminated** — the last default limit is gone |
| Duplicate queries | Homepage runs four in one `Promise.all` |

**No index was added and no migration was written.** At this scale the queries are
free. `getPublishedStories` now requires an explicit `limit`, enforced by the
type system and by a test.

**Privacy filtering stayed in the database.** `published`, `consentResult` and
`consentRef IS NOT NULL` are `WHERE` clauses; `present()` runs on the server; the
browser receives only resolved presentation types. The public site never loads
1,000 students — the maximum any route sends is 24 cards.

---

## 18. Admin/public boundary — no regression

Phase 8's central property was re-verified, and the verification was strengthened.

- 13 public routes checked for `consentRef`, `consentResult`, `consentName`,
  `consentPhoto`, `consentStory`, `displayNameMode`, `publishedAt` — **none
  present in any HTML**.
- **Every JavaScript chunk referenced by a public page** is downloaded and
  scanned for the same field names. The four chunks that *do* contain them are
  admin-only and are never referenced by a public route.
- No public page links into `/admin`. No enquiry data appears on any public
  surface. The sitemap contains no `/admin` URL and no student record.
- `verify-public-isolation.mjs` 50/50, `verify-integration.mjs` 47/47,
  `verify-constraints.mjs` 35/35 — all unchanged and all passing.

A unit test now also fails if a public page imports `@/lib/db` directly, bypassing
the consent-filtering layer.

---

## 19. Accessibility verification

**Improved, not merely preserved.**

| Check | Result |
| --- | --- |
| Lighthouse accessibility | **100 on all six routes** (`/results` was 96) |
| Colour contrast | Dark-mode failure at 1.97:1 found and fixed (§13) |
| Heading hierarchy | Exactly one `<h1>` per route, asserted on all 13 |
| `lang` | `en-IN`, asserted on all 13 |
| Skip link | Present, focus-visible only |
| Focus states | `:focus-visible` ring intact; never removed |
| Reduced motion | `prefers-reduced-motion` block intact |
| Keyboard nav | Drawer traps focus, Escape closes, focus returns to trigger — **and now actually runs**, since the CSP fix restored hydration |
| Form labels | Unchanged from Phase 6/7 |
| Touch targets | `min-h-11` on chips, pagination and nav |
| CLS | **0 on every route measured**, mobile and desktop |
| Filter chips | Now carry `aria-label` with the record count |

Bug 1 is worth restating here: the accessible drawer behaviour existed in the
code but never executed in production. Fixing the CSP is an accessibility fix as
much as a performance one.

---

## 20. Synthetic scale test

1,000 results · 3,000 subject scores · 80 stories · 30 batches · 12 announcements
· 500 enquiries. All `ZZTEST`-prefixed.

| Check | Result |
| --- | --- |
| `/results` page 1 | 24 cards, "of 1000 published results" |
| `/results?page=42` | 16 cards, "Page 42 of 42" — the tail, not truncated |
| `/results?page=999` | 0 cards, empty state, no crash |
| `/results?programme=CMA&year=2025` | 24 cards, facets scoped correctly |
| `/stories` page 1 | 12 cards, "of 80 published stories" |
| `/stories?page=7` | 8 cards — the tail |
| Homepage | 11 cards (6 results + 2 stories + 3 batches) — bounded band |
| Admin student list | Paginated, server-side filtered (Phase 6) |
| Sitemap | 13 entries, 9 with `lastmod`, **0 containing `ZZTEST`** |
| Build | 19 pages generated, clean |
| Consent leakage | **0** occurrences of `ZZTEST-CONSENT` on any public page |
| Response sizes | Worst route 300.2 KB wire, 116.3 KB raw HTML |

**No route loads all records. No query silently truncates.**

The fixture's first draft was rejected by PostgreSQL: it picked `displayNameMode`
and `consentName` independently and hit
`toppers_name_requires_name_consent`. The constraint doing its job on data that
was never going to reach a page.

---

## 21. Automated verification

| Suite | Checks | New? |
| --- | ---: | :-: |
| `verify:seo` — metadata, canonical, robots, sitemap, JSON-LD, boundary, links | **335** | **new** |
| `verify:budget` — byte budgets per route | **72** | **new** |
| Unit tests | 87 | +14 |
| `verify:public` — public data isolation | 50 | |
| `verify:integration` — admin → database → public | 47 | |
| `verify:e2e` — admin + enquiry over HTTP | 62 | |
| `verify:constraints` — 28 database CHECKs | 35 | |
| `verify:revalidation` — publishing updates the site | 9 | |
| **Total** | **697** | **from 276** |

Plus: `npm run typecheck` clean · `npm run lint` 0 errors, 0 warnings · build 19
pages · `npm audit` **0 vulnerabilities** (with and without dev dependencies).

**No dependency was added to any of this.** Lighthouse runs through `npx` against
the Chrome already on the machine; `sharp` for the one-off icon generation comes
with Next.js and is not a build-time requirement.

---

## 22. Bugs and work deferred

| Item | To | Why |
| --- | --- | --- |
| **The permanent CSP policy** — nonce (costs ISR) vs stable SRI vs keeping `'unsafe-inline'` | **Phase 10** | A security architecture decision, made with security in view |
| `middleware.ts` → `proxy.ts` (deprecated in Next 16) | **Phase 10** | `middleware.ts` *is* the admin route guard |
| Non-Latin `@font-face` blocks: 13.5 KB raw, 27% of the render-blocking CSS | Phase 11 | Needs `next/font/local` and vendored woff2 |
| Mobile TBT 430–570 ms against §18's 200 ms | Phase 11 / field data | Framework floor; 829 ms of it is react-dom hydration |
| `/stories/2` as static paths instead of `?page=2` | Phase 11 | Would restore ISR and improve URLs; larger change |
| `/results?page=999` says "for that filter" with no filter active | Phase 11 | Cosmetic copy; the recovery link works |
| Favicon crop needs client sign-off | Content | Our judgement about their mark, replaceable in one file |
| **Unverified address and phone in structured data** | **Launch gate** | Carried from a site that fabricated content; §11 |
| `ResultRecord` model is unused — `Topper` is the live model | Phase 12 | Dead schema; removing it is a migration, and Phase 12 owns import tooling |

---

## 23. The zero-real-data invariant

**Nothing was invented.** No student, mark, testimonial, faculty member, founding
year, fee, statistic, address, phone number, rating or claim.

All synthetic data was `ZZTEST`-prefixed and unmistakable — student names are
literally `ZZTEST-STUDENT-0001`, and the "stories" are filler text that says it
is filler. `consentPhoto` was `false` on all 1,000 records, because we hold no
photographs and a synthetic one would be a synthetic student.

Verified at the end of the phase:

```
TOTAL ROWS: 0 {"toppers":0,"subjectScores":0,"resultRecords":0,"stories":0,
               "batches":0,"announcements":0,"enquiries":0,"admins":0,"audit":0}
```

The local PostgreSQL instance is stopped and `.tmp-pgdata` removed. No Neon
provisioned, no credentials created or requested, no domain configured, no
Search Console submission, nothing purchased, and **the launch switch is still
`false`** — with a test that fails if it is not.

---

## 24. Files changed

| File | Change |
| --- | --- |
| `next.config.ts` | **CSP fix (Bug 1)**; image size lists and cache TTL |
| `src/app/layout.tsx` | Font weights and preload; `siteJsonLd` graph |
| `src/app/globals.css` | `--selected` theme-aware token (Bug 3) |
| `src/app/robots.ts` | Sitemap line removed pre-launch; explicit `/admin` |
| `src/app/sitemap.ts` | Content-derived `lastModified`; async; revalidate |
| `src/app/results/page.tsx` | `generateMetadata`; scoped facets; inert `revalidate` removed |
| `src/app/stories/page.tsx` | Pagination; `generateMetadata` |
| `src/app/courses/[slug]/page.tsx` | `BreadcrumbList`; provider by `@id` |
| `src/app/not-found.tsx` | Title and explicit `noindex` |
| `src/lib/seo.ts` | Canonical/robots policy; `WebSite`; `breadcrumbJsonLd` |
| `src/lib/indexing.ts` | **new** — the indexing policy, import-free and testable |
| `src/lib/public-data.ts` | Scoped facets; stories pagination; `lastPublishedAt` |
| `src/lib/revalidate-public.ts` | Sitemap revalidation |
| `src/components/domain/public-cards.tsx`, `primitives/button.tsx` | `--selected` |
| `src/components/admin/shell.tsx`, `admin/ui.tsx`, admin pages ×2 | `--selected` |
| `src/app/icon.png`, `src/app/apple-icon.png`, `public/favicon.ico` | **new** |
| `scripts/perf-baseline.mjs` | **new** — wire-byte measurement |
| `scripts/verify-seo.mjs` | **new** — 335 checks |
| `scripts/verify-budget.mjs` | **new** — 72 checks |
| `scripts/synthetic-scale.mjs` | **new** — the ZZTEST fixture |
| `scripts/make-icons.mjs` | **new** — one-off icon generation |
| `scripts/verify-public-isolation.mjs` | Unknown-`MODE` guard (Bug 11) |
| `tests/indexing.test.ts` | **new** — 14 checks |
| `lighthouserc.json`, `lighthouserc.desktop.json` | Mobile gate + desktop gate |
| `package.json`, `README.md`, `docs/README.md` | Scripts and phase status |

---

## 25. Recommended next phase

**Phase 10 — Security hardening**, and it now has a specific first task.

The CSP is the open item, and Phase 9 has already done its measurement: nonces
cost ISR, `experimental.sri` does not cover inline scripts, and the current
policy carries `'unsafe-inline'` for scripts as a documented compromise. That
decision should be made deliberately with the trade-off in front of you, not
inherited from this phase.

Suggested scope, in order: settle the CSP; migrate `middleware.ts` to `proxy.ts`
(it is the admin route guard, so it belongs to a security phase rather than this
one); review the enquiry rate limiter and `ipHash` retention; audit the image
optimiser as an amplification surface now that its size lists are narrowed; and
decide the audit-log retention policy Phase 8 left open.

---

**PHASE 9 COMPLETE — PHASE 10 NOT STARTED.**
