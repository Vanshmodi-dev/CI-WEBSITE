# Phase 10 — Security hardening and defence in depth

**Date:** 24 August 2026
**Baseline:** `1074ba2` (Phase 9)

---

## 1. Executive summary

Phase 10 attacked the application rather than reading it. `scripts/verify-security.mjs`
sends the requests an attacker would send — forged sessions, cross-origin posts,
traversal payloads, SSRF probes, manipulated identifiers, hostile search terms —
against a production build, and asserts on what comes back.

It found **three real vulnerabilities**, all confirmed by exploiting them:

1. **A session survived logout.** Capture the cookie, sign out, replay the
   cookie, reach the dashboard. There was no server-side session record, so
   there was nothing to revoke.
2. **The sign-in throttle was bypassable with one header.** Rotating
   `X-Forwarded-For` got **12 of 12** password attempts through untouched — and
   each one cost the server a memory-hard scrypt hash, including for accounts
   that do not exist.
3. **Logout was CSRF-able.** A cross-origin `POST` to `/admin/logout` returned
   303 and cleared the admin's session. Next.js gives Server Actions an
   Origin/Host check automatically; Route Handlers get nothing.

All three are fixed, each with a regression test that fails if the fix is
reverted. Five lower-severity findings were fixed alongside them.

**The CSP question Phase 9 left open is settled, and the answer was not
sitewide**: `/admin` is already `force-dynamic`, so nonces cost it nothing —
strict nonce + `strict-dynamic` there, the documented baseline on the public
site, with the baseline also acting as a fail-safe fallback for admin.

**Security checks: 0 → 243.** Total automated checks **697 → 969**. Performance
is unchanged: 189.6 KB JS, 72/72 budget checks, Lighthouse 100/100/100 with zero
console errors — including on the nonce-protected admin.

---

## 2. Threat model

**The attacker is assumed to know** the public site, every route, every byte of
shipped JavaScript, every rendered HTML attribute, that `/admin` exists, and
that database ids may be guessable. Everything obtainable by reading the site.

**What they are attacking is not a blog.** The database holds, or will hold,
student names, marks, subject-level results, photographs, personal stories, and
enquiry details for families who asked about a course. **Many of the students
are minors.**

### Assets, worst case, and current standing

| Asset | Worst case | Standing |
| --- | --- | --- |
| Admin credentials | Full control of published student data | scrypt N=2^17, unique salts, generic errors, throttled before hashing |
| Admin session | Impersonation for 8 hours | Signed, HttpOnly, Secure, SameSite, **revocable since Phase 10** |
| Unpublished student records | A result published without consent | Filtered in SQL, never leaves the server unresolved |
| Student photographs | A minor's photograph published unconsented | Independent `consentPhoto`, DB CHECK constraint, path allowlist |
| Consent references | Paperwork identifiers exposed | Never in any DTO, verified absent from HTML and every public chunk |
| Enquiry details | Parents' names and phone numbers leaked | No public data function reads them; verified across 9 surfaces |
| `ipHash` | Re-identification of an enquirer | Keyed HMAC, never the raw address, **cleared after 30 days** |
| Audit log | Loss of accountability | Retained 3 years, no personal data by construction |

### Attack surface

Public pages · the enquiry form (the only unauthenticated write) · sign-in ·
the session cookie · 11 admin pages · 11 Server Actions · 1 Route Handler ·
the image optimiser · the sitemap · query parameters on `/results` and
`/stories` · the proxy.

---

## 3. Vulnerabilities discovered and fixed

### 🔴 V1 — a captured session survived logout (session replay)

**Confirmed by exploiting it.** Sign in, keep the cookie, `POST /admin/logout`,
replay the cookie: **HTTP 200, dashboard rendered.**

The session cookie is a signed bearer token with no server-side record — cheap
and stateless, with one serious consequence: nothing can be revoked. Signing out
cleared the cookie in the browser that asked and did nothing to a copy held
anywhere else. A token that leaked from a shared machine, a proxy log or a
backup stayed valid for its full eight hours whatever the admin did.

**Fixed** with one column instead of a session table. The token now carries its
issue time; `AdminUser.sessionsValidFrom` is the account's cut-off; a token
issued before it is refused. Signing out moves the cut-off to now, invalidating
every outstanding token for the account — which is the correct meaning of "sign
me out" for a single-owner admin panel.

`issuedAt` is inside the signed payload, so it cannot be rewritten to step
around the check. Regression tests cover that, and the equality boundary (a
token issued at exactly the cut-off must survive, or signing out would sign the
admin out of the session they just created).

### 🔴 V2 — sign-in throttle bypassed by one header

**Confirmed by exploiting it.** Twelve password attempts with a rotating
`X-Forwarded-For`: **12 of 12 went through unthrottled.**

The only throttle was keyed on a hashed client IP taken from a header the client
sets. Two things were wrong, not one:

- **Unlimited guesses** against a real password.
- **Unlimited scrypt.** Each attempt cost the *server* an N=2^17 hash —
  memory-hard by design, ~128 MB — and one ran even for accounts that do not
  exist, to equalise timing. That made the sign-in form a memory-exhaustion
  amplifier for anyone able to set a header.

**Fixed with three layers**, each cheaper than the next:

1. **Per-instance ceiling** on total sign-in work (60/minute), before any
   database round trip. Bounds the amplification regardless of account.
2. **Per-account failure counter in the database** (10 failures / 15 minutes),
   checked **before hashing**. Survives header rotation, spread load and process
   restarts.
3. **Per-IP burst limiter** (unchanged) for the naive case.

⚠ **The trade, stated plainly.** Someone who knows the admin's email can keep
the account throttled with wrong passwords. That is a real availability cost and
it is the accepted one: an attacker who can annoy the owner for fifteen minutes
is a far smaller problem than one who can grind the password forever. Recovery
is automatic — no manual unlock to get wrong, nothing to support over the phone.
The threshold is generous so ordinary mistyping never reaches it.

A second bug surfaced while fixing this: the new `throttled` outcome initially
fell through to *"That email or password is not correct"*. Telling the owner
their password is wrong when it is merely rate-limited sends them to reset a
password that works, **and hides from them that something is hammering their
account.** It now says so.

### 🟠 V3 — logout was CSRF-able

**Confirmed by exploiting it.** `POST /admin/logout` with
`Origin: https://evil.example` → **303, session cleared.**

Route Handlers do not get the automatic Origin/Host comparison Next.js applies
to Server Actions. Forced logout is a nuisance rather than a takeover — but it
is a state change triggered by a third-party page, and the next Route Handler
this project adds might not be a nuisance.

**Fixed** with `src/lib/request-guard.ts`, a reusable same-origin guard, applied
to the logout handler. `Origin` is authoritative; `Referer` is a fallback for
browsers old enough not to send `Origin` on a POST (without it those clients
cannot sign out at all, and a security fix that breaks logout gets reverted);
neither present means a non-browser client and is refused. **Fails closed.**

### 🟡 V4 — `JSON.stringify` into `dangerouslySetInnerHTML`

`JSON.stringify` escapes what JSON needs and nothing more, so a value containing
`</script>` closes the block early and the rest is parsed as HTML. Every field we
emit comes from static configuration today, so it was not reachable — it was one
edit to `src/config/institute.ts` away from being reachable.

**Fixed:** `jsonLdScript()` escapes `<`, `>` and `&` to unicode escapes. Still
valid JSON, identical parsed value. Asserted on every rendered JSON-LD block.

### 🟡 V5 — unbounded public pagination

`?page=` had a lower bound and no upper one. `?page=999999999` became
`OFFSET 23999999976`, which Postgres answers by walking the index to a row that
does not exist — one cheap request buying an expensive scan, repeatable free, on
an **unauthenticated** endpoint.

**Fixed:** clamped twice — to a ceiling before querying, and to the real page
count once known, so a request for page nine million renders "Page 1 of 1"
rather than an empty page pretending otherwise. Admin pagination clamped too.

### 🟡 V6 — unbounded credential input

An unauthenticated endpoint accepted an unbounded password and email, both of
which reached `normalize('NFKC')` and (for the password) scrypt.

**Fixed:** 200 characters for a password, 254 for an email, enforced in
`signIn` *and* independently inside `verifyPassword`, so a caller that skips its
own check cannot hand an unbounded string to the hash.

### 🟡 V7 — record ids reached the database unvalidated

Prisma parameterises, so this was never injectable. What it was is unbounded
attacker-controlled input handed to Postgres: a 5,000-character id and a JSON
object literal both reached the database before being rejected there.

**Fixed:** `isValidRecordId()` on every mutation that takes an id — delete,
unpublish, status change, notes, and the update branch of every save action. A
malformed id on a save now **refuses** rather than falling through to the create
branch, which would have silently duplicated the record.

### 🟡 V8 — no retention policy

Every phase before this added data and none removed any. `ipHash` — a
per-person identifier — was retained forever to support a check that only looks
back 24 hours.

**Fixed:** `src/lib/retention-policy.ts` states the policy and the reasoning;
`scripts/retention.mjs` applies it. See §12.

### ℹ️ V9 — deprecated `middleware.ts`

Next 16 deprecated the convention. Migrated to `src/proxy.ts`, which is where
the admin CSP now lives too. The deprecation warning is gone from the build.

---

## 4. Authentication architecture

| Property | Implementation | Verified |
| --- | --- | --- |
| Hashing | scrypt (RFC 7914), N=2^17, r=8, p=1, 64-byte key | ✅ parameters asserted from a stored hash |
| Salt | 16 random bytes, unique per hash | ✅ two hashes of one password differ |
| Parameters | Encoded with the hash, so they can be raised later | ✅ |
| Comparison | `timingSafeEqual` on equal-length buffers | ✅ |
| Storage | Never plaintext, never logged, never in a URL | ✅ |
| Enumeration | Unknown account and wrong password return the **identical** message | ✅ byte-compared |
| Timing | A dummy hash runs when no account exists | ✅ |
| Self-registration | None. Accounts are seeded deliberately | ✅ |
| Minimum length | 12 characters | ✅ |
| Maximum length | 200 characters, checked before any hashing | ✅ (Phase 10) |
| Failure record | Counted per account; **emails never written** | ✅ |

**No password appears** in the repository, git history, any client bundle, any
HTML, any source map, or any log. The suite's own admin password is generated at
runtime and never written to disk.

---

## 5. Session architecture

```
sign in  ->  adminId . issuedAt . expiresAt . HMAC-SHA256(secret, payload)
             stored in an HttpOnly, Secure, SameSite=Lax, Path=/ cookie
             8-hour absolute expiry

read     ->  length bound -> shape -> SIGNATURE -> lifetime sanity -> expiry
             -> account exists -> account active -> NOT REVOKED
```

| Property | Standing |
| --- | --- |
| Unpredictable | HMAC-SHA256 over a server secret ≥32 chars; absent in production the app refuses to start |
| HttpOnly / Secure / SameSite / Path / Expiry | ✅ all asserted on the real Set-Cookie |
| Contains no credential | ✅ asserted |
| Absolute expiry | 8 hours, signed, and a token claiming a longer span is refused |
| Signature checked **before** expiry | ✅ probing with an unsigned token reveals nothing about lifetimes |
| Deactivation | Immediate — the account is re-read on every request |
| **Revocation** | ✅ **new** — `sessionsValidFrom`; logout invalidates every outstanding token |
| Fixation | Not applicable: the token is server-minted and carries a server timestamp; nothing client-supplied is adopted |
| Replay after logout | ✅ **closed** |

Nine forged-token shapes are rejected (garbage, empty, wrong signature, altered
id, extended expiry, expired-but-signed, no signature, extra segment, missing
segment), plus a cross-account forgery: one admin's signature cannot authenticate
another admin's id.

**No session table was added.** One column achieved revocation; a table would
have been complexity without a matching benefit for a single-owner panel.

---

## 6. Authorization model

**Every admin mutation independently calls `requireAdminOrNull()` inside the
action.** The proxy is a redirect for a signed-out browser, not the boundary —
a Server Action is an HTTP endpoint reachable without any page ever rendering.

Verified by calling **11 admin routes × 4 credential states** and the student
creation mutation directly:

| Operation | Public | Unauthenticated | Admin |
| --- | :-: | :-: | :-: |
| View public pages | ✅ | ✅ | ✅ |
| Submit enquiry | ✅ | ✅ | ✅ |
| View dashboard / enquiries / preview | ❌ | ❌ | ✅ |
| Create / edit / delete student | ❌ | ❌ | ✅ |
| Publish result / story / photograph | ❌ | ❌ | ✅ |
| Unpublish | ❌ | ❌ | ✅ |
| Create batch / announcement | ❌ | ❌ | ✅ |
| Change enquiry status / notes | ❌ | ❌ | ✅ |

Every non-admin case **failed closed** — 307 to sign-in, and **zero rows
created** by unauthenticated mutation attempts.

**IDOR.** With one admin account there is no cross-tenant boundary to cross
today. What is enforced now is that ids are validated and scoped at the query,
so adding roles later is a change to `requireAdmin`, not a rewrite. Ten hostile
id shapes were substituted into real mutation forms: none produced a server
error, and none altered an unrelated record.

---

## 7. CSRF decision

**Server Actions** — Next compares `Origin` against `Host` and aborts on
mismatch. Verified rather than assumed: a cross-origin POST carrying a **valid
session cookie** created **zero rows**. No token layer was added on top; a second
mechanism duplicating a working one is appearance, not defence.

**Route Handlers** — get none of that, which is V3. Now guarded explicitly.

**The enquiry form** is deliberately *not* CSRF-protected in the classic sense,
and that is correct: it is an unauthenticated public endpoint, so there is no
victim's authority to borrow. It carries a signed timing token and a honeypot
against automation, which is the threat that actually applies to it.

---

## 8. CSP decision

Phase 9 found `script-src 'self'` broke the site — Next streams the RSC payload
as inline `<script>` blocks — and restored function with `'unsafe-inline'`,
leaving the permanent decision here.

| Option | Measured outcome |
| --- | --- |
| **A. Nonces everywhere** | Next's docs are explicit: nonces require dynamic rendering, so *"static optimization and ISR are disabled"*. Phase 8's publish-and-revalidate architecture is ISR. **Rejected for public.** |
| **B. `experimental.sri`** | Built and measured in Phase 9: adds `integrity` to the 7 external scripts, leaves all 5 inline blocks unhashed. **Does not solve it.** |
| **C. `'unsafe-inline'` everywhere** | Works, and weakens XSS defence equally on every page — including those holding the session and student data. |

**The question was not sitewide.** Every `/admin` route is already
`force-dynamic`, so nonces cost the admin nothing. So:

| Surface | Policy |
| --- | --- |
| `/admin/*` | `script-src 'self' 'unsafe-inline' 'nonce-…' 'strict-dynamic'` |
| Everything else | `script-src 'self' 'unsafe-inline'` (baseline) |

`'unsafe-inline'` in the admin policy is **not a weakening**: browsers that
understand nonces ignore it entirely when a nonce is present. It exists so a
browser that understands neither falls back to the public policy rather than
breaking the admin exactly the way Phase 9 found the public site broken.
`https:` is deliberately not added alongside `'strict-dynamic'` — this admin
loads scripts only from its own origin.

**Fail-safe, not fail-open.** `next.config.ts` sets the baseline for *every*
route including `/admin`; the proxy *overrides* it. If the proxy ever fails to
run, admin pages fall back to the baseline rather than to no policy.

**Verified:** admin pages carry a per-request nonce, **0 inline scripts without
one**, and Lighthouse reports **0 console errors** and Best Practices 100 — the
admin hydrates cleanly under the strict policy.

### The full policy

| Directive | Public | Admin |
| --- | --- | --- |
| `default-src` | `'self'` | `'self'` |
| `script-src` | `'self' 'unsafe-inline'` | `'self' 'unsafe-inline' 'nonce-…' 'strict-dynamic'` |
| `style-src` | `'self' 'unsafe-inline'` ¹ | `'self' 'unsafe-inline'` ¹ |
| `img-src` | `'self' data: blob: https://i.ytimg.com` ² | `'self' data: blob:` |
| `font-src` | `'self'` | `'self'` |
| `connect-src` | `'self'` | `'self'` |
| `frame-src` | `'self' youtube-nocookie google.com` ² | `'none'` |
| `object-src` | `'none'` | `'none'` |
| `base-uri` | `'self'` | `'self'` |
| `form-action` | `'self'` | `'self'` |
| `frame-ancestors` | `'none'` | `'none'` |

¹ React injects inline `<style>` during streaming SSR and a nonce cannot be
attached to styles React emits itself. Far less dangerous than inline script.
² Only for features not yet built (YouTube embeds, a map). Removable if they
never ship — noted as a launch-time tightening in §17.

---

## 9. Security headers

Asserted on a live response:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | 11 directives, no wildcard in `script-src`, no `'unsafe-eval'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `DENY` (plus `frame-ancestors 'none'`) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Permissions-Policy` | camera, microphone, geolocation, interest-cohort all `()` |
| `X-Powered-By` | absent |
| `Cache-Control` (admin) | `no-store, must-revalidate` |

---

## 10. XSS, SQL and injection

**XSS.** Hostile strings — `<script>`, `<img onerror>`, `javascript:` URLs —
were stored through the real admin forms and the public pages read back: nothing
rendered as markup, and no `javascript:` value ever reached an `href`. The only
`dangerouslySetInnerHTML` in the project is our own JSON-LD, now unicode-escaped
(V4). No Markdown renderer, no HTML sanitiser, no raw HTML accepted anywhere —
because none is needed. Student names, stories, announcements and enquiry fields
are all treated as hostile input and rendered as text.

**SQL.** No string-built SQL. One `$queryRaw` exists (the dashboard counters);
it is a tagged template with **zero interpolation** — a constant. Every filter is
enum-narrowed or bounded; sort fields and directions are code constants, never
user input; search terms are bounded to 80 characters and passed as parameters.
Five injection payloads through the admin search left the row count unchanged
and all tables present.

**Log injection.** Log lines are `JSON.stringify`d, so newlines and quotes are
escaped by construction; a forbidden-key redactor sits beneath the call sites as
a second layer.

---

## 11. Student and minor data protection

The path is one-directional and there is no other:

```
Database
  -> WHERE published AND consentResult AND consentRef IS NOT NULL   (SQL)
  -> present() resolves name and photo against consent   (server)
  -> PublicResult / PublicStory — no consent field exists on the type
  -> React component
```

**A component cannot leak a field it never receives.** Prisma models are never
passed to components.

The consent matrix was exercised end to end through real pages:

| State | Visible? | Name | Photo |
| --- | :-: | :-: | :-: |
| Unpublished, all consent given | ❌ | — | — |
| Result consent absent | ❌ | — | — |
| Published + result consent | ✅ | withheld | withheld |
| Published + result + name | ✅ | shown | withheld |
| Published + result + name + photo | ✅ | shown | shown |
| Publication withdrawn | ❌ immediately | — | — |

Each fixture had its **own** photo path, so "this photo is absent" means that
record's photo — an earlier draft shared one path across fixtures and could have
passed for the wrong reason.

Verified absent from public HTML **and** from every JavaScript chunk a public
page loads: `consentRef`, `consentResult`, `consentName`, `consentPhoto`,
`consentStory`, `displayNameMode`, `publishedAt`, and internal record ids. The
RSC payload — a separate representation of the same page — was checked
separately.

**Story consent still does not grant photo consent.** 28 database CHECK
constraints remain the last line of defence and all 35 constraint assertions
pass. Two of them caught malformed test fixtures during this phase, which is the
clearest evidence they work.

---

## 12. Image, path and SSRF security

**Image optimiser.** Eight SSRF probes all refused: external host, `localhost`,
loopback, `169.254.169.254` (cloud metadata), private range, `file://`,
protocol-relative, and path traversal. Remote images are restricted to a single
explicit hostname allowlist (`i.ytimg.com`). Width and quality are bounded to the
configured lists — `w=3840` and `w=99999` are refused, `w=96` is served — so the
optimiser cannot be used as an amplifier.

**Path traversal.** Eighteen payloads were submitted through the real photo
field, including single and double URL-encoding, backslashes, UNC paths,
`javascript:`, `data:`, `file:`, a NUL byte, and misleading extensions
(`.jpg.exe`, `.php`). **All eighteen were rejected — none was stored.**
`isSafePhotoPath` is an allowlist, not a denylist: a site-relative path of safe
characters ending in a permitted image extension, and nothing else.

**No user-controlled filesystem operation exists anywhere in the app.** No
uploads, no exports, no generated files. Photo paths are references to static
assets, never file handles.

---

## 13. Rate limiting, IP hashing and retention

| Endpoint | Layers |
| --- | --- |
| Sign-in | Per-instance ceiling (60/min) → per-account DB counter (10 / 15 min, **before hashing**) → per-IP burst (3/min) |
| Enquiry | In-memory burst (3/min) → DB short window (3 / 15 min) → DB daily (10/day) → honeypot → signed timing token → duplicate suppression |
| Admin browsing | Not limited, deliberately — throttling a teacher reading their own leads is cost with no benefit |

**IP handling.** The raw address is **never stored**. `ipHash` is an HMAC-SHA256
keyed with a server secret, so it is not reversible with a precomputed table of
the IPv4 space the way a bare SHA-256 would be. The secret is server-only, never
`NEXT_PUBLIC_`, never logged, and absent in production the app refuses to start
rather than falling back to a default. Only a 12-character prefix appears in
logs, for correlation.

`clientIpFrom` reads `X-Forwarded-For`, which is client-controllable. **That is
now explicitly not load-bearing**: after V2, spoofing it evades only the cheapest
layer, and the account-scoped and instance-scoped limits still hold.

### Retention policy

| Data | Kept | Why that period |
| --- | --- | --- |
| `Enquiry.ipHash` | **30 days**, then cleared | Supports a 24-hour window at most. Thirty days so a burst can still be investigated after a weekend, then it goes |
| `AuditLog` | **3 years** | Answers "who published this student's photograph?", a question that can arrive years later. Holds no personal data |
| `Enquiry` rows | **Not deleted** — count reported | A business record. The period is the **institute's** decision; deleting a lead behind their back would be worse than keeping it |

`scripts/retention.mjs` applies it, with `--dry-run`. Deliberately **not** wired
into a request path: retention that runs as a side effect of page traffic stops
when traffic does.

---

## 14. Cache, ISR and publication leakage

A record with **every** consent granted but `published: false` was created and
five surfaces read: `/`, `/results`, `/sitemap.xml`, `/announcements`,
`/stories`. Absent from all of them — the record, its consent reference, and its
internal id. The **RSC payload** was checked separately and carries no consent
field.

Publication changes propagate immediately (`revalidate-public.ts`, 9/9
revalidation checks, 47/47 integration checks), so a withdrawal is not left
sitting in a cache. Admin responses are `no-store`, so no shared cache can hold
a page rendered for a signed-in account.

---

## 15. Error handling, logging and secrets

**Errors.** Five probe paths — including a malformed Server Action POST that
answers 500 — leak no stack trace, no filesystem path, no connection string, no
Prisma internals, no environment variable name. `logUnexpected` keeps the detail
server-side and hands the visitor a short reference id.

**Audit log.** Records sign-in, sign-out, and every create/update/publish/
unpublish/delete: an actor, an action, an entity type and an id. **Failed
sign-ins are deliberately not written** — that would mean storing the email
tried, and a table of attempted addresses is a credential-stuffing list sitting
in the database. They are counted instead (`failedLoginCount`,
`firstFailedLoginAt`), which is durable, per-account, and stores no address.

**Secret scan — clean.**

| Scanned | Result |
| --- | --- |
| Tracked files (AWS keys, Stripe, GitHub tokens, Slack, private keys) | none |
| Credentialed connection strings | one — `scripts/test-db.mjs`, the local throwaway test database, 127.0.0.1, torn down after each run |
| `.env` files tracked | only `.env.example` |
| **Git history**, every commit | no `.env` ever committed, no secret pattern ever added |
| `NEXT_PUBLIC_*` | one — `NEXT_PUBLIC_SITE_URL`, genuinely public |
| Client bundles | 0 chunks contain `PrismaClient`, `DATABASE_URL`, `ADMIN_SESSION_SECRET`, `ENQUIRY_SECRET`, `passwordHash`, `sessionsValidFrom` or `failedLoginCount` |
| Source maps | not published |

**No live secret was found, so none needs rotation.**

---

## 16. Client/server boundary

Eleven modules carry `import 'server-only'`, making a client import a **build
error** rather than a runtime leak: `db`, `auth`, `crypto`, `log`, `notify`,
`enquiry`, `rate-limit`, `admin-data`, `public-data`, `revalidate-public`,
`retention`.

Four modules deliberately omit it — `validation`, `token`, `session-token`,
`indexing`, `retention-policy`, `request-guard` — because they touch no I/O, no
environment and no database, and keeping them importable is what makes them
unit-testable. **A security check that cannot be tested is a security check
nobody has verified.**

Four chunks contain the string `consentRef`; all four are admin-only and **none
is referenced by any public route**, verified by intersecting the chunk lists.

---

## 17. Dependency audit

`npm audit` — **0 vulnerabilities**, with and without dev dependencies.

**8 runtime dependencies**, all first-tier: Next, React, React-DOM, Prisma
client + adapter, `server-only`, `clsx`, `tailwind-merge`. 602 packages total,
389 dev-only, **213 reachable at runtime**.

**Nothing was added in Phase 10.** Every fix uses `node:crypto`, Next primitives,
Prisma constraints or a small pure function. One native package exists
(`@embedded-postgres/windows-x64`) and it is a **devDependency** used only by the
local test harness; its install script is explicitly allowlisted rather than
globally permitted.

**No version was changed.** Nothing required it, and upgrading during a security
phase for its own sake adds risk without removing any.

---

## 18. Security test suite

`npm run verify:security` — **243 checks** against a production build:

| § | Area | Covers |
| --- | --- | --- |
| 1 | Authentication | scrypt parameters, unique salts, enumeration, cookie attributes |
| 2 | Session | 9 forged shapes, cross-account forgery, deactivation, **replay after logout** |
| 3 | Authorization | 11 routes × 4 credential states, plus direct mutation calls |
| 4 | CSRF | Cross-origin Server Action, cross-origin Route Handler, Referer fallback, GET-logout |
| 5 | XSS | Stored payloads, `javascript:` hrefs, JSON-LD escaping |
| 6 | IDOR | 10 hostile id shapes through real forms, id substitution |
| 7 | Path traversal | 18 payloads through the real photo field |
| 8 | Image / SSRF | 8 SSRF probes, 3 amplification probes, 1 positive control |
| 9 | Resource bounds | Deep pagination, oversized bodies, oversized credentials |
| 10 | SQL | 5 payloads, row-count and table-existence checks |
| 11 | Consent matrix | 5 states end to end, plus withdrawal |
| 12 | Enquiry confidentiality | 9 public surfaces, admin `ipHash` suppression |
| 13 | Headers | 8 headers, 11 CSP directives |
| 14 | Error disclosure | 5 paths + a malformed action POST |
| 15 | Secrets | 7 markers across pages and every referenced asset |
| 16 | Rate limiting | Sign-in throttle, header-rotation bypass |
| 17 | Cache / ISR | Unpublished record across 5 surfaces + the RSC payload |
| 18 | Open redirect | 3 parameter shapes |
| 19 | HTTP methods | PUT/DELETE/PATCH on the Route Handler |

Fixtures are `ZZSEC`-prefixed and deleted; the admin password is generated at
runtime and never written to disk.

**Three harness bugs were found and fixed while building this**, and they are
worth recording because each produced a *false* finding: Server Actions must be
posted as `multipart/form-data` with HTML-entity-decoded action fields or they
silently do not run; fetching `/admin/login` *with* a session cookie redirects,
so the form never renders and the following POST answers 500; and posting bare
fields to a page with no bound action answers 500 for reasons that say nothing
about security. Ten "IDOR failures" in an early run were all the last one.

---

## 19. Full regression

| Suite | Result |
| --- | --- |
| **Security (new)** | **243 / 243** |
| SEO | 335 / 335 |
| Unit tests | **126** / 126 (was 87) |
| Performance budget | 72 / 72 |
| End-to-end | 62 / 62 |
| Public data isolation | 50 / 50 |
| Integration | 47 / 47 |
| Consent constraints | 35 / 35 |
| Revalidation | 9 / 9 |
| **Total** | **969** (was 697) |

Typecheck clean · lint 0/0 · production build clean, deprecation warning gone ·
`npm audit` 0 vulnerabilities · database ends at **0 rows in every table**.

### Performance did not regress

| Metric | Phase 9 | Phase 10 |
| --- | ---: | ---: |
| JS per route | 189.6 KB | 189.6 KB |
| Fonts (critical path) | 89.0 KB | 89.0 KB |
| Total, heaviest route | 300.2 KB | 300.2 KB |
| Budget checks | 72 / 72 | 72 / 72 |
| Lighthouse `/` (desktop) | 100 / 100 / 100 | 100 / 100 / 100, LCP 0.6 s, CLS 0, TBT 0 ms |
| Lighthouse `/admin/login` | not measured | 100 / 100 / 100, **0 console errors under the nonce CSP** |

ISR is intact: `/`, `/about`, `/courses`, `/courses/[slug]`, `/announcements`
still prerender, and publishing still updates them immediately.

---

## 20. Deferred, with reasons

| Item | Impact | Owner | Before launch? |
| --- | --- | --- | --- |
| Public `script-src` keeps `'unsafe-inline'` | An injected inline script would run on public pages. Bounded: no user-supplied HTML is rendered there, and the only `dangerouslySetInnerHTML` is our escaped JSON-LD | Revisit if Next ships stable inline-script hashing | No — accepted, documented |
| `img-src`/`frame-src` allow YouTube and Google Maps | Wider than currently needed; those features are not built | Phase 13 | **Yes** — remove if the features never ship |
| Enquiry retention period unset | Leads accumulate indefinitely | **The institute** | **Yes** — needs an owner decision, not an engineering one |
| No 2FA on the admin | A stolen password is full access | Phase 11+ | No — one account, strong password policy, throttling, revocable sessions |
| No account-recovery flow | A forgotten password needs `create-admin.mjs` and shell access | — | No — deliberate; a reset flow is a whole new attack surface for one user |
| Per-instance limiters are per-process | On serverless, spread load evades layer 1 | — | No — layers 2 and 3 are database-backed and authoritative |
| Volumetric DDoS | Not defended | Platform WAF | **Yes** — enable at the edge; the app cannot do this |
| `ResultRecord` model unused | Dead schema, no data | Phase 12 | No |
| Optimistic locking | Last-write-wins on concurrent edits | Phase 11+ | No — one account |

**No security finding was deferred.** Everything above is either an accepted
trade with reasoning, a decision that belongs to the owner, or infrastructure the
application cannot provide.

---

## 21. Adversarial review — the questions, answered

| Question | Answer |
| --- | --- |
| Can I become admin? | No. No self-registration; scrypt N=2^17; sign-in throttled before hashing; forged sessions rejected in 9 shapes |
| Can I bypass authorization? | No. Every mutation re-checks server-side; verified with direct calls |
| Can I read another student's private information? | No. Filtering is in SQL; DTOs carry no private field |
| Can I publish an unconsented photograph? | No. Action gate, then a database CHECK constraint |
| Can I access an unpublished result? | No. Absent from HTML, RSC payload, sitemap and every public chunk |
| Can I steal or replay a session? | Theft still needs the cookie. **Replay after logout is now closed** |
| Can I submit malicious HTML? | It stores, and renders as text. No `javascript:` URL reaches an href |
| Can I force the server to fetch an internal URL? | No. 8 SSRF probes refused; remote images are host-allowlisted |
| Can I abuse image processing? | No. Widths and qualities bounded to configured lists |
| Can I cause unbounded database work? | No. Pagination clamped, searches bounded, credentials bounded |
| Can I extract secrets? | No. Nothing in HTML, bundles, source maps or git history |
| Can cached public pages expose private data? | No. Verified with a fully-consented but unpublished record |
| Can I manipulate ids to reach other records? | No. Ids are shape-validated and scoped at the query |
| **Can I lock the owner out?** | **Yes, for 15 minutes at a time, if I know their email.** Accepted and documented — §3 V2 |

---

**PHASE 10 COMPLETE — PHASE 11 NOT STARTED.**

Recommended next: **Phase 11 — Full QA.** Real-device and screen-reader passes,
the mobile Core Web Vitals question Phase 9 left open, cross-browser
verification of the nonce CSP in the admin, and an end-to-end rehearsal of the
teacher's actual workflow.
