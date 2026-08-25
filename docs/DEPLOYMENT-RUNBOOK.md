# Deployment runbook

**The ordered sequence, with a verification gate after every step that can fail
silently.** Follow it top to bottom. Do not skip a gate because the previous
step "obviously worked" — Phase 12 shipped a database that reported itself
healthy with the entire consent model missing.

> **Nothing in this runbook has been executed.** No hosting account exists, no
> database has been provisioned, no domain has been bought. This is the
> procedure, written and rehearsed against a local production build.

**Related documents**

| Document | What it is for |
| --- | --- |
| [`DEPLOYMENT-HUMAN-CHECKLIST.md`](DEPLOYMENT-HUMAN-CHECKLIST.md) | What only a person can supply. **Start here** — most of it blocks Step 1. |
| [`PRODUCTION-SETUP.md`](PRODUCTION-SETUP.md) | Provider-specific account creation (Neon, Vercel, email). |
| [`COST-AND-INFRASTRUCTURE.md`](COST-AND-INFRASTRUCTURE.md) | What it costs and what was deliberately not bought. |
| `src/lib/deployment-contract.ts` | **The machine-readable contract.** Every number below is derived from it. |

---

## The one-line summary

```
npm run verify:preflight -- --target=production
```

Exit code 0 means the environment satisfies the deployment contract. Anything
else means stop and read the output; every failure names the file to change and
what to change it to.

---

## 0. The deployment contract

Everything the application requires. **This table is generated from
`src/lib/deployment-contract.ts` and a test fails if it drifts** — so if it
disagrees with reality, the tests are the thing to trust and this table is the
thing to fix.

### Runtime

| Requirement | Value |
| --- | --- |
| Node | `>=20.9.0` — CI runs 22, local verification ran 24 |
| Next.js | 16.3.2 (pinned, not ranged) |
| React | 19.2.8 |
| Prisma | 7.x — the driver adapter is mandatory from 7 onward |
| PostgreSQL | 14 minimum; verified against 18.4 |
| Package manager | npm, with `npm ci` (a lockfile is required) |

### Environment variables

| Variable | Required | Secret | In the browser? | Notes |
| --- | --- | :-: | :-: | --- |
| `DATABASE_URL` | always | ✅ | ❌ | **Pooled** connection string, `?sslmode=require` |
| `ADMIN_SESSION_SECRET` | production | ✅ | ❌ | ≥32 chars. Refuses to start without it |
| `ENQUIRY_SECRET` | production | ✅ | ❌ | ≥32 chars. Must differ from the above |
| `NEXT_PUBLIC_SITE_URL` | production | ❌ | ✅ | **Needed at BUILD time — see the warning below** |
| `RESEND_API_KEY` | optional | ✅ | ❌ | Notifications are unwired; enquiries persist without it |
| `ENQUIRY_NOTIFICATION_TO` | optional | ❌ | ❌ | Only meaningful alongside the key |

> ### ⚠ `NEXT_PUBLIC_SITE_URL` is baked in at build time
>
> Next replaces every `NEXT_PUBLIC_*` reference with a literal **during the
> build**. Setting it only in the hosting provider's runtime environment — which
> is where the other three go, and where it looks like it belongs — leaves the
> built output carrying whatever was set when the build ran.
>
> Phase 13 measured the consequences against a real production build:
>
> - every canonical URL pointed at `http://localhost:3000`
> - so did every JSON-LD `@id`
> - so did every `<loc>` in `sitemap.xml`
> - and `hasRealDomain()` read the same baked value, so **the launch switch
>   could never engage** — the site would stay `noindex` no matter what
>   `SITE_IS_LAUNCHED` was set to
>
> The site works. It looks right. It tells Google the real content lives on
> localhost. **Set it in the build environment, and rebuild after changing it.**
> `verify:preflight` check `P-BUILD-05` compares what the build baked against
> what the environment now says.

### The database shape

| Object | Count | Verified by |
| --- | ---: | --- |
| Tables | 9 | `P-DB-02` |
| Enums | 5 | `P-DB-03` |
| **CHECK constraints** | **21** | **`P-DB-04` / `P-DB-05`, by name** |
| — of which consent-critical | 8 | `P-DB-04` |
| Unique constraints | 3 | `P-DB-07` |
| Foreign keys | 2 | `P-DB-08` |

> **The constraints are checked BY NAME, never by count.** Prisma cannot express
> a CHECK constraint, does not know they exist, and silently drops every one of
> them when a migration is regenerated. A count would pass a database holding 21
> constraints of which eight were the wrong eight.

### What must be true before…

| Stage | Condition |
| --- | --- |
| **the app can start** | `DATABASE_URL` set; both secrets set and ≥32 chars |
| **traffic can be accepted** | migration applied; all 21 constraints present; admin account exists; HTTPS live |
| **launch** | institute has approved every published record; `SITE_IS_LAUNCHED = true`; `NEXT_PUBLIC_SITE_URL` a real `https://` origin **at build time**; **every institute fact marked `verified`** |

### Deliberately manual, forever

Creating accounts · buying the domain · generating secrets · creating the admin
account · approving content · **flipping the launch switch** · submitting the
sitemap to Search Console · importing real student data.

None of these is automated, and none should be.

---

## The sequence

Each step states what to do, then how to know it worked.

### Step 1 — Prerequisites

Work through [`DEPLOYMENT-HUMAN-CHECKLIST.md`](DEPLOYMENT-HUMAN-CHECKLIST.md).
Most of it blocks everything below.

**Gate:** every item in that file's "blocks deployment" section is ticked with
evidence.

---

### Step 2 — Create the PostgreSQL database

See [`PRODUCTION-SETUP.md`](PRODUCTION-SETUP.md) Step 1 for the provider
specifics. Region: Singapore or Mumbai. Take the **pooled** connection string —
the driver adapter opens a connection per invocation, and the pooler is what
keeps that inside the connection limit.

**Gate:** the string starts `postgresql://`, contains credentials, and ends
`?sslmode=require`.

---

### Step 3 — Generate the secrets

```bash
openssl rand -base64 32   # ADMIN_SESSION_SECRET
openssl rand -base64 32   # ENQUIRY_SECRET
```

Generate them **separately**. Sharing one value means a leak of either
compromises both, and `P-ENV-DISTINCT` fails if they match.

> Never paste a secret into a chat, an issue, a commit, or a screenshot.

**Gate:** two different values, each ≥32 characters.

---

### Step 4 — Configure the environment

Set all four variables in the hosting provider's environment settings, **for the
build as well as the runtime**. See the `NEXT_PUBLIC_SITE_URL` warning above.

**Gate:**

```bash
npm run verify:preflight -- --target=production
```

Expect `P-ENV-*` all PASS. The database section will still fail until Step 5.

---

### Step 5 — Apply the migration

```bash
npm ci
npm run db:migrate      # prisma migrate deploy
```

`migrate deploy` never generates or resets anything. It applies what is in
`prisma/migrations/` and stops if history does not match.

**Gate — this is the most important gate in the runbook:**

```bash
npm run verify:preflight -- --target=production
```

`P-DB-04` must read **8/8 present**. If it names a missing constraint, the
consent model is not being enforced by the database: **stop**. Do not deploy.
Restore the constraints from the migration and re-apply.

> **If a migration ever needs regenerating**, read
> `prisma/migrations/*/migration.sql` first. Everything below the
> `HAND-WRITTEN` banner is hand-written SQL that Prisma will delete without
> mentioning it.

---

### Step 6 — Create the admin account

```bash
npm run create-admin "you@yourdomain.com" "Sir"
```

The password is prompted for, never passed as an argument — arguments land in
shell history and in the process list. Minimum 12 characters; use a password
manager.

**Gate:** the command reports success, and `admin_users` holds exactly one row.

---

### Step 7 — Build and deploy

Build command: `npm run build` · Install: `npm ci` · Start: `npm start`
(a Node host) or the provider's Next.js preset.

**Gate:** the build completes with no type errors. `next build` fails the build
on them by design.

---

### Step 8 — Verify the deployment

```bash
BASE_URL=https://<PRODUCTION_DOMAIN> npm run verify:production -- --expect-prelaunch
```

Read-only: it makes GET requests and changes nothing. 25 checks covering HTTPS,
the security headers, every public page, the admin guard, robots, canonicals and
caching.

**Gate:** `RESULT: OK.` In particular `S-ADM-01` (every admin page redirects when
signed out), `S-ADM-03` (a forged cookie is rejected) and `S-ADM-04` (the export
endpoint refuses a stranger) must pass. Any of those failing is a stop-the-line
event.

---

### Step 9 — Verify HTTPS and the domain

1. Add the domain in the hosting provider's dashboard.
2. Point the registrar's records as instructed. DNS takes minutes to hours.
3. Confirm the certificate is live and `http://` redirects to `https://`.
4. **Set `NEXT_PUBLIC_SITE_URL` to the final domain and BUILD AGAIN.**

**Gate:** `verify:production` passes against the real domain, with `S-NET-02`
and `S-NET-03` now PASS rather than NOT APPLICABLE, and `S-SEO-05` reporting a
canonical on that domain.

---

### Step 10 — Verify admin sign-in and the enquiry form

Sign in on the production domain. Submit one enquiry through
`/admissions` and confirm it appears in *Admin → Enquiries*.

Delete that test enquiry afterwards.

**Gate:** sign-in works, sign-out works, the enquiry arrives.

---

### Step 11 — Import the approved real data

**Only now, and only data the institute has approved with signed consent forms
on file.**

1. *Admin → Data* → download the template.
2. Fill it in. Decide the **reference scheme** first (see the human checklist) —
   it is what makes a later import a correction rather than a duplicate.
3. Upload and **read the dry run**. It writes nothing.
4. Confirm.

**Importing never publishes anything.** Every imported record lands unpublished
regardless of what the spreadsheet says; there is no publish column and a test
fails if one is ever added.

**Gate:** the import history shows the expected counts and `made public: 0`.

---

### Step 12 — Teacher review

The teacher opens *Admin → Website preview* and checks every record they intend
to publish, then publishes them **one at a time**. That is deliberate: 50
toppers is 50 decisions.

**Gate:** the institute confirms in writing that every published record is
correct and consented.

---

### Step 13 — Launch

**Everything above must be done. This is the irreversible-ish step: getting a
half-finished site back out of Google's index takes weeks.**

1. **Confirm every institute fact with the institute, in writing**, then set
   each `status` to `'verified'` in `src/config/institute.ts`. The address and
   both phone numbers were carried over from the old website and are
   `unverified` until this happens.
2. Set `SITE_IS_LAUNCHED = true` in `src/config/launch.ts`.
3. Confirm `NEXT_PUBLIC_SITE_URL` is the live `https://` domain.
4. Commit, **rebuild**, deploy.

> **Three conditions, all required.** `isIndexable()` returns false unless the
> code flag, a real production domain and verified institute facts all agree.
> Skip the first and the site deploys permanently `noindex` with no obvious
> cause - so run `npm run verify:preflight` first and read `P-LAUNCH-07`, which
> names any fact still outstanding.

**Gate:**

```bash
BASE_URL=https://<PRODUCTION_DOMAIN> npm run verify:production
```

(without `--expect-prelaunch`). `S-SEO-01` must now report `Allow: /`, `S-SEO-02`
must show the sitemap advertised, and `S-SEO-06` must show pages are indexable.
`S-SEO-03` must still show `/admin` disallowed.

---

### Step 14 — Search Console

Submit `https://<PRODUCTION_DOMAIN>/sitemap.xml`. Not before: a sitemap
submitted while the site says `Disallow: /` is a contradictory signal.

---

### Step 15 — Monitor

See §"What to watch" below.

---

## Rollback

| Situation | Action |
| --- | --- |
| **Bad deploy, no migration** | Redeploy the previous commit. Migrations are additive, so the old code runs against the new schema. |
| **Bad deploy, migration applied** | Still a code rollback. Every migration to date is additive with no destructive statements — `P-MIG-04` fails the preflight if that ever stops being true. |
| **Migration failed halfway** | `P-DB-11` reports it. **Do not re-run it.** Resolve by hand against a branch/restore of the database. |
| **Constraints missing after a migration** | Re-apply the constraint block from `prisma/migrations/*/migration.sql`. Then re-run the preflight and confirm `P-DB-04` reads 8/8. |
| **Bad import** | Every import is one transaction: it either all landed or none did. Correct the spreadsheet and re-import with the same `Reference` values — that updates rather than duplicates. Nothing was published, so nothing was public. |
| **Wrong record published** | Unpublish it in the admin. It disappears from the public site on the next revalidation, which the unpublish triggers. |
| **Data loss** | Point-in-time restore at the database provider. See below. |

### Migration rollback, specifically

There are no down-migrations, and that is deliberate. A down-migration that
drops a column destroys the data in it, and for this schema that data is a
child's consent record. **The rollback for a bad schema change is a database
restore, not a reverse migration.**

Before any migration against a database holding real records: take a branch or
snapshot first. It is instant and free on most providers and it is the only
real undo.

---

## Backup and recovery

**No backup exists today, because no database exists.** Nothing in this section
has been performed.

| Concern | Approach | Whose job |
| --- | --- | --- |
| Routine backup | The provider's automatic point-in-time restore. Check the retention the current plan actually gives. | Provider, verified by a human |
| Before a migration | Take a branch/snapshot manually. Instant, free, and a perfect rollback point. | Deployer |
| Accidental deletion | Point-in-time restore to just before it. **This is the realistic failure**: a teacher deleting a student record. | Deployer |
| Off-site copy | `pg_dump` monthly to local storage, once real data exists. | Institute + agency |
| Restore testing | Restore into a scratch database and run `verify:preflight` against it. An untested backup is a hope. | Agency, quarterly |

> **Student records cannot be reconstructed.** The marks came from a physical
> result and the consent came from a signed form. Once real data exists, a
> monthly `pg_dump` stops being optional.

> ⚠ Deleting a topper **cascades** to their subject marks (`ON DELETE CASCADE`,
> verified by `P-DB-08`). "Hide from website" is offered separately and is
> almost always the right action.

---

## Failure modes

| # | Failure | How it shows | Visitor sees | Response | Human needed? |
| --- | --- | --- | --- | --- | :-: |
| 1 | Database unavailable | Pages that query fail; `P-DB-00` fails | Error page, no data leak | Check the provider; the app does not cache credentials | Yes |
| 2 | Migration pending | `P-DB-10` names it | Possibly broken queries | `npm run db:migrate` | Yes |
| 3 | Migration partly applied | `P-DB-11` BLOCKED | Undefined | **Do not re-run.** Restore, then re-apply | Yes |
| 4 | Bad environment variable | `P-ENV-*` fails | Depends | Fix and redeploy | Yes |
| 5 | Missing or short secret | App **refuses to start** in production | 500 | Set a real ≥32-char secret | Yes |
| 6 | `NEXT_PUBLIC_SITE_URL` set at runtime only | `P-BUILD-05` fails | Site looks fine; canonicals point elsewhere | **Rebuild** | Yes |
| 7 | Admin unavailable | Sign-in fails | Public site unaffected | Check DB and secret | Yes |
| 8 | Public site down | `S-PUB-01` fails | Nothing loads | Roll back the deploy | Yes |
| 9 | Email unavailable | Notification skipped, logged | Nothing — **the enquiry is already saved** | Read enquiries in the admin | No |
| 10 | Bad import | Dry run showed it, or history shows the counts | Nothing — imports never publish | Re-import with the same references | No |
| 11 | Stale public page | A change does not appear | Old content | Publishing revalidates; if not, redeploy | Sometimes |
| 12 | Domain misconfigured | `S-SEO-05` reports a foreign canonical | Site may be unreachable | Fix DNS, rebuild if the origin changed | Yes |
| 13 | HTTPS failure | `S-NET-02`/`S-NET-03` fail | Browser warning | Provider certificate settings | Yes |
| 14 | CSP failure | `S-HDR-08` fails | Admin may not hydrate | Baseline CSP still applies — fail-safe, not fail-open (`S-HDR-10`) | Yes |
| 15 | Database provider suspended | Everything data-driven fails | Error pages | Billing; restore elsewhere from `pg_dump` | Yes |
| 16 | Host unavailable | Site down | Nothing loads | Provider status; the repository is portable | Yes |

---

## What to watch after launch

Deliberately small. This is a small site and monitoring it should not cost more
than running it.

| Signal | Why | How |
| --- | --- | --- |
| Uptime of `/` | The obvious one | Any free uptime pinger, 5-minute interval |
| `/admin/login` responds | Nobody can administer a broken admin | Same pinger, separate check |
| Error rate | Catches a bad deploy | The host's own dashboard |
| Database size and connection count | Free tiers have limits | Provider dashboard, monthly |
| Enquiries arriving | **A silent drop in enquiries is the most expensive failure** — the site looks fine and the institute loses students | The teacher checks *Admin → Enquiries* daily |
| Search Console coverage | After launch only | Weekly for the first month |

> **Notification email is not wired.** The enquiry is written to the database
> *before* notification is attempted, so a missing notifier can never lose a
> lead — but it does mean somebody must look at the admin. Until email exists,
> that daily check is the whole notification system.

### What must never be logged

Query logging is off outside development (`P-CFG-09`) because Prisma's query
logs include bound parameters — for this schema that means names, phone numbers
and message bodies. Failed sign-ins log *that* one happened, never the email
attempted: a failed-login log full of addresses is a credential-stuffing list
waiting to leak.

---

## Health endpoint — deliberately not created

A `/api/health` route was considered and **not built**.

It would add a public, unauthenticated endpoint whose entire job is to report
infrastructure state, on a site whose attack surface is currently two public
mutating actions and nothing else. Anything genuinely useful in it — database
reachable, migration applied, constraint count — is exactly what an attacker
wants to know, and anything safe enough to expose is already answered by `GET /`
returning 200.

The host's own health checking already covers "is the process alive". Depth is
covered by `verify:preflight`, which runs with credentials, against the real
database, and prints far more than an endpoint safely could.

**If one is ever needed** — a provider that requires a specific health path —
it must return a bare `200` with an empty body and read nothing from the
database.
