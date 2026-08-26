# Phase 15 — Product completion, CMS architecture and content inventory

**Date:** 25 August 2026
**Baseline:** `4b8b220`
**Status:** see the final section. This report is written as work proceeds, and
records what is *built* separately from what is *designed*.

---

## Topic 1 — Complete product inventory

### Documentation reviewed

`docs/brief/01-master-directive.md` · `docs/brief/02-vision-brief.md` ·
`MASTER-PLAN.html` · `PHASE-7-CONTENT-MANAGEMENT-MATRIX.md` (the closest prior
answer to this phase's question) · `PHASE-7-CONTENT-COLLECTION-CHECKLIST.md` ·
Phase 6, 9, 10, 12, 13, 14 reports · `DESIGN-TOKENS.md` ·
`STUDENT-DATA-POLICY.md` · `DEPLOYMENT-RUNBOOK.md` ·
`DEMO-DATA-REPORT.md` · `.env.example` · `deployment-contract.ts`.

Compared against source rather than taken on trust.

### Classification key

**A** fully implemented · **B** partial · **C** static/hardcoded ·
**D** admin editable · **E** not implemented · **F** implemented incorrectly ·
**G** requires external integration

### Public website

| Surface | Class | Source of truth | Notes |
| --- | :-: | --- | --- |
| Header | **A · C** | `nav.ts`, `institute.ts` | Renders correctly; nothing editable |
| Navigation | **A · C** | `src/config/nav.ts` | Deliberate: a link to a missing page is a 404 in the most prominent element. Phase 6 found four. |
| Hero | **A · C** | `(site)/page.tsx` | Every word hardcoded in JSX |
| About | **A · C** | `(site)/about/page.tsx` | Entirely hardcoded copy |
| Courses / programmes | **A · C** | `institute.ts` array | Slugs are route segments and `generateStaticParams` inputs |
| Course detail copy | **B** | not written | Honest empty state: "Subjects, timings and fees … will be published here" |
| Results | **A · D** | Database | Consent-gated at four layers |
| Subject marks | **A · D** | Database | |
| Stories | **A · D** | Database | Separate story and photo consent |
| Batches | **A · D** | Database | Validity window |
| Announcements | **A · D** | Database | Self-expiring window |
| Contact | **A · C** | `institute.ts` | Address and phones marked `unverified` |
| Map | **E** | — | Section hides itself; needs a Place ID or coordinates |
| Footer | **A · C** | `nav.ts`, `institute.ts` | Renders only links that exist |
| WhatsApp CTA | **A · C** | `institute.ts` | |
| SEO / metadata | **A · C** | per-route code | Deliberately not editable — invites keyword stuffing |
| Social links | **E** | `null` | Footer renders nothing rather than a placeholder |
| Legal / privacy | **E** | — | No page. Listed as a human decision since Phase 13 |
| **Faculty** | **E** | — | No model, no route, no component |
| **Reviews** | **E · G** | — | No model, no route. Needs `tp-reviews-engine` |
| **Gallery** | **E** | — | No model, no route |
| **Videos** | **E · G** | — | No model, no route. Needs a channel ID |

### Admin

| Surface | Class | Notes |
| --- | :-: | --- |
| Authentication | **A** | scrypt, account throttle, per-instance ceiling, revocation |
| Dashboard | **A** | Counts and recent enquiries |
| Enquiries | **A · D** | Status and notes |
| Students / results | **A · D** | Full CRUD, consent controls, subject marks |
| Batches | **A · D** | |
| Announcements | **A · D** | |
| Stories | **A · D** | |
| Website preview | **B** | Read-only. Reuses the public data functions, so it cannot drift |
| Import / export | **A** | CSV, cannot publish |
| Audit history | **B** | Written and constrained; **no admin UI reads it** |
| **Faculty** | **E** | |
| **Reviews** | **E** | |
| **Gallery** | **E** | |
| **Videos** | **E** | |
| **Website editor** | **E** | |
| **Contact / location** | **E** | |
| **Header / footer** | **E** | |
| **Media management** | **E** | Photo paths are typed by hand as text |

### Findings from the comparison

**F-1 — `.env.example` advertises two integrations the deployment contract does
not know about.** `REVIEWS_PAYLOAD_URL`, `YOUTUBE_API_KEY` and
`YOUTUBE_CHANNEL_ID` are documented there but absent from `ENV_CONTRACT` in
`deployment-contract.ts`. No test caught it because nothing in `src/` reads
them. Classified drift, not a defect — recorded for Topic 7 and 9.

**F-2 — the audit log has no reader.** Rows are written on every sensitive
action and protected by a CHECK constraint, and no screen displays them. The
teacher cannot answer "what changed last week?".

**F-3 — the four missing sections are documented, not forgotten.** `nav.ts`
names each and its blocker: faculty needs verified credentials and portraits,
reviews need the Review Engine activated, videos need the channel ID, gallery
needs photography. Phase 7 declined to build a CMS for content that did not
exist. Phase 15 reverses that decision deliberately — the capability is being
built ahead of the content, which is the owner's call to make.

### What the inventory means for this phase

Of the twenty-two topics, the work divides into three groups:

| Group | Topics | Blocked on |
| --- | --- | --- |
| **Buildable now** | 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14 | Nothing |
| **Buildable, inert until configured** | 7 (reviews), 9 (videos) | An external URL / channel ID the institute must supply |
| **Verification** | 15–20, 22 | The above |

Topics 7 and 9 can have their schema, admin surface and public section built and
tested with local fixtures — but must never claim a live Google or YouTube
connection. That distinction is carried through the whole design.

---

## Topic 13 — Complete public UI redesign

Taken first, at the owner's direction, so that the CMS surfaces built later
inherit a corrected design rather than propagating the current one.

### The diagnosis, measured rather than asserted

The brief's words were "excessively blue … poor visual hierarchy … unfinished".
Those are judgements, not measurements, so the first step was to find the
numbers underneath them. Screenshots of every public page were captured at
1280px and 390px in both themes and **looked at**, and the token pairs were
computed:

| Pair | Light | Dark | What that means |
| --- | :-: | :-: | --- |
| `paper` vs `surface` | **1.05:1** | **1.10:1** | The alternating band backgrounds are invisible |
| `band` vs `paper` (dark) | — | **1.12:1** | The navy CTA and the navy footer merge |
| `text-heading` vs `paper` (dark) | — | 4.9:1 | Headings were `#7fb0ff`, a *blue*, on near-black |

So the site was not merely "too blue": section separation was being asked of a
1.05:1 background step, which no viewer can see. Everything else followed from
that — with no visible edges, five bands of identical shape read as one
continuous column, and nothing on the page looked more important than anything
else.

Three further faults were visible only by looking:

- Every band was the same silhouette — eyebrow, navy heading, three-column card
  grid — five times down the homepage.
- Orange, the brand's only warm colour, appeared **solely** as 11px eyebrow
  text. It carried no structure.
- Every page ended with a navy CTA band immediately above the navy footer:
  roughly 700px of unbroken navy in which the call to action, the most
  commercially important element on the page, was the least distinguishable
  thing on screen.

### What changed

**1 · Colour tokens rebalanced** (`src/app/globals.css`). Not a shade swap — the
roles moved.

| Token | Was | Now | Contrast now |
| --- | --- | --- | :-: |
| `--text-heading` (light) | navy `#0b2f6b` | ink `#0f1720` | 18.05:1 |
| `--text-heading` (dark) | blue `#7fb0ff` | `#e8eef6` | 16.35:1 |
| `--surface` (light) | `#f4f7fb` | `#eef2f7` | — |
| `--rule` / `--rule-strong` | faint | `#d6dee8` / `#b9c4d2` | 1.36:1 / 2.10:1 vs paper |

Headings are now ink, not navy. Navy is reserved for the brand chrome — header,
footer, primary buttons — which is what makes it read as brand rather than as
the default colour of text.

**2 · Separation moved from fill to rule.** `Section` gained a `rule` prop,
defaulting on, that draws a hairline between bands. A 1px edge at 1.36:1 is
legible where a 1.05:1 area fill is not. The tone step is kept as a secondary
cue, not the primary one.

**3 · Bands differentiated by shape**, because shape survives at a glance where
a background tint does not:

| Band | Before | After |
| --- | --- | --- |
| Hero | one column on plain paper | two-column split; programme panel as counterweight |
| Courses | 3 cards | **removed** — duplicated the hero panel (see below) |
| Results | 3-col cards | 3-col cards, natural height, `items-start` |
| Batches | 3 cards | **rows** — a schedule reads as a table |
| Stories | 2 panels | unchanged (already distinct) |
| Location | 2-col grid with an **empty** second column | asymmetric split, contact panel filling it |
| Closing CTA | full navy band | framed block on paper |

**4 · The duplicated programme list.** Adding a programme panel to the hero
made the "What we teach" card band directly beneath it a repeat — the same
names, counts and links twice within one scroll. The band was removed and the
panel now carries all five programmes, each with its live upcoming-batch count
and a link through to `/courses`. The cards still exist and are still the whole
of `/courses`.

**5 · Shared primitives replacing hand-rolled markup.** Seven pages were each
writing the same masthead by hand, and all seven set the page title in the
*sans* face while card headings below used the serif display face — the most
important line on each page was the one line not using the headline font.

- `PageHeader` — one masthead, display serif, accent rule. Applied to all seven.
- `ClosingCta` — one closing block, replacing five navy bands plus the
  homepage's.
- `SectionHeader` gained an `action` slot, replacing four hand-built
  "All results →" layouts on the homepage alone.

**6 · Orange given structural work.** A 3px accent rule now marks every section
and page header. It is the mark the eye lands on when scanning, and it is why
each band announces itself without needing a background change.

### Defects found and fixed while doing this

| # | Defect | Fix |
| :-: | --- | --- |
| D-1 | `secondary` button border was `border-navy-800/25` — navy over near-black in dark mode, so the outline vanished and "Talk to us" / "WhatsApp us" read as loose text | switched to the theme-aware `rule-strong` token |
| D-2 | Homepage location band reserved a 320px second column and put nothing in it | filled with a contact panel |
| D-3 | New contact-panel links measured 116×18 and 74×18 — under the 24×24 minimum of WCAG 2.5.8 | `min-h-6`; caught by `verify:ux`, not by eye |
| D-4 | Result cards stretched to equal height with the attribution pinned to the foot, opening a void in the middle of short cards | `items-start`; cards take their natural height |
| D-5 | Hero panel printed a per-programme batch count derived from a `limit: 4` query — "1 upcoming" meant "1 on this page", not "1 exists" | count over all upcoming batches, display the soonest five |
| D-6 | `/about` "Our story" — an honest pending section — was bare text in a full-width band, which reads as a page that failed to load | framed in a dashed border, labelled "Being written" |

### Verification

Run against a production build on `localhost:3000` with the ZZSHOW demo dataset
seeded.

| Suite | Result |
| --- | --- |
| `npm test` | **276 passed, 0 failed** |
| `verify:ux` (incl. 249 dynamic AA contrast and touch-target checks) | **249 passed, 0 failed** |
| `verify:seo` | **335 passed, 0 failed** |
| `verify:budget` | 71 passed, **1 failed** — see below |
| `tsc --noEmit`, `eslint` | clean |

**A false-pass caught in the harness, not the product.** `verify:ux` and
`verify:budget` both default to `BASE_URL=http://localhost:3170`. Nothing is
serving that port. The first run reported "121 passed, 17 failed" — and those
121 passes were vacuous, because checks of the form `scrollWidth > 1280` pass
trivially against a browser error page. Every suite in this section was re-run
with `BASE_URL` set explicitly, and the numbers above are from those runs.
Recorded because a green run against a dead port is exactly the kind of result
that gets believed.

**The one budget failure is pre-existing and is not a Phase 15 regression.**
`/results request count within budget — 21 > 20`. Verified by stashing every
Phase 15 source change, rebuilding, and re-running: the baseline reports the
identical `21 > 20`. The count is `1 + scripts + styles + fonts + images`
parsed from the served HTML, and `/results` carries 13 student photographs from
the ZZSHOW demo dataset. The budget's own comment reads "Measured 14–15" — it
was calibrated against an empty database. `/results` is paginated at 24, so the
figure is bounded rather than unbounded. Carried into Topic 19.

---

## Topic 14 — Admin information architecture

The sidebar carried a comment reading *"SIX navigation items, deliberately …
a flat list of six is faster to scan than three groups of two."* By Phase 15 it
was listing **eight**: two had been added underneath the argument without the
argument being revisited. That is a small thing and a useful signal — a comment
that has stopped describing the code is worse than no comment, because it is
believed.

Eight is roughly where a flat list stops being scannable, and it does not
survive what this phase adds. The list is now grouped by the question the
teacher is answering:

| Group | Entries |
| --- | --- |
| *(ungrouped)* | Dashboard, Enquiries |
| **Students** | Students & results, Student stories |
| **Website** | Website text, Batches, Announcements, Website preview |
| **Data** | Import & export |

Each heading is a real `<h2>`, not a styled `<span>`, so a screen-reader user
navigating the sidebar by heading gets the same four-way split a sighted user
gets from the gaps.

**Defect found while doing this — raw slugs in the admin.** The dashboard and
the enquiry detail page printed `class-12-commerce` where the public site, two
clicks away, says *Class XII Commerce*. The preview page resolved it correctly
but did so inline, by hand. All three now call one `courseLabel()` helper, which
falls back to the slug rather than to a blank — an unknown slug is a data
problem the teacher needs to see, not one to hide.

---

## Topics 2 and 3 — Content architecture and the Website Editor

The owner selected four editable scopes: **contact details, homepage and About
copy, navigation and footer links, and course descriptions (not slugs)**. All
four are built.

### The architecture, and what it refuses to do

**A closed registry, not a page builder.** `src/config/site-content.ts` declares
every editable field: a key, a type, a length limit, a validator and a fallback.
If a key is not in that file it cannot be written, cannot be read, and cannot
reach a page. The brief forbids arbitrary HTML editing and is right to — a
rich-text field is a stored-XSS hole and a way for one bad paste to destroy a
layout. No value on this site is ever passed to `dangerouslySetInnerHTML`.

**Every field has a fallback, and the fallback is the text that shipped.** The
hardcoded copy stays exactly where it is and becomes the default. Three
consequences, each deliberate:

1. An empty database renders precisely the site that exists today.
2. Clearing a box is an **undo**, not a way to publish a blank heading.
3. Nothing is invented. Every fallback is either confirmed brand copy or a fact
   already marked `unverified` in `institute.ts`.

**Navigation is label-and-visibility only.** Phase 6 deleted four menu entries
because all four pointed at pages that 404'd. An editable `href` would put that
back within one save, in the most prominent element on the site. So the
destination of every entry stays in code; what the teacher controls is what it
is **called** and whether it is **shown**. Hiding an entry hides its footer link
too, and a footer column left with no links renders nothing rather than an empty
heading.

**Slugs are not editable**, at the owner's direction and for a hard reason: a
slug is a route segment and a `generateStaticParams` input, so renaming one
404s every link already printed on a poster.

**Editing is not verification.** `isIndexable()` refuses to let search engines
index the site while any institute fact is unverified. A teacher typing an
address is not the same event as somebody confirming it is correct, and treating
it as one would let a typo flip the site to indexable — the precise failure the
gate exists to prevent. That is written into the module as
`VERIFICATION_IS_SEPARATE`, not left to be re-derived later.

### Storage

One additive migration, `20260826090000_site_settings`. Pure ASCII, and it
creates one table without touching anything that exists, so the 21 hand-written
CHECK constraints from Phase 12 are undisturbed — `verify:constraints` still
reports **43 passed, 0 failed**. Three new CHECK constraints bound the key
charset, the value length and printability in the database, behind the
application allowlist.

### Derived, not stored twice

`tel:` and the WhatsApp link are computed from the displayed number. A site that
prints one number and dials another loses the enquiry and looks fraudulent, and
that is exactly what separate "display" and "e164" fields invite the first time
somebody updates one and not the other. A unit test pins it: every accepted
input form derives the same E.164 number.

### What the editor drives

Header, footer, floating WhatsApp button, homepage, About, Contact, Admissions,
the course pages, the 404 page — and the **JSON-LD**. Structured data is a
machine-readable copy of what the page says, and Google treats a mismatch as a
quality signal against the site; if the visible address changed and the JSON-LD
kept announcing the old one, the site would be telling a search engine something
different from what it tells a person, on the single field a local listing is
matched on.

**One deliberate gap, recorded rather than papered over.** Opening hours are a
free-text field, because that is what a teacher can actually write ("Mon to Sat,
9 to 7, closed Sunday"). `openingHoursSpecification` needs a machine day-of-week
and 24-hour times, and parsing that sentence into a schema is guessing. A
guessed opening time in a knowledge panel sends somebody to a locked door, so
the visible page shows the teacher's words and the structured data stays silent.

### Verification

Driven against a real browser and an anonymous HTTP client:

| Check | Result |
| --- | --- |
| Anonymous request to `/admin/website` | redirected; no editor content in the body |
| All five groups render, pre-filled with live values | pass |
| Edit saved, then fetched as a **logged-out visitor** | the new text is on the public homepage |
| Original text gone after the edit | pass — revalidation works |
| Malformed phone number | refused with a plain-language message |
| The refused value | never reached the public site |
| An unregistered key injected into the form payload | **never written** — 6 rows stored, all legitimate |
| Restore | original text back on the public site, marker gone |

**20 passed, 0 failed**, plus a direct database inspection confirming the
injected key is absent and three audit entries were written.

**A defect this found in my own code.** The first render of the editor returned
a 500. `EditableField` carries a `validate` function, and a function cannot
cross the server-to-client boundary. The fix is a `FieldView` projection with no
functions — which is better than a workaround: validation now stays entirely on
the server, where it cannot be edited by whoever is holding the browser.

**The deployment contract did its job.** Adding a table, three constraints and a
route broke four contract tests immediately — *"an undocumented route is one
nobody decided the auth and crawlability rules for"*. All four are now recorded
in `deployment-contract.ts`.

---

## Interim verification status

Production build, real PostgreSQL 18.4, ZZSHOW demo dataset seeded.

| Suite | Result | Phase 14 |
| --- | ---: | ---: |
| Typecheck · Lint | clean · clean | same |
| Unit | **307** (+31 new) | 276 |
| Security | **262** | 262 |
| SEO | **335** | 335 |
| Real-browser UX | **249** | 249 |
| Consent constraints | **43** | 43 |
| CMS end-to-end (new) | **20** | — |
| Performance budget | 71 of 72 — pre-existing, see Topic 13 | 72 |

### A harness defect found and fixed — the sign-in ceiling

`verify:security` reported *"a per-instance ceiling bounds sign-in work for
accounts that do not exist: 70 processed, 0 refused"*. Before touching any
product code I established two things:

1. **It is not a Phase 15 regression.** Stashing every source change, rebuilding
   and re-running reproduced the identical failure on the pre-Phase-15 tree.
2. **It is not a product defect either.** The server log shows the 70 attempts
   spanned **76.5 seconds**, and the busiest 60-second window inside that run
   held **55** of them. The ceiling is 60 per 60 seconds. It was never crossed.

The check had quietly become a measurement of how fast this laptop can issue
HTTP requests — passing on a fast machine, failing on the same machine once it
was also running PostgreSQL and a seeded dataset, and reporting a product defect
either way. A check that cries wolf when the harness is slow is worse than no
check, because it trains the reader to ignore it.

The attempts are now issued **concurrently, in batches**, which both removes the
machine dependency and is more faithful — nobody attacking a sign-in form does
it one request at a time. The failure detail now distinguishes the two cases
explicitly: *"if processed >= 60 with 0 refused the ceiling is broken; if
processed < 60 the harness was too slow to reach it"*. The suite returns to
**262 passed, 0 failed**.

Note for anyone re-running it: section 21 deliberately exhausts a per-process
budget that takes a minute to refill. Two runs back to back will fail the second
one. That is the control working.

---

*(Sections for the remaining topics are appended as each is completed.)*
