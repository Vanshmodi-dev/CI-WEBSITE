# Phase 21 — Owner review preparation and product freeze

**Date:** 28 August 2026
**Preceding commit:** `91b703c` (Phase 20)

---

## Product freeze

**The candidate release is frozen.** No feature was added, no design was
changed, and nothing was altered for preference. Three changes were made and all
three were defects or demonstration data — listed under *Changes made*.

Resources, FAQs and every other conditional item identified in Phase 20 remain
**unbuilt and undecided**, which is where they should be until the owner says
otherwise.

---

## Demo environment

| Command | Does |
| --- | --- |
| `npm run seed:demo` | Fills the database with the ZZSHOW dataset. **Reconciles** — running it twice does not duplicate |
| `npm run seed:demo:count` | Reports what is there, including anything that is *not* ZZSHOW |
| `npm run seed:demo:clean` | Removes ZZSHOW rows and nothing else |
| `npm run verify:preflight` | With the demo cleared, reports **65 passed, 0 failed, `BLOCKED: false`** |

### Expected counts after `npm run seed:demo`

| | Count |
| --- | --- |
| Results | 45 (36 published, 18 with a photograph) |
| Subject marks | 135 |
| Student stories | 15 (13 published) |
| Batches | 7 |
| Announcements | 8 (7 published, 1 future-dated and correctly invisible) |
| Enquiries | 8 |
| Faculty | 5 (4 published, 1 draft) |
| Gallery | 12 (8 on the website; 4 drafts, two of which also lack photo consent) |
| Videos | 5 (4 on the website) |
| **Website copy** | **16 fields** — the trust bar, the why-us band, the map point |
| Non-ZZSHOW content rows | **0** |

### Demo data safety — verified this phase

| Check | Result |
| --- | --- |
| Seeding refuses in production | **Yes** — refuses on `NODE_ENV=production`, on the launch switch being ON, and on a live `NEXT_PUBLIC_SITE_URL` |
| Records are unmistakably synthetic | Every row carries `ZZSHOW`. Nothing named `ZZSHOW Student 001` reads as a person |
| Cleanup removes only demo rows | **Proved**: 32 settings rows → clean → 16 remain, all non-demo, untouched |
| Cleanup returns the database to the deployable state | **Proved**: `P-DB-12` passes and pre-flight reports `BLOCKED: false` |
| No demo secrets | None. The seed writes no credential of any kind |
| Demo data cannot be indexed | The launch switch is off and `robots.txt` disallows everything; `P-DB-12` blocks a deploy while content tables are populated |

**Website copy is the one table the demo shares with real content.** In
production the institute types its own words into those very keys, so cleanup
deletes by author stamp (`ZZSHOW demo seed`), never by key — a demo clean can
never destroy something a person typed.

> **Known interaction, stated rather than hidden.** If `verify:cms` runs, it
> edits some of those same keys through the real editor, which re-stamps them
> with the administrator's name. A later `seed:demo:clean` then correctly leaves
> them alone, because they are no longer demo-authored. `npm run seed:demo`
> re-stamps and reconciles them. Harmless locally; worth knowing before anyone
> reads the row count and worries.

---

## Owner login

There is **no default password and none was created.** The project has never
shipped one and this phase did not start.

```bash
npm run create-admin "you@example.invalid" "Sir"
```

The password is read from a hidden prompt — never from an argument, so it does
not reach shell history or the process list. It exists only in the local
database.

---

## Walkthrough

**[docs/OWNER-REVIEW-WALKTHROUGH.md](OWNER-REVIEW-WALKTHROUGH.md)** — written for
someone who does not know the codebase. It covers starting the app, every public
page and what is *meant* to be on it, every admin screen, eighteen things to
actually try with the expected result of each, the four viewport widths to check,
and the six questions only the owner can answer.

Every factual claim in it was verified against the running application, and two
were corrected when they turned out to be imprecise (the number of published
stories, and *why* four gallery items are hidden — they are drafts, not merely
unconsented).

---

## Final defects

### D21-1 — every video thumbnail in the admin was blocked · **FIXED**

The public CSP has allowed YouTube's poster host since Topic 9. The admin's did
not — and the admin renders those posters in two places built to be looked at:
the video list, so a teacher can tell one video from another, and the form's
live preview, whose own comment says it *"proves the link resolved to the video
the teacher meant"*.

Both were silently blocked. The preview proved nothing.

Found by reading the browser console on every admin route rather than by looking
at the pages. Fixed by adding `https://i.ytimg.com` to `img-src` in
`src/proxy.ts` — one external image host, the same one the public site already
uses. `script-src`, `object-src` and `frame-src 'none'` are untouched.

### D21-2 — `verify-media` had been aborting silently · **FIXED**

`clickDeleteFor`, added in Phase 19, was declared inside section 8b's block, so
section 8d threw `ReferenceError: clickDeleteFor is not defined`.

**Sections 9, 10, 11, 11b and 12 have not run since Phase 19** — consent is not
touched by uploading, replacement and caching, the photo is optional, the upload
rate limit, and the suite's own cleanup.

**I reported that suite as "142 / 0" in Phases 19 and 20. That was wrong.** The
run was crashing partway and my shell pipeline counted `PASS` lines instead of
reading the suite's own summary or its exit code — the process *did* exit
non-zero and I was not looking. The correct figure, with every section running,
is **166 / 0**.

It also explains something I had been quietly working around: a stray
`ZZMEDIA Shared A` faculty row I cleaned by hand three times across Phases 19–21.
Section 12 is the cleanup, and it was never reached.

Every suite's own summary has now been re-checked against my counts. Media was
the only one that had diverged.

### D21-3 — the CMS band test depended on demo data · **FIXED**

Seeding the why-us band exposed it: `verify-cms` §9b cleared five keys and set
the why-us heading expecting no band, but the demo now fills points 2 and 3,
which it never touched — so "a heading with no points" was not the state being
tested. It now clears all fifteen keys and decides its own starting state.

### Not defects — investigated and dismissed

| Observed | Verdict |
| --- | --- |
| "coming soon" on `/admin/website` | Legitimate help text: *"Leave blank to keep the current 'details coming soon' notice."* My scanner's keyword was too blunt |
| Blank video posters on `/videos` | The demo video IDs are invented, so YouTube has no picture. The card degrades to a navy tile with a play button, title and link. **Each carries a small broken-image glyph** — a real production video that is later removed would look the same. Cosmetic, left alone under freeze, and recorded as an owner decision below |

**Dead-surface scan result:** across 13 public and 14 admin routes — no dead
links, no empty `href`, no button without an accessible name, no missing `alt`,
no placeholder text, no hydration or console errors, exactly one `<h1>` per page,
and all **31 distinct internal links resolve**.

---

## Changes made

Only these. Nothing else was touched.

1. `src/proxy.ts` — admin `img-src` allows `https://i.ytimg.com` (D21-1).
2. `scripts/verify-media.mjs` — `clickDeleteFor` hoisted to module scope (D21-2).
3. `scripts/verify-cms.mjs` — §9b clears all fifteen band keys (D21-3).
4. `scripts/seed-demo.mjs` — seeds 16 website-copy fields with author-stamped
   cleanup, and reports them in `count`.
5. `docs/OWNER-REVIEW-WALKTHROUGH.md` — new.
6. `README.md` — the four verification suites and three demo commands that were
   missing from its table.

No schema change. No migration touched. No dependency added. **43 CHECK
constraints intact.** Launch switch **off**.

---

## Tests

| Suite | Result |
| --- | --- |
| unit | 558 / 0 |
| seo | 418 / 0 |
| ux | 346 / 0 |
| admin | 342 / 0 |
| security | 262 / 0 |
| videos | 232 / 0 |
| reviews | 224 / 0 |
| gallery | 219 / 0 |
| **media** | **166 / 0** — corrected; was reported 142 while aborting |
| map | 156 / 0 |
| faculty | 132 / 0 |
| teacher | 123 / 0 |
| budget | 122 / 0 |
| import | 116 / 0 |
| cms | 98 / 0 |
| integration | 67 / 0 |
| admin-ux | 66 / 0 |
| e2e | 62 / 0 |
| storage | 49 / 0 |
| public | 46 / 0 |
| constraints | 43 / 0 |
| consent | 19 / 0 |
| revalidation | 10 / 0 |
| production (pre-launch) | 25 / 0 |
| preflight | 64 / 1 — `P-DB-12`, demo data present. **65 / 0 when cleared** |

---

## Launch blockers

### 1 · Code blockers
**None.**

### 2 · Infrastructure blockers
- Cloudflare account with R2 enabled. **A payment card is required even on the free tier.**
- A private bucket, a token scoped to that one bucket, four `MEDIA_S3_*` variables.
- **One real upload** through Admin → Photos. Nothing else can retire `P-MEDIA-05`.
- A domain and hosting account.

### 3 · Human verification
- The seven unconfirmed institute facts (`P-LAUNCH-08`).
- A named person for takedown requests.
- Retention periods for enquiries, audit logs and import history.
- The institute reading every page for accuracy and tone.
- Clearing the demo data at deploy (`P-DB-12`).

### 4 · Device and browser testing
- A real Android and a real iPhone, for the camera and gallery pickers.
- Firefox and Safari/WebKit.
- A real screen reader.

### 5 · External service activation
- Review Engine: a Google Cloud project, an OAuth client, a refresh token that
  only Commerce Insight can grant, then rename the config and set `enabled: true`.
  **The site degrades honestly without it** — this does not block launch.

---

## NOT TESTED

Unchanged, and none of these has been tested:

- Physical phone camera
- Physical phone gallery picker
- Firefox
- Safari / WebKit
- A real screen reader
- A real Cloudflare R2 provider
- A live Review Engine

---

## Owner decision required

Only the institute can settle these:

1. The seven unconfirmed facts — address, phone, **email**, opening hours,
   Google Business Profile, place ID, map coordinates.
2. **The four figures under the hero.** They are demonstration numbers today.
   Real ones, or the band comes off.
3. **The "Why this institute" points.** Same.
4. Whether a **Resources** page should exist.
5. Whether an **FAQ** section should exist.
6. Real faculty, real photographs, real results — and the permissions to publish
   each one.
7. Who handles a takedown request, by name.
8. How long enquiries are kept.
9. Whether to activate the Review Engine.
10. The domain.
11. Whether a removed YouTube video should show a fallback tile instead of a
    blank one (cosmetic; post-launch).
12. The launch date.

---

## Final statement

**This is a local candidate release. It is not launched, and nothing in this
phase moved it closer to being launched.**

What exists is a complete, frozen, deterministic build that the owner can run on
their own machine, populated with data that could not be mistaken for a real
student, and a walkthrough that explains what every screen is for and what to
expect from it.

The next step is not engineering. It is the owner opening
<http://localhost:3000>, following
[the walkthrough](OWNER-REVIEW-WALKTHROUGH.md), and saying what they want
changed.
