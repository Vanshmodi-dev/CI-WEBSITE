/**
 * Is there any wording on the public site that nobody decided about?
 *
 * =============================================================================
 * THE QUESTION THIS ANSWERS, AND WHY NOTHING ELSE ANSWERED IT
 * =============================================================================
 * `tests/site-content.test.ts` proves the registry is honest: every key it
 * declares is genuinely read by the file serving that route. That is a
 * one-directional proof. It says nothing about the strings that are NOT in the
 * registry, and those are where the owner requirement actually fails — the
 * institute cannot change what nobody wrote down.
 *
 * Phase 18 scanned for them and found a sentence naming the institute's entire
 * programme list, hard-coded into the footer of every page, in no registry and
 * on no code-owned list. Not a decision — an omission, invisible for three
 * phases because nothing was looking.
 *
 * So this test scans the public pages and the components they render, and
 * requires every user-visible string to be either:
 *
 *   - a registry fallback (the institute can change it), or
 *   - listed in `CODE_OWNED_COPY` with a reason (somebody decided).
 *
 * Anything else fails, and the failure names the string and the file.
 *
 * =============================================================================
 * ⚠ WHAT THIS SCAN CAN AND CANNOT SEE
 * =============================================================================
 * It reads JSX TEXT NODES: the characters between `>` and `<` that are not an
 * expression. That is the overwhelming majority of prose on this site, and it
 * is a shape a regex can find reliably without adding a parser dependency.
 *
 * It does NOT see text passed as a prop (`title="Programmes"`), text built by
 * concatenation, or text inside a component's own default value. Those are
 * covered by `site-content.test.ts` from the other direction for registry keys,
 * and by review otherwise. Claiming this scan is exhaustive would be the exact
 * failure the project keeps finding in its own suites, so it is stated plainly
 * here instead: this is a floor, not a ceiling.
 *
 * The scan's own reliability is checked first — see the control tests.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EDITABLE_FIELDS } from '../src/config/site-content.ts';
import {
  CODE_OWNED_COPY,
  CODE_OWNED_REASONS,
  SHARED_WORDING,
  type CodeOwnedReason,
} from '../src/config/content-audit.ts';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** The entities this codebase actually uses, decoded to what a reader sees. */
const ENTITIES: Readonly<Record<string, string>> = {
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  amp: '&', nbsp: ' ', mdash: '—', ndash: '–',
  times: '×', middot: '·', larr: '←', rarr: '→',
  hellip: '…', nearr: '↗', copy: '©', deg: '°',
};

const decode = (s: string) => s.replace(/&(\w+);/g, (m, n: string) => ENTITIES[n] ?? m);

/**
 * Fragments of TypeScript that the `>...<` pattern picks up by accident.
 *
 * A generic type argument — `useRef<HTMLDialogElement>(null)` — looks exactly
 * like a JSX text node to a regex, and the text between them is code. These are
 * the tokens that only ever appear in code, never in prose on this site. The
 * control test below asserts this filter is not swallowing real sentences.
 */
const LOOKS_LIKE_CODE = /=>|\bconst\b|\breturn\b|\buse[A-Z]\w+\b|===|\?\?|\)\.|\bslug\b/;

type Found = { text: string; files: Set<string> };

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Public pages, and the components only they render. */
function publicFiles(): string[] {
  return [
    ...walk(join(SRC, 'app', '(site)')),
    ...walk(join(SRC, 'components', 'domain')),
  ].sort();
}

function scan(): Map<string, Found> {
  const found = new Map<string, Found>();
  for (const file of publicFiles()) {
    const raw = readFileSync(file, 'utf8');
    // Comments are not rendered, and this codebase has a great many of them.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/>([^<>{}]+)</g)) {
      const text = decode(m[1] ?? '').replace(/\s+/g, ' ').trim();
      if (text.length < 3) continue;
      if (!/[A-Za-z]{2}/.test(text)) continue;
      if (LOOKS_LIKE_CODE.test(text)) continue;
      const existing = found.get(text);
      if (existing) existing.files.add(file);
      else found.set(text, { text, files: new Set([file]) });
    }
  }
  return found;
}

const SCANNED = scan();
const short = (file: string) => file.slice(SRC.length + 1).replace(/\\/g, '/');

describe('the content scan itself', () => {
  test('it finds a substantial amount of text (control)', () => {
    // Without this, a scan that silently matched nothing would make every
    // assertion below pass while proving the opposite of what it claims.
    assert.ok(
      SCANNED.size > 60,
      `the scan found only ${SCANNED.size} strings, which means it is broken, not that the site is empty`,
    );
  });

  test('it finds specific sentences known to be on the site (control)', () => {
    // Named individually, so a filter that started swallowing prose fails here
    // rather than quietly shrinking the scan.
    for (const known of [
      'Send an enquiry',
      'We would rather show you real reviews than write our own.',
      'The map loads from Google only when you ask for it, so nothing is sent to them before you do.',
    ]) {
      assert.ok(SCANNED.has(known), `the scan no longer finds: ${known}`);
    }
  });

  test('the code filter removes code and nothing else (control)', () => {
    assert.ok(LOOKS_LIKE_CODE.test('(null); const openerRef = useRef'));
    assert.ok(LOOKS_LIKE_CODE.test('c.slug === slug)?.name ?? slug'));
    // ...and leaves real prose alone.
    assert.ok(!LOOKS_LIKE_CODE.test('We use your details only to reply to this enquiry.'));
    assert.ok(!LOOKS_LIKE_CODE.test('Opening hours'));
  });
});

describe('every visible string is either editable or explained', () => {
  /** A registry fallback, normalised the same way the scan normalises. */
  const editable = new Set(
    EDITABLE_FIELDS.map((f) => decode(f.fallback).replace(/\s+/g, ' ').trim()),
  );
  const explained = new Set(
    CODE_OWNED_COPY.map((c) => decode(c.text).replace(/\s+/g, ' ').trim()),
  );

  test('nothing on the public site is unaccounted for', () => {
    const orphans: string[] = [];
    for (const [text, found] of SCANNED) {
      if (editable.has(text) || explained.has(text)) continue;
      orphans.push(`${JSON.stringify(text)}  (${[...found.files].map(short).join(', ')})`);
    }

    assert.deepEqual(
      orphans,
      [],
      'These strings are on the public website, are not editable from the admin, ' +
        'and nobody has recorded why. Either register them in site-content.ts or ' +
        'add them to CODE_OWNED_COPY with a reason. See the note at the top of ' +
        'src/config/content-audit.ts.',
    );
  });

  test('the code-owned list has no entry that is no longer on the site', () => {
    // A stale entry is not harmful, but it is a claim about the site that has
    // stopped being true, and this file is only useful while it is accurate.
    const stale = CODE_OWNED_COPY.map((c) => c.text).filter((t) => !SCANNED.has(t));
    assert.deepEqual(stale, [], 'listed as code-owned but no longer found on any public page');
  });

  test('every entry names a reason that exists, and every reason is argued', () => {
    for (const entry of CODE_OWNED_COPY) {
      const reason = CODE_OWNED_REASONS[entry.why];
      assert.ok(reason, `${entry.text} names an unknown reason: ${entry.why}`);
      assert.ok(reason.length > 60, `the reason "${entry.why}" is not an argument, it is a label`);
    }
  });

  test('no string is listed twice', () => {
    const seen = new Set<string>();
    for (const entry of CODE_OWNED_COPY) {
      assert.ok(!seen.has(entry.text), `listed twice: ${entry.text}`);
      seen.add(entry.text);
    }
  });

  test('every string that is both editable and code-owned is acknowledged', () => {
    /*
      The scan matches text, and text is not unique: "Opening hours" is the
      editable footer heading AND a hard-coded eyebrow on the contact page.
      Both are right. What must not happen is a NEW collision appearing without
      anybody deciding which of the two it is, so the list is closed.
    */
    const both = CODE_OWNED_COPY.filter((c) => editable.has(c.text))
      .map((c) => c.text)
      .sort();
    assert.deepEqual(
      both,
      [...SHARED_WORDING].sort(),
      'a string is now both editable and code-owned. Decide whether the ' +
        'occurrence found is the editable one or a second hard-coded copy of ' +
        'it, then add it to SHARED_WORDING or fix it.',
    );
  });

  test('every reason category is actually used', () => {
    // An unused category is an argument nobody is making.
    const used = new Set<CodeOwnedReason>(CODE_OWNED_COPY.map((c) => c.why));
    const unused = (Object.keys(CODE_OWNED_REASONS) as CodeOwnedReason[]).filter(
      (r) => !used.has(r),
    );
    assert.deepEqual(unused, []);
  });
});
