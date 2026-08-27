import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCoordinates,
  formatCoordinates,
  validateCoordinates,
  directionsUrl,
  mapEmbedUrl,
  mapViewUrl,
} from '../src/lib/location.ts';

/**
 * The coordinate parser is the entire operator-input boundary for Topic 10.
 *
 * The point of these tests is not only that hostile values are refused. It is
 * that the hostile values in the topic's threat model — schemes, lookalike
 * hosts, userinfo bypasses, CRLF, IDN tricks — are not merely filtered but
 * INEXPRESSIBLE, because the only thing this field can hold is two numbers.
 */

const JAIPUR = { lat: 26.849123, lng: 75.805456 };

describe('parseCoordinates — what a teacher will actually paste', () => {
  test('the shape Google puts on the clipboard', () => {
    // The POSITIVE CONTROL. Without it every refusal below could pass because
    // the function returns null for everything.
    assert.deepEqual(parseCoordinates('26.849123, 75.805456'), JAIPUR);
  });

  test('with and without a space, and with a leading plus', () => {
    assert.deepEqual(parseCoordinates('26.849123,75.805456'), JAIPUR);
    assert.deepEqual(parseCoordinates('26.849123 ,  75.805456'), JAIPUR);
    assert.deepEqual(parseCoordinates('  26.849123, 75.805456  '), JAIPUR);
    assert.deepEqual(parseCoordinates('+26.849123,+75.805456'), JAIPUR);
  });

  test('negative and whole-number coordinates', () => {
    assert.deepEqual(parseCoordinates('-33.8688,151.2093'), { lat: -33.8688, lng: 151.2093 });
    assert.deepEqual(parseCoordinates('0,0'), { lat: 0, lng: 0 });
    assert.deepEqual(parseCoordinates('90,180'), { lat: 90, lng: 180 });
    assert.deepEqual(parseCoordinates('-90,-180'), { lat: -90, lng: -180 });
  });

  test('precision is capped at six decimals', () => {
    const parsed = parseCoordinates('26.8491234567,75.8054567891');
    assert.equal(parsed?.lat, 26.849123);
    assert.equal(parsed?.lng, 75.805457);
  });

  test('a parsed pair round-trips through the stored form', () => {
    const stored = formatCoordinates(JAIPUR);
    assert.equal(stored, '26.849123,75.805456');
    assert.deepEqual(parseCoordinates(stored), JAIPUR);
  });
});

describe('parseCoordinates — out of range', () => {
  test('latitude beyond the poles is refused', () => {
    assert.equal(parseCoordinates('90.1,0'), null);
    assert.equal(parseCoordinates('-90.1,0'), null);
    assert.equal(parseCoordinates('91,75'), null);
    assert.equal(parseCoordinates('180,75'), null);
  });

  test('longitude beyond the antimeridian is refused', () => {
    assert.equal(parseCoordinates('26.8,180.1'), null);
    assert.equal(parseCoordinates('26.8,-180.1'), null);
    assert.equal(parseCoordinates('26.8,360'), null);
  });
});

describe('parseCoordinates — the URL threat model, made inexpressible', () => {
  test('every scheme in the threat model is refused', () => {
    for (const value of [
      'javascript:alert(1)',
      'javascript:26.8,75.8',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'http://evil.example',
      'https://evil.example',
      'ftp://evil.example',
      'blob:https://www.google.com/x',
    ]) {
      assert.equal(parseCoordinates(value), null, `should have refused ${value}`);
    }
  });

  test('lookalike hosts and userinfo bypasses are refused', () => {
    for (const value of [
      'https://google.com.evil.example/maps?q=26.8,75.8',
      'https://evil.example@google.com/maps?q=26.8,75.8',
      'https://www.google.com@evil.example/maps',
      'https://evil.example/www.google.com/maps',
      'https://xn--goog-8va.com/maps',
      '//www.google.com/maps?q=26.8,75.8',
      '//evil.example',
    ]) {
      assert.equal(parseCoordinates(value), null, `should have refused ${value}`);
    }
  });

  test('loopback, private and metadata addresses are refused', () => {
    /*
      These are in the threat model because a field that accepted a URL would
      have to refuse them. This field cannot express them at all — and nothing
      here is ever fetched server-side, so there is no SSRF surface either way.
      Asserted so the claim is checked rather than believed.
    */
    for (const value of [
      'localhost',
      'http://localhost',
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254',
      'http://169.254.169.254/latest/meta-data/',
      '[::1]',
      'http://[::1]/',
      '10.0.0.1',
      '192.168.1.1',
      'metadata.google.internal',
    ]) {
      assert.equal(parseCoordinates(value), null, `should have refused ${value}`);
    }
  });

  test('markup, HTML and SVG payloads are refused', () => {
    for (const value of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<iframe src="https://evil.example"></iframe>',
      '"><iframe src="//evil.example">',
      '26.8,75.8<script>alert(1)</script>',
      '<b>26.8,75.8</b>',
    ]) {
      assert.equal(parseCoordinates(value), null, `should have refused ${value}`);
    }
  });

  test('CRLF, newlines and control characters are refused', () => {
    /*
      Written with escape sequences rather than literal control characters.

      The first version of this file contained the real bytes, which made it a
      "binary file" to grep, unreadable in a diff, and impossible to edit
      reliably. The values below are the same ones; only the notation differs.
    */
    for (const value of [
      '26.8,75.8\r\nSet-Cookie: a=b',
      '26.8,75.8\nX-Injected: 1',
      '26.8,\r75.8',
      '26.8\t,75.8',
      '26.8,\u000B75.8',
      '26.8,75.8\u0000',
      '\u000026.8,75.8',
    ]) {
      assert.equal(parseCoordinates(value), null, `should have refused ${JSON.stringify(value)}`);
    }
  });

  test('percent-encoded and Unicode tricks are refused', () => {
    for (const value of [
      '%32%36%2E%38%2C%37%35%2E%38',
      '26%2E8%2C75%2E8',
      '２６．８，７５．８', // full-width digits and comma
      '26.8٬75.8', // Arabic thousands separator
      '26.8⁄75.8',
    ]) {
      assert.equal(parseCoordinates(value), null, `should have refused ${JSON.stringify(value)}`);
    }
  });

  test('a coordinate pair embedded in a longer string is not extracted', () => {
    // Anchored at both ends: containing a valid pair is not being one.
    assert.equal(parseCoordinates('q=26.849123,75.805456'), null);
    assert.equal(parseCoordinates('26.849123,75.805456&z=16'), null);
    assert.equal(parseCoordinates('26.8,75.8,extra'), null);
    assert.equal(parseCoordinates('26.8,75.8 26.8,75.8'), null);
  });

  test('an extremely long value is refused before any work is done', () => {
    assert.equal(parseCoordinates('2'.repeat(100000)), null);
    assert.equal(parseCoordinates('26.8,' + '9'.repeat(50000)), null);
  });

  test('but a valid pair with surrounding whitespace is trimmed, not refused', () => {
    /*
      ⚠ THIS CASE ORIGINALLY EXPECTED null, AND THE EXPECTATION WAS WRONG.

      It was listed under "extremely long value" as
      `'26.8,75.8' + ' '.repeat(5000)`. That is not a long value — it is a valid
      coordinate pair with padding, and trimming it is correct behaviour rather
      than a bypass. The length guard runs after the trim on purpose: what it
      bounds is how much real content the field will consider, and whitespace is
      not content.
    */
    assert.deepEqual(parseCoordinates('  26.8,75.8' + ' '.repeat(5000)), { lat: 26.8, lng: 75.8 });
  });

  test('never throws, whatever it is handed', () => {
    for (const bad of [
      null, undefined, 42, {}, [], true, Symbol('x'), NaN, Infinity,
      '', '   ', ',', '26.8,', ',75.8', '26.8', 'abc,def', 'NaN,NaN',
      'Infinity,Infinity', '1e5,1e5', '0x1A,0x2B',
    ]) {
      assert.doesNotThrow(() => parseCoordinates(bad as unknown));
      assert.equal(parseCoordinates(bad as unknown), null);
    }
  });
});

describe('validateCoordinates', () => {
  test('an empty value is allowed — coordinates are optional', () => {
    // Blank is how the institute says "we have not verified this", which hides
    // the map rather than pinning it somewhere approximate.
    assert.equal(validateCoordinates(''), null);
    assert.equal(validateCoordinates('   '), null);
  });

  test('a good value passes', () => {
    assert.equal(validateCoordinates('26.849123, 75.805456'), null);
  });

  test('a bad value returns a message a teacher can act on', () => {
    const message = validateCoordinates('somewhere in Jaipur');
    assert.ok(typeof message === 'string' && message.length > 0);
    // It names the shape expected, and leaks no internal vocabulary.
    assert.match(message, /two numbers/i);
    for (const leak of ['regex', 'null', 'parseCoordinates', 'NaN', 'undefined']) {
      assert.ok(!message.includes(leak), `message leaked ${leak}`);
    }
  });
});

describe('the URLs we build', () => {
  test('directions use the coordinates when we have them', () => {
    const url = directionsUrl('Pratap Nagar, Jaipur', JAIPUR);
    assert.ok(url.startsWith('https://www.google.com/maps/dir/?api=1&destination='));
    assert.ok(url.includes('26.849123%2C75.805456'));
  });

  test('and fall back to the address when we do not', () => {
    const url = directionsUrl('Near Pannadhay Circle, Pratap Nagar, Jaipur', null);
    assert.ok(url.startsWith('https://www.google.com/maps/dir/?api=1&destination='));
    assert.ok(url.includes('Pannadhay'));
  });

  test('the address is encoded, so nothing in it can escape the query', () => {
    const url = directionsUrl('A&B "quoted" <script> #hash ?q=1', null);
    for (const raw of ['<script>', '"', '#hash', '&B']) {
      assert.ok(!url.includes(raw), `unencoded ${raw} reached the URL`);
    }
    // And the whole thing still parses as one URL with one query parameter.
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'www.google.com');
    assert.equal(parsed.searchParams.get('api'), '1');
  });

  test('every generated URL is https on exactly www.google.com', () => {
    for (const url of [
      directionsUrl('anywhere', JAIPUR),
      directionsUrl('anywhere', null),
      mapEmbedUrl(JAIPUR),
      mapViewUrl(JAIPUR),
    ]) {
      const parsed = new URL(url);
      assert.equal(parsed.protocol, 'https:');
      assert.equal(parsed.hostname, 'www.google.com');
    }
  });

  test('the embed is the keyless form and carries no API key', () => {
    const url = mapEmbedUrl(JAIPUR);
    assert.ok(url.includes('output=embed'));
    assert.ok(!/[?&]key=/.test(url), 'an API key reached the embed URL');
    // maps.google.com would have needed a new CSP origin; www.google.com does not.
    assert.ok(!url.includes('maps.google.com'));
  });

  test('the embed takes coordinates only — there is no address-based pin', () => {
    // A pin at an unverified address is a claim we cannot support, so the
    // signature makes that state unrepresentable rather than merely unused.
    assert.equal(typeof mapEmbedUrl, 'function');
    assert.equal(mapEmbedUrl.length, 1);
  });
});
