/**
 * A complete, obviously-synthetic demonstration dataset — DEVELOPMENT ONLY.
 *
 * =============================================================================
 * WHY THE PREFIX IS `ZZSHOW` AND NOT `ZZTEST`
 * =============================================================================
 * `ZZTEST` is already owned by three verification suites - verify-integration,
 * verify-import and synthetic-scale - and each begins by deleting every row
 * whose name starts with it. `ZZDEMO` belongs to verify-public-isolation,
 * `ZZQA` to verify-teacher, `ZZSEC` to verify-security.
 *
 * The first version of this seeder used `ZZTEST` and the dataset silently
 * vanished the moment a test suite ran. `ZZSHOW` is unclaimed, so the demo data
 * and the test fixtures can coexist - which matters, because someone reviewing
 * the site will also want to run the tests.
 *
 * It is no less obviously synthetic: nothing named `ZZSHOW Student 001` could
 * be mistaken for a person.
 *
 *   npm run seed:demo          insert or reconcile the dataset
 *   npm run seed:demo:clean    remove it, and nothing else
 *   npm run seed:demo -- count report what is currently there
 *
 * =============================================================================
 * WHAT THIS IS FOR, AND HOW IT DIFFERS FROM synthetic-scale.mjs
 * =============================================================================
 * `synthetic-scale.mjs` fills the database with a thousand near-identical rows
 * to measure how the site behaves at scale. It is filler by design and reads
 * like it.
 *
 * This one is for LOOKING at the site. Every record is chosen to put a
 * different state on screen: a full name beside an initials-only name, a
 * photograph beside a monogram, a long highlight beside none, five programmes,
 * three years, published rows beside drafts, an announcement inside its window
 * beside one that has expired. Enough rows to push both list pages past their
 * first page.
 *
 * Both are kept. They answer different questions.
 *
 * =============================================================================
 * EVERY ROW IS UNMISTAKABLY SYNTHETIC
 * =============================================================================
 * Names are `ZZSHOW Student 001`, not plausible names. Phones are `9100000001`
 * and similar. Emails end `.invalid`, a TLD reserved by RFC 2606 that can never
 * resolve. Photographs are flat-colour PNG tiles with no face in them. If any
 * of this ever reached a public page by accident it would be obvious at a
 * glance rather than believable, which is the entire point.
 *
 * =============================================================================
 * IT GOES THROUGH THE REAL RULES
 * =============================================================================
 * Prisma only, no raw SQL. Every row therefore meets the 21 CHECK constraints,
 * the consent model and the publication rules exactly as the application does.
 * Where a row is published it holds a consent reference and the permission for
 * its kind of content, because the database refuses anything else - and that
 * refusal is a feature this dataset is meant to demonstrate, not route around.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { env, argv, exit } from 'node:process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const P = 'ZZSHOW';

/* ========================================================== safety ======== */

/**
 * Fail closed. This writes a few hundred rows and deletes by prefix; neither
 * belongs anywhere near production, and "I thought DATABASE_URL pointed at my
 * laptop" is exactly how that goes wrong.
 */
function refuse(reason) {
  console.error('\nDEMO SEED REFUSED');
  console.error('='.repeat(60));
  console.error(reason);
  console.error('\nThis command is for a local development database only.');
  exit(1);
}

function assertSafeEnvironment() {
  if (env.NODE_ENV === 'production') {
    refuse('NODE_ENV is "production".');
  }

  const url = env.DATABASE_URL;
  if (!url) refuse('DATABASE_URL is not set.');

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    refuse('DATABASE_URL is not a valid URL.');
  }
  const local = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (!local.includes(host)) {
    refuse(
      `DATABASE_URL points at "${host}", which is not a local address.\n` +
        'Refusing rather than guessing whether it is safe to write to.',
    );
  }

  // The launch switch is the project's own signal that a deployment is real.
  const launch = existsSync('src/config/launch.ts')
    ? readFileSync('src/config/launch.ts', 'utf8')
    : '';
  if (/const\s+SITE_IS_LAUNCHED\s*=\s*true/.test(launch)) {
    refuse('The launch switch is ON (src/config/launch.ts).');
  }

  const site = env.NEXT_PUBLIC_SITE_URL ?? '';
  if (site.startsWith('https://') && !local.some((l) => site.includes(l))) {
    refuse(`NEXT_PUBLIC_SITE_URL is a live origin: ${site}`);
  }
}

/* ========================================================== fixtures ====== */

const PROGRAMMES = ['CLASS_12', 'CLASS_11', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CMA'];
const BOARDS = ['CBSE', 'RBSE', 'ICAI', 'OTHER', null];
const YEARS = [2026, 2025, 2024];
const PHOTO = (n) => `/zzshow-media/zzshow-student-photo-${String(n).padStart(2, '0')}.png`;

const SUBJECTS = ['Accountancy', 'Business Studies', 'Economics', 'Mathematics', 'English'];

/**
 * The five consent scenarios, as the brief asks for them, expressed in the
 * application's OWN fields. There is no parallel consent model here.
 *
 * `publishable` records what the database will actually accept: a published row
 * needs a consent reference and result permission, a name beyond initials needs
 * name permission, and a photograph needs photograph permission. Scenario E has
 * no permissions, so it can only ever exist as a draft - which is itself worth
 * seeing in the admin.
 */
const SCENARIOS = [
  { key: 'A', label: 'result + name + photo', result: true, name: true, photo: true, mode: 'FULL', publish: true },
  { key: 'B', label: 'result + name, NO photo', result: true, name: true, photo: false, mode: 'FULL', publish: true },
  { key: 'C', label: 'result only, initials', result: true, name: false, photo: false, mode: 'INITIALS', publish: true },
  { key: 'D', label: 'photo allowed, initials only', result: true, name: false, photo: true, mode: 'INITIALS', publish: true },
  { key: 'E', label: 'no consent at all - draft', result: false, name: false, photo: false, mode: 'INITIALS', publish: false },
];

const HIGHLIGHTS = [
  'ZZSHOW highlight - a short line shown beside the result.',
  'ZZSHOW highlight used to check how a much longer sentence wraps inside the card on a narrow screen without pushing the score out of view.',
  null,
  'ZZSHOW highlight - top of the synthetic cohort.',
  null,
];

/**
 * 45 results: 5 programmes x 3 years x 3, cycling the consent scenarios.
 *
 * The count is chosen so the PUBLISHED subset lands above RESULTS_PAGE_SIZE
 * (24). Thirty was not enough - it produced exactly 24 published rows, one full
 * page, and no pagination control to look at.
 */
function results() {
  const rows = [];
  let n = 0;
  for (const year of YEARS) {
    for (const programme of PROGRAMMES) {
      for (let dup = 0; dup < 3; dup += 1) {
        n += 1;
        const s = SCENARIOS[(n - 1) % SCENARIOS.length];
        const useMarks = n % 7 === 0;
        rows.push({
          importRef: `${P}-RESULT-${String(n).padStart(3, '0')}`,
          studentName: `${P} Student ${String(n).padStart(3, '0')}`,
          displayNameMode: s.mode,
          photoUrl: s.photo ? PHOTO(((n - 1) % 8) + 1) : null,
          score: useMarks ? 470 + (n % 25) : 78 + ((n * 3) % 22),
          scoreUnit: useMarks ? 'marks' : 'percent',
          programme,
          board: BOARDS[n % BOARDS.length],
          year,
          highlight: HIGHLIGHTS[n % HIGHLIGHTS.length],
          consentRef: s.result ? `${P}-CONSENT-${String(n).padStart(3, '0')}` : null,
          consentResult: s.result,
          consentName: s.name,
          consentPhoto: s.photo,
          published: s.publish,
          sortOrder: n % 5,
          scenario: s.key,
          subjects: n % 3 === 0 ? [] : SUBJECTS.slice(0, 3 + (n % 3)).map((subject, i) => ({
            subject: `${P} ${subject}`,
            score: 72 + ((n + i * 5) % 27),
          })),
        });
      }
    }
  }
  return rows;
}

const STORY_BODY = {
  short: {
    challenge: 'ZZSHOW challenge text, deliberately short, to check how a compact story card sits next to a long one.',
    journey: 'ZZSHOW journey text for local interface testing.',
    outcome: 'ZZSHOW outcome text for local interface testing.',
    quote: 'ZZSHOW short quote.',
  },
  long: {
    challenge:
      'ZZSHOW challenge text used to exercise long-form wrapping. This paragraph is intentionally several sentences long so that the story card, the story page and the mobile layout can all be judged with realistic body copy rather than a single line. It says nothing about any real student, because no real student is described anywhere in this dataset.',
    journey:
      'ZZSHOW journey text, also intentionally long. It exists to check line height, measure width and the spacing between paragraphs at every breakpoint. Reading it should be dull; looking at it should be informative.',
    outcome:
      'ZZSHOW outcome text describing a synthetic result, written at length so the closing block of the story is not visually lighter than the two above it.',
    quote:
      'ZZSHOW quote used to check how a longer pull quote behaves when it runs past a single line on a narrow screen.',
  },
};

/** 15 stories: 13 published (two pages at 12 per page) plus 2 drafts. */
function stories() {
  const rows = [];
  for (let n = 1; n <= 15; n += 1) {
    const draft = n > 13;
    const withPhoto = !draft && n % 3 === 0;
    const withName = !draft && n % 2 === 1;
    const body = n % 2 === 0 ? STORY_BODY.long : STORY_BODY.short;
    rows.push({
      slug: `zzshow-story-${String(n).padStart(2, '0')}`,
      studentName: `${P} Story Student ${String(n).padStart(2, '0')}`,
      displayNameMode: withName ? 'FULL' : 'INITIALS',
      photoUrl: withPhoto ? PHOTO(((n - 1) % 8) + 1) : null,
      programme: PROGRAMMES[n % PROGRAMMES.length],
      year: YEARS[n % YEARS.length],
      ...body,
      consentRef: draft ? null : `${P}-STORY-CONSENT-${String(n).padStart(2, '0')}`,
      consentStory: !draft,
      consentName: withName,
      consentPhoto: withPhoto,
      published: !draft,
    });
  }
  return rows;
}

const day = (n) => new Date(Date.now() + n * 86_400_000);

/** 6 batches: upcoming across courses, one already started, one draft. */
function batches() {
  return [
    { courseSlug: 'class-12-commerce', startsAt: day(21), mode: 'Offline - morning', seatsNote: `${P} Batch 2026-A - a few seats left`, published: true },
    { courseSlug: 'class-11-commerce', startsAt: day(35), mode: 'Offline - evening', seatsNote: `${P} Batch 2026-B`, published: true },
    { courseSlug: 'ca-foundation', startsAt: day(48), mode: 'Hybrid', seatsNote: `${P} Batch 2026-C - long seats note used to check how this line wraps inside a narrow batch card`, published: true },
    { courseSlug: 'ca-intermediate', startsAt: day(62), mode: 'Online', seatsNote: `${P} Batch 2026-D`, published: true },
    { courseSlug: 'cma', startsAt: day(90), mode: 'Offline - weekend', seatsNote: `${P} Batch 2026-E`, published: true },
    { courseSlug: 'class-12-commerce', startsAt: day(-30), mode: 'Offline - morning', seatsNote: `${P} Batch 2025-Z - already started, must NOT show as upcoming`, published: true },
    { courseSlug: 'cma', startsAt: day(75), mode: 'Online', seatsNote: `${P} Batch 2026-F - unpublished draft`, published: false },
  ];
}

/** 7 announcements: active, future, expired, draft, long, short, prioritised. */
function announcements() {
  return [
    { message: `${P} Announcement 01 - admissions for the 2026 session are open. This is synthetic demonstration content.`, href: '/admissions', startsAt: day(-2), endsAt: day(30), priority: 10, published: true },
    { message: `${P} Announcement 02 - short notice.`, href: null, startsAt: day(-5), endsAt: day(20), priority: 5, published: true },
    { message: `${P} Announcement 03 - a deliberately long announcement used to check how the banner and the updates list handle a message that runs well past a single line on a narrow screen, without clipping or overlapping the control beside it.`, href: '/courses', startsAt: day(-1), endsAt: day(45), priority: 3, published: true },
    { message: `${P} Announcement 04 - CA Foundation batch briefing.`, href: null, startsAt: day(-10), endsAt: day(60), priority: 1, published: true },
    { message: `${P} Announcement 05 - synthetic notice with no link.`, href: null, startsAt: day(-3), endsAt: day(14), priority: 0, published: true },
    { message: `${P} Announcement 06 - FUTURE, must not appear yet.`, href: null, startsAt: day(20), endsAt: day(50), priority: 9, published: true },
    { message: `${P} Announcement 07 - EXPIRED, must not appear any more.`, href: null, startsAt: day(-60), endsAt: day(-30), priority: 9, published: true },
    { message: `${P} Announcement 08 - unpublished draft.`, href: null, startsAt: day(-1), endsAt: day(40), priority: 0, published: false },
  ];
}

const CLASS_LEVELS = ['CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CMA', 'OTHER'];
const STATUSES = ['NEW', 'NEW', 'CONTACTED', 'CONTACTED', 'ENROLLED', 'CLOSED', 'SPAM', 'NEW'];

/**
 * 8 enquiries across every status.
 *
 * Phones are digits only: `enquiries_phone_digits` is `^[0-9]{10,15}$`, so a
 * formatted number like "+91 00000 00000" is refused by the database. The
 * ipHash must be 64 hex characters, so it is a real SHA-256 of a synthetic
 * string rather than a made-up literal.
 */
function enquiries() {
  const messages = [
    `${P} enquiry message 01 - short.`,
    `${P} enquiry message 02 - a longer synthetic enquiry used to check how the admin list truncates a message and how the detail page renders the full text. It contains nothing real and refers to nobody.`,
    null,
    `${P} enquiry message 03 - asking about batch timings.`,
    `${P} enquiry message 04.`,
    null,
    `${P} enquiry message 05 - synthetic spam-looking content for the SPAM status.`,
    `${P} enquiry message 06 - asking whether the CMA batch is running.`,
  ];
  return messages.map((message, i) => {
    const n = i + 1;
    return {
      name: `${P} Enquiry ${String(n).padStart(2, '0')}`,
      phone: `91000000${String(n).padStart(4, '0')}`,
      email: n % 3 === 0 ? null : `zzshow-enquiry-${n}@example.invalid`,
      classLevel: CLASS_LEVELS[i % CLASS_LEVELS.length],
      courseSlug: n % 4 === 0 ? null : ['class-12-commerce', 'ca-foundation', 'cma'][i % 3],
      message,
      sourcePage: n % 2 === 0 ? '/admissions' : '/contact',
      status: STATUSES[i],
      notes: n % 5 === 0 ? `${P} internal note - synthetic.` : null,
      consentAt: day(-n),
      ipHash: createHash('sha256').update(`${P}-synthetic-ip-${n}`).digest('hex'),
      createdAt: day(-n),
    };
  });
}

/* ============================================================ actions ===== */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/**
 * Remove only what this script creates.
 *
 * Every filter is anchored on the ZZSHOW prefix or a zzshow slug. There is no
 * unqualified deleteMany anywhere in this file, and there must never be one:
 * the command has to be safe to run against a database that also holds work
 * somebody cares about.
 */
/**
 * Videos.
 *
 * =============================================================================
 * THE IDS ARE SYNTHETIC AND CANNOT BE A REAL VIDEO
 * =============================================================================
 * Every id here begins `ZZSHOW` and is padded to the eleven characters the
 * format requires. They are structurally valid - they have to be, or the CHECK
 * constraint and the parser would reject them and the demo would not exercise
 * the real path - but no real YouTube video has an id starting with those six
 * characters in this arrangement, so nothing here points at somebody's content.
 *
 * The consequence is visible and intentional: the thumbnails 404 at
 * `i.ytimg.com` and the tiles show the placeholder background. That is the
 * correct demo behaviour. A demo that embedded real videos would be putting
 * somebody else's content on a page describing an institute that has not
 * approved it - and a stray demo row reaching production would then be
 * publishing a stranger's video under the institute's name.
 *
 * =============================================================================
 * THE TITLE CARRIES THE CLEANUP PREFIX
 * =============================================================================
 * `title` is the prefixed, human-readable column, so it is what
 * `seed:demo:clean` deletes by - and it is visible in the DOM, so a stray demo
 * row announces itself on the page rather than hiding in a database.
 *
 * There are five rows across three subjects, which is deliberate: ECONOMICS has
 * three so it earns a subject filter (Master Plan: "filtered by subject only
 * once each filter has three or more videos"), and the other two do not, so the
 * "fewer than three does not get a filter" rule is visible by eye.
 */
/**
 * Videos.
 *
 * =============================================================================
 * ⚠ EVERY ROW HERE IS A DRAFT, AND THAT IS NOT AN OVERSIGHT
 * =============================================================================
 * A `youtubeId` is the ONLY thing this table stores about a video: the poster
 * image is derived from it (`thumbnailUrl` -> i.ytimg.com) and so is the embed.
 * There is deliberately no thumbnail column - the schema note explains why.
 *
 * That means a SYNTHETIC id cannot produce a working card. `ZZSHOW00001` is a
 * well-formed YouTube id - eleven characters of [A-Za-z0-9_-], so it satisfies
 * `isYouTubeId` and the CHECK constraint - but no such video exists, so
 * `https://i.ytimg.com/vi/ZZSHOW00001/mqdefault.jpg` returns 404 and Next's
 * image optimiser returns 404 in turn. Measured, 5 Sep 2026: four published
 * demo videos put four broken images on /videos and one on the homepage.
 *
 * THE THREE WAYS OUT, AND WHY THIS ONE.
 *
 *   1. Use a real YouTube id. Refused. It would embed somebody else's video
 *      inside a band captioned as teaching from this institute - a fabricated
 *      claim of exactly the kind the rebuild exists to remove, and worse for
 *      being borrowed from a real channel.
 *   2. Make the components fall back to a placeholder when a poster 404s.
 *      That is a change to the PUBLIC site to accommodate demo data, and it
 *      would also mask a genuine production failure - a video deleted from
 *      YouTube would then look fine on the website.
 *   3. Seed the rows unpublished. Chosen.
 *
 * So the admin gets a populated Videos section - list, edit, ordering, the
 * publish toggle, the subject filter, a draft to publish and unpublish - while
 * the public /videos page shows its honest empty state and never renders a
 * broken poster. The rows are real CMS records; only their publication is held
 * back, by the same `published` flag a teacher uses.
 *
 * TO SEE THE VIDEO BAND: put one real YouTube id on one of these rows in the
 * admin and tick "show on the website". That is a one-field change and it is
 * the institute's own content decision to make, not this seeder's.
 */
function videos() {
  const id = (n) => `ZZSHOW${String(n).padStart(5, '0')}`;

  return [
    {
      youtubeId: id(1),
      title: `${P} Economics: demand curves, built from scratch`,
      description: `${P} synthetic description. A worked example, start to finish.`,
      subject: 'ECONOMICS',
      priority: 100,
      published: false,
    },
    {
      youtubeId: id(2),
      title: `${P} Economics: elasticity without the jargon`,
      description: `${P} deliberately long synthetic description, written to run past a single line on a narrow screen so the card layout can be judged with realistic body copy rather than with three short words that would fit anywhere.`,
      subject: 'ECONOMICS',
      priority: 0,
      published: false,
    },
    {
      youtubeId: id(3),
      title: `${P} Economics: a past-paper question, answered live`,
      description: null,
      subject: 'ECONOMICS',
      priority: 0,
      published: false,
    },
    {
      youtubeId: id(4),
      title: `${P} Business Studies: reading a case study under time pressure`,
      description: `${P} synthetic description.`,
      subject: 'BUSINESS_STUDIES',
      priority: 0,
      published: false,
    },
    {
      // Was the demo's negative control back when the others were published.
      // They are all drafts now; this one is kept distinct by its subject.
      youtubeId: id(5),
      title: `${P} Exam preparation: still a draft, must not be public`,
      description: `${P} synthetic description for an unpublished row.`,
      subject: 'EXAM_PREPARATION',
      priority: 0,
      published: false,
    },
  ];
}

/**
 * Gallery photographs.
 *
 * =============================================================================
 * THE ALT TEXT CARRIES THE ZZSHOW PREFIX, AND THAT IS THE CLEANUP KEY
 * =============================================================================
 * Every other table here is deleted by a prefix on a human-readable column.
 * Gallery has no name column, so `alt` does the job - it is required, non-blank
 * by CHECK constraint, and visible in the DOM, so a stray demo row announces
 * itself on the page rather than hiding in a database.
 *
 * =============================================================================
 * THE SET EXISTS TO EXERCISE THE CONSENT MODEL, NOT TO LOOK FULL
 * =============================================================================
 * These twelve rows deliberately cover every state the visibility rule has:
 *
 *   - no people in it, published            -> PUBLIC without any consent
 *   - people, full consent, published       -> PUBLIC
 *   - people, consent reference but the photograph box NOT ticked -> HIDDEN
 *   - people, photograph ticked but NO reference                  -> HIDDEN
 *   - people, full consent, NOT published   -> HIDDEN (draft)
 *
 * The two hidden-despite-consent rows are the ones worth having: they are what
 * a reviewer looks at to confirm the gallery is filtering rather than merely
 * rendering whatever it is given.
 *
 * ⚠ THE THREE ROWS THAT ARE HIDDEN FOR A CONSENT REASON CANNOT BE PUBLISHED.
 * The database refuses them, so they are created with `published: false` — the
 * demo cannot accidentally create the state the constraint exists to prevent.
 */
function galleryItems() {
  const img = (n) => `/zzshow-media/zzshow-gallery-${String(n).padStart(2, '0')}.png`;
  const REF = `${P}-CONSENT-2026`;

  return [
    // --- no people: publishable with no consent at all ----------------------
    { image: 1, category: 'CLASSROOMS', alt: `${P} synthetic tile standing in for an empty classroom with desks in rows.`, caption: `${P} A classroom before the morning batch.`, showsPeople: false, consentRef: null, consentPhoto: false, published: true, priority: 100 },
    { image: 2, category: 'CLASSROOMS', alt: `${P} synthetic tile standing in for a whiteboard at the front of a classroom.`, caption: null, showsPeople: false, consentRef: null, consentPhoto: false, published: true, priority: 0 },
    { image: 3, category: 'CLASSROOMS', alt: `${P} synthetic tile standing in for the library corner and its shelves.`, caption: `${P} The reading corner.`, showsPeople: false, consentRef: null, consentPhoto: false, published: true, priority: 0 },

    // --- people, full consent: publishable ----------------------------------
    { image: 4, category: 'EVENTS', alt: `${P} synthetic tile standing in for a seminar audience seen from the back.`, caption: `${P} A synthetic caption long enough to run onto a second line on a narrow screen, so the tile caption can be judged with realistic copy.`, showsPeople: true, consentRef: REF, consentPhoto: true, published: true, priority: 90 },
    { image: 5, category: 'EVENTS', alt: `${P} synthetic tile standing in for a prize-giving on a stage.`, caption: `${P} Prize day.`, showsPeople: true, consentRef: REF, consentPhoto: true, published: true, priority: 0 },
    { image: 6, category: 'ACHIEVEMENTS', alt: `${P} synthetic tile standing in for a group holding certificates.`, caption: null, showsPeople: true, consentRef: REF, consentPhoto: true, published: true, priority: 0 },
    { image: 7, category: 'SEMINARS', alt: `${P} synthetic tile standing in for a guest speaker at a lectern.`, caption: `${P} A visiting speaker.`, showsPeople: true, consentRef: REF, consentPhoto: true, published: true, priority: 0 },
    { image: 8, category: 'CELEBRATIONS', alt: `${P} synthetic tile standing in for a festival decoration in the corridor.`, caption: null, showsPeople: true, consentRef: REF, consentPhoto: true, published: true, priority: 0 },

    // --- people, consent incomplete: MUST stay hidden ------------------------
    { image: 9, category: 'STUDENTS', alt: `${P} synthetic tile: photograph permission NOT ticked. Must never be public.`, caption: null, showsPeople: true, consentRef: REF, consentPhoto: false, published: false, priority: 0 },
    { image: 10, category: 'STUDENTS', alt: `${P} synthetic tile: photograph permission ticked, no reference on file, still a draft. Not public until published.`, caption: null, showsPeople: true, consentRef: null, consentPhoto: true, published: false, priority: 0 },
    { image: 11, category: 'STUDENTS', alt: `${P} synthetic tile: no permission recorded at all. Must never be public.`, caption: null, showsPeople: true, consentRef: null, consentPhoto: false, published: false, priority: 0 },

    // --- people, full consent, still a draft ---------------------------------
    { image: 12, category: 'STUDENTS', alt: `${P} synthetic tile: fully consented but still a draft. Must not be public until it is published.`, caption: `${P} Not published yet.`, showsPeople: true, consentRef: REF, consentPhoto: true, published: false, priority: 0 },
  ].map((row) => ({
    imageUrl: img(row.image),
    alt: row.alt,
    caption: row.caption,
    category: row.category,
    priority: row.priority,
    published: row.published,
    showsPeople: row.showsPeople,
    consentRef: row.consentRef,
    consentPhoto: row.consentPhoto,
  }));
}

/**
 * Teaching staff.
 *
 * Every name is unmistakably synthetic. This project's whole premise is that
 * the site it replaces published invented people, so demo faculty must be
 * impossible to mistake for real staff even at a glance - which is why they are
 * "ZZSHOW Faculty One", not plausible Indian names.
 *
 * The photographs reuse the existing ZZSHOW placeholder tiles rather than
 * anything resembling a face. A stock portrait in demo data is exactly the
 * thing that ends up shipped by accident.
 *
 * The set deliberately covers the states the page has to handle: with and
 * without a photo, with and without a subject, with a long description and a
 * short one, published and draft, and a non-zero priority so ordering is
 * visible rather than assumed.
 */
function faculty() {
  return [
    {
      name: `${P} Faculty One`,
      designation: 'Director',
      subject: 'Accountancy',
      bio: `${P} synthetic description. Teaches Accountancy for Class XI, Class XII and CA Foundation.`,
      photoUrl: '/zzshow-media/zzshow-student-photo-01.png',
      priority: 100,
      published: true,
    },
    {
      name: `${P} Faculty Two`,
      designation: 'Senior Faculty',
      subject: 'Economics',
      bio: `${P} deliberately long synthetic description, written to run past a single line on a narrow screen so that the card layout can be judged with realistic body copy rather than with two short words that would fit anywhere.`,
      photoUrl: '/zzshow-media/zzshow-student-photo-02.png',
      priority: 50,
      published: true,
    },
    {
      // No photograph: the monogram path, which is the common case while an
      // institute is still collecting portraits.
      name: `${P} Faculty Three`,
      designation: 'Faculty',
      subject: 'Business Studies',
      bio: `${P} short synthetic description.`,
      photoUrl: null,
      priority: 0,
      published: true,
    },
    {
      // No subject and no description: the sparsest card the page can render.
      name: `${P} Faculty Four`,
      designation: 'Visiting Faculty',
      subject: null,
      bio: null,
      photoUrl: null,
      priority: 0,
      published: true,
    },
    {
      // Draft. Must never appear publicly, which is what makes it useful.
      name: `${P} Faculty Five Draft`,
      designation: 'Not Yet Shown',
      subject: 'Mathematics',
      bio: `${P} draft record. This one must not appear on the public website.`,
      photoUrl: null,
      priority: 0,
      published: false,
    },
  ];
}

/* ------------------------------------------------------- website copy ---- */

/**
 * The stamp every demo-seeded settings row carries.
 *
 * ⚠ CLEANUP DELETES BY THIS, NOT BY KEY.
 *
 * `site_settings` is the one table the demo shares with real content: in
 * production the institute types its own words into these very keys. Deleting
 * by key would therefore delete the institute's work if this ever ran against a
 * populated database. Deleting by `updatedBy` removes only rows this seeder
 * wrote and leaves anything a person typed alone.
 *
 * It is also visible: the website editor shows "Last changed ... by ZZSHOW demo
 * seed" against each one, so a reviewer can see at a glance which copy is
 * demonstration and which is theirs.
 */
const SETTINGS_AUTHOR = `${P} demo seed`;

/**
 * Website copy the demo supplies, and why only these fields.
 *
 * Almost every editable field already renders good, reviewed brand copy from
 * its registry fallback, so seeding it would only overwrite the real design
 * with the same thing. Three groups are different — they render NOTHING until
 * somebody fills them in, which means an owner reviewing the site has no way to
 * see that they exist at all:
 *
 *   the trust bar     ships empty by design (Phase 20) — no invented figures
 *   the why-us band   ships empty by design (Phase 20) — no invented claims
 *   the map point     hidden until a coordinate is supplied (Topic 10)
 *
 * The values below are demonstration, not facts. Every label carries the ZZSHOW
 * marker so nothing here can be mistaken for something the institute confirmed,
 * and the coordinate is the same synthetic Pratap Nagar point the map suite
 * uses — plausible, and nobody's doorway.
 */
function siteContent() {
  return [
    ['home.trust.1.value', '500+'],
    ['home.trust.1.label', `${P} students taught`],
    ['home.trust.2.value', '12'],
    ['home.trust.2.label', `${P} years teaching`],
    ['home.trust.3.value', '30+'],
    ['home.trust.3.label', `${P} board toppers`],
    ['home.trust.4.value', '4.8'],
    ['home.trust.4.label', `${P} average rating`],

    ['home.why.heading', `${P} Why this institute`],
    ['home.why.1.title', `${P} Concept first`],
    [
      'home.why.1.body',
      `${P} demonstration text. Students are taught to understand the reasoning rather than memorise a method.`,
    ],
    ['home.why.2.title', `${P} Commerce only`],
    [
      'home.why.2.body',
      `${P} demonstration text. Every programme shares the same foundation, so a student can stay from Class XI through CA Intermediate.`,
    ],
    ['home.why.3.title', `${P} Small batches`],
    [
      'home.why.3.body',
      `${P} demonstration text. A short paragraph, long enough to show how the card wraps on a narrow phone.`,
    ],

    /*
      The map panel is hidden entirely without a coordinate, so an owner
      reviewing the contact page would never see the feature.

      ⚠ DELIBERATELY NOT THE POINT verify-map AND verify-admin USE.

      It used to be exactly '26.849123,75.805456', described here as "the same
      synthetic point verify-map uses". That sharing had a cost nobody had
      noticed: `markerFor()` in scripts/verify-admin.mjs writes the identical
      string as its own marker for this key, and that suite opens by DELETING
      every row whose value matches one of its markers - on the correct theory
      that such a row is wreckage from a crashed earlier run.

      So every verify:admin run silently deleted the demo's map point, and the
      contact page lost its map until the next reseed. Measured 5 Sep 2026: 15
      of the 16 demo copy rows survived a run and this was the one that did not.

      A different point costs nothing and removes the ambiguity. It is still
      obviously synthetic and still inside Jaipur, so the panel it draws looks
      like the real feature.
    */
    ['contact.coordinates', '26.851777,75.812345'],
  ];
}

/**
 * WHICH settings rows belong to this dataset.
 *
 * =============================================================================
 * ⚠ `updatedBy` ALONE IS NOT ENOUGH, AND THAT IS NOT A BUG IN ANYTHING
 * =============================================================================
 * The seeder stamps `updatedBy = 'ZZSHOW demo seed'` and cleanup used to delete
 * on that alone. The marker does not survive, and the thing that removes it is
 * behaving correctly: `saveWebsiteContent` records WHO saved a row, so any save
 * through the real admin - a teacher's, or a verification suite's restore pass -
 * legitimately replaces the marker with that person's name.
 *
 * Measured 5 Sep 2026: after a verify:cms run, fifteen of the sixteen demo copy
 * rows still held exactly the demo's text and were stamped "ZZ Verify". Cleanup
 * ignored all fifteen, `seed:demo -- count` reported "Website copy fields 1",
 * and the documented reset would have left the demo homepage copy in place.
 *
 * So a row is ours if it is STILL MARKED ours, or if it is one of our keys and
 * still holds exactly the text we wrote. The second half is what makes cleanup
 * survive a re-stamp - and comparing the value is also what protects a teacher:
 * a key they have since typed their own words into no longer matches, so it is
 * left alone rather than deleted by a demo reset.
 */
async function demoSettingKeys() {
  const seeded = new Map(siteContent());
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [...seeded.keys()] } },
    select: { key: true, value: true, updatedBy: true },
  });
  return rows
    .filter((row) => row.updatedBy === SETTINGS_AUTHOR || row.value === seeded.get(row.key))
    .map((row) => row.key);
}

async function clean({ quiet = false } = {}) {
  const removed = {
    subjectScores: (
      await prisma.subjectScore.deleteMany({
        where: { topper: { studentName: { startsWith: P } } },
      })
    ).count,
    results: (await prisma.topper.deleteMany({ where: { studentName: { startsWith: P } } })).count,
    stories: (
      await prisma.studentStory.deleteMany({ where: { studentName: { startsWith: P } } })
    ).count,
    batches: (await prisma.batch.deleteMany({ where: { seatsNote: { startsWith: P } } })).count,
    announcements: (
      await prisma.announcement.deleteMany({ where: { message: { startsWith: P } } })
    ).count,
    enquiries: (await prisma.enquiry.deleteMany({ where: { name: { startsWith: P } } })).count,
    faculty: (await prisma.faculty.deleteMany({ where: { name: { startsWith: P } } })).count,
    gallery: (await prisma.galleryItem.deleteMany({ where: { alt: { startsWith: P } } })).count,
    videos: (await prisma.video.deleteMany({ where: { title: { startsWith: P } } })).count,
    websiteCopy: (
      await prisma.siteSetting.deleteMany({ where: { key: { in: await demoSettingKeys() } } })
    ).count,
  };
  if (!quiet) {
    console.log('\nRemoved ZZSHOW demo rows:');
    for (const [k, v] of Object.entries(removed)) console.log(`  ${k.padEnd(16)} ${v}`);
  }
  return removed;
}

async function seed() {
  // Reconcile rather than accumulate. Running twice must leave the same rows,
  // not twice as many - so the previous dataset goes first, scoped to ZZSHOW.
  await clean({ quiet: true });

  const now = new Date();
  const resultRows = results();
  for (const row of resultRows) {
    const { subjects, scenario, ...data } = row;
    void scenario;
    await prisma.topper.create({
      data: {
        ...data,
        publishedAt: data.published ? now : null,
        ...(subjects.length > 0 ? { subjectScores: { create: subjects } } : {}),
      },
    });
  }

  for (const row of stories()) {
    await prisma.studentStory.create({
      data: { ...row, publishedAt: row.published ? now : null },
    });
  }

  for (const row of batches()) await prisma.batch.create({ data: row });
  for (const row of announcements()) await prisma.announcement.create({ data: row });
  for (const row of enquiries()) await prisma.enquiry.create({ data: row });
  for (const row of faculty()) await prisma.faculty.create({ data: row });
  for (const row of galleryItems()) await prisma.galleryItem.create({ data: row });
  for (const row of videos()) await prisma.video.create({ data: row });

  /*
    Upsert rather than create: these keys may already hold something a person
    typed, and the demo overwrites it for the duration of the demonstration.
    `clean` puts it back to "no row", which resolves to the shipped fallback.
  */
  for (const [key, value] of siteContent()) {
    await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value, updatedBy: SETTINGS_AUTHOR },
      update: { value, updatedBy: SETTINGS_AUTHOR },
    });
  }

  return resultRows;
}

async function count() {
  const [results_, subjects, stories_, batches_, announcements_, enquiries_, faculty_, gallery_, videos_] =
    await Promise.all([
    prisma.topper.count({ where: { studentName: { startsWith: P } } }),
    prisma.subjectScore.count({ where: { topper: { studentName: { startsWith: P } } } }),
    prisma.studentStory.count({ where: { studentName: { startsWith: P } } }),
    prisma.batch.count({ where: { seatsNote: { startsWith: P } } }),
    prisma.announcement.count({ where: { message: { startsWith: P } } }),
    prisma.enquiry.count({ where: { name: { startsWith: P } } }),
    prisma.faculty.count({ where: { name: { startsWith: P } } }),
    prisma.galleryItem.count({ where: { alt: { startsWith: P } } }),
    prisma.video.count({ where: { title: { startsWith: P } } }),
  ]);

  const publishedFaculty = await prisma.faculty.count({
    where: { name: { startsWith: P }, published: true },
  });

  /*
    Counted with the SAME predicate the public page uses, not with
    `published: true`. A row can be marked published and still be correctly
    absent from the site, and a demo report that counted the flag would say
    twelve photographs are live when eight are.
  */
  const publishedVideos = await prisma.video.count({
    where: { title: { startsWith: P }, published: true },
  });

  const publicGallery = await prisma.galleryItem.count({
    where: {
      alt: { startsWith: P },
      published: true,
      OR: [
        { showsPeople: false },
        { AND: [{ consentPhoto: true }, { consentRef: { not: null } }] },
      ],
    },
  });

  const publishedResults = await prisma.topper.count({
    where: { studentName: { startsWith: P }, published: true },
  });
  const publishedStories = await prisma.studentStory.count({
    where: { studentName: { startsWith: P }, published: true },
  });
  const websiteCopy = (await demoSettingKeys()).length;
  const withPhoto = await prisma.topper.count({
    where: { studentName: { startsWith: P }, photoUrl: { not: null } },
  });

  console.log('\nZZSHOW DEMO DATA');
  console.log('='.repeat(40));
  console.log(`  Results (toppers)   ${String(results_).padStart(4)}   (${publishedResults} published)`);
  console.log(`  Subject marks       ${String(subjects).padStart(4)}`);
  console.log(`  Student stories     ${String(stories_).padStart(4)}   (${publishedStories} published)`);
  console.log(`  Batches             ${String(batches_).padStart(4)}`);
  console.log(`  Announcements       ${String(announcements_).padStart(4)}`);
  console.log(`  Enquiries           ${String(enquiries_).padStart(4)}`);
  console.log(`  Faculty             ${String(faculty_).padStart(4)}   (${publishedFaculty} published)`);
  console.log(`  Gallery             ${String(gallery_).padStart(4)}   (${publicGallery} on the website)`);
  console.log(`  Videos              ${String(videos_).padStart(4)}   (${publishedVideos} on the website)`);
  console.log(`  Results with a photo${String(withPhoto).padStart(4)}`);
  console.log(`  Website copy fields ${String(websiteCopy).padStart(4)}   (trust bar, why-us band, map point)`);

  // Anything NOT ours, so the operator can see this touched nothing else.
  const foreign = {
    results: (await prisma.topper.count()) - results_,
    stories: (await prisma.studentStory.count()) - stories_,
    batches: (await prisma.batch.count()) - batches_,
    announcements: (await prisma.announcement.count()) - announcements_,
    enquiries: (await prisma.enquiry.count()) - enquiries_,
    faculty: (await prisma.faculty.count()) - faculty_,
    gallery: (await prisma.galleryItem.count()) - gallery_,
    videos: (await prisma.video.count()) - videos_,
  };
  const foreignTotal = Object.values(foreign).reduce((a, b) => a + b, 0);
  console.log(`\n  Non-ZZSHOW content rows: ${foreignTotal}` + (foreignTotal ? `  ${JSON.stringify(foreign)}` : ' (nothing else in the database)'));
  return { results: results_, foreignTotal };
}

/* =============================================================== main ===== */

const command = argv[2] ?? 'seed';

try {
  if (command === 'seed') {
    assertSafeEnvironment();
    const rows = await seed();

    const byScenario = {};
    for (const r of rows) byScenario[r.scenario] = (byScenario[r.scenario] ?? 0) + 1;

    await count();
    console.log('\n  Consent scenarios represented:');
    for (const s of SCENARIOS) {
      console.log(`    ${s.key}  ${String(byScenario[s.key] ?? 0).padStart(2)} records  -  ${s.label}`);
    }
    console.log('\n  Run `npm run seed:demo:clean` to remove all of it.');
    console.log('');
    /*
      ⚠ THE CACHED PAGES DO NOT KNOW THIS HAPPENED.

      Everything above went straight to Postgres through Prisma, which fires no
      revalidation - so the cached public routes keep serving whatever they
      rendered last. The homepage, /faculty and /announcements are the ISR ones
      and will show the PREVIOUS dataset for up to fifteen minutes; the admin,
      /results, /stories, /gallery and /videos are dynamic and update at once.

      That is the same hazard scripts/verify-admin.mjs records for its own
      direct writes, and it reads exactly like a broken seeder: you run this,
      open the homepage, and see the data you just deleted. Measured 5 Sep 2026
      after a clean - the database held zero faculty and /faculty still showed
      a teacher. Restarting the server is the quickest way to make every route
      agree with the database.
    */
    console.log('  NOTE: the homepage, /faculty and /announcements are cached for up');
    console.log('        to 15 minutes and will keep showing the PREVIOUS content.');
    console.log('        Restart the server to see this dataset on every route');
    console.log('        immediately. The admin is never cached.');
    console.log('');
    console.log('  NOTE: this dataset no longer conflicts with verify:integration.');
    console.log('        Three of its assertions used to require an empty content');
    console.log('        database. Phase 16 Topic 5 corrected them: they now ask');
    console.log('        the database which state applies and test the populated');
    console.log('        branch as well as the empty one, so both suites can run');
    console.log('        against the same machine.');
  } else if (command === 'clean') {
    assertSafeEnvironment();
    await clean();
    await count();
  } else if (command === 'count') {
    await count();
  } else {
    console.error('Usage: node scripts/seed-demo.mjs seed|clean|count');
    exit(1);
  }
} finally {
  await prisma.$disconnect();
}
