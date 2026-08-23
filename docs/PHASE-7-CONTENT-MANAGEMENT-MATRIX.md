# Content management matrix

**Date:** 23 August 2026
**Question this answers:** for every piece of public content — who edits it, and why?

The temptation in a phase like this is to move everything into the database so
the teacher "can edit anything". That is the wrong instinct. Some values are
*load-bearing*: change them and routes 404, the sitemap lies, or schema.org
contradicts the Google Business Profile. Those stay in code, where a change is
reviewed before it ships.

The rule used throughout: **admin-editable when it changes on a cadence and
breaks nothing; configuration-driven when it is structural.**

---

## The matrix

| Content | Current source | Admin editable? | Why / why not | Missing information | Action |
| --- | --- | --- | --- | --- | --- |
| **Results / toppers** | Database | ✅ Yes | Changes every results season. Consent-gated at four layers. | Real results + signed consent | Teacher enters |
| **Subject marks** | Database | ✅ **Yes — added this phase** | Model existed since Phase 4 with no way to enter anything into it. | Real marks | Teacher enters |
| **Student stories** | Database | ✅ Yes | Editorial, added occasionally. Separate story + photo consent. | Real stories + consent | Teacher enters |
| **Batches** | Database | ✅ Yes | Changes every term. Validity window prevents stale batches. | Real dates | Teacher enters |
| **Announcements** | Database | ✅ Yes | Frequent, short-lived, self-expiring. | — | Teacher enters |
| **Enquiries** | Database | ✅ Yes (status + notes) | Leads must be worked. | — | Live |
| **Course list & slugs** | `src/config/institute.ts` | ❌ **No — deliberate** | Slugs are **route segments**. A DB-created course with no page is a 404 in the highest-intent place on the site; a deleted one breaks the sitemap and any existing link. | Syllabus, fees, timings, duration | See below |
| **Course detail copy** | Not written | ❌ Not yet | Nothing to edit until the institute supplies it. Page shows an honest empty state. | All of it | Collect, then decide |
| **Institute name** | `src/config/institute.ts` | ❌ No | Must match the Google Business Profile character-for-character. A typo silently breaks local SEO. | — | Stays in code |
| **Tagline** | Logo artwork | ❌ No | Read verbatim from the logo. Editing it would let the site contradict the brand. | — | Stays in code |
| **Address / phone** | `src/config/institute.ts` | ❌ Not yet | Single source of truth for footer, contact page **and schema.org** — NAP consistency is structural. Also still `unverified`. | Written confirmation | Confirm first |
| **Email** | `null` | ❌ Not yet | No professional address exists. UI renders nothing rather than a placeholder. | Domain mailbox | Blocked |
| **Opening hours** | `null` | ⚠️ Candidate | Genuinely changes, breaks nothing. But we have no hours to seed it with. | Actual hours | Add when supplied |
| **Social links** | `null` | ⚠️ Candidate | Same. Footer renders only links that exist. | Real accounts | Add when supplied |
| **Map / Place ID** | `null` | ❌ No | One-time value tied to the Business Profile; not a recurring edit. | Place ID | Set in code once |
| **Faculty** | Does not exist | ❌ No | No model, no page, no verified content. Building a CMS for data we do not have is how half-working CMSs are born. | Names, credentials, photos | See collection checklist |
| **Navigation** | `src/config/nav.ts` | ❌ No | A link to a non-existent page is a 404 in the most prominent element on the site — the exact bug found in Phase 6. | — | Stays in code |
| **Design tokens** | `globals.css` | ❌ Never | Editable colours mean a teacher can make text unreadable, or break the AA contrast the orange split exists to protect. | — | Stays in code |
| **SEO metadata** | Per-route code | ❌ No | Titles/descriptions are written once. Editable metadata invites keyword-stuffing. | — | Stays in code |
| **Indexing switch** | `src/config/launch.ts` | ❌ **Never** | Requires a reviewed code change **and** a real domain. Accidentally indexing a placeholder site is expensive to undo. | — | Flip at launch |

---

## The two decisions §14 and §15 asked for

### Courses — stay configuration-driven ✅

**Decision: keep them in `src/config/institute.ts`.** This confirms, rather than
reverses, the Phase 5 reasoning — but for a sharper reason now that the public
pages exist.

Course slugs are **route segments and `generateStaticParams` inputs**. Making
courses database-driven creates three failure modes a teacher cannot diagnose:

1. Add a course → it appears in navigation and the sitemap, and every click is a
   404, because no page exists behind it.
2. Delete a course → its statically generated page and every inbound link break.
3. Rename a slug → the old URL dies silently.

None of these are hypothetical: Phase 6 found four dead navigation links from
exactly this class of mistake, and that was with slugs under version control.

**What would change this:** once course content exists, a `Course` model whose
`slug` is *immutable after creation* and whose rows are seeded from the current
config would be safe. The editable fields would be description, subjects and
fees — never the slug. That is a clean, scoped task, and it is not worth doing
before there is any content to put in it.

### Site settings — mostly stay in code ⚠️

**Decision: no site-settings screen this phase.**

`institute.ts` is what makes NAP consistency *structural* — the footer, contact
page and schema.org output cannot drift, because there is exactly one copy.
A settings form reintroduces the drift it was designed to prevent, and the
symptom (schema.org disagreeing with the Google Business Profile) is invisible
in the UI and damaging to local SEO.

Two fields are genuine future candidates — **opening hours** and **social
links**. Both change occasionally, and neither breaks anything if edited. But
both are currently `null`: there is nothing to seed them with, and building a
form to edit nothing is not a feature. When the institute supplies them, a
small `SiteSetting` key-value model covering *only* those two is the right size.

Everything else — name, tagline, address, phone — is set once, is
correctness-critical, and belongs in a reviewed commit.

---

## Bulk import (§17) — scoped, not built

**Decision: not built this phase. Specified below.**

Not because it is hard, but because building it now would mean guessing the
column names of a spreadsheet that does not exist, and an importer that silently
mis-maps a consent column is worse than no importer at all.

**When it is worth building:** the first time the institute has a real
spreadsheet of results. Until then the admin form handles the realistic case —
a teacher entering a season's toppers.

**Requirements when it is built:**

| Requirement | Why |
| --- | --- |
| Explicit consent columns per row | Consent is **never** inferred, defaulted or copied down a column |
| `published` forced to `false` on import | Nothing goes live without a human reviewing it |
| Dry-run preview with a per-row error table | The teacher sees exactly which rows fail and why, before anything is written |
| Single transaction | No partial corruption |
| Reject, never coerce, malformed rows | A silently-coerced mark is a wrong mark on a real student |
| Match on an explicit key, never fuzzy | Never silently overwrite an existing student |
| Row cap (~2,000) and size cap | An importer is an unauthenticated-adjacent write path |

Estimated at 1–2 days once a real spreadsheet exists.

---

## What changed in this phase

| Change | Reason |
| --- | --- |
| Subject marks now editable | Model existed since Phase 4 with no UI — results could never show subjects |
| Student search added | At ~1,000 students, filter-only is not a way to find one person |
| Photo path validation hardened | `startsWith('/')` accepted `/../../etc/passwd` and `//evil.com` |
| Website preview added | Answers "did my change actually go live?" without a secret URL |
| Launch switch centralised | Indexing was two hardcoded TODOs in two files |
