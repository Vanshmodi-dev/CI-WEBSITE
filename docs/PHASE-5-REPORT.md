# Phase 5 — Admin panel

**Date:** 23 August 2026
**Baseline:** `fc174f9` (Phase 4.5)
**Built:** 5A authentication · 5B shell · 5C enquiries · 5D batches + announcements · 5E students & results · 5G stories
**Not built:** 5F courses · 5H site settings — reasoned below

---

## 1. What was built

A small admin panel for one teacher. Six sections, no jargon, and a publishing
model that makes it structurally difficult to over-share a student.

The organising idea: **powerful underneath, plain on the surface.** The database
enforces consent with 28 CHECK constraints; the teacher sees four tick boxes and
a sentence telling them what is missing.

## 2. Information architecture

Six flat navigation items. Grouping them into sections was considered and
rejected — a hierarchy of three groups of two is slower to scan than a flat six,
for one person managing one small site.

```
Dashboard            what needs attention today
Enquiries            leads, with status and private notes
Students & Results   results, permissions, publishing
Batches              when the next batch starts
Announcements        time-boxed notices
Student Stories      longer write-ups, separate permission
```

## 3. Screens created

| Route | Purpose |
| --- | --- |
| `/admin/login` | Sign in |
| `/admin` | Dashboard — 4 figures, recent enquiries, upcoming batches, 4 quick actions |
| `/admin/enquiries` | Filterable list, search by name or phone |
| `/admin/enquiries/[id]` | Lead detail, status, private notes, call/WhatsApp |
| `/admin/students` | Results list, filter by course and publication state |
| `/admin/students/new`, `/[id]` | Add/edit with permissions, live preview, publish gate |
| `/admin/batches` + `new` / `[id]` | Batch list and form with a date picker |
| `/admin/announcements` + `new` / `[id]` | Notices with a required expiry window |
| `/admin/stories` + `new` / `[id]` | Student stories, separate story permission |
| `/admin/logout` | POST-only sign-out |

17 admin routes, all server-rendered on demand.

### Language

Every label is written for a teacher, not a developer:

| Not this | This |
| --- | --- |
| Update publication state | Show this result on the website |
| `published = false` | Draft |
| Consent scope enum | What may we show? — Result / Name / Photograph |
| PrismaClientKnownRequestError | We could not save this right now. Please try again. |
| Constraint violation | Tick "Photograph", or remove the photo. |

## 4. Authentication

- **scrypt** password hashing via `node:crypto` (N=2^17, r=8, p=1, 16-byte random
  salt, 64-byte key). Parameters travel with the hash so they can be raised later
  without invalidating passwords. **No native dependency** — argon2 and bcrypt
  both need a build step for one seeded account.
- **HMAC-SHA256 signed session cookie**, HttpOnly, SameSite=Lax, Secure in
  production, 8-hour expiry. The signature is verified **before** the expiry, so
  probing with an unsigned token reveals nothing about session lifetimes.
- **No self-registration, no password reset.** The account is created by someone
  with server access via `npm run create-admin`, which reads the password from a
  hidden prompt — never from `argv`, which would land in shell history.
- **Sign-in failures are indistinguishable.** An unknown email and a wrong
  password take the same path, run the same scrypt verification against a dummy
  hash, and return the same message. No account enumeration.
- **Sign-in is rate limited** by hashed IP, reusing the enquiry burst limiter.
  An unthrottled sign-in endpoint is a password-guessing oracle.
- Failed sign-ins log *that* one happened, never the email attempted — a log
  full of addresses is a credential-stuffing list waiting to leak.

## 5. Authorisation

**Three independent layers. The middleware is deliberately the weakest.**

| Layer | What it does | Is it the boundary? |
| --- | --- | --- |
| `src/middleware.ts` | Checks a cookie is *present* | **No** — it runs on Edge, cannot verify the HMAC, and anyone can set a cookie |
| `requireAdmin()` in every page | Verifies signature, re-reads the account | Yes |
| `requireAdminOrNull()` in every action | Same, independently | **Yes — this is the one that matters** |

The action check is not redundant. A Server Action is an HTTP endpoint: it can
be POSTed directly without a page ever rendering, so a page-level guard alone
would be decorative.

The account is re-read from the database on every request rather than trusted
from the cookie, so deactivating an account takes effect immediately instead of
at the end of an eight-hour session.

## 6. Database changes

**Two new models:** `AdminUser` (one seeded account, no role column yet) and
`AuditLog` (who did what, when — action and entity id, never personal data).

**The consent model was replaced.** This is the significant change, and your
instructions decided it:

> "A story must NOT automatically grant permission to publish a photograph."

The old `ConsentScope` enum was an **ordered ladder**, which cannot express
that — an ordered scale forces every higher grant to imply every lower one. It
is now four independent booleans:

```
consentResult   may we publish the score at all?
consentName     may we show a name rather than initials?
consentPhoto    may we show a photograph?      ← never implied by anything else
consentStory    may we publish a written story?
```

Two things this fixed beyond the stated requirement:

1. **Phase 4.5 Finding 4 is resolved.** Publishing a story no longer implicitly
   authorises a photograph.
2. **Phase 4.5 Finding 3 is resolved.** The old constraints could evaluate to
   `NULL` when `consentScope` was null, and a PostgreSQL CHECK *passes* on NULL.
   Every consent column is now `BOOLEAN NOT NULL DEFAULT false`, so that entire
   class of hole is closed by the column type rather than by a second constraint
   covering for the first.

**The `init` migration was regenerated, not stacked.** It has never been applied
to any database anywhere, so amending it is safe and leaves a clean history.
Now: **9 tables, 28 CHECK constraints, 2 foreign keys.**

## 7. Consent implementation

Four layers, each independent of the others:

1. **Database.** A published record must have `consentRef` and the permission
   for its kind. A photo requires `consentPhoto`. A non-initials name requires
   `consentName`. A story requires `consentStory`.
2. **The mutation.** `saveStudentResult` and `saveStory` compute the blockers
   before writing and refuse early. The teacher never meets a constraint error,
   because a constraint error is an unexplained failure.
3. **The form.** The publish checkbox is **disabled** until the permissions
   allow it, with the missing ones listed as instructions.
4. **Rendering.** `src/lib/student-display.ts` is the only place that decides
   what is shown. No component reads `studentName` directly.

The form also shows a **live preview** of what a visitor would see — a monogram
tile when no name is permitted, "No photo shown" when no photo is permitted —
so the teacher checks before publishing rather than after.

## 8. Demo data

**None was created.** No seed script, no fixtures, no sample rows.

There is no database to seed, and seeding realistic-looking students is the
exact failure this rebuild exists to correct. Every empty list has a written
empty state instead, so the panel is comprehensible with zero rows.

Unit-test fixtures use `Sample Testcase` / `ZZ-TEST-CONSENT-001`, and a note in
the test file states the convention.

## 9. Security controls

- No secrets in client payload — **696 KB scanned**, including the secret
  *values*, the variable names, `DATABASE_URL`, `PrismaClient`, `scrypt`,
  `passwordHash` and the session cookie name. All clean.
- `src/lib/auth.ts`, `db.ts`, `crypto.ts`, `admin-data.ts` all import
  `server-only` — a client import is a build error, not a runtime leak.
- Admin is invisible from the public site: no link in the public nav, absent
  from `sitemap.xml`, `noindex, nofollow, nocache` on every admin page.
- Sign-out is **POST-only**. A GET would let any page log the admin out with an
  `<img>` tag, and would fire on link prefetch. Verified: GET returns 405.
- `ipHash` is never selected in any admin query. There is nothing a teacher can
  do with an HMAC digest.
- Announcement links are restricted to on-site paths — an external URL in a
  site-wide banner is an open redirect waiting to happen.
- Enquiry messages render as text. React escapes by default and
  `dangerouslySetInnerHTML` never touches visitor input.
- Audit entries record the action and entity id, never the student's name or
  marks. Enquiry notes are never logged.
- Production errors return a generic message; detail stays server-side.

## 10–14. Verification

| Check | Result |
| --- | --- |
| Tests | ✅ **67 passing**, 13 suites, 0 failing (was 38 at Phase 4) |
| Typecheck | ✅ clean |
| Lint | ✅ 0 errors, 0 warnings |
| Build | ✅ 24 routes incl. 17 admin + middleware |
| Audit | ✅ 0 vulnerabilities |
| Prisma validate | ✅ passes |

**29 new tests** — 15 for authentication (scrypt round-trip, salt randomness,
forged sessions, tampered expiry, swapped admin id, signature-before-expiry) and
14 rewritten for the consent model, including the rule that motivated it:

> *"a story grant does NOT authorise a photograph"*

### Live security testing against a production server

| Attempt | Result |
| --- | --- |
| GET `/admin`, `/admin/students`, `/admin/batches`, +4 more, no session | **307 → /admin/login** (all 7) |
| GET with a **forged** session cookie | **307 → /admin/login** |
| GET with a garbage cookie | **307** |
| POST to 4 admin mutation endpoints, no cookie | **307** — no mutation reachable |
| POST to the same 4 with a forged cookie | **307** — middleware passes it, `requireAdminOrNull` stops it |
| GET `/admin/logout` | **405** — POST only |
| Secret scan, 696 KB of client payload | **clean** |
| Server log inspection | no secrets, no stack traces |

## 15. Known limitations

- **Nothing has run against a real database.** Every admin page and mutation is
  untested against PostgreSQL. The pages were verified to fail *closed* without
  a database, which is the right failure but not the same as working.
- **Authentication is hand-rolled.** Justified by scope — one seeded account, no
  registration, no reset, no OAuth — and the primitives are unit-tested. If the
  role model ever grows beyond one admin, revisit.
- **Middleware cannot verify the session.** Documented in the file itself.
- **Photos are entered as a path**, not uploaded. An upload pipeline needs
  storage, MIME validation and re-encoding; it was out of scope and no photos
  exist yet.
- **`SubjectScore` has no admin UI.** The model exists; per-subject marks were
  not worth a nested form before any real results exist.
- **No pagination.** Lists cap at 200–300 rows. Fine for years; revisit later.

## 16. What was NOT built, and why

**5F — Courses.** Courses live in `src/config/institute.ts`, which drives route
slugs, the navigation dropdown and the sitemap. A database-backed course editor
would fork that source of truth and let the owner create a course with no page
behind it — a 404 in the worst possible place. Course *pages* are also still
blocked on syllabus, batch and fee information that the institute has not
supplied. **Unblocks when:** course content arrives and the course pages exist.
Batches already reference courses by name, so the teacher can schedule against
them today.

**5H — Site Settings.** `institute.ts` is the single source of truth that makes
NAP consistency *structural* — the footer, contact page and schema.org output
cannot drift because there is one copy. Making it editable removes that
guarantee. Most of it is also still unconfirmed: no professional email, no
opening hours, no Place ID. Editing unverified data is not a feature.
**Unblocks when:** the institute confirms its details in writing.

Both were judged against your instruction: *if choosing between more features
and a simpler experience, choose simpler.*

## 17. Commit

See the git log entry for Phase 5; hash reported alongside this document.

---

## Verified vs not verified

**Verified:** authentication primitives (67 unit tests), authorisation on all
17 routes and 4 mutation endpoints against a running production server, secret
containment across 696 KB of client payload, admin invisibility from the public
site, POST-only sign-out, build, typecheck, lint, audit, Prisma schema validity.

**Not verified:** anything requiring PostgreSQL — sign-in with a real account,
creating or publishing any record, the 28 CHECK constraints, audit logging,
duplicate handling, dashboard figures. The code paths exist and fail closed
without a database; they have never succeeded.

**Requires a real database:** `DATABASE_URL`, then `npm run db:migrate`, then
`npm run create-admin`. Until then the admin can be reached but not signed into.

**Requires real institute data:** course syllabus, fees, batch timings, opening
hours, professional email, Place ID, and the consent form process.

**Requires the owner's approval:** the wording of the four permissions and
whether the consent form the institute uses actually covers them separately.
The code assumes it does, because you instructed that it must.
