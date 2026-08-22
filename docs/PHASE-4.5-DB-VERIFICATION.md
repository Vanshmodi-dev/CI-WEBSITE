# Phase 4.5 — Database staging & migration verification

**Date:** 21 August 2026
**Baseline commit:** `3f74480`
**Status:** ⛔ **BLOCKED — offline audit complete, migration NOT executed.**
No PostgreSQL instance, no Docker and no `DATABASE_URL` exist on this machine.
Provisioning requires a manual step (checklist at the end).

---

## Part 1 — Offline audit (complete)

### Inventory

| Object | Count | Detail |
| --- | ---: | --- |
| Tables | 7 | `enquiries`, `toppers`, `subject_scores`, `result_records`, `student_stories`, `announcements`, `batches` |
| Enums | 6 | `EnquiryStatus`(5), `ClassLevel`(6), `ConsentScope`(5), `DisplayNameMode`(3), `Programme`(5), `Board`(4) |
| Primary keys | 7 | one per table |
| Indexes | 12 | 1 unique (`student_stories.slug`) |
| Foreign keys | 1 | `subject_scores.topperId → toppers.id`, `ON DELETE CASCADE` |
| CHECK constraints | **25** | see correction below |

Prisma model ↔ table mapping: **7 of 7 matched, no orphans in either direction.**
Enums: **6 of 6 matched.** `prisma validate` passes.

### Defaults verified

Every publication gate defaults safely:

- `published` = `false` on `toppers`, `result_records`, `student_stories`,
  `announcements`, `batches` — all five.
- `displayNameMode` = `'INITIALS'` on all three student tables — the most
  private option, as the policy requires.
- `consentRef` and `consentScope` are nullable with no default, so a record
  cannot accidentally acquire a consent reference.

---

### Finding 1 — `migration_lock.toml` was missing · **FIXED**

Prisma's migrations directory requires `migration_lock.toml` declaring the
provider. `prisma migrate dev` creates it; **`prisma migrate diff` does not**,
and this migration was generated offline with `diff`. Without it, the deploy
workflow has no provider guard.

Added `prisma/migrations/migration_lock.toml` with `provider = "postgresql"`.
This is a required part of the documented workflow, not a preference.

### Finding 2 — CHECK constraint count was wrong · **CORRECTED**

The Phase 4 report claimed **26**. The real figure is **25**. The original
count matched `ADD CONSTRAINT`, which also matched the single FOREIGN KEY.
`docs/PHASE-4-REPORT.md` now carries the corrected figure and a note.

### Finding 3 — NULL semantics make one constraint load-bearing · **BY DESIGN, DOCUMENTED**

A PostgreSQL CHECK passes when its expression evaluates to `NULL`; it only
rejects `FALSE`. Three constraints per student table can evaluate to `NULL`:

| Constraint | State that yields NULL |
| --- | --- |
| `*_photo_requires_photo_consent` | `published=true`, `photoUrl` set, `consentScope IS NULL` |
| `*_full_name_requires_consent` | `published=true`, `displayNameMode='FULL'`, `consentScope IS NULL` |
| `*_partial_name_requires_consent` | `published=true`, non-INITIALS mode, `consentScope IS NULL` |

Each of those states is independently rejected by
**`*_published_requires_consent`**, which cannot evaluate to `NULL` when
`published = true` because it tests `IS NOT NULL` directly.

**Consequence:** `*_published_requires_consent` is load-bearing for its whole
table. It must never be dropped or relaxed without replacing the NULL guard in
the other three. This is exactly the kind of property that must be *proved
against a live database*, which is why Part 2 exists.

### Finding 4 — Does a STORY grant authorise a photograph? · ⚠ **NEEDS A DECISION**

The database and the display layer disagree, and the policy document is silent.

| | Photo permitted when |
| --- | --- |
| `src/lib/student-display.ts` | `consentScope` is `RESULT_NAME_PHOTO` **or** `STORY` |
| `toppers` CHECK | `consentScope = 'RESULT_NAME_PHOTO'` only |
| `student_stories` CHECK | **no photo constraint at all** |

For **toppers** this is harmless: the database is stricter, so the `STORY`
branch is unreachable and the system fails safe.

For **student stories** it is not harmless. Publishing a story requires
`consentScope = 'STORY'`, and nothing then prevents `photoUrl` being published
alongside it. In effect, **authorising a story currently also authorises the
student's photograph.**

`docs/design/STUDENT-DATA-POLICY.md` lists the scope ladder as:

```
1 Result only · 2 + partial name · 3 + full name · 4 + photograph · 5 Story
```

Item 4 is described as "the fullest grant" and item 5 as "always separate" —
but the document never says whether a story includes a photograph.

**This is a product decision, not an engineering one, so nothing was changed.**
Two options:

- **(a) Conservative** — a story photo needs its own grant. Add a CHECK to
  `student_stories` mirroring the toppers rule, and drop `STORY` from the photo
  branch in `student-display.ts`. Stories publish without a photo unless the
  photo grant is also on file.
- **(b) Current behaviour** — the story consent form explicitly covers the
  photograph, and the policy document is amended to say so.

**Recommendation: (a)**, consistent with conservative-by-default. It costs one
constraint and one line of code, and (b) can be adopted later without a
migration if the consent form turns out to cover it.

### Finding 5 — `updatedAt` has no database default · **ACCEPTED**

`updatedAt` is `NOT NULL` with no `DEFAULT` on all six tables that have it.
Prisma's `@updatedAt` supplies it on create and update, so application writes
are fine. **A raw SQL `INSERT` that omits it will fail** — which is defensive,
not a defect, but matters for any future data-fix script and for the staging
tests in Part 2.

### Finding 6 — `CREATE SCHEMA IF NOT EXISTS "public"` · **LOW RISK, WATCH ON DEPLOY**

The first statement of the migration. On managed Postgres (Neon, Supabase,
RDS) the `public` schema already exists, so `IF NOT EXISTS` short-circuits and
no `CREATE` privilege is exercised. Should be harmless — but it is the first
statement that runs, so if the migration fails immediately on a managed
provider, this is the line to look at.

### Finding 7 — no missing indexes · **PASS**

Every query in the Phase 4 code has a supporting index:

| Query | Index |
| --- | --- |
| `checkSustained` — count by `ipHash` + `createdAt` | `enquiries_ipHash_createdAt_idx` |
| duplicate suppression — `phone` + `createdAt` (then filter `classLevel`) | `enquiries_phone_createdAt_idx` |
| admin list (Phase 5) — `status` + `createdAt` | `enquiries_status_createdAt_idx` |
| published toppers/results by year | `*_published_year_idx` |
| active announcement lookup | `announcements_published_startsAt_endsAt_idx` |
| next batch for a course | `batches_courseSlug_published_startsAt_idx` |

### Finding 8 — `EnquiryStatus.SPAM` is currently unused · **INTENTIONAL**

The pipeline never writes `SPAM` — honeypot and forged-token submissions are
discarded without persisting anything. The value is reserved for manual triage
in the Phase 5 admin. Noted so it is not mistaken for dead code.

### Finding 9 — test fixtures reused a fabricated topper's name · **FIXED**

The Phase 4 unit tests and two doc comments used **"Priya Gupta"** as sample
data. That is one of the five *invented* topper names the old Lovable site
published as though it were a real student (Master Plan §00).

Nothing was ever written to a database, so this was repository hygiene rather
than a data leak. But a realistic Indian name sitting in fixtures — one that
already appeared publicly attached to a fake 97.6% result — is precisely what
this project exists to stop, and it is one careless copy-paste from looking
like a record.

All fixtures now use unmistakably synthetic values: `Sample Testcase`,
`ZZ-TEST-CONSENT-001`, `/photos/zz-test.jpg`. A note in
`tests/student-display.test.ts` states the convention so it is not undone.
`prisma/schema.prisma` and `src/lib/student-display.ts` doc comments were
updated to match. All 38 tests still pass.

The names remain in `docs/`, where they are correctly described *as*
fabrications from the old site.

### Not changed

`batches` has no validity-window constraint because the model has no `endsAt` —
a batch has a start date only. A batch that has already started is legitimately
still published (it is running); course pages filter by `startsAt` when looking
for the *next* batch. Adding a constraint here would reject valid rows.

---

## Part 2 — Live migration & constraint tests

⛔ **NOT RUN.** Requires `DATABASE_URL`. See the checklist below.

Once a database exists, Part 2 will:

1. `prisma migrate deploy`, then `prisma migrate status`.
2. Verify all 7 tables, 6 enums, 12 indexes, 1 FK and 25 CHECK constraints
   exist in `information_schema` / `pg_constraint`, with nothing unexpected.
3. Confirm schema ↔ database sync via `prisma migrate diff --exit-code`.
4. Attempt to insert each **illegal** consent state and confirm PostgreSQL
   rejects it — in particular the NULL-leak states in Finding 3.
5. Confirm each **legal** state is accepted, so no constraint blocks
   legitimate use.
6. Exercise `Announcement` window and `SubjectScore` cascade delete.
7. Re-run the enquiry pipeline over HTTP against real PostgreSQL: persistence,
   duplicate suppression, DB-backed rate limiting, and safe failure.
8. Delete all staging rows and verify the tables are empty.

Staging rows will use obviously synthetic values (`ZZ-TEST-*`) so nothing can
ever be mistaken for a real student.

---

## What I need from you

The database is the only blocker. Steps you must do manually — **do not paste
any secret into chat.**

### 1. Create the database

Any PostgreSQL 14+ will do. Neon's free tier is the least effort:

1. Sign in at <https://neon.tech> and create a project (region: choose one near
   Jaipur — Singapore or Mumbai).
2. Name the database something like `commerce_insight_staging`.
3. Copy the connection string it shows you. It looks like:
   `postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require`

A local PostgreSQL works equally well if you prefer.

### 2. Put the connection string in the right place

Create `.env.local` in the project root — **this file is git-ignored and must
stay that way**:

```
DATABASE_URL="postgresql://...paste yours here...?sslmode=require"
ENQUIRY_SECRET="...generate with: openssl rand -base64 32..."
```

`ENQUIRY_SECRET` is needed too — the enquiry endpoint refuses to start in
production without it, and Part 2 tests that endpoint.

### 3. What must stay true

| Rule | Why |
| --- | --- |
| `.env.local` is **never** committed | It holds live credentials |
| `.env.example` keeps **empty** values only | It documents the shape, not the secret |
| No connection string in any source file, comment, doc or commit message | Same |
| Use a **staging** database, not one holding anything real | Part 2 writes and deletes test rows |

### 4. Tell me it is ready

Just say **"database is ready"**. Do not paste the URL.

I will read it from `.env.local` myself, and I will only ever print its
**host and database name** — never the user, password or full string.

If you would rather I verify against a throwaway local database instead, say so
and I will adapt.
