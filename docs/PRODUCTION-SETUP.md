# Production setup

**Provider-specific account creation.** Everything that could be automated has
been; what remains needs accounts and credentials only you can create.

> **The ordered deployment sequence, with a verification gate after every step,
> is [`DEPLOYMENT-RUNBOOK.md`](DEPLOYMENT-RUNBOOK.md).** That is the
> authoritative procedure. This file covers the provider specifics it refers
> to - which accounts to create, and where the values come from. The list of
> things only a person can supply is
> [`DEPLOYMENT-HUMAN-CHECKLIST.md`](DEPLOYMENT-HUMAN-CHECKLIST.md).

> **Never paste a credential into a chat, an issue, or a commit.** Every secret
> below goes into `.env.local` locally, or the hosting provider's environment
> variable UI in production. `.gitignore` protects `.env*` and this is verified
> in the test suite.

---

## Before you start

> ⚠ **The hosting and database providers changed on 5 September 2026.** The
> infrastructure audit found that **Vercel's Hobby plan forbids commercial
> use**, which this build is, and that Neon's free tier suspends compute for the
> rest of the month once its 100 CU-hour allowance is spent. The target is now
> **Netlify + Prisma Postgres + Cloudinary**, and the authoritative
> environment-variable list and manual steps are
> [`NETLIFY-DEPLOYMENT.md`](NETLIFY-DEPLOYMENT.md). Steps 2, 3, 4 and 7 below
> are unaffected; Steps 1, 5 and 6 are superseded and annotated in place.

| You need | Cost |
| --- | --- |
| A Prisma Postgres account (was: Neon) | Free, no card |
| A Netlify account (was: Vercel) | Free |
| A Cloudinary account, for media | Free — no card required |
| A domain name | ~₹800–1,200/year |
| A mailbox on that domain | ₹0–200/month |

Total recurring: **the domain, and optionally the mailbox.** Nothing else.

---

## Step 1 — Database (~~Neon~~ → **Prisma Postgres**)

> **SUPERSEDED** — see [`NETLIFY-DEPLOYMENT.md`](NETLIFY-DEPLOYMENT.md) §3. The
> one substantive difference: Prisma Postgres offers a `prisma://` Accelerate
> URL *and* a **direct TCP** string, and this application needs the **direct TCP
> one** — `@prisma/adapter-pg` speaks the PostgreSQL wire protocol and cannot
> use Accelerate. The instruction below to prefer a "pooled" string is Neon's
> vocabulary, not Prisma's.

1. Sign up at <https://neon.tech>. No card required.
2. Create a project. **Region: Singapore (`ap-southeast-1`)** or Mumbai —
   both are close to Jaipur.
3. Name the database `commerce_insight`.
4. Copy the **Pooled connection** string. Neon offers pooled and direct; the
   application uses **pooled**, because the driver adapter opens a connection
   per serverless invocation and the pooler is what keeps that from exhausting
   the connection limit.

**Why Neon:** measured in Phase 5.5, the entire database is **9.7 MB** with
1,000 students and 1,000 enquiries — roughly 50× headroom on a 500 MB free
tier. See `docs/COST-AND-INFRASTRUCTURE.md`.

## Step 2 — Generate the secrets

Three secrets, each at least 32 characters. Generate each **separately** —
never reuse one for another purpose:

```bash
openssl rand -base64 32   # ENQUIRY_SECRET
openssl rand -base64 32   # ADMIN_SESSION_SECRET
```

| Secret | What it protects |
| --- | --- |
| `DATABASE_URL` | Everything |
| `ENQUIRY_SECRET` | The enquiry IP hash and the anti-spam form token |
| `ADMIN_SESSION_SECRET` | The admin session cookie signature |

The application **refuses to start in production** without the last two, rather
than falling back to a default — a predictable key would make the session
cookie forgeable.

## Step 3 — Run the migration

Locally, with `DATABASE_URL` in `.env.local`:

```bash
npm ci
npm run db:migrate     # prisma migrate deploy
```

Expect: *"All migrations have been successfully applied."*

Then confirm the schema landed:

```bash
npm run verify:preflight -- --target=production
```

`P-DB-04` must read **8/8 present** - those are the constraints that stop a
student record being published without the consent that justifies it.

> This used to say "expect 28 CHECK constraints". Phase 12 removed a dead table
> and its seven constraints, and the real number became 21 - but this sentence
> went on saying 28 for two phases, because prose cannot notice that the thing
> it describes has changed. The numbers now live in
> `src/lib/deployment-contract.ts`, a test fails when they drift, and the
> preflight checks them **by name** against the live database rather than
> counting them.

The migration is deterministic and contains **no destructive statements** — no
`DROP`, no `TRUNCATE`, no `DELETE`. Re-running it on an already-migrated
database is a no-op.

## Step 4 — Create the admin account

```bash
npm run create-admin "you@yourdomain.com" "Sir"
```

It prompts for a password without echoing it. **The password is never accepted
as a command-line argument**, because arguments land in shell history and in
the process list.

Minimum 12 characters. Use a password manager.

## Step 5 — Deploy (~~Vercel~~ → **Netlify**)

> **SUPERSEDED.** Follow [`NETLIFY-DEPLOYMENT.md`](NETLIFY-DEPLOYMENT.md)
> instead. The variable list below is still correct as far as it goes, but it is
> incomplete — it predates the three `CLOUDINARY_*` variables — and the warning at
> the end of this step turned out to be decisive rather than a caution. Kept for
> the record, not for use.

1. Import the GitHub repository at <https://vercel.com>.
2. Framework preset: **Next.js** (auto-detected).
3. Add environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `ENQUIRY_SECRET` | from Step 2 |
| `ADMIN_SESSION_SECRET` | from Step 2 |
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.com` |

4. Deploy.

> ⚠ Vercel's **Hobby plan forbids commercial use.** A coaching institute's
> website is commercial. Check the current terms — the Pro plan is ~US$20/month
> if required. This is the one cost that may be unavoidable and is easy to
> overlook.

## Step 6 — Domain

> **SUPERSEDED** — add the domain in Netlify → Project → Domain management. The
> shape of the step is unchanged; only the provider is. Do this **after** the
> preview deployment passes the checks in
> [`NETLIFY-DEPLOYMENT.md`](NETLIFY-DEPLOYMENT.md) §4.

1. Add the domain in Vercel → Project → Domains.
2. Point the registrar's nameservers or records at Vercel as instructed.
3. Wait for DNS. HTTPS is automatic.
4. Update `NEXT_PUBLIC_SITE_URL` to the final domain and redeploy.

## Step 7 — Email notifications *(optional, do last)*

Not wired, deliberately — there is no professional address or sending domain
yet. **The enquiry is saved to the database before notification is attempted,
so a missing notifier cannot lose a lead.**

When ready:

1. Create a mailbox on the domain (Zoho Mail has a free tier; Google Workspace
   is ~₹150/user/month).
2. Sign up at <https://resend.com> (free to 3,000 emails/month).
3. Verify the sending domain — **add the SPF and DKIM records**. Without them
   the mail lands in spam, which loses leads silently, which is worse than no
   notification at all because nobody notices.
4. Add `RESEND_API_KEY` and `ENQUIRY_NOTIFICATION_TO`.
5. Implement `deliver()` in `src/lib/notify.ts`. Nothing else changes.

## Step 8 — Go live

**Do this last, after the content is real and you have checked it.**

1. Set `SITE_IS_LAUNCHED = true` in `src/config/launch.ts`.
2. Confirm `NEXT_PUBLIC_SITE_URL` is the live `https://` domain.
3. Commit, deploy.
4. Check `https://yourdomain.com/robots.txt` — it must now read `Allow: /`.
5. Submit `https://yourdomain.com/sitemap.xml` in Google Search Console.

Until all three conditions are true, every page carries `noindex` and robots.txt
disallows everything. The third, added in Phase 14, is that every institute fact
in `src/config/institute.ts` must be marked `verified` — the address and phone
numbers came from the old website and nobody has confirmed them yet.
**Three conditions, deliberately** — one environment
variable is far too easy to flip by accident, and a half-finished site entering
Google's index under the institute's name takes weeks to undo.

---

## Pre-launch checklist

> The full list, with evidence columns and the items that are the institute's
> decision rather than a task, is
> [`DEPLOYMENT-HUMAN-CHECKLIST.md`](DEPLOYMENT-HUMAN-CHECKLIST.md). This is the
> short technical version.

Content:

- [ ] Address, phones and hours confirmed **in writing** and matching the Google Business Profile
- [ ] Professional email in `institute.ts` (currently `null`)
- [ ] Transparent logo supplied
- [ ] Course details supplied, or the empty states accepted as-is
- [ ] Consent forms signed for every published student
- [ ] Every published result and story checked in *Admin → Website preview*

Technical:

- [ ] Migration applied; `npm run verify:preflight -- --target=production` passes
- [ ] Admin account created and sign-in tested on production
- [ ] All three secrets set, none committed
- [ ] `npm run verify` passes
- [ ] `/admin` returns a redirect when signed out **on the production domain**
- [ ] `SITE_IS_LAUNCHED = true` and robots.txt confirmed

---

## Backup and recovery

Deliberately not over-engineered. For a database this size:

| Concern | Approach |
| --- | --- |
| **Routine backup** | Neon's built-in point-in-time restore. Free tier retains ~24h (check current terms); paid extends it. No third-party backup service is justified at 10 MB. |
| **Before a migration** | Take a Neon branch first — instant, free, and a perfect rollback point. |
| **Accidental deletion** | Point-in-time restore to just before it. This is the realistic failure: a teacher deleting a student record. |
| **Off-site copy** | `pg_dump` monthly to local storage once real data exists. A single command; worth a calendar reminder. |
| **Rollback** | Migrations are additive with no destructive statements, so a bad deploy is a code rollback, not a data restore. |

**Student records deserve particular care.** They cannot be reconstructed —
the marks came from a physical result, and the consent came from a signed form.
Once real student data exists, a monthly `pg_dump` stops being optional.

> ⚠ Deleting a topper **cascades** to their subject marks (`ON DELETE
> CASCADE`). That is intentional, but it means a delete removes more than the
> row on screen. "Hide from website" is offered separately in the admin, and is
> almost always the right action.
