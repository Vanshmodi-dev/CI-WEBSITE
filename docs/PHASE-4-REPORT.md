# Phase 4 — Data layer, enquiry system, contact & admissions

**Date:** 21 August 2026
**Scope (as approved):** Prisma + PostgreSQL → enquiry system → student-data schema with consent controls → `/contact` → `/admissions`. **Course pages deliberately not built.**

---

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ clean (`strict`, `noUncheckedIndexedAccess`) |
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npm test` | ✅ **38 passing**, 10 suites, 0 failing |
| `npm run build` | ✅ 6 routes |
| `npm audit` | ✅ **0 vulnerabilities** |
| Secret-leak scan | ✅ 704 KB of client payload scanned, nothing found |

## Enquiry request flow

```
Browser (form, no JS required)
   │
   ▼ POST — React Server Action
1. Honeypot check ............ filled?  → silent success, nothing stored
2. Signed token check ........ forged?  → silent success
   │                           too fast? → "press submit once more"
   │                           expired?  → "reload and try again"
3. Burst rate limit .......... in-memory, 3/60s, BEFORE any DB work
4. Server-side validation .... hand-written, pure, 20 unit tests
5. Database configured? ...... no → "unavailable" + server-side log
6. Sustained rate limit ...... DB-backed, 3/15min and 10/day per ipHash
7. Duplicate suppression ..... same phone + level within 10 min → success
8. Persist ................... Prisma, server-only
9. Notify .................... best-effort, cannot fail the request
```

The browser never reaches the database. `src/lib/db.ts` imports `server-only`,
so importing it from client code is a **build error**, not a runtime leak.

## Behaviour verified against a running production server

Real HTTP submissions replaying React's own no-JS form fields:

| Case | Outcome |
| --- | --- |
| Valid submission, no `DATABASE_URL` | `unavailable` — degrades safely, no crash |
| Honeypot filled | silent `success`, nothing stored |
| Forged token signature | silent `success`, nothing stored |
| Submitted in under 2.5s | "press submit once more" |
| Consent withheld | field error |
| Invalid phone / missing name / bogus enum / oversized message | correct field error each |
| 4th and 5th submission within 60s | `rate-limited` — limiter engages exactly at threshold |
| Production start without `ENQUIRY_SECRET` | HTTP 500, secret name absent from the page, detail only in the server log |

## Two bugs found by running it

**1. `initialEnquiryState` exported from a `'use server'` module.**
Such modules may only export async functions; Next stripped the object, so
`state` was `undefined` and the form crashed on first render. Values moved to
`src/app/admissions/form-state.ts`. Type-checking did not catch this — only
loading the page did.

**2. A fast legitimate submitter lost their enquiry silently.**
`too-fast` originally returned a fake success, same as the honeypot. But
autofill can beat a 2.5s threshold, and silently discarding a real lead is the
worst possible outcome for the institute. It now asks the person to submit
once more: a human will, most bots will not, and the retry is naturally past
the threshold. Forged signatures still fail silently, because no real browser
can produce one.

## Database

**Migration status: authored and generated, NOT applied.** There is no
PostgreSQL instance, no Docker and no `DATABASE_URL` on this machine, so
`prisma migrate deploy` has not been run anywhere.

- `prisma/migrations/20260821000000_init/migration.sql` — 309 lines, generated
  offline with `prisma migrate diff`, then extended by hand.

> **Correction (Phase 4.5, 21 Aug 2026):** this report originally said *26*
> CHECK constraints. The real figure is **25** — the original count matched
> `ADD CONSTRAINT`, which also matched the one FOREIGN KEY. Corrected here and
> in the summary below.
- Schema validates; the Prisma client generates.
- **The migration has never been executed against a real database.** It must be
  applied to a staging database and the constraints exercised before launch.

### 25 CHECK constraints enforce consent at the database level

Prisma cannot express CHECK constraints, so they were written by hand. This
matters: application logic can be bypassed by a direct query, a data-fix
script, or a future admin bug. These cannot.

- A published topper/result/story **must** have `consentRef` and `consentScope`.
- A photograph may only be published under `RESULT_NAME_PHOTO`.
- A full name may only be shown under `RESULT_FULL_NAME` or `RESULT_NAME_PHOTO`.
- `published = true` requires `publishedAt`.
- A story requires an explicit `STORY` grant — nothing else authorises one.
- Percentages cannot exceed 100; years must be 2000–2100.
- `ipHash` must match `^[0-9a-f]{64}$`, so a raw IP address fails loudly.

`src/lib/student-display.ts` is the single place that decides what is rendered,
with 10 tests covering every downgrade path. **No component reads
`studentName` directly.**

**No student records were inserted.** Not one row of sample or placeholder data
exists that could be mistaken for a real student.

## Privacy

- **The raw IP is never stored.** `ipHash` is a keyed HMAC-SHA256 — an unkeyed
  hash of an IP is trivially reversible and would not be pseudonymisation.
- **Personal data never reaches a log.** `src/lib/log.ts` logs field *names*,
  not values, and carries a redaction net that strips `name`, `phone`,
  `email`, `message`, `consentRef` and similar at any nesting depth.
- **Prisma query logging is off in production** — query logs include bound
  parameters, which here would mean names and phone numbers.
- Production errors return a generic message plus a random reference; the
  detail stays server-side.

## Notification — not wired, and honestly blocked

Two facts are missing and cannot be invented: Commerce Insight has **no
professional email address**, and there is **no sending domain**, so no
SPF/DKIM. Mail from an unauthenticated domain lands in spam, which loses leads
silently.

`src/lib/notify.ts` is the seam. The enquiry is **persisted before** it is
called, so a missing notifier can never lose a lead.

## Dependencies added

| Package | Why |
| --- | --- |
| `prisma` (dev), `@prisma/client` | The approved ORM |
| `@prisma/adapter-pg` | Prisma 7 requires a driver adapter; it bundles `pg` |
| `server-only` | Makes a client import of DB code a build error |

**No validation library, no rate-limit library, no test framework.** Validation
is hand-written and unit-tested; rate limiting uses a Map plus a Prisma count;
tests use Node's built-in runner.

**A `deepmerge-ts` advisory** (3 high, via the Prisma CLI) was resolved with an
npm `override` to `^8.0.2` rather than downgrading Prisma. Audit is back to 0.

## Still blocked on client input

| Item | Blocks |
| --- | --- |
| PostgreSQL instance / `DATABASE_URL` | Applying the migration; storing any enquiry |
| Professional email + sending domain | Enquiry notifications |
| Confirmed NAP and opening hours | Contact page hours; `LocalBusiness` schema |
| Place ID / coordinates | Map and directions |
| Admission process steps, fees | The admissions page states none of these |
| Consent form and process | Any topper, result or story publication |
| Course syllabus, batches, fees | Course pages (correctly not built) |
| Transparent / vector logo | Logo on navy and dark grounds |

Nothing on this list was guessed at or filled in with a placeholder.
