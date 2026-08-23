# Phase 8 — Admin ↔ public integration

**Date:** 23 August 2026
**Baseline:** `07c7752` (Phase 7)

> Phase 8 proves the two halves of the system are correctly connected. It found
> **two real integration bugs**, both of which produced incorrect public data,
> and both are fixed and covered by regression tests.
>
> **No institute facts, students, results, testimonials or contact details were
> invented.** The database ends this phase with **0 rows in every table**.

---

## 1. Integration architecture

```
ADMIN FORM  (authenticated, server-rendered)
     │  multipart POST
     ▼
SERVER ACTION  requireAdminOrNull() — the security boundary, not middleware
     │  validate → consent gate → audit
     ▼
DATABASE  28 CHECK constraints — the final enforcement layer
     │
     ▼
PUBLIC DATA LAYER  src/lib/public-data.ts (server-only)
     │  filters in SQL, resolves present() on the server
     ▼
PUBLIC PAGE  receives ONLY resolved presentation — no consent fields exist on the props
     │
     ▼
REVALIDATION  smallest correct surface per mutation
```

**The property that makes this safe:** a public component cannot leak a consent
field, because it never receives one. `PublicResult` and `PublicStory` have no
`consentRef`, no `consentPhoto`, no `studentName`.

## 2–3. Entity mapping

| Entity | Model | Public data function | Public route(s) | Revalidates |
| --- | --- | --- | --- | --- |
| **Result / topper** | `Topper` | `getPublishedResults` | `/results`, `/` | `/`, `/results` |
| **Subject marks** | `SubjectScore` | via `getPublishedResults` | `/results`, `/` | `/`, `/results` |
| **Student story** | `StudentStory` | `getPublishedStories` | `/stories`, `/` | `/`, `/stories` |
| **Batch** | `Batch` | `getUpcomingBatches` | `/courses/[slug]`, `/courses`, `/` | `/`, `/courses`, affected course page(s) |
| **Announcement** | `Announcement` | `getActiveAnnouncements`, `getTopAnnouncement` | `/announcements`, `/` (banner) | `/announcements`, `/` |
| **Enquiry** | `Enquiry` | **none — by design** | **none** | none (private) |

**There is no public `/batches` route.** Batches surface only on course pages
and the homepage. Documented rather than invented, per §7.

Stories have **no individual public route** — the cards carry the full text.
The `slug` column exists for a future route and is now kept stable (§9).

## 4. Revalidation matrix

| Mutation | Revalidated | Not revalidated, and why |
| --- | --- | --- |
| Announcement save/delete | `/announcements`, `/`, `/admin/announcements`, `/admin` | — |
| Batch save | `/`, `/courses`, new course page, **+ old course page if reassigned** | Other course pages — nothing changed there |
| Batch delete | `/`, `/courses`, **all** course pages | The slug is gone, so the affected page is unknown |
| Result save / unpublish / delete | `/`, `/results`, `/admin/students`, `/admin` | `/courses/*` — results do not appear there |
| Story save / delete | `/`, `/stories`, `/admin/stories` | `/admin` — the dashboard does **not** count stories (verified) |
| Enquiry status / notes | `/admin/enquiries` only | **No public path.** Enquiries are private. |

`revalidatePath('/')` is used only where the homepage genuinely shows that
entity — the banner, the results band, the stories band, the batch band.

## 5. Consent and publication behaviour

Unchanged and re-verified end-to-end. Confirmed through the **real admin form**:

- a new result defaults to **not published**
- publishing without consent is **refused by the server action**, in plain words
  ("Add the consent form reference you hold on file") — the teacher never meets
  a database error
- publishing **with** consent succeeds and appears publicly immediately
- **granting name consent revealed the name**; before that the result showed
  with the name withheld
- story consent set **neither** photo consent nor result consent

## 6. Preview behaviour

Audited. `/admin/preview` calls the **same public data functions** the live site
calls, so it can only show what a visitor could already see. There is no preview
token, no bypass parameter and no unpublished-record endpoint.

**Preserved deliberately.** A signed preview URL for unpublished student data
would be a way to leak a minor's photograph to anyone who obtained the link.
The safer design was already in place and was not weakened.

## 7. Enquiry privacy

Verified against 8 public surfaces — `/`, `/results`, `/stories`,
`/announcements`, `/courses`, `/contact`, `/admissions`, `/sitemap.xml`. No
name, phone or message body appears on any of them. The admin **can** see the
enquiry; the `ipHash` is **not** rendered even there.

## 8. Concurrency findings

Examined per §12, fixing only what could produce incorrect public data:

| Scenario | Finding | Action |
| --- | --- | --- |
| Subject marks replaced on save | Already `$transaction` (delete + recreate) | None needed |
| Edit a record another admin deleted | Prisma throws, caught, generic message shown | Acceptable — no corruption |
| Two admins editing one record | Last write wins | Accepted. One admin account; optimistic locking is unjustified complexity |
| **Batch reassigned between courses** | **Stale public page** | **Fixed — see §9** |
| **Two stories, same name and year** | **Unique-constraint failure** | **Fixed — see §9** |

## 9. Changes made — two real bugs

### Bug 1 — a reassigned batch stayed on its old course page

`saveBatch` revalidated only `input.courseSlug`. Moving a batch from Class XI to
Class XII refreshed the Class XII page and left **Class XI still advertising a
batch it no longer had**, for up to an hour.

Fixed: the previous `courseSlug` is read before the update, and both pages are
revalidated when it changed.

### Bug 2 — story slugs collided

`slug` is `@unique`, generated as `slugify(name + year)`. Two students sharing a
name and year — siblings, or simply a common name among a thousand students —
collided. The teacher saw *"We could not save this right now. Please try
again."*, which is both wrong and unactionable: retrying never works.

Fixed: `uniqueSlug()` appends `-2`, `-3` … on collision (bounded, with a
timestamp fallback). **On edit the existing slug is kept** — regenerating it
because someone corrected a spelling would change a record's identity.

## 10. Tests added

`scripts/verify-integration.mjs` — **47 assertions**, driving real admin forms
over HTTP and reading real public pages. Covers every item in §15:

result lifecycle (draft → refused publish → published → edit → consent change →
unpublish) · subject marks saved and rendered · story lifecycle with independent
consent · story slug collision · batch lifecycle **including reassignment** ·
batch validity windows · future-dated announcements · enquiry privacy across 8
surfaces · delete behaviour · empty states.

## 11. Verification results

| Suite | Result |
| --- | --- |
| **Integration (new)** | **47 / 47** |
| Public data isolation | 50 / 50 |
| End-to-end admin + enquiry | 62 / 62 |
| Consent constraints | 35 / 35 |
| Revalidation | 9 / 9 |
| Unit tests | 73 / 73 |
| **Total** | **276 automated checks** |

Typecheck clean · lint 0/0 · build 41 routes · **0 vulnerabilities** · database
ends with **0 rows**.

### A third test-harness bug, reported not hidden

Two assertions failed claiming the result did not appear publicly — while three
neighbouring assertions proved it did. Cause: **React inserts `<!-- -->` between
adjacent JSX expressions during SSR**, so a card rendering `{score}{'%'}` emits
`88<!-- -->%`. Visually correct, textually not. The harness now strips comment
separators before asserting. The application was correct; the test was fixed.

That is the third harness bug across three phases — the tests are consistently
the fragile part, which is worth knowing when reading any result from them.

## 12. Known limitations

- **Last-write-wins on concurrent edits.** Accepted for one admin account.
- **Stories have no individual route**, so the slug is currently unused
  publicly. Kept stable so a future route has durable URLs.
- **Batch delete revalidates all five course pages.** Slightly broader than
  needed; the affected slug is gone by then. Five cheap invalidations.
- **Year filter chips on `/results`** ignore the active programme filter, so a
  year with no results for that programme can still be offered. Cosmetic.

## 13. Deferred to Phase 9 (SEO / performance)

- Year-chip counts scoped to the active filter.
- Whether `/results` should be static-with-params rather than fully dynamic.
- `enquiries.name` search is a sequential scan — 5 ms at 1,000 rows, fine now.
- Image `sizes`/`priority` tuning once real photographs exist.

## 14. Deferred to Phase 10 (security hardening)

- CSP currently allows `'unsafe-inline'` for styles (Next streaming SSR); a
  nonce strategy would remove it.
- Optimistic locking, if a second admin account is ever added.
- Audit-log retention and rotation policy.
- Upload pipeline hardening — **when** photo upload is built (Phase 7 spec).

## 15. Deferred to Phase 11 (QA / launch)

- Real-device responsive pass and screen-reader pass.
- Lighthouse CI budgets against production.
- Bulk import, per the Phase 7 specification.
- The launch switch flip and Search Console submission.

---

**No integration defect remains open.** Both bugs found were fixed, verified,
and are now covered by regression tests that would fail if either regressed.
