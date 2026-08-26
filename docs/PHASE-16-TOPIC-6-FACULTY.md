# Phase 16, Topic 6 — faculty management

**Status:** complete. Test results and limitations are at the foot.

---

## 1. Inventory — faculty did not exist

Searched the repository for faculty, teacher, staff, instructor, professor,
designation, department, subject, bio, portrait. The result:

| Question | Answer |
| --- | --- |
| A Faculty model? | **No.** |
| A public faculty component or route? | **No.** |
| Static faculty content anywhere? | **No.** |
| Placeholder images? | **No.** |
| Any code referencing faculty? | Only comments explaining its absence. |
| Existing routes expecting it? | `nav.ts` records `/faculty` as removed in Phase 6, blocker: "needs verified credentials and portraits". |

**Nothing was duplicated because nothing existed.** What was reused: the
announcements CRUD shape, `isValidRecordId`, `isSafePhotoPath`, `recordAudit`,
`requireAdmin` / `requireAdminOrNull`, the stale-edit guard, `revalidate-public`,
the admin UI kit, the field primitives, and the Topic 5 `MediaField`.

## 2. This reverses Master Plan Decision 03 — deliberately, on instruction

> "Content that changes gets a database. Content that carries design stays in
> code. Results, toppers, announcements and enquiries go to Postgres with an
> admin UI. **Course and faculty pages stay typed content in the repo**, because
> a generic CMS shape would flatten exactly the layouts that make this site feel
> bespoke."

The owner requires faculty to be admin-managed, because the alternative is that
the institute cannot correct a teacher's name without a developer.

The reversal keeps Decision 03's **reasoning** by splitting where the decision
did not: **the data is in the database, the design stays in a typed React
component**. There is no layout field, no HTML field, no colour, no section
ordering — nothing a CMS could use to flatten the page. `FacultyCard` is code.

## 3. Data model

Justified from master directive §16 ("photograph, name, position, subject,
specialisation") and nothing beyond it.

| Field | Type | Null? | Why |
| --- | --- | :-: | --- |
| `name` | VarChar(120) | no | required |
| `designation` | VarChar(120) | no | "position" in §16 |
| `subject` | VarChar(120) | yes | not everyone teaches one subject |
| `bio` | VarChar(600) | yes | a card, not a biography |
| `photoUrl` | VarChar(500) | yes | Topic 5 path; optional |
| `priority` | Int, default 0 | no | ordering, reusing the announcements convention |
| `published` | Boolean, default **false** | no | visibility, reusing the sitewide convention |

**Deliberately absent:** phone, email, address (the brief forbids storing staff
contact details, and the site has no use for them); qualifications, experience,
achievements (the directive says "only publish verified information", none is
supplied, and a text box invites a claim nobody checked).

**No second publication mechanism was invented.** `published` is the same flag
results, stories, batches and announcements use.

## 4. Privacy and consent

**TECHNICAL REQUIREMENT (implemented):** nothing is public until somebody
deliberately publishes it. `published` defaults to false; the public reader
filters on it in the WHERE clause, not afterwards in JavaScript. Uploading a
photograph does not publish it — that separation is inherited from Topic 5,
where the media action writes no publication or consent field at all.

**HUMAN / INSTITUTE DECISION (not implemented, not invented):**
`docs/design/STUDENT-DATA-POLICY.md` states its scope as "toppers, results,
student stories, gallery photographs" — students. It says nothing about staff.

So **no consent column is modelled for faculty**, because modelling one would
mean inventing a policy this project has no authority to invent. What the admin
does instead is state the plain fact, without asserting law:

> "A photo is optional. Please make sure the person is happy for their
> photograph to appear on the public website before you show it."

Whether Commerce Insight needs written permission from each teacher is a
question for the institute and its adviser. If the answer is yes, adding a
consent gate is the same shape as the student one and is an additive change.

## 5. Public rendering

`/faculty`, plus a "Meet your mentors" band on the homepage showing three.

**No per-teacher detail page.** The directive asks for pages of qualifications,
experience and teaching philosophy — every one of which is information this
project does not have, while the same directive says "only publish verified
information". Empty detail pages invite exactly the invention the rebuild
exists to correct. It also matches the architecture already here: results and
stories are list pages with no per-record route.

**No `Person` structured data.** Emitting it would assert to a search engine
that these are verified people with these exact roles. `seo.ts` already refuses
to claim reviews it did not collect; this is the same rule.

**The empty state is a real state.** With no faculty, the page says the section
is being prepared and offers a phone number — not a greyed-out grid, not
invented teachers. The homepage band simply does not render, following the rule
that let this site launch honestly.

**The menu entry is hidden by default.** The route exists and is in the sitemap,
but `HIDDEN_UNTIL_POPULATED` in `nav.ts` starts the menu entry off. A visitor
who clicks "Teachers" and finds a placeholder learns the website is unfinished.
The teacher turns it on in Website text — reusing the Phase 15 visibility
toggle rather than adding a second mechanism.

## 6. Security

| Control | Where |
| --- | --- |
| Authentication | `requireAdmin` on pages, `requireAdminOrNull` in both actions |
| Authorisation | re-checked in the action, never inferred from the page |
| CSRF | Next's Server Action origin check; `/admin` also under the nonce CSP |
| IDOR | `isValidRecordId` before Prisma; an id we never issued selects nothing |
| XSS | React escaping only; no `dangerouslySetInnerHTML` anywhere near faculty |
| Photo path | `isSafePhotoPath` on write **and** on read, plus a CHECK constraint |
| Stale edit | `updatedAt` token, compared inside the transaction |
| Audit | `recordAudit` on create, update, publish/unpublish, delete |
| Input | trimmed, control characters stripped, truncated to the column width |

**Length handling is truncation, not rejection.** The action's caps match the
columns and the CHECK constraints exactly, so an over-long paste is shortened
and saved rather than producing a Postgres error the teacher cannot act on.

## 7. Media integration

The photo field is Topic 5's `MediaField`. There is no second uploader and
there must never be one — a second implementation is a second place for the
magic-byte check, the size cap and the re-encode to be forgotten.

**Failed replacement leaves the original intact**, verified: attach photo A,
attempt an invalid file, save — the record still points at A. The upload
control shows the refusal and does not clear the existing value.

**"Remove" does not delete the file.** The same bytes may be used by another
record, and the media library refuses to delete anything still referenced.
Removing leaves an unreferenced file, which `npm run media:audit` reports and
`media:clean` reclaims — the Topic 5 trade: an orphan file is recoverable, a
broken reference is not.

## 8. Test results — measured

`npm run verify:faculty`: **130 passed, 0 failed**, covering create/read/update/
delete, public visibility, hidden and deleted records, optional photo, photo
attach / replace / failed-replace / remove, validation, XSS on both surfaces,
stale edit, authorisation, CSRF, IDOR, audit, empty state, nine viewport widths,
touch targets, form labelling, keyboard focus, and card semantics.

| Suite | Result | Before Topic 6 |
| --- | ---: | ---: |
| Unit | **367** (+11) | 356 |
| Faculty (new) | **130** | — |
| Media | **112** | 112 |
| CMS | **71** | 71 |
| Security | **262** | 262 |
| SEO | **355** (+20) | 335 |
| Real-browser UX | **270** (+21) | 249 |
| Integration | **67** | 67 |
| End-to-end | **62** | 62 |
| Public isolation | **46** | 46 |
| Revalidation | **10** | 10 |
| Import / export | **116** | 116 |
| Teacher workflow | **121** | 121 |
| Consent constraints | **43** | 43 |
| Budget | 79 of 80 — the pre-existing `/results` request count | 71 of 72 |
| Preflight | 57 of 58 — P-DB-12, demo data seeded | same |

`/faculty` was added to the SEO, UX and performance route lists, so the new page
gets the same contrast, overflow, semantics, metadata and budget coverage as
every other public route. Its own budget line: 190.0 KB JS, 8.2 KB HTML,
296.6 KB total.

**NOT TESTED: screen readers.** No screen-reader environment exists here.
**NOT TESTED: Safari and Firefox.** Neither is installed.

## 9. Database

One additive migration, `20260826180000_faculty`. Pure ASCII. Five CHECK
constraints, **verified by name against live PostgreSQL metadata** rather than
against the Prisma schema:

`faculty_name_not_blank` · `faculty_designation_not_blank` ·
`faculty_priority_sane` · `faculty_photo_is_site_relative` ·
`faculty_text_printable`

All 21 original constraints intact — `verify:constraints` reports 43 passed.

## 10. Demo data

Five ZZSHOW records covering the states the page must handle: with and without
a photograph, with and without a subject, a long description and a short one,
a non-zero priority so ordering is visible, and one **draft** that must never
appear publicly. Names are unmistakably synthetic — this project exists because
the previous site published invented people, so demo faculty must be impossible
to mistake for real staff. Photographs reuse the existing ZZSHOW placeholder
tiles, never anything resembling a face.

Seed and clean round-trip verified: 5 seeded, 5 removed, 0 remaining, and
`Non-ZZSHOW content rows: 0`.

## 11. Known limitations

1. **Ordering is a priority number, not drag-and-drop.** Reuses the
   announcements convention. Drag ordering needs a reorder endpoint with its own
   concurrency handling; the number is honest and works today.
2. **No per-teacher page.** See §5. Additive when real credentials exist.
3. **No consent model for staff.** See §4 — a human decision, not a gap.
4. **Screen readers and non-Chrome browsers untested.**
5. **Faculty carries no sitemap `lastModified`.** Adding one would let an
   unpublished draft edit move a public date. Deliberate.

## 12. Production requirements

Faculty itself has no deployment blocker: it needs no credentials and no
external service. It inherits Topic 5's one open item — **photographs require
provisioned object storage before launch**, because the deployment target has
an ephemeral filesystem. A faculty record with no photograph is fully
functional today.
