/**
 * AWS Signature Version 4.
 *
 * =============================================================================
 * WHY THIS IS TESTED AGAINST A PUBLISHED VECTOR AND NOT AGAINST ITSELF
 * =============================================================================
 * A wrong signature does not look like a bug. It comes back from the provider
 * as `403 SignatureDoesNotMatch`, whose obvious reading is "the credentials are
 * wrong" — so the natural response is to re-issue keys, re-paste secrets and
 * lose an afternoon before suspecting the code.
 *
 * A mock server that recomputes the signature with the same code would agree
 * with any implementation, including a wrong one. So the derivation is checked
 * against the worked example in AWS's own Signature Version 4 documentation,
 * which is an external fact this project cannot accidentally satisfy.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveSigningKey,
  signRequest,
  sha256Hex,
  encodeSegment,
  amzDates,
} from '../src/lib/media/sigv4.ts';

describe('the signing key derivation matches AWS’s published example', () => {
  /**
   * From the "Deriving the signing key" worked example in the AWS Signature
   * Version 4 documentation:
   *
   *   secret  wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY
   *   date    20150830
   *   region  us-east-1
   *   service iam
   *
   * The published result is this exact 32-byte key.
   */
  test('the four-step HMAC chain produces the documented key', () => {
    const key = deriveSigningKey(
      'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      '20150830',
      'us-east-1',
      'iam',
    );
    assert.equal(
      key.toString('hex'),
      'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9',
    );
  });

  test('a different date, region or service gives a different key', () => {
    const base = deriveSigningKey('secret', '20150830', 'us-east-1', 'iam').toString('hex');
    assert.notEqual(deriveSigningKey('secret', '20150831', 'us-east-1', 'iam').toString('hex'), base);
    assert.notEqual(deriveSigningKey('secret', '20150830', 'us-west-2', 'iam').toString('hex'), base);
    assert.notEqual(deriveSigningKey('secret', '20150830', 'us-east-1', 's3').toString('hex'), base);
    assert.notEqual(deriveSigningKey('other', '20150830', 'us-east-1', 'iam').toString('hex'), base);
  });
});

describe('sha256Hex', () => {
  test('the empty payload hash is the documented constant', () => {
    // SigV4 uses this value constantly, for every GET, HEAD and DELETE.
    assert.equal(
      sha256Hex(new Uint8Array(0)),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('signRequest', () => {
  const INPUT = {
    method: 'GET' as const,
    canonicalUri: '/ci-media/abc.jpg',
    canonicalQuery: '',
    host: 'example.r2.cloudflarestorage.com',
    payloadHash: sha256Hex(new Uint8Array(0)),
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'auto',
    service: 's3',
    now: new Date('2026-08-28T05:15:00.000Z'),
  };

  test('produces the three headers a signed request needs', () => {
    const headers = signRequest(INPUT);
    assert.ok(headers.Authorization.startsWith('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/'));
    assert.equal(headers['x-amz-date'], '20260828T051500Z');
    assert.equal(headers['x-amz-content-sha256'], INPUT.payloadHash);
  });

  test('the credential scope names the date, region and service', () => {
    const headers = signRequest(INPUT);
    assert.match(headers.Authorization, /Credential=AKIDEXAMPLE\/20260828\/auto\/s3\/aws4_request/);
  });

  /**
   * Only these three are signed, on purpose: a gateway that adds or normalises
   * `Content-Type` in transit would otherwise invalidate the signature.
   */
  test('exactly host, x-amz-content-sha256 and x-amz-date are signed', () => {
    assert.match(
      signRequest(INPUT).Authorization,
      /SignedHeaders=host;x-amz-content-sha256;x-amz-date,/,
    );
  });

  test('the same input always signs identically', () => {
    assert.equal(signRequest(INPUT).Authorization, signRequest(INPUT).Authorization);
  });

  /** Each of these must change the signature, or something is not being covered. */
  test('the signature covers the method, path, query, host and payload', () => {
    const base = signRequest(INPUT).Authorization;
    const changed = [
      { ...INPUT, method: 'DELETE' as const },
      { ...INPUT, canonicalUri: '/ci-media/other.jpg' },
      { ...INPUT, canonicalQuery: 'list-type=2' },
      { ...INPUT, host: 'elsewhere.example.com' },
      { ...INPUT, payloadHash: sha256Hex('different') },
      { ...INPUT, secretAccessKey: 'a-different-secret' },
      { ...INPUT, now: new Date('2026-08-29T05:15:00.000Z') },
    ];
    for (const input of changed) {
      assert.notEqual(signRequest(input).Authorization, base);
    }
  });

  test('the secret never appears in the headers', () => {
    const headers = signRequest(INPUT);
    assert.ok(!JSON.stringify(headers).includes(INPUT.secretAccessKey));
  });
});

describe('encodeSegment', () => {
  test('leaves an ordinary media key untouched', () => {
    const key = 'a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg';
    assert.equal(encodeSegment(key), key);
  });

  test('encodes the characters encodeURIComponent misses', () => {
    for (const c of ["!", "'", '(', ')', '*']) {
      assert.notEqual(encodeSegment(c), c, `${c} must be percent-encoded`);
    }
  });

  test('encodes a separator, so no key can escape its path', () => {
    assert.equal(encodeSegment('a/b'), 'a%2Fb');
  });
});

describe('amzDates', () => {
  test('formats both forms SigV4 requires', () => {
    const { amzDate, dateStamp } = amzDates(new Date('2026-01-02T03:04:05.678Z'));
    assert.equal(amzDate, '20260102T030405Z');
    assert.equal(dateStamp, '20260102');
  });
});
