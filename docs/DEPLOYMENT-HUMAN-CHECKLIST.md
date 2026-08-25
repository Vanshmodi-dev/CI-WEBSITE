# What only a person can supply

**The engineering is done. This is everything that is not engineering.**

Nothing here can be written in code, and nothing here should be guessed at.
Every item is either a fact about the institute that only the institute knows,
an account only the owner can create, or a decision only a person can take
responsibility for.

> **Never tick an item without evidence.** "Probably fine" is how a website ends
> up publishing a phone number nobody answers. Each row has an evidence column;
> if it is empty, the item is not done.

---

## How to read this

| Marker | Meaning |
| --- | --- |
| 🔴 **BLOCKS DEPLOYMENT** | The site cannot go live without it |
| 🟠 **BLOCKS LAUNCH** | Deploy without it; do not make the site public |
| 🟡 **BLOCKS A FEATURE** | Everything else works; this one thing stays off |
| ⚪ **OPTIONAL** | Genuinely optional |
| **HUMAN DECISION REQUIRED** | Not a task — a judgement the institute must make and own |

---

## A. Engineering — complete

Recorded here so the line between "done" and "waiting on people" is unambiguous.

| Item | State |
| --- | --- |
| Public website, all pages | ✅ Complete |
| Admin panel, all entities | ✅ Complete |
| Consent model, enforced in the database | ✅ 21 CHECK constraints, verified by name |
| Authentication, sessions, revocation, throttling | ✅ Complete |
| Security headers, CSP, CSRF, rate limits | ✅ 245 automated checks |
| SEO, canonicals, sitemap, structured data | ✅ 335 automated checks |
| Performance budgets | ✅ 72 automated checks |
| Spreadsheet import and export | ✅ 116 automated checks |
| Accessibility (automated) | ✅ Included in 249 real-browser checks |
| Deployment pre-flight tooling | ✅ `npm run verify:preflight` |
| Production smoke test | ✅ `npm run verify:production` |

**Nothing on this list is waiting on the institute.**

---

## B. Accounts and infrastructure — 🔴 BLOCKS DEPLOYMENT

| # | Item | Who | Evidence needed | Done |
| --- | --- | --- | --- | :-: |
| B1 | PostgreSQL account (Neon or equivalent) | Owner | Project created; pooled connection string held securely | ☐ |
| B2 | Hosting account | Owner | Project created and connected to the repository | ☐ |
| B3 | **Hosting plan that permits commercial use** | Owner | Written confirmation of the plan and its terms | ☐ |
| B4 | Production domain, registered | Owner | Registrar account, domain confirmed | ☐ |
| B5 | DNS access | Owner | Able to add records | ☐ |
| B6 | `ADMIN_SESSION_SECRET` generated | Deployer | ≥32 chars, in the provider's settings, never committed | ☐ |
| B7 | `ENQUIRY_SECRET` generated **separately** | Deployer | ≥32 chars, different from B6 | ☐ |
| B8 | Admin account created | Deployer | Sign-in tested on the production domain | ☐ |

> **B3 is the one people miss.** A coaching institute's website is a commercial
> project. Several hosts' free tiers forbid commercial use. This is a
> contractual question, not a technical one — **"technically free" and "allowed
> for this use" are different things** — and the answer must be checked against
> the provider's current terms, not against what a tutorial said. See
> [`COST-AND-INFRASTRUCTURE.md`](COST-AND-INFRASTRUCTURE.md).

---

## C. Institute facts — 🟠 BLOCKS LAUNCH

**None of these has been invented, and none may be.** Where the code needs a
value it does not have, it renders nothing rather than a plausible guess.

| # | Item | Evidence needed | Done |
| --- | --- | --- | :-: |
| C1 | Full postal address | In writing, matching the Google Business Profile exactly | ☐ |
| C2 | Phone number(s) | In writing; **each one called and answered** | ☐ |
| C3 | Opening hours | In writing | ☐ |
| C4 | Professional email address on the domain | Mailbox exists and is monitored | ☐ |
| C5 | Institute logo, transparent background | Supplied by the institute — **not** a fake transparency made by removing white | ☐ |
| C6 | Founder / faculty details, **if they want any published** | Written approval from each named person | ☐ |
| C7 | Course details | In writing | ☐ |
| C8 | Fees, **if they want them published** | Written confirmation, with a review date | ☐ |
| C9 | Batch timings | In writing | ☐ |

> **C1–C3 must agree with the Google Business Profile character for character.**
> A local business whose name, address and phone differ between its site and its
> profile ranks worse for it. This is the single highest-value item in this file.

> **C6 and C8 are HUMAN DECISIONS.** Publishing fees invites comparison and dates
> the page; not publishing them costs enquiries. Publishing a faculty member's
> name and photograph requires *their* consent, not the institute's. Neither is
> the agency's call.

---

## D. Students, consent and real data — 🟠 BLOCKS LAUNCH

**This is the section that matters most. Everything here concerns children.**

| # | Item | Evidence needed | Done |
| --- | --- | --- | :-: |
| D1 | Signed consent form for **every** student to be published | The physical forms, filed and referenced | ☐ |
| D2 | Each form separately covers: result, name, photograph | Photograph consent is asked **separately** and is never implied | ☐ |
| D3 | A consent reference for every record | The filing reference entered in the admin | ☐ |
| D4 | Real results, from physical result documents | The documents | ☐ |
| D5 | Photographs, where photo consent exists | The image files | ☐ |
| D6 | **The reference scheme decided** | Written down: roll number, enrolment number, or another stable code | ☐ |
| D7 | Every record reviewed in *Admin → Website preview* before publishing | Teacher confirms in writing | ☐ |
| D8 | Written sign-off that every published record is correct | From the institute | ☐ |

> **D6 blocks a clean import.** The `Reference` column is what makes a second
> import a *correction* rather than a duplicate student. It must be stable — a
> number that will still identify the same person next year. Names cannot do
> this: Phase 8 found two real records colliding on name and year.

> **D2 is not a formality.** Consent to publish a result is not consent to
> publish a name, and neither is consent to publish a photograph. The database
> refuses the combinations that violate this — but a signed form that does not
> actually say "photograph" means the answer is no, whatever the spreadsheet
> says.

### 🔴 What must NOT happen before D1–D8 are complete

- No real student data in any database
- No student names, marks or photographs published
- No spreadsheet of real students uploaded "just to test"

**The database currently holds 0 rows in every content table, verified.**

---

## E. Email and notifications — 🟡 BLOCKS A FEATURE

Everything works without this. Enquiries are written to the database *before*
notification is attempted, so a missing notifier can never lose a lead — but
somebody must then read the admin.

| # | Item | Evidence needed | Done |
| --- | --- | --- | :-: |
| E1 | Mailbox on the institute's domain | Can send and receive | ☐ |
| E2 | Sending domain configured at an email provider | Provider dashboard shows it verified | ☐ |
| E3 | **SPF record** published | `dig TXT` shows it | ☐ |
| E4 | **DKIM record** published | Provider reports it verified | ☐ |
| E5 | DMARC record published | `dig TXT _dmarc.<domain>` | ☐ |
| E6 | Sender and reply-to decided | Written down | ☐ |
| E7 | `RESEND_API_KEY` and `ENQUIRY_NOTIFICATION_TO` set | In the host's settings | ☐ |
| E8 | `deliver()` implemented in `src/lib/notify.ts` | Code, plus one test send | ☐ |

> **E3 and E4 are not optional extras.** Mail from an unauthenticated domain
> lands in spam. A notification that silently goes to spam is *worse* than no
> notification, because nobody notices the leads stopped arriving.

> **Until E1–E8 are done, the daily check of *Admin → Enquiries* is the entire
> notification system.** Say that out loud to whoever will be doing it.

---

## F. Privacy and data protection — 🟠 BLOCKS LAUNCH

**No legal text has been written, and none may be invented.** These are the
institute's obligations and the institute's decisions.

| # | Item | Status |
| --- | --- | --- |
| F1 | Privacy policy page, written or reviewed by someone qualified | **HUMAN DECISION REQUIRED** |
| F2 | Consent form wording — what the parent is actually agreeing to | **HUMAN DECISION REQUIRED** |
| F3 | How long enquiries are kept | **HUMAN DECISION REQUIRED** — a retention script exists; the number does not |
| F4 | How long audit logs are kept | **HUMAN DECISION REQUIRED** |
| F5 | Whether import history is pruned | **HUMAN DECISION REQUIRED** — metadata only, no personal data |
| F6 | Who may access student records | **HUMAN DECISION REQUIRED** — currently: anyone with the admin password |
| F7 | Who may export student records | **HUMAN DECISION REQUIRED** — currently: the same |
| F8 | Who handles a deletion or correction request | **HUMAN DECISION REQUIRED** — a named person |
| F9 | What happens when a student withdraws consent | **HUMAN DECISION REQUIRED** — the mechanism exists; the process does not |

> **F6 and F7 deserve a real answer.** There is one admin role. Anyone who can
> sign in can read every student record and export the lot as a spreadsheet.
> That is appropriate for a two-person institute and inappropriate for a larger
> one, and the institute is the only party who can say which it is.

> **F9 is the one that will actually happen.** A parent will ask for their
> child's photograph to be taken down. Unpublishing works and takes seconds —
> but somebody has to be reachable, and know that they are the one who does it.

---

## G. Content review — 🟠 BLOCKS LAUNCH

| # | Item | Done |
| --- | --- | :-: |
| G1 | Every page read by the institute, for accuracy and tone | ☐ |
| G2 | Every claim about the institute confirmed true | ☐ |
| G3 | Empty states accepted where content was not supplied | ☐ |
| G4 | Every published result and story checked in *Admin → Website preview* | ☐ |
| G5 | Written go-live approval | ☐ |

> **G2 exists because the previous site failed it.** The audit that started this
> project found fabricated toppers and testimonials on the old site. Nothing on
> the new one is invented, and G2 is the check that keeps it that way.

---

## H. Launch — the irreversible-ish step

Only after **every** 🔴 and 🟠 item above.

| # | Item | Done |
| --- | --- | :-: |
| H0 | Every institute fact set to `verified` in `src/config/institute.ts`, after written confirmation | ☐ |
| H1 | `SITE_IS_LAUNCHED = true`, in a reviewed commit | ☐ |
| H2 | `NEXT_PUBLIC_SITE_URL` is the live `https://` domain **at build time** | ☐ |
| H3 | Rebuilt and redeployed after H1 and H2 | ☐ |
| H4 | `verify:production` passes without `--expect-prelaunch` | ☐ |
| H5 | `robots.txt` reads `Allow: /` and still disallows `/admin` | ☐ |
| H6 | Sitemap submitted to Search Console | ☐ |
| H7 | Uptime monitoring configured | ☐ |

> **Three conditions, deliberately.** Indexing requires the code flag, a real
> `https://` domain, **and** every institute fact marked verified. One
> environment variable is far too easy to flip by accident, and a half-finished
> site entering Google's index under the institute's name takes weeks to undo.
>
> The third condition was added in Phase 14. `institute.ts` had always said the
> address and phone numbers "must all read verified before the site goes
> public" - but nothing enforced it, so the site could have been launched and
> ranked on contact details carried over from the old website that nobody had
> checked. `npm run verify:preflight` now names any fact still outstanding
> (`P-LAUNCH-07`).

---

## Summary

| Section | Items | Blocks |
| --- | ---: | --- |
| A · Engineering | 11 | **Nothing — complete** |
| B · Accounts | 8 | Deployment |
| C · Institute facts | 9 | Launch |
| D · Students and consent | 8 | Launch |
| E · Email | 8 | One feature |
| F · Privacy | 9 | Launch — **all human decisions** |
| G · Content review | 5 | Launch |
| H · Launch | 7 | — |

**54 items, none of which an agency can tick on the institute's behalf.**
