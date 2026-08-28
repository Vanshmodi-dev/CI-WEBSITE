# Phase 19 — Admin CMS completion, media UX, owner-controlled website

**Date:** 28 August 2026
**Question the phase exists to answer:** can a real institute owner operate this
website without a developer?

---

## 0. Verdict first

**Yes, for everything the architecture intends to be editable** — and this phase
found five application defects, two of them user-facing, on the way to being able
to say so. It also found and fixed a defect in a test *this project added last
phase*, which was passing for the wrong reason.

Production readiness is unchanged and still blocked on the same two human
actions. Nothing here moved that line, and nothing here pretends to.

| | Defect | Where it was hiding | Status |
| --- | --- | --- | --- |
| **D19-1** | The institute name spelled out in the floating WhatsApp button's accessible label, and twice more on the public result and story cards | props and `??` expressions — the blind spot Phase 18's scan declared | **FIXED** |
| **D19-2** | `/about`'s two section headings hard-coded while both their paragraphs were editable | a `title=` prop | **FIXED** |
| **D19-3** | An edited email and social link never reached the structured data. `sameAs` had been fixed in `seo.ts` and its only caller was never updated — the fix was dead code | JSON-LD | **FIXED** |
| **D19-4** | The gallery photo field rendered `Photograph (required)(optional)` | a shared component appending "(optional)" unconditionally | **FIXED** |
| **D19-5** | A refused photo deletion told the teacher **nothing at all** | an error set and discarded by the same update | **FIXED** |

| | Harness defect | Status |
| --- | --- | --- |
| **H19-1** | The performance budget counted every `<img>` including `loading="lazy"`, and had been failing on three routes since the database first had content — reported "pre-existing" for three phases | **FIXED**, and turned into a real lazy-loading guarantee |
| **H19-2** | `verify-media`'s "the SERVER refuses this" assertions, added in Phase 18, replayed a malformed request. The action threw before running; the row survived for a reason unrelated to the guard | **FIXED** |
| **H19-3** | Text contrast was measured in dark mode only. The default light palette had never been checked | **FIXED** |

---

## 1. Topics completed

All 23. Topics 4, 6, 7, 10, 12, 17, 18, 19, 20 and 21 were audited and found
correct — the evidence is the suites listed in §9, not the absence of a finding.

## 2. Topics intentionally unchanged

- **Review Engine (18).** Audited, not touched. It remains the source of truth;
  no review data is copied into Postgres. Live integration is **NOT TESTED** and
  cannot be — `clients/_commerce-insight.config.json` has `enabled: false` and
  no credentials exist.
- **Admin information architecture (11).** Measured and left alone: the sidebar
  grouping was already sound and no concrete problem justified a change. What
  *was* wrong was movement out of a page — see D19 findings and Phase 18's back
  links.
- **Visual design (14).** Audited across 12 routes in both colour schemes. Three
  type families, four radii, one shadow token, a coherent navy/orange/neutral
  palette with real background variation. No "everything is blue" problem, no
  gratuitous gradients, no redesign made.

---

## 3. Application defects, with reproductions

### D19-3 — the structured data forgot two editable facts

The most serious of the five, because it is silent and it is the field a local
listing is matched on.

```
saved through the real editor:  contact.email = zzqa-office@example.invalid
                                social.youtube = https://www.youtube.com/@zzqachannel

footer shows the email  : true
footer shows the youtube: true
json-ld has "email"     : false (absent)
json-ld has "sameAs"    : false (absent)
```

Two separate causes, one field apart:

- `instituteJsonLd` read `institute.email`, pinned to `null` in config since
  Phase 3. `JsonLdContact` had no `email` field at all.
- `sameAs` had read a **resolved** `social` since Topic 12 and carried a comment
  explaining exactly why it must — but the only caller, the site layout, passed
  `coordinates` and stopped. It fell through to the config constants, both null,
  and `sameAs` was never emitted however many channels the institute added.

**A fix inside a function that its only caller does not feed is not a fix.**

After: `"email":"zzqa-office@example.invalid"` and
`"sameAs":["https://www.youtube.com/@zzqachannel"]`.

### D19-4 — a field that said both things

```
gallery photo field label: "Photograph (required)(optional)"
submitting without one:    "Every gallery entry needs a photograph."
```

`MediaField` appended `(optional)` unconditionally, so the gallery form had
worked around it by passing `label="Photograph (required)"`. Both the
component's own header comment and the schema comment on `GalleryItem.imageUrl`
warn against precisely this. Neither was being followed and nothing checked.

### D19-5 — the refusal nobody could see

Found by asserting the teacher is **told**, rather than only that the row
survived.

`DeleteMediaButton` handled a refusal with `setError(...)` followed by
`setConfirming(false)`. The error was only rendered in the *confirming* branch,
so the second update threw away the first: the control snapped back to a plain
"Delete" button and the administrator saw nothing. Clicking Delete, confirming,
and watching the button return to normal is indistinguishable from the click not
registering.

The message that was being discarded is the useful one:

> This photo is still used by 1 gallery photo. Remove it from those first, then
> delete it here.

### D19-1 / D19-2 — content that was not anybody's decision

`whatsapp-button.tsx` spelled out "Commerce Insight" in the accessible label of
the one control on every page; `public-cards.tsx` did it twice more in the
anonymised-student labels on the results and stories cards. The name is
deliberately code-owned — it is matched to the Google Business Profile — but
code-owned means *one place*, and these were three more copies of it.

`/about`'s headings "What we teach" and "Our story" were hard-coded while all
three paragraphs beneath them were editable, with the homepage's equivalent
headings editable since Topic 12. No argument existed for the split.

---

## 4. Documentation defects

- `/admin/media` told the administrator "Photos are attached to a student or
  story" — omitting teachers and gallery entries since Topics 6 and 8. Fixed in
  Phase 18; re-verified here.
- No document was rewritten to agree with an assumption. The CMS registry
  documentation grew by the fields actually added.

---

## 5. Harness defects

### H19-1 — a budget measuring an experience nobody has

`measure().requests` counted every `<img>` in the document. A browser does not
fetch a `loading="lazy"` image below the fold, and every public route ships
**exactly one eager image** (the logo) and lazy-loads the rest.

The budget of 20 was measured, in its own comment, at "14–15" — the size of this
site with an **empty database**. The moment there was content it began failing
and stayed failing, reported as "pre-existing" three phases running.

Measured properly:

| | HTML-referenced | Load-critical | Browser at 390px |
| --- | --- | --- | --- |
| `/` | 29 | **15** | 17 requests, 275 KB |
| `/gallery` | 24 | **16** | — |
| `/results` | 22 | **15** | — |

The brief said not to raise the budget. It was not raised. `requests` now counts
what a browser fetches, and two new assertions per route make the count honest:
at most one image may load eagerly, and any page with several images must defer
them. Budget went from **101/3 to 123/0**, with 22 assertions added.

### H19-2 — a "server refuses" test that never reached the server

Phase 18 added assertions that the delete action refuses on its own, by
replaying a captured request. `deleteMedia(previousState, formData)` takes two
arguments; the replay sent one. Next could not deserialise the call, the action
**threw before running**, and every replay returned a serialised error envelope:

```
1:E{"digest":"1344088344…"}
```

"The row survived" was therefore true for a reason with nothing to do with the
guard. Four assertions were passing on a request that never got there.

Nothing caught it until this phase added the opposite question — does a
well-formed call actually *delete* an unreferenced photo? That control failed,
which is what a control is for.

**The fix is not a better-guessed wire format.** It is a test of the property
that matters: render the library while a photo is free (Delete is offered), add
a holder without reloading, and click the button the stale page is still
showing. The server must refuse and must say why. That is a race a real
administrator can hit, it uses the true client path, and it needs no wire format
at all.

### H19-3 — contrast measured in one scheme

`verify-ux` section 8 set `emulateColorScheme('dark')` and was headed "DARK
MODE". Nothing measured the **light** palette — the default for most visitors
and the one the design was drawn in. Headless Chrome happens to default to dark,
which is also why every other check in that file had been silently measuring the
dark palette.

Both schemes were then measured across 13 routes at two widths: **zero
violations in either**. So no defect — but the guarantee now exists, and
`verify-ux` went from 333 to **346**.

---

## 6. Fixes applied

| Fix | File |
| --- | --- |
| `email` joins the resolved contact; the caller passes `social` and `email` | `src/lib/seo.ts`, `src/app/(site)/layout.tsx` |
| Institute name derived, not duplicated (×3) | `whatsapp-button.tsx`, `public-cards.tsx` |
| Two `/about` headings registered (`about.whatWeTeachHeading`, `about.storyHeading`) | `src/config/site-content.ts`, `about/page.tsx` |
| `MediaField` takes `required`; the label states one thing | `media-field.tsx`, `gallery-form.tsx` |
| A refused deletion is shown in both states of the control | `media/delete-button.tsx` |
| Delete on every record's own page (faculty, gallery, videos) | three `[id]/page.tsx` |
| Request budget counts load-critical assets; lazy loading asserted | `perf-baseline.mjs`, `verify-budget.mjs` |

---

## 7. Tests added

| Suite | Added | What it now proves |
| --- | --- | --- |
| `verify-map` §2b | 14 | An edited email and channel reach the JSON-LD, with controls at both ends |
| `verify-admin-ux` §2c | 2 | Every record page offers delete, and every one asks first |
| `verify-admin-ux` §4b | 17 | Every photo field states required/optional truthfully, offers the picker, and the server agrees |
| `verify-media` §8d | 15 | Multiple holders, published holders, and that **replacing** a photo releases the old one |
| `verify-media` §8b | rewritten | Server-side refusal via the real race, with the message the teacher sees |
| `verify-ux` §8 | 13 | Light-mode contrast |
| `verify-budget` | 22 | Eager-image cap and lazy deferral per route |
| `tests/content-coverage` | — | Scanner extended to props; 18 newly-visible strings classified |

Negative controls were run and observed to fail correctly for: the JSON-LD
assertions (reverting the caller fails exactly two), the prop scanner (an
injected `title=` is named with its file), the eager-image budget, and the
content scanner's text-node path.

---

## 8. Editability coverage

**103 registry fields** (was 96 at the start of Phase 18), **110 code-owned
strings** each carrying a written reason, and a test that fails when a new
user-visible string is neither.

| Group | Fields |
| --- | --- |
| Contact details | 12 |
| Homepage wording | 13 |
| About page | **7** (was 5) |
| Programme descriptions | 5 |
| Page headings | 37 |
| Menu and footer | 29 |

`/admin/preview` and `/admin/website` each list **103 of 103**. `verify-admin`
writes a unique marker through the real single-field save for every one and
reads the declared public route as an anonymous visitor: **312 assertions, 0
failures**.

### What remains code-owned, and why

Unchanged and still argued in `src/config/content-audit.ts`: CTA labels (they
travel with a fixed destination), section eyebrows (two-word slots), empty
states and policy sentences (the honesty rule the rebuild exists to enforce),
form wording (tied to validation), widget controls, external product names,
page addresses, and search titles/descriptions.

**Derived, not editable and not duplicated:** the institute name and tagline —
now read from one place in all four spots that print them.

---

## 9. Test totals

| Suite | Result |
| --- | --- |
| unit | **554 / 0** |
| seo | 418 / 0 |
| **ux** | **346 / 0** (was 333) |
| **admin** | **312 / 0** (was 308) |
| security | 262 / 0 |
| videos | 232 / 0 |
| reviews | 224 / 0 |
| gallery | 219 / 0 |
| **map** | **156 / 0** (was 142) |
| **media** | **142 / 0** (was 143 pre-rewrite) |
| faculty | 132 / 0 |
| **budget** | **123 / 0** (was 101 / 3) |
| teacher | 123 / 0 |
| import | 116 / 0 |
| cms | 89 / 0 |
| integration | 67 / 0 |
| **admin-ux** | **66 / 0** (was 47) |
| e2e | 62 / 0 |
| storage | 49 / 0 |
| public | 46 / 0 |
| constraints | 43 / 0 |
| revalidation | 10 / 0 |
| production (pre-launch) | 25 / 0 |
| preflight | 64 pass, 1 fail — `P-DB-12`, demo data present **by design** |

**The demo dataset was cleared and the gate re-run.** With the content tables
empty, preflight reports **65 passed, 0 failed, `BLOCKED: false`** — so demo
data was the *only* mechanical thing standing between this build and a deploy.
The dataset was then reseeded and the database returned to 45 results, 5
teachers, 12 gallery entries, 5 videos and **0 non-ZZSHOW content rows**. Media
objects were cleaned to zero and the local store emptied; `media:audit` reports
no broken references.

**Owner walkthrough (Topic 22): 28 steps, 0 friction points.** Login, preview,
find and edit the homepage heading, verify logged out, phone (including the
`tel:` link), email, teacher edit, photo upload, pick an existing photo, gallery
create, announcement create and edit, every form reachable, delete with
confirmation, admin clean at 360px, logout, and the same cookie refused
afterwards.

Two apparent failures in that walkthrough were investigated and were **correct
behaviour**: the gallery form refuses without a category ("Choose which part of
the gallery this belongs in") and the announcement form without dates ("Choose
the day it should start showing"). Both name the exact field in plain words.
`showsPeople` defaulting to **true** is the safe default for a consent-gated
field and is left alone.

---

## 10. Results by area

**Security (10, 21):** 262/0. One endpoint added last phase re-verified —
anonymous refused, cross-origin refused, and a positive control proving the same
request works with a valid session and origin. No CSP change, no proxy change,
no new authorisation path, no new dependency.

**Accessibility (15):** landmarks, heading order, labels, dialog semantics,
focus, skip link, touch targets and **contrast in both colour schemes** all
pass. Real screen-reader testing: **NOT TESTED**.

**Responsive (13):** 13 routes × 5 widths probed for clipped content,
overflowing images and truncated text — **0 findings**, on top of `verify-ux`'s
9-viewport no-horizontal-scroll sweep.

**Performance (16):** see H19-1. Every route 15–16 load-critical requests, ~300
KB total, one eager image.

**SEO (17):** 418/0, plus the new JSON-LD consistency assertions. Pre-launch
noindex intact; the launch switch is off.

**Map (19):** 156/0. No invented coordinates; the map still loads only on
request.

**Database (20):** 43 CHECK constraints, 15 tables, 7 enums. **No schema change,
no migration touched, no dependency added.**

---

## 11. Not tested

| Item | Why |
| --- | --- |
| Real screen reader | None available. Structural ARIA is not a substitute and is not claimed as one |
| Firefox / Safari | Not installed |
| Physical phone camera and gallery picker | `capture="environment"` hands the choice to the OS; markup and pointer-based surfacing were verified, the device path needs a device |
| Live Review Engine | `enabled: false`, no credentials. Fixture-verified only |
| Real object storage provider | No credentials; `P-MEDIA-05` reports NOT TESTED deliberately |

---

## 12. Environmental limitations worth recording

- **Headless Chrome defaults to dark mode.** Every browser suite in this project
  has been measuring the dark palette without saying so. Layout results are
  scheme-independent, but contrast was not — see H19-3.
- **Two rate limits shape how suites can be run.** Uploads are capped at 60 per
  five minutes and sign-ins at 60 per minute, so back-to-back suite runs fail at
  sign-in or upload. `verify-media`'s own section 0 correctly reports when this
  has made a run meaningless.
- **Stale ISR plus test pollution can look exactly like an application defect.**
  A cached `/faculty` referenced media that a test had deleted, producing a 400
  that survived the database being repaired. A rebuild cleared it. Recorded
  because the first reading was convincing and wrong.
- **The embedded Postgres data directory was lost during Phase 18** and rebuilt
  from migrations. It returned with an identical 43 constraints.
- **A cleanup can destroy the marker it matches on.** The owner walkthrough
  created records tagged `ZZOWN`, then exercised the edit step — which REPLACED
  the message, removing the tag — and its teardown, matching on `ZZOWN`, found
  nothing. Three announcements and a faculty record survived several runs before
  a full demo-data clean surfaced them as "non-ZZSHOW content rows". Recorded
  because it is the same shape as every other cleanup defect this project has
  hit: the teardown was written against the state the test starts in, not the
  state it leaves.

---

## 13. Blockers and human actions

| Blocker | Owner |
| --- | --- |
| **HUMAN ACTION REQUIRED** — Cloudflare R2 bucket, checklist M1–M8. A payment card is required before R2 can be enabled, even on the free tier | Institute |
| **HUMAN ACTION REQUIRED** — 7 unconfirmed institute facts (`P-LAUNCH-08`): email, Google Business Profile, place ID, coordinates, YouTube, Instagram, legal entity name. All render **nothing** rather than a placeholder | Institute |
| Demo data must be cleared before deploying (`P-DB-12`) | Agency, at deploy |
| Launch switch off, as instructed | — |

---

## 14. Remaining product decisions

1. **Should the list-page Delete stay?** Delete now exists on every record's own
   page. Faculty, gallery and videos also keep a control in the list row. That
   is a shortcut, not a contradiction — but removing it would make the rule
   exactly one place instead of two. Left as-is; changing it is a preference,
   not a defect.
2. **Should the media field show the stored filename?** It shows the photograph
   itself, which identifies it better than a filename that never addressed it.
   Left as-is deliberately.
3. **No registry field currently needs media.** If the institute later wants an
   editable hero image, `MediaField` is ready and the registry would need a
   media field kind. Not invented ahead of a request.

---

## 15. Production readiness

**The admin is ready for a non-developer to operate.** A 28-step owner
walkthrough completes with no friction, every one of 103 editable values reaches
the public page it claims to, and the structured data now says the same thing
the page says.

**The deployment is not ready, and this phase did not change that.** The same
two human actions blocked launch before it and block it after it. No schema
change, no migration touched, 43 CHECK constraints intact, no new dependency,
launch switch off.
