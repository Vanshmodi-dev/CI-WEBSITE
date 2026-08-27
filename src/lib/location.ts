/**
 * Where the institute is — coordinates in, Google URLs out.
 *
 * PURE. No imports, no I/O, no `server-only`. Shared with the browser so the
 * admin can validate a coordinate pair as it is typed, and unit-testable
 * without a database or a network.
 *
 * =============================================================================
 * THE APPLICATION NEVER STORES A URL. IT STORES TWO NUMBERS.
 * =============================================================================
 * This is the whole security design, and it is the same shape Topic 9 used for
 * YouTube: reduce operator input to the smallest identifier that cannot be
 * weaponised, and rebuild every URL from it in our own code.
 *
 * A coordinate pair cannot contain a scheme, a host, userinfo, a path, a
 * newline, a percent-encoded anything, or a single character of markup — it is
 * two decimal numbers in a fixed range or it is refused. So the long list of
 * URL attacks that a "paste your Google Maps link" field would have to survive
 * — `javascript:`, `data:`, `https://google.com.evil.example`,
 * `https://evil.example@google.com`, IDN homographs, CRLF injection, protocol
 * relative URLs, userinfo bypasses — is not filtered here. It is *unreachable*,
 * because there is no field in which any of it could be written.
 *
 * =============================================================================
 * NOTHING IS FETCHED FROM THESE VALUES, EVER
 * =============================================================================
 * The directions URL is a LINK the visitor's browser follows if they choose to.
 * The embed URL is an IFRAME the visitor's browser loads after they click. The
 * server never requests either. There is therefore no SSRF surface here — not a
 * mitigated one, an absent one — and no amount of loopback or metadata-IP
 * probing changes that, because those values cannot be expressed as a latitude.
 */

/** What a validated coordinate pair looks like once parsed. */
export type Coordinates = { lat: number; lng: number };

/**
 * How many decimal places are kept.
 *
 * Six is roughly 0.11 m at the equator — far finer than a building. Google
 * hands out seven when you copy a point, and keeping all of them stores
 * precision nobody can act on while making the value harder to eyeball. The cap
 * also bounds the string that ends up in a URL.
 */
const PRECISION = 6;

/**
 * Parse "lat,lng" into two numbers, or return null.
 *
 * Accepts what a teacher actually has in their clipboard after right-clicking a
 * point in Google Maps and choosing the coordinates: `26.849, 75.805`, with or
 * without a space, with or without a leading `+`.
 *
 * Never throws. A malformed value is an ordinary outcome, not an exception.
 */
export function parseCoordinates(raw: unknown): Coordinates | null {
  if (typeof raw !== 'string') return null;

  const input = raw.trim();
  if (input.length === 0 || input.length > 64) return null;

  /*
    ANCHORED, AND DELIBERATELY NARROW.

    Two signed decimals separated by one comma, nothing before, nothing after.
    A value that merely CONTAINS a coordinate pair is refused — which is what
    stops `26.8,75.8 <script>` and `https://maps.google.com/?q=26.8,75.8` from
    being read as coordinates and quietly stored.
  */
  /*
    ⚠ ` *` AND NOT `\s*`.

    `\s` matches carriage return, newline and tab, so the first version of this
    accepted `26.8,75.8` — the control character was swallowed by the
    separator and discarded. The parsed OUTPUT was two numbers either way, so
    nothing could have been injected downstream; but a field that quietly
    tolerates control characters makes "no control characters reach this value"
    an approximate claim rather than a true one, and every other validator in
    this project strips them. A literal space is the only thing a human types
    after a comma.
  */
  const match = /^([+-]?\d{1,3}(?:\.\d{1,10})?) *, *([+-]?\d{1,3}(?:\.\d{1,10})?)$/.exec(input);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  // `Number` can still produce NaN or Infinity from odd input the regex allows.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return { lat: round(lat), lng: round(lng) };
}

function round(n: number): number {
  const factor = 10 ** PRECISION;
  return Math.round(n * factor) / factor;
}

/** The stored form: exactly what `parseCoordinates` accepts back. */
export function formatCoordinates({ lat, lng }: Coordinates): string {
  return `${lat},${lng}`;
}

/**
 * Why a coordinate value is not acceptable, in words a teacher can act on.
 *
 * Returns null when the value is fine. An EMPTY value is fine: coordinates are
 * optional, and leaving them blank is how the institute says "we have not
 * checked this yet", which hides the map rather than pinning it somewhere
 * approximate.
 */
export function validateCoordinates(value: string): string | null {
  if (value.trim().length === 0) return null;
  return parseCoordinates(value)
    ? null
    : 'Enter the two numbers Google gives you, separated by a comma — for example 26.849123, 75.805456.';
}

/**
 * "Get directions" — a link, not a frame.
 *
 * Google's documented Maps URLs API. On a phone this hands off to the native
 * maps application, which is what Master Plan section 15 asks for ("Directions
 * opens the native maps app on mobile") and what somebody standing outside
 * actually wants.
 *
 * ⚠ COORDINATES WHEN WE HAVE THEM, THE ADDRESS WHEN WE DO NOT.
 *
 * The two are not equivalent and the difference matters. A coordinate
 * destination is a point somebody verified. An address destination is a SEARCH:
 * Google resolves it and shows what it finds, which for "Pratap Nagar, Jaipur"
 * is a large sector rather than a doorway. That is honest — it is Google's
 * answer to a question, not our claim about a location — and it is why the
 * directions link can ship before the coordinates do, while the MAP PIN cannot.
 */
export function directionsUrl(addressLine: string, coordinates: Coordinates | null): string {
  const destination = coordinates
    ? formatCoordinates(coordinates)
    : addressLine.replace(/\s+/g, ' ').trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/**
 * The keyless interactive embed, loaded only after a click.
 *
 * ⚠ THIS URL STAYS ON `www.google.com`, WHICH THE CSP ALREADY PERMITS.
 *
 * Verified rather than assumed: `https://www.google.com/maps?q=…&output=embed`
 * redirects to `https://www.google.com/maps/embed?…` — the same origin — and a
 * real browser loads it inside our page with no `frame-src` violation. The
 * older `maps.google.com` form would have needed a new CSP origin; this one
 * needs nothing.
 *
 * Master Plan section 15 explicitly permits this: "the no-key embed is also
 * acceptable and avoids the key entirely". So there is no Maps API key in this
 * project, nothing to restrict by HTTP referrer, and nothing to leak.
 *
 * Takes COORDINATES ONLY. There is deliberately no address-based embed: an
 * embed drops a pin, and a pin at an unverified address is a claim we cannot
 * support.
 */
export function mapEmbedUrl(coordinates: Coordinates): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(
    formatCoordinates(coordinates),
  )}&hl=en&z=16&output=embed`;
}

/**
 * A link to the map itself, for people who want the whole of Google Maps.
 *
 * Distinct from `directionsUrl`, which starts navigation. This one just shows
 * the place.
 */
export function mapViewUrl(coordinates: Coordinates): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    formatCoordinates(coordinates),
  )}`;
}
