import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isSameOrigin, rejectCrossOrigin } from '../src/lib/request-guard.ts';
import { isValidRecordId, isSafePhotoPath } from '../src/lib/validation.ts';
import { RETENTION, cutoff, DAY_MS } from '../src/lib/retention-policy.ts';
import { MAX_PASSWORD_LENGTH, MAX_EMAIL_LENGTH } from '../src/lib/password.ts';

/**
 * Phase 10 regression tests.
 *
 * Every vulnerability the phase found gets a test that would fail if the fix
 * were reverted. The ones that need a running server live in
 * scripts/verify-security.mjs, which attacks a production build over HTTP;
 * these cover the pure logic underneath, where a unit test is sharper than an
 * end-to-end one.
 */

function request(headers: Record<string, string>, url = 'https://ci.example/admin/logout') {
  return new Request(url, { method: 'POST', headers });
}

describe('same-origin guard for Route Handlers', () => {
  // The vulnerability: a cross-origin POST to /admin/logout returned 303 and
  // cleared the admin's session. Next gives Server Actions an Origin/Host
  // check automatically; Route Handlers get nothing.

  test('accepts a matching Origin and Host', () => {
    assert.equal(
      isSameOrigin(request({ origin: 'https://ci.example', host: 'ci.example' })),
      true,
    );
  });

  test('rejects a foreign Origin', () => {
    assert.equal(
      isSameOrigin(request({ origin: 'https://evil.example', host: 'ci.example' })),
      false,
    );
  });

  test('rejects an Origin that merely starts with the host', () => {
    // https://ci.example.evil.test is a different site, however it reads.
    assert.equal(
      isSameOrigin(request({ origin: 'https://ci.example.evil.test', host: 'ci.example' })),
      false,
    );
  });

  test('rejects an Origin that merely ends with the host', () => {
    assert.equal(
      isSameOrigin(request({ origin: 'https://evilci.example', host: 'ci.example' })),
      false,
    );
  });

  test('compares the port too', () => {
    assert.equal(
      isSameOrigin(request({ origin: 'https://ci.example:8443', host: 'ci.example' })),
      false,
    );
  });

  test('honours X-Forwarded-Host, because a platform proxy rewrites Host', () => {
    assert.equal(
      isSameOrigin(
        request({
          origin: 'https://ci.example',
          host: 'internal-1.vercel.internal',
          'x-forwarded-host': 'ci.example',
        }),
      ),
      true,
    );
  });

  test('rejects an unparseable Origin instead of throwing', () => {
    assert.equal(isSameOrigin(request({ origin: 'not a url', host: 'ci.example' })), false);
    assert.equal(isSameOrigin(request({ origin: '://', host: 'ci.example' })), false);
  });

  test('rejects the null Origin a sandboxed frame sends', () => {
    assert.equal(isSameOrigin(request({ origin: 'null', host: 'ci.example' })), false);
  });

  test('fails CLOSED when neither Origin nor Referer is present', () => {
    // A mutation with neither is a non-browser client. Refusing is the correct
    // default for a state change.
    assert.equal(isSameOrigin(request({ host: 'ci.example' })), false);
  });

  test('falls back to a same-origin Referer when Origin is absent', () => {
    // Very old browsers send Referer but not Origin. Without this they cannot
    // sign out at all, and a security fix that breaks logout gets reverted.
    assert.equal(
      isSameOrigin(request({ host: 'ci.example', referer: 'https://ci.example/admin' })),
      true,
    );
  });

  test('a foreign Referer does not stand in for a same-origin one', () => {
    assert.equal(
      isSameOrigin(request({ host: 'ci.example', referer: 'https://evil.example/page' })),
      false,
    );
  });

  test('Origin wins when both are present, so a spoofed Referer cannot help', () => {
    assert.equal(
      isSameOrigin(
        request({
          host: 'ci.example',
          origin: 'https://evil.example',
          referer: 'https://ci.example/admin',
        }),
      ),
      false,
    );
  });

  test('an unparseable Referer is not treated as same-origin', () => {
    assert.equal(isSameOrigin(request({ host: 'ci.example', referer: '/admin' })), false);
  });

  test('an absent Origin can be allowed only by asking explicitly', () => {
    assert.equal(
      isSameOrigin(request({ host: 'ci.example' }), { onMissingOrigin: 'allow' }),
      true,
    );
  });

  test('rejects when there is no Host to compare against', () => {
    assert.equal(isSameOrigin(request({ origin: 'https://ci.example' })), false);
  });

  test('rejectCrossOrigin returns 403 with nothing useful in it', async () => {
    const refused = rejectCrossOrigin(request({ origin: 'https://evil.example', host: 'ci.example' }));
    assert.ok(refused);
    assert.equal(refused.status, 403);
    assert.equal(refused.headers.get('Cache-Control'), 'no-store');
    const body = await refused.text();
    assert.ok(!/origin|host|expected/i.test(body), 'must not explain how to pass the check');
  });

  test('rejectCrossOrigin lets a same-origin request through', () => {
    assert.equal(
      rejectCrossOrigin(request({ origin: 'https://ci.example', host: 'ci.example' })),
      null,
    );
  });
});

describe('record id validation', () => {
  // Prisma parameterises, so an unvalidated id was never injectable. What it
  // was is unbounded attacker input handed to the database.

  test('accepts the identifier shape this schema issues', () => {
    assert.equal(isValidRecordId('clx0abc123def456ghi789jkl'), true);
    assert.equal(isValidRecordId('a1b2c3d4'), true);
  });

  test('rejects SQL-shaped input', () => {
    for (const hostile of ["' OR 1=1 --", '1 OR 1=1', "'; DROP TABLE toppers; --"]) {
      assert.equal(isValidRecordId(hostile), false, hostile);
    }
  });

  test('rejects traversal and separators', () => {
    for (const hostile of ['../../etc/passwd', '%2e%2e%2f', 'a/b', 'a.b', 'a b']) {
      assert.equal(isValidRecordId(hostile), false, hostile);
    }
  });

  test('rejects an unbounded string', () => {
    assert.equal(isValidRecordId('x'.repeat(5000)), false);
  });

  test('rejects a value that is too short to be one of ours', () => {
    assert.equal(isValidRecordId('abc'), false);
  });

  test('rejects non-strings without throwing', () => {
    for (const hostile of [null, undefined, 42, {}, [], { $ne: null }]) {
      assert.equal(isValidRecordId(hostile), false);
    }
  });

  test('rejects the empty string, so an absent id never selects a row', () => {
    assert.equal(isValidRecordId(''), false);
  });
});

describe('photo path safety', () => {
  // Re-asserted here alongside the other Phase 10 boundaries; the admin-facing
  // rules themselves are covered in tests/validation.test.ts.

  test('rejects every traversal and remote-fetch shape', () => {
    for (const hostile of [
      '../../etc/passwd',
      '/../../etc/passwd',
      '..\\..\\windows\\system32',
      '%2e%2e%2fetc%2fpasswd',
      '%252e%252e%252fetc',
      '//evil.example/x.jpg',
      'https://evil.example/x.jpg',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      '\\\\evil.example\\share\\x.jpg',
      '/photos/x.jpg?../../etc/passwd',
      '/photos/x.php',
      '/photos/x.jpg.exe',
    ]) {
      assert.equal(isSafePhotoPath(hostile), false, hostile);
    }
  });

  test('accepts an ordinary site-relative image', () => {
    assert.equal(isSafePhotoPath('/photos/zz-test.jpg'), true);
  });
});

describe('credential input bounds', () => {
  // An unauthenticated endpoint accepting an unbounded string is work an
  // attacker can buy for free — NFKC normalisation and scrypt both scale with
  // what they are handed.

  test('the password ceiling is far above any real passphrase', () => {
    assert.ok(MAX_PASSWORD_LENGTH >= 128, 'must not frustrate a passphrase user');
    assert.ok(MAX_PASSWORD_LENGTH <= 1024, 'must still be a bound');
  });

  test('the email ceiling matches the practical maximum address length', () => {
    assert.equal(MAX_EMAIL_LENGTH, 254);
  });
});

describe('retention policy', () => {
  test('ipHash outlives its operational use but not by much', () => {
    // The longest window it supports is 24 hours. Anything past that is kept
    // only so a burst of abuse can still be investigated after a weekend.
    assert.ok(RETENTION.ipHashDays >= 2, 'must survive a weekend');
    assert.ok(RETENTION.ipHashDays <= 90, 'must not become a permanent identifier');
  });

  test('audit entries outlive a student', () => {
    assert.ok(RETENTION.auditDays >= 365 * 2);
  });

  test('the suggested enquiry period is longer than the ipHash period', () => {
    // The lead is a business record; the identifier attached to it is not.
    assert.ok(RETENTION.suggestedEnquiryDays > RETENTION.ipHashDays);
  });

  test('cutoff computes the instant a window opened', () => {
    const now = 1_800_000_000_000;
    assert.equal(cutoff(1, now).getTime(), now - DAY_MS);
    assert.equal(cutoff(30, now).getTime(), now - 30 * DAY_MS);
  });
});
