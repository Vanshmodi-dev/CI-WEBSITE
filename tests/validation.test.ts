import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateEnquiry,
  normalisePhone,
  isPlausibleEmail,
  clean,
  cleanMultiline,
  sanitiseSourcePage,
  isSafePhotoPath,
  LIMITS,
} from '../src/lib/validation.ts';

const COURSES = ['class-11-commerce', 'class-12-commerce', 'ca-foundation'];

/** A submission that should always pass, so each test varies one thing. */
function valid(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Sample Testcase',
    phone: '9509017150',
    classLevel: 'CLASS_12',
    consent: 'on',
    sourcePage: '/admissions',
    ...overrides,
  };
}

describe('normalisePhone', () => {
  test('accepts the formats people actually type', () => {
    const expected = '919509017150';
    for (const input of [
      '9509017150',
      '09509017150',
      '+91 95090 17150',
      '91-9509017150',
      '+919509017150',
      '  9509017150  ',
      '(950) 901-7150',
    ]) {
      assert.equal(normalisePhone(input), expected, `failed for ${input}`);
    }
  });

  test('rejects numbers we cannot call back', () => {
    for (const input of [
      '',
      '123',
      '1234567890', // Indian mobiles start 6-9
      '5509017150',
      '95090171501234',
      'abcdefghij',
      '00000000000',
    ]) {
      assert.equal(normalisePhone(input), null, `should reject ${input}`);
    }
  });
});

describe('isPlausibleEmail', () => {
  test('accepts ordinary addresses', () => {
    for (const e of ['a@b.co', 'sample.testcase@example.com', 'x+tag@sub.example.in']) {
      assert.equal(isPlausibleEmail(e), true, `should accept ${e}`);
    }
  });

  test('rejects malformed addresses', () => {
    for (const e of [
      'no-at-sign',
      '@example.com',
      'two@@example.com',
      'a@b',
      'a@.com',
      'a@b..com',
      'has space@example.com',
      `${'x'.repeat(200)}@example.com`,
    ]) {
      assert.equal(isPlausibleEmail(e), false, `should reject ${e}`);
    }
  });
});

describe('sanitisers', () => {
  test('clean strips control characters and collapses whitespace', () => {
    assert.equal(clean('  Sample   Testcase  '), 'Sample Testcase');
    assert.equal(clean('Sample\u0000Testcase'), 'Sample Testcase');
    assert.equal(clean('line\nbreak'), 'line break');
    assert.equal(clean('bell\u0007here'), 'bell here');
    assert.equal(clean(undefined), '');
    assert.equal(clean(42), '');
  });

  test('cleanMultiline keeps newlines but drops other controls', () => {
    assert.equal(cleanMultiline('a\nb'), 'a\nb');
    assert.equal(cleanMultiline('a\r\nb'), 'a\nb');
    assert.equal(cleanMultiline('a\u0000b'), 'a b');
    assert.equal(cleanMultiline('a\n\n\n\n\nb'), 'a\n\nb');
  });

  test('sourcePage keeps site paths and rejects everything else', () => {
    assert.equal(sanitiseSourcePage('/courses/ca-foundation'), '/courses/ca-foundation');
    assert.equal(sanitiseSourcePage('/admissions?utm=x'), '/admissions');
    assert.equal(sanitiseSourcePage('/admissions#form'), '/admissions');

    // Absolute URLs, traversal and protocol-relative URLs all fall back to "/"
    assert.equal(sanitiseSourcePage('https://evil.example.com/x'), '/');
    assert.equal(sanitiseSourcePage('//evil.example.com'), '/');
    assert.equal(sanitiseSourcePage('/../../etc/passwd'), '/');
    assert.equal(sanitiseSourcePage('javascript:alert(1)'), '/');
    assert.equal(sanitiseSourcePage(''), '/');
    assert.equal(sanitiseSourcePage(null), '/');
  });
});

describe('validateEnquiry — happy path', () => {
  test('accepts a well-formed submission and normalises it', () => {
    const result = validateEnquiry(valid(), COURSES);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.name, 'Sample Testcase');
    assert.equal(result.value.phone, '919509017150');
    assert.equal(result.value.classLevel, 'CLASS_12');
    assert.equal(result.value.email, null);
    assert.equal(result.value.message, null);
  });

  test('lowercases email', () => {
    const result = validateEnquiry(valid({ email: 'Sample@Example.COM' }), COURSES);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.email, 'sample@example.com');
  });

  test('keeps a known course slug and drops an unknown one', () => {
    const known = validateEnquiry(valid({ courseSlug: 'ca-foundation' }), COURSES);
    assert.equal(known.ok && known.value.courseSlug, 'ca-foundation');

    const unknown = validateEnquiry(valid({ courseSlug: 'not-a-course' }), COURSES);
    assert.equal(unknown.ok && unknown.value.courseSlug, null);
  });
});

describe('validateEnquiry — rejections', () => {
  test('name is required and bounded', () => {
    assert.equal(validateEnquiry(valid({ name: '' }), COURSES).ok, false);
    assert.equal(validateEnquiry(valid({ name: 'A' }), COURSES).ok, false);
    assert.equal(
      validateEnquiry(valid({ name: 'x'.repeat(LIMITS.name.max + 1) }), COURSES).ok,
      false,
    );
  });

  test('phone is required and must be callable', () => {
    const missing = validateEnquiry(valid({ phone: '' }), COURSES);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.ok(missing.errors.phone);

    const bad = validateEnquiry(valid({ phone: '12345' }), COURSES);
    assert.equal(bad.ok, false);
  });

  test('classLevel must be one of the known values', () => {
    assert.equal(validateEnquiry(valid({ classLevel: '' }), COURSES).ok, false);
    assert.equal(validateEnquiry(valid({ classLevel: 'HACKED' }), COURSES).ok, false);
    // Not a string at all
    assert.equal(validateEnquiry(valid({ classLevel: { a: 1 } }), COURSES).ok, false);
  });

  test('consent must be explicitly given', () => {
    for (const consent of [undefined, '', 'off', false, 'no']) {
      const result = validateEnquiry(valid({ consent }), COURSES);
      assert.equal(result.ok, false, `consent=${String(consent)} must fail`);
      if (!result.ok) assert.ok(result.errors.consent);
    }
  });

  test('message length is bounded', () => {
    const ok = validateEnquiry(valid({ message: 'x'.repeat(LIMITS.message.max) }), COURSES);
    assert.equal(ok.ok, true);

    const tooLong = validateEnquiry(
      valid({ message: 'x'.repeat(LIMITS.message.max + 1) }),
      COURSES,
    );
    assert.equal(tooLong.ok, false);
  });

  test('reports every failing field at once, not just the first', () => {
    const result = validateEnquiry(
      { name: '', phone: 'nope', classLevel: 'BAD', consent: undefined },
      COURSES,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.name);
    assert.ok(result.errors.phone);
    assert.ok(result.errors.classLevel);
    assert.ok(result.errors.consent);
  });

  test('non-string input never throws', () => {
    for (const junk of [null, undefined, 0, [], {}, true]) {
      assert.doesNotThrow(() =>
        validateEnquiry(
          { name: junk, phone: junk, classLevel: junk, consent: junk, message: junk },
          COURSES,
        ),
      );
    }
  });
});

describe('isSafePhotoPath', () => {
  test('accepts a plain site-relative image path', () => {
    for (const p of [
      '/photos/student.jpg',
      '/photos/2026/result.jpeg',
      '/uploads/a-b_c.png',
      '/img/pic.webp',
      '/img/pic.avif',
    ]) {
      assert.equal(isSafePhotoPath(p), true, `should accept ${p}`);
    }
  });

  test('rejects directory traversal', () => {
    for (const p of [
      '/../../etc/passwd.jpg',
      '/photos/../../../secret.png',
      '/..%2f..%2fx.jpg',
    ]) {
      assert.equal(isSafePhotoPath(p), false, `should reject ${p}`);
    }
  });

  test('rejects anything pointing off this site', () => {
    for (const p of [
      '//evil.example.com/x.jpg',
      'https://evil.example.com/x.jpg',
      'http://evil.example.com/x.jpg',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'photos/no-leading-slash.jpg',
    ]) {
      assert.equal(isSafePhotoPath(p), false, `should reject ${p}`);
    }
  });

  test('rejects non-image and executable extensions', () => {
    for (const p of [
      '/uploads/shell.php',
      '/uploads/script.js',
      '/uploads/page.html',
      '/uploads/noextension',
      '/uploads/archive.zip',
    ]) {
      assert.equal(isSafePhotoPath(p), false, `should reject ${p}`);
    }
  });

  test('rejects query strings, fragments, whitespace and backslashes', () => {
    for (const p of [
      '/photos/x.jpg?a=1',
      '/photos/x.jpg#frag',
      '/photos/my photo.jpg',
      `/photos${String.fromCharCode(92)}windows.jpg`,
      '',
    ]) {
      assert.equal(isSafePhotoPath(p), false, `should reject ${JSON.stringify(p)}`);
    }
  });

  test('never throws on non-string input', () => {
    for (const junk of [null, undefined, 0, [], {}, true]) {
      assert.doesNotThrow(() => isSafePhotoPath(junk as unknown as string));
      assert.equal(isSafePhotoPath(junk as unknown as string), false);
    }
  });
});
