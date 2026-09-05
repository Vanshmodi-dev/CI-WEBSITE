# Dependency overrides

**Why this file exists:** `package.json` is strict JSON and cannot carry
comments, so the reasoning for every entry in its `overrides` block lives here.
An override with no recorded reason is one nobody can safely remove.

---

## `mysql2: ^3.24.3` and `fast-uri: ^3.1.6`

**Added:** 5 September 2026.
**Result:** `npm audit` → `found 0 vulnerabilities`, with Prisma unchanged at 7.9.1.

### What was wrong

Two transitive packages carried advisories:

| Package | Was | Advisories | Fixed in |
| --- | --- | --- | --- |
| `fast-uri` | 3.1.5 | 4 × high (CVSS 7.5) — SSRF and host confusion: `GHSA-5jgf-p345-68v8`, `GHSA-f65p-4m7j-42xc`, `GHSA-fph4-wmhf-6fwf`, `GHSA-jqff-g426-hqxp` | ≥ 3.1.6 |
| `mysql2` | 3.15.3 | 1 × high `GHSA-3f6p-5ww8-9rcr` (auth-plugin downgrade leaks plaintext credentials), 1 × moderate `GHSA-rgwj-5xj2-c3m3` (decompression-bomb DoS) | ≥ 3.23.1 |

Both arrive through Prisma:

```
@prisma/client@7.9.1   (a production dependency)
└── prisma@7.9.1       (declared by @prisma/client as an OPTIONAL peer)
    ├── mysql2@3.15.3                    ← pinned EXACTLY, not a range
    └── @prisma/dev → @prisma/streams-local → ajv → fast-uri@3.1.5
```

### ⚠ These are not "dev-only"

It is tempting to write that off as a devDependency, because `prisma` is listed
under `devDependencies` here. **That would be wrong.** `@prisma/client` — a
production dependency — declares `prisma` as an optional `peerDependency`, so
npm installs it, `mysql2` and `fast-uri` **even under `npm ci --omit=dev`**.
Verified by running exactly that into a clean directory.

What *is* true is narrower and better evidenced:

- `@prisma/client`, `@prisma/client-runtime-utils` and `@prisma/adapter-pg`
  contain **zero references** to either package.
- The built `.next` output contains **zero references** to `fast-uri`; its only
  `mysql2` match is the substring inside `@effect/sql-mysql2`, a name in Next's
  own external-packages allowlist.
- `mysql2` is reached from exactly one place, `prisma/build/cli.js`, via
  `await import("mysql2/promise")` inside a **`mysql:`-provider branch**. This
  project's provider is `postgresql`, which takes the `postgres:` branch.

So the packages are installed but unreachable on this application's path.

### Why an override, and not something else

- **Upgrading Prisma does not help.** `prisma@7.10.0`, the latest 7.x, still
  pins `mysql2: "3.15.3"` exactly.
- **`npm audit fix --force` proposes `prisma@6.19.3`**, which "fixes" the
  finding by having no `mysql2` dependency at all. It is a **downgrade**, and
  Prisma 6 breaks this project in four places: the `provider = "prisma-client"`
  generator, the `prisma.config.ts` datasource URL, the `@prisma/adapter-pg`
  requirement, and `RUNTIME.prismaMajor: 7`, which `tests/deployment.test.ts`
  asserts.
- **Suppressing the audit was rejected.** CI still runs
  `npm audit --audit-level=high`, unchanged. The override makes that gate pass
  **honestly** — the tree really is patched — rather than silencing it. A
  permanently-red audit gate trains people to ignore the next real advisory.

The override is safe precisely *because* the code is unreachable: even if
bumping `mysql2` across 3.15 → 3.24 broke something, nothing on the PostgreSQL
path would notice.

### When to remove it

Delete both entries once a Prisma 7.x release pins `mysql2 ≥ 3.23.1` and a
`fast-uri ≥ 3.1.6` reaches the tree on its own, then re-run:

```bash
npm install
npm audit --audit-level=high
npm ls mysql2 fast-uri prisma @prisma/client
```

If the audit still passes with the entries gone, they have done their job and
should go. Leaving a stale override pinned above upstream is how a project
quietly falls behind a dependency it thinks it is tracking.

---

## `deepmerge-ts: ^8.0.2`

Pre-existing, unrelated to the above, and not investigated by this note.
