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
| `consentScope` | What was authorised — see the scope ladder below. |
| `published` | Defaults to `false`. Never defaults to true on create. |
| `displayNameMode` | `full` \| `initials` \| `firstNameOnly` — defaults to the most private. |

The publish action is gated: a record cannot move to `published: true` without
a `consentRef` and a `consentScope` that covers what is actually on screen.
This is enforced in the mutation, not merely in the form, so it cannot be
bypassed by a direct call.

### The scope ladder

Consent is not one switch. These are separable, and the UI respects the
narrowest grant:

1. **Result only** — score, programme, year. No name, no photo.
2. **Result + partial name** — e.g. "Priya G." or first name only.
3. **Result + full name** — no photograph.
4. **Result + full name + photograph** — the fullest grant.
5. **Story** — extended narrative quoting the student. Always separate.

Default rendering is the lowest rung the record supports. A topper card with
scope 2 renders a monogram tile, not a blank photo frame — which is also why
`EmptyState` and the monogram fallback exist in the component library already.

### Admin UI (Phase 5)

- Consent scope is a required field on the create form, not an optional toggle.
- The publish button is disabled, with a visible reason, until scope is set.
- `AuditLog` records who published which student record and when.
- Unpublishing is one click and takes effect on the next revalidation.

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
3. A decision on the **default** display mode. Our recommendation is initials
   plus surname unless the fuller grant is explicitly on record.

Until those arrive, the results and toppers bands render nothing (Master Plan
§03), which is already the behaviour built in Phase 3.
