/**
 * THE DEPLOYMENT CONTRACT — PURE, no imports.
 *
 * =============================================================================
 * WHY THIS IS CODE AND NOT A DOCUMENT
 * =============================================================================
 * Phase 12 found `docs/PRODUCTION-SETUP.md` telling a future operator to expect
 * "28 CHECK constraints" months after the real number became 21. Nothing was
 * wrong with the prose when it was written. Prose simply cannot notice that the
 * thing it describes has changed.
 *
 * So the contract lives here, as data, and three different things read it:
 *
 *   - `scripts/verify-preflight.mjs` checks a real environment against it
 *   - `tests/deployment.test.ts` checks it against the migration SQL, the
 *     source tree and `.env.example`, so the contract cannot drift from the
 *     repository either
 *   - the documentation quotes it rather than restating it
 *
 * A check that reads from here fails when reality moves. A paragraph does not.
 *
 * =============================================================================
 * NOTHING IN THIS FILE IS A SECRET
 * =============================================================================
 * It records the NAMES and SHAPES of what deployment needs — never a value.
 * `describeDatabaseUrl` exists specifically so a verifier can say something
 * useful about a connection string without ever printing one.
 */

/* ========================================================== runtime ======= */

/**
 * The runtime the application requires.
 *
 * `nodeMinimum` is deliberately the same string as `engines.node` in
 * package.json, and a test asserts they still match. Two places, one truth,
 * checked mechanically.
 */
export const RUNTIME = {
  /** Matches `engines.node`. Node 20.9 is the floor Next 16 supports. */
  nodeMinimum: '>=20.9.0',
  /** What CI runs and what deployment should pin. Node 22 or 24 both work. */
  nodeRecommended: '22.x or 24.x',
  /** Exact, because the framework is pinned rather than ranged. */
  next: '16.3.2',
  react: '19.2.8',
  /** Prisma major. The driver adapter is required from 7 onward. */
  prismaMajor: 7,
  /**
   * PostgreSQL. 14 is the floor for the SQL this schema uses; local
   * verification runs 18.4, and Neon currently serves 17.
   */
  postgresMinimumMajor: 14,
  postgresVerifiedMajor: 18,
} as const;

/* ====================================================== environment ======= */

export type EnvRequirement =
  /** Must be present everywhere, including local development. */
  | 'always'
  /** Must be present in production. Optional locally. */
  | 'production'
  /** Never required. A feature is switched off without it. */
  | 'optional';

export type EnvSpec = {
  name: string;
  requirement: EnvRequirement;
  /** A value that must never be printed, logged, or sent to the browser. */
  secret: boolean;
  /** Next inlines NEXT_PUBLIC_* into client JavaScript. True only for those. */
  clientExposed: boolean;
  /** Minimum length, where a short value is a security problem rather than a typo. */
  minLength?: number;
  /** One line, for the operator. */
  purpose: string;
  /** What to do when it is missing or wrong. */
  remediation: string;
};

/**
 * Every environment variable this application reads.
 *
 * The preflight walks `src/`, strips comments, and fails if it finds an
 * environment read whose name is not listed here - so this cannot silently
 * fall behind the code. `NODE_ENV` is excluded: the framework sets it, not the
 * operator. Comments are stripped because a paragraph mentioning a variable is
 * documentation, not a read; the first version of this check flagged its own
 * doc comment.
 */
export const ENV_CONTRACT: readonly EnvSpec[] = [
  {
    name: 'DATABASE_URL',
    requirement: 'always',
    secret: true,
    clientExposed: false,
    purpose: 'PostgreSQL connection string. Everything depends on it.',
    remediation:
      'Set it to the pooled connection string from your PostgreSQL provider. Use the POOLED string, not the direct one - the driver adapter opens a connection per invocation.',
  },
  {
    name: 'ENQUIRY_SECRET',
    requirement: 'production',
    secret: true,
    clientExposed: false,
    minLength: 32,
    purpose: 'Keys the enquiry IP hash and signs the anti-spam form token.',
    remediation:
      'Generate a fresh one: openssl rand -base64 32. Never reuse ADMIN_SESSION_SECRET for this.',
  },
  {
    name: 'ADMIN_SESSION_SECRET',
    requirement: 'production',
    secret: true,
    clientExposed: false,
    minLength: 32,
    purpose: 'Signs the admin session cookie. A predictable value makes it forgeable.',
    remediation:
      'Generate a fresh one: openssl rand -base64 32. Never reuse ENQUIRY_SECRET for this.',
  },
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    requirement: 'production',
    secret: false,
    clientExposed: true,
    purpose:
      'The public origin. Used for canonical URLs, the sitemap, and as one of the two launch-switch conditions.',
    remediation:
      'Set it to the live https:// origin with no trailing slash. It is one of the two conditions for indexing, so a wrong value keeps the site out of Google.',
  },
  {
    name: 'RESEND_API_KEY',
    requirement: 'optional',
    secret: true,
    clientExposed: false,
    purpose: 'Enquiry notification email. The seam is unwired; enquiries persist without it.',
    remediation:
      'Leave unset until a sending domain with SPF and DKIM exists. A missing notifier cannot lose an enquiry.',
  },
  {
    name: 'ENQUIRY_NOTIFICATION_TO',
    requirement: 'optional',
    secret: false,
    clientExposed: false,
    purpose: 'Where enquiry notifications would go, once notifications are wired.',
    remediation: 'Set it only alongside RESEND_API_KEY.',
  },
] as const;

/** Names only, for cross-checking against the source tree and `.env.example`. */
export const ENV_NAMES: readonly string[] = ENV_CONTRACT.map((e) => e.name);

/**
 * Placeholder values, in the spellings people actually leave behind.
 *
 * Matched case-insensitively against the whole value and against each of its
 * parts, because a connection string that is real except for
 * `:CHANGE_ME@` is the dangerous case - it looks configured.
 */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /change[_-]?me/i,
  /your[_-]?(secret|password|key|token|domain|database|url|email)/i,
  /\bexample\b/i,
  /\bplaceholder\b/i,
  /\bfixme\b/i,
  /\btodo\b/i,
  /\bxxx+\b/i,
  /^(test|dummy|sample|foo|bar|secret|password|admin)$/i,
  /<[A-Za-z_]+>/,
  /\bUSER:PASSWORD\b/,
];

/** Does this value look like something nobody replaced? */
export function looksLikePlaceholder(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

/** Is this a local address, where a production deployment expects a real host? */
export function looksLikeLocalhost(value: string): boolean {
  if (typeof value !== 'string') return false;
  return /(^|[/@:])(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)([:/]|$)/i.test(
    value,
  );
}

/* ------------------------------------------------- safe URL reporting ----- */

export type SafeUrlDescription = {
  ok: boolean;
  /** `postgresql:` etc. Never the credentials. */
  protocol: string;
  /** Host only. No user, no password, no port-embedded credentials. */
  host: string;
  /** Database name only. */
  database: string;
  /** True when the string carries a username or password at all. */
  hasCredentials: boolean;
  /** True when sslmode is requested. Worth knowing; not a secret. */
  requiresSsl: boolean;
  problem?: string;
};

/**
 * Describe a database URL WITHOUT EVER RETURNING A CREDENTIAL.
 *
 * The verifier prints what this returns and nothing else. Username, password
 * and the full query string are read to answer yes/no questions and then
 * discarded - they are never placed in the returned object, so there is no
 * path by which a caller can print them even carelessly.
 */
export function describeDatabaseUrl(raw: string): SafeUrlDescription {
  const empty: SafeUrlDescription = {
    ok: false,
    protocol: '',
    host: '',
    database: '',
    hasCredentials: false,
    requiresSsl: false,
  };

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ...empty, problem: 'empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ...empty, problem: 'not a valid URL' };
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    return {
      ...empty,
      protocol: parsed.protocol,
      problem: `expected postgresql://, found ${parsed.protocol}//`,
    };
  }

  const database = parsed.pathname.replace(/^\//, '');
  const sslmode = parsed.searchParams.get('sslmode') ?? '';

  return {
    ok: database.length > 0,
    protocol: parsed.protocol,
    host: parsed.hostname,
    database,
    hasCredentials: parsed.username.length > 0 || parsed.password.length > 0,
    requiresSsl: sslmode !== '' && sslmode !== 'disable',
    problem: database.length === 0 ? 'no database name in the path' : undefined,
  };
}

/**
 * Redact anything that looks like a credential out of a string before printing.
 *
 * The verifier never intentionally prints a secret, but it does print error
 * messages from Prisma and from Node, and those sometimes embed the connection
 * string. This is the last gate before stdout.
 */
export function redact(text: string): string {
  if (typeof text !== 'string') return '';
  return (
    text
      // user:password@host in any URL
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(@)/gi, '$1<redacted>$2')
      // key=value for anything credential-shaped
      .replace(
        /\b(password|passwd|pwd|secret|token|api[_-]?key|authorization)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi,
        '$1$2<redacted>',
      )
      // a bare connection string
      .replace(/\bpostgres(ql)?:\/\/\S+/gi, 'postgresql://<redacted>')
  );
}

/* ========================================================== schema ======== */

/**
 * The database shape deployment requires.
 *
 * THE CHECK CONSTRAINTS ARE THE POINT. Prisma cannot express them, does not
 * know they exist, and silently drops every one of them when a migration is
 * regenerated - that is Phase 12's P12-A, and it produced a database that
 * passed `prisma validate` with the entire consent model unenforced.
 *
 * So they are listed BY NAME. A count would have passed a database with 21
 * constraints where seven of them were the wrong seven.
 */
export const EXPECTED_TABLES: readonly string[] = [
  'admin_users',
  'announcements',
  'audit_log',
  'batches',
  'enquiries',
  'import_runs',
  'student_stories',
  'subject_scores',
  'toppers',
] as const;

export const EXPECTED_ENUMS: readonly string[] = [
  'Board',
  'ClassLevel',
  'DisplayNameMode',
  'EnquiryStatus',
  'Programme',
] as const;

/**
 * CHECK constraints, grouped by what they protect.
 *
 * `consentCritical` is the set whose absence means a record could be published
 * without the permission that justifies publishing it. Those are a hard
 * deployment blocker; the others are integrity rules and are still required,
 * but they protect data quality rather than a child's privacy.
 */
export const CONSENT_CRITICAL_CONSTRAINTS: readonly string[] = [
  'toppers_published_requires_consent',
  'toppers_name_requires_name_consent',
  'toppers_photo_requires_photo_consent',
  'toppers_published_at_set',
  'student_stories_published_requires_consent',
  'student_stories_name_requires_name_consent',
  'student_stories_photo_requires_photo_consent',
  'student_stories_published_at_set',
] as const;

export const INTEGRITY_CONSTRAINTS: readonly string[] = [
  'admin_users_email_lowercase',
  'admin_users_password_is_hashed',
  'announcements_window_valid',
  'audit_log_action_known',
  'enquiries_iphash_is_sha256_hex',
  'enquiries_name_not_blank',
  'enquiries_phone_digits',
  'student_stories_year_sane',
  'subject_scores_score_sane',
  'toppers_percent_range',
  'toppers_score_sane',
  'toppers_score_unit_known',
  'toppers_year_sane',
] as const;

/** All of them. Currently 21; the number is derived, never typed by hand. */
export const EXPECTED_CHECK_CONSTRAINTS: readonly string[] = [
  ...CONSENT_CRITICAL_CONSTRAINTS,
  ...INTEGRITY_CONSTRAINTS,
].sort();

export const EXPECTED_UNIQUE_CONSTRAINTS: readonly string[] = [
  'admin_users_email_key',
  'student_stories_slug_key',
  'toppers_importRef_key',
] as const;

export const EXPECTED_FOREIGN_KEYS: readonly {
  name: string;
  table: string;
  onDelete: string;
}[] = [
  { name: 'subject_scores_topperId_fkey', table: 'subject_scores', onDelete: 'CASCADE' },
  { name: 'audit_log_actorId_fkey', table: 'audit_log', onDelete: 'SET NULL' },
] as const;

/**
 * Tables that hold institute or student data.
 *
 * Phase 13 requires every one of these to be empty: the repository is being
 * prepared for real data, not filled with rehearsals of it.
 */
export const CONTENT_TABLES: readonly string[] = [
  'toppers',
  'subject_scores',
  'student_stories',
  'batches',
  'announcements',
  'enquiries',
] as const;

/** Operational tables. Empty is expected pre-launch but not a hard requirement. */
export const OPERATIONAL_TABLES: readonly string[] = [
  'admin_users',
  'audit_log',
  'import_runs',
] as const;

/* ====================================================== migrations ======== */

/**
 * SQL that must never appear in a migration without a human reading it first.
 *
 * These are not banned outright - a real schema change may legitimately drop a
 * column. They are BLOCKERS: the preflight refuses to call the deployment safe
 * and asks for a review, which is exactly the treatment Phase 12's silent
 * constraint loss deserved and did not get.
 */
export const DANGEROUS_MIGRATION_PATTERNS: readonly {
  pattern: RegExp;
  label: string;
  why: string;
}[] = [
  {
    pattern: /\bDROP\s+TABLE\b/i,
    label: 'DROP TABLE',
    why: 'Destroys a table and everything in it. Irreversible once applied to production.',
  },
  {
    pattern: /\bDROP\s+CONSTRAINT\b/i,
    label: 'DROP CONSTRAINT',
    why: 'May remove a consent rule. Phase 12 lost all 28 constraints this way without noticing.',
  },
  {
    pattern: /\bDROP\s+COLUMN\b/i,
    label: 'DROP COLUMN',
    why: 'Destroys the data in that column. Check it is not a consent field.',
  },
  {
    pattern: /\bTRUNCATE\b/i,
    label: 'TRUNCATE',
    why: 'Empties a table. Never correct in a deployment migration.',
  },
  {
    pattern: /\bDELETE\s+FROM\b/i,
    label: 'DELETE FROM',
    why: 'Removes rows. A migration should change shape, not content.',
  },
  {
    pattern: /\bDROP\s+TYPE\b/i,
    label: 'DROP TYPE',
    why: 'Removes an enum other columns may depend on.',
  },
] as const;

/**
 * Column names whose alteration is a consent-model change.
 *
 * A migration touching one of these is not necessarily wrong, but it must be
 * read by a person before it reaches a database holding real student records.
 */
export const CONSENT_COLUMNS: readonly string[] = [
  'consentResult',
  'consentName',
  'consentPhoto',
  'consentStory',
  'consentRef',
  'published',
  'publishedAt',
  'displayNameMode',
  'photoPath',
] as const;

/* ================================================== secret scanning ======= */

/**
 * Filenames that must never be tracked by git.
 *
 * `.gitignore` already covers `.env*`. This is the independent check, because
 * a file added with `git add -f` is tracked regardless of what .gitignore says
 * and nothing else in the pipeline would notice.
 */
export const FORBIDDEN_TRACKED_FILES: readonly RegExp[] = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.local$/,
  /(^|\/)\.env\.production(\.local)?$/,
  /(^|\/)\.env\.development\.local$/,
  /(^|\/)\.env\.test\.local$/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /(^|\/)id_rsa$/,
  /(^|\/)id_ed25519$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pgpass$/,
  /(^|\/)credentials\.json$/,
  /(^|\/)service-account.*\.json$/,
] as const;

/**
 * Content patterns that indicate a real secret rather than a placeholder.
 *
 * Each carries a severity, because a template line reading
 * `postgresql://USER:PASSWORD@HOST/DB` is documentation and a line carrying a
 * 40-character hex string is not.
 */
export const SECRET_CONTENT_PATTERNS: readonly {
  id: string;
  pattern: RegExp;
  severity: 'critical' | 'high';
  label: string;
  /** Skip the finding when the matched text points at a local address. */
  localhostExempt?: boolean;
}[] = [
  {
    id: 'private-key',
    pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/,
    severity: 'critical',
    label: 'private key block',
  },
  {
    id: 'aws-access-key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    severity: 'critical',
    label: 'AWS access key id',
  },
  {
    id: 'github-token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    severity: 'critical',
    label: 'GitHub token',
  },
  {
    id: 'slack-token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    severity: 'critical',
    label: 'Slack token',
  },
  {
    id: 'openai-key',
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
    severity: 'critical',
    label: 'API key with sk- prefix',
  },
  {
    id: 'resend-key',
    pattern: /\bre_[A-Za-z0-9_-]{20,}\b/,
    severity: 'critical',
    label: 'Resend API key',
  },
  {
    id: 'live-database-url',
    /**
     * A postgres URL whose password is not an obvious placeholder.
     *
     * TWO EXEMPTIONS, BOTH DELIBERATE.
     *
     * `${...}` in the password position is not a credential - it is code. The
     * literal text in the file is a template placeholder, and scripts that
     * assemble a connection string from constants are the normal way to do it.
     *
     * `localhostExempt` covers the rest: `.env.example` documents a local
     * string as `postgres:postgres@localhost`, and the throwaway verification
     * cluster listens on 127.0.0.1. Neither can authenticate to anything off
     * the machine, so flagging them trains an operator to ignore this section -
     * which is how the one real finding gets scrolled past.
     */
    pattern: /postgres(ql)?:\/\/[^\s:/@]+:(?!PASSWORD\b|password\b|<|\$\{)[^\s:/@]{8,}@\S+/,
    severity: 'critical',
    label: 'database URL with an embedded password',
    localhostExempt: true,
  },
  {
    id: 'neon-url',
    pattern: /\b[a-z0-9-]+\.[a-z0-9-]+\.(neon\.tech|supabase\.co|rds\.amazonaws\.com)\b/i,
    severity: 'high',
    label: 'hosted database hostname',
  },
] as const;

/**
 * Paths a secret scan should skip.
 *
 * `docs/` is NOT skipped - documentation is exactly where a connection string
 * gets pasted "just as an example". The lockfile is skipped because it is
 * 20,000 lines of integrity hashes that match nothing meaningful and match
 * `sk-` shaped noise by chance.
 */
export const SECRET_SCAN_SKIP: readonly RegExp[] = [
  /^package-lock\.json$/,
  /^node_modules\//,
  /^\.next\//,
  /^src\/generated\//,
  /^public\/fonts\//,
  /\.(png|jpe?g|webp|avif|ico|woff2?|ttf|otf|pdf|zip)$/i,
  /**
   * The two files that DEFINE and TEST these patterns necessarily contain
   * examples of them: an AWS key id, a GitHub token shape, a `-----BEGIN
   * PRIVATE KEY-----` header. Scanning them reports the samples as leaks.
   *
   * This is a narrow, named exclusion rather than a blanket rule, and the
   * samples are deliberately synthetic - AWS's own documentation placeholder,
   * and repeated-letter tokens that no issuer would mint. The patterns
   * themselves are proved to work by the tests inside the second file, so
   * excluding it costs no coverage.
   */
  /^src\/lib\/deployment-contract\.ts$/,
  /^tests\/deployment\.test\.ts$/,
] as const;

/* ==================================================== client bundle ======= */

/**
 * Strings that must never appear in JavaScript served to a browser.
 *
 * Split by kind, because "the literal text DATABASE_URL appears in a chunk" and
 * "an actual connection string appears in a chunk" deserve different verdicts.
 * The first is usually a variable name in an error message; the second is a
 * breach.
 */
export const CLIENT_BUNDLE_FORBIDDEN: readonly {
  id: string;
  pattern: RegExp;
  severity: 'critical' | 'high';
  label: string;
}[] = [
  {
    id: 'connection-string',
    pattern: /postgres(ql)?:\/\/[^\s"'`]{10,}/,
    severity: 'critical',
    label: 'a database connection string',
  },
  {
    id: 'prisma-runtime',
    pattern: /PrismaClient|@prisma\/adapter-pg/,
    severity: 'critical',
    label: 'the Prisma client',
  },
  {
    id: 'session-secret-value',
    pattern: /ADMIN_SESSION_SECRET\s*[:=]\s*["'][^"']{8,}/,
    severity: 'critical',
    label: 'an inlined session secret',
  },
  {
    id: 'enquiry-secret-value',
    pattern: /ENQUIRY_SECRET\s*[:=]\s*["'][^"']{8,}/,
    severity: 'critical',
    label: 'an inlined enquiry secret',
  },
  {
    id: 'password-hash',
    pattern: /\$2[aby]\$\d{2}\$|scrypt\$/,
    severity: 'critical',
    label: 'a password hash',
  },
  {
    id: 'absolute-source-path',
    // A build that leaks the machine it was built on.
    pattern: /[A-Za-z]:\\\\?Users\\\\?[^\s"']+|\/home\/[a-z0-9_-]+\/[^\s"']+/,
    severity: 'high',
    label: 'an absolute filesystem path from the build machine',
  },
] as const;

/**
 * Import and export internals that must not reach a public chunk.
 *
 * Phase 12 verified this once. It belongs in the preflight because "the public
 * site does not carry admin code" is a property that regresses the moment
 * somebody imports a helper across the boundary.
 */
export const ADMIN_ONLY_MARKERS: readonly string[] = [
  'Permission: Show Photograph',
  'Consent Form Reference',
  'neutraliseCell',
  'buildPlan',
  'planDigest',
  'wouldBecomePublic',
] as const;

/* ======================================================== routes ========== */

export type RouteKind = 'public' | 'admin' | 'route-handler' | 'metadata' | 'asset';

export type RouteSpec = {
  path: string;
  kind: RouteKind;
  /** Must an authenticated admin session exist to get a non-redirect response? */
  requiresAuth: boolean;
  /** Can a request to it change data? */
  mutates: boolean;
  /** Should it appear in sitemap.xml once the site is launched? */
  inSitemap: boolean;
  /** Should a search engine be allowed to index it after launch? */
  crawlable: boolean;
  note?: string;
};

/**
 * Every route the application serves, and what should be true of it.
 *
 * A test walks `src/app/` and fails if a route exists that is not listed here,
 * or if a listed route has disappeared. That is the point: a new admin route
 * added without a line in this table is a route nobody decided the rules for.
 */
export const ROUTES: readonly RouteSpec[] = [
  { path: '/', kind: 'public', requiresAuth: false, mutates: false, inSitemap: true, crawlable: true },
  { path: '/about', kind: 'public', requiresAuth: false, mutates: false, inSitemap: true, crawlable: true },
  { path: '/courses', kind: 'public', requiresAuth: false, mutates: false, inSitemap: true, crawlable: true },
  {
    path: '/courses/[slug]',
    kind: 'public',
    requiresAuth: false,
    mutates: false,
    inSitemap: true,
    crawlable: true,
    note: 'Statically generated from the course config.',
  },
  {
    path: '/results',
    kind: 'public',
    requiresAuth: false,
    mutates: false,
    inSitemap: true,
    crawlable: true,
    note: 'Filtered and paginated views carry noindex,follow. Only published, consented records.',
  },
  {
    path: '/stories',
    kind: 'public',
    requiresAuth: false,
    mutates: false,
    inSitemap: true,
    crawlable: true,
    note: 'Only published, consented stories.',
  },
  { path: '/announcements', kind: 'public', requiresAuth: false, mutates: false, inSitemap: true, crawlable: true },
  {
    path: '/admissions',
    kind: 'public',
    requiresAuth: false,
    mutates: true,
    inSitemap: true,
    crawlable: true,
    note: 'Hosts the enquiry Server Action. Rate limited, token protected, same-origin enforced.',
  },
  { path: '/contact', kind: 'public', requiresAuth: false, mutates: false, inSitemap: true, crawlable: true },

  {
    path: '/admin',
    kind: 'admin',
    requiresAuth: true,
    mutates: false,
    inSitemap: false,
    crawlable: false,
  },
  {
    path: '/admin/login',
    kind: 'admin',
    requiresAuth: false,
    mutates: true,
    inSitemap: false,
    crawlable: false,
    note: 'Reachable signed out by design. Throttled per account and per instance.',
  },
  {
    path: '/admin/logout',
    kind: 'route-handler',
    requiresAuth: false,
    mutates: true,
    inSitemap: false,
    crawlable: false,
    note: 'Revokes every session for the account. Safe to hit signed out.',
  },
  { path: '/admin/students', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/students/new', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/students/[id]', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/stories', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/stories/new', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/stories/[id]', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/batches', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/batches/new', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/batches/[id]', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/announcements', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/announcements/new', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/announcements/[id]', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/enquiries', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  { path: '/admin/enquiries/[id]', kind: 'admin', requiresAuth: true, mutates: true, inSitemap: false, crawlable: false },
  {
    path: '/admin/preview',
    kind: 'admin',
    requiresAuth: true,
    mutates: false,
    inSitemap: false,
    crawlable: false,
    note: 'Shows what a visitor would see. Reads the public data functions.',
  },
  {
    path: '/admin/data',
    kind: 'admin',
    requiresAuth: true,
    mutates: true,
    inSitemap: false,
    crawlable: false,
    note: 'Import and export. Import can create and correct; it can never publish.',
  },
  {
    path: '/admin/data/download',
    kind: 'route-handler',
    requiresAuth: true,
    mutates: false,
    inSitemap: false,
    crawlable: false,
    note: 'GET. Authenticated in the handler; 404 rather than 401 to a stranger.',
  },

  { path: '/robots.txt', kind: 'metadata', requiresAuth: false, mutates: false, inSitemap: false, crawlable: true },
  { path: '/sitemap.xml', kind: 'metadata', requiresAuth: false, mutates: false, inSitemap: false, crawlable: true },
  { path: '/icon.png', kind: 'asset', requiresAuth: false, mutates: false, inSitemap: false, crawlable: true },
] as const;

/** Routes that must redirect or refuse when there is no session. */
export const PROTECTED_ROUTES: readonly string[] = ROUTES.filter(
  (r) => r.requiresAuth && !r.path.includes('['),
).map((r) => r.path);

/** Routes that must appear in the sitemap once launched. */
export const SITEMAP_ROUTES: readonly string[] = ROUTES.filter((r) => r.inSitemap).map(
  (r) => r.path,
);

/* ================================================ security headers ======== */

export type HeaderExpectation = {
  header: string;
  /** A substring that must be present in the value. */
  mustContain?: string;
  /** A pattern the value must match. */
  mustMatch?: RegExp;
  /** True when the header is only meaningful over HTTPS. */
  httpsOnly?: boolean;
  why: string;
};

/** Required on every response, public and admin alike. */
export const REQUIRED_HEADERS: readonly HeaderExpectation[] = [
  {
    header: 'content-security-policy',
    mustContain: "frame-ancestors 'none'",
    why: 'Clickjacking. Nothing on this site should ever be framed.',
  },
  {
    header: 'x-content-type-options',
    mustContain: 'nosniff',
    why: 'Stops a browser from guessing that an upload is HTML.',
  },
  {
    header: 'referrer-policy',
    mustContain: 'strict-origin',
    why: 'A student record URL must not leak in a Referer header.',
  },
  {
    header: 'x-frame-options',
    mustContain: 'DENY',
    why: 'The older companion to frame-ancestors, for browsers that need it.',
  },
  {
    header: 'permissions-policy',
    mustContain: 'camera=()',
    why: 'The site needs no device permissions at all.',
  },
  {
    header: 'strict-transport-security',
    mustContain: 'max-age=',
    httpsOnly: true,
    why: 'Pins HTTPS after the first visit. Only meaningful once served over TLS.',
  },
];

/** Additionally required on /admin. */
export const ADMIN_HEADER_EXPECTATIONS: readonly HeaderExpectation[] = [
  {
    header: 'content-security-policy',
    mustMatch: /'nonce-[A-Za-z0-9+/=]{16,}'/,
    why: 'The admin runs a nonce policy rather than the public unsafe-inline baseline.',
  },
  {
    header: 'content-security-policy',
    mustContain: "'strict-dynamic'",
    why: 'What makes a nonce workable for a framework that loads its own chunks.',
  },
  {
    header: 'cache-control',
    mustContain: 'no-store',
    why: 'Admin responses are per-account and must never sit in a shared cache.',
  },
];

/** What the session cookie must look like. */
export const SESSION_COOKIE = {
  name: 'ci_admin_session',
  httpOnly: true,
  sameSite: 'Lax',
  path: '/',
  /** Secure is conditional on NODE_ENV=production, so it is checked against the scheme. */
  secureInProduction: true,
  /** No Domain attribute: a host-only cookie is not sent to siblings. */
  forbidDomain: true,
} as const;

/* ==================================================== launch state ======== */

/**
 * What must be true of the repository during Phase 13.
 *
 * The launch switch staying off is not a default that happens to hold - it is
 * a checked property, and the preflight fails if it changes without the
 * deliberate launch procedure in the runbook.
 */
export const EXPECTED_PRE_LAUNCH = {
  siteIsLaunched: false,
  robotsDisallowsEverything: true,
  contentTablesEmpty: true,
} as const;

/* ================================================== scorecard shape ======= */

export type ScorecardStatus = 'READY' | 'READY WITH CONDITIONS' | 'BLOCKED' | 'NOT TESTED';

export const SCORECARD_CATEGORIES: readonly string[] = [
  'DATABASE',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'CONSENT',
  'SECURITY',
  'ENVIRONMENT',
  'BUILD',
  'PERFORMANCE',
  'SEO',
  'ACCESSIBILITY',
  'IMPORT/EXPORT',
  'CACHING',
  'OBSERVABILITY',
  'BACKUP/RECOVERY',
  'DOMAIN',
  'EMAIL',
  'PRIVACY',
  'REAL DATA',
  'LAUNCH CONTROL',
] as const;
