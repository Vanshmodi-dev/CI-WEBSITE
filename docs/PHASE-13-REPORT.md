# Phase 13 — Deployment preparation

**Date:** 25 August 2026
**Baseline:** `a3f7632` (Phase 12)

---

## 1. Objective

Make the repository deployable by someone following a document, and build
tooling that can **prove** whether an environment is safe to deploy — rather
than a checklist that asserts it.

The governing lesson came from Phase 12. It shipped a database that
`prisma validate` called correct, that `prisma migrate status` called up to
date, and that had **lost all 28 CHECK constraints** — the entire consent model,
unenforced, with nothing anywhere reporting a problem. A deployment checklist
written in prose would not have caught that. Nothing would have, except asking
the database by name whether the rule that stops a child's photograph being
published without permission is actually there.

So Phase 13's central deliverable asks. **67 checks, measured against the
repository, the environment and a live PostgreSQL — never against a document.**

Three defects were found. One of them would have told Google that the
institute's website lives on `localhost`.

**The project remains PRE-LAUNCH. The launch switch is off, no infrastructure
was provisioned, no credentials were created, and every content table holds
zero rows.**

---

## 2. What was built

| Deliverable | What it is |
| --- | --- |
| `src/lib/deployment-contract.ts` | **The contract, as data.** 780 lines, pure, no imports. Runtime, environment, schema, routes, headers, secret patterns. |
| `scripts/verify-preflight.mjs` | The executable verifier. 67 checks across 10 sections. Non-zero exit when blocked. |
| `scripts/verify-production.mjs` | Read-only smoke test against a deployed URL. 25 checks. |
| `tests/deployment.test.ts` | 63 tests that stop the contract drifting from the repository. |
| `docs/DEPLOYMENT-RUNBOOK.md` | 15 steps, each with a verification gate. Rollback, 16 failure modes, monitoring. |
| `docs/DEPLOYMENT-HUMAN-CHECKLIST.md` | 54 items only a person can supply; 9 marked HUMAN DECISION REQUIRED. |
| `scripts/test-db.mjs` | Rewritten so `stop` cannot lie. |

---

## 3. The deployment contract

### Why it is code and not a document

Phase 12 found `docs/PRODUCTION-SETUP.md` telling a future operator to expect
**"28 CHECK constraints"** — two phases after the real number became 21. Nothing
was wrong with that sentence when it was written. Prose simply cannot notice
that the thing it describes has changed.

So the contract lives in `src/lib/deployment-contract.ts` as data, and three
things read it: the preflight checks a real environment against it,
`tests/deployment.test.ts` checks it against the migration SQL and the source
tree, and the documentation quotes it rather than restating it.

**A check that reads from there fails when reality moves. A paragraph does not.**

### What it answers

| Question | Answer | Enforced by |
| --- | --- | --- |
| Runtime | Node ≥20.9, Next 16.3.2, React 19.2.8, Prisma 7, PostgreSQL ≥14 | `P-RUN-01…05`, 5 tests |
| Required variables | 4 (one always, three production) | `P-ENV-*`, 6 tests |
| Optional variables | 2 (email, both unwired) | `P-ENV-*` |
| Which are secret | 3 — never printed, never in the browser | test: no secret may be client-exposed |
| Which reach the browser | Exactly `NEXT_PUBLIC_SITE_URL` | test: only the `NEXT_PUBLIC_` prefix |
| Migration required | `20260824124217_init` | `P-DB-10` |
| Before the app starts | `DATABASE_URL`, both secrets ≥32 chars | `P-ENV-*` |
| Before traffic | Migration applied, 21 constraints present, admin exists | `P-DB-*` |
| Before launch | Institute approval, code flag, real domain at build time | `P-LAUNCH-*` |
| Deliberately manual | Accounts, domain, secrets, admin, approval, the launch switch, Search Console, real data | Documented; nothing automates them |

The contract cannot fall behind the code: a test walks `src/` for environment
reads and fails on any name it does not list; another walks `src/app/` and fails
on any route not in the route table.

---

## 4. `verify:preflight`

```bash
npm run verify:preflight                       # local
npm run verify:preflight -- --target=production
npm run verify:preflight -- --deep             # also scan git history contents
npm run verify:preflight -- --json=out.json    # machine-readable scorecard
```

Every check reports an **ID, description, result, evidence** and, where it
failed, **remediation**. Results are `PASS` / `FAIL` / `WARN` / `BLOCKED` /
`NOT APPLICABLE`, and the run ends with the totals and `BLOCKED: true|false`.

**It never prints a secret.** Values are inspected to answer yes/no questions —
present, long enough, a placeholder, localhost — and only the answers are
printed. Every line passes through `redact()` on the way to stdout. A connection
string is reported as `protocol=… host=… database=… ssl=… credentials=present`
and nothing else; a test asserts that no field of that description can contain
the username or password.

### The sections

| § | Checks | What it establishes |
| --- | ---: | --- |
| 1 · Runtime | 5 | Versions match the contract; a lockfile exists |
| 2 · Environment | 11 | Every variable present, long enough, not a placeholder, not localhost; secrets distinct; the contract still matches the code |
| 3 · Secrets and git | 6 | No secret-bearing file tracked or ever committed; no credential in any tracked file; optional full-history content scan |
| 4 · Launch control | 6 | **LAUNCH SWITCH: OFF**; robots disallows everything; no sitemap advertised; `/admin` absent; no analytics tag |
| 5 · Migration safety | 7 | Pure ASCII; every contracted constraint present in SQL; no destructive statement; no consent-column change; schema has not drifted |
| 6 · Database | 13 | Connection, version, tables, enums, **constraints by name**, uniques, foreign keys, consent column defaults, migration status, row counts |
| 7 · Build and bundles | 4 | No secret in client JS; no server-only module in the browser; no admin code in a public chunk |
| 7b · Build-time environment | 1 | **P-BUILD-05** — see §6 |
| 8 · Routes | 5 | Every route contracted; proxy covers `/admin`; every admin module enforces authorization; every route handler checks origin |
| 9 · Configuration | 9 | Headers, type checking, upload limits, admin nonce CSP, baseline fallback, cookie attributes, secret fail-closed, query logging off |

### What it reports, in each of the three situations it was run in

| Run | Required | PASS | FAIL | BLOCKED | WARN | N/A | Exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Local, **no database** | 50 | 43 | 0 | **1** | 6 | 17 | **1** |
| Local, no database, `--deep` | 51 | 44 | 0 | **1** | 6 | 16 | **1** |
| Local, database up | 62 | 58 | 0 | 0 | 4 | 4 | 0 |
| Local, database up, `--deep` | 64 | 59 | 0 | 0 | 5 | 3 | 0 |

**Without a database it exits 1 and reports BLOCKED**, because the schema is the
part that cannot be inferred and every downstream check is marked
`NOT APPLICABLE - no database connection` rather than quietly skipped. A
pre-flight that returns success having never looked at the database would be
the same failure Phase 12 shipped.

The warnings on a passing local run are the three production-only secrets being
absent (correct - the code generates per-process values locally) and the working
tree being mid-phase.

### It was tested by breaking things

A check that has never failed is a check nobody has verified.

**The Phase 12 scenario, reproduced.** One consent constraint was dropped from
the live database and the preflight re-run:

```
FAIL   P-DB-04  every consent-critical CHECK constraint exists BY NAME
       MISSING: toppers_photo_requires_photo_consent
       -> The database can publish a student record without the consent that
          justifies it. Do not deploy.
exit=1
```

It named the constraint, explained the consequence in the operator's terms, and
refused to pass. The constraint was then restored and the check went green.

**Note what a count would have done.** `P-DB-06` in the same run reported
"20 constraints, all contracted" — a count-based check would have said only
that a number was wrong, not which rule was missing. **Constraints are checked
by name, never by count**, and this is why.

**Production gates.** Run with `--target=production` and deliberately bad
values, every gate fired: localhost `DATABASE_URL`, placeholder secrets, secrets
under 32 characters, the two secrets identical, and a missing `sslmode`.

---

## 5. `verify:production`

```bash
BASE_URL=https://<PRODUCTION_DOMAIN> npm run verify:production -- --expect-prelaunch
```

Read-only: GET requests only, never a post, never a sign-in, never a mutation.
It requires an explicit `BASE_URL` with no default, because a smoke test that
silently checks the wrong site reports green for a deployment nobody verified.

25 checks: HTTPS and the HTTP→HTTPS redirect, six security headers, the
admin-versus-public CSP split, every public page, a clean 404, no debug output,
every admin path redirecting when signed out, a forged cookie rejected, the
export endpoint refusing a stranger, robots, sitemap, canonicals, and caching.

**It has never been run against a production site, because there is no
production site.** Phase 13 ran it against a local production build: **25 passed,
0 failed, 3 not applicable** — the three being HSTS and the HTTP→HTTPS redirect,
which are meaningless over plain HTTP and report `NOT APPLICABLE` rather than
passing quietly.

---

## 6. Defects found

### 🔴 P13-A — `NEXT_PUBLIC_SITE_URL` set at runtime silently points the whole site at localhost

**Pre-existing. The most serious finding of the phase, and it is invisible.**

Next replaces every `NEXT_PUBLIC_*` reference with a literal **during the
build**. An operator setting environment variables in a hosting dashboard — the
natural place, and where the other three variables work correctly — leaves the
built output carrying whatever was set when the build ran.

Measured against a real production build, with the variable set only at runtime:

```
canonical            http://localhost:3000
JSON-LD @id          http://localhost:3000/#organisation
sitemap <loc>        http://localhost:3000/, /about, /courses ...
hasRealDomain()      false  ->  isIndexable() can never return true
```

Every consequence is silent. The site works, looks correct, and tells Google
that the real content lives on `localhost`. And the launch switch can never
engage: the operator would set `SITE_IS_LAUNCHED = true`, deploy, find
`robots.txt` still saying `Disallow: /`, and have no way to tell why.

**Fixed** by adding `P-BUILD-05`, which compares the origin baked into the
prerendered homepage against the current environment:

```
FAIL   P-BUILD-05  the built output carries the configured site URL
       the build baked in http://localhost:3000, but NEXT_PUBLIC_SITE_URL is
       now http://localhost:3180
       -> REBUILD. NEXT_PUBLIC_ variables are replaced with literals during the
          build, so changing this at runtime does nothing.
```

There is no way to detect this from inside the running application — by then the
literal *is* the value. It has to be caught by comparing the build against the
environment, which is exactly what a pre-flight is for. Also documented as a
boxed warning in the runbook and in the contract.

### 🟠 P13-B — `scripts/test-db.mjs stop` reported success over a running database

**Pre-existing, carried over from Phase 12, and explicitly in this phase's
scope.**

`serve` starts PostgreSQL as a **child of that process**. `stop` ran in a
different process, constructed a fresh `EmbeddedPostgres` object with no child
to stop, had its `pg.stop()` throw, swallowed the error in a bare `catch`, then
**deleted the data directory out from under the live postmaster** and printed:

> `PostgreSQL stopped and data directory removed.`

Nine `postgres.exe` processes were still running and still serving on 55432.

For a tool whose job is verifying deployment state, a false success is the one
unacceptable bug — the next thing to run inherits a database it believes is
gone, and Phase 12 lost real time to exactly that.

**Fixed.** `stop` now shuts down through PostgreSQL's own `pg_ctl -m fast -w`,
falls back to signalling the postmaster from `postmaster.pid`, **polls until the
port actually closes**, and only then removes the data directory. If it cannot
stop the server it says so, leaves the directory in place, and exits non-zero.
`start` refuses to run when the port is already in use. A new `status`
subcommand reports port, data directory, `postmaster.pid` and live processes.

Verified by reproducing the exact failure — `stop` invoked from a different
process than `serve`:

```
$ node scripts/test-db.mjs stop
PostgreSQL stopped (pg_ctl fast); 127.0.0.1:55432 closed; data directory removed.
exit=0

$ node scripts/test-db.mjs status
port 127.0.0.1:55432   closed
data directory     absent
postgres processes none
```

`start` while a server runs now exits 1 with an instruction instead of running
`initdb` over a live cluster.

### 🟠 P13-C — the public-isolation suite passed or failed depending on what ran before it

**Pre-existing and latent since the suite was written.**

`verify:public-isolation` writes fixtures **straight into the database** —
deliberately, because the point is to prove the public site filters correctly
even when rows arrive from something other than the admin. But writing directly
means nothing calls `revalidatePath`, and `/courses/[slug]` and `/announcements`
are prerendered at **build** time and then served from ISR for an hour.

So its two *positive* assertions were decided by run order. Phase 13 caught it
after a rebuild: the announcement assertion **flipped from fail to pass purely
because `verify:integration` happened to run first** and revalidated that path.

Diagnosis was empirical, and the first hypothesis was wrong. Clearing
`.next/cache` did not help — the pages are prerendered into the build output,
not the cache. The decisive evidence was `x-nextjs-cache: HIT` plus the
order-dependent flip.

**A check whose result depends on what ran before it is not evidence.** Fixed by
making those two assertions detect a demonstrably cached build-time render and
report `SKIP` with the reason, instead of a defect that is not there. Skips are
now printed even when nothing fails, and counted separately — a skipped check is
not a passing one, and a suite that hides that overstates its own coverage.

The behaviour itself is covered where it belongs: `verify:integration` (47/47)
publishes through the admin, and `verify:revalidation` (9/9) asserts the
revalidation contract. **Every negative assertion is unaffected** — a stale
cache cannot make hidden data visible.

Result: **49 passed, 0 failed, 1 skipped**, with the reason stated.

### Defects in this phase's own tooling, found and fixed before shipping

Recorded because they are the same class of bug the phase exists to prevent.

1. **The checker read comments as code.** Three of the first four failures it
   reported were its own prose: `sitemap.ts` flagged for referencing `/admin`
   in a comment explaining that `/admin` must never appear there, and the
   contract flagged for an undocumented variable named `X` from a doc comment
   describing that very check. Fixed with a shared `stripComments()` used for
   every code check — and deliberately **not** for the secret scan, where a
   credential in a comment is still a credential.
2. **The secret scan flagged documented local placeholders.** A verifier that
   cries wolf is one an operator learns to skip, which is how the one real
   finding gets scrolled past. Fixed with a declared `localhostExempt` flag and
   a `${...}` exemption — a template placeholder is code, not a credential.
3. **`git grep` read a pattern as a flag.** Patterns beginning `-----BEGIN …
   PRIVATE KEY-----` were passed positionally, so git rejected them and the
   private-key history scan **silently examined nothing while reporting that it
   had run**. Fixed with `-e`.
4. **The JSON scorecard was announced but never written.** A dynamic
   `import().then()` never resolved before `exit()`. Fixed to a synchronous
   write, with the confirmation printed only after it returns.
5. **The safe database summary was redacted into uselessness** — it printed
   `postgresql://<redacted>`, telling the operator nothing. Rewritten as named
   fields, which carry the same facts, read better, and survive redaction.
6. **Two literal ESC bytes** landed in the new script — the same invisible-byte
   problem Phase 12 fixed. Caught immediately by scanning for control bytes
   before committing; replaced with `\u001B` escapes.
7. **The scanner flagged its own test file.** `tests/deployment.test.ts` exists
   to prove the credential patterns work, so it necessarily contains an AWS key
   id, a GitHub token shape and a `-----BEGIN PRIVATE KEY-----` header. The
   moment it was committed, both the working-tree scan and the history scan
   reported seven leaks in it. Caught by running the preflight against the
   committed tree rather than assuming the pre-commit run still applied. Fixed
   with a narrow named exclusion for the two files that define and test the
   patterns - and the history scan, which had never honoured the skip list at
   all, now does.
8. **The admin CSP smoke checks measured a redirect.** `/admin` answers 307 to a
   signed-out client and a bodyless redirect carries only the baseline headers,
   so the check reported a CSP failure against an admin panel whose CSP was
   correct. Fixed to probe `/admin/login`, and a new `S-HDR-10` now asserts the
   redirect still carries the baseline — proving the documented fail-safe.

---

## 7. Verifying the previous phases' claims

The brief asked that mechanically checkable claims be re-tested rather than
trusted. Each is now a permanent check.

| Claim | Source | Verified |
| --- | --- | --- |
| **P12-A** — 21 CHECK constraints exist | Phase 12 | ✅ `P-DB-04`/`P-DB-05` by name against live PostgreSQL; `P-MIG-03` against the SQL; 8 tests. **Negative test performed.** |
| **P12-B** — no encoding-sensitive migration content | Phase 12 | ✅ `P-MIG-02` and a test: no byte above 127 in any migration |
| **P12-C** — sign-out is audited | Phase 12 | ✅ A test reads the action union out of `auth.ts` and asserts every member appears in `audit_log_action_known`. Confirmed against the current implementation. |
| **P12-D** — import does not reuse the enquiry rate limit | Phase 12 | ✅ Import suite 116/116; a dedicated 20-per-5-minute window |
| **P12-E** — oversized uploads fail gracefully | Phase 12 | ✅ `P-CFG-04` asserts the app's 2 MB limit sits below the framework's 3 MB, so the app's message is the one a teacher meets |
| **P12-F** — GET downloads do not require a mutation Origin | Phase 12 | ✅ `P-ROUTE-05`; smoke test `S-ADM-04` |
| **P12-G** — no binary/control bytes in source | Phase 12 | ✅ Re-scanned; also applied to every file this phase wrote |
| **Phase 10** — admin runs a nonce CSP | Phase 10 | ✅ `P-CFG-05` and `S-HDR-08`, measured on a rendered admin page |
| **Phase 10** — every admin action enforces authorization | Phase 10 | ✅ `P-ROUTE-04` reads all 27 admin modules |
| **Phase 8** — publishing revalidates the public site | Phase 8 | ✅ 9/9, and P13-C's diagnosis confirmed it working end to end |
| **Phase 5.5** — "28 CHECK constraints" | Phase 5.5 | ⚠ **True when written; 21 since Phase 12.** Historical reports left as-is; the operational documents were corrected. |

`docs/PRODUCTION-SETUP.md` told an operator to expect 28 constraints in two
places. Both now point at `verify:preflight` instead of quoting a number.

---

## 8. Regression — the complete state

Everything, not only the new work. Run against a production build and real
PostgreSQL 18.4.

| Suite | Result | Change |
| --- | ---: | --- |
| Typecheck · Lint · `npm audit` | clean · 0/0 · **0 vulnerabilities** | — |
| Unit | **246 / 246** | +63 (deployment contract) |
| **Preflight (new)** | **64 required · 59 PASS · 0 FAIL · 0 BLOCKED** (67 defined) | new |
| **Production smoke (new)** | **25 / 25** | new |
| Security | 245 / 245 | — |
| SEO | 335 / 335 | — |
| Performance budget | 72 / 72 | — |
| End-to-end | 62 / 62 | — |
| Public isolation | **49 pass · 0 fail · 1 skipped** | was 50/0 — see P13-C |
| Integration | 47 / 47 | — |
| Consent constraints | 35 / 35 | — |
| Revalidation | 9 / 9 | — |
| Import / export | 116 / 116 | — |
| Real-browser QA (Chrome) | 249 / 249 | — |
| Teacher workflow (Chrome) | 105 / 105 | — |

**Distinct assertions: 1,659. Executions: 2,013** (the 354 browser assertions run
in both Chrome and Edge).

**No dependency was added.** `package-lock.json` is untouched.

### One flake, not reproduced

The real-browser suite reported **248/1** on a single run, immediately after a
server restart with a cold ISR cache. Four subsequent runs — including three
consecutive — reported 249/0. The most likely cause is first-request cold-start
timing, but **it was not reproduced and therefore not diagnosed**, and it is
recorded here rather than dismissed.

### Migration files

**No migration file was created, edited, regenerated or deleted in Phase 13.**
`prisma/migrations/20260824124217_init/migration.sql` is byte-identical to
Phase 12. `prisma/schema.prisma` is unchanged. Given P12-A, that is a deliberate
non-action: the constraints were verified in place, never rebuilt.

---

## 9. Deployment readiness scorecard

`npm run verify:preflight -- --json=out.json` emits the machine-readable form.

| Category | Status | Condition or blocker |
| --- | --- | --- |
| **DATABASE** | READY | Schema, constraints, FKs, defaults and migration status all verified by name against real PostgreSQL. Needs a provisioned production instance. |
| **AUTHENTICATION** | READY | Sessions, revocation, throttling, forged-cookie rejection — 245 security checks plus 4 smoke checks. |
| **AUTHORIZATION** | READY | All 27 admin modules enforce it independently of the proxy. |
| **CONSENT** | READY | 8 consent-critical constraints verified by name; 35 behavioural checks; import cannot publish. |
| **SECURITY** | READY | Headers, CSP split, CSRF, rate limits, cookie attributes, secret fail-closed, no secrets in client bundles. |
| **ENVIRONMENT** | READY WITH CONDITIONS | Contract complete and checked. **Real values do not exist yet** — B1–B7 of the human checklist. |
| **BUILD** | READY | Clean production build; type errors fail it; no admin code in public chunks. |
| **PERFORMANCE** | READY | 72/72 budget checks; public JS within the 200 KB tripwire. |
| **SEO** | READY WITH CONDITIONS | 335/335. **Conditional on `NEXT_PUBLIC_SITE_URL` being correct at BUILD time** — P13-A. |
| **ACCESSIBILITY** | READY WITH CONDITIONS | 249 automated real-browser checks pass. **No screen-reader testing has been performed** and none is claimed. |
| **IMPORT/EXPORT** | READY | 116/116. Import cannot publish, verified structurally and over HTTP. |
| **CACHING** | READY | ISR verified; admin `no-store`; revalidation 9/9. |
| **OBSERVABILITY** | READY WITH CONDITIONS | Audit log works; errors are generic to visitors; no query logging in production. **No monitoring is configured** — H7. |
| **BACKUP/RECOVERY** | BLOCKED | **No database exists, so no backup exists.** Procedure written and rollback documented; nothing performed. |
| **DOMAIN** | BLOCKED | Not registered. Checklist written, `<PRODUCTION_DOMAIN>` used throughout. |
| **EMAIL** | BLOCKED | No mailbox, no sending domain, no SPF/DKIM. **Enquiries persist without it** — the feature is off, not broken. |
| **PRIVACY** | BLOCKED | 9 HUMAN DECISIONS outstanding, including retention periods and who may export student records. No legal text invented. |
| **REAL DATA** | READY WITH CONDITIONS | System ready. **0 rows in every content table.** Blocked on signed consent forms and the reference scheme. |
| **LAUNCH CONTROL** | READY | **LAUNCH SWITCH: OFF**, verified three independent ways. |

**READY 11 · READY WITH CONDITIONS 6 · BLOCKED 4 · NOT TESTED 0**

Every BLOCKED entry is blocked on an account, a decision or a document that only
the institute can provide. **None is blocked on engineering.**

---

## 10. Remaining blockers

| # | Blocker | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | No PostgreSQL instance | Owner | Deployment |
| 2 | No hosting account, and no confirmation the plan permits commercial use | Owner | Deployment |
| 3 | No domain | Owner | Deployment |
| 4 | No production secrets | Deployer | Deployment |
| 5 | No admin account | Deployer | Deployment |
| 6 | Institute facts unconfirmed — address, phones, hours, email | Institute | Launch |
| 7 | No signed consent forms | Institute | Launch |
| 8 | Reference scheme undecided | Institute | A clean import |
| 9 | Privacy and retention decisions | Institute | Launch |
| 10 | No email sending domain | Institute | Notifications only |
| 11 | No monitoring | Deployer | Post-launch |

Full detail, with evidence columns:
[`DEPLOYMENT-HUMAN-CHECKLIST.md`](DEPLOYMENT-HUMAN-CHECKLIST.md) — 54 items.

---

## 11. What was NOT verified

Stated plainly, because a verification report that only lists successes is not
one.

| Item | Why | Status |
| --- | --- | --- |
| Any real hosting environment | None exists | **NOT TESTED** |
| Any real production database | None exists | **NOT TESTED** |
| HTTPS, certificates, HSTS in effect | Requires a real domain | **NOT APPLICABLE** — reported as such, never as a pass |
| DNS, `www` canonicalisation | No domain | **NOT TESTED** |
| Email delivery, SPF/DKIM | No sending domain; none created | **NOT TESTED** |
| Backup and restore | No database to back up | **NOT TESTED** |
| Screen-reader behaviour | No screen reader available | **NOT TESTED** — not claimed in any phase |
| Provider suspension, host outage | Cannot be simulated | **DOCUMENTED ONLY** |
| Git history content scan by default | Costly; `--deep` opt-in | Run once this phase: 13 commits, 7 patterns, clean |
| `/courses/[slug]` positive batch assertion | ISR serves a build-time render | **SKIPPED**, reason printed — see P13-C |
| The one browser-suite flake | Not reproduced in 4 further runs | **NOT DIAGNOSED** |

### Health endpoint — deliberately not created

A `/api/health` route was considered and rejected. It would add a public,
unauthenticated endpoint whose job is to report infrastructure state, on a site
whose entire attack surface is two public mutating actions. Anything genuinely
useful in it — database reachable, migration applied, constraint count — is
exactly what an attacker wants; anything safe enough to expose is already
answered by `GET /` returning 200. Depth is covered by `verify:preflight`, which
runs with credentials against the real database. Reasoning and the shape of a
minimal one, should a provider ever require it, are in the runbook.

---

## 12. Provider neutrality and cost

Deployment requirements are stated in provider-neutral terms — Node runtime,
PostgreSQL, four environment variables, HTTPS, a build command, a start command,
a migration command, a pre-flight command. Nothing in the application knows
which host it is on.

`docs/COST-AND-INFRASTRUCTURE.md` is preserved unchanged, including its
provider-specific pricing, which is time-sensitive and should be re-checked
before purchase.

**The commercial-use constraint found in Phase 7 is carried forward and made
prominent**: several hosts' free tiers forbid commercial use, and a coaching
institute's website is commercial. The human checklist marks it 🔴 and requires
written confirmation of the plan and its terms, because **"technically free" and
"contractually permitted for this use" are different questions.**

Nothing was purchased. No account was created. Nothing was deployed.

---

## 13. Confirmations

| | |
| --- | --- |
| **Launch switch** | **OFF.** `SITE_IS_LAUNCHED = false`, verified by `P-LAUNCH-01`, a unit test, and `S-SEO-06` observing `noindex` on a live response. |
| **Indexing** | Impossible. Both conditions false; `robots.txt` disallows everything and advertises no sitemap. |
| **Search Console** | Not configured. `P-LAUNCH-06` confirms no verification or analytics tag exists. |
| **Real institute data** | **None created, none requested, none invented.** No student, mark, testimonial, faculty member, fee, batch, address or phone number was fabricated. |
| **Database contents** | `topper 0 · subjectScore 0 · studentStory 0 · batch 0 · announcement 0 · enquiry 0 · importRun 0 · adminUser 0 · auditLog 0` — **TOTAL 0**. |
| **Test fixtures** | All `ZZDEMO` / `ZZTEST` / `ZZSEC` prefixed and removed by their suites. |
| **External infrastructure** | **None provisioned.** No Neon, no hosting, no domain, no DNS, no email, no payment account, no Search Console. |
| **Credentials** | **None created.** The two secrets used for the local smoke test were literal strings beginning `zztest-local-only-not-a-production-secret-`, existed only as inline environment variables for one process, and were never written to a file. |
| **Secret scan** | Working tree clean; no secret-bearing file tracked or ever committed; deep history scan across 13 commits with 7 critical patterns: clean. |
| **Local teardown** | PostgreSQL stopped and independently confirmed stopped; data directory removed; no `.env.local` was ever created this phase; ports 55432 and 3180 free. |
| **Migrations** | **Unchanged.** No migration file created, edited or regenerated. |
| **Dependencies** | **Unchanged.** `package-lock.json` untouched. |

---

## 14. Recommendation for Phase 14 — the final audit

The repository is deployment-ready and the tooling to prove it exists. Phase 14
should be an **adversarial read of the whole system by someone who did not build
it**, not more building.

Three things are worth pointing that audit at:

1. **The claims in every phase report.** Phase 13 found `PRODUCTION-SETUP.md`
   asserting a constraint count that had been wrong for two phases, and Phase 12
   found the Phase 10 report claiming sign-out was audited when every such entry
   was being silently discarded. Both were true when written. **The pattern is
   documentation that ages into being wrong**, and an audit should assume more
   of it exists.

2. **The three things that check themselves.** `deployment-contract.ts`,
   `columns.ts` and the migration's hand-written block are each a single point
   of truth guarded by tests. An audit should try to break each guard — add a
   route, add an environment variable, regenerate the migration — and confirm
   something fails loudly.

3. **The consent model end to end, as a person rather than a suite.** Every
   automated check passes. Nobody has sat down as a parent who wants a
   photograph removed and walked the whole path: who they contact, who acts,
   what the teacher clicks, how long the public site keeps showing it. F9 in the
   human checklist names that gap; Phase 14 should walk it.

---

**PHASE 13 COMPLETE — PHASE 14 NOT STARTED.**
