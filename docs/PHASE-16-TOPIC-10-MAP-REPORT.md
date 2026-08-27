# PHASE 16 — TOPIC 10 · MAP / LOCATION

**Status:** COMPLETE. Built, attacked, and verified from documentation through
source, database, admin action, revalidation, public response and a real
browser.

---

## 1. Executive summary

The site promised directions in two places and delivered them in none: the
homepage said "Contact & directions" and `/about` said "Get directions", and
both linked to `/contact`, which had Call, WhatsApp and Enquiry — and no
directions. The map band had been hidden since Phase 6 behind a gate
(`institute.placeId || institute.coordinates`) that no teacher could ever open,
because both are typed constants set to `null`.

Topic 10 ships:

- **A directions link, now**, on `/contact` and the homepage, built from the
  CMS address. No key, no coordinates, no CSP change.
- **A click-to-load keyless Google Maps embed**, gated on a coordinate pair a
  teacher enters in Website text. Nothing loads from Google until somebody
  presses "Show the map".
- **One new CMS field**, `contact.coordinates`, validated as two numbers.
- **No new table, no migration, no dependency, no API key, no CSP change.**

Measured: **27 requests on `/contact`, all same-origin, zero third-party hosts**
before the click; **+2 requests to `www.google.com`** after it.

---

## 2. Inventory

| Source | Purpose | Current implementation | Documented requirement | Admin editable? | External service? | Security | Privacy | Status |
| --- | --- | --- | --- | :-: | :-: | --- | --- | --- |
| `src/config/institute.ts` `address` | NAP source of truth | typed, `status: 'unverified'` | Master Plan §17 | via CMS override | no | none | published address | shipped |
| `institute.placeId` / `coordinates` | map gate | both `null`, in `AWAITING_CLIENT` | §15 client input | **no — this was the gap** | no | none | pin precision | **replaced by CMS field** |
| `institute.googleBusinessProfileUrl` | `hasMap` in JSON-LD | `null` | §15 | no | no | none | none | still awaiting client |
| `contact.{landmark,line1,city,state,postalCode}` | address | CMS with config fallback | §17 | **yes** | no | length + PIN validator | address | shipped |
| `contact.{phonePrimary,phoneSecondary,hours}` | contact block | CMS | §15 | **yes** | no | phone validator | phone | shipped |
| `/contact` | location page | text + actions, map `Hidden` | §04, §15 | — | no | — | — | **extended** |
| homepage location band | "prove it's real and near" | address + Call + link to /contact | band 13 | — | no | — | — | **extended** |
| `/about` CTA | secondary action | said "Get directions", went to /contact | — | — | no | — | — | **label corrected** |
| `next.config.ts` CSP | frame policy | `frame-src … https://www.google.com` **unused** | §15 | no | Google | pre-allocated for this topic | — | **now used, unchanged** |
| `src/lib/seo.ts` | JSON-LD | `PostalAddress` from CMS, `geo` from **config** | §17 NAP consistency | — | no | — | NAP drift risk | **fixed** |
| `docs/DEPLOYMENT-HUMAN-CHECKLIST.md` C1 | address verification | **unchecked** | pre-launch gate | — | — | — | — | still open |
| `.env.example` | operator contract | no maps entry | — | — | — | — | — | unchanged |

---

## 3. Documentation findings

**A. What is promised.** Master Plan §15: the location experience appears twice
— a homepage band and the substance of `/contact` — "both render the same
component reading the same config module, so the NAP cannot drift". Contents:
*actions before information* (Get Directions, Call, WhatsApp as large targets at
the top), the full address plus a human landmark line, opening hours, and "the
map, loaded on interaction".

**B. Static or CMS?** Both. The typed module is the fallback; `contact.*` CMS
keys override it. Already implemented before this topic.

**C. What kind of map?** §15 is explicit: *"A static styled map image or a
lightweight placeholder renders first; the interactive embed loads on click. An
eagerly-loaded Google Maps iframe is typically the heaviest thing on a page and
it sits below the fold."*

**D–E. Google, and a key?** Google, and **no key required**: §15 says *"the
no-key embed is also acceptable and avoids the key entirely."*

**F–G. Existing origin and CSP allowance?** Yes —
`frame-src … https://www.google.com` has been in the CSP since Phase 3 and
**nothing used it**. It was pre-allocated for this topic.

**H. Where?** Homepage band and `/contact` (Master Plan band 13 and §04).

**I. Editable from `/admin/website`?** The address already was. The map point
was not, and could not be — see §15 below.

**J. Coordinates documented?** No. §15 lists them under *client input*, and
`institute.coordinates` is `null` in `AWAITING_CLIENT`.

**K. Launch checklist?** Item **C1 — "Full postal address, in writing, matching
the Google Business Profile exactly" — is unchecked.**

**L. Structured data?** `PostalAddress` always; `geo` only when coordinates
exist; `hasMap` only when the Business Profile URL exists.

**M. Privacy?** Yes — an eagerly-loaded embed announces every visitor to Google.
§15's click-to-load requirement is as much a privacy decision as a weight one.

### Contradiction found and resolved

`src/config/institute.ts` marks the address `status: 'unverified'` and the
launch checklist has **not** confirmed it against the Google Business Profile —
yet the address is published on `/contact`, the homepage and in JSON-LD.

That is not actually a contradiction once the two claims are separated:

- **The address as text** is what the institute says its address is. Publishing
  it unverified is a business risk the project already accepted.
- **A map pin** is a claim about a doorway. §15 itself notes "Pratap Nagar is a
  large sector"; a pin resolved from a sector-level address lands somewhere in
  the middle of it, which actively misleads somebody trying to arrive.

So the two are treated differently, and that split is the architecture (§4). The
**stale part** was `nav`-adjacent: `/contact` gated the map on two constants no
teacher could set. That is now corrected, and the comment in `contact/page.tsx`
records the change.

---

## 4. Architecture decision

**Chosen: (C) static placeholder + click-to-load keyless embed, plus (A) an
external directions link — with the two gated differently.**

| | Ships when | Built from | Gate |
| --- | --- | --- | --- |
| **Get directions** | **now** | the CMS address, or coordinates when present | none |
| **Map embed** | when a teacher enters coordinates | coordinates only | `contact.coordinates` |

**Why directions can ship unverified.** A directions URL is a *search* handed to
Google — it is Google's answer to "where is this address", not our assertion
about a point. It is also what two existing buttons already promised.

**Why the embed cannot.** An embed drops a pin. A pin at an unverified,
sector-level address is a claim the project cannot support, and this codebase's
consistent rule is that unsupported facts render nothing.

**Why coordinates rather than a pasted Maps URL.** The task's §6 and §20 both
say to prefer a canonical identifier over a stored URL. Coordinates go further
than "prefer": the entire URL threat model — schemes, lookalike hosts, userinfo
bypasses, IDN homographs, CRLF, protocol-relative, percent-encoding — becomes
**inexpressible**, because the field cannot hold anything but two decimal
numbers in range. There is nothing to filter because there is nowhere to write
it. Coordinates are also what a teacher can actually obtain: right-click in
Google Maps, click the numbers, paste.

**Why no Place ID.** Also a canonical identifier, but obtaining one needs a
developer tool, and it cannot build a directions URL without a second lookup.

**Why no API key.** §15 permits the keyless embed explicitly. A key would add a
credential to restrict, rotate and leak.

**Why `www.google.com` and not `maps.google.com`.** Measured, not assumed:
`https://www.google.com/maps?q=…&output=embed` redirects to
`https://www.google.com/maps/embed?…` — **same origin** — and a real browser
frames it with no violation. `maps.google.com` would have required a new CSP
origin. **So the CSP is unchanged.**

**Rejected: (D) eager iframe** (contradicts §15), **(E) Maps JavaScript API**
(a key, a script origin, and a `script-src` weakening for a static pin),
**a database table** (a single scalar belongs in the CMS key/value store that
already exists).

---

## 5. Implementation

| File | Change |
| --- | --- |
| `src/lib/location.ts` | **new** — pure: `parseCoordinates`, `validateCoordinates`, `formatCoordinates`, `directionsUrl`, `mapEmbedUrl`, `mapViewUrl` |
| `src/components/domain/map-panel.tsx` | **new** — CSS placeholder → iframe on click, plus an "Open in Google Maps" fallback link |
| `tests/location.test.ts` | **new** — 26 unit tests, the whole §7/§20 threat list |
| `scripts/verify-map.mjs` | **new** — 142 browser/database assertions |
| `src/config/site-content.ts` | registered `contact.coordinates` (line, max 40, blankable, validated) |
| `src/lib/site-content.ts` | `ContactBlock` gains `coordinates` and `directionsHref`, both re-parsed on read |
| `src/lib/seo.ts` | `geo` now reads the **resolved** value, not config |
| `src/app/(site)/layout.tsx` | passes the resolved coordinates into the JSON-LD |
| `src/app/(site)/contact/page.tsx` | directions button in the top actions; map section replaces the dead `Hidden` gate |
| `src/app/(site)/page.tsx` | homepage band's second button is now a real directions link |
| `src/app/(site)/about/page.tsx` | button relabelled "Find us" — it goes to `/contact`, so it stopped promising directions |
| `scripts/verify-ux.mjs` | error-attribution fix (§17) |
| `scripts/verify-videos.mjs` | third-party measurement fix (§17) |

**No new dependency. No migration. No CSP change. No environment variable.**

---

## 6. Admin / CMS behaviour

One field in the existing Website Editor, under Contact details:

```
Map location
Optional. In Google Maps, right-click the institute's front door and click the
numbers at the top to copy them, then paste them here — for example
26.849123, 75.805456. Leave blank and no map is shown.
```

- **Key** `contact.coordinates` · **kind** line · **max** 40 · **blankable**
- **Validator** `validateCoordinates` — empty is valid; anything else must parse
- **Fallback** `institute.coordinates` (null today) → map hidden
- **Renders** `/contact`, declared in the registry and asserted by `verify:cms`
- **Audit / stale-edit / revalidation** — inherited from the CMS group action,
  not reimplemented

Verified end to end, as an anonymous visitor rather than inside the admin
session: enter → map appears; clear → map disappears; directions survive both.

---

## 7. Security threat model

| Threat | Status |
| --- | --- |
| `javascript:` `data:` `vbscript:` `file:` `blob:` `ftp:` | **inexpressible** — refused by the parser and by the CMS validator |
| `https://evil.example`, `http://evil.example` | inexpressible |
| `https://google.com.evil.example` | inexpressible |
| `https://evil.example@www.google.com`, `https://www.google.com@evil.example` | inexpressible |
| IDN / punycode homographs | inexpressible |
| protocol-relative `//host` | inexpressible |
| percent- and double-percent-encoded values | inexpressible |
| CRLF / newline / tab / NUL / vertical tab | refused (see D-2) |
| HTML, SVG, iframe and XSS payloads | inexpressible |
| localhost, `127.0.0.1`, `0.0.0.0`, `169.254.169.254`, `[::1]`, RFC1918 | inexpressible |
| extremely long values | refused before parsing (64-char cap after trim) |
| out-of-range coordinates | refused (±90 / ±180) |
| **SSRF** | **no surface.** The server never fetches a value from this field. The directions URL is a link the visitor may follow; the embed is an iframe the visitor's browser loads after clicking. Both are built by our code from two numbers |
| iframe injection | structurally impossible — `mapEmbedUrl` takes `Coordinates`, not a string |
| unregistered CMS key | refused by the registry; `only=` naming an unknown or other-group key is refused |
| CSRF | cross-origin POST refused |
| unauthorised mutation | anonymous redirected at the edge; forged session refused by the action |
| stale overwrite | lost-update token rejects the older editor |

---

## 8. Security tests

`npm run verify:map` — **142 passed, 0 failed**, plus 26 unit tests.

Highlights, each with a control proving it was not vacuous:

- **32 hostile values** posted through the real editor; the stored value was
  `26.849123,75.805456` after every one. **Control:** a *different* valid point
  (`19.076,72.8777`) IS accepted through the same path, so the endpoint is not
  simply refusing everything.
- **Unregistered keys** (`contact.mapsUrl`, `contact.placeId`,
  `zzmap.unregistered`) smuggled alongside a legitimate save, and named in
  `only=` — none written, row count unchanged, legitimate value untouched.
- **XSS**: payloads stored via the editor never reached the page, and
  `window.__zzmap_xss` was never set in a real browser.
- **CSRF/auth**: anonymous → 307 at the edge; forged session → handled, value
  unchanged; cross-origin with a real session → refused.
- **Stale edit**: tab A's older token could not overwrite tab B's change; tab
  B's value survived.

---

## 9. CSP analysis

**Unchanged.** Directives affected: `frame-src` only, and it already contained
`https://www.google.com`.

Verified in a real browser via `securitypolicyviolation` — not via `onload`,
which fires even for a blocked frame (the Topic 9 lesson):

| Frame | Result |
| --- | --- |
| `https://example.com/` | **blocked**, `frame-src` |
| `https://maps.google.com/maps?q=…&output=embed` | **blocked**, `frame-src` |
| `https://www.google.com/maps?q=…&output=embed` | **not blocked** (control) |
| `https://www.youtube-nocookie.com/embed/…` | **not blocked** — Topic 9 intact |

Asserted against the live response header: no wildcard in `frame-src`, no
blanket `https:`, no `googleapis.com`, no `*.google`.

---

## 10. Privacy / network analysis

Measured with **CDP `Network.requestWillBeSent`**, not the performance API —
see §17 for why that distinction produced a false result first.

| `/contact` | Requests | Third-party hosts | iframes |
| --- | :-: | --- | :-: |
| On load | **27** | **none** | **0** |
| After "Show the map" | 29 | `www.google.com` | 1 |

**What can be claimed:** a visitor who reads the address, calls, or taps
directions without pressing the map button causes **no request to Google from
their browser**. The placeholder is drawn in CSS from the site's own tokens; no
static map image is fetched, precisely because fetching one would be the contact
this design avoids.

**What cannot be claimed:** nothing about what Google does once the visitor
presses the button, or once they follow the directions link. Both hand the
visitor to Google deliberately, and the placeholder says so in words: *"The map
loads from Google only when you ask for it, so nothing is sent to them before
you do."*

The map does not exist on any other page, so no other route is affected.

---

## 11. Accessibility

**Tested and passing** (programmatically, in Chrome):

| Check | Result |
| --- | --- |
| Map trigger is a real `<button>`, keyboard-focusable and activable | yes |
| Its name says what it does ("Show the map") | yes |
| Activating by keyboard loads the map | yes |
| Decorative pin glyph is `aria-hidden` | yes |
| iframe carries a `title` naming the place | yes |
| iframe grants **no** permissions (`allow` absent) | yes |
| Address is a semantic `<address>` element | yes |
| Directions link has a meaningful name | yes |
| Every external link carries `rel="noopener noreferrer"` and says "(opens in a new tab)" | yes |
| Exactly one `h1`; no skipped heading levels | yes |
| No `div`/`span` used as a button; no positive `tabindex` | yes |
| Touch targets ≥ 24×24 at 320px | yes |
| Dark-mode AA contrast | via `verify:ux`, 333/333 |
| No keyboard trap (there is no modal — the map replaces the placeholder in place) | yes |

**NOT TESTED**

| What | Why | Environment limitation | Before launch |
| --- | --- | --- | --- |
| Real screen readers (NVDA / JAWS / VoiceOver) | none installed | Windows box with no AT | one pass over `/contact` with NVDA |
| The Google Maps embed's own accessibility | third party inside an iframe | outside this application | note as a third-party dependency |
| Real touch hardware | emulated only | no device | a phone check on the directions hand-off |

---

## 12. Responsive / browser QA

`/contact` and `/` at **320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1440** —
no horizontal overflow at any width, plus the **open map state at 320px**
(iframe stays inside the viewport; page does not widen), which a page-level test
never reaches.

| Browser | Status |
| --- | --- |
| **Chrome 151** | **TESTED** |
| **Edge** | **NOT TESTED** — not installed on this machine |
| **Firefox** | **NOT TESTED** |
| **Safari / WebKit** | **NOT TESTED** — no WebKit on Windows, no Playwright in this project |

---

## 13. SEO

- `/contact` metadata, canonical and sitemap entry unchanged.
- `PostalAddress` still built from the CMS address.
- **`geo` now reads the resolved coordinates**, so the JSON-LD and the visible
  map cannot disagree (§15 below).
- `geo` is absent when no coordinates exist — verified by asserting
  `GeoCoordinates` is **not** in the HTML before, present after, and gone again
  when cleared.
- **No `LocalBusiness` markup added.** The site emits
  `EducationalOrganization`; upgrading it would mean asserting a business
  category and opening hours the institute has not supplied.
- No localhost leakage: `verify:seo` 418/0, `verify:production --expect-prelaunch`
  25/0.

---

## 14. Performance

| Route | JS | CSS | Font | HTML | Total | Requests |
| --- | --- | --- | --- | --- | --- | :-: |
| `/contact` | **191.2 KB** | 10.1 KB | 89.0 KB | 8.5 KB | **298.9 KB** | within budget |

`/contact` passes **every** budget. Its JS rose 190.0 → 191.2 KB: the
`MapPanel` client component, ~1.2 KB for the whole click-to-load mechanism. The
homepage gained **zero** JavaScript — its directions button is a plain link in a
server component.

**The budget was not modified.** The three routes that exceed the request-count
limit are unchanged from before this topic:

| Route | Requests | Classification |
| --- | :-: | --- |
| `/` | 29 | pre-existing (Topic 9 band, reported there) |
| `/gallery` | 24 | pre-existing, first measured in Topic 9 |
| `/results` | 22 | pre-existing, reproduced at HEAD in Topic 7 |

**Topic 10 added nothing to any request count**, because the map costs nothing
until it is asked for.

---

## 15. Defects found

### D-1 · The site promised directions and delivered none — **MEDIUM**

- **SEVERITY** Medium. Two prominent buttons led to a page that could not do
  what they said.
- **SYMPTOM** Homepage "Contact & directions" → `/contact`; `/about` "Get
  directions" → `/contact`; `/contact` had Call, WhatsApp, Enquiry and no
  directions.
- **ROOT CAUSE** The location experience was gated as a whole on
  `institute.placeId || institute.coordinates`, both `null` and both unreachable
  from the admin. Directions were treated as part of the map rather than as a
  thing that works from an address.
- **MEASURED** `grep` for a maps URL across `src/` returned nothing; the served
  `/contact` HTML contained no `google.com/maps` link.
- **FIX** `directionsHref` on the contact block, used on `/contact` (top
  actions) and the homepage band; `/about`'s button relabelled "Find us".
- **REGRESSION TEST** `verify:map` §1 asserts both routes carry a directions
  link whose destination is the institute address.
- **VERIFICATION** Both routes serve
  `https://www.google.com/maps/dir/?api=1&destination=Near%20Pannadhay%20Circle…`.

### D-2 · The coordinate parser accepted control characters — **LOW**

- **SEVERITY** Low. The parsed output was two numbers either way, so nothing
  could be injected downstream.
- **SYMPTOM** `26.8,\r75.8` parsed successfully.
- **ROOT CAUSE** The separator was `\s*`, and `\s` matches CR, LF and tab.
- **MEASURED** A unit test asserting control characters are refused failed.
- **FIX** ` *` — a literal space is the only thing a human types after a comma.
- **REGRESSION TEST** `tests/location.test.ts` — CR, LF, tab, NUL, vertical tab.
- **VERIFICATION** 26/26 unit tests pass.

### D-3 · `geo` structured data would have drifted from the page — **MEDIUM, prevented**

- **SEVERITY** Medium if shipped: the JSON-LD would announce one location to a
  search engine while the page showed another, on the single field a local
  listing is matched on.
- **ROOT CAUSE** `instituteJsonLd` read `institute.coordinates` from config
  while the address came from the CMS. Harmless only because both were unset —
  the moment a teacher could set coordinates, the two diverge.
- **MEASURED** Found by reading `seo.ts` against the new CMS field before
  wiring it.
- **FIX** `JsonLdContact` carries `coordinates`; `layout.tsx` passes the
  resolved value; config remains the fallback for callers with no database.
- **REGRESSION TEST** `verify:map` §2 asserts the *same* point appears in the
  JSON-LD, and §8 asserts `GeoCoordinates` disappears when the value is cleared.
- **VERIFICATION** Both pass.

### D-4 · `/announcements` horizontal overflow — **carried over, now closed**

Fixed earlier in this session and re-verified here: `verify:ux` 333/0 across
three consecutive runs. Recorded because Topic 8 wrongly called it
"intermittent"; it was a missing `overflow-wrap` on the announcement message.

---

## 16. Defects fixed

All of D-1 through D-4. No known defect is left open by this topic.

---

## 17. Test-harness defects

Separated from application defects because each produced a result that was
**not true**.

| # | Defect | The false result |
| --- | --- | --- |
| H-1 | `verify-map` matched the editor form with `value="contact.coordinates"` | The field renders as `name="…"`, so no form matched, `fieldsOf` returned `{}`, and every POST was an empty payload the action answered 500. **Thirty assertions "failed" for one reason unrelated to what they tested.** Fixed to match on `name=` |
| H-2 | `verify-map` posted whole-group payloads | `fieldsOf` collects only `<input>`, and the action turns an absent key into `""` — so every save would have **blanked `contact.hours`**, a textarea it never intended to touch. Fixed by using the action's `only=` single-key path, and the teardown now asserts `contact.hours` was not collaterally blanked |
| H-3 | `verify-map` asserted a non-empty lost-update token at start | With the suite's own row just deleted the group has no rows, so the token is legitimately `""` — which the action must accept or no field could ever be saved the first time. The assertion was asserting that the database had content. Narrowed to "the field exists"; the guard itself is proved in §6 from the other direction |
| H-4 | `verify-map` reset the value with a direct Prisma delete | A direct write fires no revalidation, so `/contact` kept serving a cached render *with* a map while the table was empty, and three assertions failed against a stale page. The reset now goes through the real editor action |
| H-5 | Third-party contact measured with `performance.getEntriesByType` | It reports resources of the **top document**; a cross-origin iframe's own navigation is not reliably among them. `verify-map` measured 22 requests before the click and 22 after **while an iframe pointing at google.com sat in the DOM** — it would have reported "Google is never contacted", the most flattering possible wrong answer. **`verify-videos` had the identical defect and had started failing for it.** Both switched to CDP `Network.requestWillBeSent` |
| H-6 | `verify-ux` attributed console errors to the wrong route | Chrome delivers a failed resource's console entry asynchronously, so `/videos`' demo-poster failures landed in `/results`' bucket — making `/results` fail and `/videos` pass, both for the wrong reason. Fixed with a settle measured at 900 ms (400 ms was tried and still failed 2 runs in 3), plus an exemption scoped **by request** — a failed resource is discounted only on a navigation that actually asked `i.ytimg.com` for a poster, and only there |

**Environment, not defects**

- `verify:cms` failed once at sign-in because `verify:security`'s brute-force
  tests had tripped the account throttle. Restarting the server cleared it;
  71/0. The product limit was not weakened.
- `verify:media` consumes the upload limiter, so `verify:faculty` must follow a
  restart. Same as previous topics.
- The demo video posters return 404 (synthetic ids cannot resolve) and once
  returned **500** when the network to `i.ytimg.com` hiccuped. That is why H-6's
  exemption is scoped by request rather than by status code.

---

## 18. Regression results

| Suite | Result |
| --- | --- |
| `npm test` (unit) | **487 passed, 0 failed** (was 461; +26 location) |
| `verify:map` | **142 passed, 0 failed** |
| `verify:seo` | 418 passed, 0 failed |
| `verify:ux` | **333 passed, 0 failed** (×3 consecutive) |
| `verify:security` | 262 passed, 0 failed |
| `verify:videos` | 230 passed, 0 failed (×2 after H-5 fix) |
| `verify:reviews` | 224 passed, 0 failed |
| `verify:gallery` | 206 passed, 0 failed |
| `verify:faculty` | 130 passed, 0 failed |
| `verify:teacher` | 121 passed, 0 failed |
| `verify:import` | 116 passed, 0 failed |
| `verify:media` | 112 passed, 0 failed |
| `verify:cms` | 71 passed, 0 failed |
| `verify:integration` | 67 passed, 0 failed |
| `verify:e2e` | 62 passed, 0 failed |
| `verify:public` | 46 passed, 0 failed |
| `verify:constraints` | 43 passed, 0 failed |
| `verify:revalidation` | 10 passed, 0 failed |
| `typecheck` / `lint` | clean |
| `verify:production --expect-prelaunch` | **25 passed, 0 failed** |
| `verify:preflight` (empty content DB) | **SAFE TO DEPLOY** |
| `verify:budget` | 101 passed, 3 failed — all pre-existing, see §14 |

---

## 19. Database verification

**No migration was created, and none was edited** — `git status prisma/` is
empty. The coordinate value is a row in the existing `site_settings` key/value
table, which is what that table is for.

Read from live PostgreSQL against the deployment contract:

```
expected CHECK constraints: 43 | live: 43
MISSING (Phase-12 style loss): 0
unexpected extra:             0
tables live: 15 | unexpected: none
settings rows: 6 | contact.coordinates rows: 0 (suite restored)
Non-ZZSHOW content rows: 0
```

---

## 20. Deployment / preflight status

| Item | Status |
| --- | --- |
| Launch switch | **OFF**, untouched |
| Preflight, empty content database | **SAFE TO DEPLOY** (63/0) |
| Preflight, demo data present | fails `P-DB-12` — the gate working as designed |
| Production smoke, pre-launch mode | **25/0** |
| Environment variables | **none added, none changed** |
| External services | none provisioned, no credential created, no API key |
| CSP | unchanged |

---

## 21. Known limitations

1. **The map is off until somebody enters coordinates.** By design, and the
   admin says so.
2. **Only Chrome tested.** Edge was requested and is not installed here.
3. **No real screen-reader testing.**
4. **The embed is a third party.** Once a visitor presses the button, what
   Google loads, sets and logs is outside this project's control.
5. **No `LocalBusiness` / opening-hours structured data** — the facts are not
   held.
6. **`institute.googleBusinessProfileUrl` is still null**, so `hasMap` is still
   absent from the JSON-LD. Unrelated to the coordinates work; still awaiting
   the client.
7. **A coordinate pair is a teacher's judgement.** Nothing verifies the point is
   the institute; the six-decimal cap and the range check bound the value, not
   its truth.
8. **The directions link uses the address until coordinates exist**, so before
   verification it resolves to a sector rather than a doorway. That is Google's
   search result, not a claim by us, but it is worth knowing.
9. **Pre-existing request-count budget failures** on `/`, `/gallery`,
   `/results` (§14).

---

## 22. External dependencies

| Dependency | Used for | Failure behaviour | Verified |
| --- | --- | --- | --- |
| `www.google.com` (maps embed) | the interactive map, after a click | **tested with the host fully blocked**: `/contact` still returns 200, the address, directions link, map trigger and "Open in Google Maps" fallback all render, and there are **zero uncaught page errors** | yes |
| `www.google.com` (directions URL) | an outbound link | a link the browser follows; nothing to fail on our side | n/a |

No server-side dependency on Google exists. Nothing is fetched at build or
render time.

---

## 23. Human decisions required

1. **Verify the address against the Google Business Profile** — checklist item
   **C1**, still open. Until then the address is `status: 'unverified'`.
2. **Supply the coordinates** of the front door, then paste them into
   Website text → Contact details → Map location. No deploy needed.
3. **Supply the Google Business Profile URL** to enable `hasMap` in the
   structured data.
4. **Decide whether the request-count budget of 20 should be revised** — three
   routes exceed it and it has not been changed in three topics.

---

## 24. Final verdict

Topic 10 is complete. The location experience matches Master Plan §15 as far as
the supplied facts allow: actions before information, address with landmark,
directions that work today, and a map that loads on interaction and stays hidden
until somebody verifies a point.

The security position is stronger than "validated": the operator input is two
numbers, so the URL threat model is unreachable rather than filtered, and there
is no SSRF surface because nothing is fetched. The CSP was not touched. The
privacy claim — no third-party contact before a click — is measured, at the
network layer, with a control proving the measurement can see third-party
contact when it happens.

Six harness defects were found and fixed. Two of them would have reported a
flattering falsehood: one measured "Google is never contacted" while an iframe
pointing at Google sat in the DOM, and one would have silently blanked a field
it was not testing.

---

## 25. Recommendation for Topic 11

**Topic 11 — Inventory.** The Phase 16 plan describes it as machine-readable and
derived from the CMS registry's declared render locations — **no new table**.
It is the right next step now rather than earlier: Topics 4–10 have each added
registry entries, routes and admin surfaces, and Topic 10 was the last one that
changes what there is to inventory. Building it before now would have meant
rewriting it after every topic.

Topic 12 (admin UX coherence) should follow it, because the inventory is the
document that shows which admin surfaces exist and therefore what needs
regrouping.

**The larger unstarted risk remains production media storage** — still the Topic
5 boundary, still unimplemented, and now blocking real photographs for the
gallery and faculty. It is not a topic in this phase but it outranks Topics
11–12 if the institute is close to supplying photography.
