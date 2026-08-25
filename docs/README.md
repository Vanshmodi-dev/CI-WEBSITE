# Commerce Insight — project documents

TradyPerch · Client project #1 · Started August 2026

## What's here

| Document | What it is | Editable? |
| --- | --- | --- |
| [`brief/01-master-directive.md`](brief/01-master-directive.md) | The formal build directive — vision, quality bar, architecture, design direction, content-integrity rules. | Source doc — preserve verbatim |
| [`brief/02-vision-brief.md`](brief/02-vision-brief.md) | The vision / wish-list. Page-by-page picture of what the site should feel like. | Source doc — preserve verbatim |
| [`MASTER-PLAN.html`](MASTER-PLAN.html) | The plan we actually build from. Answers the brief in 25 sections, with the audit findings that override parts of it. | **Yes — this is the living document** |
| [`design/DESIGN-TOKENS.md`](design/DESIGN-TOKENS.md) | Phase 2 output. Brand colours sampled from the logo, every pairing verified against WCAG AA. | **Yes** |
| [`design/tokens.css`](design/tokens.css) | The 80 tokens as shippable CSS. Canonical reference; the app implements them in `src/app/globals.css`. | **Yes** |
| [`design/BRAND-ASSETS-PENDING.md`](design/BRAND-ASSETS-PENDING.md) | Open dependency — transparent/vector logo, horizontal lock-up, monochrome version. | **Yes** |
| [`design/STUDENT-DATA-POLICY.md`](design/STUDENT-DATA-POLICY.md) | How we publish student information: consent-gated, conservative by default. | **Yes** |
| [`PHASE-3-REPORT.md`](PHASE-3-REPORT.md) | Phase 3 completion report, verification evidence, and the open budget decision. | **Yes** |
| [`PHASE-4-REPORT.md`](PHASE-4-REPORT.md) | Phase 4 completion report — data layer, enquiry pipeline, consent constraints. | **Yes** |
| [`PHASE-4.5-DB-VERIFICATION.md`](PHASE-4.5-DB-VERIFICATION.md) | Offline migration audit, 9 findings, and the database provisioning checklist. **Live migration still pending.** | **Yes** |
| [`PHASE-5-REPORT.md`](PHASE-5-REPORT.md) | Admin panel — auth, authorisation, the four-permission consent model, and what was deliberately not built. | **Yes** |
| [`PHASE-7-REPORT.md`](PHASE-7-REPORT.md) | Admin completion, launch readiness, 229 automated checks. | **Yes** |
| [`PHASE-7-CONTENT-MANAGEMENT-MATRIX.md`](PHASE-7-CONTENT-MANAGEMENT-MATRIX.md) | Who edits what, and why some things stay in code. | **Yes** |
| [`PHASE-7-CONTENT-COLLECTION-CHECKLIST.md`](PHASE-7-CONTENT-COLLECTION-CHECKLIST.md) | **For the institute** — everything we still need from them. | **Yes** |
| [`DEPLOYMENT-RUNBOOK.md`](DEPLOYMENT-RUNBOOK.md) | **The deployment sequence, with a verification gate after every step.** The deployment contract, rollback, failure modes, and what to monitor. | **Yes** |
| [`DEPLOYMENT-HUMAN-CHECKLIST.md`](DEPLOYMENT-HUMAN-CHECKLIST.md) | **For the institute** - the 54 things no engineer can supply, and the nine that are their decision to make. | **Yes** |
| [`PRODUCTION-SETUP.md`](PRODUCTION-SETUP.md) | Provider-specific account creation, referenced by the runbook. | **Yes** |
| [`COST-AND-INFRASTRUCTURE.md`](COST-AND-INFRASTRUCTURE.md) | What it costs to run, and what we deliberately did not buy. | **Yes** |
| [`PHASE-6-REPORT.md`](PHASE-6-REPORT.md) | The public website — every page, the consent isolation rules, and 214 automated checks. | **Yes** |
| [`PHASE-5.5-DATABASE-VERIFICATION.md`](PHASE-5.5-DATABASE-VERIFICATION.md) | **The migration actually ran.** 28 CHECK constraints exercised, 164 automated checks against real PostgreSQL, scale verified at ~1,000 students. | **Yes** |
| [`PHASE-8-REPORT.md`](PHASE-8-REPORT.md) | Admin ↔ public integration — the entity mapping, the revalidation matrix, and two real bugs found and fixed. | **Yes** |
| [`PHASE-9-REPORT.md`](PHASE-9-REPORT.md) | SEO and performance — measured baselines, the canonical strategy, and the discovery that the site was not hydrating in production. | **Yes** |
| [`PHASE-10-SECURITY-HARDENING.md`](PHASE-10-SECURITY-HARDENING.md) | Threat model, the CSP decision, and three real vulnerabilities found by attacking a production build. | **Yes** |
| [`PHASE-11-REPORT.md`](PHASE-11-REPORT.md) | Full QA in real browsers — the mobile menu was 64px tall, and three other defects nobody had looked for. | **Yes** |
| [`PHASE-12-REPORT.md`](PHASE-12-REPORT.md) | Spreadsheet import and export — why an import can never publish a record, and the migration that silently dropped every CHECK constraint. | **Yes** |
| [`PHASE-13-REPORT.md`](PHASE-13-REPORT.md) | Deployment preparation — the executable pre-flight, and the build-time variable that would have told Google the site lives on localhost. | **Yes** |

**Source docs describe what we want. The Master Plan describes what we do.**
When they disagree, the Master Plan says why. Don't edit the source docs to
match decisions — that erases the reasoning.

Published Master Plan (private, shareable): https://claude.ai/code/artifact/55bddc43-c746-4d1a-a97d-5f6f7d02390d
Republish by writing to `docs/MASTER-PLAN.html` — same URL.

## Where the vision brief and the Master Plan differ

Both agree on almost everything: the positioning, the mobile-first stance, the
tech stack, the design taste, the anti-template rules, and the "connected
ecosystem, not a brochure" idea. Four places where the plan deliberately
diverges, each argued in the section named:

| Topic | Vision brief | Master Plan | § |
| --- | --- | --- | --- |
| Page count | ~14 top-level areas, incl. `/toppers`, `/students`, `/resources` | 9 — toppers merged into `/results`, `/resources` deferred until content exists | 01 |
| Admin panel | All 9 content types | 5 that actually change; courses/faculty/gallery stay in code | 12 |
| Reviews data flow | Engine → Database → Website | Engine → payload → Website (the engine *is* the backend) | 13 |
| "95%+ Success Rate" | In the trust bar | Dropped — no standard definition, invites challenge. Replaced with the live Google rating. | 03 |

## ✅ Resolved — brand colour

*Was an open conflict. The logo arrived 21 Aug 2026 and settled it.*

The two source docs proposed different palettes — the master directive said
deep blue + white + orange from the logo; the vision brief said navy/charcoal +
**gold/amber**. Both deferred to the logo, and the logo is unambiguous:

| | Sampled from the mark | Share |
| --- | --- | ---: |
| Navy | `#002D66` | 7.63% |
| Orange | `#EA853F` | 1.32% |
| White | `#FFFFFF` | 81.64% |

**Blue + white + orange. There is no gold in the mark.** The gold direction was
almost certainly carried over from the old Lovable site's navy/gold/crimson
palette — the AI builder's invention, never Commerce Insight's brand.

Full derivation, the AA contrast evidence, and the one constraint this creates
(the logo orange fails AA as text on white, 2.65:1) are in
[`design/DESIGN-TOKENS.md`](design/DESIGN-TOKENS.md).

## Standing rule

Nothing reaches the website that the institute hasn't confirmed in writing.
Both source docs contain illustrative placeholder numbers (`5000+ Students`,
`4.9★`, `Rahul Sharma 98.6%`). They are examples of *shape*. The previous site
shipped invented toppers and testimonials as if they were real — see Master Plan
§00. That is the failure this project exists to correct.
