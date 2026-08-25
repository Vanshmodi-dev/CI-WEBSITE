# Phase 14 — Final adversarial audit

**Date:** 25 August 2026
**Baseline audited:** `c36326d` (Phase 13)
**Branch:** `main`

---

## 1. Executive summary

An adversarial, evidence-driven audit of the whole project, run on the
assumption that every previous phase may have been wrong — including the ten
phases this same author built.

**Six defects were found and fixed. One was HIGH severity and concerned a
child's photograph.**

The pattern that connects most of them: **the admin panel was the
under-examined surface.** `verify-ux.mjs` tests nine viewports across public
routes only; `verify-teacher.mjs` pinned the admin to 1280×900 on the stated
assumption that "a teacher is on a laptop for admin work". Nobody had ever
opened an admin page below 1280px, submitted an admin form's error path in a
browser, or held two admin tabs open at once. Four of the six defects were
living in that gap.

The second pattern: **claims that nothing checked.** `institute.ts` said its
unverified facts "must all read verified before the site goes public" and
nothing read that. `verify-constraints.mjs` proved an unknown audit action is
rejected but never that a known one is accepted — the exact asymmetry that let
Phase 12's `signed_out` bug survive. Phase 10 claimed signing out revokes every
session, and the behaviour itself had never been tested.

**Verdict: READY WITH CONDITIONS.** No known critical or high-severity defect
remains. Every applicable suite passes. The conditions are external — accounts,
a domain, and institute facts nobody has confirmed — and are listed in §22–23.

---

## 2. Repository state

| | |
| --- | --- |
| Audited from | `c36326d` |
| Final commit | `fe7be16` |
| Working tree | clean |
| Commits made | 8 |
| Migration files | **unchanged — none created, edited or regenerated** |
| Dependencies | **unchanged — `package-lock.json` untouched, 0 added** |
| Launch switch | **OFF** |
| Database | **0 rows in all 9 tables**, 21 CHECK constraints |

---

## 3. Methodology

Documents first, then implementation, then attack, then fix, then regression —
per domain, in order, finishing each before starting the next.

Evidence came from source enumeration, a live PostgreSQL 18.4, a production
build served over HTTP, and two real browsers driven through the Chrome
DevTools Protocol. Nothing was marked PASS on inspection alone where a runtime
test was possible.

**Test-harness discipline.** Every failure was triaged as application bug, test
bug, or environment issue *before* touching production code. **Nine failures
turned out to be my own probes**, and each is named in §11 rather than quietly
corrected — a report that lists only the code's mistakes is not an audit of
itself.

---

## 4. Domain results

| Domain | Documentation | Code | Test | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 · UX / design system | Read | Inspected | Browser, 9 viewports × 2 engines | **FIXED** | Public chrome on every admin page; dead motion CSS |
| 2 · Accessibility | Read | Inspected | Browser + DOM | **FIXED** | Nested `<main>`; unreachable scroll region; unannounced errors |
| 3 · Public website | Read | Inspected | 76 hostile requests | **FIXED** | Launch gate unenforced; no 5xx, leak or reflection |
| 4 · Admin / teacher | Read | Inspected | HTTP + browser | **FIXED** | Stale tab restored withdrawn consent |
| 5 · Authentication | Read | Inspected | 25 attacks | **PASS** | No defect |
| 6 · Authorization / IDOR | Read | Inspected | 13 attacks | **PASS** | No defect |
| 7 · CSRF | Read | Inspected | 8 attacks | **PASS** | No defect |
| 8 · XSS / injection | Read | Inspected | 5 stored payloads | **PASS** | All escaped |
| 9 · SQL / database | Read | Inspected | 199 assertions | **PASS** | 192 combinations + 7 named |
| 10 · Consent / privacy | Read | Inspected | Exhaustive matrix + E2E | **FIXED** | Photo-withdrawal journey untested |
| 11 · Data isolation | Read | Inspected | HTTP + RSC payload | **PASS** | No consent field reaches a visitor |
| 12 · File / image | Read | Inspected | Security suite §7–8 | **PASS** | Traversal and SSRF refused |
| 13 · Import / export | Read | Inspected | 116 checks | **PASS** | Import still cannot publish |
| 14 · Enquiry | Read | Inspected | 62 e2e checks | **PASS** | Persists before notifying |
| 15 · Rate limiting | Read | Inspected | 70-attempt ceiling test | **PASS** | Not bypassable by header |
| 16 · Audit / retention | Read | Inspected | 17 dynamic checks | **FIXED** | Constraint checked one way only |
| 17 · Error handling | Read | Inspected | Forced failures | **PASS** | No stack trace, SQL or path leaks |
| 18 · SEO | Read | Inspected | 335 checks | **PASS** | Unchanged by the route-group move |
| 19 · Performance | Read | Measured | 72 budget checks | **PASS** | Public JS unchanged at 189.8 KB |
| 20 · Browser | Read | — | Chrome + Edge | **PARTIAL** | Firefox/WebKit **NOT TESTED** |
| 21 · Database / migration | Read | Inspected | Live catalogue | **PASS** | 21 constraints by name |
| 22 · Deployment | Read | Inspected | Preflight, broken deliberately | **PASS** | Fails closed |
| 23 · Documentation | Read | Compared | Mechanical | **FIXED** | 8 stale counts; self-contradiction in `launch.ts` |
| 24 · Dependencies | Read | Inspected | `npm audit` | **PASS** | 0 vulnerabilities, 8 prod deps |
| 25 · Secrets | — | Scanned | Tree + 20 commits | **PASS** | Nothing found |
| 26 · Teacher scenario | Read | — | Browser, both engines | **PASS** | 121 checks × 2 |
| 27 · Adversarial sweep | — | Enumerated | 9 whole-tree questions | **FIXED** | Dead unauthenticated endpoint |

---

## 5. Defects found and fixed

### 🔴 P14-1 — HIGH — a stale admin tab silently restored a withdrawn photograph

A teacher opens a student's edit page. While it is open a parent rings and asks
for their child's photograph to be taken down, and it is. The teacher returns to
the first tab and presses Save without changing anything.

Measured against a running server, with a **passing control** proving the
payload was valid:

```
after withdrawal : consentPhoto=false, photoUrl=null,     published=false
after stale save : consentPhoto=true,  photoUrl='/…jpg',  published=true
```

The photograph went back onto the public website, the record re-published
itself, and the teacher got a 303 success redirect. Nothing warned anybody.

**Cause:** every admin form round-trips the whole record and the actions did
`update({ where: { id } })` — last write wins. `updatedAt` existed on all six
models and nothing used it.

**Fix:** `src/lib/stale-edit.ts`. The form carries the row's `updatedAt`; the
save requires it to still match via `updateMany({ where: { id, updatedAt } })`.
A count of 0 refuses the save. A missing token also fails closed. Students uses
an interactive transaction because it also rewrites subject rows — the array
form would have committed those before a refused update reported zero.

Applied to **students and stories**, the two entities carrying consent.
Announcements and batches take the same shape of write but hold no personal
data; recorded as LOW and deliberately not changed (§9).

**Verified:** refused for both entities, consent held, **and a form reloaded
after the change still saves** — the guard does not block ordinary work.

### 🟠 P14-2 — MEDIUM — the public marketing site rendered on every admin page

The root layout wrapped every route in `SiteHeader` + `<main>` + `SiteFooter` +
`WhatsAppButton` + organisation JSON-LD, with no conditional.

Measured in a browser, signed in, at 360px: **the marketing footer was 1208px of
a 2508px admin dashboard** — 48% of the teacher's scroll on their own dashboard.
Plus a floating "message us" button over the admin and a duplicate set of
navigation links.

**Fix:** a `(site)` route group. Route groups are path-transparent, so every URL
and every static/dynamic classification is unchanged — 335 SEO checks and 62
e2e checks are the evidence. `/admin` at 360px is now **1234px**.

### 🟠 P14-3 — MEDIUM — two nested `<main>` landmarks on every signed-in page

The root layout's `<main>` wrapped the admin shell's own. Nesting `<main>` is
invalid and leaves assistive technology with two "main" landmarks. Fixed by the
same route-group change; the shell and the sign-in page each now carry
`id="main"`, so the skip link still resolves.

### 🟠 P14-4 — MEDIUM — admin form errors were never announced to a screen reader

Every admin form reports failure through the `Notice` banner, which rendered a
bare `<div>`. A teacher submits, the server rejects, React re-renders, the red
banner appears — silently. Focus stays on the submit button. WCAG 4.1.3.

The public enquiry form already did this correctly (`role="alert"` for errors, a
focus move for success). The admin did not, because no suite had exercised an
admin form's error path in a browser.

**Fix:** `Notice` derives its role from its tone — `danger` → `role="alert"`,
`ok`/`warn` → `role="status"`, `info` → **no role**, because those are static
panels present on load and a live role there announces page furniture.

**Verified over HTTP against the real action:** an empty submit and a submit
with `year=1500`/`score=999` both return `role="alert"`, both mark the failing
fields `aria-invalid`, both name the problem in the teacher's words ("A
percentage cannot be more than 100."), and both create zero rows.

### 🟠 P14-5 — MEDIUM — a scrollable table region no keyboard could reach

`TableShell`'s `overflow-x-auto` container had no `tabindex`, no `role` and no
name. Chrome focuses scrollers by itself, so it looked fine there; Firefox and
Safari do not.

At 360px the container was **284px around 452px of table**, and the column
off-screen was **"What to do"** — the one that tells a teacher how to fix their
spreadsheet.

**Fix:** `tabindex=0`, `role="region"` and a **required** `label` prop, so
TypeScript refuses a future table that ships unnamed. All nine usages labelled.

> ⚠ The Firefox/Safari half of this reasoning is **unverified** — neither engine
> is installed here. See §20.

### 🟠 P14-6 — MEDIUM — nothing enforced "verified before launch"

`institute.ts` declared `UNVERIFIED_FACTS = [address, phonePrimary,
phoneSecondary, hours]` and stated, in a comment, that these "must all read
verified before the site goes public". **Nothing read that array** — not the
launch switch, not a test, not the preflight.

The address and both phone numbers were carried over from the **old website**,
the one an audit found publishing fabricated toppers. Someone could have flipped
the launch switch and had Google anchor the institute's local listing to contact
details nobody had checked. If a number is wrong, enquiries reach a stranger.

**Fix:** `unverifiedFacts()` derives the outstanding list from the `status`
fields rather than the hand-written array — which had already drifted, listing
`hours` while `hours` carries no status field. `isIndexable()` now requires a
**third** condition, and `indexingBlockedBecause()` names the outstanding facts.
Preflight `P-LAUNCH-07` warns before launch and **fails** if the switch is on
with facts outstanding.

**Proved by breaking it:** flipping the switch made `P-LAUNCH-07` fail naming
all four facts, the verdict became NOT SAFE TO DEPLOY, and both unit tests
failed. Reverted.

### 🟡 P14-7 — LOW — a dead unauthenticated endpoint

`digestOf` was an exported async function in a `'use server'` module, commented
"Exposed for tests" and used by **no test**. In the App Router every exported
async function in such a module is a callable endpoint. The build manifest
showed Next had tree-shaken it, so it was not live — but one client-component
import away from being an unauthenticated POST endpoint nobody had decided to
publish. Deleted.

### 🟡 P14-8 — LOW — dead motion CSS shipping to every visitor

`.animate-rise` and its `@keyframes` were used by zero components, still shipped
inside `@layer utilities`, and referenced a `--dur-base` token `globals.css`
never declares. Removed; CSS bundle 50,995 → 50,796 bytes.

---

## 6. Test-harness defects fixed

Not application bugs, but they made the suites untrustworthy, which is worse.

| # | Defect | Consequence |
| --- | --- | --- |
| H1 | `verify-public-isolation.mjs` still asserted five ISR-dependent positives | 46/3 or 49/0 depending on what ran before it |
| H2 | Phase 13's `x-nextjs-cache` rescue alternated between SKIP and FAIL | A different verdict on identical, correct code |
| H3 | `verify-e2e.mjs` reported "condition was false" when the rate limiter refused | Read exactly like a broken enquiry form; cost time twice |
| H4 | `verify-constraints.mjs` never asserted a known audit action is accepted | The Phase 12 asymmetry, unguarded |

**H1/H2 resolution:** all five positives moved to suites that create records
through the **admin form**, which revalidates — so they are deterministic. The
homepage one is asserted on the record's *highlight*, never its name: that
fixture is published without name consent, so asserting on the name would have
asserted the opposite of what the consent model guarantees.

**Coverage went up, not down:** 96 assertions across the two suites became 102,
all deterministic. Isolation is now 46/0 across five runs of the two sequences
that previously failed.

---

## 7. Attacks performed

**49 attacks across Domains 5–8. Every one defended; no application defect.**

**Authentication (25).** Rotating `X-Forwarded-For` bought exactly 10 attempts
before the account throttle engaged. The correct password while throttled: still
refused. A 100,000-character password was rejected in **55 ms** against 62 ms
for a normal one — before the N=2¹⁷ scrypt, so the form is not a
memory-exhaustion amplifier. 70 sign-ins for non-existent accounts from 70
rotated addresses hit the per-instance ceiling. Two devices, distinct tokens;
signing out on one killed **both**. Sign-out replay harmless. Six tampered
cookie shapes refused. Deactivation killed a live session.

**Authorization / IDOR (13).** Signed out, every admin surface refused: a real
record id, a guessed cuid, a numeric id, a quoted SQL fragment, an encoded
traversal, a 5,000-character id, the export endpoint, the enquiries list. An
anonymous POST replaying a real edit form could neither publish nor delete.

**CSRF (8).** Sign-out refused with a cross-site Origin, a lookalike host, a
literal `null`, a malformed value, and with no Origin or Referer at all —
session intact every time. Cross-origin export download 403 while the teacher's
own Origin-less download still returns 200.

**XSS (5).** Five payloads stored through the admin form and rendered on both
the admin list and the public results page: all HTML-escaped.

**Public parameters (76 requests).** `?page=`, `?year=`, `?programme=`,
duplicate params, encoded traversal, unknown slugs, 20-digit integers: **no 5xx,
no stack trace, no Prisma code, no consent field, no reflection.** Path
traversal normalises to the login redirect. The `MAX_PAGE` clamp holds —
`?page=999999999` answers in **22 ms**, the same cost as page 1.

---

## 8. Consent verification

**The database, exhaustively.** Every combination of the fields the four
consent-critical constraints mention — 192 states — compared against the
constraint predicates transcribed from the migration SQL. **192 of 192 agreed.**
Plus seven named cases, all refused: a published photograph with no photo
consent, a published name with no name consent, publication with no consent
reference, publication with no result consent, publication with no
`publishedAt`, and — the one worth noting — **withdrawing photo consent while
leaving the photograph attached**. Only removing consent *and* the photograph
together succeeds.

**The application, exhaustively.** `tests/student-display.test.ts` gained the
matrix half: all combinations, asserting invariants rather than outcomes — a
photograph never without photograph permission, a real name never without name
permission, nothing at all unless published *and* referenced *and* permitted for
that kind, the two content kinds independent in both directions, the monogram
never longer than initials, and `present()` never throwing.

**"Take my child's photograph down", end to end.** The request the institute
will actually receive, and no suite covered it — `verify-teacher.mjs` tested
*unpublishing*; nothing tested withdrawing photograph consent alone. Walked
through the real admin form: the photograph publishes, is visible, and after the
teacher unticks the permission it is withheld in the database, removed from the
record, gone from `/results` and the homepage immediately, absent from a plain
uncached request — **while the record itself stays published**. And it cannot be
re-attached while consent is withheld. Nine checks, now permanent.

---

## 9. Defects accepted, not fixed

| Item | Severity | Why |
| --- | --- | --- |
| Announcements and batches have no lost-update guard | LOW | Same write shape as students/stories, but no personal data and no consent. A lost update there is ordinary CMS behaviour. Deliberate, not overlooked. |
| `/admin/data`'s four tables scroll instead of stacking on mobile | LOW | Every other admin list pairs `hidden md:block` with a card list; these do not. Content is reachable and now keyboard-accessible; the inconsistency is cosmetic. |
| The `(site)` route group name appears in the RSC payload | INFORMATIONAL | A framework internal with no security value. |

---

## 10. Not tested

| Item | Status | Why |
| --- | --- | --- |
| **Firefox / Gecko** | **NOT TESTED** | Not installed. Matters: the P14-5 fix was reasoned about Gecko not focusing scrollers. |
| **Safari / WebKit** | **NOT TESTED** | Not installed, and not installable on Windows. |
| **Screen readers** | **NOT TESTED** | None available. The `role`/`aria` fixes are verified structurally, never behaviourally. No screen-reader claim is made anywhere. |
| Any production environment | NOT TESTED | None exists. |
| HTTPS, HSTS, certificates | NOT APPLICABLE | Reported as such by the smoke test, never as passes. |
| Email delivery, SPF/DKIM | NOT TESTED | No sending domain; none created. |
| Backup and restore | NOT TESTED | No database to back up. |
| Provider outage, suspension | DOCUMENTED ONLY | Cannot be simulated. |

### One failure observed and not diagnosed

The Chrome browser suite reported **248/1** once in this phase and once in Phase
13. It has not reproduced across **8+ subsequent runs**, including a deliberate
attempt with a freshly restarted server and a cleared ISR cache. **The failing
check was never captured, so it is not diagnosed.** Both occurrences followed a
server restart, which suggests first-request timing, but that is a hypothesis
and is recorded as one. Edge has never shown it.

---

## 11. My own probes that were wrong

Nine, each caught by triage before any production code was touched.

1. HTML-entity unescaping dropped from hidden Server Action fields → "Failed to
   find Server Action" 500s that looked like a broken sign-in.
2. An IDOR check asserted a fixture prefix was absent from a page whose **query
   string contained that prefix** — it matched its own input and reported a leak.
3. A form probe grabbed the sign-out form instead of the student form, then
   reported a missing error banner that was never missing.
4. A concurrency probe's crude `<select>` parser dropped `programme`, so the
   "safe" result was really a rejected payload — caught by adding a control.
5. A photo-withdrawal probe copied the **ticked** `consentPhoto` box off the
   form and never deleted it, so it never withdrew consent, then reported two
   defects against correct behaviour.
6. The adversarial sweep's proximity heuristic could not see shared visibility
   constants and flagged four correct queries.
7. Initials were guessed as `ZA` when the app correctly produces `ZB`.
8. `/error|exception/` matched React's RSC payload keys.
9. Python-to-JavaScript escaping mangled regexes and string literals four times,
   twice producing literal newlines inside a character class.

**#4 is the instructive one.** Without a control case, a probe that fails for
the wrong reason looks exactly like a system that is working.

---

## 12. Regression matrix

Production build, real PostgreSQL 18.4, two browser engines.

| Suite | Result | Was (Phase 13) |
| --- | ---: | ---: |
| Typecheck · Lint · `npm audit` | clean · clean · **0 vulnerabilities** | same |
| Unit | **276** | 246 |
| Security | **262** | 245 |
| SEO | **335** | 335 |
| Import / export | **116** | 116 |
| Integration | **65** | 47 |
| End-to-end | **62** | 62 |
| Public isolation | **46** (deterministic) | 49 + 1 skipped |
| Consent constraints | **43** | 35 |
| Revalidation | **9** | 9 |
| Performance budget | **72** | 72 |
| Real-browser QA | **249** × Chrome, Edge | 249 |
| Teacher workflow | **121** × Chrome, Edge | 105 |
| Deployment preflight | **65 required · 59 pass · 0 fail · 0 blocked** | 64 |
| Production smoke | **25 / 25** | 25 |

**Distinct assertions: 1,746. Executions: 2,116** (370 browser assertions run in
both engines). **Zero failures.**

Public JS **189.8 KB**, unchanged. CSS 50,796 bytes (−199).

---

## 13. Database and migration

**No migration file was created, edited, regenerated or deleted.** Given Phase
12 proved Prisma silently drops CHECK constraints on regeneration, that is a
deliberate non-action. The lost-update fix uses the existing `@updatedAt`
column, which is why it needed no schema change.

Live catalogue: 9 tables, 5 enums, **21 CHECK constraints**, 3 unique
constraints, 2 foreign keys with the contracted delete behaviour, consent
columns `NOT NULL DEFAULT false`, migration applied, none failed.

---

## 14. Remaining risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Firefox and Safari untested | **MEDIUM** | Two Chromium engines pass. Run both before launch; the scroll-region fix in particular. |
| No screen-reader verification | MEDIUM | Structure is correct and machine-checked. A real session before launch would be worth an hour. |
| One undiagnosed browser flake | LOW | Not reproduced in 8+ runs. Watch for it. |
| Announcements/batches lost updates | LOW | Accepted; no personal data at stake. |
| Import history never pruned | LOW | Metadata only. |
| Per-instance rate limiters | LOW | Account-level bounds still apply on serverless. |

---

## 15. External blockers

Unchanged by this phase. No PostgreSQL instance, no hosting account (and no
confirmation the plan permits commercial use), no domain, no production secrets,
no admin account, no email sending domain, no monitoring. Full detail with
evidence columns: [`DEPLOYMENT-HUMAN-CHECKLIST.md`](DEPLOYMENT-HUMAN-CHECKLIST.md).

---

## 16. Human decisions required

Nine, unchanged and all in the human checklist: privacy policy, consent wording,
enquiry retention, audit-log retention, import-history retention, who may access
student records, who may export them, who handles deletion requests, and what
happens when a student withdraws consent.

**Phase 14 made the last one materially safer** — the mechanism now refuses to
be undone by a stale tab — but the *process* still needs a named person.

**And one new one:** the address and both phone numbers must be confirmed in
writing and marked `verified`. Until then the site cannot be indexed at all,
which is now enforced rather than merely requested.

---

## 17. Confirmations

| | |
| --- | --- |
| **Launch switch** | **OFF**, verified four ways: source, unit test, preflight, and a live `noindex` response. |
| **Indexing** | Impossible — all three conditions false. |
| **Search Console** | Not configured; no verification or analytics tag exists. |
| **Real institute data** | **None created, requested or invented.** No student, mark, testimonial, faculty member, fee, batch, address or phone number was fabricated. |
| **Synthetic fixtures** | All `ZZ`-prefixed and removed. Final count: **0 rows in all 9 tables**. |
| **External infrastructure** | **None provisioned.** No Neon, hosting, domain, DNS, email, payment account or Search Console. |
| **Credentials** | **None created.** Local test secrets were literal `zztest-audit-local-only-not-a-real-secret-…` strings passed inline to one process, never written to a file. |
| **Secret scan** | Working tree and all 20 commits: clean. |
| **Migrations** | Unchanged. |
| **Dependencies** | Unchanged; 0 added, 0 vulnerabilities. |

---

## 18. Final verdict

# READY WITH CONDITIONS

**No known critical defect. No unresolved high-severity security or privacy
defect.** The HIGH-severity finding — a stale tab restoring a withdrawn
photograph — is fixed, regression-tested, and verified not to block ordinary
work.

Every applicable suite passes: 1,746 distinct assertions, zero failures.

### The conditions

1. **Firefox and Safari are untested.** Run both before launch, particularly the
   keyboard-reachable table region, whose fix was reasoned about engines not
   available here.
2. **No screen reader has been used.** The ARIA work is structurally verified
   and nothing more is claimed.
3. **Institute facts are unconfirmed.** Now enforced: the site cannot be indexed
   until the address and phone numbers are verified in writing.
4. **The external blockers in §15 remain.** All are accounts, a domain, or a
   decision — none is engineering.
5. **One browser-suite failure was observed twice and never reproduced or
   diagnosed.**

None of these makes deployment unsafe. All of them should be read before
someone flips the switch.

---

**PHASE 14 COMPLETE.**
