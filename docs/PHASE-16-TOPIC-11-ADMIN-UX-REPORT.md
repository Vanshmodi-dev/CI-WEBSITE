# PHASE 16 — TOPIC 11 · ADMIN UX COHERENCE & CONTENT MANAGEMENT COMPLETENESS

**Status:** COMPLETE.

---

## 1. Executive summary

The question this topic had to answer is: **can a non-technical institute owner
maintain this website without a developer?**

The answer is now yes for every content item the project intends to be editable,
and the evidence is a new suite that checks **all 49 registered CMS fields**
individually rather than a representative sample — writing a marker through the
real editor, then fetching the declared public page as a logged-out visitor.

Three real application defects were found and fixed:

| | Defect | Severity |
| --- | --- | --- |
| **D-1** | Announcements and batches had **no lost-update protection** — a second tab silently overwrote the first with no warning | HIGH |
| **D-2** | **Every admin form discarded what the teacher had typed** when a save was refused | HIGH |
| **D-3** | Six harness defects, two of which reported a working product as broken and one of which contaminated unrelated suites | — |

**No schema change. No migration. All 43 CHECK constraints intact. Launch switch
OFF.**

---

## 2. Exact inventory

**28 admin pages, 13 action modules, 23 exported server actions.**

| Route | Writes | Auth | Stale-edit | Audit | Reval | Id check |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `/admin` (dashboard) | — | yes | — | — | — | — |
| `/admin/login` | session | — | — | yes | — | — |
| `/admin/logout` | session | yes | — | yes | — | — |
| `/admin/website` | site_settings | yes | **yes** | yes | yes | n/a |
| `/admin/preview` | site_settings (single key) | yes | **yes** | yes | yes | n/a |
| `/admin/faculty` `/new` `/[id]` | faculty | yes | **yes** | yes | yes | yes |
| `/admin/gallery` `/new` `/[id]` | gallery_items | yes | **yes** | yes | yes | yes |
| `/admin/videos` `/new` `/[id]` | videos | yes | **yes** | yes | yes | yes |
| `/admin/students` `/new` `/[id]` | toppers | yes | **yes** | yes | yes | yes |
| `/admin/stories` `/new` `/[id]` | student_stories | yes | **yes** | yes | yes | yes |
| `/admin/announcements` `/new` `/[id]` | announcements | yes | **ADDED (D-1)** | yes | yes | yes |
| `/admin/batches` `/new` `/[id]` | batches | yes | **ADDED (D-1)** | yes | yes | yes |
| `/admin/enquiries` `/[id]` | enquiries | yes | no — see §31 | yes | yes | yes |
| `/admin/media` | media_assets | yes | n/a | yes | yes | media key |
| `/admin/reviews` | cache only | yes | n/a | yes | yes | n/a |
| `/admin/data` | import | yes | n/a | yes | yes | n/a |

**Contradiction classes A–G:** none found for A, B, C, E, F.
**D (reachable but not in navigation):** only `/admin` (the logo link) and
`/admin/login` (pre-auth) — correct.
**G (exists but cannot accomplish the task):** none; §5 proves all 49 fields
work end to end.

---

## 3. Documentation reviewed, and what was *checked* rather than believed

| Claim | Source | Verdict |
| --- | --- | --- |
| "Every registered field declares one public render location, and a test proves the key is *actually read* by source serving that route" | Phase 16 report | **TRUE.** `tests/site-content.test.ts` proves it statically, with named proof strings for the four shaped-reader families |
| "The preview lists every registered field, and nothing else" | verify-cms §8 | **TRUE** |
| Stale-edit guard applies to "Topics 4, 6, 8, 9" | Phase 16 report | **TRUE, and that was the problem** — announcements and batches predate it and were never brought forward (D-1) |
| The throttle is never reported as a wrong password | Phase 11 | **TRUE**, verified from the rendered page |
| `signed_out` is audited | Phase 12 fix | **TRUE**, action is in the CHECK constraint's vocabulary |

**A gap the static test cannot close:** proving a key is *read somewhere* is not
proving the value *reaches the declared route*. That is what §5 adds.

---

## 4. Admin information architecture findings

Evaluated as "a teacher has been told to change X — can they find it?"

| Task | Path | Verdict |
| --- | --- | --- |
| Phone / email / address / PIN | Website text → Contact details | clear |
| Map location | Website text → Contact details → "Map location" | clear |
| Homepage sentences | Website text → Homepage | clear |
| Menu labels and visibility | Website text → Main menu | clear |
| Teacher description / photo | Faculty → Edit | clear |
| Student result / photo | Students & results | clear |
| Story, gallery, video, announcement, batch | own screens | clear |
| Why reviews are absent | Reviews (diagnostics) | clear — states it in plain language |

**Terminology was not changed.** It is documented, relied on by tests, and
already written for a teacher rather than a developer ("Website text", not
"CMS"; "Show on the website", not "published"). Changing it would have broken
tests for a matter of taste.

---

## 5. Website Editor completeness — the central deliverable

`scripts/verify-admin.mjs` (new) — **193 assertions, 0 failures.**

For **each of the 49 registered fields**:

1. a unique marker is written through the real single-field save,
2. the value is read back **from the database**,
3. the field's **declared** public route is fetched **anonymously**,
4. the marker must be visible there.

Validated fields get realistic markers (a six-digit PIN, a phone, a coordinate
pair). `contact.coordinates` renders a map rather than text, so its assertion is
that the map panel appears.

**All 39 text fields reach their declared route. All 10 menu toggles show and
hide their link in both directions.**

Also proven:

- **Data safety** — a single-field save changes that field and no neighbour, in
  the same group or another.
- **Clearing** — a non-blankable field falls back to the shipped text; a
  blankable one shows nothing. Both are different promises and both hold.
- **Menu labels of hidden entries** correctly render nothing until the entry is
  turned on (faculty, reviews, videos, gallery are `HIDDEN_UNTIL_POPULATED`).

---

## 6. Click-to-edit findings

`/admin/preview` is the path the new suite drives, so all of §5 is evidence for
it. One important architectural fact was confirmed rather than assumed:

- **`/admin/preview` carries a per-key lost-update token**; `/admin/website`
  carries a per-group one and saves the whole group. Each is internally
  consistent with what the action compares against.
- I combined the editor's *group* token with the preview's `only=` field —
  a combination no real client produces — and got one save per group followed by
  permanent "Someone changed this record". **I nearly filed that as a
  high-severity application defect.** Driving the real preview form saves the
  same key repeatedly with no rejection. Recorded as harness defect H-1.

No iframe overlay was introduced; `frame-ancestors 'none'` is untouched.

---

## 7. Media findings

No new defects. Topic 5's suite (112 assertions) and Topic 6's (130) continue to
pass, covering byte inspection, re-encode, EXIF/GPS removal, content-addressed
URLs, SVG and polyglot refusal, rate limiting and replacement.

**"Photo optional" contradiction:** checked and clean. Faculty, students and
stories say optional and save without one; gallery says **required** in the
label, the hint and the server. The one place the project requires a photo is
the one place it says so.

---

## 8–15. Per-surface findings

**Faculty, results, stories, gallery, videos, reviews, map** — audited via their
existing suites, all green: faculty 130, gallery 206, videos 230, reviews 224,
map 142, teacher workflow 121, integration 67, e2e 62. Consent predicates,
publish gates, safe-path enforcement and revalidation are unchanged and still
enforced server-side and in the database.

**Announcements / batches / enquiries** — the one surface family that had never
been brought up to the current standard. See D-1.

---

## 16. Authentication UX findings

- A wrong password returns **"That email or password is not correct."** — it
  does not reveal whether the account exists.
- The throttle returns its own message and is **never** reported as a credential
  failure (the Phase 11 fix, re-verified from the rendered page).
- Signing out **revokes every session for the account**, and a request with the
  old cookie is redirected. That is correct, and it is also what broke my own
  suite — see H-4.

---

## 17. Save / error / success UX findings — **D-2**

This is where the second real defect was.

**Every admin form discarded what the teacher had typed when a save was
refused.** Fill in a long form, miss one required field, submit — and the page
politely says "Please check the highlighted fields" over a form that has been
wiped.

- **Root cause:** React resets a form once its action settles. Uncontrolled
  inputs return to their `defaultValue`, which held the record's stored value
  (empty, when creating).
- **A wrong first hypothesis, recorded:** I thought it was tree-shape — the
  error `<Notice>` being *inserted* shifts siblings and remounts them. I made
  that fix (stable always-rendered slot with `aria-live`), re-measured, and
  **the values were still lost**, which disproved it. The slot change was kept
  because it is correct on its own merits and makes the message announced.
- **Fix:** each action now echoes the submitted values in its error state, and
  each form uses them as the defaults, so the reset restores what was typed.
- **Verified on all seven forms**: faculty, gallery, videos, announcements,
  batches, students, stories.

Also confirmed: submit controls are enabled at rest, a failure keeps the teacher
on the form, a success returns to the list and says "Saved", and the error region
is `role="alert"` / `aria-live` rather than colour alone.

---

## 18. Responsive findings

**15 admin routes × 10 widths (320–1440) — no horizontal overflow anywhere.**

Beyond `scrollWidth`, six primary actions were **hit-tested** with
`elementFromPoint` at 320px — "Add a teacher", "Add a photograph", "Add a
video", "New announcement", "Add result", "Save changes" — all genuinely
tappable.

---

## 19. Accessibility findings

Across `/admin/faculty/new`, `/admin/gallery/new`, `/admin/videos/new`,
`/admin/website`:

every input has a label · no icon-only button or link without a name · exactly
one `h1` · no skipped heading levels · a `main` landmark · no positive
`tabindex` · the photo picker takes keyboard focus · error regions announce.

**NOT TESTED — real screen readers (NVDA/JAWS/VoiceOver).** None available in
this environment. Semantics were verified programmatically; that is not the same
as listening to it.

---

## 20–21. Content ownership matrix — "can the teacher change it?"

| Public item | Stored | Editable? | Where | Guard |
| --- | --- | :-: | --- | --- |
| Homepage hero, standfirst, CTA | site_settings | **yes** | Website text → Homepage | length, control chars |
| About page copy | site_settings | **yes** | Website text → About | length |
| Course descriptions | site_settings | **yes** | Website text → Programmes | length |
| Address, landmark, city, state, PIN | site_settings | **yes** | Website text → Contact | PIN validator |
| Phone (primary/secondary) | site_settings | **yes** | Website text → Contact | phone validator |
| Opening hours | site_settings | **yes** | Website text → Contact | 12 lines max |
| Map location | site_settings | **yes** | Website text → Contact | coordinate parser |
| Menu labels and visibility | site_settings | **yes** | Website text → Main menu | closed key set |
| Footer column headings | site_settings | **yes** | Website text | length |
| Faculty, gallery, videos, results, stories, announcements, batches | own tables | **yes** | own screens | consent / publish gates |
| Email address | code (`null`) | **no** | — | **HUMAN DECISION** — no professional address supplied |
| Social links | code (`null`) | **no** | — | **HUMAN DECISION** — none supplied |
| Reviews | Review Engine | **no** | diagnostics only | external source of truth |
| Page URLs / routes | code | **no** | — | deliberate: a label is not a URL |
| Layout, colours, typography | code | **no** | — | deliberate: no page builder |
| SEO titles/descriptions | code | **no** | — | deliberate — invites keyword stuffing (Phase 15) |
| Legal entity name | code (`null`) | **no** | — | **HUMAN DECISION** |

**Nothing a teacher reasonably needs to change is code-owned.** The remaining
code-owned items are either deliberate architecture or awaiting a fact the
institute has not supplied.

---

## 22. Real user workflows

All fifteen (A–O) were exercised, most of them by the suites rather than by
reading code.

| | Workflow | Result |
| --- | --- | --- |
| A | Change a teacher's description | works — verified public |
| B | Replace a teacher's photograph | works (Topic 6 suite) |
| C | Add a teacher | works, **and no longer loses typed input on a mistake** |
| D | Remove a teacher | works |
| E | Change the phone number | works — §5 |
| F | Change the email | **NOT POSSIBLE — HUMAN DECISION.** No address supplied; the field renders nothing rather than a placeholder |
| G | Change the address | works — §5 |
| H | Add a gallery photograph | works (Topic 8 suite) |
| I | Remove a photograph because permission was withdrawn | works — withdrawal takes it down in the same save |
| J | Change a homepage sentence | works — §5 |
| K | Publish an announcement | works, **and a colleague's edit is no longer silently overwritten** |
| L | Correct a student's result | works |
| M | Replace a student's photograph | works |
| N | Add a YouTube video | works (Topic 9 suite) |
| O | Understand why reviews aren't appearing | works — the screen says so in plain language |

---

## 23. Security-boundary checks

Anonymous, forged-session, cross-origin, malformed-payload, unknown-field and
unknown-key writes were re-exercised against the CMS and the two newly-guarded
surfaces. All refused; `verify:security` 262/0 unchanged. **No security control
was weakened to make any UI easier.**

---

## 24. Database integrity

```
migrations touched:            none  (git status prisma/ is empty)
CHECK constraints expected/live: 43 / 43   missing: 0   extra: 0
tables: 15   unexpected: none
site_settings rows: 0   (the shipped state)
```

**No schema change was necessary, so none was made.**

---

## 25. Test-harness audit — six defects, all mine

| # | Defect | The false result |
| --- | --- | --- |
| **H-1** | Combined `/admin/website`'s **group** token with the preview's `only=` | One save per group succeeded and the rest were rejected as stale. **I nearly reported a high-severity application defect.** Both real paths are internally consistent |
| **H-2** | Built payloads from `<input>` only, then posted the whole group | The action turns an absent key into `""`, so every save would have **blanked `contact.hours`** — a textarea it never meant to touch. Now uses `only=`, and the teardown asserts hours survived |
| **H-3** | Restored the settings rows but not the **pages** | A direct write fires no revalidation, so `/contact` kept serving markers after the table was clean — and **failed `verify:cms`, a suite that had done nothing wrong** |
| **H-4** | Tested sign-out on a second tab of the same browser | Signing out revokes **all** sessions, so the suite signed itself out and every later section loaded the login screen. Later, the anonymous login check ran in a signed-in tab and never saw the refusal message |
| **H-5** | Baseline guard matched only `ZZADM`/`ZZNAV` | The four validated fields use realistic markers (`302099`, a phone, a coordinate pair). A crashed run left them behind, the next run **adopted them as its baseline and restored them**, and `nav.*.visible=""` rows hid menu entries — which failed nine UX assertions two suites later. The guard now derives its marker set from the same function that writes them |
| **H-6** | Hit test measured after `scrollIntoView` | The site sets `scroll-behavior: smooth`, so it caught controls mid-flight and reported reachable ones off-screen. Now scrolls instantly and waits |

Every one of these is the "passes/fails for the wrong reason" class this project
keeps finding. The suite is now non-contaminating, proven by running it
immediately before `verify:ux` and `verify:cms`: **193/0, then 333/0 and 71/0,
with zero rows left behind.**

---

## 26. Browser coverage

| Browser | Status |
| --- | --- |
| **Chrome 151** | **TESTED** |
| **Edge** | **NOT TESTED** — not installed |
| **Firefox** | **NOT TESTED** |
| **Safari / WebKit** | **NOT TESTED** — no WebKit on Windows |

---

## 27. Performance

`verify:budget` — **101 passed, 3 failed**, *identical* to before this topic:
`/` 29, `/gallery` 24, `/results` 22 against a limit of 20. All three are
pre-existing and documented in Topics 9 and 10. **Topic 11 added nothing to any
request count and no public JavaScript** — every change is in the admin or in
server actions.

---

## 28. Documentation contradictions

None found between the Master Plan, the phase reports, the registry and the
source. The claims spot-checked in §3 all held. The one thing that *was* stale
was behavioural rather than documentary: two admin surfaces had not been brought
forward to the guard the reports said the project used.

---

## 29–31. Defects

### FIXED

**D-1 · Announcements and batches had no lost-update protection — HIGH**
Symptom: two tabs, second save silently wins, no warning.
Root cause: bare `prisma.x.update()`, no token in the form.
Measured: Tab A overwrote Tab B's change; `teacher warned: false`.
Fix: the established `updateMany` + `updatedAt` guard, token in the form, edit
page supplies it, catch reports `STALE_EDIT_MESSAGE`.
Regression: `verify:admin` §5, each case with a control proving an ordinary edit
still saves.

**D-2 · Every admin form lost typed input on a refused save — HIGH**
Symptom: fill a long form, miss one field, lose everything.
Root cause: React resets a form after its action settles.
Measured: no navigation occurred, so not a reload.
Fix: actions echo submitted values; forms use them as defaults. Plus a stable,
`aria-live` error slot.
Regression: `verify:admin` §7 covers all seven forms.

**H-1 … H-6** — §25.

### PRE-EXISTING, NOT FIXED

- `/`, `/gallery`, `/results` exceed the request-count budget. Unchanged by this
  topic; documented in Topics 9 and 10. **The budget was not weakened.**

### ACCEPTED RISK

- **Enquiries has no lost-update guard.** Its two mutations are a status
  dropdown (a deliberate transition) and internal notes that never appear
  publicly. Adding the guard needs form changes on a surface this topic did not
  otherwise touch. Recorded rather than silently fixed.

### HUMAN DECISION

- Email address, social links, legal entity name — no fact supplied.
- Whether the request-count budget of 20 should be revised.

### NOT TESTED

- Real screen readers · Edge · Firefox · Safari/WebKit · real touch hardware.

---

## 32. Regression results

| Suite | Result |
| --- | --- |
| `npm test` (unit) | **487 passed, 0 failed** |
| **`verify:admin`** (new) | **193 passed, 0 failed** |
| `verify:seo` | 418 passed, 0 failed |
| `verify:ux` | 333 passed, 0 failed |
| `verify:security` | 262 passed, 0 failed |
| `verify:videos` | 230 passed, 0 failed |
| `verify:reviews` | 224 passed, 0 failed |
| `verify:gallery` | 206 passed, 0 failed |
| `verify:map` | 142 passed, 0 failed |
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
| `verify:production --expect-prelaunch` | 25 passed, 0 failed |
| `verify:preflight` | 1 failure: `P-DB-12` with demo data present — the gate working |
| `verify:budget` | 3 pre-existing failures — §27 |

**Suites requiring demo data:** `verify:teacher`, `verify:import` and parts of
`verify:integration` branch on whether content exists. `verify:preflight` requires
an **empty** content database to pass.

**Ordering constraints:** `verify:media` consumes the upload limiter, so
`verify:faculty` needs a server restart after it. `verify:security` spends the
login throttle, so `verify:cms` needs one after it. Both are the product's
limiters working and neither was weakened.

---

## 33. Final verdict

**Topic 11 is COMPLETE.**

Every admin surface is inventoried; every public content item has an explicit
ownership decision; all fifteen teacher workflows work end to end except
"change the email", which is blocked on a fact nobody has supplied. All 49 CMS
fields are proven to reach the public page they claim to render on. Two
high-severity admin defects were found by measurement and fixed with regression
coverage. Six harness defects were found and fixed, two of which had reported a
working product as broken and one of which was quietly breaking other suites.

No consent boundary, security control, launch gate or database constraint was
weakened. No dependency was added. No schema change was made.

---

## 34. Recommendation for Topic 12

**Topic 12 — final adversarial security audit and launch readiness**, as the
phase plan has it. Two inputs are now ready for it that were not before: the
complete admin surface inventory in §2, and a control-surface suite that can be
attacked rather than just read.

Carry forward for Topic 12:

1. **Enquiries' missing lost-update guard** (§31, accepted here).
2. **The request-count budget decision** — three routes over, unrevised for
   three topics.
3. **Production media storage** — still the Topic 5 boundary, still
   unimplemented, and still the largest thing standing between this site and
   real photographs.
