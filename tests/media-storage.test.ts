/**
 * The media storage configuration gate.
 *
 * This is the decision that keeps a half-configured deployment from writing
 * student photographs to a filesystem it is about to throw away. Topic 5
 * refused to ship a production adapter precisely because that failure is
 * silent: uploads succeed, photographs display, and everything vanishes at the
 * next deploy.
 *
 * So the interesting cases here are not "does a correct configuration work".
 * They are the ones where a configuration is ALMOST right.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  readS3Config,
  S3_ENV_VARS,
  type S3ConfigVerdict,
} from '../src/lib/media/s3-config.ts';

const COMPLETE = {
  MEDIA_S3_ENDPOINT: 'https://abc123.r2.cloudflarestorage.com',
  MEDIA_S3_BUCKET: 'ci-media',
  MEDIA_S3_ACCESS_KEY_ID: 'AKIAEXAMPLE',
  MEDIA_S3_SECRET_ACCESS_KEY: 'secret-value-not-real',
};

const state = (v: S3ConfigVerdict) => v.state;

describe('readS3Config — nothing set', () => {
  test('an empty environment is ABSENT, not an error', () => {
    // A developer's machine. Local disk is the correct store there.
    assert.equal(state(readS3Config({})), 'absent');
  });

  test('variables present but blank count as unset', () => {
    const blank = Object.fromEntries(S3_ENV_VARS.map((n) => [n, '   ']));
    assert.equal(state(readS3Config(blank)), 'absent');
  });
});

describe('readS3Config — half configured is the dangerous one', () => {
  /**
   * ⚠ THE CASE THIS WHOLE FILE EXISTS FOR.
   *
   * Three of four secrets is somebody part-way through configuring a
   * deployment. Treating it as "absent" would fall back to local disk, which on
   * an ephemeral host loses every photograph at the next deploy — quietly, and
   * with a green upload confirmation on screen.
   */
  for (const omitted of S3_ENV_VARS) {
    test(`omitting ${omitted} is PARTIAL, never absent`, () => {
      const env: Record<string, string | undefined> = { ...COMPLETE };
      delete env[omitted];
      const verdict = readS3Config(env);
      assert.equal(verdict.state, 'partial');
      assert.ok(
        verdict.state === 'partial' && verdict.missing.includes(omitted),
        'the verdict must name what is missing, so the message can be acted on',
      );
    });
  }

  test('a single stray variable is PARTIAL, not absent', () => {
    assert.equal(state(readS3Config({ MEDIA_S3_BUCKET: 'ci-media' })), 'partial');
  });
});

describe('readS3Config — malformed configuration', () => {
  test('a non-https endpoint is refused', () => {
    const verdict = readS3Config({ ...COMPLETE, MEDIA_S3_ENDPOINT: 'http://example.com' });
    assert.equal(verdict.state, 'invalid');
  });

  test('a nonsense endpoint is refused without throwing', () => {
    assert.equal(state(readS3Config({ ...COMPLETE, MEDIA_S3_ENDPOINT: 'not a url' })), 'invalid');
  });

  /**
   * The commonest real mistake: pasting the bucket's URL out of a dashboard
   * instead of the service endpoint. It produces requests to
   * `/bucket/bucket/key`, which come back as 404s and look like missing
   * objects rather than like misconfiguration.
   */
  test('an endpoint carrying a path is refused', () => {
    for (const endpoint of [
      'https://abc123.r2.cloudflarestorage.com/ci-media',
      'https://abc123.r2.cloudflarestorage.com/some/path',
    ]) {
      const verdict = readS3Config({ ...COMPLETE, MEDIA_S3_ENDPOINT: endpoint });
      assert.equal(verdict.state, 'invalid', `${endpoint} should be refused`);
    }
  });

  test('a trailing slash is fine — that is not a path', () => {
    const verdict = readS3Config({
      ...COMPLETE,
      MEDIA_S3_ENDPOINT: 'https://abc123.r2.cloudflarestorage.com/',
    });
    assert.equal(verdict.state, 'ready');
  });

  test('an implausible bucket name is refused', () => {
    for (const bucket of ['UPPERCASE', 'has space', 'a', '-leading', 'trailing-', 'sl/ash']) {
      const verdict = readS3Config({ ...COMPLETE, MEDIA_S3_BUCKET: bucket });
      assert.equal(verdict.state, 'invalid', `${bucket} should be refused`);
    }
  });
});

describe('readS3Config — a complete configuration', () => {
  test('is READY, and carries exactly what signing needs', () => {
    const verdict = readS3Config(COMPLETE);
    assert.equal(verdict.state, 'ready');
    if (verdict.state !== 'ready') return;

    assert.equal(verdict.config.endpoint, 'https://abc123.r2.cloudflarestorage.com');
    assert.equal(verdict.config.bucket, 'ci-media');
    assert.equal(verdict.config.accessKeyId, 'AKIAEXAMPLE');
  });

  test('the region defaults to "auto", which is what R2 wants', () => {
    const verdict = readS3Config(COMPLETE);
    assert.ok(verdict.state === 'ready' && verdict.config.region === 'auto');
  });

  test('an explicit region wins, for a real AWS bucket', () => {
    const verdict = readS3Config({ ...COMPLETE, MEDIA_S3_REGION: 'ap-south-1' });
    assert.ok(verdict.state === 'ready' && verdict.config.region === 'ap-south-1');
  });

  test('surrounding whitespace is tolerated — it is a copy-paste artefact', () => {
    const padded = Object.fromEntries(
      Object.entries(COMPLETE).map(([k, v]) => [k, `  ${v}  `]),
    );
    assert.equal(state(readS3Config(padded)), 'ready');
  });
});

describe('the verdict never leaks the secret', () => {
  /**
   * A verdict is rendered into pre-flight output and into an administrator's
   * error message. The secret must not travel with it, so the failing shapes
   * are checked for it explicitly rather than assumed clean.
   */
  test('no rejection message contains the secret', () => {
    const secret = 'super-secret-do-not-print';
    const cases: Record<string, string | undefined>[] = [
      { ...COMPLETE, MEDIA_S3_SECRET_ACCESS_KEY: secret, MEDIA_S3_ENDPOINT: 'http://x.com' },
      { ...COMPLETE, MEDIA_S3_SECRET_ACCESS_KEY: secret, MEDIA_S3_BUCKET: 'BAD NAME' },
      { MEDIA_S3_SECRET_ACCESS_KEY: secret },
    ];
    for (const env of cases) {
      const verdict = readS3Config(env);
      assert.ok(!JSON.stringify(verdict).includes(secret), 'a verdict carried the secret');
    }
  });
});
