# Phase 3 — Foundation · completion report

**Date:** 21 August 2026
**Exit gate (Master Plan §23):** *"Empty shell deploys, passes budgets"*
**Result:** Shell builds and deploys ✅ · one budget **not met** ⚠ — decision needed

---

## Verification evidence

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | ✅ clean, `strict` + `noUncheckedIndexedAccess` |
| Lint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Build | `npm run build` | ✅ 4 static routes |
| Dependency audit | `npm audit` | ✅ 0 vulnerabilities |
| Homepage HTML | served | 6.7 KB gzip (35.1 KB raw) |
| Homepage CSS | served | 7.6 KB gzip, 1 file |
| Homepage JS | served | **188.8 KB gzip** — see below |

## ⚠ The JS budget is not achievable on this stack

Master Plan §18 set **&lt;120 KB gzip** of JavaScript for the homepage. The built
homepage ships **188.8 KB**.

The cause is not application code. A route with **no client components at all**
(the 404 page) ships **byte-for-byte the same 188.8 KB across the same 8
chunks**. All of it is the Next.js 16 + React 19 App Router baseline. Our own
client-side code — the mobile drawer, the only client component in the app —
contributes no separately measurable bytes.

So the 120 KB figure was an estimate written before the stack was pinned, and it
is simply wrong for Next 16 + React 19. It is not a regression to fix.

### What this does and does not affect

- **LCP, CLS — unaffected.** Every page is server-rendered. First paint needs
  the 6.7 KB HTML, the 7.6 KB CSS and one font; the JS is deferred hydration.
  The &lt;2.0s LCP and &lt;0.05 CLS targets remain realistic.
- **INP / TBT on low-end devices — this is where the cost lands.** More
  JavaScript to parse and execute on a mid-range Android is real, even when
  deferred.

### Options — your call

1. **Revise the budget to ~200 KB** and hold the line there, so any *future*
   growth is still caught. Keep the LCP/CLS/TBT budgets exactly as they are,
   since those measure what the visitor actually experiences.
2. **Re-examine the framework.** Astro or plain SSR would ship far less JS for
   a largely static site. This is a genuine option, but it is a Phase 3 rewrite
   and it trades away the App Router ergonomics the rest of the plan assumes.
3. **Investigate trimming** the Next baseline. Realistic savings are small; the
   floor is the floor.

**Recommendation: option 1.** The site is content-led and server-rendered, so
the metrics that determine how fast it *feels* are already in good shape. Hold
the experience budgets (LCP/CLS/TBT) as the real gate and treat the byte count
as a regression tripwire rather than a target. Revisit if field data shows poor
INP on real devices.

`lighthouserc.json` currently enforces LCP ≤ 2000ms, CLS ≤ 0.05, TBT ≤ 200ms
and accessibility = 100. It does **not** assert a JS byte budget, pending this
decision.

---

## Notable implementation decisions

**ESLint 9, not 10.** `eslint-config-next@16` declares `eslint >=9`, but the
`eslint-plugin-react` bundled inside it crashes on ESLint 10
(`contextOrFilename.getFilename is not a function`). ESLint 9.39.5 carries a
deprecation notice but actually runs. A linter that runs beats a newer one that
does not; revisit when Next ships an ESLint 10-compatible config.

**TypeScript 5.9, not 7.** TS 7 is published as latest, but Next 16 declares no
TS peer and the combination is very new. A first client project is the wrong
place to absorb that risk. Trivially upgradable later.

**No `@eslint/eslintrc`.** `eslint-config-next@16` exports flat configs
directly, so the `FlatCompat` shim is unnecessary — one fewer dependency.

**Robots disallows everything.** The site is pre-launch. `src/app/robots.ts`
returns a blanket `disallow: /`, with the Phase 7 policy sitting commented out
beneath it. Shipping an indexable site full of placeholders is how a domain
earns a bad first impression from Google. **This must be flipped at launch.**

**No `AggregateRating` / `Review` structured data.** Documented in
`src/lib/seo.ts`. Reviews come from the Google Business Profile via the Review
Engine; claiming them as first-party structured data risks a manual action
against the domain.

**The mobile drawer derives its state from the pathname** rather than closing
itself in an effect. An effect would fire after paint, so the drawer would
flash over the new page during navigation.

---

## Blockers carried into Phase 4

| Blocker | Blocks | Owner |
| --- | --- | --- |
| Transparent / vector logo | Logo on navy and dark grounds — see `design/BRAND-ASSETS-PENDING.md` | Client |
| Professional email address | Footer email, enquiry notifications | Client |
| Confirmed NAP + hours | Contact page, `LocalBusiness` schema | Client |
| Course content | All five course pages, course cards | Client |
| Consent process for students | Toppers, results, stories — see `design/STUDENT-DATA-POLICY.md` | Client |
| Google Business Profile API access | Reviews (Phase 5) | Client |
| Photography | Hero, faculty, gallery | Client |

None of these blocked Phase 3. All of them block Phase 4 or 5 content.
