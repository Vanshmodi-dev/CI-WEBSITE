# Demo dataset — what exists, and what does not

**Date:** 25 August 2026
**Purpose:** populate the local database so the whole product can be inspected by eye.
**Scope:** development only. No production code was changed.

---

## 1. The headline finding

The brief asks for synthetic records across seventeen content types. **The
application has five.**

Everything else on the site is either static configuration or was never built,
and both facts are documented in the source rather than hidden. Populating a
database cannot make a faculty section appear, because there is no faculty
section — no model, no route, no component.

That is the most useful thing this exercise produced, and it is separated from
the seeding work below because it is a product finding, not a data one.

| Section | Where its content comes from |
| --- | --- |
| Results, subject marks | **Database** — seeded |
| Student stories | **Database** — seeded |
| Batches | **Database** — seeded |
| Announcements | **Database** — seeded |
| Enquiries | **Database** — seeded |
| Institute name, tagline, locality | **Static** — `src/config/institute.ts` |
| Address, phones | **Static**, marked `unverified` |
| Courses / programmes | **Static** — a five-item array, not a table |
| Email, opening hours | **Static, null** — render nothing by design |
| Social links | **Static, null** |
| Map / location | **Hidden** — needs a Place ID or coordinates |
| Faculty / teachers | **DOES NOT EXIST** |
| Reviews / Review Engine | **DOES NOT EXIST** |
| Videos, gallery | **DOES NOT EXIST** |
| Credibility strip (student numbers, success rates) | **DELIBERATELY ABSENT** |

The last four are not oversights. `src/app/(site)/page.tsx` says so:

> *Faculty, reviews, videos and gallery bands are absent. Each needs content the
> institute has not supplied — credentials and portraits, an activated Review
> Engine, a channel ID, photography.*

And the credibility strip:

> *Student numbers, years of experience and success rates are exactly the
> figures the previous site invented. None are confirmed, so none appear.*

I did not create models for them. The brief was explicit that a missing section
should be recorded rather than invented, and inventing a `Teacher` table would
have meant designing a CMS surface under cover of a seeding task.

---

## 2. What was inspected first

Prisma schema · the migration SQL and its 21 CHECK constraints · the two
existing seed scripts · every public route and its data source · every admin
route · the consent and publication logic in `student-display.ts` and
`public-data.ts` · photo validation · the import/export implementation ·
`deployment-contract.ts` · the Phase 12 import work and the Phase 14 audit.

Two constraints from that reading changed the plan:

**SVG placeholders are impossible.** `isSafePhotoPath` accepts `.jpg .jpeg .png
.webp .avif` and nothing else, so an SVG path is refused before it reaches the
database. The fixtures are PNG.

**Formatted phone numbers are impossible.** `enquiries_phone_digits` is
`^[0-9]{10,15}$`, so the brief's suggested `+91 00000 00000` would be rejected
by Postgres. Enquiry phones are digits only, in a `91000000xxxx` block.

---

## 3. What was created

```
ZZSHOW DEMO DATA
  Results (toppers)      45   (36 published, 9 drafts)
  Subject marks         135
  Student stories        15   (13 published, 2 drafts)
  Batches                 7   (5 upcoming, 1 already started, 1 draft)
  Announcements           8   (5 live, 1 future, 1 expired, 1 draft)
  Enquiries               8   (across all five statuses)
  Results with a photo   18
  Non-ZZSHOW content rows: 0
```

Counts are chosen to exercise the interface, not to hit a number:

- **36 published results against a page size of 24** — so page 2 exists and the
  pagination control can be looked at. Thirty results gave exactly 24 published,
  one full page, and no control at all.
- **13 published stories against a page size of 12** — same reason.
- **Five programmes × three years** — every filter chip has records behind it,
  and combinations narrow correctly.
- **Drafts alongside published rows** — so the admin shows both states and the
  public site shows only one.
- **A batch that already started, an announcement that expired, one not yet
  started** — so the window logic is visible by its absence.

### The prefix is `ZZSHOW`, not `ZZTEST`

`ZZTEST` is already owned by `verify-integration`, `verify-import` and
`synthetic-scale`, each of which **begins by deleting every row whose name
starts with it**. `ZZDEMO` belongs to `verify-public-isolation`, `ZZQA` to
`verify-teacher`, `ZZSEC` to `verify-security`.

The first version of this seeder used `ZZTEST` as the brief suggested, and the
dataset silently vanished the first time a suite ran — which is how the
collision was found. `ZZSHOW` is unclaimed, so the demo data and the test
fixtures coexist. Nothing named `ZZSHOW Student 001` is any less obviously
synthetic.

---

## 4. Consent scenarios

All five, expressed in the application's own fields. There is no parallel
consent model here, and nothing bypasses the real one.

| | Scenario | Records | On the public site |
| --- | --- | ---: | --- |
| **A** | result + name + photograph | 9 | Full name, photograph |
| **B** | result + name, no photograph | 9 | Full name, monogram tile |
| **C** | result only | 9 | Initials only, monogram |
| **D** | photograph allowed, initials only | 9 | Initials, photograph |
| **E** | no consent at all | 9 | **Nothing — cannot be published** |

Scenario E records exist only as drafts, because the database refuses to publish
a row without a consent reference and result permission. That refusal is part of
what the dataset is meant to show.

Measured on the rendered `/results` page: **12 full names, 24 monogram-only
tiles, 0 consent references, 0 import keys.** Different students genuinely
render differently.

---

## 5. Media fixtures

`public/zzshow-media/zzshow-student-photo-01..08.png` — eight 320×320 PNGs,
about 2 KB each.

Flat diagonal stripes in the brand colours with a hard border and a corner
block. **No face, no silhouette, no photograph of anybody.** Eight variants so
a grid of cards is not eight copies of one tile.

Generated by `scripts/make-demo-media.mjs`, which writes PNG directly against
`node:zlib` — about forty lines. **No dependency was added**; putting an image
library into a project with eight production dependencies, to draw coloured
rectangles for a development fixture, was not a trade worth making.

Nothing was downloaded. The path carries `zzshow` so the synthetic origin shows
in the DOM, in the database and in any export.

---

## 6. Commands

| | |
| --- | --- |
| `npm run seed:demo` | Insert or reconcile the dataset |
| `npm run seed:demo:clean` | Remove it, and nothing else |
| `npm run seed:demo:count` | Report what is there, including anything that is not ours |
| `npm run make:demo-media` | Regenerate the placeholder images |

**Idempotent.** Run three times, counts identical: 45 / 135 / 15 / 7 / 8 / 8.
It reconciles rather than accumulates.

**Precise cleanup.** Every filter is anchored on the `ZZSHOW` prefix or a
`zzshow` slug. There is no unqualified `deleteMany` anywhere in the file. The
admin account, the audit log and any non-`ZZSHOW` row are untouched — verified
by counting before and after.

---

## 7. Safety guards

The seed refuses to run and exits non-zero when any of these hold. All five were
tested by triggering them:

| Guard | Verified |
| --- | :-: |
| `NODE_ENV=production` | ✅ exit 1 |
| `DATABASE_URL` host is not local | ✅ exit 1 |
| `DATABASE_URL` absent | ✅ exit 1 |
| Launch switch is ON | ✅ exit 1 |
| `NEXT_PUBLIC_SITE_URL` is a live `https://` origin | ✅ exit 1 |

It fails closed. It never guesses that an unfamiliar database is safe to write
to.

---

## 8. Verification

### Data integrity

Every seeded row was re-read and checked against the rules directly: published
rows all hold a consent reference and result permission; no published photograph
without photograph permission; no name beyond initials without name permission;
`publishedAt` set wherever published; no percentage above 100; no year outside
range; **0 orphan subject scores**; every photo path resolves to a file that
exists; every enquiry email ends `.invalid`; every enquiry phone matches the
synthetic block; every `ipHash` a real 64-character SHA-256. **0 problems.**

### Suites

| | With demo data present |
| --- | --- |
| Typecheck · Lint | clean |
| Unit | **276 / 276** |
| Public isolation | **46 / 46** |
| Consent constraints | **43 / 43** |
| End-to-end | **62 / 62** |
| SEO | **335 / 335** |
| Integration | **62 / 65** — see below |

**No production source file was modified.** The only tracked changes are two new
scripts, the PNG fixtures and four `package.json` entries.

### The three integration failures are correct behaviour

They require an empty content database, and they are right to:

- two assert that `/results` and `/stories` render their **empty state**, which
  cannot be true while demo content exists;
- one asserts a specific mark string is absent after an edit, and among 36
  published demo results another record happens to score 88%.

**I did not weaken them.** An empty-state assertion that passes with content
present is testing nothing. Run `npm run seed:demo:clean` before
`verify:integration`; the seed output now says so.

---

## 9. What the public site shows now

Inspected as rendered HTML, not status codes.

| Route | |
| --- | --- |
| `/` | Announcement banner, 6 results with photographs, 3 upcoming batches, 2 stories, location block |
| `/results` | "Showing 24 of 36", year and programme filter chips, pagination, mixed name and photo states |
| `/stories` | 12 stories, page 2 with the 13th |
| `/announcements` | 5 live. Future, expired and draft correctly absent |
| `/courses` | Five programmes, each showing "1 upcoming batch" |
| `/courses/[slug]` | Full batch detail — start date, mode, seats note |
| `/about`, `/contact`, `/admissions` | Static content, unchanged |

**Filters verified:** `?year=2026` → 12 of 12 · `?programme=CMA` → 6 of 6 ·
`?year=2024&programme=CA_FOUNDATION` → 3 of 3.

**Windows verified:** the batch that already started, the expired announcement,
the future announcement and every draft are all absent from the public site and
all present in the admin.

**Responsive:** no horizontal overflow on nine routes at 320, 360, 390, 412,
430, 768 and 1280px — with content present, which is the harder case.

---

## 10. What the admin shows now

Dashboard reads **"3 New enquiries · 5 Upcoming batches · 36 Published results ·
5 Live announcements"** with a recent-enquiries list.

Students & Results, Student Stories, Batches, Announcements, Enquiries, Data and
Website preview are all populated. Drafts are visible to the teacher and absent
from the public site. Enquiry phone numbers appear in the admin and nowhere
public.

### Admin capability gaps

Not defects — the CMS was scoped to what the institute can supply. Recorded for
the next phase:

| | |
| --- | --- |
| **MISSING** | Faculty / teachers management — no model, no UI, no public section |
| **MISSING** | Reviews management — the Review Engine is a design, not an implementation |
| **MISSING** | Courses editor — programmes live in a static array; adding one is a code change |
| **MISSING** | Map / location editor — needs a Place ID or coordinates in config |
| **MISSING** | Institute facts editor — address, phones, hours, email are all code |
| **MISSING** | Media library — photo paths are typed by hand, there is no upload |
| **STATIC** | Hero copy, About copy, every course description |

The last one is worth stating plainly: **a teacher cannot currently change any
word on the homepage.**

---

## 11. UI issues discovered

**None.** Nothing was found that needed fixing, and nothing was fixed.

Two things looked like defects during inspection and were not:

- **12 "broken" images on `/results`.** They are `loading="lazy"` and had not
  entered the viewport when measured. After scrolling: 12 loaded, 0 broken. The
  files serve 200 with `image/png`, and the optimiser returns 907 bytes.
- **`/courses` showing no batches.** It renders a *count* — "1 upcoming batch" —
  not the seats note my check was looking for. The detail page shows the batch
  in full.

One workflow fact, not a defect: **statically prerendered pages need a rebuild
after seeding.** `/courses` and `/announcements` are baked at build time with a
1-hour and 15-minute window. Seeding into a database after the build leaves them
showing the state they were built with. Build after seeding, which is also what
a real deployment does.

---

## 12. Not seeded, and why

| | |
| --- | --- |
| Faculty, reviews, videos, gallery | No model exists. Creating one would be designing a feature, not seeding data. |
| Courses | Static array in `institute.ts`. Editing it is a code change, and the five real programme names are already there. |
| Institute facts, address, phones | Static, and marked `unverified` on purpose. Overwriting them with synthetic values would defeat the Phase 14 gate that stops the site being indexed until they are confirmed. |
| Map | Requires a Place ID or coordinates. **Not connected** — the section hides itself, which is the intended behaviour. |
| Review Engine fixtures | **No fixture mechanism exists**, because no review implementation exists. Reported rather than worked around, as the brief instructed. |
| Admin accounts | One local account exists for this review session. Not part of the dataset and not removed by cleanup. |

---

## 13. Restoring the original state

```
npm run seed:demo:clean
```

Returns every content table to 0. The database began this task empty, and
`seed:demo:count` reports any non-`ZZSHOW` row so the difference is always
visible.

Nothing external was touched: no network call, no production database, no
credentials, no launch switch. `SITE_IS_LAUNCHED` is still `false`.
