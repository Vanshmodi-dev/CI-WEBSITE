# Phase 18 — Complete admin experience & content management

**Date:** 28 August 2026
**Scope:** the admin as a product a non-developer can use, and the second half of
the owner requirement — *what on this website can the institute NOT change, and
did anybody decide that?*

---

## 0. The short version

Seven defects were found by looking where nothing had looked before. One of
them destroys data.

| | Defect | Status |
| --- | --- | --- |
| **P18-1** | The photo library counted usage in **two of the four** places a photograph can be used. A photo on the live gallery reported "Not used anywhere", was offered a Delete button, and was destroyed on request | **FIXED** |
| **P18-2** | Renaming a menu entry changed the header and left the footer showing the old name — the same destination under two names on one page | **FIXED** |
| **P18-3** | Of the 15 pages reached from a list, **one** offered a way back to it, and that link was 126×23 — under the 24×24 minimum | **FIXED** |
| **P18-4** | "Check it on YouTube" on the video form was 118×21 | **FIXED** |
| **P18-5** | A sentence naming the institute's entire programme list, hard-coded into the footer of every page, in no registry and on no code-owned list | **FIXED** |
| **P18-6** | Four of the footer's eight column headings were editable; four were not, for no recorded reason | **FIXED** |
| **P18-7** | The media table's own schema gives "the admin must be able to pick a photo already uploaded" as the first reason it exists. It had never been built | **BUILT** |

And three harness defects, two of them in shipped suites:

| | Harness defect | Status |
| --- | --- | --- |
| **H18-1** | No suite had ever measured a single `[id]` edit page. `verify-ux` is public-only; `verify-admin` covers list and `/new` routes | **FIXED** — new suite, 29 routes × 5 widths |
| **H18-2** | `verify-gallery` asserted five audit actions over the whole table. Two of them had **never been produced by the suite** — they were residue from earlier runs | **FIXED** — the branches are now exercised, and the assertion is scoped to the run |
| **H18-3** | My own first sweep reported a broken heading order on `/admin/preview` that did not exist, and a broken skip link that was not broken | **CAUGHT BEFORE REPORTING** — see §14 |

---

## 1. Inventory

### 1.1 Public routes

12 routes, plus 5 course detail pages. Every one was opened and read.

| Route | Editable | Code-owned | Media | Consent-sensitive | External |
| --- | --- | --- | --- | --- | --- |
| `/` | hero ×4, 7 section headings, closing CTA ×2 | eyebrows, CTA labels, empty states | gallery strip, video strip, faculty, result photos | results, stories, faculty, gallery | Review Engine |
| `/about` | title, standfirst, 2 body blocks, story, CTA ×2 | eyebrows, section labels | — | — | — |
| `/courses` | title, standfirst, CTA ×2 | course names, slugs | — | — | — |
| `/courses/[slug]` ×5 | description | name, slug, breadcrumb | — | — | — |
| `/faculty` | title, standfirst, CTA ×2 | empty state | portraits | faculty photos | — |
| `/results` | title, standfirst, CTA ×2 | empty state, pagination | student photos | **yes — name + photo** | — |
| `/stories` | title, standfirst, CTA ×2 | empty state, card structure | student photos | **yes — story, name, photo separately** | — |
| `/announcements` | title, standfirst | empty state | — | — | — |
| `/gallery` | title, standfirst, CTA ×2 | empty state, filter | **every item** | **yes — showsPeople + recorded permission** | — |
| `/videos` | title, standfirst, CTA ×2 | empty state, filter | thumbnails | — | YouTube (poster only) |
| `/reviews` | title, CTA ×2 | standfirst, provenance sentence | — | — | Review Engine |
| `/contact` | title, standfirst, CTA ×2, address, phones, hours, email, coordinates | field labels | — | — | Google Maps (click-to-load) |
| site chrome | 12 contact fields, 20 nav fields, 8 footer headings, footer sentence | logo, tagline, agency credit | — | — | — |

### 1.2 Documentation vs registry vs admin vs database vs public page

The brief asks for mismatches rather than agreement. Five were found:

| # | Claim | Reality | Verdict |
| --- | --- | --- | --- |
| 1 | `prisma/schema.prisma`: the media table exists because "the admin must be able to pick a photo already uploaded" | No such control existed | **P18-7** |
| 2 | `/admin/media`: "deletion is refused while a record still points at a file" | True for 2 of 4 record types | **P18-1** |
| 3 | `/admin/media`: "Photos are attached to a student or story from that record's own page" | Also teachers and gallery entries, since Topics 6 and 8 | **FIXED** (wording) |
| 4 | Registry: nav label is editable | Editable in the header only | **P18-2** |
| 5 | No document anywhere accounts for the footer's identity sentence | It is on every page | **P18-5** |

Everything else the reports claim was checked and holds. The registry's own
render-location declarations are true of the source (50 assertions), and all
101 fields reach their declared public route (`verify-admin`, 308 assertions).

---

## 2. The content matrix

**101 registry fields** (was 96) across six groups, and **92 code-owned strings**
each with a written reason.

| Group | Fields | Affects |
| --- | --- | --- |
| Contact details | 12 | every page |
| Homepage wording | 13 | `/` |
| About page | 5 | `/about` |
| Programme descriptions | 5 | course pages |
| Page headings | 37 | 11 routes |
| Menu and footer | **29** (was 24) | every page |

Code-owned wording, by reason — every category argued in
`src/config/content-audit.ts`:

| Reason | Count | Why |
| --- | --- | --- |
| `cta` | 24 | Label travels with a fixed destination |
| `section` | 17 | Two-word typographic furniture inside a page |
| `empty` | 13 | What a page says with nothing to show — the honesty rule |
| `control` | 9 | Operates a widget; editing it makes the control lie |
| `policy` | 7 | A promise the rebuild exists to make true |
| `label` | 5 | Names the editable value beside it |
| `platform` | 5 | Somebody else's product name |
| `card` | 5 | Fixed structure of a card |
| `form` | 4 | Tied to a validation rule |
| `a11y` | 1 | Exists only for assistive technology |
| `breadcrumb` | 1 | Derived from the route |
| `credit` | 1 | Not the institute's to reword |

**HUMAN ACTION REQUIRED**, unchanged from Phase 17: 7 institute facts are still
unconfirmed (email, Google Business Profile, place ID, coordinates, YouTube,
Instagram, legal entity name). All 7 render **nothing** rather than a
placeholder, and `P-LAUNCH-08` blocks launch until they are settled.

**EXTERNAL-SOURCE:** reviews, from the Review Engine. Not copied into Postgres,
not editable, and the sentence naming their source is deliberately code-owned.

---

## 3. Admin information architecture — PASS

14 destinations in 5 groups. Every category in the brief's list is reachable in
one tap from the sidebar, and the sidebar's grouping was already sound. **No
change was made**, because none was justified by a concrete problem — the
navigation was the one part of the admin Topic 11 had already fixed.

What *was* broken was movement **out** of a page, not into one. See §8.

---

## 4. Preview and click-to-edit — PASS

`/admin/preview` lists **101 of 101** registry fields; `/admin/website` lists
**101 of 101**. Neither can drift: `tests/site-content.test.ts` asserts every
key is genuinely read by the file serving its route.

The iframe-overlay architecture stays rejected, and the reasoning is unchanged
and still correct: framing our own site means relaxing `frame-ancestors 'none'`
and `X-Frame-Options: DENY` sitewide so an admin screen can look nicer.
Clickjacking protection is worth more.

Verified unchanged: CSP, `frame-ancestors`, authentication on every action,
per-key stale-edit tokens on the preview, group tokens on the editor.

---

## 5. Media UX

| Behaviour | Result |
| --- | --- |
| Desktop file picker | PASS |
| `capture="environment"` present, camera button only on coarse pointers | PASS (code + emulated) |
| **Choose an already-uploaded photo** | **BUILT** — modal dialog, keyboard operable, Escape closes |
| Upload / replace / remove / cancel | PASS |
| Invalid, oversized, polyglot, SVG, executable, pixel-bomb | PASS (`verify-media`) |
| Failed upload leaves the existing photo alone | PASS |
| Duplicate image deduplicates by content hash | PASS |
| Consent-sensitive image | PASS — choosing a photo grants nothing; every gate is in the record's own save action |
| Stale edit | PASS |
| Unauthorised / CSRF on the new listing action | PASS — 4 assertions with a positive control |
| **Real camera on a physical phone** | **NOT TESTED** — needs a device |

The picker deliberately fetches on open rather than taking a prop: every form
that never opens it pays nothing, and a photo uploaded moments ago is already in
the list.

---

## 6. CRUD completeness — PASS

| Entity | C | R | U | D | Publish | Media |
| --- | --- | --- | --- | --- | --- | --- |
| Results | ✓ | ✓ | ✓ | ✓ | ✓ + explicit unpublish | ✓ |
| Stories | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Batches | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| Announcements | ✓ | ✓ | ✓ | ✓ | ✓ (time window) | n/a |
| Faculty | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Gallery | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (required) |
| Videos | ✓ | ✓ | ✓ | ✓ | ✓ | thumbnail |
| Enquiries | n/a — they arrive from the public form | ✓ | status + notes | **by retention policy only** | n/a | n/a |

Enquiries have no delete button, and that is correct: they are personal data
governed by the retention script, not records an administrator curates.

Destructive actions all use the same inline two-step confirm. Verified in the
browser by the entity suites (faculty 132, gallery 219, videos 232, e2e 62,
integration 67).

---

## 7. The editable-content audit

`tests/content-coverage.test.ts` extracts every user-visible string from the
public pages and the components they render, and requires each to be **either** a
registry fallback **or** listed with a reason. 9 assertions, 4 of them controls.

**Negative control:** adding `ZZPROBE a brand new sentence nobody decided about.`
to `/about` fails the test and names both the string and the file. Removing it
restores 9/9.

This found **P18-5** — the footer sentence naming every programme the institute
runs, hard-coded on every page, which no report, registry or code-owned list
mentioned. It is `footer.description` now.

**Stated limitation, not glossed:** the scan reads JSX text nodes. It does not
see text passed as a prop, built by concatenation, or living in a component's
default value. It is a floor, not a ceiling, and the test says so.

---

## 8. Admin UX findings

**P18-3 — no way back.** Of the 15 pages a teacher reaches by tapping a row,
exactly one had a back link, and it was hand-rolled at 126×23. The other
fourteen relied on Cancel at the *bottom* of the form or on the sidebar — which
on a phone is behind a drawer. Going back to a list was the hardest movement in
the admin on the device most likely to be used.

`PageHeader` now takes a `back` slot at 44px, used on all 15. A list page must
*not* have one, and the suite asserts that too.

**P18-4** — the YouTube link on the video form, 118×21, standalone in a `div`
with no inline-in-prose exemption to claim.

Everything else measured clean: 29 routes × 5 widths (320/360/390/768/1280) —
no horizontal overflow, one `<h1>` and one `<main>` per page, no skipped heading
level in the rendered outline, no clipped table, every input labelled.

---

## 9. Security findings — no defects

One new endpoint was added (`listUploadedPhotos`), and a `'use server'` export is
a public endpoint whatever renders it. Tested by replaying the real captured
request:

| Test | Result |
| --- | --- |
| Anonymous call | 307, no photo paths in the body |
| Cross-origin with a valid session | 400+, refused outright, nothing leaked |
| **Positive control** — same request, valid session and origin | returns a result |

Without that control both refusals would pass against an endpoint that returns
nothing to anyone.

The delete guard is now enforced **server-side for all four consumers**, proved
by direct action replay rather than by the absence of a button — a hidden
button is a courtesy, not a control.

`verify-security` 262/0. No CSP change, no proxy change, no new authorisation
path, no new client-visible data.

---

## 10. Revalidation — PASS

`verify-admin` writes a unique marker through the real single-field save for
**every one of the 101 fields** and reads the declared public route as an
anonymous visitor. 308 assertions, 0 failures. A chrome field reaches all 12
public routes.

The footer fix is verified end-to-end in `verify-admin-ux` §3: save through the
real editor, then confirm header **and** footer both show the new name — with a
control proving that, unchanged, the footer keeps its own deliberate wording
("All courses", not "Courses").

---

## 11. Consent — PASS, and one silent hole closed

No consent rule was weakened. The media picker grants nothing: it sets a path,
exactly as uploading does, and every gate stays in the record's own save action
and its CHECK constraints.

**The hole P18-1 left open was a privacy one, not only a data one.** A
photograph whose consent was withdrawn is unpublished, and the bytes remain for
the audit trail. But the reverse — deleting bytes a *published* record still
points at — was reachable in two clicks, and produced a broken image on a live
page with no way to tell what had been lost. Now refused, in the library and in
the action, for results, stories, teachers and gallery entries alike.

Consent withdrawal, unpublish and delete all still verified (`verify-gallery`
219/0, including a withdrawal audited as a withdrawal rather than an edit).

---

## 12. Mobile — PASS

Measured at **320, 360, 390, 768, 1280** across all 29 admin routes — 145
renders. 360 was added to the brief's list because it is the commonest Android
width in India.

Nothing overflows. Nothing important is unreachable. The back link matters most
here and is the reason §8 exists.

---

## 13. Accessibility

| Checked | Result |
| --- | --- |
| Every visible input has an accessible name | PASS, 29 routes × 5 widths |
| One `<h1>`, one `<main>` per page | PASS |
| No skipped heading level in the **rendered** outline | PASS |
| Touch targets ≥ 24×24 (WCAG 2.2 AA, 2.5.8) | PASS after P18-3 and P18-4 |
| Skip link: clipped at rest, ≥24×24 and `:focus`-matching after one Tab | PASS, asserted as a control |
| Picker dialog is a real modal with an accessible name | PASS |
| Escape closes the picker | PASS — with a **real key event** |
| **Screen reader** | **NOT TESTED** — no screen reader was run |
| **Firefox / Safari** | **NOT TESTED** — not installed |

---

## 14. Harness defects

**H18-1 — the hole behind the green tick.** `verify-ux` measures public routes.
`verify-admin` covers admin list and `/new` routes. Neither had ever opened an
`[id]` page — every edit screen in the product. Both defects in §8 were sitting
there. `scripts/verify-admin-ux.mjs` now covers all 29 routes at 5 widths.

**H18-2 — a test passing on residue.** `verify-gallery` asserted five audit
actions over the whole audit table, whenever written. When the database was
rebuilt mid-phase it failed for the first time, reporting only `created,
unpublished, deleted`. Not a regression: `published` and `updated` had **never**
been produced by that suite. Two branches of `saveGalleryItem` had no test, and
the assertion was reading earlier runs' history. Section 8c now exercises both
branches on one item and asserts by entity id; section 9 is scoped to rows
written since the run began, so it cannot pass on residue again. Gallery went
from 206/2 to **219/0** — 13 new assertions, not a silenced failure.

**H18-3 — three false positives in my own sweep, caught before reporting.**

1. *A broken heading order on `/admin/preview`* — 96 `<h2>`s between an `<h3>`
   and an `<h4>`. They are the titles of 96 **closed** `<dialog>` elements,
   which are `display:none` and in no accessibility tree. The probe was querying
   the DOM, not the rendered outline. Every check now filters on
   `getClientRects().length`, and a control asserts the filter both removes the
   invisible and keeps the real.
2. *A skip link that never becomes visible* — on the public site as well as the
   admin, which would have been serious had it been true. Focus set from
   `Runtime.evaluate` does not give a headless page the window focus, so
   `document.hasFocus()` stays false and Chrome applies neither `:focus` nor
   `:focus-visible`; `document.activeElement` reports the element anyway, which
   is what makes the reading so convincing. Measured both ways:

   | | `activeElement` | `matches(':focus')` | size |
   | --- | --- | --- | --- |
   | `a.focus()` | yes | **no** | 1×1 |
   | `page.tab()` | yes | yes | 147×52 |

   **`verify-ux` was checked against this and is sound** — its keyboard section
   has always used `page.tab()`.
3. *A delete button offered for a protected photo* — the probe walked up from
   the image until it found a row, which overshoots into the grid whenever the
   card itself does not match, and then reports other cards' buttons. The walk
   is now bounded to the last ancestor holding exactly one image, the result
   carries that count, and an assertion checks it.

**Also corrected:** my reproduction of P18-1 was initially run against a
polluted database — rows left by two aborted earlier attempts. The first result
was discarded, the database reseeded, and the reproduction re-run from a clean
baseline with a positive control.

---

## 15. Defects found

P18-1 … P18-7 and H18-1 … H18-3, above. Full detail and reproduction steps live
in the code comments at `src/lib/media/consumers.ts`,
`src/lib/site-content.ts` (`getFooterNav`), `src/components/admin/ui.tsx`
(`PageHeader`), `src/config/content-audit.ts` and `scripts/verify-admin-ux.mjs`.

**P18-1, reproduced in a browser from a clean database:**

```
a photo used by a PUBLISHED gallery entry and a PUBLISHED teacher
  → the library said "Not used anywhere"
  → it offered Delete
  → the server accepted
  → both records still pointed at it
  → an anonymous visitor asking for that photograph got 404
```

Same script, same baseline, after the fix: *"Remove it from those records
first"*, no button offered, row survives, photograph still serves 200.

---

## 16. Defects fixed

| Defect | Fix |
| --- | --- |
| P18-1 | `MEDIA_CONSUMERS` — one declared list of the four places a photo can be referenced. The library page and the delete action both read it, so they cannot disagree again |
| P18-2 | `getFooterNav()` applies a menu label override **when one has been typed** — compared against the registry fallback, because `getSiteContent()` resolves fallbacks and a naive check flattened "All courses" into "Courses" |
| P18-3 | `back` slot on `PageHeader`, 44px, on all 15 pages; the hand-rolled 126×23 link removed |
| P18-4 | 44px, `inline-flex` |
| P18-5 | `footer.description`, a 200-character paragraph field, fallback = the shipped sentence |
| P18-6 | `footer.visit/talk/hours/follow.heading` — all eight footer headings now editable |
| P18-7 | `listUploadedPhotos` + a modal picker in the shared `MediaField` |

**The bug my own control caught.** The first version of the P18-2 fix used
`content[navKey] || link.label`. `getSiteContent()` never returns empty — it
fills in the registry fallback — so the override always applied, silently
renaming the footer's "All courses" to "Courses" on an untouched site. The suite
control that asks specifically about the one link whose two labels deliberately
differ is what caught it.

---

## 17. Tests

| Suite | Result | Note |
| --- | --- | --- |
| unit | **554 / 0** | was 536; +18 across two new files |
| seo | 418 / 0 | |
| ux | **333 / 0** | run 2; run 1 had 2 intermittent — see §18 |
| admin | **308 / 0** | was 298; the new footer fields add assertions |
| security | 262 / 0 | |
| **media** | **143 / 0** | was 112; +31 from the four-consumer guard section |
| videos | 232 / 0 | |
| reviews | 224 / 0 | |
| **gallery** | **219 / 0** | was 206 / 2 — see H18-2 |
| map | 142 / 0 | |
| faculty | 132 / 0 | |
| teacher | 123 / 0 | |
| import | 116 / 0 | |
| cms | 89 / 0 | |
| integration | 67 / 0 | |
| e2e | 62 / 0 | |
| storage | 49 / 0 | |
| **admin-ux** | **47 / 0** | new — 29 routes × 5 widths, 145 renders |
| public | 46 / 0 | |
| constraints | **43 / 0** | 43 CHECK constraints intact |
| revalidation | 10 / 0 | |
| production (pre-launch) | 25 / 0 | |
| budget | 101 / 3 | **pre-existing** — same three routes as Phase 17 |
| preflight | 1 failure | **by design** — `P-DB-12`, demo data is seeded |

New test files: `tests/media-references.test.ts` (9), `tests/content-coverage.test.ts` (9).
Both have negative controls that were run and observed to fail correctly.

**Environment note, stated rather than hidden.** The embedded PostgreSQL data
directory was lost mid-phase and the database was rebuilt from migrations. It
came back with **15 tables, 7 enums and 43 CHECK constraints** — identical to
the starting state — and the demo data was reseeded. That accident is what
exposed H18-2, and it is also why several suites were re-run.

---

## 18. Not tested

| Item | Why |
| --- | --- |
| Screen reader | No screen reader was run. Semantics were checked structurally only |
| Firefox / Safari | Not installed on this machine |
| Physical phone camera and gallery picker | `capture="environment"` hands the decision to the OS; that path needs a device |
| Real object storage provider | No credentials exist; `P-MEDIA-05` reports NOT TESTED deliberately |
| Two intermittent `verify-ux` failures | A transient 400 during the drawer interaction, in run 1 only. Run 2 was 333/0 and the same total. Not reproducible standalone across 46 requests; recorded as environmental rather than diagnosed |

---

## 19. External dependencies

Unchanged. No dependency was added — the picker is a Server Action and a
`<dialog>`. Google Maps still loads only on request; YouTube still serves a
poster with no player JavaScript until asked; the Review Engine is still the
source of truth for reviews and is still not activated.

---

## 20. Remaining blockers

| Blocker | Owner |
| --- | --- |
| **HUMAN ACTION REQUIRED** — Cloudflare R2 bucket (checklist M1–M8). Cloudflare requires a payment card before R2 can be enabled, even on the free tier | Institute |
| **HUMAN ACTION REQUIRED** — 7 unconfirmed institute facts (`P-LAUNCH-08`) | Institute |
| Launch switch is OFF, as instructed | — |
| `P-DB-12` — demo data must be cleared before deploying | Agency, at deploy |

---

## 21. Production readiness

The admin is ready for a non-developer to use, and one class of data loss that
was reachable in two clicks is not any more.

Nothing in this phase changed the deployment position: the same two human
actions blocked launch before it and block it after it. No schema change, no
migration touched, 43 CHECK constraints intact, no CSP change, no new
dependency, launch switch off.

---

## 22. Next recommended phase

**Enquiry notification and the launch rehearsal.** The one workflow still
missing an end is what happens *after* a parent presses Send: the enquiry is
stored and shown in the admin, and nobody is told. `RESEND_API_KEY` and
`ENQUIRY_NOTIFICATION_TO` are declared, optional and unset, so the feature is
off rather than broken — but an enquiry nobody sees until someone opens the
admin is a lost admission.

That work pairs naturally with a full launch rehearsal against a real bucket and
a real domain, which is the only way `P-MEDIA-05` and the launched-mode SEO
checks can move off NOT TESTED.
