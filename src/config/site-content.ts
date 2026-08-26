import { institute, addressFull, publishedCourses } from './institute.ts';
import { primaryNav, footerNav } from './nav.ts';

/**
 * THE EDITABLE-CONTENT REGISTRY.
 *
 * Phase 15, Topic 2. This is the single declaration of what a teacher may
 * change about the public website, and it is deliberately a CLOSED LIST.
 *
 * WHY A CLOSED LIST AND NOT A PAGE BUILDER.
 *
 * The obvious way to build a CMS is a rich-text field per page. The brief
 * forbids arbitrary HTML editing, and it is right to: a rich-text field on a
 * site with no content-security review is a stored-XSS hole, and it also lets
 * one bad paste destroy a layout that took a phase to get right. So every
 * editable thing on this site is a named field with a type, a length limit and
 * a validator, declared here. If a key is not in this file, it cannot be
 * written, cannot be read, and cannot appear on the website.
 *
 * WHY EVERY FIELD HAS A FALLBACK.
 *
 * The values currently on the site are hardcoded in JSX and in
 * `src/config/institute.ts`. Those stay exactly where they are and become the
 * FALLBACK for each key. That has three consequences worth stating plainly:
 *
 *   1. An empty database renders precisely the site that exists today. The CMS
 *      cannot make the site worse by being unpopulated.
 *   2. Deleting a row is a safe undo, not a way to blank the homepage.
 *   3. Nothing here invents a fact. Every fallback below is either brand copy
 *      already confirmed, or an unverified fact ALREADY marked unverified in
 *      `institute.ts`. Editing one does not make it true — see
 *      `VERIFICATION_IS_SEPARATE` at the bottom of this file.
 *
 * WHY NAV LINKS ARE LABEL-AND-VISIBILITY ONLY.
 *
 * Phase 6 removed four navigation entries because all four pointed at pages
 * that 404'd, and recorded the reason: a broken link in the most prominent
 * element on the site is the worst place to have one. Letting an admin type an
 * arbitrary href would reintroduce exactly that. So the href of every nav entry
 * stays fixed in code, and what the teacher can change is what it is CALLED and
 * whether it is SHOWN. Adding a genuinely new destination remains a code
 * change, because it requires a page to exist first.
 */

export type FieldKind =
  /** One line. Newlines are stripped. */
  | 'line'
  /** Several sentences. Newlines collapse to spaces; no markup. */
  | 'paragraph'
  /** A short list — one item per line. */
  | 'lines'
  /** "on" or "" — rendered as a checkbox. */
  | 'toggle';

/**
 * WHERE A FIELD ACTUALLY APPEARS ON THE PUBLIC SITE.
 *
 * Phase 16, Topic 4. Declaring this turns a comment into data, and data can be
 * TESTED — `tests/site-content.test.ts` asserts that every key declared here is
 * genuinely read by the source file serving that route. Without that assertion
 * this is just a second thing to forget to update, and a preview built on a
 * stale map is worse than no preview: it tells the teacher their edit will
 * appear somewhere it will not.
 *
 * `route: '*'` means site chrome — the header, footer or floating action, which
 * render on every page.
 */
export type RenderLocation = {
  /** A public route, or '*' for site chrome. */
  route: string;
  /** Human label for the part of the page, shown in the preview. */
  section: string;
};

export type EditableField = {
  /** Stable storage key. Never reuse one for a different meaning. */
  key: string;
  group: FieldGroupId;
  label: string;
  help?: string;
  /** Where this value is rendered for a visitor. Asserted by a test. */
  renders: RenderLocation;
  kind: FieldKind;
  /** Hard ceiling. Enforced here, in the action, and by a CHECK constraint. */
  maxLength: number;
  /** What the site shows when nothing is stored. */
  fallback: string;
  /**
   * A field that may legitimately be blank. For a blank-able field an empty
   * stored value means "show nothing"; for the rest it means "use the
   * fallback", which is what makes clearing a box a safe undo.
   */
  blankable?: boolean;
  /** Extra validation beyond kind and length. Returns an error or null. */
  validate?: (value: string) => string | null;
};

export type FieldGroupId =
  | 'contact'
  | 'home'
  | 'about'
  | 'courses'
  | 'navigation';

export type FieldGroup = {
  id: FieldGroupId;
  title: string;
  blurb: string;
  /** Which public routes this group changes. Drives revalidation. */
  affects: readonly string[];
};

export const FIELD_GROUPS: readonly FieldGroup[] = [
  {
    id: 'contact',
    title: 'Contact details',
    blurb:
      'The address and phone numbers, everywhere they appear — contact page, footer, homepage and the call buttons.',
    affects: ['*'],
  },
  {
    id: 'home',
    title: 'Homepage wording',
    blurb: 'The headline, the sentence under it, and the closing invitation.',
    affects: ['/'],
  },
  {
    id: 'about',
    title: 'About page',
    blurb: 'What the About page says about the institute.',
    affects: ['/about'],
  },
  {
    id: 'courses',
    title: 'Programme descriptions',
    blurb:
      'A short description for each programme. The programme names and their web addresses are fixed in code.',
    affects: ['/courses'],
  },
  {
    id: 'navigation',
    title: 'Menu and footer',
    blurb:
      'What each menu entry is called, and whether it is shown. Where each one goes is fixed, because a menu link to a page that does not exist is the worst kind of broken link.',
    affects: ['*'],
  },
];

/* ---------------------------------------------------------- validators -- */

/**
 * An Indian mobile number as a person would write it.
 *
 * Stored in display form; the `tel:` href and the WhatsApp link are DERIVED
 * from it by stripping non-digits, so the two can never disagree. Rejecting
 * anything that is not ten digits after the country code is deliberate: a
 * mistyped phone number on a coaching website costs the institute enquiries,
 * and it is the one field where being strict is kinder than being permissive.
 */
export function validatePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return 'Enter the phone number.';
  const national = digits.startsWith('91') ? digits.slice(2) : digits;
  if (national.length !== 10) {
    return 'Enter a 10-digit mobile number, optionally with +91 in front.';
  }
  if (!/^[6-9]/.test(national)) {
    return 'An Indian mobile number starts with 6, 7, 8 or 9.';
  }
  return null;
}

/** Digits only, in E.164 form, derived from whatever the teacher typed. */
export function phoneE164(value: string): string {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('91') ? digits.slice(2) : digits;
  return `+91${national}`;
}

function validatePostcode(value: string): string | null {
  return /^\d{6}$/.test(value.trim()) ? null : 'A PIN code is six digits.';
}

/* -------------------------------------------------------------- fields -- */

const CONTACT_FIELDS: readonly EditableField[] = [
  {
    key: 'contact.landmark',
    renders: { route: '*', section: 'Address — contact page, footer and homepage' },
    group: 'contact',
    label: 'Landmark',
    help: 'The "near ..." part of the address. Leave blank if there is not one.',
    kind: 'line',
    maxLength: 80,
    fallback: institute.address.landmark,
    blankable: true,
  },
  {
    key: 'contact.line1',
    renders: { route: '*', section: 'Address — contact page, footer and homepage' },
    group: 'contact',
    label: 'Street / area',
    kind: 'line',
    maxLength: 80,
    fallback: institute.address.line1,
  },
  {
    key: 'contact.city',
    renders: { route: '*', section: 'Address — contact page, footer and homepage' },
    group: 'contact',
    label: 'City',
    kind: 'line',
    maxLength: 60,
    fallback: institute.address.city,
  },
  {
    key: 'contact.state',
    renders: { route: '*', section: 'Address — contact page, footer and homepage' },
    group: 'contact',
    label: 'State',
    kind: 'line',
    maxLength: 60,
    fallback: institute.address.state,
  },
  {
    key: 'contact.postalCode',
    renders: { route: '*', section: 'Address — contact page, footer and homepage' },
    group: 'contact',
    label: 'PIN code',
    kind: 'line',
    maxLength: 10,
    fallback: institute.address.postalCode,
    validate: validatePostcode,
  },
  {
    key: 'contact.phonePrimary',
    renders: { route: '*', section: 'Phone — header, footer and every call button' },
    group: 'contact',
    label: 'Main phone number',
    help: 'Shown in the header, the footer and the call button. WhatsApp uses this number too.',
    kind: 'line',
    maxLength: 24,
    fallback: institute.phonePrimary.display,
    validate: validatePhone,
  },
  {
    key: 'contact.phoneSecondary',
    renders: { route: '/contact', section: 'Second phone number' },
    group: 'contact',
    label: 'Second phone number',
    help: 'Shown on the contact page only. Leave blank if there is just one number.',
    kind: 'line',
    maxLength: 24,
    fallback: institute.phoneSecondary.display,
    blankable: true,
    validate: (v) => (v.trim() === '' ? null : validatePhone(v)),
  },
  {
    key: 'contact.hours',
    renders: { route: '*', section: 'Opening hours — contact page and footer' },
    group: 'contact',
    label: 'Opening hours',
    help: 'One line per row, for example "Monday to Saturday · 9:00 AM – 7:00 PM". Leave blank to show nothing.',
    kind: 'lines',
    maxLength: 300,
    fallback: '',
    blankable: true,
  },
];

const HOME_FIELDS: readonly EditableField[] = [
  {
    key: 'home.heroEyebrow',
    renders: { route: '/', section: 'Hero' },
    group: 'home',
    label: 'Small line above the headline',
    kind: 'line',
    maxLength: 60,
    fallback: institute.tagline,
  },
  {
    key: 'home.heroTitleLine1',
    renders: { route: '/', section: 'Hero headline' },
    group: 'home',
    label: 'Headline, first line',
    kind: 'line',
    maxLength: 40,
    fallback: 'Master Commerce.',
  },
  {
    key: 'home.heroTitleLine2',
    renders: { route: '/', section: 'Hero headline' },
    group: 'home',
    label: 'Headline, second line',
    help: 'Leave blank for a one-line headline.',
    kind: 'line',
    maxLength: 40,
    fallback: 'Build Your Future.',
    blankable: true,
  },
  {
    key: 'home.heroStandfirst',
    renders: { route: '/', section: 'Hero' },
    group: 'home',
    label: 'Sentence under the headline',
    kind: 'paragraph',
    maxLength: 260,
    fallback: `Class XI and XII Commerce, CA Foundation, CA Intermediate and CMA in ${institute.locality} — taught for concept clarity, not memorisation.`,
  },
  {
    key: 'home.ctaTitle',
    renders: { route: '/', section: 'Closing invitation' },
    group: 'home',
    label: 'Closing invitation — heading',
    kind: 'line',
    maxLength: 70,
    fallback: 'Ready to take the next step?',
  },
  {
    key: 'home.ctaBody',
    renders: { route: '/', section: 'Closing invitation' },
    group: 'home',
    label: 'Closing invitation — sentence',
    kind: 'paragraph',
    maxLength: 200,
    fallback: 'Talk to us about programmes, batches and admissions.',
  },
];

const ABOUT_FIELDS: readonly EditableField[] = [
  {
    key: 'about.title',
    renders: { route: '/about', section: 'Page heading' },
    group: 'about',
    label: 'Page heading',
    kind: 'line',
    maxLength: 80,
    fallback: institute.tagline,
  },
  {
    key: 'about.standfirst',
    renders: { route: '/about', section: 'Page heading' },
    group: 'about',
    label: 'Sentence under the heading',
    kind: 'paragraph',
    maxLength: 220,
    fallback: `${institute.name} teaches commerce, and only commerce, in ${institute.locality}.`,
  },
  {
    key: 'about.whatWeTeach',
    renders: { route: '/about', section: 'What we teach' },
    group: 'about',
    label: '"What we teach" — first paragraph',
    kind: 'paragraph',
    maxLength: 600,
    fallback:
      'We cover the commerce path from school through professional examinations — Class XI and XII, and the CA and CMA qualifications. A student can start with us in Class XI and stay through CA Intermediate without changing institute.',
  },
  {
    key: 'about.whatWeTeachMore',
    renders: { route: '/about', section: 'What we teach' },
    group: 'about',
    label: '"What we teach" — second paragraph',
    kind: 'paragraph',
    maxLength: 600,
    fallback:
      'Being commerce-only is the point. Every programme below shares the same subjects at its foundation, so what a student learns for their boards is the same material that carries them into CA Foundation.',
  },
  {
    key: 'about.story',
    renders: { route: '/about', section: 'Our story' },
    group: 'about',
    label: '"Our story"',
    help: 'This is the section that currently says the story is still being written. Replacing this text replaces that notice.',
    kind: 'paragraph',
    maxLength: 1200,
    fallback:
      'We are writing this properly, with the people who built the institute, rather than putting up something approximate. It will appear here shortly. Until then, the fastest way to learn how we work is to call and ask.',
  },
];

/**
 * One description per published programme.
 *
 * SLUGS ARE NOT EDITABLE, at the owner's explicit direction and for a hard
 * technical reason: a slug is a route segment and a `generateStaticParams`
 * input, so renaming one silently 404s every existing link to that page,
 * including any the institute has already put on a poster.
 */
const COURSE_FIELDS: readonly EditableField[] = publishedCourses.map((course) => ({
  key: `courses.${course.slug}.description`,
  group: 'courses' as const,
  renders: { route: `/courses/${course.slug}`, section: 'Course details' },
  label: course.name,
  help: 'Shown on the programme page. Leave blank to keep the current "details coming soon" notice.',
  kind: 'paragraph' as const,
  maxLength: 800,
  fallback: '',
  blankable: true,
}));

/**
 * Navigation.
 *
 * The key carries the href so the mapping is explicit and survives reordering
 * of the arrays in `nav.ts`. Slashes are replaced because the key charset is
 * deliberately narrow — see `isEditableKey`.
 */
export function navKeyFor(href: string, part: 'label' | 'visible'): string {
  return `nav.${href.replace(/^\//, '').replace(/\//g, '_') || 'home'}.${part}`;
}

const NAV_FIELDS: readonly EditableField[] = primaryNav.flatMap((link) => [
  {
    key: navKeyFor(link.href, 'label'),
    group: 'navigation' as const,
    renders: { route: '*', section: 'Main menu' },
    label: `Menu: ${link.label}`,
    help: `Goes to ${link.href}`,
    kind: 'line' as const,
    maxLength: 24,
    fallback: link.label,
  },
  {
    key: navKeyFor(link.href, 'visible'),
    group: 'navigation' as const,
    renders: { route: '*', section: 'Main menu' },
    label: `Show "${link.label}" in the menu`,
    kind: 'toggle' as const,
    maxLength: 3,
    fallback: 'on',
  },
]);

const FOOTER_FIELDS: readonly EditableField[] = footerNav.map((group) => ({
  key: `footer.${group.heading.toLowerCase()}.heading`,
  group: 'navigation' as const,
  renders: { route: '*', section: 'Footer columns' },
  label: `Footer column: ${group.heading}`,
  kind: 'line' as const,
  maxLength: 24,
  fallback: group.heading,
}));

export const EDITABLE_FIELDS: readonly EditableField[] = [
  ...CONTACT_FIELDS,
  ...HOME_FIELDS,
  ...ABOUT_FIELDS,
  ...COURSE_FIELDS,
  ...NAV_FIELDS,
  ...FOOTER_FIELDS,
];

const BY_KEY = new Map(EDITABLE_FIELDS.map((f) => [f.key, f]));

export function fieldFor(key: string): EditableField | undefined {
  return BY_KEY.get(key);
}

export function fieldsInGroup(group: FieldGroupId): readonly EditableField[] {
  return EDITABLE_FIELDS.filter((f) => f.group === group);
}

/**
 * The serialisable half of a field.
 *
 * An `EditableField` carries a `validate` FUNCTION, and a function cannot cross
 * the server-to-client boundary — React refuses the whole render with
 * "Functions cannot be passed directly to Client Components". The admin form is
 * a client component because it needs `useActionState`, so it receives this
 * projection instead: everything needed to DRAW the input, and nothing that
 * decides whether a value is acceptable.
 *
 * That split is worth having for its own sake. Validation stays entirely on the
 * server, where it cannot be edited by whoever is holding the browser.
 */
export type FieldView = {
  key: string;
  group: FieldGroupId;
  label: string;
  help?: string;
  kind: FieldKind;
  maxLength: number;
  blankable: boolean;
  /**
   * The text the site shows when nothing is stored.
   *
   * Safe to send to the browser: it is already the wording published on the
   * public website, so it is not a disclosure. Showing it in the editor is
   * what makes "clear this box to put the original back" a promise the teacher
   * can see rather than one they have to trust.
   */
  fallback: string;
  renders: RenderLocation;
};

export function toFieldView(field: EditableField): FieldView {
  return {
    key: field.key,
    group: field.group,
    label: field.label,
    ...(field.help ? { help: field.help } : {}),
    kind: field.kind,
    maxLength: field.maxLength,
    blankable: Boolean(field.blankable),
    fallback: field.fallback,
    renders: field.renders,
  };
}

/**
 * Every public route that has at least one editable field, plus site chrome.
 *
 * Derived from the fields themselves rather than written out by hand, so a new
 * field cannot be added without appearing in the preview. The order is the
 * order a visitor meets the pages, not alphabetical.
 */
const ROUTE_ORDER = ['*', '/', '/about', '/courses', '/contact'];

export type PreviewPage = {
  route: string;
  /** What to call it in the admin. */
  title: string;
  /** Where a visitor can go and look at it. '*' has no single page. */
  href: string | null;
  sections: { section: string; fields: FieldView[] }[];
};

function routeTitle(route: string): string {
  if (route === '*') return 'Every page — header, footer and contact details';
  if (route === '/') return 'Homepage';
  if (route === '/about') return 'About';
  if (route === '/contact') return 'Contact';
  if (route.startsWith('/courses/')) {
    const slug = route.slice('/courses/'.length);
    return publishedCourses.find((c) => c.slug === slug)?.name ?? route;
  }
  return route;
}

/**
 * The registry, arranged the way the public site is arranged.
 *
 * This is what the click-to-edit preview renders. It is built from the SAME
 * field list the editor and the public pages use, so a field cannot appear in
 * one and not the others.
 */
export function previewPages(): PreviewPage[] {
  const byRoute = new Map<string, Map<string, FieldView[]>>();

  for (const field of EDITABLE_FIELDS) {
    const route = field.renders.route;
    if (!byRoute.has(route)) byRoute.set(route, new Map());
    const sections = byRoute.get(route)!;
    if (!sections.has(field.renders.section)) sections.set(field.renders.section, []);
    sections.get(field.renders.section)!.push(toFieldView(field));
  }

  const routes = [...byRoute.keys()].sort((a, b) => {
    const ia = ROUTE_ORDER.indexOf(a);
    const ib = ROUTE_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

  return routes.map((route) => ({
    route,
    title: routeTitle(route),
    href: route === '*' ? null : route,
    sections: [...byRoute.get(route)!.entries()].map(([section, fields]) => ({
      section,
      fields,
    })),
  }));
}

export function fieldViewsInGroup(group: FieldGroupId): FieldView[] {
  return fieldsInGroup(group).map(toFieldView);
}

/**
 * Shape check for a key, applied before the allowlist.
 *
 * The allowlist above is the real gate. This exists because the same charset
 * is asserted by a CHECK constraint in the database, and a value that can only
 * ever be `[a-z][a-zA-Z0-9._]*` cannot be used to smuggle anything through a
 * log line, a CSV export or a `LIKE` pattern.
 */
export function isEditableKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.length > 0 &&
    key.length <= 64 &&
    /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/.test(key) &&
    BY_KEY.has(key)
  );
}

/* ------------------------------------------------------------ cleaning -- */

/**
 * Normalise a submitted value for its kind.
 *
 * This is not sanitisation for safety — React escapes everything it renders,
 * and none of these values is ever passed to `dangerouslySetInnerHTML`. It is
 * normalisation for LAYOUT: a pasted newline in a `line` field would break a
 * heading across two lines in a way the teacher cannot see in a text input,
 * and a run of blank lines in a `lines` field would open a hole in the footer.
 */
export function cleanValue(field: EditableField, raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  // Strip control characters other than newline, which no legitimate paste
  // contains and which render as invisible junk.
  const stripped = text.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');

  switch (field.kind) {
    case 'toggle':
      return stripped.trim() === '' ? '' : 'on';
    case 'line':
      return stripped.replace(/\s+/g, ' ').trim().slice(0, field.maxLength);
    case 'paragraph':
      return stripped.replace(/\s+/g, ' ').trim().slice(0, field.maxLength);
    case 'lines':
      return stripped
        .split('\n')
        .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .slice(0, 12)
        .join('\n')
        .slice(0, field.maxLength);
  }
}

/** Full validation for one submitted value. Returns an error or null. */
export function validateValue(field: EditableField, cleaned: string): string | null {
  if (cleaned.length > field.maxLength) {
    return `Keep this under ${field.maxLength} characters.`;
  }

  /*
    AN EMPTY VALUE IS ALWAYS ALLOWED, AND MEANS ONE OF TWO THINGS.

    ⚠ THIS REFUSED EMPTY UNTIL PHASE 16, AND THAT WAS A DEFECT.

    Phase 15 built two halves that contradicted each other. `resolveContent`
    below implements "clearing a box is a safe undo" - an empty stored value on
    a non-blankable field falls back to the wording in code - and a unit test
    has asserted that behaviour since it was written. But this function
    returned "This cannot be empty." for exactly those fields, so an empty
    value could never be STORED, and the undo `resolveContent` implemented was
    unreachable. The editor's own help text promised it: "Clear it to put the
    original wording back."

    Phase 16 found it while trying to restore a field after a test, which is a
    good illustration of why a verification that puts things back is worth
    writing: the restore step exercises a path nothing else does.

    So, plainly:
      blankable field, empty -> show nothing
      required field, empty  -> show the original wording from the code
    Neither can produce a blank heading on the public site, which is the thing
    the refusal was presumably guarding against. The guard is `resolveContent`,
    not this.
  */
  if (cleaned.trim() === '') return null;

  return field.validate ? field.validate(cleaned) : null;
}

/**
 * Resolve stored values over the fallbacks.
 *
 * A key that is absent, or present but empty on a non-blankable field, falls
 * back. That is what makes clearing a box an undo rather than a way to publish
 * a blank heading.
 */
export function resolveContent(
  stored: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
): Record<string, string> {
  const get = (key: string): string | undefined =>
    stored instanceof Map
      ? stored.get(key)
      : (stored as Readonly<Record<string, string>>)[key];

  const out: Record<string, string> = {};
  for (const field of EDITABLE_FIELDS) {
    const value = get(field.key);
    if (value === undefined) {
      out[field.key] = field.fallback;
    } else if (value.trim() === '' && !field.blankable && field.kind !== 'toggle') {
      out[field.key] = field.fallback;
    } else {
      out[field.key] = value;
    }
  }
  return out;
}

/**
 * The full address as one line, from resolved content.
 *
 * Mirrors `addressFull` in `institute.ts`, which remains the fallback source.
 * Kept here rather than imported so the two cannot silently diverge in ORDER:
 * a Google Business Profile match is string-sensitive, and "Jaipur, Rajasthan
 * 302033" matching "Rajasthan, Jaipur 302033" is the kind of difference that
 * quietly costs a local listing.
 */
export function addressLineFrom(content: Record<string, string>): string {
  return [
    content['contact.landmark'],
    content['contact.line1'],
    content['contact.city'],
    `${content['contact.state']} ${content['contact.postalCode']}`.trim(),
  ]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join(', ');
}

/** The code-default address, for comparing against what is stored. */
export const FALLBACK_ADDRESS_LINE = addressFull;

/**
 * VERIFICATION IS SEPARATE FROM EDITING — read this before wiring anything.
 *
 * `institute.ts` marks the address and both phone numbers `unverified`, and
 * `isIndexable()` in `src/config/launch.ts` refuses to let search engines index
 * the site while any institute fact is unverified. That gate is a safety
 * property, and this module does NOT touch it.
 *
 * A teacher typing an address into the admin is not the same event as somebody
 * confirming that the address is correct. Treating an edit as a verification
 * would mean a typo, or a curious click, could flip the site to indexable — and
 * the whole point of the gate is that the site does not get indexed with wrong
 * contact details, which is precisely the failure the previous website had.
 *
 * So: editing changes what the site SAYS. Verification stays a deliberate,
 * separate act recorded in code. Any future "confirm these details are correct"
 * flow must be an explicit, separately audited action — never a side effect of
 * saving a form.
 */
export const VERIFICATION_IS_SEPARATE = true;

/**
 * What is deliberately NOT editable, and why.
 *
 * Phase 16, Topic 4. The preview names these next to the fields that ARE
 * editable, because a CMS that silently omits things teaches the reader that
 * anything it does not mention is impossible. Each entry answers "why can I not
 * change that?" before anybody has to ask, and each reason is a real
 * consequence rather than "not implemented".
 *
 * This list is documentation with a rendering surface. It grants nothing and
 * gates nothing: adding a line here does not make anything editable, and
 * removing one does not make anything safe.
 */
export const CODE_OWNED: ReadonlyArray<{ label: string; why: string }> = [
  {
    label: 'Page web addresses (/courses/ca-foundation and the rest)',
    why: 'A web address is how every existing link finds the page. Renaming one breaks every poster, WhatsApp message and search result that already points at it.',
  },
  {
    label: 'Titles and descriptions shown in Google results',
    why: 'An editable search title is an invitation to stuff it with keywords, and stuffed metadata actively harms a local listing. These are generated from the page content instead.',
  },
  {
    label: 'The institute name and tagline',
    why: 'Taken from the logo artwork and matched to the Google Business Profile. A mismatch between the two weakens the local listing they are matched on.',
  },
  {
    label: 'Where each menu entry goes',
    why: 'The wording and visibility of a menu entry are yours to change. The destination is not, because a menu link to a page that does not exist is the most prominent possible broken link.',
  },
  {
    label: 'Results, student stories, batches and updates',
    why: 'These are records with permissions attached, not wording. They are managed where their consent controls are, so a permission can never be edited away by accident.',
  },
  {
    label: 'Colours, fonts, spacing and layout',
    why: 'Every combination on the site is checked for readable contrast. A colour picker would let one save drop text below the level a partially sighted reader can make out.',
  },
];
