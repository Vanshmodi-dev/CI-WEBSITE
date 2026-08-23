# Phase 6 — Public-facing website

**Date:** 23 August 2026
**Baseline:** `0595769` (Phase 5.5)

> **No institute facts, student records, results, testimonials, fees, batches,
> contact details, achievements, or other real-world claims were invented
> during Phase 6.**
>
> Everything the site states is traceable to `src/config/institute.ts`, the
> logo artwork, or a row an administrator entered. Everything else is either
> absent or handled by an empty state that says so plainly.

---

## 1. Routes created

| Route | Rendering | Data |
| --- | --- | --- |
| `/about` | Static | Config only |
| `/courses` | ISR 1h | Config + batches |
| `/courses/[slug]` ×5 | SSG + ISR 1h | Config + batches |
| `/results` | Dynamic | Published + consented results |
| `/stories` | ISR 1h | Published + consented stories |
| `/announcements` | ISR 15m | Announcements inside their window |

## 2. Routes modified

`/` (rebuilt with real data bands), `src/app/sitemap.ts` (8 public routes),
`src/config/nav.ts` (dead links removed).

## 3. Components created

`src/components/domain/public-cards.tsx` — `ResultCard`, `StoryCard`,
`BatchCard`, `CourseCard`, `AnnouncementCard`, plus the shared `Portrait` /
`Monogram` pair that renders initials wherever a photograph is not authorised.

## 4. Database queries added

All in `src/lib/public-data.ts`: `getPublishedResults`, `getPublishedStories`,
`getUpcomingBatches`, `getActiveAnnouncements`, `getTopAnnouncement`.

## 5. Public data exposure rules

**Consent metadata never leaves the server.** Every query selects the consent
columns, runs `present()` on the server, and returns **only the resolved
presentation**. The type a component receives has no `consentRef`, no
`consentPhoto`, no `studentName`.

A component cannot leak a field it was never handed.

| Content | Database-side filter |
| --- | --- |
| Results | `published AND consentResult AND consentRef IS NOT NULL` |
| Stories | `published AND consentStory AND consentRef IS NOT NULL` |
| Batches | `published AND startsAt >= now()` |
| Announcements | `published AND startsAt <= now() AND endsAt >= now()` |

Filtering is in SQL, never in JavaScript. `?programme=` is narrowed against the
enum, so an unknown value becomes "no filter" rather than reaching Prisma.

## 6. Consent handling

- A result grant does not publish a name; a name grant does not publish a photo.
- A **story grant does not publish a photograph** — verified twice, once
  through the rendered page and once by the database refusing the row.
- Where a name is not authorised, the card leads with the achievement and shows
  a monogram tile.

## 7. Security decisions

- `src/lib/public-data.ts` imports `server-only`.
- `/admin` absent from navigation, sitemap, and every public HTML payload.
- `Course` structured data carries name and provider only — **no price, no
  duration, no rating**. A fabricated `offers` block is what earns a manual
  action.
- Announcement links are restricted to on-site paths (validated in Phase 5).

## 8. Accessibility

Checked on all 8 public pages: **exactly one `<h1>` each**, **zero images
missing alt text**, `lang="en-IN"`, skip-to-content link present. Status is
never colour-only. Filters and pagination are real links, so they work by
keyboard and without JavaScript.

## 9. SEO

Per-route metadata and canonicals; `EducationalOrganization` on the homepage
and `Course` per course page; sitemap lists all 8 public routes and excludes
`/admin`. **No `AggregateRating`, no `Review`, no founding date, no invented
telephone or coordinates.** `robots.txt` still disallows everything — the site
is pre-launch, and that flips in Phase 7.

## 10. Performance

Server-first throughout. **Every public page added this phase is a server
component**; no client component was introduced. Static or ISR wherever
possible — only `/results` is dynamic, because it reads `searchParams`.

Responsive audit: **0 fixed widths above 320px** across all 8 pages. The
`max-w-[1200px]` container is a *max* width and shrinks correctly.

## 11–12. Tests added, and results

New: `scripts/verify-public-isolation.mjs` — **50 assertions** against real
PostgreSQL and real HTTP, run in three phases (seed → start app → assert) so
ISR caching cannot mask a failure.

| Suite | Result |
| --- | --- |
| Public data isolation | **50 / 50 PASS** |
| Consent constraints | 35 / 35 PASS |
| End-to-end admin + enquiry | 62 / 62 PASS |
| Unit tests | 67 / 67 PASS |
| **Total** | **214 automated checks** |

Covering every case requested:

- unpublished result / story / batch / announcement **does not appear**
- published + consented **appears**
- name without name consent **does not leak** the name
- photo attached to an unpublished record **never renders**
- database **refuses** a published photo without photo consent
- expired batch **does not appear as upcoming**; expired and future-dated
  announcements **do not appear**
- `consentRef`, `consentPhoto`, `consentName`, `consentResult`, `consentStory`,
  `publishedAt`, `displayNameMode` — **all absent from public HTML**
- every internal link on the homepage resolves (11 checked, 0 dead)

## 13–16. Verification

| Check | Result |
| --- | --- |
| Typecheck | clean |
| Lint | 0 errors, 0 warnings |
| Build | 40 routes |
| Dependency audit | **0 vulnerabilities** |
| Secret scan | **1,035 KB** across 9 public pages + 11 assets — clean |

The scan found no `DATABASE_URL`, no secrets, no `PrismaClient`, no
`passwordHash`, no `requireAdmin`, no `ipHash`, no consent fields, no
`studentName`, and no `/admin` reference in any public payload.

## 17. Two real bugs found and fixed

**1. The navigation pointed at four pages that did not exist.**
`/faculty`, `/reviews`, `/videos` and `/gallery` were all 404s served from the
most prominent element on the site. They are removed until their pages exist
and the content behind them is confirmed. A comment in `nav.ts` states the rule:
*a route appears here only if the page exists.*

**2. Publishing did not update the public site.**
Admin actions called `revalidatePath` on `/admin/*` only — **never on any
public route**. A teacher would publish an announcement, watch the website not
change for up to an hour, and reasonably conclude the admin was broken. Fixed
with `src/lib/revalidate-public.ts`, wired into all four action files.

Also corrected: three flaws in my own test harness — a photo fixture that
collided with the site logo, assertions that counted `next/image` `srcSet`
entries as separate photos, and seeding after the server had already cached
the pages. All were test bugs, not application bugs, and are reported here
rather than quietly fixed.

## 18. Files changed

Created: `src/lib/public-data.ts`, `src/lib/revalidate-public.ts`,
`src/components/domain/public-cards.tsx`, `src/app/about/page.tsx`,
`src/app/courses/page.tsx`, `src/app/courses/[slug]/page.tsx`,
`src/app/results/page.tsx`, `src/app/stories/page.tsx`,
`src/app/announcements/page.tsx`, `scripts/verify-public-isolation.mjs`,
`docs/PHASE-6-REPORT.md`.

Modified: `src/app/page.tsx`, `src/app/sitemap.ts`, `src/config/nav.ts`,
`src/config/institute.ts` (courses published), the four admin action files
(public revalidation), `README.md`, `docs/README.md`, `package.json`.

## 19. Intentionally not implemented

| Not built | Why |
| --- | --- |
| `/faculty` | No verified names, credentials or portraits. Inventing faculty is fabrication. |
| `/reviews` | Review Engine not activated — needs Google Business Profile API access. |
| `/videos` | No YouTube channel ID supplied. |
| `/gallery` | No photography supplied. |
| Course syllabus / fees / timings | Not supplied. The pages say so and offer a way to ask. |
| Individual story pages | Two published stories do not justify a route; the cards carry the full text. |
| Map embed | No Place ID or coordinates. |

## 20. Blocked by missing manual setup

Hosted database (Neon account), professional email + sending domain — both
unchanged from Phase 5.5 and both outside this phase's scope.

## 21. Institute information still missing

Faculty names and credentials · founding year and story · course syllabus,
fees, duration and timings · verified NAP and opening hours · Place ID and
coordinates · professional email · social profiles · photography · real
results, stories and consent records · transparent/vector logo.

**Every one of these is absent from the site rather than guessed at.**

## 22. Recommended next phase

**Phase 7 — content collection and launch.** The build is now ahead of the
content by a wide margin, and has been for four phases. The highest-value work
is no longer engineering:

1. Provision the Neon database (Phase 5.5 §1) and run the migration.
2. Collect the blocking content in §21 — especially faculty, the founder's
   story, and course details, which unblock three pages at once.
3. Flip `robots.ts` and the root `noindex` at launch.

I would not add more features. The site does what it should; what it needs is
true information to put in it.

---

## The content-integrity statement

Every claim on the public site traces to one of three sources:

1. **The logo artwork** — the institute's name and the tagline *"Exclusive
   Institute for Commerce Education"*, both read verbatim.
2. **`src/config/institute.ts`** — locality, address, phone numbers (marked
   `unverified` and pending client confirmation) and the programme list.
3. **A database row an administrator entered** — results, stories, batches,
   announcements, each gated on consent.

Nothing else is stated. No founding year, no student count, no pass rate, no
faculty, no fees, no achievements, no ratings, no testimonials. Where a visitor
would expect one of those, they find a short sentence explaining it will be
published, and a way to ask a person instead.

**No fake student data was inserted.** All test fixtures were prefixed `ZZDEMO`
with deliberately non-human names, and every one was deleted — the database
ends this phase with **0 rows** across every content table.
