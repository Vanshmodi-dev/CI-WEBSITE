/**
 * The storage monitor's honesty rules.
 *
 * =============================================================================
 * WHAT THIS SUITE IS ACTUALLY DEFENDING
 * =============================================================================
 * The storage screen exists to be trusted. Its failure mode is not a crash —
 * it is a plausible-looking number that nobody can source. So the assertions
 * below are mostly about what must NOT happen:
 *
 *   - no `NaN`, `Infinity`, `undefined` or `null` reaching a rendered string
 *   - no percentage invented from a missing or zero limit
 *   - no zero substituted for "we do not know"
 *   - no credit figure quietly reused as a byte figure
 *
 * Only the pure half is testable here, and that is by design: `usage-format.ts`
 * carries no `server-only` guard precisely so the parsing and formatting can be
 * checked with no Cloudinary account and no database. The halves that DO touch
 * the network and the database (`cloudinary-usage.ts`, `storage-usage.ts`) are
 * `server-only` and are exercised by `npm run verify:storage` and the admin
 * end-to-end run instead.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatBytes,
  formatCount,
  formatPercent,
  percentOf,
  finiteOrNull,
  nonNegativeOrNull,
  parseProviderUsage,
  usageStatus,
  STATUS_LABELS,
  NOT_AVAILABLE,
} from '../src/lib/media/usage-format.ts';

/** Everything a person could see. If a bad value escapes, it escapes as one of these. */
const RENDERED = (v: string) => v;
const FORBIDDEN = ['NaN', 'Infinity', '-Infinity', 'undefined', 'null'];

describe('formatBytes — the numbers a teacher reads', () => {
  test('an empty library is 0 B, NOT "Not available"', () => {
    // Zero is a real answer. Reporting it as unknown would tell someone with no
    // photographs that something had broken.
    assert.equal(formatBytes(0), '0 B');
  });

  test('very small files stay in bytes', () => {
    assert.equal(formatBytes(1), '1 B');
    assert.equal(formatBytes(999), '999 B');
    assert.equal(formatBytes(1023), '1023 B');
  });

  test('the 1024 boundary steps up exactly once', () => {
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1536), '1.5 KB');
  });

  test('megabytes and gigabytes', () => {
    assert.equal(formatBytes(1024 * 1024), '1 MB');
    assert.equal(formatBytes(2.4 * 1024 * 1024), '2.4 MB');
    assert.equal(formatBytes(1024 ** 3), '1 GB');
    assert.equal(formatBytes(1.5 * 1024 ** 3), '1.5 GB');
  });

  test('very large values do not overflow the unit list', () => {
    assert.equal(formatBytes(1024 ** 4), '1 TB');
    // Beyond the largest unit it stays in TB rather than reading undefined.
    const huge = formatBytes(1024 ** 6);
    assert.ok(huge.endsWith(' TB'), huge);
    assert.ok(!FORBIDDEN.some((f) => huge.includes(f)), huge);
  });

  test('missing, malformed and impossible values are "Not available"', () => {
    for (const value of [null, undefined, NaN, Infinity, -Infinity, -1, '2048', {}, [], true]) {
      assert.equal(formatBytes(value), NOT_AVAILABLE, `for ${JSON.stringify(value)}`);
    }
  });

  test('no formatted byte value ever contains NaN, Infinity, undefined or null', () => {
    for (const value of [0, 1, 1023, 1024, 1e12, null, undefined, NaN, Infinity, -5, 'x']) {
      const out = RENDERED(formatBytes(value));
      for (const bad of FORBIDDEN) {
        assert.ok(!out.includes(bad), `formatBytes(${String(value)}) produced "${out}"`);
      }
    }
  });
});

describe('formatCount and formatPercent', () => {
  test('zero assets is 0, not "Not available"', () => {
    assert.equal(formatCount(0), '0');
  });

  test('counts are rendered plainly', () => {
    assert.equal(formatCount(17), '17');
  });

  test('unusable counts are "Not available"', () => {
    for (const value of [null, undefined, NaN, Infinity, -1, '17']) {
      assert.equal(formatCount(value), NOT_AVAILABLE);
    }
  });

  test('percentages round to one decimal and never render rubbish', () => {
    assert.equal(formatPercent(0), '0%');
    assert.equal(formatPercent(0.04), '0%');
    assert.equal(formatPercent(12.34), '12.3%');
    assert.equal(formatPercent(100), '100%');
    for (const value of [null, undefined, NaN, Infinity, -1]) {
      assert.equal(formatPercent(value), NOT_AVAILABLE);
    }
  });
});

describe('percentOf — where a fake progress bar would come from', () => {
  test('computes a real percentage', () => {
    assert.equal(percentOf(0.01, 25), 0);
    assert.equal(percentOf(5, 25), 20);
    assert.equal(percentOf(25, 25), 100);
  });

  test('⚠ a ZERO limit is null, never Infinity', () => {
    // used/0 is Infinity, and a bar driven by Infinity renders full red and
    // tells an administrator they are out of space when the limit is unknown.
    assert.equal(percentOf(5, 0), null);
  });

  test('a missing limit or a missing usage is null, never a guess', () => {
    assert.equal(percentOf(5, null), null);
    assert.equal(percentOf(null, 25), null);
    assert.equal(percentOf(undefined, undefined), null);
    assert.equal(percentOf('5', '25'), null);
  });

  test('over-usage is reported honestly rather than clamped', () => {
    // Clamping here would hide a real overage. The BAR clamps its width; the
    // number does not.
    assert.equal(percentOf(30, 25), 120);
  });
});

describe('parseProviderUsage — an untrusted third-party payload', () => {
  /** The shape Cloudinary actually returned for this account, trimmed. */
  const REAL = {
    plan: 'Free',
    last_updated: '2026-09-04',
    transformations: { usage: 14, credits_usage: 0.01 },
    bandwidth: { usage: 0, credits_usage: 0 },
    storage: { usage: 0, credits_usage: 0 },
    credits: { usage: 0.01, limit: 25, used_percent: 0.04 },
    resources: 0,
    rate_limit_allowed: 500,
    rate_limit_reset_at: '2026-09-05T13:00:00.000Z',
    rate_limit_remaining: 499,
  };

  test('reads a successful provider response', () => {
    const u = parseProviderUsage(REAL);
    assert.equal(u.plan, 'Free');
    assert.equal(u.creditsUsed, 0.01);
    assert.equal(u.creditsLimit, 25);
    assert.equal(u.storageBytes, 0);
    assert.equal(u.bandwidthBytes, 0);
    assert.equal(u.resources, 0);
    assert.equal(u.lastUpdated, '2026-09-04');
    assert.equal(u.rateLimitRemaining, 499);
  });

  test('credits percent is RECOMPUTED, not taken from the payload', () => {
    // The payload says 0.04; 0.01/25 is 0.04% too, so they agree here. The
    // point is that the displayed number is derived from the two numbers also
    // displayed, so it can never contradict them.
    const u = parseProviderUsage({ ...REAL, credits: { usage: 5, limit: 25, used_percent: 99 } });
    assert.equal(u.creditsPercent, 20);
  });

  test('a partial response yields nulls, never zeros', () => {
    // ⚠ THE IMPORTANT ONE. A missing field must not become 0, because 0 bytes
    // and "we do not know" are different statements and only one is true.
    const u = parseProviderUsage({ plan: 'Free' });
    assert.equal(u.plan, 'Free');
    assert.equal(u.creditsUsed, null);
    assert.equal(u.creditsLimit, null);
    assert.equal(u.creditsPercent, null);
    assert.equal(u.storageBytes, null);
    assert.equal(u.bandwidthBytes, null);
    assert.equal(u.resources, null);
    assert.equal(u.lastUpdated, null);
  });

  test('never throws, whatever it is handed', () => {
    for (const rubbish of [null, undefined, 0, '', 'a string', [], true, { credits: 'no' }, { storage: 5 }]) {
      assert.doesNotThrow(() => parseProviderUsage(rubbish));
      const u = parseProviderUsage(rubbish);
      assert.equal(u.creditsPercent, null);
    }
  });

  test('string numbers from a changed API are refused, not coerced', () => {
    const u = parseProviderUsage({ ...REAL, credits: { usage: '5', limit: '25' } });
    assert.equal(u.creditsUsed, null);
    assert.equal(u.creditsLimit, null);
    assert.equal(u.creditsPercent, null);
  });

  test('every field of a parsed payload renders without NaN/Infinity/undefined/null', () => {
    for (const payload of [REAL, {}, null, { credits: { usage: NaN, limit: Infinity } }]) {
      const u = parseProviderUsage(payload);
      const rendered = [
        formatBytes(u.storageBytes),
        formatBytes(u.bandwidthBytes),
        formatCount(u.resources),
        formatPercent(u.creditsPercent),
        u.plan ?? NOT_AVAILABLE,
        u.lastUpdated ?? NOT_AVAILABLE,
      ];
      for (const out of rendered) {
        for (const bad of FORBIDDEN) {
          assert.ok(!out.includes(bad), `"${out}" contains ${bad}`);
        }
      }
    }
  });

  test('the parsed shape carries no credential field at all', () => {
    // What crosses to the browser is this object. It must not be able to carry
    // a cloud name, an API key or a secret even if the payload offered them.
    const u = parseProviderUsage({
      ...REAL,
      api_key: 'zz-key',
      api_secret: 'zz-secret',
      cloud_name: 'zz-cloud',
    });
    const serialised = JSON.stringify(u);
    for (const leak of ['zz-key', 'zz-secret', 'zz-cloud', 'api_secret', 'api_key']) {
      assert.ok(!serialised.includes(leak), `parsed usage leaked ${leak}: ${serialised}`);
    }
  });
});

describe('usageStatus — about credits, and only credits', () => {
  test('maps a known percentage onto a status', () => {
    assert.equal(usageStatus(0), 'healthy');
    assert.equal(usageStatus(74.9), 'healthy');
    assert.equal(usageStatus(75), 'watch');
    assert.equal(usageStatus(89.9), 'watch');
    assert.equal(usageStatus(90), 'critical');
    assert.equal(usageStatus(150), 'critical');
  });

  test('⚠ an unknown percentage is "unknown", NOT "healthy"', () => {
    // Defaulting to healthy would show a green tick for an account nobody has
    // measured, which is the single most misleading thing this page could do.
    assert.equal(usageStatus(null), 'unknown');
    assert.equal(STATUS_LABELS.unknown, 'Unknown');
  });

  test('every status has a human label that is not the enum value', () => {
    for (const [key, label] of Object.entries(STATUS_LABELS)) {
      assert.ok(label.length > 0);
      assert.notEqual(label, key);
    }
  });
});

describe('the numeric guards themselves', () => {
  test('finiteOrNull rejects the three values that break a render', () => {
    assert.equal(finiteOrNull(NaN), null);
    assert.equal(finiteOrNull(Infinity), null);
    assert.equal(finiteOrNull(-Infinity), null);
    assert.equal(finiteOrNull(0), 0);
    assert.equal(finiteOrNull(-3), -3);
  });

  test('nonNegativeOrNull additionally rejects negatives', () => {
    // A negative byte count or credit total means the source is wrong; showing
    // it would propagate that rather than report it.
    assert.equal(nonNegativeOrNull(-1), null);
    assert.equal(nonNegativeOrNull(0), 0);
    assert.equal(nonNegativeOrNull(7), 7);
  });
});
