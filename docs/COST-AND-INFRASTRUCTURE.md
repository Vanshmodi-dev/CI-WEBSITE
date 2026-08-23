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

**Current state:** the admin accepts a *path* to an image already in `/public`.
Validated by `isSafePhotoPath()` (hardened this phase — it previously accepted
`/../../etc/passwd` and `//evil.com`) and covered by unit tests.

**This works, but the teacher cannot upload.** They would have to send a file to
a developer, which is exactly the dependency the admin panel exists to remove.

**Recommended when photos exist: Vercel Blob.** ~₹0 for this volume, integrates
with the existing hosting, no new vendor.

Requirements when built — **student photographs deserve particular care**:

- server-issued upload tokens, never a client-side key
- MIME **and** magic-byte validation, not just the file extension
- re-encode through `sharp` so an uploaded file is never served back as-is
- randomised filenames; the original name is never trusted
- size cap (~2 MB) and dimension cap
- **delete the file when the record is deleted** — an orphaned photo of a minor
  sitting in public storage is exactly the failure this project guards against

Estimated 1 day. Not built now because there are no photos to store, and an
upload pipeline for zero files is speculative work.

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
