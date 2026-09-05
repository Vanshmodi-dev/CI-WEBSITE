# Netlify deployment — the environment contract

**Date:** 5 September 2026
**Status:** prepared for a **preview** deployment. No production domain, no real
client data, no backup system. Those are separate, later steps.

**Target architecture** (from the infrastructure audit): Netlify Free for
hosting, Prisma Postgres Free for PostgreSQL, and **Cloudinary** for media.
(Media storage moved from Cloudflare R2 to Cloudinary on 5 September 2026 — see
[`MEDIA-STORAGE-CLOUDINARY.md`](MEDIA-STORAGE-CLOUDINARY.md).)

> This file supersedes **Step 5 (Deploy)** and **Step 6 (Domain)** of
> [`PRODUCTION-SETUP.md`](PRODUCTION-SETUP.md), which describe Vercel. The
> reason is not preference: **Vercel's Hobby plan forbids commercial use**, and
> this is a paid client build, so the free tier there was never available to us.
> Steps 1–4 and 7 of that document still apply, except that the database is
> Prisma Postgres rather than Neon.

---

## 1. The environment variables, exactly

These names are not documentation — they are enforced. `ENV_CONTRACT` in
[`src/lib/deployment-contract.ts`](../src/lib/deployment-contract.ts) is the
single source of truth, `tests/deployment.test.ts` proves this table cannot
drift from the source tree, and `npm run verify:preflight` checks a real
environment against it.

### Required — the deploy is wrong without these

| Variable | Scope in Netlify | Value | Secret |
| --- | --- | --- | --- |
| `DATABASE_URL` | All deploy contexts | Prisma Postgres **direct TCP** string | **Yes** |
| `ENQUIRY_SECRET` | All deploy contexts | `openssl rand -base64 32` | **Yes** |
| `ADMIN_SESSION_SECRET` | All deploy contexts | A **different** `openssl rand -base64 32` | **Yes** |
| `NEXT_PUBLIC_SITE_URL` | Per context — see below | The origin, no trailing slash | No |

`ENQUIRY_SECRET` and `ADMIN_SESSION_SECRET` must be **different values** and at
least 32 characters. The preflight check `P-ENV-DISTINCT` fails the deploy if
they match; reusing one secret for two purposes means a compromise of either is
a compromise of both.

`NEXT_PUBLIC_SITE_URL` is the one variable that must differ per context. On a
preview deploy set it to the preview URL Netlify assigns
(`https://<branch>--<site>.netlify.app`). A wrong value does not break the site
— it emits wrong canonical URLs and a wrong sitemap, which is worse, because it
is invisible until Google acts on it.

### Required for media — all three, or none

| Variable | Value for Cloudinary | Secret |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | The short account name only — not a URL | No |
| `CLOUDINARY_API_KEY` | All digits | No |
| `CLOUDINARY_API_SECRET` | The opaque token | **Yes** |

Cloudinary shows a single `CLOUDINARY_URL` of the form
`cloudinary://key:secret@cloud`. **Split it into the three variables above** —
pasting the whole string into any one of them is the commonest mistake, and
`readCloudinaryConfig()` rejects it by name rather than failing later with an
opaque 401.

**Setting two of these three is an error, not a partial configuration.**
`readCloudinaryConfig()` returns `partial` and every media operation refuses, everywhere,
including locally. That is deliberate: a half-configured deployment that quietly
fell back to local disk would accept uploads, display them correctly, and lose
every photograph at the next deploy.

**Setting none of them on Netlify is also refused.** Netlify sets the `NETLIFY`
environment variable, `hostDiscardsItsDisk()` reads it, and the store becomes
`UnconfiguredStore` rather than `LocalDiskStore`. Uploads fail loudly instead of
vanishing later. This is correct behaviour and requires no configuration — but
it does mean **a preview deploy without Cloudinary has a non-functional media library.**

### Optional — leave unset for now

| Variable | Why it is unset |
| --- | --- |
| `REVIEWS_PAYLOAD_URL` | The Review Engine is not activated for this client yet. Without it the reviews band simply does not render. Public data, but **never** prefix it `NEXT_PUBLIC_` — the visitor's browser must never contact a review source. |
| `RESEND_API_KEY` | No sending domain exists. Enquiries persist *before* notification is attempted, so a missing notifier cannot lose a lead. |
| `ENQUIRY_NOTIFICATION_TO` | Set only alongside `RESEND_API_KEY`. |

### Never set these yourself

`NETLIFY`, `VERCEL`, `AWS_LAMBDA_FUNCTION_NAME`, `CF_PAGES`. The platform sets
them. They exist for exactly one decision — "is this host's filesystem thrown
away?" — and setting one by hand makes the application lie to itself about where
it is running.

---

## 2. What is in `netlify.toml`, and what is not

`netlify.toml` carries five settings and **no secrets**. Read the file — every
key has its reason next to it. In summary:

- `NODE_VERSION = "22"` because **Netlify does not read `engines.node`**. Its
  precedence is `.node-version` / `.nvmrc`, then `NODE_VERSION`, then the UI,
  then the build image default. Without this the Node version drifts with the
  build image.
- `SECRETS_SCAN_OMIT_KEYS` / `SECRETS_SCAN_OMIT_PATHS`, scoped to
  `NEXT_PUBLIC_SITE_URL` and the two Turbopack cache directories only.
- `[images] remote_images` mirroring the `remotePatterns` entries in
  `next.config.ts` (YouTube thumbnails and Cloudinary), so neither is blocked by
  Netlify Image CDN, which fails closed on an un-allowlisted host.

The build command is `npm run build`. **`prisma migrate deploy` is deliberately
not part of it** — a build that migrates can alter the schema on a rollback, a
rebuilt preview, or a re-run of a cached deploy.

---

## 3. Manual steps — the ones only a person can do

### Prisma Postgres

1. Create a database at <https://console.prisma.io>. No card required.
2. Region: `ap-southeast-1` (Singapore) or `ap-south-1` (Mumbai) if offered.
3. From **API Keys**, copy the **direct TCP** connection string — the one shaped
   `postgres://…@db.prisma.io:5432/postgres?sslmode=require`. **Not** the
   `prisma://` Accelerate URL: this application connects through
   `@prisma/adapter-pg` over TCP, and the Accelerate URL is a different protocol
   that the adapter cannot speak.
4. Run the migrations **once, from your machine, deliberately**:
   `DATABASE_URL="…" npm run db:migrate`
5. Confirm the CHECK constraints survived — Prisma cannot express them and a
   regenerated migration silently drops them:
   `SELECT count(*) FROM pg_constraint WHERE contype = 'c';`
6. Create the admin account: `npm run create-admin "you@example.com" "Sir"`

### Cloudinary

1. Create an account at <https://console.cloudinary.com>. No card required on
   the free tier.
2. From the dashboard, copy **Cloud name**, **API Key** and **API Secret** into
   the three variables in section 1. Do **not** paste the combined
   `CLOUDINARY_URL`.
3. Nothing else needs creating. The folder `commerce-insight/` appears on first
   upload, and public ids are derived from our own content hashes - there is no
   bucket to name and no path to configure.
4. Leave **Strict transformations** off, and do not set an account-level default
   delivery format or quality. `/media/[key]` serves the ORIGINAL asset, and the
   guarantee that "the bytes we serve are the bytes we re-encoded" depends on
   Cloudinary not re-encoding them. `npm run verify:storage` asserts this
   byte-for-byte and fails if it ever changes.
5. Set a **usage alert** in the Cloudinary console. The free tier is
   credit-based; an alert converts an open-ended meter into a known one.
6. Prove it works before deploying: `npm run verify:storage`.

### Netlify

1. Create the site from the GitHub repository. Framework: Next.js
   (auto-detected). Do **not** add `@netlify/plugin-nextjs` to the repository —
   Netlify installs and updates the adapter itself.
2. Add the environment variables from §1. Mark the four secrets as secret.
3. Deploy the branch as a **preview**, not production.
4. Work through §4 before pointing any domain at it.

---

## 4. Post-deploy verification — what cannot be checked locally

Everything below is a property of the *deployed* system. None of it can be
proven on a laptop, and each has a specific way to fail quietly.

| # | Check | How | Why it matters |
| --- | --- | --- | --- |
| 1 | **Admin CSP is still nonce-based** | `curl -sI https://<preview>/admin/login \| grep -i content-security-policy` | ⚠ **The known risk.** Netlify evaluates `next.config` `headers()` **after** middleware, the reverse of standalone Next. The public baseline CSP (which carries `'unsafe-inline'`) may therefore replace the stricter nonce policy `src/proxy.ts` sets for `/admin`. Expect to see `'nonce-…'` and `'strict-dynamic'`. If you see `'unsafe-inline'` instead, the admin has been silently downgraded to the baseline. It fails *safe*, not open — but it is a real reduction and must be fixed by moving the admin policy into `netlify.toml [[headers]]`. |
| 2 | **Baseline security headers reach the wire** | `curl -sI https://<preview>/` | HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Same ordering caveat as above. |
| 3 | **`sharp` loaded in the function** | Upload a photo at `/admin/media` | If it fails with "Could not load the sharp module", add `[functions] external_node_modules = ["sharp"]` to `netlify.toml`. The Linux binaries **are** in `package-lock.json` (verified), so this is unlikely. |
| 4 | **The proxy runs at all** | Request `/admin` signed out; expect a redirect to `/admin/login` | `src/proxy.ts` runs as a Netlify Edge Function on Deno and calls `randomBytes` from `node:crypto`. If it does not run, the *security boundary still holds* — `requireAdmin()` in every page and action is the real check — but the fast redirect and the nonce are gone. |
| 5 | **Upload size ceiling** | Upload a ~5.9 MB photo | ⚠ **Known constraint.** `MEDIA_LIMITS.maxBytes` is 6 MB and `serverActions.bodySizeLimit` is 8 MB, both chosen so the *application's* error message is the one a teacher meets. Netlify Functions impose their own request body limit (documented at 6 MB), which sits **below** ours — so a large photo may fail with an opaque platform error instead of "that photo is 7.2 MB". Measure the real cutoff on the preview before deciding whether to lower `MEDIA_LIMITS`. |
| 6 | **YouTube thumbnails render** | Open `/videos` | Confirms `[images] remote_images` is correct. A blank thumbnail means the allowlist did not take. |
| 7 | **Pages are not empty** | Open `/faculty`, `/announcements` | See the warning below. |
| 8 | **Preflight against the real environment** | `npm run verify:preflight` with the production env loaded | Checks `P-MEDIA-01`, `P-ENV-DISTINCT`, `P-ENV-DBURL` and the rest against actual values. |

### ⚠ The build does not fail on a missing database

Every reader in `src/lib/public-data.ts` guards with `isDatabaseConfigured()`
and wraps its query in `try/catch`, returning empty and logging. That is correct
for resilience and it has a deployment consequence worth stating plainly:

**If `DATABASE_URL` is missing, wrong, or unreachable from Netlify's build
container, the build SUCCEEDS and ships prerendered pages with no content.** No
error, no warning — a faculty page with no faculty. ISR refills it once
`revalidate` expires (15 minutes for most pages, an hour for courses), so it
self-heals, but the first visitors see an empty site.

Check `/faculty` and `/announcements` on every fresh deploy.

---

## 5. Deliberately not done yet

| | Why |
| --- | --- |
| Production domain | Preview first. `NEXT_PUBLIC_SITE_URL` must change with it. |
| Real client data migration | Preview runs against demo data. |
| Backup system | Prisma Postgres Free includes **no backups**. A nightly `pg_dump` → encrypt → object-storage workflow is required *before* production, not before a preview. |
| `npm run retention` / `media:clean` scheduling | Nothing runs these on a hosted deploy. `audit_log` is the only table with an unbounded growth curve. |
