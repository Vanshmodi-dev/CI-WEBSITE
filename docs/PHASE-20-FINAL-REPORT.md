# Phase 20 — Final gap closure and launch readiness

**Date:** 28 August 2026
**Preceding commit:** `9f9faeb` (Phase 19)

---

## 1. Complete product status

The application is **code-complete against the blueprint**, and this phase
closed the last documented gap between the brief and the build: two homepage
bands that both source documents ask for and that nobody could build, because
every example value in them is a claim only the institute can confirm.

**It is not launch-ready**, and the reasons are unchanged and external: a
storage bucket nobody has opened, seven institute facts nobody has confirmed,
and a Review Engine that needs Google credentials only Commerce Insight can
grant. No amount of engineering moves those.

---

## 2. Features complete

Public site (13 routes), admin (14 destinations, 8 CRUD entities), the editable
content registry (**118 fields**), click-to-edit preview, media pipeline with
content-addressed storage and an S3/R2 adapter, consent-gated publishing,
import/export, SEO and structured data, the launch switch, the deployment
pre-flight, and 24 verification suites.

## 3. Features partially complete

| Feature | State |
| --- | --- |
| **Trust bar / why-us bands** | Built this phase. Mechanism complete, **content empty by design** — they do not render until the institute supplies figures and pillars |
| **Review Engine** | Consumer complete and contract-verified against the engine's own file. Engine is `enabled: false`; activation needs Google credentials |
| **R2 storage** | Adapter complete, 49 assertions, mock-verified. **No real provider call has ever been made** |

## 4. Missing features — and why

| Blueprint item | Status |
| --- | --- |
| **Resources page** (§24, §28) | **Absent, correctly.** The directive makes it conditional: "if Commerce Insight actually provides useful educational resources… Do not build complex functionality unless there is an actual business need." No such resources have been supplied. **Owner decision required** |
| **FAQs** (§43) | **Absent, correctly.** §43 lists content types to model as data; there is no FAQ content to model. **Owner decision required** |
| `/toppers`, `/students`, `/enquiry` as separate routes (§7) | **Deliberately combined** into `/results`, `/stories`, `/admissions`, which §7 explicitly permits |
| About sub-pages (§7) | **Deliberately one page.** Its two section headings became editable in Phase 19 |

Neither Resources nor FAQs was recorded anywhere before this phase — not in
code, not declined in any report. They were silent omissions. They are now
written down, which is the difference between a decision and an oversight.

---

## 5. Bugs found · 6. Bugs fixed

**One product gap, closed.**

### G20-1 — the two bands the blueprint asks for twice

§9 and §10 of the master directive describe a credibility strip and a why-us
band; §50 puts both in the homepage flow. The vision brief repeats them as
Sections 2 and 3 with example content — "5000+ Students", "18+ Years
Experience", "Doubt Support" — and both documents attach the same condition, in
the client's own words: *"Fake numbers bilkul nahi"* and *"actual offerings sir
se verify."*

Every example is exactly the kind of figure the previous site invented. So the
bands could not be written into the page, and the credibility strip's absence
was recorded in `page.tsx`. **What was never done was the other half of §9:**
*"the UI should be designed so these values can be dynamically updated later."*
There was no mechanism at all — the day the institute confirmed a number,
showing it would have needed a developer. The why-us band had no implementation
**and no recorded decision** at all.

**Closed by 15 editable fields that ship empty.** The homepage renders exactly
what it rendered before: nothing where these bands would go. A band appears only
when a human has typed complete content, and the fallbacks are empty on purpose
so nobody can "helpfully" seed them with the brief's illustrations.

Verified through the real editor, six states:

```
nothing supplied            → no band
a number with no label      → no band          (an unverified figure cannot leak)
a completed pair            → the band appears
a heading with no points    → no band
a heading plus one point    → the band appears
everything cleared          → back to nothing
```

**No application defect was found in this phase.** Nineteen were found and fixed
across Phases 18 and 19; this phase looked hard and found the product gap above
instead. Three things that *looked* like defects were reproduced and turned out
not to be — recorded in §16 so nobody re-finds them.

---

## 7. Security status — PASS

`verify-security` 262/0, plus a fresh adversarial pass this phase against
angles the suites did not cover:

| Probe | Result |
| --- | --- |
| Open redirect (`?next=`, `?redirect=`, `?returnTo=`, protocol-relative) | **Not honoured.** Logout always returns to `/admin/login` |
| Host-header poisoning | **Canonical stays `NEXT_PUBLIC_SITE_URL`**, never derived from `Host` |
| Error leakage on bad ids, null bytes, traversal | No stack traces, no paths, no Prisma internals |
| `/media/../../etc/passwd` | 404 |
| Security headers | CSP, `X-Frame-Options: DENY`, `nosniff`, referrer policy, HSTS, permissions policy — all present |
| Raw POST to the enquiry form ×6 | 200 (the page), **0 enquiries created** — the action is never invoked without its identity |
| Export endpoints, anonymous | 307 to login |
| Export contents | No password hashes, no `ipHash`, no internal ids, no tokens |

## 8. Accessibility status

Structural and automated checks pass: landmarks, heading order, labels, dialog
semantics, focus, skip link, touch targets, and **contrast in both colour
schemes** (Phase 19 found dark-only coverage; light is now measured too).

**NOT TESTED — HUMAN REQUIRED: a real screen reader.** Procedure: NVDA or JAWS
on Windows, or VoiceOver on macOS. Tab through `/`, `/contact`, `/admissions`
and `/admin/preview`; confirm each landmark is announced, the enquiry form's
errors are read on submit, the edit dialog traps and restores focus, and the
photo picker announces its name and options.

## 9. Performance status — PASS

`verify-budget` **122/0**, measured against a **populated** database. Every
public route: 15–16 load-critical requests, ~300 KB, exactly one eager image
(the logo), the rest deferred. Phase 19 corrected the metric that had been
counting lazy images; nothing was relaxed to reach green.

## 10. SEO status — PASS

`verify-seo` 418/0. Titles, descriptions, canonicals, sitemap, robots and
structured data all verified; the JSON-LD carries the institute's edited email
and social links (fixed in Phase 19) so the machine-readable copy matches the
page. Pre-launch `noindex` intact; the launch switch is **off**.

## 11. Storage status — CODE COMPLETE, PROVIDER UNTESTED

`verify-storage` 49/0 against a strict mock that refuses unsigned requests;
`verify-media` **142/0** covers the whole lifecycle including the four-consumer
delete guard and photo replacement releasing the old object. No secret reaches
a client bundle; a half-configured deployment is refused rather than falling
back to local disk.

**`P-MEDIA-05` reports NOT TESTED deliberately** — whether credentials work
cannot be known without a live call.

## 12. Review Engine status — CONSUMER COMPLETE, ACTIVATION EXTERNAL

Inspected `../tp-reviews-engine` directly this phase.

- Client config is a **ready-to-activate template**: `_`-prefixed (kept out of
  the registry), `enabled: false`, every value `REPLACE-…`. Inert twice over.
- **Verified: the engine's published example still violates its own schema** —
  `reviews[].id` is 64 hex characters against a declared `^[0-9a-f]{32}$`, and
  `owner_reply` carries an extra `date_precision`. This is a defect **in the
  engine's documentation**, outside this repository, and worth reporting to
  whoever maintains it: anyone writing a strict consumer would break.
- **This site's consumer accepts that real example, 5 reviews of 5.** The
  defensive-normalisation stance is correct and now proven against the engine's
  actual file rather than a copy of it.
- New cross-repo drift test (`tests/reviews.test.ts`): when the engine is
  present, its example is fed through the real normaliser and its
  `schema_version` is checked against the one this consumer supports. When the
  engine is absent the test **says so** rather than passing silently.

## 13. Human actions required

### A. Code work remaining
**None.** No known application defect is outstanding.

### B. Human action required

| # | Action | Who | Blocks launch | Evidence to mark complete |
| --- | --- | --- | :-: | --- |
| B1 | Confirm the 7 institute facts (`P-LAUNCH-08`): email, Google Business Profile URL, place ID, coordinates, YouTube, Instagram, legal entity name | Institute | **Yes** | `verify:preflight` shows `P-LAUNCH-08` passing |
| B2 | Supply the trust-bar figures, or decide there will be none | Institute | No | Figures visible on `/`, or a written decision to leave the band off |
| B3 | Supply the why-us pillars, or decide there will be none | Institute | No | Same |
| B4 | Decide whether a Resources page is wanted (§24) | Institute | No | A written decision either way |
| B5 | Decide whether FAQs are wanted (§43) | Institute | No | A written decision either way |
| B6 | Name who handles a takedown request (`F8`, `F9`) | Institute | **Yes** | A named person, and they have read §"The takedown procedure, exactly" |
| B7 | Answer the retention questions (`F3`–`F5`) | Institute | **Yes** | Numbers written into the checklist |
| B8 | Read every page for accuracy and tone (`G1`–`G3`) | Institute | **Yes** | Sign-off |

### C. External service required

| # | Action | Blocks launch | Evidence |
| --- | --- | :-: | --- |
| C1 | Cloudflare account + R2 enabled. **A payment card is required even on the free tier** | **Yes**, for photographs | Bucket exists, private |
| C2 | Private bucket, token scoped to that one bucket, four `MEDIA_S3_*` variables set | **Yes**, for photographs | `P-MEDIA-01`…`04` pass |
| C3 | **One real upload through Admin → Photos** | **Yes**, for photographs | The photograph appears. This is the only thing that can retire `P-MEDIA-05` |
| C4 | Bucket versioning or retention | No | Enabled — `pg_dump` does **not** back up photographs |
| C5 | Review Engine: Google Cloud project, OAuth client, refresh token from Commerce Insight, `location_name`, `expected_name`; then rename the config and set `enabled: true` | No — the site degrades honestly without it | A payload URL that returns 200 and reviews on `/reviews` |
| C6 | Domain and hosting account | **Yes** | Site reachable at the real domain over https |

### D. Manual device test required

| # | Test | Why |
| --- | --- | --- |
| D1 | Photo field on a real Android and a real iPhone | `capture="environment"` hands the choice to the OS. Markup and pointer-based surfacing are verified; the device path is not |
| D2 | Firefox, Safari/WebKit | Not installed here. Check layout at 320/360/390/768/desktop, the edit dialog, and the photo picker |
| D3 | A real screen reader | See §8 for the exact procedure |

### E. Optional / post-launch
Resources page, FAQs, the §44 future list (student login, payments, blog…) —
all explicitly *"DO NOT build all of these now"*.

## 14. Manual tests required
D1–D3 above, plus B8's content read-through.

## 15. Launch blockers
**B1, B6, B7, B8, C1, C2, C3, C6.** Photographs cannot be uploaded durably
until C1–C3; the site itself works without them and refuses uploads with an
explanation rather than losing them.

`P-DB-12` (demo data present) is a deploy-time step, not a defect: cleared, the
pre-flight reports **65/0, `BLOCKED: false`**.

## 16. Non-blocking items — three things that looked like defects and were not

Recorded so nobody re-finds them:

1. **The consent checkboxes on the results and stories forms have no `id`.**
   The shared `Checkbox` primitive wraps the input in its label, so no
   `id`/`htmlFor` pairing is needed for accessibility. Only `name` is stable
   across all forms — which is what `verify-consent` now selects on.
2. **A photograph's bytes survive consent withdrawal.** Withdrawal removes it
   from every page; the object stays addressable at its content-hash URL until
   deleted in the library. That is a design property, not a leak — but a parent
   asking usually means the bytes too, so the **exact two-step procedure is now
   documented** in the human checklist.
3. **`verify-teacher` failed once with "Inspected target navigated or closed"**
   and passed 123/0 on re-run. A CDP race in the harness — an eval awaited
   across the sign-out navigation — not an application defect. Same class as the
   one Phase 19 hit.

## 17. Post-launch items
Search Console, the live Review Engine (C5), Resources/FAQs if wanted, and the
§44 roadmap.

---

## 18. Exact deployment checklist

1. **Clear the demo data.** `npm run seed:demo:clean`, then confirm
   `npm run verify:preflight` reports `BLOCKED: false`.
2. Provision Postgres; set `DATABASE_URL`.
3. `npm run db:migrate`. Confirm **43 CHECK constraints** with `npm run db:inspect`.
4. Create the admin account: `node scripts/create-admin.mjs "<email>" "<name>"`.
5. Set `NEXT_PUBLIC_SITE_URL`, `ADMIN_SESSION_SECRET`, `ENQUIRY_SECRET`.
6. Provision R2 and set the four `MEDIA_S3_*` variables (C1–C2).
7. `npm run verify:preflight` — everything must pass except `P-MEDIA-05`.
8. Deploy. Upload one photograph through Admin → Photos (C3).
9. Institute confirms the 7 facts (B1), then set `SITE_IS_LAUNCHED = true`.
10. `EXPECT_PRELAUNCH=0 npm run verify:production` — 25/0.
11. Enable bucket retention (C4). Schedule `pg_dump`.

---

## 19. Test totals

| Suite | Result |
| --- | --- |
| unit | **558 / 0** (was 554; +4 cross-repo engine contract) |
| seo | 418 / 0 |
| ux | 346 / 0 |
| **admin** | **342 / 0** — all **118** registry fields reach their public route |
| security | 262 / 0 |
| videos | 232 / 0 |
| reviews | 224 / 0 |
| gallery | 219 / 0 |
| map | 156 / 0 |
| media | 142 / 0 |
| faculty | 132 / 0 |
| **budget** | **122 / 0** |
| teacher | 123 / 0 |
| import | 116 / 0 |
| **cms** | **98 / 0** (was 89; +9 band behaviour) |
| integration | 67 / 0 |
| admin-ux | 66 / 0 |
| e2e | 62 / 0 |
| storage | 49 / 0 |
| public | 46 / 0 |
| constraints | 43 / 0 |
| **consent** | **19 / 0** — new suite |
| revalidation | 10 / 0 |
| production (pre-launch) | 25 / 0 |
| preflight | 64 pass, 1 fail — `P-DB-12`, demo data, by design |

**Tests added this phase:** `scripts/verify-consent.mjs` (19), `verify-cms` §9b
(9), 4 cross-repo engine-contract tests, and companion-seeding in `verify-admin`
so the 15 new fields are genuinely proved rather than skipped.

**Negative controls run and observed to fail correctly:** the band rule (relax
the completeness filter → the exact assertion fires), the engine drift check
(bump `SUPPORTED_SCHEMA_VERSION` → fires with its own message), and the
registry's reader-family check (template-literal reads were caught immediately).

**Database:** 15 tables, 7 enums, **43 CHECK constraints**. No schema change, no
migration touched, no dependency added. Two constraints refused deliberately
malformed test rows during this phase — `toppers_published_at_set` and
`toppers_published_requires_consent` — which is the integrity layer working.

---

## 20. Final recommendation

**Ship the engineering. Do not call it launched.**

The build is finished and honest: nothing on the public site claims anything the
institute has not confirmed, the admin can change every value the architecture
intends to be changeable, and the one privacy promise that will actually be
tested — *"please take my child's photograph down"* — works in seconds and is
now written down as a procedure rather than assumed.

What stands between this and a live website is not code. It is a bucket, a
domain, seven confirmed facts, a named person for takedown requests, and the
institute reading its own pages. Those are listed above with the evidence each
one needs.

**Do not set the launch switch until B1, B6, B7, B8 and C1–C3, C6 are done.**
The switch is off, and it should stay off until somebody can point at each of
those and say it is finished.
