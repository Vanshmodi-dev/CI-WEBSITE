# Phase 12 — Import and data tooling

**Date:** 24 August 2026
**Baseline:** `cb29470` (Phase 11)

---

## 1. Objective

Give the institute a safe way to move a spreadsheet of results into this system,
and a way to take their data back out — without any of it being able to bypass
the consent model, the authorisation model, or the publication rules that the
last eleven phases built.

**The governing decision of this phase: an import can create and correct
records, but it can never put one on the website and can never take one off.**
There is no publish column in the template. A spreadsheet cell is not a decision
about a child's photograph.

Five defects were found and fixed, two of them in code this phase wrote and
three of them pre-existing. One was serious enough that shipping it would have
removed the last line of defence for the consent model.

---

## 2. Format decision: CSV only

The brief asked for CSV and, if it could be done safely, XLSX. **This supports
CSV only, and that is a decision rather than an omission.**

CSV is a grammar you can hold in your head. RFC 4180 is a page long, and
`src/lib/csv.ts` implements all of it in about 120 lines that are unit-tested
and that nobody can update out from under us.

XLSX is a ZIP archive of XML documents. Parsing it safely means owning a ZIP
reader (decompression bombs), an XML parser (entity expansion, external
entities), a shared-string table (unbounded allocation) and a formula grammar.
Every one of those is a category of vulnerability, and none is a category this
project can audit. The candidate library, SheetJS, no longer publishes its free
build to npm and has a history of prototype-pollution and ReDoS advisories — and
it would run inside the admin panel that holds every student's marks.

**What the teacher loses is one menu click.** Excel, LibreOffice, Google Sheets
and Numbers all export CSV from File → Save As. The upload gate names that
specifically when it sees an `.xlsx`:

> "This system reads CSV files. In your spreadsheet choose File, then Save As,
> then CSV, and upload that."

**No dependency was added in this phase.**

---

## 3. Schema changes

### `ResultRecord` removed — proven dead first

Phase 11 flagged it. Before deleting anything, every reference was found:

| Location | Reference | Kind |
| --- | --- | --- |
| `src/lib/admin-data.ts` | `SELECT count(*) FROM result_records WHERE published` | read, always 0 |
| `scripts/scale-check.mjs`, `synthetic-scale.mjs`, `verify-constraints.mjs` | row counts | read |
| Docs | prose | — |

**No code path anywhere writes a `ResultRecord`** — no create, update, upsert or
delete, in `src/`, `scripts/` or `tests/`. It was a parallel data path with seven
CHECK constraints that had never protected a row, and exactly the kind of thing
an importer could be pointed at by mistake. Removed.

### `Topper.importRef` added — the import key

A spreadsheet import must know whether a row is new or a correction, and there
is no safe way to answer that from the data. Names are not unique — Phase 8
found two students sharing a name and a year colliding on a story slug — and
matching on name + programme + year turns a corrected spelling into a duplicate
student.

So **the teacher owns the identity**: their own roll or enrolment number, unique,
nullable (records typed by hand in the admin have no spreadsheet row to point
at). Reuse a reference and that row is corrected; use a new one and a record is
added.

### `ImportRun` added — history without the file

Metadata only: who, when, filename, plan digest, counts, duration. **The
spreadsheet itself is never stored.** Keeping it would mean keeping a second
copy of every student's marks outside the consent model and outside the
retention policy, to answer a question the counts already answer.

### Migrations consolidated into one

The database has never been deployed, so per the brief the two prior migrations
were regenerated as a single `init` rather than carrying a `DROP TABLE` for a
table that never held a row. **That went badly, and §7 records what happened.**

---

## 4. Import architecture

```
UPLOAD      multipart, bounded, filename never used as a path
  ->  PARSE       RFC 4180, bounded as it goes
  ->  NORMALISE   trim, collapse whitespace, strip control characters
  ->  VALIDATE    every row, every rule, all problems collected
  ->  DEDUPLICATE within the file, and against existing records by reference
  ->  CONSENT     combinations the database would refuse, caught in words
  ->  PLAN        an in-memory description of what WOULD happen
  ->  PREVIEW     what a visitor would see, from the website's own rules
  ->  [ the teacher reads this and decides ]
  ->  CONFIRM     same file re-uploaded, plan re-computed, digest must match
  ->  WRITE       one transaction
  ->  REVALIDATE  +  AUDIT  +  HISTORY
```

Each stage is a separate module and each is independently testable. **Parsing
and writing never meet**: `src/lib/import/plan.ts` is pure and has no database
access at all; `src/lib/import/run.ts` is the only file that writes.

### The digest, and why nothing is stored between the two clicks

Checking and importing are two requests. Nothing survives between them — the
uploaded file is parsed and dropped. So the confirm step **re-uploads and
re-plans from scratch**, and the digest the teacher reviewed is submitted
alongside. If the two differ, the import is refused and the new plan is shown
instead.

That closes the gap where a teacher reviews one file and the confirm carries
another, **and** it means no uploaded spreadsheet ever sits on a server waiting
for a second click. Verified: approving one file and submitting a different one
imports nothing.

---

## 5. The template

Fifteen columns, downloadable from the admin, documented on screen and in
`src/lib/import/columns.ts`. Every column carries its meaning, whether it is
required, what values are accepted, an unmistakably synthetic example, and
whether it affects what a visitor could see.

| Column | Required | Affects visibility |
| --- | :-: | :-: |
| Reference | ✅ | |
| Student Name | ✅ | ✅ |
| Programme | ✅ | |
| Board | | |
| Year | ✅ | |
| Score · Score Is | ✅ / — | |
| Highlight | | ✅ |
| Subjects | | ✅ |
| Consent Form Reference | | ✅ |
| Permission: Show Result / Name / Photograph | | ✅ |
| Name Shown As | | ✅ |
| Photograph File | | ✅ |

**There is no publish column**, and a unit test fails if one is ever added.

### Ambiguity is an error, never a guess

`Commerce` is not an accepted programme value. It could mean Class 11 or Class
12, and a guess would file a student under the wrong year of their life. The
message says so:

> "Commerce" is not one of the courses in the template.
> → Class 11 Commerce, Class 12 Commerce, CA Foundation, CA Intermediate or CMA.
> "Commerce" on its own is not enough — say which class.

---

## 6. Consent guarantees

The single most important property: **an import cannot create a state the
consent model forbids, and cannot publish anything.**

| Rule | How it is enforced | Verified |
| --- | --- | --- |
| Import never publishes | `published` is absent from the create payload (column default `false`) and from the update payload entirely | ✅ suite + unit |
| Import never unpublishes | Same — the update payload does not mention `published` or `publishedAt` | ✅ a live record survives a re-import |
| A name shown without name permission | Refused at plan time, in words | ✅ |
| A photograph without photo permission | Refused at plan time, in words | ✅ |
| Result or name permission implying photo permission | Impossible — four independent booleans, unchanged since Phase 5 | ✅ |
| Blank permission column | Means **No**, never Yes | ✅ |
| A value that is not Yes or No | Refused, not coerced | ✅ |
| Removing consent from a record that is live | Refused, with instructions to unpublish first | ✅ |
| Blanking the consent reference on a live record | Refused | ✅ |
| A remote or traversing photograph path | Refused by `isSafePhotoPath`, unchanged from Phase 5 | ✅ |
| Database CHECK constraints | Still the last line of defence; the whole transaction fails if reached | ✅ 35/35 |

**`wouldBecomePublic` is computed from the plan, not hard-coded to zero**, so it
is a measurement rather than a promise. It reads 0 on every file tested,
including one where every permission is granted.

---

## 7. Defects found and fixed

### 🔴 P12-A — regenerating the migration silently deleted all 28 CHECK constraints

**Mine, caught before it shipped, and the most dangerous thing in this phase.**

Prisma cannot express a CHECK constraint in `schema.prisma`, so it does not know
they exist. Regenerating the migration produced a schema that was "in sync",
with every model correct — and **no consent constraints at all**. `pg_constraint`
returned 0.

The loss was completely silent. Nothing failed, nothing warned. The last line of
defence for "a published record must have consent" had simply evaporated.

**Fixed**: the 21 surviving constraints (7 belonged to the deleted table) are
recovered from git history and appended to the consolidated migration under a
banner explaining that Prisma will not regenerate them. `tests/import.test.ts`
now asserts the named constraints exist in the migration SQL, and
`verify-constraints` (35/35) exercises them against a real database.

### 🔴 P12-B — one non-ASCII character silently aborted the last SQL statement

While fixing P12-A, a warning glyph in a SQL **comment** produced:

```
ERROR: character with byte sequence 0xe2 0x9a 0xa0 in encoding "UTF8"
       has no equivalent in encoding "WIN1252"   (SQLSTATE 22P05)
```

The statement it preceded was the audit-action constraint, and it simply did not
get created. The migration reported success; the constraint was absent.

**Fixed**: the migration is pure ASCII, says so in a banner, and a unit test
fails on any byte above 127. Comments in a migration are not decoration — they
are executed.

### 🟠 P12-C — every sign-out audit entry has been discarded since Phase 10

Pre-existing. Phase 10 added a `signed_out` audit action and never added it to
`audit_log_action_known`. `recordAudit` catches its own failures so an audit
write can never roll back the admin's actual work — so the entry was rejected by
the constraint and swallowed, for the whole of Phases 10 and 11.

**The Phase 10 report claims sign-out is audited. It was not.** Demonstrated:

```
action "signed_in" : ACCEPTED
action "signed_out": REJECTED - violates check constraint "audit_log_action_known"
```

**Fixed**, and the regression test is the one that generalises: it reads the
action union out of `src/lib/auth.ts` and asserts every member appears in the
constraint. The next action cannot drift the same way.

### 🟠 P12-D — the import rate limit would have blocked the teacher on their fourth check

The import borrowed the enquiry burst limit — three per minute — because it was
there. That number was chosen for anonymous strangers posting a contact form.

The real workflow is check → fix a typo → check again, five or six times on a
first import. Phase 12's own suite hit the wall on the fourth check, which is
roughly where a teacher would have hit it.

**A limit that stops the person it exists to serve is not a security control; it
is a bug with a justification attached.** Fixed with a window sized for this
workflow: **20 uploads per 5 minutes**, per administrator, which still bounds a
loop of 2 MB uploads to something that costs the sender time.

### 🟠 P12-E — a 1.5 MB upload answered 500 instead of a sentence

Next caps a Server Action body at 1 MB by default. Our own check allowed 2 MB.
**Whichever limit is lower is the one the teacher meets**, and the framework's
produces a stack trace where ours produces "that file is larger than 2 MB, split
it into smaller files".

**Fixed**: `serverActions.bodySizeLimit` raised to 3 MB, deliberately above our
2 MB, so our message is always the one that appears. Both files now carry a
comment naming the other.

### 🟠 P12-F — the teacher's own download link would have 403'd

The download route used `rejectCrossOrigin`, which fails closed when `Origin` is
absent. **Browsers send no `Origin` on a same-origin GET navigation** — which is
exactly what clicking a download link is.

**Fixed** with `rejectForeignOrigin`, a read-only variant: a foreign `Origin` or
`Referer` is still refused, an absent one is allowed. Sound for a GET that
changes nothing — a cross-origin page cannot read the response (CORS blocks the
read, `frame-ancestors 'none'` blocks framing, `Content-Disposition: attachment`
means there is nothing to render), so the worst it can cause is a download the
attacker never sees.

### 🟡 P12-G — two Phase 12 source files were binary as far as git was concerned

Mine, caught at commit time. `src/lib/csv.ts` and `src/lib/import/run.ts`
contained **literal** control bytes inside string literals — a raw NUL in the
binary-file check, and raw 0x00/0x1F/0x7F inside the filename-sanitising regex:

```
src/lib/csv.ts:229          if (text.includes('<00>')) {
src/lib/import/run.ts:26    const CONTROL_CHARACTERS = new RegExp('[<00>-<1F><7F>]', 'g');
```

Both worked. That is precisely the problem: `git diff --stat` reported
`Bin 0 -> 11465 bytes`, so **neither file would ever have shown a diff again**,
and the run.ts comment two lines above claimed the opposite — "built from
escapes rather than typed as literals, ... an invisible byte in source is a byte
nobody can review."

**Fixed** by writing them as `' '` and `'[ -]'`.
Behaviour is identical — verified directly, then by re-running the suites below.

### Test-harness findings (not application defects)

1. **Replaying a file input's empty value shadowed the real file part**, so
   every action reported "choose a CSV file first". Looked exactly like a broken
   importer for a while.
2. **The CSV-injection fixture did not start with `=`.** The name read
   `ZZTEST =HYPERLINK(...)`, which begins with a letter and is therefore not a
   formula at all — the assertion was testing nothing. Now it begins with `=`.
3. **A stale server from the previous run held the port**, so the first
   re-verification of the P12-G fix passed 116/116 against a build that did not
   contain it. `next start` had already failed with `EADDRINUSE` and the suite
   never noticed. The port was cleared and the suite re-run against the correct
   build — a passing suite proves nothing about code the server never loaded.

---

## 8. File and upload security

| Control | Value | Enforced |
| --- | --- | --- |
| Maximum upload | 2 MB (framework allows 3 MB, so ours answers first) | before decoding |
| Maximum rows | 5,000 | during parsing |
| Maximum columns | 64 | during parsing |
| Maximum cell length | 8,000 chars | during parsing |
| Maximum cells | 100,000 | during parsing |
| Extensions looked at | `.csv`, `.txt` | before reading |
| Filename | Sanitised, never used as a path, never opened | on the way in |
| NUL bytes | File refused as binary | during parsing |
| Temporary files | **None. Nothing is ever written to disk.** | by construction |
| Uploads retained | **None. Parsed in memory, dropped.** | by construction |

Bounds are enforced **as parsing proceeds**, not afterwards, so a hostile file
stops being read at the point it goes too far rather than after it has been
allocated.

Every limit is derived from the expected scale: a 1,000-row results file with
every column filled measures **155 KB**, so 2 MB is roughly thirteen times the
real thing.

**Verified against**: an oversized file, a NUL byte, an `.xlsx`, an `.exe`, a
traversal filename, an empty file, headers with no rows, and a 6,000-row file.
None produced a server error; none created a record.

---

## 9. CSV injection

A CSV cell is text. A spreadsheet decides otherwise: a cell beginning `=`, `+`,
`-`, `@`, tab or carriage return may be evaluated as a formula, and the payload
arrives from whatever a visitor typed into an enquiry form.

**Exports neutralise it**; imports do not touch values. Rewriting a name on the
way in because it starts with a hyphen would corrupt real data to solve an
export problem.

Verified with a student name that genuinely begins `=HYPERLINK("http://…")`:
the export contains `'=HYPERLINK…`, no cell begins with a bare `=` or `+`, and
re-parsing yields the value as inert text.

Downloads also carry `Content-Disposition` with an allowlisted, sanitised
filename, `no-store`, and `X-Content-Type-Options: nosniff`.

---

## 10. Duplicates and identity

| Outcome | How it is decided | Shown to the teacher |
| --- | --- | --- |
| **New** | The reference is not in the database | "New records" |
| **Correction** | The reference already exists | "Corrections" |
| **Duplicate in file** | The reference appears twice | Error naming the first line |
| **Rejected** | Any validation failure | Row, column, problem, what to do |

**Two students are never silently merged**, because identity is never inferred
from a name. A duplicate reference inside one file is an error that names the
line it clashes with:

> "ZZTEST-001" is already used on line 2 of this file.
> → Each row needs its own reference. Two rows cannot describe the same record.

---

## 11. Dry run and the visibility preview

The dry run **writes nothing** — verified by counting rows before and after.

It reports: rows checked, new records, corrections, rows needing attention, how
many records would become public (structurally 0), and how many corrections
touch a record that is currently live.

The preview answers, per record, what a visitor would see **and why**, using
`present()` and `blockersForPublishing()` — **the same functions the website
uses**. A second interpretation of consent is how two different answers to "is
this child's photograph public?" come to exist in one codebase.

Every reason is in the teacher's language, and a unit test fails if a database
word appears in one:

> Stored privately. Importing never puts a record on the website — publish it
> from Students when you are ready.
> Add the consent form reference you hold on file.
> Tick "Result" — permission to show this result publicly.

---

## 12. Errors

All problems are reported at once. A teacher with 53 problems in 1,000 rows gets
all 53 in one report; the alternative is fifty-three upload-and-fix cycles,
which is how people give up and start editing the database directly.

Every problem carries the **row number as the teacher's spreadsheet shows it**
(the header is line 1), the column heading, what is wrong, and what to do:

> Row 5 · Score · 140 is more than 100, but this row says the score is a
> percentage. → Either correct the score, or set "Score Is" to Marks.

A unit test asserts no message contains `prisma`, `constraint`, `enum`,
`varchar`, `violates`, a `P20xx` code, `null` or `undefined`.

---

## 13. Transactions

**The whole import is one interactive transaction: either every row lands or
none does.** There is no half-imported state to explain and no chunking that
leaves the teacher wondering which half worked.

`CHUNK = 200` bounds how many statements are pipelined *inside* that one
transaction. It is a memory bound, not a commit boundary — the transaction still
commits once, at the end. A failure rolls the whole thing back and says so:

> Nothing was imported — the whole file was rolled back.

---

## 14. Export

| Export | Contents |
| --- | --- |
| Student results | The import template's columns exactly, plus a read-only "On Website Now" |
| Student stories | Full text and the permissions recorded |
| Batches | All, past and upcoming |
| Announcements | All, including expired |
| Enquiries | Names, phones, messages, notes — **never `ipHash`** |

The results export round-trips: export → edit in Excel → import back, with
`Reference` carrying the identity so it corrects rather than duplicates.

Consent flags **are** exported, because they are administrative facts the
institute needs to check its own paperwork against, and withholding them would
make the round trip silently destroy them. Internal ids, `publishedAt` and
`ipHash` are **not**.

Every export is authenticated in the handler itself, refuses a foreign origin,
and is `no-store`. Row count is bounded at 20,000.

---

## 15. Retention

| Data | Kept |
| --- | --- |
| The uploaded spreadsheet | **Never stored.** Parsed in memory, discarded |
| Import history | Metadata only — counts, duration, filename, digest |
| Filename | Sanitised, for recognition only; nothing opens it |
| Audit entry | Actor, action, entity, id, and a count |

No row of a spreadsheet survives an import except as the records it created.

---

## 16. Performance at 1,000 rows

Measured against a production build and real PostgreSQL.

| Stage | Time |
| --- | ---: |
| File size | 155 KB |
| Parse | **10 ms** |
| Validate, deduplicate and plan | **35 ms** |
| Dry run over HTTP | **102 ms** |
| Import (1,000 records + 3,000 subject marks, one transaction) | **958 ms** |
| Dry run when every row is a correction | 93 ms |
| Re-import (1,000 updates) | 1,627 ms |
| Export 1,000 rows | 85 ms (159 KB) |
| `/admin/data` render | 54 ms |
| Heap after planning | 26 MB |
| **Records published by the import** | **0** |
| Records after re-importing the same file | **1,000** — no duplicates |

Nothing here needs optimising.

---

## 17. Regression

| Suite | Phase 11 | Now |
| --- | ---: | ---: |
| Unit | 134 | **183** (+49) |
| **Import / export** | — | **116** (new) |
| Security | 245 | 245 |
| SEO | 335 | 335 |
| Performance budget | 72 | 72 |
| End-to-end | 62 | 62 |
| Public isolation | 50 | 50 |
| Integration | 47 | 47 |
| Consent constraints | 35 | 35 |
| Revalidation | 9 | 9 |
| Real-browser QA | 249 | 249 |
| Teacher workflow | 105 | 105 |

**Distinct assertions: 1,508. Executions: 1,862** (the 354 browser assertions run
in both Chrome and Edge).

**Re-verified after the final change (P12-G):** unit **183/183**, import
**116/116**, security **245/245**, constraints **35/35** — every suite that
touches CSV parsing or filename handling, against a freshly built server. The
remaining suites were not re-run: the change is confined to two string literals
in the import path, and no SEO, budget, browser or public-isolation assertion
reaches that code.

Typecheck clean · lint 0/0 · build clean · `npm audit` **0 vulnerabilities** ·
**no dependency added**.

### Performance did not regress

Public JS **189.6 → 189.8 KB** (the admin nav gained one link), well inside the
200 KB tripwire. Fonts, CSS and total transfer unchanged. 72/72 budget checks.

**No import or export code reaches any public chunk** — verified by intersecting
the chunk lists for `parseCsv`, `neutraliseCell`, `buildPlan`, `importRef` and
the template headings against every chunk a public route loads.

---

## 18. Security

Every Phase 10 guarantee re-verified: **245/245**, unchanged.

Import-specific:

| Surface | Control | Verified |
| --- | --- | --- |
| Check action | `requireAdminOrNull` inside the action | ✅ 3 credential states, 0 rows written |
| Confirm action | Same, plus digest match | ✅ |
| Download route | `getCurrentAdmin()` in the handler; 404 to a stranger | ✅ |
| Cross-origin download | Refused (403) | ✅ |
| Unknown export kind | 404 from an allowlist | ✅ |
| Upload rate | 20 per 5 minutes per admin | ✅ |
| Public exposure | No imported record, consent reference or import key on any public surface or in the RSC payload | ✅ |

---

## 19. Limitations and residual risks

| Item | Impact | Owner |
| --- | --- | --- |
| **XLSX not supported** | The teacher must Save As → CSV | Accepted, documented, §2 |
| Files over 3 MB hit the framework limit, not ours | A 500 rather than a sentence, far outside the ~155 KB real files weigh | Accepted |
| Stories, batches and announcements are export-only | They are written one at a time in the admin | Accepted, §5 |
| Import history retained indefinitely | Metadata only, no personal data. `scripts/retention.mjs` does not prune it | Phase 13 if it matters |
| Per-instance upload limiter | On serverless, spread load evades it; the account-level bound still applies | Accepted |
| Publishing is still one record at a time | Deliberate. A teacher publishing 50 toppers makes 50 clicks | **By design** |
| `scripts/test-db.mjs stop` reports success without stopping a server started by `serve` | Local development only. `serve` holds the server as a child of a different process, so `stop` has no handle to stop and deletes the data directory out from under a live postmaster | Noted below |

---

## 20. What still needs a human

Nothing in this phase requires external infrastructure, and none was touched: no
Neon, no hosting, no domain, no credentials, no Search Console. The launch
switch is still `false`.

Before real data is imported, someone must decide **the reference scheme** — the
code that identifies a row. It must be stable, because it is what makes the
second import a correction. The admin explains this on screen; the institute
chooses it.

---

## 21. Database state

```
Topper 0 · SubjectScore 0 · StudentStory 0 · Batch 0 · Announcement 0
Enquiry 0 · ImportRun 0 · AdminUser 0 · AuditLog 0        TOTAL ROWS: 0
```

Every fixture was `ZZTEST` / `ZZQA` / `ZZSEC` / `ZZDEMO` / `ZZDBG` prefixed and
removed. No institute data was invented. Local PostgreSQL stopped, data
directory removed, `.env.local` deleted, nothing listening on port 55432.

Teardown surfaced the `test-db.mjs stop` defect above: it printed "PostgreSQL
stopped and data directory removed" while nine `postgres.exe` processes were
still running, because the server had been started by a separate `serve`
process and `stop` swallows the resulting error. The orphaned postmaster was
terminated by hand. **This is a local development script, not application code,
and it is deliberately being left for Phase 13** — it belongs with the
preflight tooling, and fixing it now would mean a second, unrelated change in
the Phase 12 commit.

---

## 22. Recommendation for Phase 13 — Deployment preparation

The application is now feature-complete for launch. Phase 13 should turn it into
something that can be deployed by following a document rather than by
remembering things.

Suggested scope: a single consolidated pre-flight checklist that fails loudly
when a prerequisite is missing (secrets present and long enough, `DATABASE_URL`
reachable, migrations applied, **the 21 CHECK constraints actually present** —
Phase 12 is why that one matters); the production environment matrix; a rehearsal
of `migrate deploy` against a fresh database; the launch-switch procedure written
as steps with verification after each; and a rollback plan.

The one thing worth building rather than documenting is a **`verify:preflight`
script** that can be run against any environment and answers "is this database
ready to hold student data?" — because the failure mode Phase 12 found, a schema
that looks correct with its constraints missing, is exactly the failure a
deployment checklist written in prose would not catch.

---

**PHASE 12 COMPLETE — PHASE 13 NOT STARTED.**
