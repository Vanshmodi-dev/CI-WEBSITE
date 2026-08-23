# Phase 5.5 — Database provisioning & end-to-end verification

**Date:** 23 August 2026
**Baseline:** `66e89c2` (Phase 5)

> **The headline:** the application has now actually run against a real
> PostgreSQL database. The migration executed, all **28 CHECK constraints were
> exercised**, and the full admin panel and enquiry pipeline were driven over
> real HTTP. Three previous reports had to say these "have never executed".
> That sentence is retired.
>
> **The caveat:** this was a *local* PostgreSQL 18.4 instance, not a hosted
> production database. Choosing and creating the hosted one needs an account
> only you can open. Details in §1 and §27.

---

## How the database problem was solved without an account

Every prior phase stalled on the same thing: verifying the constraints needs a
database, and a hosted database needs your signup. So instead of stalling
again, this phase runs **genuine PostgreSQL binaries locally** via
`embedded-postgres` — a dev-only dependency that ships official PostgreSQL
builds. The engine is real, so the constraints are really enforced.

```bash
npm run db:test            # start PostgreSQL 18.4 on 127.0.0.1:55432
npm run verify:constraints # 35 consent/integrity assertions
npm run verify:e2e         # 62 end-to-end assertions over HTTP
npm run verify:scale       # ~1,000 student benchmark
npm run db:test:stop       # stop and delete the data directory
```

This is a **test harness, not the production database.** Its credentials are
local-only, trivial by design, and hold nothing but throwaway `DEMO` rows.

---

## 1. Database provider — **DECISION NEEDED FROM YOU**

**Recommendation: Neon free tier. Cost: ₹0/month. No payment required.**

Measured evidence, not estimation. At **1,000 students + 1,000 enquiries** the
entire database is **9.7 MB**:

| Table | Size at 1,000 students |
| --- | --- |
| `enquiries` | 608 kB |
| `toppers` | 288 kB |
| everything else | < 200 kB |
| **Whole database** | **9.7 MB** |

Against a 500 MB free tier that is roughly **50× headroom** — the institute
would need ~50,000 students before storage mattered.

| | Neon free | Supabase free |
| --- | --- | --- |
| Storage | 0.5 GB/project | 500 MB |
| Includes | database only | database + auth + storage + functions |
| Suspends when idle | yes | yes |
| Asia region | Singapore / Mumbai | Singapore / Mumbai |

**Why Neon over Supabase:** Supabase's advantage is its bundled auth, file
storage and edge functions — and this project deliberately uses none of them.
Authentication is our own scrypt implementation (Phase 5), chosen so there is
no vendor dependency in the security path. We would be paying complexity for
features we already decided not to use. Neon is the database alone, which is
exactly the requirement.

**Cost if the institute ever outgrows free:** Neon's paid tier starts around
US$19/month. On these measurements that is years away, and nothing about the
current design forces it.

### ⛔ What I need from you

I cannot create the account — it needs your email and consent to terms.

1. Sign up at <https://neon.tech> (free, no card).
2. Create a project. **Region: Singapore (`ap-southeast-1`)** or Mumbai —
   whichever is offered; both are close to Jaipur.
3. Copy the **pooled** connection string (Neon labels it "Pooled connection").
   Prisma with the `@prisma/adapter-pg` driver adapter should use the pooled
   endpoint for the app.
4. Put it in `.env.local` — **already git-ignored, verified this phase**:
   ```
   DATABASE_URL="postgresql://…?sslmode=require"
   ENQUIRY_SECRET="…"          # openssl rand -base64 32
   ADMIN_SESSION_SECRET="…"    # openssl rand -base64 32
   ```
5. Then: `npm run db:migrate` and `npm run create-admin`.
6. Tell me **"database is ready"** — do not paste the URL into chat.

---

## 2–12. What is actually in the database

Read back from the live catalogue, not from the migration file.

| # | Item | Result | |
| --- | --- | --- | --- |
| 2 | Free/paid | Free (local harness); Neon free recommended | PASS |
| 3 | Monthly cost | **₹0** | PASS |
| 4 | Region | Local `127.0.0.1` for this run; Singapore/Mumbai recommended | N/A |
| 5 | PostgreSQL version | **18.4** on x86_64-windows | PASS |
| 6 | Prisma version | **7.9.1** (client + CLI + adapter-pg) | PASS |
| 7 | Migration status | **Applied.** `migrate deploy` succeeded; `migrate status` reports *"Database schema is up to date"* | **PASS** |
| 8 | Tables | **10** (9 application + `_prisma_migrations`) | PASS |
| 9 | Enums | **5** — `Board`(4) `ClassLevel`(6) `DisplayNameMode`(3) `EnquiryStatus`(5) `Programme`(5) | PASS |
| 10 | Foreign keys | **2** — `audit_log→admin_users` (SET NULL), `subject_scores→toppers` (CASCADE) | PASS |
| 11 | Indexes | **24** (includes primary keys) | PASS |
| 12 | CHECK constraints | **28** — all created, all exercised | **PASS** |

Also verified: **88 NOT NULL constraints**, `published` defaults to `false` on
all five publishable tables, `displayNameMode` defaults to `INITIALS`, and all
consent columns are `boolean NOT NULL DEFAULT false`.

**Migration safety:** 1 migration file, `migration_lock.toml` present with
`provider = "postgresql"`, and **0 destructive statements** (no `DROP`,
`TRUNCATE` or `DELETE`). Re-running `migrate deploy` on an already-migrated
database is a no-op.

---

## 13. Admin authentication — **PASS**

Verified over real HTTP against the real database:

| Check | Result |
| --- | --- |
| Password stored as scrypt hash, never plaintext | PASS |
| Stored hash does not contain the password | PASS |
| Correct password verifies; wrong password does not | PASS |
| Wrong password issues **no** session cookie | PASS |
| Wrong password and unknown email give the **identical** message | PASS |
| Session cookie is `HttpOnly` | PASS |
| Session cookie is `SameSite=Lax` | PASS |
| Cookie contains no password material | PASS |
| `lastLoginAt` recorded | PASS |
| Tampered signature rejected | PASS |
| Back-dated expiry rejected | PASS |
| Garbage cookie rejected | PASS |
| **Deactivating an account revokes access immediately** | PASS |
| Logout clears the cookie and access is lost | PASS |

The password used in testing was randomly generated at runtime and never
printed, written or committed.

**Note on `npm run create-admin`:** it reads the password from a hidden
terminal prompt, so it needs an interactive TTY and could not run in this
non-interactive session. Its underlying mechanism — `hashPassword` → database
insert → HTTP sign-in — was verified end-to-end instead. You run the script
yourself when the hosted database exists; it never accepts a password as an
argument, because that would land in shell history.

---

## 14. Enquiry pipeline — **PASS**

Driven through the real public form, against real PostgreSQL:

| Check | Result |
| --- | --- |
| Valid enquiry accepted and **persisted** (0 → 1 row) | PASS |
| Phone normalised to `919900000001` | PASS |
| `ipHash` is a 64-char digest — **no raw IP stored** | PASS |
| Status starts `NEW`; consent timestamp recorded | PASS |
| Duplicate within the window creates **no** second row | PASS |
| Honeypot submission stores nothing | PASS |
| Forged token stores nothing | PASS |
| Missing consent rejected with a field error | PASS |
| Invalid phone rejected with a field error | PASS |
| Neither invalid submission stored anything | PASS |
| Burst rate limiting engages on rapid submissions | PASS |
| Notification seam skipped without deleting the saved lead | PASS |

**Notification remains a documented seam.** No email provider was added — the
institute still has no professional address or sending domain. The enquiry is
persisted *before* notification is attempted, so a missing notifier cannot lose
a lead. This was observed: `enquiry.notification.skipped` appears in the log
while the row sits safely in the database.

### One test bug found and fixed

The first E2E run reported *"missing consent is rejected"* as a **FAIL**.
Investigation showed the code was correct and **the test was wrong**:
`checkBurst` (3 per 60s) runs *before* validation, so by the time that case ran
it had spent its budget and correctly returned "rate limited" instead of the
consent error. The test now runs validation failures in their own burst window.
Reported here rather than quietly corrected.

---

## 15. Consent verification — **PASS (35/35)**

**This is the section every previous report had to defer.** These assertions
now run against PostgreSQL itself, and each names the constraint that fired.

| Invalid state attempted | Rejected by |
| --- | --- |
| Published with no consent at all | `toppers_published_requires_consent` |
| Published with permission but no consent reference | `toppers_published_requires_consent` |
| Published with reference but no result permission | `toppers_published_requires_consent` |
| Published without `publishedAt` | `toppers_published_at_set` |
| **Published photo without photo permission** | `toppers_photo_requires_photo_consent` |
| Result + name permission used to publish a photo | `toppers_photo_requires_photo_consent` |
| Full name without name permission | `toppers_name_requires_name_consent` |
| First-name-only without name permission | `toppers_name_requires_name_consent` |
| **Story published without story permission** | `student_stories_published_requires_consent` |
| **Story + photo without photo permission** | `student_stories_photo_requires_photo_consent` |
| Flipping `published` on an unconsented draft | `toppers_published_requires_consent` |
| **Removing the consent reference from a published row** | `toppers_published_requires_consent` |
| **Revoking result permission on a published row** | `toppers_published_requires_consent` |
| Percentage above 100 | `toppers_percent_range` |
| Unknown score unit | `toppers_score_unit_known` |
| Implausible year | `toppers_year_sane` |
| Announcement ending before it starts | `announcements_window_valid` |
| Announcement with a zero-length window | `announcements_window_valid` |
| Raw IP address in `ipHash` | `enquiries_iphash_is_sha256_hex` |
| Non-numeric phone | `enquiries_phone_digits` |
| Blank name | `enquiries_name_not_blank` |
| **Plaintext password in the hash column** | `admin_users_password_is_hashed` |
| Uppercase email | `admin_users_email_lowercase` |
| Unknown audit action | `audit_log_action_known` |

Valid states confirmed **accepted**: draft with no consent; photo permission
without a photo; initials with no name permission; story with story permission
and no photo; marks above 100 when the unit is "marks"; publishing once consent
is recorded. Cascade delete verified (deleting a topper removed both subject
scores).

**The NULL problem is gone.** Phase 4.5 Finding 3 showed the old nullable-enum
constraints could evaluate to `NULL`, and a PostgreSQL CHECK *passes* on NULL.
Every consent column is now `boolean NOT NULL DEFAULT false`, so the expression
can never be NULL. Verified in the live catalogue.

### Which layer catches what

| Layer | Catches | Evidence |
| --- | --- | --- |
| **UI** | Publish control disabled with the missing permissions listed | Phase 5 |
| **Server action** | Recomputes blockers, refuses before writing | Phase 5 |
| **Database** | Everything above, plus anything bypassing the app | **35/35 this phase** |

The teacher is meant to meet layer 1. Layers 2 and 3 exist because layer 1 can
be bypassed.

---

## 16–19. Content CRUD — **PASS**

| Area | Verified |
| --- | --- |
| **Students / results** | Create, edit, persistence; **defaults to not published**; admin list shows drafts labelled "not shown yet" |
| **Batches** | Create, edit, persistence; **an expired batch does not appear as upcoming** |
| **Announcements** | Create, edit; a current one is live; **an expired one removes itself** |
| **Stories** | Independent story/name/photo permissions enforced by the database (§15) |
| **Enquiries** | Detail page loads; status change persists; **`ipHash` never appears in admin HTML** |

Every test row was prefixed `DEMO - ` and removed. Final count across all
content tables: **0 rows**.

---

## 20. Scale at ~1,000 students — **PASS, after one fix**

Benchmarked with 1,000 synthetic students and 1,000 enquiries (created, timed,
then deleted).

| Query | Time |
| --- | --- |
| Admin students page 1 (50) | 7 ms |
| Admin students page 10 (skip 450) | 4 ms |
| Filter by programme | 3 ms |
| Enquiries page 1 | 3 ms |
| Enquiries by status | 2 ms |
| Enquiry search by name | 6 ms |
| Rate-limit count by `ipHash` | 3 ms |
| Duplicate check by phone | 1 ms |
| Dashboard (before fix) | **759 ms cold** / 3 ms warm |
| Dashboard (after fix) | **219 ms cold** / 1 ms warm |

Planner confirmed **index usage** on the rate-limit lookup, status filter,
published-toppers query and duplicate check.

### ⚠ Real defect found and fixed: silent truncation

`listToppers` used `take: 300` and filtered **in memory**. At ~1,000 students
the admin would have shown 300 and given **no indication that 700 were
missing** — a cap that hides data without saying so is worse than a slow query.

Fixed:
- **Server-side filtering.** Programme and publication filters are now `WHERE`
  clauses, not a post-fetch `.filter()`.
- **Pagination**, 50 per page, on students, enquiries and stories.
- **A visible total** — "Showing 51–100 of 1,000" — so the question *"have I
  seen everything?"* is answered on screen.

Batches and announcements are deliberately **not** paginated: they are bounded
by the calendar (a few per year), not by student count. Their `take: 200` is a
safety ceiling that would take a century to reach.

### Dashboard round trips

Six parallel `count()` calls opened six connections at once. On a provider that
suspends when idle — which Neon's free tier does — every visit after a quiet
spell paid that. Now one query, one connection: **759 ms → 219 ms cold**.

---

## 21. Security — **PASS**

| Check | Result |
| --- | --- |
| Secrets in client bundles (**819 KB** across 4 pages + 12 assets) | **none** |
| `DATABASE_URL` value or name in client payload | none |
| `ENQUIRY_SECRET` / `ADMIN_SESSION_SECRET` value or name | none |
| `PrismaClient`, `PrismaPg`, `scrypt`, `passwordHash`, `verifyPassword`, `hashIp`, `ipHash`, `requireAdmin`, session cookie name | none |
| Unauthenticated admin pages | 307 → sign-in |
| Forged / tampered / garbage cookies | rejected |
| Admin absent from public nav, homepage HTML, sitemap | PASS |
| Unpublished student absent from public pages | PASS |
| Enquiry data absent from public pages | PASS |
| Raw IP addresses stored | **none** — 64-char HMAC only |
| Secrets or personal data in server logs | **none** |
| `.env*` tracked in git (only `.env.example`) | PASS |
| Local harness credentials in tracked files outside the harness | none |

Server logs carry event shapes only: `enquiry.created`,
`enquiry.rejected.honeypot`, `admin.signin.failed`, and so on — no names, no
phone numbers, no email addresses.

---

## 22–26. Regression

| Check | Result |
| --- | --- |
| 22. Dependency audit | **0 vulnerabilities** |
| 23. Typecheck | clean |
| 24. Lint | 0 errors, 0 warnings |
| 25. Unit tests | **67 passing**, 13 suites, 0 failing |
| 26. Production build | 24 routes |

Plus, new this phase: **35 constraint assertions** and **62 end-to-end
assertions**, both against real PostgreSQL. Total **164 automated checks**.

---

## 27. Remaining blockers

| Blocker | Who | Blocks |
| --- | --- | --- |
| **Hosted database account** | You (§1) | Production deployment. Local verification is complete. |
| Professional email + sending domain | Institute | Enquiry notifications (seam ready) |
| Confirmed NAP, hours, Place ID | Institute | Contact page, map, `LocalBusiness` schema |
| Course syllabus, fees, timings | Institute | Course pages, and the Courses admin section |
| Real results, photos, consent forms | Institute | Any published student content |
| Transparent / vector logo | Institute | Logo on navy and dark grounds |

**Not blocked any more:** the migration, the consent constraints, admin
authentication, the enquiry pipeline, and scalability to ~1,000 students.

## 28. Costs that will eventually be required

| Item | Cost | When |
| --- | --- | --- |
| Database | **₹0** (Neon free) | Now — free tier is ~50× larger than needed |
| Domain | ~₹800–1,200/year | Before launch |
| Hosting (Vercel) | **₹0** (Hobby) | Now — but Hobby forbids commercial use, so check terms |
| Email sending (Resend) | **₹0** to 3,000/month | When notifications are wired |
| Photography | one-off | Phase 1 content |

**Nothing requires payment today.** The only near-certain future cost is the
domain.

## 29. Recommended next phase

**Phase 6 — content and launch readiness**, not more features. In order:

1. **You provision Neon** (§1) and run the migration against it — everything
   else is verified, this is the last infrastructure step.
2. Collect the blocking content in §27. The build is ahead of the content, and
   has been for three phases.
3. Then the public evidence pages (results, faculty) and the integrations
   (Review Engine, YouTube) that were deferred from Phase 5.

I would **not** add admin features next. The panel covers what the teacher
needs; what is missing is real information to put in it.

---

## Is the application connected to and tested against a real PostgreSQL database?

**Yes — against a real PostgreSQL 18.4 instance, locally.** The migration
applied, all 28 CHECK constraints were created and exercised, and the admin
panel and enquiry pipeline were driven over real HTTP with data read back from
the database.

**Not yet against a hosted production database**, because creating that account
requires you. Everything is ready for it: the migration is deterministic and
non-destructive, the workflow is `npm run db:migrate` then
`npm run create-admin`, and the verification suites can be re-run against the
hosted database with a single environment variable change.
