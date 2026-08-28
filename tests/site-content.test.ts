/**
 * The editable-content registry — the pure half.
 *
 * Everything here decides what a teacher is allowed to put on the public
 * website, so each case is one of two questions: can something get through
 * that should not, and can something be lost that should not be.
 *
 * The registry is a CLOSED LIST. These tests exist mostly to keep it closed —
 * the failure this file is guarding against is a future field being added with
 * a key that slips the charset, or a fallback quietly becoming empty and
 * blanking a heading on the live site.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EDITABLE_FIELDS,
  FIELD_GROUPS,
  fieldFor,
  fieldsInGroup,
  isEditableKey,
  cleanValue,
  validateValue,
  resolveContent,
  addressLineFrom,
  validatePhone,
  phoneE164,
  navKeyFor,
  PUBLIC_ROUTES,
  type EditableField,
} from '../src/config/site-content.ts';

const field = (key: string): EditableField => {
  const found = fieldFor(key);
  assert.ok(found, `${key} is missing from the registry`);
  return found;
};

describe('the registry is internally consistent', () => {
  test('every key is unique', () => {
    const keys = EDITABLE_FIELDS.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  test('every key passes its own charset check', () => {
    for (const f of EDITABLE_FIELDS) {
      assert.ok(isEditableKey(f.key), `${f.key} fails isEditableKey`);
    }
  });

  test('every field belongs to a declared group', () => {
    const groups = new Set(FIELD_GROUPS.map((g) => g.id));
    for (const f of EDITABLE_FIELDS) {
      assert.ok(groups.has(f.group), `${f.key} is in unknown group ${f.group}`);
    }
  });

  test('every group has at least one field', () => {
    for (const g of FIELD_GROUPS) {
      assert.ok(fieldsInGroup(g.id).length > 0, `${g.id} has no fields`);
    }
  });

  /**
   * A non-blankable field with an empty fallback would render a blank heading
   * on an empty database, which is the one thing the fallback design exists to
   * prevent.
   */
  test('a field that cannot be blank has a non-empty fallback', () => {
    for (const f of EDITABLE_FIELDS) {
      if (!f.blankable && f.kind !== 'toggle') {
        assert.notEqual(f.fallback.trim(), '', `${f.key} has an empty fallback`);
      }
    }
  });

  test('no fallback exceeds its own maximum length', () => {
    for (const f of EDITABLE_FIELDS) {
      assert.ok(
        f.fallback.length <= f.maxLength,
        `${f.key} fallback is ${f.fallback.length} > ${f.maxLength}`,
      );
    }
  });

  /** The CHECK constraint in the migration caps every value at 2000. */
  test('no field declares a maximum above the database ceiling', () => {
    for (const f of EDITABLE_FIELDS) {
      assert.ok(f.maxLength <= 2000, `${f.key} allows ${f.maxLength}`);
    }
  });
});

describe('isEditableKey refuses anything not on the list', () => {
  test('a well-formed key that is not registered is refused', () => {
    assert.equal(isEditableKey('contact.notARealField'), false);
    assert.equal(isEditableKey('home.somethingElse'), false);
  });

  test('non-strings are refused without throwing', () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
      assert.equal(isEditableKey(bad), false);
    }
  });

  test('keys carrying path or wildcard characters are refused', () => {
    for (const bad of [
      '../secret',
      'contact.line1/../../etc/passwd',
      'contact.%',
      'contact.line1;DROP TABLE',
      'contact line1',
      'Contact.line1',
      '.leadingDot',
      'noDotAtAll',
    ]) {
      assert.equal(isEditableKey(bad), false, `${bad} was accepted`);
    }
  });
});

describe('cleanValue normalises for layout', () => {
  test('a line field loses newlines and collapses runs of space', () => {
    const f = field('home.heroTitleLine1');
    assert.equal(cleanValue(f, 'Master\n  Commerce.  '), 'Master Commerce.');
  });

  test('a paragraph field also collapses to a single line', () => {
    const f = field('home.heroStandfirst');
    assert.equal(cleanValue(f, 'One.\n\nTwo.'), 'One. Two.');
  });

  test('a lines field keeps line breaks but drops blank rows', () => {
    const f = field('contact.hours');
    assert.equal(cleanValue(f, 'Mon\n\n\nTue\n   \nWed'), 'Mon\nTue\nWed');
  });

  test('control characters are stripped, newlines survive in a lines field', () => {
    const f = field('contact.hours');
    assert.equal(cleanValue(f, 'Mon\u0000day\nTue\u001Fsday'), 'Monday\nTuesday');
  });

  test('a toggle is normalised to exactly "on" or empty', () => {
    const f = field(navKeyFor('/about', 'visible'));
    assert.equal(cleanValue(f, 'on'), 'on');
    assert.equal(cleanValue(f, 'yes'), 'on');
    assert.equal(cleanValue(f, ''), '');
    assert.equal(cleanValue(f, '   '), '');
  });

  test('a value longer than the maximum is truncated, not rejected silently', () => {
    const f = field('home.heroTitleLine1');
    assert.equal(cleanValue(f, 'x'.repeat(500)).length, f.maxLength);
  });

  test('non-string input never throws', () => {
    const f = field('home.heroTitleLine1');
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.equal(cleanValue(f, bad), '');
    }
  });
});

describe('validateValue', () => {
  /**
   * REGRESSION — Phase 16, Topic 4.
   *
   * This test used to assert the opposite: that emptying a required field was
   * refused. That refusal contradicted `resolveContent`, which has always
   * treated an empty stored value on a required field as "use the wording in
   * code", and it made the editor's own help text - "Clear it to put the
   * original wording back" - a promise the code could not keep.
   *
   * Emptying is now allowed everywhere, and means one of two things depending
   * on the field. Neither can blank the public site; `resolveContent` is what
   * guarantees that, and the two tests below it prove both directions.
   */
  test('a required field accepts empty, which means revert to the original', () => {
    const f = field('contact.city');
    assert.equal(validateValue(f, ''), null);
    assert.equal(resolveContent({ 'contact.city': '' })['contact.city'], f.fallback);
  });

  test('emptying a required field can never blank the public site', () => {
    for (const f of EDITABLE_FIELDS) {
      if (f.blankable || f.kind === 'toggle') continue;
      assert.equal(validateValue(f, ''), null, `${f.key} still refuses empty`);
      assert.equal(
        resolveContent({ [f.key]: '' })[f.key],
        f.fallback,
        `${f.key} did not fall back after being emptied`,
      );
    }
  });

  test('a blankable field accepts empty', () => {
    const f = field('contact.phoneSecondary');
    assert.equal(validateValue(f, ''), null);
  });

  test('a PIN code must be six digits', () => {
    const f = field('contact.postalCode');
    assert.equal(validateValue(f, '302033'), null);
    assert.ok(validateValue(f, '30203'));
    assert.ok(validateValue(f, 'ABC123'));
  });
});

describe('phone handling', () => {
  test('accepts the forms a person actually types', () => {
    for (const good of [
      '+91 95090 17150',
      '9509017150',
      '+919509017150',
      '95090-17150',
    ]) {
      assert.equal(validatePhone(good), null, `${good} was rejected`);
    }
  });

  test('rejects wrong lengths and invalid leading digits', () => {
    for (const bad of ['950901715', '95090171501', '1234567890', '', 'abcdefghij']) {
      assert.ok(validatePhone(bad), `${bad} was accepted`);
    }
  });

  /**
   * The dialled number is DERIVED from the displayed number. If this ever
   * stops holding, the site prints one number and dials another.
   */
  test('every accepted form derives the same E.164 number', () => {
    const forms = ['+91 95090 17150', '9509017150', '+919509017150', '95090-17150'];
    const derived = new Set(forms.map(phoneE164));
    assert.equal(derived.size, 1);
    assert.equal([...derived][0], '+919509017150');
  });
});

describe('resolveContent falls back rather than blanking the site', () => {
  test('an empty store yields every field at its code default', () => {
    const resolved = resolveContent({});
    for (const f of EDITABLE_FIELDS) {
      assert.equal(resolved[f.key], f.fallback, `${f.key} did not fall back`);
    }
  });

  test('a stored value wins over the fallback', () => {
    const resolved = resolveContent({ 'home.heroTitleLine1': 'Something else.' });
    assert.equal(resolved['home.heroTitleLine1'], 'Something else.');
  });

  test('clearing a required field is an undo, not a blanking', () => {
    const resolved = resolveContent({ 'home.heroTitleLine1': '   ' });
    assert.equal(resolved['home.heroTitleLine1'], field('home.heroTitleLine1').fallback);
  });

  test('clearing a blankable field really does blank it', () => {
    const resolved = resolveContent({ 'contact.phoneSecondary': '' });
    assert.equal(resolved['contact.phoneSecondary'], '');
  });

  test('a toggle turned off stays off', () => {
    const key = navKeyFor('/about', 'visible');
    assert.equal(resolveContent({ [key]: '' })[key], '');
    assert.equal(resolveContent({})[key], 'on');
  });

  test('a Map and a plain object resolve identically', () => {
    const fromObject = resolveContent({ 'contact.city': 'Ajmer' });
    const fromMap = resolveContent(new Map([['contact.city', 'Ajmer']]));
    assert.deepEqual(fromObject, fromMap);
  });
});

describe('addressLineFrom', () => {
  test('joins in the order a postal address is written', () => {
    const line = addressLineFrom(resolveContent({}) as Record<string, string>);
    assert.match(line, /Pratap Nagar.*Jaipur.*Rajasthan 302033$/);
  });

  test('an absent landmark leaves no double comma', () => {
    const content = resolveContent({ 'contact.landmark': '' }) as Record<string, string>;
    const line = addressLineFrom(content);
    assert.ok(!line.includes(', ,'));
    assert.ok(!line.startsWith(','));
  });
});

/* ===================================================== Phase 16, Topic 4 === */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { previewPages, CODE_OWNED, toFieldView } from '../src/config/site-content.ts';
import { contentToken } from '../src/lib/stale-edit.ts';

/** Every .ts/.tsx under src/, except the registry itself. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !full.endsWith(join('config', 'site-content.ts'))) {
      out.push(full);
    }
  }
  return out;
}

const SRC = join(process.cwd(), 'src');
const ALL_SOURCE = sourceFiles(SRC)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

describe('declared render locations are true of the source', () => {
  test('every field declares where it appears', () => {
    for (const f of EDITABLE_FIELDS) {
      assert.ok(f.renders, `${f.key} declares no render location`);
      assert.ok(f.renders.route.length > 0, `${f.key} has an empty route`);
      assert.ok(f.renders.section.length > 0, `${f.key} has an empty section`);
    }
  });

  /**
   * A declared route that no longer exists is exactly the drift this
   * declaration was added to prevent: the preview would promise a teacher that
   * their edit appears on a page that 404s.
   */
  test('every declared route exists on disk', () => {
    for (const f of EDITABLE_FIELDS) {
      const route = f.renders.route;
      if (route === '*') continue;

      const segment = route === '/' ? '' : route;
      const candidates = [
        join(SRC, 'app', '(site)', segment, 'page.tsx'),
        // Course pages are one dynamic route serving many slugs.
        join(SRC, 'app', '(site)', 'courses', '[slug]', 'page.tsx'),
      ];
      assert.ok(
        candidates.some((p) => existsSync(p)),
        `${f.key} declares route ${route}, which has no page.tsx`,
      );
    }
  });

  /**
   * PUBLIC_ROUTES is what a site-chrome field expands to when caches are
   * cleared, so an entry that does not resolve is a `revalidatePath` call
   * against nothing — and, worse, a route MISSING from it is a page that keeps
   * serving a stale header after the institute changes its phone number.
   *
   * That is not hypothetical: Topic 12 found `/faculty` and `/reviews` absent
   * from the hand-written list this replaced, both ISR-cached, one of them for
   * six hours.
   */
  test('every public route in PUBLIC_ROUTES exists on disk', () => {
    for (const route of PUBLIC_ROUTES) {
      const segment = route === '/' ? '' : route;
      assert.ok(
        existsSync(join(SRC, 'app', '(site)', segment, 'page.tsx')),
        `PUBLIC_ROUTES lists ${route}, which has no page.tsx`,
      );
    }
  });

  /**
   * And the other direction: a page that exists but is not listed is the exact
   * shape of the bug above. Course detail pages are excluded because they are
   * one dynamic route expanded from `publishedCourses` at the call site.
   */
  test('every public page on disk is listed in PUBLIC_ROUTES', () => {
    const siteDir = join(SRC, 'app', '(site)');
    const found: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry.startsWith('[')) continue;
          walk(full, `${prefix}/${entry}`);
        } else if (entry === 'page.tsx') {
          found.push(prefix === '' ? '/' : prefix);
        }
      }
    };
    walk(siteDir, '');

    for (const route of found) {
      assert.ok(
        PUBLIC_ROUTES.includes(route),
        `${route} has a page.tsx but is missing from PUBLIC_ROUTES, so a contact or menu change will not refresh it`,
      );
    }
  });

  /**
   * Something must actually READ each key.
   *
   * Most keys appear verbatim in the page that renders them. Three families are
   * consumed through a shaped reader instead, and are checked by the code that
   * builds them rather than by the key string:
   *
   *   contact.*  -> getContactBlock() / addressLineFrom() in lib/site-content
   *   nav.*      -> navKeyFor() in getPrimaryNav()
   *   footer.*   -> the template in getFooterNav()
   *   courses.*  -> the same template literal, in the course page
   *
   * Those three are named here deliberately rather than skipped silently: if a
   * future change stops calling the reader, the assertion below still fails,
   * because the reader itself is what is being asserted.
   */
  test('every key is read by something outside the registry', () => {
    const readerProof: Record<string, string> = {
      'contact.': 'getContactBlock',
      'nav.': 'navKeyFor',
      'footer.': 'getFooterNav',
      // The course page indexes with the identical template literal, so the
      // proof is that exact expression appearing in the page source.
      'courses.': 'courses.${course.slug}.description',
    };

    for (const f of EDITABLE_FIELDS) {
      if (ALL_SOURCE.includes(f.key)) continue;

      const family = Object.keys(readerProof).find((p) => f.key.startsWith(p));
      assert.ok(family, `${f.key} appears nowhere in src/ and belongs to no reader family`);
      const proof = readerProof[family];
      assert.ok(proof, `no proof string is declared for the ${family} family`);
      assert.ok(
        ALL_SOURCE.includes(proof),
        `${f.key} is consumed via ${proof}, which no longer exists`,
      );
    }
  });
});

describe('previewPages arranges the registry by public page', () => {
  const pages = previewPages();

  test('every field appears exactly once across the preview', () => {
    const seen = pages.flatMap((p) => p.sections.flatMap((s) => s.fields.map((f) => f.key)));
    assert.equal(seen.length, EDITABLE_FIELDS.length);
    assert.equal(new Set(seen).size, seen.length, 'a field is listed twice');
  });

  test('site chrome sorts first and has no single page to open', () => {
    const first = pages[0];
    assert.ok(first, 'previewPages returned nothing');
    assert.equal(first.route, '*');
    assert.equal(first.href, null);
  });

  test('every other page links to a route a visitor can open', () => {
    for (const page of pages.slice(1)) {
      assert.equal(page.href, page.route);
      assert.ok(page.href!.startsWith('/'));
    }
  });

  test('no section is empty', () => {
    for (const page of pages) {
      assert.ok(page.sections.length > 0, `${page.route} has no sections`);
      for (const s of page.sections) {
        assert.ok(s.fields.length > 0, `${page.route}/${s.section} has no fields`);
      }
    }
  });
});

describe('the field view sent to the browser carries no functions', () => {
  /**
   * A function cannot cross the server-to-client boundary; React refuses the
   * whole render. Phase 15 hit exactly that and fixed it with this projection,
   * so the projection is worth pinning.
   */
  test('toFieldView produces only serialisable values', () => {
    for (const f of EDITABLE_FIELDS) {
      const view = toFieldView(f);
      for (const [k, v] of Object.entries(view)) {
        assert.notEqual(typeof v, 'function', `${f.key}.${k} is a function`);
      }
      assert.doesNotThrow(() => JSON.stringify(view));
    }
  });

  test('the view never leaks the validator', () => {
    const withValidator = EDITABLE_FIELDS.find((f) => typeof f.validate === 'function');
    assert.ok(withValidator, 'no field has a validator - this test has gone stale');
    assert.equal('validate' in toFieldView(withValidator), false);
  });
});

describe('CODE_OWNED explains what cannot be edited', () => {
  test('every entry gives a reason, not just a label', () => {
    assert.ok(CODE_OWNED.length > 0);
    for (const item of CODE_OWNED) {
      assert.ok(item.label.trim().length > 0);
      assert.ok(item.why.trim().length > 20, `${item.label} has no real reason`);
    }
  });

  /** Naming something here must not accidentally make it editable. */
  test('nothing in CODE_OWNED is also a registered editable field', () => {
    for (const item of CODE_OWNED) {
      assert.equal(isEditableKey(item.label), false);
    }
  });
});

describe('contentToken - the CMS lost-update guard', () => {
  const at = (iso: string) => ({ updatedAt: new Date(iso) });

  test('no rows yields an empty token', () => {
    assert.equal(contentToken([]), '');
  });

  test('one row yields its own timestamp', () => {
    assert.equal(contentToken([at('2026-08-26T10:00:00.000Z')]), '2026-08-26T10:00:00.000Z');
  });

  test('many rows yield the LATEST timestamp', () => {
    const token = contentToken([
      at('2026-08-20T10:00:00.000Z'),
      at('2026-08-26T10:00:00.000Z'),
      at('2026-08-22T10:00:00.000Z'),
    ]);
    assert.equal(token, '2026-08-26T10:00:00.000Z');
  });

  /**
   * The create case. A form rendered when nothing was stored carries an empty
   * token; if anybody has saved since, the recomputed token is non-empty and
   * the two disagree - which is what refuses the overwrite.
   */
  test('a row appearing after the form was rendered changes the token', () => {
    const whenFormRendered = contentToken([]);
    const nowSomebodySaved = contentToken([at('2026-08-26T10:00:00.000Z')]);
    assert.notEqual(whenFormRendered, nowSomebodySaved);
  });

  test('the token is stable regardless of row order', () => {
    const rows = [at('2026-08-26T10:00:00.000Z'), at('2026-08-25T09:00:00.000Z')];
    assert.equal(contentToken(rows), contentToken([...rows].reverse()));
  });
});
