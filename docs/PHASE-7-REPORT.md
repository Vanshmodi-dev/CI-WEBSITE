# Phase 7 — Admin completion, content management, launch readiness

**Date:** 23 August 2026
**Baseline:** `71c8c62` (Phase 6)

> **No institute facts, student records, results, testimonials, faculty, fees,
> batches, contact details, achievements or statistics were invented during
> Phase 7.** The database ends this phase with **0 rows in every table**.

---

## 1. Admin functionality completed

| Work | Why it mattered |
| --- | --- |
| **Subject marks** — full editor, stored transactionally, shown publicly | The `SubjectScore` model shipped in Phase 4 and was **completely unused**. No result could ever show its subjects. "Accounts 99, Economics 98" is far stronger evidence than "96%". |
| **Student search** | The list had filters but no search. Finding one student among 1,000 by paging is not a workflow. Database-side, 19 ms at scale. |
| **Website preview** (`/admin/preview`) | Answers the question a teacher actually has after publishing: *did it work?* |
| **Photo path hardening** | `startsWith('/')` accepted `/../../etc/passwd` and `//evil.com`. Now validated and unit-tested. |
| **Launch switch** | Indexing was two hardcoded TODOs in two files. |

## 2. Public functionality completed

Subject marks now render on result cards. Everything else from Phase 6 is
unchanged and re-verified.

## 3. Content management matrix

Full analysis in **`docs/PHASE-7-CONTENT-MANAGEMENT-MATRIX.md`**. Two decisions
§14 and §15 asked for:

**Courses stay configuration-driven.** Slugs are route segments and
`generateStaticParams` inputs. Database-driven courses create three failures a
teacher cannot diagnose: adding one produces a 404 behind every nav link,
deleting one breaks a statically generated page and its inbound links, renaming
a slug kills the old URL silently. Phase 6 found four dead nav links from
exactly this class of mistake — and that was with slugs under version control.
**Unblocks when** course content exists: a `Course` model with an immutable
slug, seeded from the current config.

**No site-settings screen.** `institute.ts` is what makes NAP consistency
*structural* — footer, contact page and schema.org cannot drift because there is
one copy. A settings form reintroduces exactly that drift, and the symptom
(schema.org disagreeing with the Business Profile) is invisible in the UI.
Opening hours and social links are genuine future candidates, but both are
currently `null` — building a form to edit nothing is not a feature.

## 4. Content collection checklist

**`docs/PHASE-7-CONTENT-COLLECTION-CHECKLIST.md`** — written for the institute,
not for a developer. Every item marked *must be verified by the institute*.

## 5–7. Security, authorization, consent review

| Check | Result |
| --- | --- |
| Unauthenticated admin routes | 307 → sign-in (all) |
| Forged / tampered / back-dated / garbage cookies | rejected |
| Direct POST to mutation endpoints | unreachable |
| Deactivating an account | access revoked **immediately** |
| Session cookie | HttpOnly, SameSite=Lax, Secure in production |
| Account enumeration | unknown email and wrong password identical |
| Sign-in rate limiting | engages (observed interfering across suites — working) |
| Secret scan, 1,035 KB of public payload | clean |
| Consent metadata in public HTML | **none** |
| Photo path validation | 6 new unit tests |

Consent remains **four independent booleans**. The old ordered `ConsentScope`
was not reintroduced. A story grant still does not confer a photograph — proven
twice, in the rendered page and by the database refusing the row.

## 8. Database status

Verified against **real PostgreSQL 18.4**: 10 tables, 5 enums, 2 FKs, 28 CHECK
constraints, migration deterministic and non-destructive. **Not yet on a hosted
provider** — that needs your account (§13).

## 9. Email status

Unchanged and correctly blocked. `notify.ts` is a seam; the enquiry is persisted
**before** notification is attempted, so a missing notifier cannot lose a lead —
observed in the logs as `enquiry.notification.skipped` while the row sat safely
in the database.

## 10. SEO launch status

**`src/config/launch.ts` is now the single decision point.** Indexing requires
**two** conditions: `SITE_IS_LAUNCHED = true` in a reviewed commit, **and**
`NEXT_PUBLIC_SITE_URL` being a real `https://` domain (localhost and
`*.vercel.app` rejected).

Two conditions deliberately — §21 asked that indexing not hinge on one
accidentally-set variable. Currently **not indexable**, which is correct.

## 11–12. Production readiness and cost

**`docs/PRODUCTION-SETUP.md`** — eight numbered steps, pre-launch checklist,
and a backup strategy sized to a 10 MB database.

**`docs/COST-AND-INFRASTRUCTURE.md`** — expected recurring cost is **a domain
(~₹800–1,200/year)**, plus possibly Vercel Pro.

> ⚠ **The cost most likely to be missed:** Vercel's Hobby plan **prohibits
> commercial use**, and an institute's website is commercial. Pro is ~US$20/mo.
> Flagged because it is not obvious from the pricing page.

## 13. Manual setup remaining

**CODE COMPLETE — nothing below blocks further engineering.**

| Only you can do this | Blocks |
| --- | --- |
| Create the Neon account and database | Production deployment |
| Create the three production secrets | Production deployment |
| Buy the domain, configure DNS | Launch |
| Create a professional mailbox + SPF/DKIM | Enquiry notifications |
| Provide verified institute content | Faculty page, course details |
| Collect signed student consent | Any published student |
| Flip `SITE_IS_LAUNCHED` | Search indexing |

## 14. Verified content still required

Transparent/vector logo · professional email · confirmed address, phones and
hours · Place ID · founding year and founder · faculty names, credentials and
photos · course syllabus, fees, timings · photography · real results, stories
and consent records.

**Every one is absent from the site rather than guessed at.**

## 15–20. Verification

| Check | Result |
| --- | --- |
| Unit tests | **73 / 73** (6 new: photo path) |
| Consent constraints | **35 / 35** |
| End-to-end admin + enquiry | **62 / 62** |
| Public data isolation | **50 / 50** |
| **Revalidation (new)** | **9 / 9** |
| **Total** | **229 automated checks** |
| Typecheck · Lint · Build · Audit | clean · 0/0 · 41 routes · **0 vulnerabilities** |
| Secret scan | clean |

### Revalidation — verified, not assumed (§10)

`scripts/verify-revalidation.mjs` signs in, publishes through the **real admin
form over HTTP**, then reads the **real public page with no waiting**:

- announcement not on the public page beforehand ✅
- published via the admin form → **public page updated immediately** ✅
- **homepage banner updated immediately** ✅
- unpublished → **public page dropped it immediately** ✅

If `revalidatePath` had not fired, the cached page would be served and these
would fail. That was the Phase 6 bug; it is now covered by a regression test.

### Three failures investigated, all test bugs

Reported rather than quietly fixed:

1. **Backslash fixture** — my escaping collapsed `\w`, so the test asserted on
   `/photoswindows.jpg`, a legitimately valid path. The validator was correct.
2. **Form selection** — every admin page has a logout form in the header and
   edit pages have a delete form after the save form. "First form" invoked
   nothing; "spans to last `</form>`" invoked **delete instead of save**. Now
   selected by a field the form must contain.
3. **Rate-limiter interference** — E2E reported 16 failures when run straight
   after the revalidation suite, because both sign in and the limiter is 3/60s
   per IP. Run in isolation: **62/62**. The limiter was working correctly.

In each case the application behaviour was demonstrably correct, so the test
was fixed — never the reverse.

## 21. Performance at ~1,000 students

| Query | Time |
| --- | --- |
| Admin students page 1 / page 10 | 17 ms / 12 ms |
| **Student name search (new)** | **19 ms** |
| Search + programme filter | 11 ms |
| Enquiries page / by status | 10 ms / 6 ms |
| Rate-limit and duplicate lookups | 5 ms / 3 ms |
| **Dashboard (one query, as shipped)** | **5 ms** |

Planner confirmed index usage on all four hot paths. **Whole database: 11 MB**
at 1,000 students + 1,000 enquiries.

The scale benchmark was also corrected — it still measured the *old* six-query
dashboard that Phase 5.5 replaced, so it was benchmarking code we no longer
ship.

## 22. Files changed

**Created:** `src/config/launch.ts`, `src/components/admin/subject-scores.tsx`,
`src/app/admin/(dashboard)/preview/page.tsx`,
`scripts/verify-revalidation.mjs`, and four documents —
`PHASE-7-CONTENT-MANAGEMENT-MATRIX.md`,
`PHASE-7-CONTENT-COLLECTION-CHECKLIST.md`, `PRODUCTION-SETUP.md`,
`COST-AND-INFRASTRUCTURE.md`.

**Modified:** `src/app/robots.ts`, `src/app/layout.tsx`, `src/lib/admin-data.ts`,
`src/lib/public-data.ts`, `src/lib/validation.ts`,
`src/components/domain/public-cards.tsx`, `src/components/admin/shell.tsx`,
the students admin action/form/list/edit pages, `scripts/scale-check.mjs`,
`tests/validation.test.ts`, `README.md`, `docs/README.md`, `package.json`.

## 23. Commit

Reported alongside this document.

## 24. Remaining blockers

Only the manual items in §13. **No engineering work is blocked.**

## 25. Next recommended action

**Content, not code.** In order:

1. **Send us the transparent logo and a professional email address** — the two
   smallest items, and between them they unblock the footer logo, the dark
   theme, the email on the contact page and enquiry notifications.
2. **Confirm the address and phone numbers in writing.** They are carried from
   the old site and marked `unverified`; that site also published fabricated
   toppers, so nothing from it is trusted until you confirm it.
3. **Create the Neon database** and run `npm run db:migrate` (§13).
4. Then course details and faculty information, which unblock three pages.

I would not add more features. The admin does what a teacher needs; what is
missing is true information to put in it.

---

## The content-integrity statement

Every claim on the public site traces to one of three sources: the **logo
artwork** (name and tagline, read verbatim), **`src/config/institute.ts`**, or
**a row an administrator entered**.

Nothing else is stated. No founding year, no student count, no pass rate, no
faculty, no fees, no achievements, no ratings, no testimonials.

All test fixtures were prefixed `DEMO` or `ZZDEMO` with deliberately non-human
names, and every one was deleted. **The database ends this phase with 0 rows in
every table** — toppers, subject scores, results, stories, batches,
announcements, enquiries, admins and audit log.
