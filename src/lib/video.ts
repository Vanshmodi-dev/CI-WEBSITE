/**
 * YouTube references — parsing, validating, and building the three URLs we use.
 *
 * PURE. No imports, no I/O, no `server-only`. It is shared with the browser so
 * the admin form can tell a teacher their URL is wrong before they submit it,
 * and it is unit-testable without a database or a network.
 *
 * =============================================================================
 * THE ONLY THING THIS APPLICATION EVER STORES IS AN ELEVEN-CHARACTER ID
 * =============================================================================
 * Not a URL. Not an iframe. Not embed HTML. Not "the provider's embed code".
 *
 * A teacher pastes whatever YouTube gave them — a watch URL, a share link, a
 * Shorts link, usually with a tracking parameter and sometimes a playlist and a
 * timestamp. `parseYouTubeId` throws all of that away and keeps eleven
 * characters. Everything the browser is later asked to load is rebuilt from
 * those eleven characters BY THIS FILE, so no attacker-controlled string ever
 * reaches an `src` attribute.
 *
 * That is what makes iframe injection structurally impossible here rather than
 * merely filtered: there is no code path in which a stored value becomes a URL.
 *
 * =============================================================================
 * THE HOST IS MATCHED EXACTLY, AGAINST A LIST
 * =============================================================================
 * ⚠ The tempting version of this check is `url.includes('youtube.com')`, and it
 * is wrong in both directions:
 *
 *     https://youtube.com.evil.example/watch?v=...   contains it
 *     https://evil.example/youtube.com/watch?v=...   contains it
 *     https://www.youtube.com@evil.example/...       contains it, and the real
 *                                                    host is evil.example
 *
 * `new URL()` resolves all three correctly — the last one in particular, where
 * everything before the `@` is userinfo and the host is the attacker's. So the
 * hostname is taken from a parsed URL and compared, lowercased, against a fixed
 * set. Anything else is refused, including every other Google property.
 */

/** Exactly eleven characters of YouTube's identifier alphabet. */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Hosts we accept a link from.
 *
 * `youtube-nocookie.com` is here because it is what WE emit, so a teacher who
 * copies a URL out of our own admin preview is not told it is invalid.
 * Deliberately absent: every other Google domain, every URL shortener, and
 * `music.youtube.com`, which is not teaching content.
 */
const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** Path prefixes that carry the id as the next segment. */
const ID_BEARING_PREFIXES = ['embed', 'shorts', 'v', 'live'];

export function isYouTubeId(value: unknown): value is string {
  return typeof value === 'string' && YOUTUBE_ID_PATTERN.test(value);
}

/**
 * Extract a YouTube video id from whatever a teacher pasted.
 *
 * Returns `null` for anything that is not a YouTube video reference. Never
 * throws — a malformed string is an ordinary outcome here, not an exception.
 *
 * Accepts a bare id, and these link shapes on the allowed hosts:
 *
 *     /watch?v=ID        the address bar
 *     youtu.be/ID        the Share button
 *     /embed/ID          an embed URL, including our own
 *     /shorts/ID         a Short
 *     /v/ID, /live/ID    older and livestream forms
 *
 * Everything after the id — `&list=`, `&t=`, `&si=`, `?feature=share` — is
 * discarded rather than stored. Those parameters are tracking and playlist
 * state; keeping them would mean the website re-emitting somebody's referral
 * token and pinning a video to a playlist nobody chose.
 */
export function parseYouTubeId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const input = raw.trim();
  if (input.length === 0) return null;

  // A bare id, which is what the admin stores and what a teacher may paste back.
  if (YOUTUBE_ID_PATTERN.test(input)) return input;

  /*
    ⚠ A SCHEME IS REQUIRED, AND `//` IS NOT A SCHEME.

    `new URL('//evil.example/watch?v=x')` throws without a base, which is the
    behaviour we want — but relying on a throw for a protocol-relative URL is
    relying on a side effect. It is refused explicitly so the reason is legible.
  */
  if (input.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  /*
    HTTPS ONLY, CHECKED BEFORE THE HOST.

    `javascript:`, `data:`, `file:`, `ftp:` and friends are refused here. Plain
    `http:` is refused too: YouTube has not served plaintext for years, so an
    http link is either very old or somebody's rewrite, and there is no reason
    to accept one when the canonical form is available.
  */
  if (url.protocol !== 'https:') return null;

  // Exact match, lowercased. `new URL` has already resolved userinfo, ports,
  // percent-encoding and case for us.
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  const segments = url.pathname.split('/').filter((s) => s.length > 0);

  // youtu.be/ID — the id is the whole path.
  // `segments[0]` is `string | undefined` for an empty path, which is exactly
  // the `https://youtu.be/` case; `isYouTubeId` narrows it for us.
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const first = segments[0];
    return isYouTubeId(first) ? first : null;
  }

  // /watch?v=ID
  if (segments[0] === 'watch') {
    const v = url.searchParams.get('v');
    return isYouTubeId(v) ? v : null;
  }

  // /embed/ID, /shorts/ID, /v/ID, /live/ID
  if (segments.length >= 2 && ID_BEARING_PREFIXES.includes(segments[0] ?? '')) {
    const candidate = segments[1];
    return isYouTubeId(candidate) ? candidate : null;
  }

  return null;
}

/**
 * The poster image for a video.
 *
 * `mqdefault` is 320x180 — SIXTEEN BY NINE and always present.
 *
 * The alternatives are worse for this use. `hqdefault` (480x360) and
 * `sddefault` (640x480) are 4:3, so YouTube letterboxes a widescreen video into
 * them and the card shows black bars. `maxresdefault` (1280x720) is the right
 * shape but is generated only for some uploads, so it 404s unpredictably — and
 * it is four times the pixels a card needs.
 *
 * Built from the id, never from stored text.
 */
export function thumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

/**
 * The privacy-preserving embed URL, used only after a visitor clicks play.
 *
 * `youtube-nocookie.com` is the origin the CSP permits and the one Master Plan
 * section 14 requires. `rel=0` keeps the end-screen suggestions to the same
 * channel rather than opening the whole of YouTube inside our page, and
 * `autoplay=1` is honest: the visitor has just pressed play, so playing is what
 * they asked for.
 */
export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}

/** Where "Watch on YouTube" goes. */
export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/* ------------------------------------------------------------- subjects -- */

export const VIDEO_SUBJECTS = [
  'ACCOUNTANCY',
  'BUSINESS_STUDIES',
  'ECONOMICS',
  'EXAM_PREPARATION',
  'OTHER',
] as const;

export type VideoSubjectValue = (typeof VIDEO_SUBJECTS)[number];

/** What a visitor reads. The enum is storage; this is language. */
export const SUBJECT_LABEL: Readonly<Record<VideoSubjectValue, string>> = {
  ACCOUNTANCY: 'Accountancy',
  BUSINESS_STUDIES: 'Business Studies',
  ECONOMICS: 'Economics',
  EXAM_PREPARATION: 'Exam preparation',
  OTHER: 'Other',
};

/** Is this a subject we recognise? Anything else is a probe or a stale link. */
export function isVideoSubject(value: unknown): value is VideoSubjectValue {
  return typeof value === 'string' && (VIDEO_SUBJECTS as readonly string[]).includes(value);
}
