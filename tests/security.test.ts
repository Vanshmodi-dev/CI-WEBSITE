import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isSameOrigin, rejectCrossOrigin } from '../src/lib/request-guard.ts';
import { publicCsp, adminCsp, DEV_ONLY_SCRIPT_SRC } from '../src/lib/csp.ts';
import { isValidRecordId, isSafePhotoPath } from '../src/lib/validation.ts';
import { RETENTION, cutoff, DAY_MS } from '../src/lib/retention-policy.ts';
import { MAX_PASSWORD_LENGTH, MAX_EMAIL_LENGTH } from '../src/lib/password.ts';
import {
  peekBurst,
  recordBurstHit,
  checkBurst,
  resetBurstState,
  LIMITS,
} from '../src/lib/burst-limit.ts';

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

describe('burst limiter — checking is not the same as charging', () => {
  // Phase 11 found the sign-in form charging a slot for every attempt,
  // successful ones included. A teacher entering the CORRECT password four
  // times inside a minute was told "Too many attempts" and locked out of their
  // own admin panel for sixty seconds.

  test('peeking does not consume the budget', () => {
    resetBurstState();
    const key = 'zztest-peek';
    for (let i = 0; i < 50; i += 1) {
      assert.equal(peekBurst(key).allowed, true, `peek ${i} should still be allowed`);
    }
  });

  test('recording does consume the budget', () => {
    resetBurstState();
    const key = 'zztest-record';
    for (let i = 0; i < LIMITS.burst.max; i += 1) recordBurstHit(key);
    assert.equal(peekBurst(key).allowed, false, 'the budget should be spent');
  });

  test('an unlimited run of successes is never throttled', () => {
    // This is the sign-in shape: peek before, and charge nothing when the
    // password was right.
    resetBurstState();
    const key = 'zztest-successes';
    for (let i = 0; i < 25; i += 1) {
      assert.equal(peekBurst(key).allowed, true, `correct sign-in ${i + 1} must be allowed`);
      // nothing recorded — the attempt succeeded
    }
  });

  test('a run of failures is throttled at the limit', () => {
    resetBurstState();
    const key = 'zztest-failures';
    let allowedCount = 0;
    for (let i = 0; i < 10; i += 1) {
      if (peekBurst(key).allowed) {
        allowedCount += 1;
        recordBurstHit(key); // the attempt failed
      }
    }
    assert.equal(
      allowedCount,
      LIMITS.burst.max,
      'exactly the configured number of guesses should get through',
    );
  });

  test('successes interleaved with failures still only charge the failures', () => {
    resetBurstState();
    const key = 'zztest-mixed';
    // two failures, then any number of successes
    for (const failed of [true, true, false, false, false, false, false, false]) {
      assert.equal(peekBurst(key).allowed, true, 'should not be throttled yet');
      if (failed) recordBurstHit(key);
    }
    // one more failure reaches the limit
    recordBurstHit(key);
    assert.equal(peekBurst(key).allowed, false);
  });

  test('the window expires, so a throttle is never permanent', () => {
    resetBurstState();
    const key = 'zztest-window';
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < LIMITS.burst.max; i += 1) recordBurstHit(key, t0);
    assert.equal(peekBurst(key, t0).allowed, false);
    assert.equal(
      peekBurst(key, t0 + LIMITS.burst.windowMs + 1).allowed,
      true,
      'the limit must lift once the window passes',
    );
  });

  test('checkBurst still charges every call, for the enquiry form', () => {
    // The enquiry pipeline is the case where every call IS the event, so the
    // combined check-and-charge helper must keep that behaviour.
    resetBurstState();
    const key = 'zztest-enquiry';
    let allowed = 0;
    for (let i = 0; i < 10; i += 1) if (checkBurst(key).allowed) allowed += 1;
    assert.equal(allowed, LIMITS.burst.max);
  });

  test('one key being throttled does not throttle another', () => {
    resetBurstState();
    for (let i = 0; i < LIMITS.burst.max; i += 1) recordBurstHit('zztest-a');
    assert.equal(peekBurst('zztest-a').allowed, false);
    assert.equal(peekBurst('zztest-b').allowed, true);
  });
});

describe("the dev-only 'unsafe-eval' exception cannot reach production", () => {
  /**
   * Phase 22. React's development build probes `eval()` while reading the RSC
   * payload and logs a console error on every page when the CSP forbids it, so
   * `src/lib/csp.ts` adds `'unsafe-eval'` for the dev server. These tests are
   * the guard rail on that: the production form of both policies must not
   * contain the token, and the dev form must differ by that token ALONE.
   *
   * The second half matters more than the first. It is easy to keep
   * `'unsafe-eval'` out of production and still let the two policies drift in
   * some other direction, and a dev server that runs a materially different
   * policy from production is a dev server that cannot find CSP bugs.
   */

  const nonce = 'ZZTESTnonce0123456789ab==';

  test('the public production baseline has no unsafe-eval', () => {
    assert.equal(publicCsp({ dev: false }).includes('unsafe-eval'), false);
  });

  test('the admin production policy has no unsafe-eval', () => {
    assert.equal(adminCsp(nonce, { dev: false }).includes('unsafe-eval'), false);
  });

  test('the dev forms do add it, so the exception actually works', () => {
    assert.equal(publicCsp({ dev: true }).includes(DEV_ONLY_SCRIPT_SRC), true);
    assert.equal(adminCsp(nonce, { dev: true }).includes(DEV_ONLY_SCRIPT_SRC), true);
  });

  test('dev differs from production by that one token and nothing else', () => {
    for (const [name, prod, dev] of [
      ['public', publicCsp({ dev: false }), publicCsp({ dev: true })],
      ['admin', adminCsp(nonce, { dev: false }), adminCsp(nonce, { dev: true })],
    ] as const) {
      assert.equal(
        dev.replace(` ${DEV_ONLY_SCRIPT_SRC}`, ''),
        prod,
        `the ${name} dev policy must be the production one plus ${DEV_ONLY_SCRIPT_SRC}`,
      );
    }
  });

  test('the relaxation lands in script-src and touches no other directive', () => {
    // A token in the wrong directive would be a different, quieter mistake:
    // `default-src` would hand it to every fetch destination at once.
    const directives = adminCsp(nonce, { dev: true }).split('; ');
    const carrying = directives.filter((d) => d.includes('unsafe-eval'));
    assert.deepEqual(
      carrying.map((d) => d.split(' ')[0]),
      ['script-src'],
    );
  });

  test("the admin keeps its nonce and strict-dynamic in dev", () => {
    // 'strict-dynamic' makes a browser ignore 'self' and 'unsafe-inline' but
    // NOT 'unsafe-eval'. If the dev exception had cost the nonce policy, the
    // admin would be running a weaker shape than production while being
    // reviewed, which is the thing this whole change exists to avoid.
    const dev = adminCsp(nonce, { dev: true });
    assert.equal(dev.includes(`'nonce-${nonce}'`), true);
    assert.equal(dev.includes("'strict-dynamic'"), true);
  });

  test('both policies keep the directives the security suite asserts on', () => {
    for (const policy of [publicCsp({ dev: false }), adminCsp(nonce, { dev: false })]) {
      for (const directive of [
        'default-src',
        'script-src',
        'style-src',
        'img-src',
        'font-src',
        'connect-src',
        'frame-src',
        'object-src',
        'base-uri',
        'form-action',
        'frame-ancestors',
      ]) {
        assert.equal(policy.includes(directive), true, `${directive} is missing`);
      }
      assert.equal(policy.includes("object-src 'none'"), true);
      assert.equal(policy.includes("frame-ancestors 'none'"), true);
      assert.equal(policy.includes("base-uri 'self'"), true);
      assert.equal(policy.includes("form-action 'self'"), true);
    }
  });
});
