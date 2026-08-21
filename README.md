# Commerce Insight — website

The digital platform for **Commerce Insight**, an exclusive institute for commerce
education in Pratap Nagar, Jaipur. Built by [TradyPerch](https://github.com/Vanshmodi-dev).

> **Status: pre-implementation.** Planning and the design system are done.
> No application code has been written yet. Start at [`docs/README.md`](docs/README.md).

---

## Start here

| If you want to… | Read |
| --- | --- |
| Understand the whole project | [`docs/MASTER-PLAN.html`](docs/MASTER-PLAN.html) — 25 sections, open it in a browser |
| Know what the client asked for | [`docs/brief/`](docs/brief/) — two verbatim source docs |
| Build UI | [`docs/design/DESIGN-TOKENS.md`](docs/design/DESIGN-TOKENS.md) and [`tokens.css`](docs/design/tokens.css) |
| Find the index | [`docs/README.md`](docs/README.md) |

## Planned stack

Next.js (App Router) · TypeScript · Tailwind CSS · PostgreSQL + Prisma · Vercel

Reviews come from the separate [TP Reviews Engine](https://github.com/Vanshmodi-dev)
as a published JSON payload, fetched server-side. Videos come from the YouTube
Data API, ISR-cached. Neither is copied into this project's database — see
Master Plan §13 and §14.

## The rule that governs this repository

**Nothing reaches the website that the institute has not confirmed in writing.**

No invented student marks, toppers, testimonials, reviews, statistics, faculty
credentials, or superlative claims. The site this replaces shipped fabricated
toppers and testimonials as though they were real; correcting that is a stated
goal of the rebuild. Where a fact is missing, the component renders nothing
rather than something plausible.

See Master Plan §00 and §42 of the master directive.

## Brand

Colours are **sampled from the logo**, not chosen:

| | |
| --- | --- |
| Navy `#002D66` | headings, brand bands, the mark itself |
| Orange `#EA853F` | fills, rules, indicators — **never text on white (2.65:1, fails AA)** |
| Orange `#BC5915` | the AA-safe orange for text (4.59:1) |
| White `#FFFFFF` | the dominant ground, ~82% of the mark |

Master file: [`assets/brand/commerce-insight-logo-master.jpg`](assets/brand/commerce-insight-logo-master.jpg)

## Local setup

Nothing to install yet — the app is scaffolded in Phase 3.

```bash
git clone https://github.com/Vanshmodi-dev/CI-WEBSITE.git
cd CI-WEBSITE
```

## Phases

| | Phase | State |
| --- | --- | --- |
| 0 | Triage · repo · CI | ◐ repo done, CI pending |
| 1 | Content collection | ○ blocked on client — Master Plan §22 |
| 2 | Design system | ● done — awaiting sign-off |
| 3 | Foundation build | ○ next |
| 4 | Core pages + enquiry | ○ |
| 5 | Evidence + integrations | ○ |
| 6 | Eight-part audit | ○ |
| 7 | Launch + handover | ○ |

---

Private client project. Not licensed for reuse.
