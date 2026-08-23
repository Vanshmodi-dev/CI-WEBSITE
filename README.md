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

```bash
git clone https://github.com/Vanshmodi-dev/CI-WEBSITE.git
cd CI-WEBSITE
npm ci
cp .env.example .env.local   # set DATABASE_URL and ENQUIRY_SECRET
npm run db:generate
npm run dev
```

| Script | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Node's built-in runner) |
| `npm run verify` | typecheck + lint + test + build |
| `npm run db:migrate` | Apply migrations (needs `DATABASE_URL`) |
| `npm run create-admin` | Create the admin account (needs a database) |
| `npm run db:test` | Start a local PostgreSQL for verification |
| `npm run verify:constraints` | 35 consent/integrity assertions |
| `npm run verify:e2e` | 62 end-to-end assertions over HTTP |
| `npm run verify:scale` | ~1,000 student benchmark |
| `npm run verify:public` | 50 public-data isolation checks |
| `npm run verify:revalidation` | Proves publishing updates the public site |
| `npm run verify:integration` | 47 admin → database → public integration checks |

> The site is **pre-launch**: `robots.ts` disallows all crawling and the root
> metadata sets `noindex`. Both are flipped in Phase 7.

## Phases

| | Phase | State |
| --- | --- | --- |
| 0 | Triage · repo · CI | ● done |
| 1 | Content collection | ○ blocked on client — Master Plan §22 |
| 2 | Design system | ● done — awaiting sign-off |
| 3 | Foundation build | ● done — see [docs/PHASE-3-REPORT.md](docs/PHASE-3-REPORT.md) |
| 4 | Core pages + enquiry | ● done — see [docs/PHASE-4-REPORT.md](docs/PHASE-4-REPORT.md) |
| 5 | Admin panel | ● done — see [docs/PHASE-5-REPORT.md](docs/PHASE-5-REPORT.md) |
| 5.5 | Database & E2E verification | ● done — see [docs/PHASE-5.5-DATABASE-VERIFICATION.md](docs/PHASE-5.5-DATABASE-VERIFICATION.md) |
| 6 | Public website | ● done — see [docs/PHASE-6-REPORT.md](docs/PHASE-6-REPORT.md) |
| 7 | Admin completion + launch readiness | ● done — see [docs/PHASE-7-REPORT.md](docs/PHASE-7-REPORT.md) |
| 8 | Admin ↔ public integration | ● done — see [docs/PHASE-8-REPORT.md](docs/PHASE-8-REPORT.md) |
| — | **Launch** | ○ blocked on institute content + manual setup — see [PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md) |
| 6 | Eight-part audit | ○ |
| 7 | Launch + handover | ○ |

---

Private client project. Not licensed for reuse.
