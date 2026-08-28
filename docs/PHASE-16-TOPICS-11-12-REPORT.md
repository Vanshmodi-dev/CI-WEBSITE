# Phase 16 — Topics 11 & 12

**Admin UX coherence, and complete owner control of website content**

Date: 28 August 2026
Launch switch: **OFF** (`SITE_IS_LAUNCHED = false`)
Database: local `commerce_insight_test`, demo dataset (`ZZSHOW`) present, no real institute data

---

## 1. Executive summary

Topic 11 asked whether the admin panel is one product or several. Topic 12 asked
whether the institute can change its own website. Both were answered by
measurement rather than by reading the previous reports, and both turned up
things the previous reports had wrong.

**Nine defects were found and fixed.** Two are serious:

- **Faculty, gallery and videos deleted a record on ONE click with no
  confirmation of any kind**, while four other entities asked first and a fifth
  used a different mechanism again. Three destructive-action patterns in one
  admin, and the newest three surfaces had the worst of them. Reproduced in a
  real browser with a positive control before anything was changed.

- **Editing a page heading never reached that page.** The website action chose
  which caches to clear from a hand-written chain of `if`s whose fallback was
  `['/']`, so every field in a group added later silently revalidated the
  homepage instead of the page it belonged to. The same list was already missing
  `/faculty` and `/reviews` — both ISR-cached, one for six hours — so correcting
  the institute's phone number left the old one on those two pages. That half
  was **pre-existing since Topic 7** and nothing had caught it.

**Topic 12 took the registry from 49 editable fields to 96.** Every page heading,
the sentence under it, the closing invitation on nine pages, seven homepage
section headings, the institute's email address and its two social links are now
owner-editable. All 96 are proved end-to-end: written through the real admin,
then read back from the public page as a logged-out visitor.

**One thing this phase did not do is invent infrastructure.** Production object
storage is still not provisioned and remains a launch blocker. What changed is
that `docs/COST-AND-INFRASTRUCTURE.md` now describes the media system that
actually exists — it had been describing the Phase 7 state, claiming the teacher
"cannot upload", for three topics after upload was built.

**Nothing is committed.** Both topics are complete, but the commit rule for this
phase says one commit covering both, and that is left for your instruction.

---

## 2. Inventory

### Admin routes (34 files, 21 addressable routes)

| Route | Purpose |
| --- | --- |
| `/admin/login` | Sign in |
| `/admin/logout` | Sign out (POST only) |
| `/admin` | Dashboard |
| `/admin/enquiries`, `/admin/enquiries/[id]` | Enquiries received |
| `/admin/students`, `/new`, `/[id]` | Results |
| `/admin/stories`, `/new`, `/[id]` | Student stories |
| `/admin/faculty`, `/new`, `/[id]` | Teachers |
| `/admin/gallery`, `/new`, `/[id]` | Photographs |
| `/admin/videos`, `/new`, `/[id]` | Curated YouTube videos |
| `/admin/batches`, `/new`, `/[id]` | Batches |
| `/admin/announcements`, `/new`, `/[id]` | Notices |
| `/admin/website` | Website text, by group |
| `/admin/preview` | Click-to-edit: what is live, and every editable field |
| `/admin/media` | Photo library |
| `/admin/reviews` | Review Engine diagnostics |
| `/admin/data`, `/data/download` | Import and export |

**No dead routes and no dead components were found.** Every file under
`src/app/admin` is reachable from the navigation or from a page that is.

### Server actions (25 across 14 files)

Every one is a public endpoint by construction (`'use server'`). All 25 call
`requireAdminOrNull()` and redirect on failure. CSRF is Next's built-in
Origin/Host check for actions, plus `rejectCrossOrigin` for the two Route
Handlers (`/admin/logout`, `/admin/data/download`), which get no automatic check.

---

## 3. Public content matrix

Built by crawling all 13 public routes and reading every page component, not
from memory. Classification: **A** already editable · **B** code-owned on
purpose · **C** was missing, **now built** · **D** missing feature · **E**
external · **F** security-controlled · **G** human decision.

| Content | Before | Now | Class |
| --- | --- | --- | --- |
| Homepage hero (eyebrow, 2 title lines, standfirst) | A | A | A |
| Homepage closing invitation (title, body) | A | A | A |
| **Homepage section headings** (7 bands) | code | **editable** | **C → A** |
| About title, standfirst, body (3 blocks) | A | A | A |
| **Page heading on 10 other routes** | code | **editable** | **C → A** |
| **Sentence under the heading, 9 routes** | code | **editable** | **C → A** |
| **Closing invitation on 9 routes** (title, body) | code | **editable** | **C → A** |
| Course descriptions (5) | A | A | A |
| Address (landmark, line, city, state, PIN) | A | A | A |
| Phone (primary, secondary) | A | A | A |
| Opening hours | A | A | A |
| Map coordinates | A | A | A |
| **Email address** | code (`null`) | **editable** | **C → A**, and G |
| **YouTube / Instagram links** | code (`null`) | **editable** | **C → A**, and G |
| Menu labels and visibility (10 entries) | A | A | A |
| Footer column headings (4) | A | A | A |
| Faculty records + photos | A (own screen) | A | A |
| Results, stories, batches, announcements | A (own screens) | A | A |
| Gallery items, captions, consent | A | A | A |
| Videos (curated YouTube ids) | A | A | A |
| Reviews | E | E | **E** — Review Engine is the source of truth |
| Section eyebrows | B | B | **B** — a 2-word typographic slot |
| CTA button labels and destinations | B | B | **B** — they travel together |
| Empty-state wording | B | B | **B** — the honesty rule |
| `/reviews` provenance sentence | B | B | **B** — names the live source |
| SEO title / description | B | B | **B** — generated from page content |
| Structured data values | B | B | B (now follows the edited social links) |
| Page URLs / course slugs | B | B | **B** — renaming 404s every existing link |
| Institute name, tagline | B | B | **B** — matched to the Business Profile |
| Colours, fonts, spacing | B | B | **B** — contrast is verified per pair |
| Legal entity name | G | G | **G** — not supplied |

**Everything in class C is now built.** The four B rows added during this phase
are declared in `CODE_OWNED` and shown to the owner in the preview, with the
reason — the brief's requirement that the panel must not pretend something is
editable when it is not.

---

## 4. Admin route matrix

`Y` = present · `—` = not applicable · `!` = defect found this phase (now fixed)

| Route | Create | Edit | Delete | Publish | Media | Valid. | Consent | Audit | Stale-edit | Success | Error | Confirm | Authz | CSRF | Rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| students | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | — |
| stories | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | — |
| faculty | Y | Y | Y | Y | Y | Y | — | Y | Y | Y | Y | **!** → Y | Y | Y | — |
| gallery | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | **!** → Y | Y | Y | Y |
| videos | Y | Y | Y | Y | — | Y | — | Y | Y | Y | Y | **!** → Y | Y | Y | Y |
| batches | Y | Y | Y | Y | — | Y | — | Y | Y | Y | Y | Y | Y | Y | — |
| announcements | Y | Y | Y | Y | — | Y | — | Y | Y | Y | Y | Y | Y | Y | — |
| enquiries | — | Y (status, notes) | — | — | — | Y | — | Y | **none** | Y | Y | — | Y | Y | — |
| website | — | Y | — | — | — | Y | — | Y | Y | Y | Y | — | Y | Y | — |
| preview | — | Y | — | — | — | Y | — | Y | Y | Y | Y | — | Y | Y | — |
| media | Y | — | Y | — | Y | Y | Y | Y | — | Y | Y | Y | Y | Y | Y |
| data | Y (import) | — | — | — | — | Y | Y | Y | — | Y | Y | Y | Y | Y | Y |
| reviews | — | — | — | — | — | — | — | Y | — | Y | Y | — | Y | Y | Y |

**Mobile, keyboard, empty and loading states** were measured across all 21 routes
rather than tabulated per row — see §11 and §12. Every route has an empty state
and a pending state on its submit control.

**`enquiries` still has no lost-update protection.** Carried from the Topic 11
report as an accepted risk: it is internal-only data, two admins editing the same
enquiry's notes simultaneously is the only exposure, and the fix needs form
changes on a surface neither topic otherwise touched. **Not fixed. Recorded.**

---

## 5. Topic 11 findings

### Design-system coherence: clean

- **Zero** raw Tailwind palette classes (`bg-blue-600`, `text-gray-500` …) in
  `src/app/admin` or `src/components/admin`.
- **Zero** hex colours and **zero** inline `style={{}}` in the admin.
- Every admin page uses the shared kit (`PageHeader`, `Card`, `TableShell`,
  `EmptyPanel`, `StatusPill`, `Notice`). Two list families exist — tables for
  record lists, card grids for the four media-bearing entities — and that split
  is deliberate, not drift.
- Success and error feedback is uniform: a redirect flag rendered as a `Notice`.
  Gallery's extra `consent=1` case is correctly handled and correctly worded
  differently from "Saved".

### What was not coherent

Four things, all of the same shape: a later phase built a screen without
reaching for what an earlier phase had already built. See defects **D-1** to
**D-5** in §15.

The clearest single symptom: `src/app/admin/(dashboard)/media/delete-button.tsx`
carried a comment arguing for its inline confirmation and ending *"…and is the
pattern the rest of this admin already uses."* It was not. The rest of the admin
used `window.confirm` on four pages and asked nothing at all on three others.
That comment has been corrected, and the claim made true.

---

## 6. Topic 12 findings

The owner requirement is *"the institute should be able to change the website
without needing a developer."* Measured against a crawl of every public route,
the honest answer before this phase was **"the facts, yes; the words, no."**

The institute could change its address, phone, hours, map point, menu labels,
course descriptions and homepage hero. It could not change the heading on any
page except the homepage and About, the sentence under any heading, any section
heading on the homepage, any closing invitation, its own email address, or a
link to its own YouTube channel.

Those were built. §7 has the coverage proof.

Three things were deliberately **not** made editable, and the reasoning is in
`CODE_OWNED` where the owner can read it:

- **Section eyebrows** — a two-word typographic slot, not prose.
- **Button labels and destinations** — they travel together. An editable label
  over a fixed destination produces a button reading "WhatsApp us" that opens
  the enquiry form.
- **Empty-state wording and the `/reviews` provenance sentence** — these are the
  honesty rules the rebuild was commissioned to fix. The reviews sentence names
  the live source and states that the institute neither writes nor edits the
  reviews. An institute able to reword that could quietly drop the attribution.

### A near-miss worth recording

The first draft of the page-heading table **invented** the standfirst for
`/admissions`, because the extraction that built it truncated before the real
sentence. A fallback that does not match the shipped copy silently rewrites the
page the moment the field goes live. `tests/site-content.test.ts` caught it — not
the invented text, but the fact that `page.admissions.standfirst` was registered
while nothing rendered it. Checking why led to the real sentence, which is now
the fallback, verbatim.

---

## 7. Click-to-edit coverage

Every requirement in the brief's twelve-point list, and where it is enforced:

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Registry key | `EDITABLE_FIELDS`, closed list |
| 2 | Known data type | `kind`: line / paragraph / lines / toggle |
| 3 | Validation | `validate` + `validateValue()` |
| 4 | Maximum length | `maxLength`, enforced in registry, action **and** a CHECK constraint |
| 5 | Explicit render location | `renders.route` + `renders.section` |
| 6 | Source actually reads the key | unit test, per key, against real source |
| 7 | Unknown keys never persisted | action refuses; `getSiteContent` discards on read too |
| 8 | Save authenticated | `requireAdminOrNull()` |
| 9 | CSRF intact | Next action Origin/Host check |
| 10 | Stale-edit protection | per-key token, `contentToken` |
| 11 | Cache/revalidation correct | **rewritten this phase** — see D-7/D-8 |
| 12 | Observable as a logged-out visitor | **`npm run verify:admin`, all 96 fields** |

**Result: 298 assertions, 0 failed.** For each of the 95 testable fields the
suite writes a unique marker through the real single-field save, then fetches
the declared route with no session and looks for it.

**1 field NOT TESTED, honestly:** `home.section.reviews.heading` labels the
homepage reviews band, which renders only when the Review Engine returns
reviews. It is disabled for this client, so the band is correctly absent. The
suite **checks that precondition** rather than assuming it, so the field starts
being tested the moment reviews exist.

---

## 8. Media lifecycle

Traced through source, then exercised by `npm run verify:media` (112 assertions).

| Stage | Behaviour |
| --- | --- |
| Upload | Admin-only action; rate limited |
| Declared type | jpeg / png / webp / avif only |
| Magic bytes | Checked **before** any decoder is handed the file |
| Dimensions | Read from metadata before pixel work — a decompression bomb is refused cheaply |
| Re-encode | Always, through `sharp`. The bytes served are never the bytes uploaded |
| EXIF | Orientation applied, then **all metadata dropped, including GPS** |
| Naming | 32-hex content hash. The uploaded filename is never trusted or stored |
| Storage | `MediaStore` interface. Local disk in dev; **`UnconfiguredStore` in production, which refuses loudly** |
| DB reference | Path column on the owning record |
| Public URL | `/media/[key]` route handler; refuses any key it did not issue |
| Replacement | New content ⇒ new hash ⇒ new URL. Old URL keeps serving old bytes until reclaimed |
| Deletion | Idempotent. The media library refuses to delete a file anything still references |
| Orphans | **Not automatic.** `npm run media:audit` reports, `media:clean` reclaims |
| Consent withdrawal | Untick permission ⇒ off the website on save, enforced by a **CHECK constraint**, not by the form |
| Missing object | `/media/[key]` 404s; the page renders its monogram fallback |

**Answers to the brief's direct questions:**

- *Where do photos live locally?* `.media-store/` — outside `public/` and outside
  `.next/`, so a build can neither publish nor wipe them.
- *Where in production?* **Nowhere yet.** See §9.
- *After deployment?* The production store throws on first use with a sentence
  explaining why. It does not fail silently.
- *Ephemeral filesystem?* Precisely why the local adapter is refused in
  production.
- *Orphaned media?* Accumulates; reclaimed manually. **Nothing runs that
  automatically on a hosted deployment** — worth stating plainly.
- *Consent withdrawal?* Not left to a cleanup script. Enforced at the database.
- *Dangling reference?* Renders the fallback, never a broken image.

---

## 9. Production storage analysis

Full evaluation in `docs/COST-AND-INFRASTRUCTURE.md`, corrected this phase.

**Recommendation: Cloudflare R2**, with Vercel Blob as the low-effort
alternative.

R2 wins on two things. Its **egress is free and unmetered**, which removes the
one cost that can surprise a small institute — a popular gallery page on a
metered provider turns a ₹0 bill into a real one with no warning. And it speaks
the **S3 API**, so the adapter is a documented interface and leaving later is
configuration rather than a rewrite. AWS S3 is excluded for the opposite reason:
egress is charged, which is exactly the failure mode to design out of a
near-zero-budget project.

Durability is 11 nines on every option considered; that is not the
differentiator. Commercial use is permitted on all free tiers checked.

**Nothing was activated. No account was opened. No credential was invented.**
This is a **HUMAN DECISION** and a **LAUNCH BLOCKER**.

---

## 10. Security attacks

All against the new Topic 12 capabilities, since those are the only new attack
surface. Existing surfaces were re-verified by `verify-security` (262/0) and
`verify-cms` (89/0).

The three new fields — `contact.email`, `social.youtube`, `social.instagram` —
are **the only editable fields on this site whose value becomes an `href`**.
Everything else is rendered as text, where React's escaping is the defence.

| Attack | Result |
| --- | --- |
| `javascript:alert(1)` as a social link | Refused, not stored, never on a page |
| `data:text/html,<script>…` | Refused |
| `https://youtube.com.attacker.example/@x` (prefix trick) | Refused |
| `https://evilinstagram.com/x` (suffix trick) | Refused |
| `https://youtube.com@evil.example/x` (credential disguise) | Refused |
| `http://` instead of `https://` | Refused |
| Link to the platform's own front page | Refused |
| `a" onmouseover="alert(1)@x.com` | Refused |
| Control characters / NUL in an address | Refused |
| A string that is not an address | Refused |
| **Positive control**: a real channel URL | **Accepted** |
| **Positive control**: a real profile URL | **Accepted** |
| **Positive control**: a real email address | **Accepted** |

Both halves matter. A validator that refused everything would pass every
negative test above; the positive controls are what make the negatives mean
something.

Covered twice on purpose: `tests/contact-links.test.ts` (18 cases) proves the
parser is right; `verify-cms` section 14 proves **the server calls it**. A
correct parser is worth nothing if the action forgets to invoke it — which is
the defect Topic 5 found in the stories action after months in production.

Also re-confirmed unchanged: anonymous access refused on every admin route,
forged session cookie rejected, export endpoint refuses a stranger, unknown
content key refused, key from another group refused, stale edit refused, CSP
untouched, no secrets in the repository, `npm audit` clean.

---

## 11. Accessibility

**Measured**, at 320–1280px, in headless Chrome.

- **Touch targets: 0 controls below the 24×24 WCAG 2.2 AA (2.5.8) minimum**,
  admin and public. Before this phase there were **30 in the admin and one on
  the public site** — see D-2.
- **Admin mobile drawer** now closes on Escape, moves focus into the panel, traps
  Tab inside it, locks background scroll and returns focus to the trigger. It did
  none of that before — see D-3.
- Heading order, landmark uniqueness, `aria-current`, alt text, focus visibility
  and dark-mode contrast: re-verified by `verify-ux` (333/0).
- The delete confirmation announces itself (`role="alert"`) rather than silently
  swapping one control for another.

**NOT TESTED — no screen reader was used.** No claim is made about NVDA, JAWS or
VoiceOver behaviour. The semantics were checked; the experience was not.

---

## 12. Responsive testing

All 21 admin routes at 320×568, plus the public site at nine widths from 320 to
1280.

- **No horizontal page overflow on any admin route at 320px.** The only element
  wider than the viewport is the import table on `/admin/data`, which scrolls
  inside its own container — correct behaviour, not overflow.
- Every primary control (`Add a teacher`, `Add a photograph`, `Add a video`,
  `New announcement`, `Add a result`, `Save changes`) was hit-tested at 320px:
  scrolled into view, measured after layout settled, and confirmed to be the
  element at its own centre point.
- Navigation, forms, dialogs and the media picker remain usable; destructive
  actions remain visible and now require two taps.

**NOT TESTED: Firefox, Safari and WebKit are not installed in this
environment.** Chrome and Edge are the only engines available. No claim is made
about the others.

---

## 13. Performance

- **Request-count budget: unchanged.** `/` 29, `/gallery` 24, `/results` 22
  against a limit of 20 — the same three routes at the same three numbers as
  before this phase. Topic 12 added **no client JavaScript**: every new field is
  read in a server component, and `getSiteContent()` is wrapped in React
  `cache()`, so the ten pages that now read it share one query with the header
  and footer rather than adding ten.
- 101 other budget checks pass.
- This is a **pre-existing, unrevised decision, now four topics old** — see §18.

---

## 14. Cost analysis

No new recurring cost was introduced by either topic. The only outstanding
spend decision is object storage (§9), which is ₹0 on the recommended option at
this volume.

`docs/COST-AND-INFRASTRUCTURE.md` was **corrected**, not merely extended: its
photo-storage section described the Phase 7 state and had been wrong since Topic
5 built the upload pipeline. It claimed the admin accepted "a path to an image
already in `/public`", that "the teacher cannot upload", and that the pipeline
was "not built now" — and its list of requirements "when built" was a list of
things already implemented and tested. A costing document that misdescribes what
exists is how a launch decision gets made on the wrong facts.

---

## 15. Defects found

### D-1 · Destructive actions — three patterns, one of them silent · **HIGH**

**Description.** Faculty, gallery and videos deleted a record on a single click
with no confirmation. Announcements, batches, stories and results used
`window.confirm`. The media library used an inline two-step confirm. All three
behaviours in one admin panel.

**Reproduction.** Signed in, created a throwaway faculty row, clicked "Remove"
on `/admin/faculty` with `window.confirm` stubbed to record whether it was
called. Result: `asked=false deleted=true`. Same for videos and gallery.
**Positive control**: the same probe on `/admin/announcements/[id]` reported
`asked=true`, proving the detection worked.

**Root cause.** Topics 6, 8 and 9 each built a card list and each wrote the
remove control inline, without reaching for `components/admin/delete-button.tsx`
that four older pages already used. Not a decision — an omission repeated three
times.

**Fix.** `DeleteButton` rewritten as a shared inline two-step confirmation and
adopted by all seven surfaces. The first control is a real submit button and the
interception is an `onClick`, so with JavaScript disabled the form posts
straight through exactly as before — no regression for a no-JS browser.

**Regression test.** `verify-teacher`, `verify-faculty`, `verify-gallery` and
`verify-videos` now each assert **both halves**: one click must not delete, and
the second must. A test that only proved deletion works would have passed
against the defect.

**Verification.** All four surfaces: `1st-click-kept=true · confirm-shown ·
2nd-click-deleted=true`.

---

### D-2 · Every checkbox in the product below the 24×24 minimum · **MEDIUM**

**Description.** Twelve hand-written checkboxes across eight files, in two sizes
(`h-4 w-4` = 16px and `h-5 w-5` = 20px), two corner radii and two label
structures. All below the WCAG 2.2 AA (2.5.8) 24×24 minimum **that this project
already asserts on its own public pages**.

The most consequential was public: the **consent checkbox on the enquiry form**,
16×16 — the one control a parent on a phone must tick to send an enquiry, and
the smallest thing on the page.

**Reproduction.** Applied `verify-ux`'s own measurement rule — including its
visually-hidden and inline-link exemptions — to controls its selector had never
included. 30 undersized controls in the admin, 1 on the public site.

**Root cause.** No shared checkbox primitive, so each screen invented one. The
touch-target test selected `a[href], button, input[type=submit]` — **no checkbox
was ever in the query**, so the suite reported PASS on every route while the
smallest control on the page was 16px.

**Fix.** `src/components/primitives/checkbox.tsx` — 24×24, with the `<label>`
wrapping the control so the box, the wording and the explanation are one hit
area. All twelve migrated; zero hand-written checkboxes remain.

**Verification.** 0 controls below 24×24 anywhere, admin or public.

---

### D-3 · The admin drawer was not a modal · **MEDIUM**

**Description.** The admin mobile navigation ignored Escape, never moved focus
into the panel, and left 15 controls tabbable behind it. The public drawer had
done all of this correctly since Phase 11.

**Reproduction.** Both drawers driven in the same browser run: public
`Escape closed it: true`; admin `Escape closed it: false`, plus
`15 focusable controls behind the open drawer`.

**Root cause.** The second drawer was written without looking at the first.

**Fix.** The public drawer's implementation extracted to
`primitives/use-drawer.ts` and used by both. The admin drawer gained a real,
focusable close button — its previous one carried `aria-label="Close menu"` and
`tabIndex={-1}` together, announcing a control to a screen reader and then
denying the keyboard any way to reach it.

**Verification.** Admin: `Escape closed it: true`, `focus moved in: true`.
Public: unchanged, `verify-ux` 333/0.

---

### D-4 · Two Cancel controls · **LOW**

Older forms used a bare blue text link measuring **43×23** — under the 24×24
floor. Newer forms used a 44px-tall muted control. Fixed by the shared
`FormActions`; the muted one was kept, because painting Cancel in link-blue
beside a navy Save gives the destructive-to-your-work option equal visual weight.

---

### D-5 · Nine near-identical submit buttons · **LOW**

Under two names (`SaveButton`, `SubmitButton`) and two sizes (`size="lg"` on the
four older forms, default on the newer five), so the same operation changed
visual weight depending on which page you were on. Replaced by one
`FormActions` component.

---

### D-6 · Signing out sent the admin to a hard-coded origin · **MEDIUM**

**Description.** `/admin/logout` redirected to `new URL('/admin/login',
SITE_URL)`. That is right for a canonical link and wrong for a redirect: it
ignores the host the request arrived on.

**Reproduction.** On a server on port 3170, clicking "Log out" left the browser
on `/admin`, because the redirect pointed at `localhost:3000` and nothing was
listening there. **Confirmed pre-existing** by reproducing it at HEAD with my
changes stashed.

**Root cause.** An absolute redirect built from configuration instead of from the
request.

**Consequence in production.** Signing out from `www.` bounces to the apex, or
from a preview deployment to the production domain.

**Fix.** `request.nextUrl.clone()`, which carries the request's own origin
including a platform proxy's forwarded host.

**Verification.** On port 3170: `after clicking Log out, pathname:
/admin/login`. `verify-teacher` 123/0.

---

### D-7 · A page-heading edit never reached its page · **HIGH**

**Description.** `revalidateFor()` chose caches to clear from a chain of
ternaries ending `: ['/']`. The new `pages` group fell through to that fallback,
so editing the heading on `/faculty` cleared the homepage instead.

**Reproduction.** `verify-admin` reported 23 failures concentrated on exactly the
ISR-cached routes: `/courses`, `/faculty`, `/contact`, `/about`,
`/announcements`, `/reviews`.

**Fix.** Routes are now **derived from the registry**. Every field already
declares where it renders, and a unit test proves each declaration matches a
real `page.tsx`.

---

### D-8 · `/faculty` and `/reviews` never refreshed after a contact change · **MEDIUM** · pre-existing

**Description.** The same hand-written list was missing `/faculty` (ISR 15
minutes) and `/reviews` (ISR **six hours**). Both render the header and footer.
Correcting the institute's phone number left the old one on those two pages until
the cache aged out.

**Root cause.** Topics 6 and 7 added those routes to the site and not to this
list — the identical drift `verify-ux` suffered when the same two routes were
added to the site and not to its route array.

**Fix.** Same as D-7, plus `PUBLIC_ROUTES` as a single declared list.

**Regression test.** `verify-admin` section 1b drives one chrome field and then
checks **all twelve public routes**. Plus two unit tests asserting
`PUBLIC_ROUTES` and the pages on disk match **in both directions** — a page that
exists but is unlisted is exactly the shape of this bug.

**Verification.** "the new phone number reaches …" passes for all 12 routes.

---

### D-9 · The cost document described a system that had not existed for three topics · **DOCUMENTATION**

Corrected in place, with a dated note saying what it used to claim. Details in
§14.

---

## 16. Harness defects

Distinguished from application defects throughout. **None of these was a bug in
the product**, and two of them were concealing bugs that were.

| ID | Suite | Defect |
| --- | --- | --- |
| H-1 | `verify-ux` | Touch-target selector never included checkboxes, radios or selects. **Concealed D-2 across the whole product.** |
| H-2 | `verify-ux` | Covers **zero** admin routes. The admin had never had a systematic overflow / target / keyboard sweep. Addressed by measuring all 21 routes this phase. |
| H-3 | `verify-teacher` | The sign-out assertion silently depended on the server running on the port in `NEXT_PUBLIC_SITE_URL`. It had only ever been run on 3000, the one port where **D-6** is invisible. |
| H-4 | `verify-map` | Paired `/admin/website`'s **group** stale-edit token with a single-key `only=` save. Those tokens coincide only when the group has no stored rows, so the suite passed for two topics purely because the contact group happened to be empty. **Proved by writing one `contact.city` row — a field from Phase 15, nothing to do with this phase — and watching every save be refused as stale.** Now uses `/admin/preview`, whose token is per-key. Topic 11 hit this same trap from the other direction and nearly filed it as a high-severity application defect; recorded so nobody finds it a third time. |
| H-5 | 4 suites | Drove the old one-click / `window.confirm` delete. Updated to the new contract, and strengthened to assert one click does **not** delete. |
| H-6 | `verify-admin` | `markerFor` had no case for the validated email and URL fields, so it wrote `ZZADM` markers that were correctly refused and reported three fields as failing to save. |
| H-7 | `verify-admin` | Assumed every band renders unconditionally. The homepage reviews band does not. Now a checked skip that reports NOT TESTED and re-arms itself. |
| H-8 | `verify-admin` | **Mine, this phase.** My new section reused `+91 90000 33333`, which section 4 also writes before asserting those digits disappear. Two sections, one marker, one false failure. |
| H-9 | `verify-cms` | **Mine, this phase.** Section 14 leaves three empty contact-group rows behind, which is what exposed H-4. Harmless to the product; the suite it broke was already fragile. |

**A weak assertion, corrected.** `tests/site-content.test.ts` proves each key is
read by real source by searching for the key string. My first version of the
social reader used a template literal, `content[\`social.${platform}\`]`, so the
key never appeared — and the test went green anyway, because the substring
`social.youtube` also occurs in the unrelated property access
`contact.social.youtube` in the footer. It passed on a coincidence rather than on
a read. The keys are now spelled out.

I also suspected this test was vacuous overall, because `ALL_SOURCE` reads all of
`src/`. **That suspicion was wrong** — `sourceFiles()` explicitly excludes the
registry file. The test is real.

---

## 17. Environment limitations

| Limitation | Consequence | What must happen later |
| --- | --- | --- |
| No screen reader available | Semantics verified, experience not | Manual NVDA / VoiceOver pass before launch |
| Firefox, Safari, WebKit not installed | Chrome and Edge only | Cross-browser pass on real devices |
| Review Engine disabled for this client | Live integration untested; `home.section.reviews.heading` NOT TESTED | Enable and re-run `verify:reviews` and `verify:admin` |
| No production object storage | Media cannot be exercised in a real deployment | §9 |
| `verify-seo` and `verify-production` assert canonical URLs | Must run against the port in `NEXT_PUBLIC_SITE_URL` | Not a defect; canonical URLs are correctly absolute |
| `npm run verify:scale` not run this phase | Scale unchanged since Phase 13 | Re-run if record counts grow |

---

## 18. Human decisions

1. **Production object storage** — R2 or Vercel Blob. Requires an account. §9.
2. **Institute facts** — address, both phone numbers and opening hours are still
   `unverified` in code. `unverifiedFacts()` gates indexing on them.
3. **A professional email address** — none supplied. The field now exists and is
   owner-editable, so supplying one no longer needs a developer.
4. **Social accounts** — same.
5. **Legal entity name** — needed for the privacy policy and terms.
6. **The request-count budget** — `/` 29, `/gallery` 24, `/results` 22 against a
   limit of 20, unrevised for four topics. Either the budget is wrong or the
   pages are. **This is your call and I have not made it.**
7. **Whether the launch switch flips** — unchanged, still OFF.

---

## 19. Launch blockers

| # | Blocker | Owner |
| --- | --- | --- |
| 1 | Production object storage not provisioned | Human decision |
| 2 | Institute facts unverified (address, phones, hours) | Client |
| 3 | Real domain + `NEXT_PUBLIC_SITE_URL` | Human |
| 4 | Demo data present (`P-DB-12` fails by design) | Run `npm run seed:demo:clean` |
| 5 | Screen-reader and cross-browser passes | Manual |
| 6 | Request-count budget decision | Human |

Blockers 1–3 are enforced in code: `isIndexable()` is false while any holds, and
`npm run verify:preflight` names them.

---

## 20. Regression results

Full suite, after all changes.

| Suite | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **505 passed, 0 failed** (was 487; +18 new) |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| `verify:seo` | 418 / 0 |
| `verify:ux` | 333 / 0 |
| `verify:admin` | **298 / 0** (was 193) |
| `verify:security` | 262 / 0 |
| `verify:videos` | 232 / 0 |
| `verify:reviews` | 224 / 0 (fixture; live NOT TESTED) |
| `verify:gallery` | 208 / 0 |
| `verify:map` | 142 / 0 |
| `verify:faculty` | 132 / 0 |
| `verify:teacher` | 123 / 0 |
| `verify:import` | 116 / 0 |
| `verify:media` | 112 / 0 |
| `verify:cms` | **89 / 0** (was 71) |
| `verify:integration` | 67 / 0 |
| `verify:e2e` | 62 / 0 |
| `verify:public` | 46 / 0 |
| `verify:constraints` | 43 / 0 |
| `verify:revalidation` | 10 / 0 |
| `verify:production -- --expect-prelaunch` | 25 / 0 |
| `verify:budget` | 101 / **3** — the three pre-existing route counts, unchanged |
| `verify:preflight` | **1 failure: `P-DB-12`, demo data present — the gate working** |

`verify:scale` was not run; nothing this phase changes record volume.

---

## 21. Database verification

- **43 CHECK constraints present. 0 missing, 0 unexpected.** `verify:constraints`
  passes 43/43 by name, and `verify:preflight` re-checks independently.
- **15 tables.** Unchanged.
- **No migration was created, regenerated or edited.** `git status prisma/` is
  empty. The three new registry keys needed none: the existing
  `site_settings_key_charset` constraint
  (`^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$`) already admits `contact.email`,
  `social.youtube`, `social.instagram`, `page.*` and `home.section.*`, and the
  2000-character value ceiling comfortably covers the longest new field (800).
- Unique constraints, foreign keys, delete behaviour and consent-column defaults:
  all verified by preflight.
- **`site_settings` restored to 0 rows**, the state it ships in.
- Demo dataset intact: 45 results, 15 stories, 7 batches, 8 announcements, 8
  enquiries, 5 faculty, 12 gallery items, 5 videos. **0 non-`ZZSHOW` content
  rows.**

Phase 12's P12-A lesson held: nothing regenerated, nothing lost.

---

## 22. Git state

**Nothing committed.** Both topics are complete; the phase's commit rule asks for
one commit covering both, and that is left for your instruction.

Working tree: **45 modified, 6 new.**

New files:

- `src/components/primitives/checkbox.tsx`
- `src/components/primitives/use-drawer.ts`
- `src/components/admin/form-actions.tsx`
- `src/lib/contact-links.ts`
- `tests/contact-links.test.ts`
- `docs/PHASE-16-TOPICS-11-12-REPORT.md` (this file)

No secrets, no credentials, no new dependencies, no external infrastructure.
Launch switch untouched at `false`.

---

## 23. Final verdict

**Topic 11: complete.** The admin is one product. Every destructive action
behaves the same way, every checkbox is the same size and meets the standard the
project sets itself, both navigation drawers share one implementation, and the
save/cancel pair is one component instead of nine. The coherence problems that
remained were all the same shape — a later phase not reaching for what an earlier
one built — which is an argument for shared primitives rather than for review.

**Topic 12: complete, with one blocker outside the code.** The institute can now
change every heading, every standfirst, every closing invitation, its contact
details, its email address and its social links without a developer — 96 fields,
all proved to reach a logged-out visitor. What it still cannot do is publish a
photograph in production, because production storage has not been bought. That is
a decision, not a defect, and inventing it was explicitly out of scope.

**The most valuable thing this phase found was not in the code but in the
tests.** Three suites were passing while not testing what their names claimed:
the touch-target check never selected a checkbox, the sign-out check only worked
on one port, and the map suite only worked while a table was empty. Each was
hiding, or would soon have hidden, a real defect. A green suite that never
evaluated its condition is worse than no suite, because it stops anyone looking.

---

## 24. Recommended next phase

1. **Get a decision on object storage** (§9) and write the adapter — half a day
   once an account exists. This is the last thing between the media system and
   production.
2. **Collect the institute facts in writing** — address, both numbers, hours,
   email, social accounts, legal entity name. Six of the seven human decisions in
   §18 are one conversation.
3. **Settle the request-count budget.** Four topics is long enough for three
   routes to sit over a limit nobody has revisited.
4. **A manual accessibility pass with a real screen reader**, and a cross-browser
   pass on a real phone. Both are marked NOT TESTED throughout and neither can be
   done in this environment.
5. **Give `enquiries` its lost-update guard** — the one surface still without
   one, carried as an accepted risk since Topic 11.
6. Consider extending `verify-ux` to cover admin routes permanently, rather than
   relying on a topic-specific sweep. H-2 will otherwise recur the next time a
   screen is added.
