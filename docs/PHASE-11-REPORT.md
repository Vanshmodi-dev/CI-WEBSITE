# Phase 11 — Full QA, real-world validation and regression hardening

**Date:** 24 August 2026
**Baseline:** `47eb3ad` (Phase 10)

---

## 1. Objective

Prove the system actually works — not that it returns the right HTTP status, but
that a parent can use it on a phone, a teacher can run it without help, and
student data stays protected while they do.

Everything the project verified before this phase was verified **over HTTP**:
status codes, headers, and the HTML that came back. That is why the worst defect
in this report survived ten phases. It was never invisible; it was never
*looked* at.

**Four application defects were found, one of them critical.** All four are
fixed with regression tests. Eight test-harness bugs were found alongside them
and are recorded separately, because a suite that lies to you is worse than no
suite.

---

## 2. Baseline

Measured at the start of the phase, before any change.

| Suite | Phase 10 report | Measured now |
| --- | ---: | ---: |
| Security | 243 | 243 |
| SEO | 335 | 335 |
| Unit | 126 | 126 |
| Performance budget | 72 | 72 |
| End-to-end | 62 | 62 |
| Public isolation | 50 | 50 |
| Integration | 47 | 47 |
| Consent constraints | 35 | 35 |
| Revalidation | 9 | 9 |
| **Stated total** | **969** | — |
| **Actual total** | — | **979** |

Every suite matched. **The Phase 10 total was a sum error**: those nine numbers
add to 979, not 969. The individual counts were right; the addition was not.
Recorded here rather than quietly corrected, because the brief asked for the
difference to be investigated rather than reconciled.

Typecheck clean · lint 0/0 · build clean · `npm audit` 0 vulnerabilities.

### One suite was order-dependent

`verify-integration` returned 46/47 on the first run and 47/47 on the second.
Cause: it signs in once per run with no forwarded address, and the per-IP
sign-in limiter allows three per minute. Running it four times inside a minute
exhausts the budget. That is the limiter working — but chasing it is what
uncovered QA-1 below.

---

## 3. Routes tested

All nine public routes plus `/not-found`, and all eleven admin routes, in two
browsers, at nine viewport widths, in light and dark themes.

`/` · `/about` · `/courses` · `/courses/[slug]` · `/results` · `/stories` ·
`/announcements` · `/contact` · `/admissions` · a deliberately missing route

`/admin` · `/admin/login` · `/admin/students` (+ `new`, `[id]`) ·
`/admin/stories` (+ `new`, `[id]`) · `/admin/batches` (+ `new`, `[id]`) ·
`/admin/announcements` (+ `new`, `[id]`) · `/admin/enquiries` · `/admin/preview`

Every internal link on every public page was followed and resolves (335 SEO
checks include a full link crawl).

---

## 4. Browser matrix

| Browser | Version | Public QA | Teacher workflow |
| --- | --- | --- | --- |
| Chrome | 151.0.7922.170 | 249 / 249 | 105 / 105 |
| Edge (Chromium) | 151.0.4129.101 | 249 / 249 | 105 / 105 |
| Firefox | — | **NOT TESTED — ENVIRONMENT LIMITATION** (not installed) |
| Safari / WebKit | — | **NOT TESTED — ENVIRONMENT LIMITATION** (no macOS/iOS available) |

Safari matters for this audience and cannot be tested from here. It is the
largest remaining verification gap and is listed in §23.

**No browser-automation dependency was added.** Chrome was already present for
Lighthouse, Node 24 ships a WebSocket client, and `scripts/browser.mjs` is the
~200 lines of Chrome DevTools Protocol the QA suites need. Playwright would have
been ~300 MB plus its own browser downloads.

---

## 5. Viewport matrix

Nine widths, every public route, checked for horizontal overflow, touch-target
size, and dark-mode contrast.

320 (iPhone SE) · 360 (common Android) · 375 · 390 · 412 (Pixel) · 430 ·
768 (tablet) · 1024 · 1280 · plus 640 as a 200 %-zoom reflow test.

**Result: no horizontal overflow at any width on any route.** No clipped
content at 200 % zoom.

---

## 6. Bugs discovered

### 🔴 QA-4 — CRITICAL: the mobile menu was 64 px tall and mostly unusable

**The site's only navigation below `lg`, broken on every phone width, since the
header was written.**

Measured geometry with the drawer open at 390 × 844:

```
overlay  0..64   h=64    <- should be 844
dialog   0..64   h=64
  header 0..45
  nav    45..77  h=32    <- the entire navigation list
  bottom 77..214         <- painting on top of the nav
```

The nav links laid out at y = 89…374 inside a 32 px clipped box.
`document.elementFromPoint()` at the centre of `/results` returned the
**"Enquire now" block**, not the link. Four of six navigation links were
unreachable.

**Cause, proven not guessed.** The overlay is `position: fixed; inset: 0`, but
the header carries `backdrop-blur-sm` → `backdrop-filter: blur(8px)`, and a
`backdrop-filter` on an ancestor makes that ancestor the **containing block for
fixed-position descendants**. The "full-screen" overlay was therefore clamped to
the header's box. Setting `backdropFilter: none` on the header at runtime
restored it to 844 px immediately — that was the confirmation.

**Fix:** the drawer is rendered as a sibling of `<header>` rather than inside
it. The `backdrop-blur-sm` design is untouched.

**After:** 844 px tall and **6/6 links tappable at 320, 360, 375, 390, 412 and
430 px.**

> **Why it survived ten phases.** Every prior assertion about the drawer checked
> that things *existed*: it opened, it was `aria-modal`, focus moved into it, it
> contained seven links. All true. All passing. All irrelevant — the panel was
> 64 px tall the whole time. **Presence is not usability.** The new regression
> test hit-tests every link with `elementFromPoint` at six phone widths, which is
> the assertion that would have caught it.

### 🟠 QA-1 — HIGH: the owner could be locked out of their own admin panel

The per-IP burst limiter consumed a slot on **every** sign-in attempt, including
successful ones. Measured, from a clean window:

```
correct sign-in #1: SUCCESS
correct sign-in #2: SUCCESS
correct sign-in #3: SUCCESS
correct sign-in #4: REFUSED (throttled)     <- correct password
```

Three sign-ins per minute per IP, and the institute's devices share one public
IP. Phase 10 made signing out revoke every session, so a phone, a laptop and one
browser restart is already four sign-ins. `failedLoginCount` recorded **0** —
the account-level counter knew the passwords were right; the IP limiter did not
care.

**Fix:** `checkBurst` split into `peekBurst` (ask) and `recordBurstHit`
(charge). Sign-in asks before the attempt and charges **only failures**. A rate
limit exists to make abuse expensive, not to make use expensive.

**After:** six consecutive correct sign-ins from one address all succeed; wrong
passwords are throttled after three exactly as before.

A second defect surfaced while fixing it: the `throttled` outcome initially fell
through to *"That email or password is not correct."* That sends the owner to
reset a password that works, **and hides from them that something is hammering
their account.** It now says so.

### 🟡 QA-2 — MEDIUM: the drawer claimed to be modal but did not trap focus

`role="dialog" aria-modal="true"` with no `Tab` handling. `aria-modal` tells
assistive technology the rest of the page is inert; it does not stop the browser
moving focus there. Tabbing through the open drawer walked straight out into the
page underneath — still rendered, still focusable, completely hidden behind the
panel. A keyboard or switch-control user ended up operating controls they could
not see.

**Fix:** the ARIA authoring-practices wrap — from the last control `Tab` goes to
the first, from the first `Shift+Tab` goes to the last, and focus that has
drifted outside is pulled back.

### 🟡 QA-3 — LOW: three links below the WCAG 2.5.8 minimum

The "All courses →", "All results →" and "All stories →" section links rendered
88 × **23** px. WCAG 2.2 AA requires 24 × 24 for a target that is not inline in a
sentence; these are standalone links beside a heading, so no exemption applies.

**Fix:** `inline-flex min-h-11 items-center`, matching the 44 px convention the
header, chips and pagination already use.

*(The "View programme →" text inside a course card is not a target — the whole
card is the link. Correctly left alone.)*

---

## 7. Bugs fixed, with their regression tests

| Bug | Fix | Regression test |
| --- | --- | --- |
| QA-4 drawer clipped | Drawer rendered outside `<header>` | `verify-ux` §4: panel ≥ 90 % of viewport height, plus `elementFromPoint` hit-test of every link at 6 phone widths |
| QA-1 throttle | `peekBurst` / `recordBurstHit` split | 8 unit tests in `tests/security.test.ts`; `verify-security` asserts 6 consecutive correct sign-ins succeed *and* wrong ones still throttle |
| QA-2 focus trap | ARIA modal Tab wrap | `verify-ux` §4: 14 Tab presses cannot move focus out of the drawer |
| QA-3 touch targets | 44 px minimum height | `verify-ux` §7: every non-inline target ≥ 24 × 24 on all 9 routes |

---

## 8. Test-harness findings

Eight. Every one produced a **false** failure that could have been "fixed" in
the application by someone in a hurry.

| # | Symptom | Reality |
| --- | --- | --- |
| 1 | `Touch points must be between 1 and 16` | CDP rejects `maxTouchPoints: 0`; only send it when enabling touch |
| 2 | 404 route "logs a console error" | Chrome logs the navigation's own 404 as a failed resource — that IS the expected outcome there |
| 3 | "clicking the trigger does not open the drawer" | Click and assertion in the same `eval`; React schedules state updates, so nothing had rendered yet |
| 4 | Skip link is a "1 × 1 touch target" | A skip link is `sr-only` until focused — that is the correct implementation |
| 5 | "no `prefers-reduced-motion` rule" | Tailwind v4 emits inside `@layer`, so a one-level `cssRules` walk misses it. The rule is served |
| 6 | "tapping the scrim does not close the drawer" | At 390 px the panel is 384 px wide — the scrim's *centre* is underneath it. See §12 |
| 7 | Announcement banner assertion failed only at scale | The fixture set uses `priority` 1–4; `priority` is **not on the announcement form**, so no teacher-created notice ever has it |
| 8 | "0 enquiries created by a double tap" | The submit button was at y = 1423 in an 844 px viewport. The click hit empty space. Scrolled into view: exactly 1 row, every time |

Finding 8 is the one worth dwelling on — it looked like a catastrophic
data-loss bug for about ten minutes. It was a test clicking into the void.

---

## 9. Accessibility results

All checks run in Chrome and Edge, across all nine public routes.

| Check | Result |
| --- | --- |
| Exactly one `<h1>` per route | ✅ 10/10 routes |
| Heading levels never skip | ✅ |
| `header` / `main` / `footer` landmarks | ✅ |
| Every form control labelled | ✅ |
| Every image has `alt` or `aria-hidden` | ✅ |
| No link with an empty accessible name | ✅ |
| Every focusable control has an accessible name | ✅ |
| Skip link is the first Tab stop | ✅ |
| Visible focus indicator | ✅ |
| Touch targets ≥ 24 × 24 (WCAG 2.5.8) | ✅ **after QA-3** |
| Drawer: `aria-modal`, named, `aria-expanded` maintained | ✅ |
| Drawer: focus enters, is trapped, returns to trigger | ✅ **after QA-2** |
| Body scroll locked while open, released after | ✅ |
| Escape closes | ✅ |
| Dark-mode text contrast (AA, computed) | ✅ all routes |
| 200 % zoom reflow (WCAG 1.4.4) | ✅ no sideways scroll |
| `prefers-reduced-motion` honoured | ✅ |
| Lighthouse accessibility | **100** on every route measured |

**Screen reader: NOT TESTED — ENVIRONMENT LIMITATION.** No screen reader is
available in this environment. Semantics, names, roles and states were verified
programmatically, which is necessary but not sufficient. Listed in §23.

---

## 10. Mobile results

| Check | Result |
| --- | --- |
| Horizontal overflow, 9 widths × 9 routes | ✅ none |
| Drawer opens / closes / Escape / focus | ✅ |
| Every drawer link tappable at 320–430 px | ✅ **after QA-4** |
| Drawer closes after navigating; scroll not left locked | ✅ |
| Drawer reopens after client-side navigation | ✅ |
| Browser Back does not leave it open or locked | ✅ |
| Close button ≥ 44 px at every width | ✅ |
| Hydration: 0 runtime errors, 0 console errors | ✅ |

**Observation (not a defect):** the drawer is `w-full max-w-sm`, so the scrim
outside it measures 0 px at 320 and 360, 6 px at 390, 46 px at 430. On the
commonest Indian Android widths there is nothing outside the panel to tap.
Escape, the labelled close button and navigating all dismiss it, and a
full-screen drawer on a small phone is a normal pattern — so this is recorded,
not changed.

---

## 11. Performance results

### Lighthouse, mobile preset, at 1,000 synthetic students

| Route | Perf | A11y | BP | FCP | LCP | CLS | TBT | Bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 77 | 100 | 100 | 1.0 s | 3.4 s | 0 | 530 ms | 314 KiB |
| `/results` | 84 | 100 | 100 | 0.9 s | 3.0 s | 0 | 420 ms | 311 KiB |
| `/stories` | 86 | 100 | 100 | 0.9 s | 3.0 s | 0 | 360 ms | 304 KiB |
| `/courses` | 79 | 100 | 100 | 1.5 s | 3.5 s | 0 | 420 ms | 321 KiB |
| `/announcements` | 85 | 100 | 100 | 1.0 s | 3.1 s | 0 | 350 ms | 305 KiB |
| `/admissions` | 81 | 100 | 100 | 1.2 s | 3.2 s | 0 | 420 ms | 307 KiB |

Phase 9 recorded LCP 2.9–3.4 s and TBT 430–570 ms. **Reproduced**, now with
1,000 published results in the database rather than an empty one — content
volume is not the cost.

### Where the time goes — verified independently, not inherited

Phase 9 attributed the cost to React hydration. That was checked rather than
assumed:

- LCP is **86–87 % render delay**, 13–14 % TTFB. Not network.
- Script evaluation 931–951 ms, of which **728–740 ms is the react-dom chunk**.
- One render-blocking stylesheet, ~165 ms.
- The LCP element is a **text paragraph already present in the server HTML**.

**Phase 9's attribution is correct.**

### A hypothesis Phase 9 never tested

Since the LCP element is text that is already in the HTML, the fonts were a
suspect. Measured under applied slow-4G + 4× CPU throttling in a real browser:

| Condition | FCP | LCP | CLS |
| --- | ---: | ---: | ---: |
| As shipped (fonts preloaded) | 836–1036 ms | **1760–1924 ms** | **0** |
| Fonts not preloaded (experiment) | 988–1064 ms | 2384–2572 ms | 0.012 |
| Webfonts blocked entirely | 2384 ms | 2384 ms | — |

**FCP and LCP coincide in the shipped build** — the hero text paints once, so
there is no font-swap re-paint pushing LCP out. Removing the preload made LCP
**worse** by ~600 ms and introduced measurable CLS.

**Phase 9's decision to preload the two variable fonts is confirmed by
measurement.** The experiment was reverted; `src/app/layout.tsx` is byte-for-byte
unchanged.

### Is the remaining cost acceptable?

Stated honestly, because the two measurement methods disagree:

- **Lighthouse's simulated throttling** puts LCP at 3.0–3.5 s — above the Master
  Plan §18 target of 2000 ms.
- **Applied throttling in a real browser**, warm, puts it at 1.76–1.92 s — below
  it.
- Run-to-run variance on this machine is enormous (FCP 836 ms to 4360 ms for the
  same page). Neither number is production.

What is not in doubt: **~730 ms of the mobile main thread is react-dom
hydrating**, and that is the Next 16 + React 19 App Router floor which Phase 3
established by measuring a route with no client components at all. Reducing it
requires a different framework, not tuning. CLS is **0** everywhere, and
accessibility and best practices are **100** everywhere.

**Recommendation: accept, and revisit with field data after launch** rather than
with lab simulation. Deferred to post-launch in §22.

### Byte budgets — no regression

72/72 budget checks pass. JS 189.6 KB, fonts 89.0 KB, heaviest route 300.2 KB —
identical to Phase 9 and Phase 10.

---

## 12. Admin workflow results

The full teacher journey, driven in a real browser (`verify-teacher`, 105
checks, Chrome and Edge).

| Step | Result |
| --- | --- |
| Sign-in page renders under the nonce CSP | ✅ **not blank** — the Phase 10 failure mode |
| Wrong password → plain-language message, stays on page | ✅ |
| Correct password → dashboard | ✅ |
| All 11 admin pages render, one `<h1>`, nav present | ✅ |
| Every admin page's scripts carry the CSP nonce | ✅ |
| 0 console errors, 0 thrown errors across all 11 | ✅ |
| No database jargon in any form label | ✅ |
| Consent controls described in plain language | ✅ 4 found |
| New record is NOT published by default | ✅ |
| Publishing without consent refused, in actionable words | ✅ |
| Result consent does not grant name or photo consent | ✅ |
| Published result appears on `/results` | ✅ |
| Name withheld until name consent granted | ✅ |
| Consent reference never reaches the public page | ✅ |
| Granting name consent reveals the name | ✅ |
| Unpublishing removes it immediately | ✅ |
| Announcement: create → publish → appears → unpublish → gone | ✅ |
| Delete asks for confirmation | ✅ |
| **Declining the confirmation does not delete** | ✅ |
| Accepting deletes | ✅ |
| Session cookie unreadable from JavaScript | ✅ |
| Sign out → sign-in page; admin URLs redirect | ✅ |
| Back button after sign-out restores nothing | ✅ |

**UX observation.** With more than one live announcement the homepage banner
shows only the top-ranked one, and `priority` is not on the announcement form —
so every notice a teacher creates ranks equally and the newest wins. A second
notice published the same day may not change the homepage. `/announcements`
lists them all and `/admin/preview` answers "what is live right now", so nothing
is lost. Worth knowing before the teacher asks; **not changed**, because adding
a priority control is a feature.

---

## 13. Authentication, authorization, consent and privacy

Re-run in full, plus the Phase 11 additions.

| Area | Result |
| --- | --- |
| Authentication (scrypt, salts, enumeration, cookie flags) | ✅ |
| **Correct passwords never throttled** | ✅ **new** |
| Wrong passwords still throttled after 3 | ✅ |
| Session forgery — 9 shapes + cross-account | ✅ all rejected |
| Session replay after logout | ✅ closed (Phase 10) |
| Authorization — 11 routes × 4 credential states | ✅ all fail closed |
| Direct mutation without a session | ✅ 0 rows created |
| CSRF — Server Actions and Route Handlers | ✅ |
| IDOR — 10 hostile id shapes through real forms | ✅ |
| Path traversal — 18 payloads | ✅ all rejected |
| Image optimiser SSRF — 8 probes | ✅ all refused |
| SQL — 5 payloads, row counts unchanged | ✅ |
| XSS — stored payloads, `javascript:` hrefs, JSON-LD | ✅ |
| Consent matrix, 5 states + withdrawal | ✅ |
| Enquiry confidentiality across 9 public surfaces | ✅ |
| Unpublished record absent from HTML, RSC payload, sitemap | ✅ |
| Security headers, CSP directives | ✅ |
| Error disclosure — no stack traces, paths or secrets | ✅ |
| Secret exposure in pages, bundles, source maps | ✅ |

**Security suite: 245/245** (243 baseline + 2 new correct-password regressions).
**No security regression.** Nothing was weakened to make a test pass.

---

## 14. Enquiry lifecycle, including a slow connection

| Scenario | Result |
| --- | --- |
| Valid submission | 1 lead, confirmation shown |
| **Triple-tapped on slow 4G** | **1 lead** — no duplicate |
| Triple-tapped on a fast connection | 1 lead |
| Submit button after the first tap | replaced by the confirmation, so it cannot be tapped again |
| Empty / invalid / oversized fields | rejected with field-level messages (62 e2e checks) |
| Honeypot, forged token, expired token | rejected |
| Rate limiting (burst / short / daily) | enforced |
| Persist-before-notify ordering | ✅ verified in `src/lib/enquiry.ts`: the row is committed at step 6, notification is step 7 and cannot throw |

**A legitimate enquiry cannot silently disappear.**

---

## 15. Data integrity at 1,000 students

Seeded 1,000 published results, 3,000 subject scores, 80 stories, 30 batches,
12 announcements, 500 enquiries — all `ZZTEST`-prefixed.

| Check | Result |
| --- | --- |
| `/results` page 1 | 24 cards, "of 1000 published results" |
| `/results?page=42` | 16 cards, "Page 42 of 42" — the tail, not truncated |
| `/results?page=999999999` | clamped, empty state, no scan |
| `/stories` page 1 | 12 cards, "of 80 published stories" |
| Homepage | 11 cards — bounded band |
| Sitemap | 0 `ZZTEST` references — no student record has a URL |
| `/results` HTML | 0 occurrences of `ZZTEST-CONSENT` |
| Real-browser QA at scale | 249/249 |
| Teacher workflow at scale | 105/105 |

**No silent truncation anywhere.** Every large list states its total.

---

## 16. Revalidation and cache

Re-verified: create → publish → appears; edit → updates; unpublish →
disappears; consent withdrawn → disappears; batch reassigned → leaves the old
course page and joins the new one; announcement → homepage banner and
`/announcements` both update.

Revalidation 9/9 · Integration 47/47 · Isolation 50/50.

---

## 17. Concurrency

Unchanged from Phase 8's finding and re-confirmed: subject marks are replaced in
a transaction; editing a record another admin deleted throws, is caught, and
shows a generic message; two admins editing one record is last-write-wins.

With one admin account there is no correctness issue to solve, and optimistic
locking would be complexity without a matching benefit. **Documented, not
changed** — as Phase 8 decided and Phase 11 re-confirms.

---

## 18. Error handling

Five probe paths plus a malformed Server Action POST (which answers 500). None
leaks a stack trace, filesystem path, connection string, Prisma internal, or
environment variable name. `logUnexpected` keeps detail server-side and returns
a short reference id.

---

## 19. Final test counts

| Suite | Baseline | Now | Δ |
| --- | ---: | ---: | ---: |
| Security | 243 | **245** | +2 |
| SEO | 335 | 335 | — |
| Unit | 126 | **134** | +8 |
| Performance budget | 72 | 72 | — |
| End-to-end | 62 | 62 | — |
| Public isolation | 50 | 50 | — |
| Integration | 47 | 47 | — |
| Consent constraints | 35 | 35 | — |
| Revalidation | 9 | 9 | — |
| **Real-browser QA** | — | **249** | **new** |
| **Teacher workflow** | — | **105** | **new** |

- **Distinct assertions: 1,343** (979 → 989 non-browser, plus 354 new browser
  assertions).
- **Total executions: 1,697**, because the 354 browser assertions run in both
  Chrome and Edge.

Typecheck clean · lint 0 errors 0 warnings · production build clean ·
`npm audit` **0 vulnerabilities** · **no dependency added**.

---

## 20. Database cleanup

```
FINAL DATABASE STATE
  Topper         0
  SubjectScore   0
  ResultRecord   0
  StudentStory   0
  Batch          0
  Announcement   0
  Enquiry        0
  AdminUser      0
  AuditLog       0
  TOTAL ROWS:    0
```

Local PostgreSQL stopped, data directory removed, `.env.local` deleted. All
fixtures were `ZZTEST` / `ZZQA` / `ZZSEC` / `ZZDEMO` prefixed. Admin passwords
used in testing were generated per run and never written to disk.

---

## 21. Secret scan

| Scanned | Result |
| --- | --- |
| High-signal patterns (AWS, Stripe, GitHub, Slack, private keys) in tracked files | 0 |
| `.env` files tracked | 1 — `.env.example` only |
| `.env` ever committed, across all history | 0 |
| Phase 11 local test secrets committed | 0 |
| Generated test passwords committed | 0 |
| Temporary or debug files left behind | 0 |
| Launch switch | `SITE_IS_LAUNCHED = false` |

No secret found; nothing needs rotation.

---

## 22. Deferred, with severity and ownership

| # | Item | Severity | Why deferred | Blocks launch? | Owner |
| --- | --- | --- | --- | --- | --- |
| 1 | Mobile LCP 3.0–3.5 s / TBT 350–530 ms vs §18 targets | Medium | ~730 ms is react-dom hydration — the framework floor. Fixing it means changing framework, and the two measurement methods disagree (§11) | **No** — accept and revisit with field data | Post-launch |
| 2 | Safari / WebKit untested | Medium | No macOS or iOS available in this environment | **Yes** — must be smoke-tested on a real iPhone before launch | Phase 13 / manual |
| 3 | Screen-reader testing | Medium | No screen reader available here | **Yes** — one pass with VoiceOver or NVDA before launch | Phase 13 / manual |
| 4 | Firefox untested | Low | Not installed | No — Gecko differs from Blink mainly in CSS edge cases already covered by two engines | Phase 13 |
| 5 | Scrim not tappable at ≤ 390 px | Low | By design: full-screen drawer. Escape and the close button both work | No | — |
| 6 | Announcement `priority` not on the form | Low | Adding a control is a feature, not a QA fix. `/admin/preview` answers the question it raises | No | Phase 12+ if the teacher asks |
| 7 | Last-write-wins on concurrent edits | Low | One admin account; locking is unjustified complexity | No | Phase 12+ if a second account is added |
| 8 | `ResultRecord` model unused | Info | Dead schema, no data. Removing it is a migration | No | Phase 12 |

**No defect found in this phase was deferred.** All four were fixed.

---

## 23. Environment limitations and external blockers

**Environment limitations** (cannot be tested from here, not claimed as passing):

- Safari / WebKit — no Apple hardware or simulator.
- Screen readers — none installed.
- Firefox — not installed.
- Real device testing — emulated viewports and applied CPU/network throttling
  are close, but a real mid-range Android on a real network is not the same
  thing.

**External blockers** — none reached. Nothing in this phase required Neon,
hosting, a domain, email, production credentials, Search Console, or any
purchase. None was provisioned, requested, or configured.

---

## 24. Success criteria

| Criterion | Status |
| --- | --- |
| Public website works correctly | ✅ |
| Admin panel works correctly | ✅ |
| Authentication / authorization correct | ✅ |
| Consent enforcement correct | ✅ |
| Public data isolation intact | ✅ |
| Enquiry handling correct | ✅ |
| Phase 10 security guarantees intact | ✅ 245/245 |
| **Mobile navigation works in production** | ✅ **fixed — QA-4** |
| Admin nonce CSP works across supported browsers | ✅ Chrome + Edge; Safari deferred |
| Accessibility passes the defined checks | ✅ (screen reader deferred) |
| Responsive layouts work across realistic viewports | ✅ 9 widths |
| No critical UI/UX or functional defects remain | ✅ |
| No security regressions | ✅ |
| Performance measured honestly | ✅ §11 |
| Phase 9 mobile concerns re-tested | ✅ reproduced and re-attributed |
| Teacher workflow tested end to end | ✅ 105 checks, 2 browsers |
| No fake institute data introduced | ✅ |
| Database returned to zero content rows | ✅ |
| No production credentials introduced | ✅ |
| Launch switch remains false | ✅ |
| All fixes have regression tests | ✅ |
| Full regression suite passes | ✅ |
| Git tree clean, committed, pushed | ✅ |

---

## 25. Recommendation for Phase 12 — Import / data tooling

The institute has no content yet, and everything in this project has been
verified against synthetic fixtures. Phase 12 should build the path from what
the teacher actually has — almost certainly a spreadsheet of results — to what
the database needs, with the consent model intact.

Suggested scope: a bulk import that **cannot** create a published record without
a consent reference; a dry-run that reports what would change before anything
does; clear per-row errors a teacher can act on ("row 14: no consent reference,
skipped"); and an export, because data you cannot get out is data you do not
own. Remove the dead `ResultRecord` model while touching the schema.

The single most useful thing Phase 12 could add is a **preview of the import**
that shows exactly which students would become publicly visible and why —
because that is the moment when a mistake becomes a published photograph of a
child.

---

**PHASE 11 COMPLETE — PHASE 12 NOT STARTED.**
