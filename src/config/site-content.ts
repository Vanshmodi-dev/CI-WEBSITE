import { institute, addressFull, publishedCourses } from './institute.ts';
import { primaryNav, footerNav, HIDDEN_UNTIL_POPULATED } from './nav.ts';
import { validateCoordinates } from '../lib/location.ts';
import { validateEmail, validateSocial } from '../lib/contact-links.ts';

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
  | 'pages'
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
    id: 'pages',
    title: 'Page headings',
    blurb:
      'The big heading at the top of each page and the sentence under it. The page addresses themselves are fixed in code.',
    affects: ['*'],
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
  {
    key: 'contact.coordinates',
    renders: { route: '/contact', section: 'Map — contact page' },
    group: 'contact',
    label: 'Map location',
    help: 'Optional. In Google Maps, right-click the institute’s front door and click the numbers at the top to copy them, then paste them here — for example 26.849123, 75.805456. Leave blank and no map is shown.',
    kind: 'line',
    /*
      Forty is generous for two six-decimal numbers and a comma (about 22
      characters). It matches nothing in particular except "far more than a
      coordinate pair and far less than a URL", which is the point: a value that
      needs more room than this is not a coordinate pair.
    */
    maxLength: 40,
    /*
      The fallback is the typed config value, which is `null` today. Rendering
      an empty string means the map stays hidden until somebody supplies a
      point — the same "nothing rather than a placeholder" rule every other
      unsupplied fact on this site follows.
    */
    fallback: institute.coordinates
      ? `${institute.coordinates.lat},${institute.coordinates.lng}`
      : '',
    blankable: true,
    validate: validateCoordinates,
  },
  /*
    EMAIL, AND WHY IT IS EDITABLE RATHER THAN A CODE CONSTANT.

    `institute.email` is `null` and has been since Phase 6, because the
    previous website published a personal Gmail address (a gaming handle) and
    nothing may replace it until the institute has a mailbox on its own domain.
    That reasoning is unchanged and the field ships blank.

    What changed in Topic 12 is WHO CAN FILL IT IN. The address was a code
    constant, so the day the institute finally has one, publishing it needed a
    developer, a commit and a deploy — for a single line of text. The owner
    requirement for this whole project is that the institute can change the
    website without needing a developer, and an unreachable email address on a
    coaching site is exactly the kind of thing that stays wrong for months when
    fixing it requires somebody else's calendar.

    Blank is still the default and blank still renders NOTHING, so the honest
    empty state is preserved. `institute.email` remains the fallback, so if it
    is ever given a value in code that value still shows.
  */
  {
    key: 'contact.email',
    renders: { route: '*', section: 'Email — contact page and footer' },
    group: 'contact',
    label: 'Email address',
    help:
      'Optional. Use an address on the institute’s own domain — a personal Gmail on a school website looks unprofessional and is easy to lose. Leave blank and no email is shown anywhere.',
    kind: 'line',
    maxLength: 120,
    fallback: institute.email ?? '',
    blankable: true,
    validate: validateEmail,
  },
  /*
    SOCIAL LINKS.

    Same argument as the email, plus one of its own: these are the only fields
    in the registry whose value becomes an `href` pointing off this site, so
    they are validated by PARSING and comparing the host to a closed set with
    `===`. See `lib/contact-links.ts` for why `startsWith` is not acceptable
    here — Topics 9 and 10 both established the rule and both had to.
  */
  {
    key: 'social.youtube',
    renders: { route: '*', section: 'Follow — footer' },
    group: 'contact',
    label: 'YouTube channel',
    help:
      'Optional. Paste the address of the institute’s channel, for example https://www.youtube.com/@yourchannel. Leave blank and no YouTube link is shown.',
    kind: 'line',
    maxLength: 200,
    fallback: institute.social.youtube ?? '',
    blankable: true,
    validate: validateSocial('youtube'),
  },
  {
    key: 'social.instagram',
    renders: { route: '*', section: 'Follow — footer' },
    group: 'contact',
    label: 'Instagram profile',
    help:
      'Optional. Paste the address of the institute’s profile, for example https://www.instagram.com/yourprofile. Leave blank and no Instagram link is shown.',
    kind: 'line',
    maxLength: 200,
    fallback: institute.social.instagram ?? '',
    blankable: true,
    validate: validateSocial('instagram'),
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
    /*
      Most menu entries are shown by default. A page that exists but has no
      content yet starts hidden - see HIDDEN_UNTIL_POPULATED in nav.ts. The
      teacher turns it on here when the section is ready, which is the same
      control they use for every other entry.
    */
    fallback: HIDDEN_UNTIL_POPULATED.includes(link.href) ? '' : 'on',
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


/**
 * The heading and standfirst at the top of each page.
 *
 * =============================================================================
 * WHY THESE BECAME EDITABLE IN TOPIC 12
 * =============================================================================
 * The owner requirement for this project is that the institute can change the
 * website without needing a developer. A content inventory of every public
 * route found that the words a visitor reads FIRST on each page - the H1 and
 * the sentence beneath it - were hard-coded in ten page components. The
 * institute could edit its address and its menu labels, but not the sentence
 * that decides whether somebody keeps reading.
 *
 * `/about` is absent from this table on purpose: it already had `about.title`
 * and `about.standfirst` from Phase 15, and a second pair of keys for the same
 * two strings is how a registry starts lying about what it renders.
 *
 * =============================================================================
 * WHAT IS STILL CODE-OWNED, AND WHY
 * =============================================================================
 * The EYEBROW above each title stays in code. It is a one-or-two word label the
 * design uses as a typographic device rather than as prose, and it is exactly
 * the field that invites a paragraph into a slot built for two words.
 *
 * The EMPTY-STATE standfirsts on /gallery, /videos and /reviews also stay in
 * code. Those pages show different wording when they have nothing to show -
 * "We would rather show you real reviews than write our own" - and that
 * sentence is part of the honesty rule the whole rebuild is built on, not
 * editorial copy the institute should be able to soften. Editing here changes
 * the populated version, which is the one a visitor normally sees.
 */
type PageCopy = {
  slug: string;
  route: string;
  label: string;
  title: string;
  /** Absent where the sentence is code-owned. See /reviews below. */
  standfirst?: string;
};

const PAGE_COPY: readonly PageCopy[] = [
  {
    slug: 'courses',
    route: '/courses',
    label: 'Courses',
    title: 'What we teach',
    standfirst: `Commerce programmes for school and professional examinations, in ${institute.locality}.`,
  },
  {
    slug: 'faculty',
    route: '/faculty',
    label: 'Our teachers',
    title: 'The people who teach here',
    standfirst: `Commerce is taught at ${institute.name} by people who teach it every day, in ${institute.locality}.`,
  },
  {
    slug: 'results',
    route: '/results',
    label: 'Results',
    title: 'Our students\u2019 results',
    standfirst:
      'Published with each student\u2019s permission. Where a student asked us not to show their name or photograph, we don\u2019t.',
  },
  {
    slug: 'stories',
    route: '/stories',
    label: 'Student stories',
    title: 'How they got there',
    standfirst:
      'A result is one number. These are the longer versions \u2014 what was hard, what changed, and how it turned out.',
  },
  {
    slug: 'announcements',
    route: '/announcements',
    label: 'Updates',
    title: 'What\u2019s happening',
    standfirst: 'Admission dates, batch news and notices from the institute.',
  },
  {
    slug: 'gallery',
    route: '/gallery',
    label: 'Gallery',
    title: `Inside ${institute.name}`,
    standfirst: `Photographs of the classrooms, the teaching and the days that matter, in ${institute.locality}.`,
  },
  {
    slug: 'videos',
    route: '/videos',
    label: 'Videos',
    title: 'Watch a lesson before you decide',
    standfirst: `Teaching from ${institute.name}, published on YouTube. The quickest way to judge an institute is to watch someone teach.`,
  },
  {
    slug: 'reviews',
    route: '/reviews',
    label: 'Reviews',
    title: 'What people say',
    /*
      NO EDITABLE STANDFIRST ON /reviews, DELIBERATELY.

      The sentence there names the live source the reviews came from
      (`payload.sourceLabel`) and states that the institute neither
      writes nor edits them. That is PROVENANCE, not editorial copy -
      it is the claim the Review Engine exists to make true - and an
      institute able to reword it could quietly drop the attribution.

      It also could not be a static fallback without losing the source
      label, so making it editable would have changed what the page says
      as a side effect of making it editable.
    */
  },
  {
    slug: 'contact',
    route: '/contact',
    label: 'Contact',
    title: 'Come and see us',
    standfirst: `We are in ${institute.locality}. Call or message us with any question about programmes, batches or admissions.`,
  },
  {
    slug: 'admissions',
    route: '/admissions',
    label: 'Admissions',
    title: 'Talk to us about joining',
    /*
      VERBATIM FROM THE PAGE, not a rewrite.

      A first draft of this table invented a plausible sentence here,
      because the extraction that built it truncated before the real one.
      A fallback that does not match the shipped copy silently REWRITES
      the page the moment the field goes live, on a site whose whole
      premise is that it does not publish things nobody approved.
    */
    standfirst:
      'Tell us which class or course you are asking about and we will call you back. If you would rather talk straight away, WhatsApp or call us — that is often quicker.',
  },
];

const PAGE_FIELDS: readonly EditableField[] = PAGE_COPY.flatMap((page) => [
  {
    key: `page.${page.slug}.title`,
    group: 'pages' as const,
    renders: { route: page.route, section: 'Page heading' },
    label: `${page.label}: heading`,
    help: 'The large heading at the top of the page.',
    kind: 'line' as const,
    maxLength: 80,
    fallback: page.title,
  },
  ...(page.standfirst === undefined
    ? []
    : [
        {
          key: `page.${page.slug}.standfirst`,
          group: 'pages' as const,
          renders: { route: page.route, section: 'Page heading' },
          label: `${page.label}: sentence under the heading`,
          kind: 'paragraph' as const,
          maxLength: 260,
          fallback: page.standfirst,
        },
      ]),
]);

/**
 * The headings that label each band of the homepage.
 *
 * These are the words a visitor scans on the way down the longest page on the
 * site, and every one of them was hard-coded. The ids are the ones the page
 * already uses for its `aria-labelledby`, so a key names the same thing the
 * markup does.
 */
const HOME_SECTIONS: readonly { id: string; label: string; title: string }[] = [
  { id: 'results', label: 'Results', title: 'Our students\u2019 results' },
  { id: 'batches', label: 'Upcoming batches', title: 'Upcoming batches' },
  { id: 'stories', label: 'Student stories', title: 'How they got there' },
  { id: 'faculty', label: 'Teachers', title: 'Who will teach you' },
  { id: 'reviews', label: 'Reviews', title: 'What people say' },
  { id: 'videos', label: 'Videos', title: 'Learn beyond the classroom' },
  { id: 'gallery', label: 'Gallery', title: 'Inside the institute' },
];

const HOME_SECTION_FIELDS: readonly EditableField[] = HOME_SECTIONS.map((section) => ({
  key: `home.section.${section.id}.heading`,
  group: 'home' as const,
  renders: { route: '/', section: `Homepage section: ${section.label}` },
  label: `Homepage section: ${section.label}`,
  help:
    'The heading on this band of the homepage. The band hides itself when there is nothing to show.',
  kind: 'line' as const,
  maxLength: 60,
  fallback: section.title,
}));


/**
 * The closing invitation at the foot of each page.
 *
 * Every page ends with the same shape: a short heading, a sentence, and two
 * buttons. The heading and the sentence are the institute's pitch and they were
 * hard-coded on nine pages.
 *
 * ⚠ THE BUTTONS ARE NOT HERE, AND THAT IS THE POINT.
 *
 * Their labels and their destinations stay in code together. Splitting them —
 * an editable label over a fixed destination — produces a button reading
 * "WhatsApp us" that opens the enquiry form, which is worse than either half
 * being wrong on its own. The destinations are `/admissions`, `tel:` and a
 * WhatsApp deep link built from the phone number the institute already
 * controls, so the thing an owner would actually want to change here is the
 * phone number, and that is already editable.
 */
type ClosingCopy = {
  slug: string;
  route: string;
  label: string;
  title: string;
  body: string;
};

const CLOSING_COPY: readonly ClosingCopy[] = [
  {
    slug: 'about',
    route: '/about',
    label: 'About',
    title: 'Come and see the place',
    body: `The clearest way to judge an institute is to visit it and talk to the people teaching. We are in ${institute.locality}.`,
  },
  {
    slug: 'courses',
    route: '/courses',
    label: 'Courses',
    title: 'Not sure which one fits?',
    body: 'Tell us which class you are in and what you are aiming for, and we will talk you through the options.',
  },
  {
    slug: 'faculty',
    route: '/faculty',
    label: 'Our teachers',
    title: 'Come and meet them',
    body: `The clearest way to judge an institute is to talk to the people teaching. We are in ${institute.locality}.`,
  },
  {
    slug: 'results',
    route: '/results',
    label: 'Results',
    title: 'Want to study with us?',
    body: 'Tell us which class you are in and we will explain how we can help.',
  },
  {
    slug: 'stories',
    route: '/stories',
    label: 'Student stories',
    title: 'Your story could start here',
    body: 'Talk to us about which programme suits where you are now.',
  },
  {
    slug: 'gallery',
    route: '/gallery',
    label: 'Gallery',
    title: 'Come and see the rest',
    body: `Photographs only go so far. We are in ${institute.locality}, and you are welcome to visit while teaching is going on.`,
  },
  {
    slug: 'videos',
    route: '/videos',
    label: 'Videos',
    title: 'Come and sit in on a class',
    body: `A video shows you the teaching. A visit shows you the room, the batch size and the questions students actually ask. We are in ${institute.locality}.`,
  },
  {
    slug: 'reviews',
    route: '/reviews',
    label: 'Reviews',
    title: 'Come and see for yourself',
    body: `The clearest way to judge an institute is to visit it and talk to the people teaching. We are in ${institute.locality}.`,
  },
  {
    slug: 'contact',
    route: '/contact',
    label: 'Contact',
    title: 'Still deciding?',
    body: 'Send us an enquiry and we will talk you through the options.',
  },
];

const CLOSING_FIELDS: readonly EditableField[] = CLOSING_COPY.flatMap((page) => [
  {
    key: `page.${page.slug}.ctaTitle`,
    group: 'pages' as const,
    renders: { route: page.route, section: 'Closing invitation' },
    label: `${page.label}: closing heading`,
    kind: 'line' as const,
    maxLength: 70,
    fallback: page.title,
  },
  {
    key: `page.${page.slug}.ctaBody`,
    group: 'pages' as const,
    renders: { route: page.route, section: 'Closing invitation' },
    label: `${page.label}: closing sentence`,
    kind: 'paragraph' as const,
    maxLength: 240,
    fallback: page.body,
  },
]);

export const EDITABLE_FIELDS: readonly EditableField[] = [
  ...CONTACT_FIELDS,
  ...HOME_FIELDS,
  ...HOME_SECTION_FIELDS,
  ...ABOUT_FIELDS,
  ...COURSE_FIELDS,
  ...PAGE_FIELDS,
  ...CLOSING_FIELDS,
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
/**
 * Every public route on this site.
 *
 * Exists so that "site chrome" — a field whose `renders.route` is `'*'` — has
 * something concrete to expand to when the admin saves and the caches need
 * clearing. `tests/site-content.test.ts` asserts every entry resolves to a
 * `page.tsx`, so this cannot list a route that does not exist.
 *
 * Course pages are appended from `publishedCourses` rather than written out,
 * for the same reason the sitemap does it: a course must appear here the moment
 * it is published and never before.
 */
export const PUBLIC_ROUTES: readonly string[] = [
  '/',
  '/about',
  '/courses',
  '/faculty',
  '/results',
  '/stories',
  '/announcements',
  '/gallery',
  '/videos',
  '/reviews',
  '/contact',
  '/admissions',
];

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
  /*
    ADDED IN TOPIC 12, after an inventory of every public page.

    Page headings, the sentences under them and the closing invitations all
    BECAME editable in that pass. What follows is what deliberately did not, so
    this list stays a true account of where the line is rather than a list of
    things nobody had got to yet.
  */
  {
    label: 'The small label above each heading ("Results", "Our teachers")',
    why: 'A two-word typographic label rather than a sentence. The slot is built for two words and a paragraph in it breaks the top of the page.',
  },
  {
    label: 'The wording on buttons, and where they go',
    why: 'These two travel together. An editable label over a fixed destination is how you end up with a button reading "WhatsApp us" that opens the enquiry form. The phone number they dial IS yours to change, under Contact details.',
  },
  {
    label: 'What a page says when it has nothing to show yet',
    why: 'The gallery, videos and reviews pages say plainly that there is nothing there rather than filling the space. That sentence is the honesty rule the rebuild was commissioned to fix, so it is not something a future owner can soften.',
  },
  {
    label: 'The sentence about where reviews come from',
    why: 'It names the service the reviews were left on and states that the institute neither writes nor edits them. That is the claim the whole review system exists to make true, so it cannot be reworded from inside the admin.',
  },
];
