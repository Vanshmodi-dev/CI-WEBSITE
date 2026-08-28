/**
 * Validating the two kinds of link an administrator may supply: an email
 * address and a social profile.
 *
 * NO `server-only` GUARD, deliberately — the same reasoning as `validation.ts`,
 * `request-guard.ts` and `location.ts`. Nothing here touches I/O, the
 * environment or the database; it parses strings. Keeping it importable is what
 * lets it be unit-tested, and an unverified validator is not a validator.
 *
 * =============================================================================
 * WHY THE HOST CHECK IS AN EXACT SET AND NOT A PREFIX
 * =============================================================================
 * Topic 9 established this rule for YouTube video links and Topic 10 repeated
 * it for map URLs, both for the same reason: `startsWith('https://youtube.com')`
 * accepts `https://youtube.com.attacker.example/…`, and
 * `hostname.endsWith('youtube.com')` accepts `evilyoutube.com`. The only
 * correct comparison is to parse with the platform URL parser and compare the
 * host to a closed set with `===`.
 *
 * These values end up in an `href` on every page of the public site, so the
 * question is not academic. The scheme is pinned to https for the same reason
 * the video parser pins it: `javascript:` and `data:` are URLs too, and a
 * `javascript:` href is stored XSS with extra steps.
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

export type SocialPlatform = 'youtube' | 'instagram';

const HOSTS: Record<SocialPlatform, ReadonlySet<string>> = {
  youtube: YOUTUBE_HOSTS,
  instagram: INSTAGRAM_HOSTS,
};

const LABEL: Record<SocialPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
};

const EXAMPLE_HOST: Record<SocialPlatform, string> = {
  youtube: 'youtube.com',
  instagram: 'instagram.com',
};

/**
 * A social profile URL, or an error for the administrator to read.
 *
 * Returns the CANONICAL string rather than whatever was typed, so what gets
 * stored is something the parser has already agreed with. A blank value is
 * accepted by the caller rather than here — "no account yet" is the normal
 * state today, and it is handled by the field being `blankable`.
 */
export function parseSocialUrl(
  platform: SocialPlatform,
  raw: string,
): { url: string } | { error: string } {
  const value = raw.trim();
  if (value === '') return { error: `Enter the ${LABEL[platform]} address.` };

  /*
    A bare "instagram.com/commerceinsight" is what somebody will actually
    paste, and refusing it outright is unhelpful. Anything that ALREADY has a
    scheme is left exactly as typed, so an explicit `javascript:` still reaches
    the protocol check below and is refused there rather than being silently
    rewritten into something harmless-looking.
  */
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      error: `That is not a web address. Copy it from your ${LABEL[platform]} page.`,
    };
  }

  if (parsed.protocol !== 'https:') {
    return { error: 'The address must start with https://' };
  }

  /*
    Credentials in a URL are never legitimate here, and they are the classic
    way to disguise a host from a human reader:
    `https://youtube.com@evil.example/x` is a link to evil.example. The parser
    is not fooled, but a person reading the admin field would be, so this is
    refused with an explanation rather than quietly accepted.
  */
  if (parsed.username !== '' || parsed.password !== '') {
    return { error: 'Remove the username or password from the address.' };
  }

  if (!HOSTS[platform].has(parsed.hostname.toLowerCase())) {
    return {
      error: `That is not a ${LABEL[platform]} address — it should be on ${EXAMPLE_HOST[platform]}.`,
    };
  }

  if (parsed.pathname === '/' || parsed.pathname === '') {
    return {
      error: `Link to the institute's own ${LABEL[platform]} page, not the site's front page.`,
    };
  }

  return { url: parsed.toString() };
}

/** The validator shape the content registry expects: an error string, or null. */
export function validateSocial(platform: SocialPlatform) {
  return (value: string): string | null => {
    if (value.trim() === '') return null; // blankable: no account yet
    const result = parseSocialUrl(platform, value);
    return 'error' in result ? result.error : null;
  };
}

/**
 * An email address.
 *
 * =============================================================================
 * DELIBERATELY NOT RFC 5322
 * =============================================================================
 * The full grammar permits quoted strings, comments and addresses no mail
 * provider on earth would issue. A regex attempting it is unreadable and still
 * wrong. What this needs to catch is the realistic mistake — a missing @, a
 * trailing comma, a space in the middle, "info@institute" with no dot — and
 * then get out of the way. Anything that passes here is confirmed by the
 * institute actually receiving mail at it, which no validator can do.
 *
 * The address is rendered into a `mailto:` href, so whitespace, quotes,
 * angle brackets and control characters are refused outright.
 */
export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (v === '') return null; // blankable: no professional address yet

  /*
    Checked by code point rather than with a character class.

    A control character typed straight into a regex literal is invisible in a
    diff, in a review and in most editors - which is exactly the wrong
    property for the guard that keeps NUL bytes and newlines out of a
    `mailto:` attribute. This loop says what it means in plain ASCII.
  */
  for (const character of v) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) {
      return 'An email address cannot contain spaces or control characters.';
    }
  }

  // Punctuation that would break out of an href attribute, or separate one
  // address from another — a header-injection shape rather than an address.
  if (/["'`<>\\,;()[\]]/.test(v)) {
    return 'An email address cannot contain punctuation of that kind.';
  }

  const at = v.indexOf('@');
  if (at <= 0 || at !== v.lastIndexOf('@') || at === v.length - 1) {
    return 'Enter an address in the form name@example.com';
  }

  const domain = v.slice(at + 1);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
    return 'The part after the @ does not look like a domain, for example commerceinsight.in';
  }

  if (v.length > 120) return 'That address is too long.';
  return null;
}
