# Publishing student information — design policy

**Status:** Design policy, agreed for implementation
**Applies to:** toppers, results, student stories, gallery photographs
**Implemented in:** Phase 4 (schema) and Phase 5 (admin UI)

> **This is not legal advice, and nothing here asserts what the law requires.**
> Commerce Insight should confirm its obligations with its own adviser. This
> document records how we are building *regardless* of that answer, and why the
> conservative design costs nothing if the obligations turn out to be lighter
> than assumed.

---

## The situation

The site's most persuasive content is also its most sensitive: named students,
their photographs, and their examination marks. Most Class XI and XII students
are **under 18**.

Publishing a minor's name, face and marks together is a meaningful act whatever
the governing rules turn out to be — it is permanent, it is indexable, and the
person it concerns is not the person who agreed to it.

There is a live compliance consideration here (India's Digital Personal Data
Protection Act 2023 is the relevant instrument, and it treats people under 18
differently from adults). **We are not interpreting it.** We are designing so
that the answer does not change our architecture.

## The design position

**Assume publication is NOT authorised until a specific record says otherwise.**

This is the safe default in both directions: if the obligations are strict, we
already comply; if they are light, we have lost nothing but a database column.
Retrofitting consent tracking onto published data, by contrast, is expensive and
happens under pressure.

## How this shows up in the build

### Schema (Phase 4)

Every model that can identify a student carries:

| Field | Purpose |
| --- | --- |
| `consentRef` | Pointer to the signed authorisation the institute holds. **Not nullable on a published record.** |
| `consentResult` / `consentName` / `consentPhoto` / `consentStory` | The four independent permissions. All default to `false`. |
| `published` | Defaults to `false`. Never defaults to true on create. |
| `displayNameMode` | `full` \| `initials` \| `firstNameOnly` — defaults to the most private. |

The publish action is gated: a record cannot move to `published: true` without
a `consentRef` and the permissions covering what is actually on screen. This is
enforced in the mutation, not merely in the form, so it cannot be bypassed by a
direct call — and again by database CHECK constraints, so it cannot be bypassed
by a direct query either.

### The four permissions

Consent is **four independent questions**, not a ladder. This replaced an
ordered scope enum in Phase 5, on explicit instruction from the institute:

> "A story must NOT automatically grant permission to publish a photograph."

An ordered scale cannot express that — it forces every higher grant to imply
every lower one. People do not grant permission that way on a paper form.

| Permission | Authorises |
| --- | --- |
| `consentResult` | Publishing the score at all |
| `consentName` | Showing a name rather than initials |
| `consentPhoto` | Showing a photograph — **never implied by anything else** |
| `consentStory` | Publishing a written story about them |

Each is `BOOLEAN NOT NULL DEFAULT false`. Because none of them is nullable,
none can make a CHECK constraint evaluate to NULL — which is what made the
earlier nullable-enum constraints quietly permissive
(`docs/PHASE-4.5-DB-VERIFICATION.md`, Finding 3).

Default rendering is always the narrowest the permissions allow. A record with
`consentResult` but not `consentName` renders a monogram tile, not a name —
which is why the monogram fallback exists in the component library.

### Admin UI (Phase 5)

- The four permissions are separate tick boxes, each with a plain-language
  explanation of what it authorises.
- **The publish control is disabled until the permissions allow it**, with the
  missing ones listed in words the teacher can act on — "Tick Photograph, or
  remove the photo." Nobody ever meets a database error.
- A live preview shows exactly what a visitor would see, before publishing.
- `AuditLog` records who published which record and when — the action and the
  entity id, never the student's name or marks.
- "Hide from website" is one click, keeps the record, and is offered separately
  from deleting.

### Public site

- A takedown route is described in the privacy policy, and reaching a human is
  not conditional on filling a form.
- No student-identifying content is emitted in structured data.
- Student photographs carry descriptive alt text but are never the LCP element,
  so they are not preloaded ahead of a visitor's intent to see them.

## What we need from Commerce Insight

1. Confirmation of how consent is collected today, if at all.
2. A consent form the institute is willing to use — we can draft one for their
   adviser to review, but we should not be the last word on its wording.
3. A decision on the **default** display mode. The implemented default is
   initials only, which is the most private option available.

Until those arrive, the results and toppers bands render nothing (Master Plan
§03), which is already the behaviour built in Phase 3. No student record of any
kind exists in this project — real or synthetic.
