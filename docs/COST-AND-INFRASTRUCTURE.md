# Cost and infrastructure

**Date:** 23 August 2026
**Budget stance:** minimise recurring cost, but never at the expense of
security or of losing a student's data.

---

## The short answer

**Expected recurring cost: a domain (~₹800–1,200/year), and possibly Vercel Pro.**

Everything else fits inside free tiers with large headroom — not marginally, but
by roughly 50×. That is measured, not estimated: Phase 5.5 loaded 1,000 students
and 1,000 enquiries into a real PostgreSQL instance and the entire database came
to **9.7 MB**.

---

## Service by service

| Service | Purpose | Cost | Free tier | What triggers paid | Optional? |
| --- | --- | --- | --- | --- | --- |
| **Neon** | PostgreSQL | **₹0** | 0.5 GB storage | ~50,000 students | No |
| **Vercel** | Hosting | **₹0** on Hobby — **but see below** | 100 GB bandwidth | Commercial use; heavy traffic | No |
| **Domain** | The address | **~₹800–1,200/yr** | — | — | No |
| **Mailbox** | Professional email | **₹0–200/mo** | Zoho free tier | More users/features | No |
| **Resend** | Enquiry alerts | **₹0** | 3,000 emails/mo | ~100 enquiries/day | Yes, for now |
| **Vercel Blob** | Photo storage | **₹0** | 1 GB | ~2,000 photos | Yes, until photos exist |
| **Analytics** | — | **₹0** | — | — | **Yes — not installed** |
| **CMS** | — | **₹0** | — | — | **Yes — deliberately none** |
| **Auth SaaS** | — | **₹0** | — | — | **Yes — deliberately none** |

### ⚠ The one cost that is easy to miss

**Vercel's Hobby plan prohibits commercial use.** A coaching institute's website
is commercial. Check the current terms before launch — Pro is **~US$20/month
(~₹1,700)**. This is the single largest potential recurring cost and it is not
obvious from the pricing page.

**Cheaper alternatives if that matters:** Cloudflare Pages or Netlify have
commercial-friendly free tiers, but both need adapter work for Next.js server
actions. A small VPS (~₹400/month) would run it, at the cost of managing
patching, TLS and uptime yourself. **My recommendation is to pay for Vercel Pro
if required** — the alternatives trade a known monthly cost for unpaid
maintenance, and this project has one developer.

---

## Why Neon, concretely

| | Neon free | Supabase free |
| --- | --- | --- |
| Storage | 0.5 GB | 500 MB |
| Includes | database only | database + auth + storage + functions |
| Suspends when idle | yes | yes |
| Asia region | Singapore / Mumbai | Singapore / Mumbai |

Supabase's advantage is the bundle. This project uses **none of it** —
authentication is our own scrypt implementation, chosen precisely so there is no
vendor in the security path. Paying in complexity for four features we decided
not to use is a bad trade. Neon is the database alone, which is the requirement.

### The one operational consequence

Neon's free tier **suspends after inactivity**. The first request after a quiet
spell pays a resume cost of roughly half a second to two seconds.

This was measured and mitigated in Phase 5.5: the admin dashboard was opening
**six parallel connections** for six counts, costing **759 ms cold**. It is now
one query — **219 ms cold, 1 ms warm**. The public pages are ISR-cached, so
visitors almost never hit a cold database at all.

Acceptable for an admin used a few times a week. If it becomes annoying, Neon's
paid tier removes suspension.

---

## What we deliberately did not buy

| Not used | Why | Saved |
| --- | --- | --- |
| Auth0 / Clerk | One seeded account. scrypt from `node:crypto`, no native dependency. | ~₹2,000/mo |
| Sanity / Contentful | The admin panel *is* the CMS, built on the database we already have. | ~₹1,000/mo |
| Google Analytics | Nobody has asked for it. Adds ~45 KB and a cookie banner obligation. | ₹0, but real weight |
| Sentry | Structured server logs suffice at this size. | ~₹2,000/mo |
| Cloudinary | ~2,000 photos fit in Vercel Blob's free tier. | ~₹2,000/mo |
| A validation library | Five fields, hand-written and unit-tested. | Supply-chain surface |
| A test framework | Node's built-in runner. | A dependency |

The dependency count is deliberately small: **6 runtime packages.** Every one
earns its place, and `npm audit` reports 0 vulnerabilities.

---

## Photo storage — the decision

> **Corrected 28 Aug 2026 (Phase 16, Topic 12).** Everything this section said
> before that date described the state of the project in Phase 7 and had been
> wrong since Topic 5 built the upload system. It claimed the admin accepted "a
> path to an image already in `/public`", that "the teacher cannot upload", and
> that an upload pipeline was "not built now". All three were false, and the
> list of requirements "when built" was a list of things already implemented.
> A costing document that misdescribes what exists is how a launch decision gets
> made on the wrong facts, so it is corrected here rather than annotated.

### What exists today

The upload pipeline is **built and tested** (`src/lib/media/`, 112 assertions in
`npm run verify:media`). A teacher uploads from `/admin/media` or from any form
with a photo field, and the file goes through:

| Stage | What happens |
| --- | --- |
| Declared type | Refused unless jpeg/png/webp/avif |
| Magic bytes | Checked **before** any decoder sees the file, so a renamed `.exe` or an SVG polyglot never reaches `sharp` |
| Dimensions | Read from metadata before pixel work; a decompression bomb is refused cheaply |
| Re-encode | Always. The bytes served are ours, never the bytes uploaded |
| EXIF | Orientation applied, then **all metadata dropped — including GPS** |
| Naming | Content hash, 32 hex characters. The uploaded filename is never trusted or stored |
| Size | Capped on the way in, and again on the stored result |
| Serving | `/media/[key]`, a route handler that refuses any key it did not issue |

So the requirement list that used to sit here as future work is done.

### What is missing, and it is the only thing

**A bucket.** Phase 17 built the adapter; nobody has opened an account.

`MediaStore` now has four implementations (`src/lib/media/store.ts`):

| Implementation | Chosen when |
| --- | --- |
| `S3MediaStore` | All four `MEDIA_S3_*` variables are set. Real object storage |
| `LocalDiskStore` | Nothing set, and the host keeps its filesystem. A developer |
| `UnconfiguredStore` | Nothing set, and the host discards its filesystem. Refuses |
| `MisconfiguredStore` | **Some** variables set. Refuses, everywhere, always |

That last row is the one that matters. Three of four secrets is somebody
part-way through configuring a deployment, and falling back to local disk there
would accept uploads, display them correctly, and lose every one at the next
deploy. It is an error, never a fallback — enforced at runtime and again by
`P-MEDIA-01` in pre-flight.

**Opening the account is a HUMAN DECISION and remains a LAUNCH BLOCKER.** No
credential was invented and no provider was activated from inside this project.

### Evaluating the options

Pricing verified against the providers' own documentation on 28 August 2026.
Judged on what actually matters for photographs that may include children.

| | Cloudflare R2 | Backblaze B2 | Vercel Blob | AWS S3 |
| --- | --- | --- | --- | --- |
| Free tier | **10 GB/month** | **10 GB, permanent** | Hobby allowance | 5 GB, first 12 months only |
| Egress | **Free, unmetered** | Free to 3x stored, then $0.01/GB; free via Cloudflare CDN | Counts against the plan | **Charged — the trap** |
| Storage beyond free | $0.015/GB-month | ~$0.006/GB-month | Plan-dependent | ~$0.023/GB-month |
| Operations | 1M writes + 10M reads free/month | Cheap per-call | Simple + advanced ops metered | Metered |
| S3-compatible | **Yes** | **Yes** | **No — proprietary SDK** | Yes (it is S3) |
| Lock-in | Low | Low | **High** | Low |
| Private objects | Yes | Yes | Yes | Yes |
| Card required | **Yes, even on the free tier** | Yes | Existing Vercel account | Yes |

**Recommendation: Cloudflare R2.**

Two things decide it. Egress is free and unmetered, which removes the single
cost that can surprise a small institute — a gallery page that gets shared
widely turns a ₹0 bill into a real one, with no warning, on any metered
provider. And it speaks the S3 API, so the provider is a configuration value
rather than an architecture.

**Vercel Blob was seriously considered and rejected**, despite being the least
work and the incumbent recommendation in this document. It is not
S3-compatible — it has its own SDK — which is maximum lock-in for the one part
of this system holding data that cannot be regenerated. And its Hobby tier does
not degrade when limits are reached, it **cuts off**: the documentation is
explicit that access is lost until thirty days have passed. Photographs of
students becoming unreachable for up to a month is not a failure mode worth
accepting to save half a day of work.

AWS S3 is excluded for charging egress, which is exactly what a near-zero-budget
project should design out.

### What it will actually cost

Photographs are re-encoded to a 1920px longest edge before storage, which puts
them around 300 KB each.

| | Free tier | This institute, realistically |
| --- | --- | --- |
| Storage | 10 GB | ~30,000 photographs would fit. A few hundred is plausible |
| Writes (Class A) | 1M/month | A handful a week |
| Reads (Class B) | 10M/month | Served through `/media/[key]` with a one-year immutable cache and Next's image cache in front, so requests that reach the bucket at all are rare |

**Expected recurring cost: ₹0**, with roughly two orders of magnitude of
headroom on every axis.

### The adapter, and why there is no SDK

`@aws-sdk/client-s3` was rejected. It pulls in dozens of transitive packages to
sign four kinds of request, and that weight is paid on every serverless cold
start. AWS Signature Version 4 is a documented algorithm over `node:crypto`,
which already ships with the runtime, so `src/lib/media/sigv4.ts` implements it
in about sixty lines and **adds zero dependencies**.

The signing key derivation is checked against the worked example published in
AWS's own SigV4 documentation (`tests/sigv4.test.ts`), which is an external fact
this project cannot accidentally satisfy.

### The orphan question, answered honestly

Deleting a faculty member, a gallery item or a result **does not delete the
photograph**. That is deliberate and recorded in the delete actions: the same
bytes may be referenced by another record, and the media library refuses to
delete a file anything still points at. An orphaned file is invisible and
recoverable; a broken reference is neither.

The consequence is that unreferenced files accumulate. `npm run media:audit`
reports them and `npm run media:clean` reclaims them. **That is a manual step,
and on a hosted deployment nothing runs it automatically yet** — worth knowing
before it is described as automatic.

**Consent withdrawal is different and is not left to a cleanup script.** Untick
the permission on a gallery item and it comes off the website on save, enforced
by a database CHECK constraint rather than by the form. The file remaining in
storage is not a publication.

---

## If the institute grows

| Growth | First thing that breaks | Fix | Cost |
| --- | --- | --- | --- |
| 5,000 students | Nothing | — | ₹0 |
| 50,000 students | Neon storage | Neon paid | ~₹1,600/mo |
| Heavy traffic | Vercel bandwidth | Pro | ~₹1,700/mo |
| >3,000 emails/mo | Resend free tier | Resend paid | ~₹1,700/mo |
| Many photos | Blob storage | Blob paid | ~₹500/mo |

At the stated scale of ~1,000 students, none of these are near.
