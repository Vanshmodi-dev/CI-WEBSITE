# Phase 16 — Real content and media CMS surfaces

**Date:** 26 August 2026
**Baseline:** Phase 15 working tree (uncommitted), `a3f7632` + Phase 15 changes
**Status:** IN PROGRESS. The final verdict is at the foot of this document and
is not written until every topic below is either complete or explicitly
recorded as not completed.

---

## 0. Implementation map

Written **before** any Phase 16 code, from the documents and source listed
below. Its purpose is to stop this phase inventing a parallel architecture when
the project already decided the answer.

### Documents reviewed

`docs/brief/01-master-directive.md` §16 (faculty), §17 (reviews), §20 (YouTube)
· `docs/brief/02-vision-brief.md` · `docs/MASTER-PLAN.html` §13 (Review Engine),
§14 (YouTube), §15 (Location & Maps), §19 (security headers), §22 (absent
content) · `docs/design/STUDENT-DATA-POLICY.md` · `docs/COST-AND-INFRASTRUCTURE.md`
("Photo storage — the decision") · `docs/PHASE-12-REPORT.md` (CHECK constraint
loss) · `docs/PHASE-13-REPORT.md` + `deployment-contract.ts` ·
`docs/PHASE-14-FINAL-AUDIT.md` · `docs/PHASE-15-REPORT.md` ·
`docs/PHASE-7-CONTENT-MANAGEMENT-MATRIX.md` · `.env.example` · `next.config.ts`
· `src/proxy.ts`.

**The Review Engine repository itself was read**, at
`../tp-reviews-engine`: `schemas/payload.v1.schema.json`,
`frontend/SAFETY.md`, `frontend/recipes/nextjs-app-router.md`,
`examples/static/reviews.json`.

### What the project already decided, and which this phase must not re-decide

| Question | The existing decision | Where |
| --- | --- | --- |
| Reviews storage | **Never copied into our Postgres.** The engine is the backend; it publishes `reviews.json` and we fetch it server-side, revalidate 6h | Master Plan §13 |
| Review structured data | `schema_org` stays **disabled** — marking up another platform's reviews as first-party risks a manual action | Master Plan §13 |
| Review rendering | Our own components, the engine's **safety discipline**: text as text, never HTML | §13 + `frontend/SAFETY.md` |
| YouTube call | `playlistItems.list` (1 quota unit), never `search.list` (100) | Master Plan §14 |
| YouTube embed | No iframe until click, then `youtube-nocookie.com` | §14, already in CSP |
| Map | Embed loads **on interaction**, not eagerly | Master Plan §15 |
| Allowed image formats | `jpg/jpeg, png, webp, avif`. **SVG forbidden** | `isSafePhotoPath()` |
| Upload requirements | magic-byte validation, re-encode, randomised filenames, ~2 MB cap, dimension cap, **delete file when record is deleted** | COST-AND-INFRASTRUCTURE |
| Production media storage | Vercel Blob **recommended, not provisioned** | COST-AND-INFRASTRUCTURE |
| Consent scope | toppers, results, student stories, **and gallery photographs** | STUDENT-DATA-POLICY |
| Faculty consent | **Not covered by the policy.** Its stated scope is students | STUDENT-DATA-POLICY line 4 |
| Migrations | Additive only. Never regenerate — Phase 12 lost 28 CHECK constraints silently | PHASE-12 P12-A |

### What already exists and must be reused, not rebuilt

| Primitive | Location | Used by |
| --- | --- | --- |
| Closed CMS registry | `src/config/site-content.ts` | Topics 4, 10, 11 |
| Resolved content reader | `src/lib/site-content.ts` | Topics 4, 10, 11 |
| Stale-edit guard | `src/lib/stale-edit.ts` | Topics 4, 6, 8, 9 |
| Photo path validator | `isSafePhotoPath()` in `src/lib/validation.ts` | Topic 5 |
| Record id shape check | `isValidRecordId()` | every mutation |
| Audit log | `recordAudit()` in `src/lib/auth.ts` | every mutation |
| Auth | `requireAdmin()` / `requireAdminOrNull()` | every surface |
| Revalidation | `src/lib/revalidate-public.ts` | Topics 6, 8, 9 |
| Burst limiter | `src/lib/burst-limit.ts` | Topic 5 uploads |
| Admin UI kit | `src/components/admin/ui.tsx` | every admin surface |
| Field primitives | `src/components/primitives/field.tsx` | every form |
| Deployment contract | `src/lib/deployment-contract.ts` | every new table/route |

### CSP already anticipates this phase

`next.config.ts` already permits exactly what these topics need and **nothing
more**. This phase adds no new origin:

```
img-src   'self' data: blob: https://i.ytimg.com
frame-src 'self' https://www.youtube-nocookie.com https://www.google.com
```

`/admin` runs under a stricter nonce + `strict-dynamic` policy from
`src/proxy.ts`. Neither policy is weakened by this phase.

### Topic-by-topic plan

| # | Topic | Approach | New table? |
| :-: | --- | --- | :-: |
| 4 | Click-to-edit preview | Extend the registry with a declared **public rendering location** per key, and *test* that the declaration is true. Edit in a dialog. No second renderer, no framing (the site sets `frame-ancestors 'none'` and that is not being weakened). Adds the stale-edit guard the CMS lacks. | no |
| 5 | Media upload | Storage **abstraction** with a local adapter for development and an explicit, unimplemented production boundary. Magic-byte sniffing, dimension caps, generated identifiers. | yes |
| 6 | Faculty | New model. Consent **not** required by the policy — documented explicitly, not invented. Photos via Topic 5. | yes |
| 7 | Reviews | Server-side fetch of the engine payload + defensive normaliser + local fixture. **No credentials invented, no fake sync.** | no |
| 8 | Gallery | New model. **Consent required** — the policy names gallery photographs. | yes |
| 9 | Videos | Validated YouTube ID/URL only. Click-to-load `youtube-nocookie` embed. | yes |
| 10 | Map | CMS fields + validated Google Maps reference. Embed on interaction. | no |
| 11 | Inventory | Machine-readable, derived from the registry's declared locations. | no |
| 12 | Admin UX coherence | Regroup navigation over what is actually implemented. | no |

---

---

## Topic 4 — Click-to-edit website preview · **COMPLETE**

### Acceptance criteria, written before implementation

| # | Criterion | Result |
| :-: | --- | :-: |
| 1 | Every registered field declares one public render location, and a test proves the key is *actually read* by source serving that route | PASS |
| 2 | The preview shows live values from the same `getSiteContent()` the public site uses | PASS |
| 3 | Only registered fields are editable; code-owned content is shown and labelled, with no editor | PASS |
| 4 | Save → a **logged-out** visitor sees the change | PASS |
| 5 | Cancel changes nothing | PASS |
| 6 | Invalid input refused, nothing persisted | PASS |
| 7 | An unknown key, and a real key from another group, are both refused | PASS |
| 8 | A stale edit cannot overwrite a newer change | PASS |
| 9 | Unauthenticated and cross-origin posts do not mutate | PASS |
| 10 | An XSS payload renders as escaped text and does not execute | PASS |
| 11 | Public rendering and every existing suite still pass | PASS |

### The design decision that shaped this, and what it cost

The obvious build is an iframe of the live site with edit handles floating over
it. **That was rejected, and the reason is a security property this phase may
not weaken:** `next.config.ts` sends `frame-ancestors 'none'` and
`X-Frame-Options: DENY`. Framing our own site means relaxing both, sitewide, so
that an admin screen can look nicer. Clickjacking protection is worth more.

The other obvious build — re-implementing the public pages inside the admin so
they can be annotated — is the "second rendering implementation that can drift"
the brief warns against, and drift here is not cosmetic: it would tell a teacher
their edit appears somewhere it does not.

So the preview lists **the same values the public site is serving**, read
through the same `getSiteContent()`, grouped by the page and section each field
declares, with a link out to each real page. What stops the grouping going stale
is that the declaration is *data with a test behind it* rather than a comment:

- every declared route must exist on disk as a `page.tsx`
- every key must be **read by something outside the registry** — verbatim, or
  through a named reader (`getContactBlock`, `navKeyFor`, `getFooterNav`, or the
  course-page template). That test found a real gap on its first run: course
  description keys are generated from a template, so the literal key appears
  nowhere, and the family had to be declared explicitly rather than skipped.

What cannot be edited is **named on the page, with the reason** — six entries
under "Set in the code, on purpose". A CMS that silently omits things teaches
the reader that anything unmentioned is impossible.

### Defects found and fixed

| # | Kind | Defect | Fix |
| :-: | --- | --- | --- |
| D16-1 | **Application** | The Website Editor had **no stale-edit guard at all**. Every student and story form has had one since Phase 14; the CMS shipped in Phase 15 without one, so two tabs meant the second save silently discarded the first. | `contentToken()` in `src/lib/stale-edit.ts` — the latest `updatedAt` across the keys a save will touch, compared inside the transaction. Empty token + existing rows = refused. Six unit tests. |
| D16-2 | **Application** | *"Clearing a box is a safe undo"* was documented, implemented in `resolveContent`, promised in the editor's own help text — and **unreachable**, because `validateValue` refused an empty value on required fields. The two halves of Phase 15's CMS contradicted each other. | Empty is now allowed everywhere and means one of two things: blank on a blankable field, revert-to-code-default on the rest. Neither can blank the public site. Regression test asserts it for **every** required field. |
| D16-3 | **Application** | `aria-required` was set on fields that can legitimately be emptied — telling a screen-reader user the form could not be submitted without them, which was untrue. | `required={false}`, with the meaning moved into the visible hint. |
| D16-4 | **Application (markup)** | An inline link inside a `Notice` sat in a `<div>`, not a `<p>`, so WCAG 2.5.8's inline exception did not honestly apply to an 82×20 target. | Wrapped the prose in a real `<p>`. Padding an inline link to 24px would have broken the line it sits in. |
| D16-5 | **Application** | `setState` inside an effect to close the dialog — React's own lint rule rejects it, and it would flash the success state after paint. | Open state is **derived** from which action-state the dialog was opened against, the same trick `site-header.tsx` uses against the pathname. |

### Test-harness defects found and fixed

These are recorded separately because none of them was a fault in the product,
and three of them were **passing for the wrong reason**, which is worse than
failing.

| # | Harness defect | Why it mattered | Fix |
| :-: | --- | --- | --- |
| H16-1 | The new suite read the session cookie with `document.cookie`. The admin cookie is `httpOnly`, so it read **empty** and every "authenticated" replay was anonymous. | The negative checks ("an unauthorised write is refused") passed *because nothing was ever written*. A suite that cannot tell those two apart is worse than no suite. | Added `cookieHeader()` to `scripts/browser.mjs`, reading the browser's cookie jar via CDP. |
| H16-2 | `verify-revalidation.mjs` asserted a freshly published announcement appears in the homepage banner. | The banner shows the **highest-priority** live announcement; the admin form has no priority input, and the ZZSHOW demo dataset seeds one at priority 10. The suite reported a revalidation failure that was not happening. | Measured first: the message never appeared in 20 requests over 10s (ruling out a race), and reproduced identically at commit `4b8b220` in a clean worktree (ruling out a regression). The suite now raises priority and re-saves **through the admin form**, so the revalidation under test is a real publish. |
| H16-3 | `verify-integration.mjs` asserted `!html.includes('88%')` after editing a mark to 93%. | An unrelated ZZSHOW result legitimately scores 88%. The page was right; the assertion read every card and blamed ours. | Scoped to our own `<article>` via a `cardContaining()` helper. |
| H16-4 | The same suite asserted the `/results` and `/stories` empty-state wording unconditionally. | With 36 published demo results, the populated state is correct. | Both branches are now tested; the suite asks the database which applies. |
| H16-5 | My first touch-target check invented a stricter rule than `verify-ux.mjs` applies. | It flagged a correctly-implemented 1×1 skip link. Two suites disagreeing about the same standard is how a rule stops being believed. | Copied the two WCAG 2.5.8 exceptions verbatim from the public suite. |

### An honest note on cache propagation

`revalidatePath` marks an ISR page stale; it does not rebuild it inline. The
first anonymous request after a save can occasionally be served the previous
render. Phase 16 saw exactly that once — one assertion said an edit was not
public, the next, ~300 ms later, said it was.

Asserting on a single request measures that race rather than the product;
asserting with no bound would hide a genuinely broken revalidation forever. So
`verify-cms.mjs` polls a **small fixed number of times and prints the count**:
every post-save check currently reports *"after 1 anonymous request(s)"*. A
value that starts needing three or four is a regression worth seeing, and it
stays visible instead of being smoothed away.

### Verification

Production build, real PostgreSQL 18.4, ZZSHOW demo dataset seeded, admin
driven through a real browser, public pages fetched anonymously.

| Suite | Result | Before Topic 4 |
| --- | ---: | ---: |
| Unit | **324** | 323 |
| CMS (`verify:cms`) | **71** | 21 |
| Security | **262** | 262 |
| SEO | **335** | 335 |
| Real-browser UX | **249** | 249 |
| Integration | **67** | 62 + 3 failing |
| End-to-end | **62** | 62 |
| Public isolation | **46** | 46 |
| Revalidation | **10** | 8 + 1 failing |
| Import / export | **116** | 116 |
| Teacher workflow | **121** | 121 |
| Consent constraints | **43** | 43 |
| Typecheck · Lint | clean · clean | clean |

**Responsive:** no horizontal overflow at 320 / 360 / 375 / 390 / 412 / 430 /
768 / 1024 / 1280 px. The editor opens, fits and is operable at 320 px.

**Accessibility, tested by interaction rather than asserted:** the dialog is a
real `<dialog>` opened with `showModal()`, so focus moves into it and the page
behind is inert — verified by checking `document.activeElement` is inside it,
not by reading an ARIA attribute. Escape closes it via a **real key press**
through the browser, not a synthetic `KeyboardEvent`, because `<dialog>` closes
on Escape by browser behaviour and that is the thing worth confirming. The
dialog is named via `aria-labelledby`, and its control has a real `<label for>`.
Every touch target meets 24×24 under the two WCAG 2.5.8 exceptions.

**NOT TESTED:** screen readers. No screen-reader environment exists here, and
no claim of screen-reader compatibility is made.

### Database and contract

No schema change. No migration. No new route (`/admin/preview` and
`/admin/website` both already exist and are already in the deployment
contract). `verify:constraints` reports **43 passed** — all 21 hand-written
CHECK constraints intact.

---

## Topic 5 — Media upload · **COMPLETE**

Full detail in [`PHASE-16-TOPIC-5-MEDIA.md`](PHASE-16-TOPIC-5-MEDIA.md):
inventory, threat model (23 threats + 1 accepted risk), storage decision,
pipeline, consent boundary, deletion semantics, caching, test results.

**Summary.** A teacher now chooses a photograph with a button instead of typing
`/photos/example.jpg` and asking a developer to put the file there. Uploads are
judged by their BYTES — never by filename, extension or browser MIME — decoded,
and **re-encoded**, which is what defeats polyglots and strips EXIF/GPS. The
stored key is `sha256(output)`, so a different image is always a different URL
and replacement can never be served from cache.

**Storage is honest:** local disk for development, and a production adapter that
**refuses to run** on a host that discards its filesystem, because a photograph
that uploads, displays, and vanishes on the next deploy is worse than one that
refuses. **Media is not production-ready and is not claimed to be.**

| Defect | Kind | Fix |
| --- | --- | --- |
| D5-1 | **Application, pre-existing** | `admin/stories/actions.ts` wrote `photoUrl` with **no path validation at all**, while the students action had validated it since it was written. Nothing downstream compensated. Fixed + regression test. |
| D5-2 | **Application, pre-existing** | The read path gated the photo on consent but never re-checked the path shape, so an already-poisoned row would reach `next/image`. Second, independent line added. |
| D5-3 | **Application, mine** | Store selection keyed on `NODE_ENV === 'production'`, which `next start` sets — so every legitimate upload failed against a local production build. Now keys on host-set platform variables. |
| D5-4 | **Application, mine** | A file above the framework body limit rejected the request before the action ran, the promise rejected uncaught, and the control sat on "Uploading photo…" forever. Added a catch and a client-side size pre-check. |
| D5-5 | **Application, mine** | A pixel bomb was refused with "it may be damaged" — wrong advice for a genuinely large photo. The decoder's own limit is now distinguished and answered accurately. |
| D5-6 | **Application, mine** | `looksLikeSvg` read nothing from files shorter than 256 bytes, so a small SVG got the generic message instead of being named. |
| D5-7 | **Test rule** | `P-ROUTE-05` demanded an origin check on *every* route handler, including a read-only public image endpoint that must be cross-origin fetchable. The exemption is now tied to the **deployment contract** (`mutates: false, requiresAuth: false`, no mutating verb), so it cannot be bypassed by adding a file. |

| Harness defect | Why it mattered |
| --- | --- |
| H5-1 | The upload helper read the status line **before** the new upload started, returning the previous result. The rate-limit section made "75 attempts in 3 seconds" and concluded the limiter was broken. Fixed with a sentinel. |
| H5-2 | Setting the same file on an input that already holds it fires no `change`, so no upload happens. |
| H5-3 | Removing the `role="alert"` node broke React's reconciliation, so an identical repeat error never reappeared and the helper waited forever. |
| H5-4 | Two fixtures had **identical bytes**, so they deduplicated and their hostile filenames were never stored — the label-sanitisation assertions were reading somebody else's filename. |
| H5-5 | The suite was not idempotent: a crashed run left rows, so the control upload deduplicated and every "nothing was stored" assertion passed vacuously. |
| H5-6 | Two traversal probes return 308 (framework path normalisation) before any handler runs; asserting on the first response reported a failure for a request refused one hop later. |
| H5-7 | A label assertion named "no path separator" also rejected `..`, failing on correctly-sanitised output. |

**Also raised:** the upload rate limit from 30 to 60 per 5 minutes. Thirty was
chosen by eye and a teacher entering a class of thirty students with photographs
would hit it during normal work — a limit the intended user meets is an
obstacle, not a control.

---

## Topic 6 — Faculty · **COMPLETE**

Full detail in [`PHASE-16-TOPIC-6-FACULTY.md`](PHASE-16-TOPIC-6-FACULTY.md).

**Faculty did not exist** — no model, no route, no component, no static content.
It is now a real content surface: admin CRUD, a public `/faculty` page, a
homepage band, photographs through the Topic 5 picker, and a draft state.

**This reverses Master Plan Decision 03** ("course and faculty pages stay typed
content in the repo"), on the owner's instruction, and keeps its reasoning by
splitting where the decision did not: the **data** is in the database, the
**design** stays a typed React component. No layout field, no HTML field.

**Consent is stated honestly.** The data policy is scoped to students and says
nothing about staff, so no consent column was invented. What is guaranteed
technically is that nothing is public until published; whether the institute
holds each teacher's permission is recorded as a **human decision**, and the
admin says so in plain words without asserting law.

**No `Person` structured data and no per-teacher pages** — both would require
credentials nobody has verified, against the directive's "only publish verified
information".

**130 checks**, 0 failed. Five harness defects found and fixed, including two
vacuous passes: a card-semantics check that passed because there were zero
cards, and a public-page assertion written against a record created through
Prisma, which fires no revalidation.

---

## Status of the remaining topics

**Not started. Not claimed.**

| # | Topic | Status |
| :-: | --- | --- |

| 7 | Reviews / Review Engine | NOT STARTED — design settled during inventory (§0) |
| 8 | Gallery | NOT STARTED |
| 9 | Videos | NOT STARTED |
| 10 | Map | NOT STARTED |
| 11 | Complete information inventory | NOT STARTED |
| 12 | Admin UX coherence | NOT STARTED |

## Final verdict

**NOT COMPLETE.** Topics 4, 5 and 6 are finished and verified; Topics 7-12 are
not begun. No Phase 16 completion is claimed.
