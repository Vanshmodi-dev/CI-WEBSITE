/**
 * EVERY USER-VISIBLE SENTENCE ON THE PUBLIC SITE THAT IS NOT EDITABLE, AND WHY.
 *
 * =============================================================================
 * WHAT THIS IS FOR
 * =============================================================================
 * The owner requirement for this project is that the institute can change the
 * website without a developer — "website ki har information, chhoti ya badi,
 * admin panel se change ho". `site-content.ts` is the answer to the first half:
 * it declares what CAN be changed, and a test proves each of those keys is
 * genuinely rendered.
 *
 * Nothing answered the second half. There was no way to ask "what words are on
 * this site that the institute CANNOT change, and did anybody decide that?" —
 * and the honest answer, when Phase 18 finally asked, was that at least one of
 * them was not a decision at all. The footer carried this sentence on every
 * page of the site:
 *
 *     Commerce coaching in Pratap Nagar, Jaipur for Class XI and XII,
 *     CA Foundation, CA Intermediate and CMA.
 *
 * It names the exact list of programmes the institute runs. It appeared in no
 * registry, in no code-owned list and in no report. The day a course is added
 * or dropped it is wrong sitewide, and correcting it needs a developer — which
 * is precisely the dependency this CMS exists to remove. It is editable now
 * (`footer.description`); it was found by a scan, not by reading.
 *
 * So this file makes the second half mechanical. `tests/content-coverage.test.ts`
 * extracts every user-visible string from the public pages and the components
 * they render, and requires each one to be EITHER a registry fallback OR listed
 * below with a reason. A new sentence that is neither fails the test, and the
 * person adding it has to decide which it is.
 *
 * =============================================================================
 * ⚠ IF THE TEST FAILS BECAUSE YOU ADDED OR CHANGED SOME TEXT
 * =============================================================================
 * That is the test doing its job, and there are exactly two right answers:
 *
 *   1. The institute should be able to change this. Add it to the registry in
 *      `site-content.ts` with a key, a length limit and a render location.
 *   2. It should stay in code. Add it below, under the reason that fits. If no
 *      reason fits, that is a strong hint the answer is actually (1).
 *
 * Adding a string here to silence the test, without believing the reason, makes
 * this file worse than nothing.
 */

/** Why a piece of wording stays in code. */
export type CodeOwnedReason =
  | 'cta'
  | 'label'
  | 'section'
  | 'breadcrumb'
  | 'empty'
  | 'policy'
  | 'form'
  | 'control'
  | 'card'
  | 'a11y'
  | 'platform'
  | 'credit';

/**
 * The argument for each category, in full.
 *
 * These are the sentences a future maintainer will be arguing with, so they are
 * written as arguments rather than as labels.
 */
export const CODE_OWNED_REASONS: Readonly<Record<CodeOwnedReason, string>> = {
  cta: 'The wording on a button or link, which travels with a fixed destination. An editable label over a fixed target is how you end up with a button reading "WhatsApp us" that opens the enquiry form. The phone number these dial IS editable, under Contact details.',

  label: 'A field label in a fixed slot — "Phone", "Email", "Opening hours". It names the value beside it, and the value is the editable part. A label that disagreed with its own field would be worse than one that cannot be changed.',

  section: 'A short heading for a band inside a page, built for two or three words. The page-level heading and standfirst above it ARE editable; this is the typographic furniture between them, and a paragraph in one of these slots breaks the layout it sits in.',

  breadcrumb: 'A breadcrumb naming the section a page belongs to. It is generated from the route, so editing it would let the trail disagree with the address bar.',

  empty: 'What a page says when it has nothing to show. The gallery, videos, reviews, results and stories pages say plainly that there is nothing there rather than filling the space with something invented. That sentence is the honesty rule the rebuild was commissioned to fix, so it is deliberately not something a future owner can soften. It is also text a visitor sees only until the institute adds real content.',

  policy: 'A claim about how the institute behaves — that results are published only with written permission, that reviews are neither written nor edited here, that the map contacts Google only when asked. These are the promises the whole rebuild exists to make true. A promise that can be reworded from inside the admin is not a promise.',

  form: 'Wording inside the enquiry form: a placeholder, a helper sentence, the confirmation after sending. These are tied to the validation rules and the fields beside them, and changing one without the other misleads the person filling it in.',

  control: 'Text that operates a widget — Open menu, Close, Next, Previous, Show the map, the All filter. It describes what the control does, so editing it makes the control lie.',

  card: 'A fixed part of a card’s structure — the three headings of a student story, the label on a reply, the unit beside a score. The CONTENT of each is a record the institute edits; these name the parts.',

  a11y: 'Text that exists only for assistive technology, such as warning that a link opens in a new tab. It is a convention screen-reader users rely on, not editorial copy.',

  platform: 'The name of an external service — YouTube, Instagram, WhatsApp, Google Maps. Renaming somebody else’s product misleads the reader about where a link goes. Whether the link appears at all IS editable, under Contact details.',

  credit: 'The agency credit in the footer. It names who built the site, which is a fact about the world rather than institute copy — and it is the one line on the page the institute is not the author of, so it is not theirs to reword.',
};

export type CodeOwnedString = {
  /** The exact rendered text, entities decoded, whitespace collapsed. */
  text: string;
  why: CodeOwnedReason;
};

/**
 * Every user-visible string on the public site that is not in the registry.
 *
 * Kept in one alphabetical list rather than grouped by page: the same wording
 * appears on several pages (`Send an enquiry` is on eight), and a per-page list
 * would record it eight times and let seven of them go stale.
 */
export const CODE_OWNED_COPY: readonly CodeOwnedString[] = [
  /*
    ⚠ THE BLOCK BELOW ARRIVED WITH PHASE 19's PROP SCAN.

    Everything down to the next comment was invisible until the scanner learned
    to read `title=`, `aria-label=` and friends. None of it turned out to be a
    defect — they are eyebrows, form labels and accessible region names — but
    nobody had ever decided that, because nothing had ever shown them the list.
    The three genuine defects in the same blind spot are recorded in
    tests/content-coverage.test.ts.
  */
  { text: 'Admissions open', why: 'section' },
  { text: 'Anything you would like to ask?', why: 'form' },
  { text: 'Breadcrumb', why: 'a11y' },
  { text: 'Commerce only', why: 'section' },
  { text: 'Filter photographs', why: 'a11y' },
  { text: 'Filter videos by subject', why: 'a11y' },
  { text: 'Meet your mentors', why: 'section' },
  { text: 'Mobile', why: 'a11y' },
  { text: 'Our teachers', why: 'section' },
  { text: 'Phone number', why: 'form' },
  { text: 'Photograph viewer', why: 'a11y' },
  { text: 'Primary', why: 'a11y' },
  { text: 'Result pages', why: 'a11y' },
  { text: 'Site menu', why: 'a11y' },
  { text: 'Story pages', why: 'a11y' },
  { text: 'Student stories', why: 'section' },
  { text: 'Which class or course?', why: 'form' },
  { text: 'Your name', why: 'form' },
  { text: '(opens in a new tab)', why: 'a11y' },
  { text: '← Previous', why: 'control' },
  { text: 'Address', why: 'label' },
  { text: 'All', why: 'control' },
  { text: 'All courses and details', why: 'cta' },
  { text: 'All programmes', why: 'section' },
  { text: 'All results', why: 'cta' },
  { text: 'All reviews', why: 'cta' },
  { text: 'All stories', why: 'cta' },
  { text: 'All teachers', why: 'cta' },
  { text: 'All videos', why: 'cta' },
  { text: 'Alternate', why: 'label' },
  { text: 'Ask about a course', why: 'cta' },
  { text: 'Ask about this course', why: 'cta' },
  { text: 'Close', why: 'control' },
  { text: 'Close menu', why: 'control' },
  { text: 'Contact details', why: 'section' },
  { text: 'Course details', why: 'section' },
  { text: 'Courses', why: 'breadcrumb' },
  { text: 'Current updates', why: 'section' },
  { text: 'Email', why: 'label' },
  { text: 'Enquire', why: 'cta' },
  { text: 'Enquire about a batch', why: 'cta' },
  { text: 'Enquire now', why: 'cta' },
  { text: 'Explore courses', why: 'cta' },
  { text: 'Explore our courses', why: 'cta' },
  { text: 'Find us', why: 'section' },
  { text: 'Get directions', why: 'cta' },
  { text: 'Instagram', why: 'platform' },
  { text: 'marks', why: 'card' },
  { text: 'Message on WhatsApp', why: 'cta' },
  { text: 'Message us', why: 'cta' },
  {
    text: 'New batch dates will appear here as soon as they are confirmed. Ask us and we will tell you when the next one starts.',
    why: 'empty',
  },
  { text: 'Next', why: 'control' },
  { text: 'Next →', why: 'control' },
  { text: 'No photographs here yet', why: 'empty' },
  { text: 'No reviews to show here yet', why: 'empty' },
  { text: 'No updates at the moment', why: 'empty' },
  { text: 'No videos here yet', why: 'empty' },
  { text: 'Nothing published for that filter yet', why: 'empty' },
  {
    text: 'Only the name and phone number are needed. Everything else helps us answer you better.',
    why: 'form',
  },
  { text: 'Open in Google Maps', why: 'platform' },
  { text: 'Open menu', why: 'control' },
  { text: 'Opening hours', why: 'label' },
  { text: 'Our reply', why: 'card' },
  { text: 'Phone', why: 'label' },
  { text: 'Photographs', why: 'section' },
  { text: 'Plan a visit', why: 'cta' },
  { text: 'Please choose…', why: 'form' },
  { text: 'Prefer to talk?', why: 'section' },
  { text: 'Previous', why: 'control' },
  { text: 'Programmes', why: 'section' },
  { text: 'Published results', why: 'section' },
  { text: 'Published stories', why: 'section' },
  { text: 'Results will be published here', why: 'empty' },
  { text: 'Reviews', why: 'section' },
  { text: 'See all results', why: 'cta' },
  { text: 'See our results', why: 'cta' },
  { text: 'See the gallery', why: 'cta' },
  { text: 'Send an enquiry', why: 'cta' },
  { text: 'Show the map', why: 'control' },
  { text: 'Student stories will appear here', why: 'empty' },
  { text: 'Talk to us', why: 'section' },
  { text: 'Teaching staff', why: 'section' },
  { text: 'Thank you — we have your enquiry.', why: 'form' },
  { text: 'The challenge', why: 'card' },
  {
    text: 'The map loads from Google only when you ask for it, so nothing is sent to them before you do.',
    why: 'policy',
  },
  { text: 'The outcome', why: 'card' },
  { text: 'TradyPerch', why: 'credit' },
  { text: 'Upcoming batches', why: 'section' },
  { text: 'Videos', why: 'section' },
  { text: 'View programme →', why: 'cta' },
  { text: 'Visit us', why: 'cta' },
  { text: 'Watch on YouTube', why: 'platform' },
  { text: 'We are putting this page together', why: 'empty' },
  {
    text: 'We are putting this together. In the meantime, the best way to see how we teach is to sit in on a class — you are welcome to visit during teaching hours.',
    why: 'empty',
  },
  {
    text: 'We are putting this together. In the meantime, the best way to see the place is to come and look at it — you are welcome to visit during teaching hours.',
    why: 'empty',
  },
  {
    text: 'We publish a student’s result only once they have given us permission in writing. As soon as we have that, their results will appear on this page.',
    why: 'policy',
  },
  {
    text: 'We publish a student’s story only with their written permission, and we ask separately before showing a photograph. Stories will appear on this page once we have that.',
    why: 'policy',
  },
  { text: 'We use your details only to reply to this enquiry.', why: 'policy' },
  {
    text: 'We would rather introduce our teachers properly than put up names and photographs in a hurry. In the meantime, the fastest way to meet them is to visit — or call and ask who teaches your subject.',
    why: 'empty',
  },
  { text: 'We would rather show you real reviews than write our own.', why: 'policy' },
  {
    text: 'We would rather show you the real place than a stock photograph of somebody else’s.',
    why: 'policy',
  },
  {
    text: 'We would rather you watched the teaching than read our description of it.',
    why: 'policy',
  },
  { text: 'Website', why: 'form' },
  { text: 'What changed', why: 'card' },
  { text: 'What we teach', why: 'section' },
  { text: 'WhatsApp', why: 'platform' },
  { text: 'WhatsApp us', why: 'cta' },
  {
    text: 'When there is news about admissions or a new batch, it will appear here. Notices come down by themselves once they are out of date.',
    why: 'empty',
  },
  { text: 'Where to find us', why: 'section' },
  { text: 'YouTube', why: 'platform' },
];

/**
 * Words that appear TWICE on the site — once editable, once not.
 *
 * =============================================================================
 * WHY THIS LIST HAS TO EXIST
 * =============================================================================
 * The content scan matches on TEXT, and text is not unique. "Opening hours" is
 * the editable footer heading `footer.hours.heading`, and it is also a
 * hard-coded eyebrow on the contact page above the same information. Both are
 * correct. The scan cannot tell them apart, because they are the same
 * characters in two files.
 *
 * A first version of the test simply refused any string that was both a
 * registry fallback and a code-owned entry, on the theory that one of them must
 * be a mistake. It is not — every one of the eight below is a two-or-three word
 * typographic label in a fixed slot, which is exactly the category the registry
 * already declares as code-owned.
 *
 * So the collision is acknowledged rather than forbidden. What the test still
 * enforces is that the list is CLOSED: a new collision is a new question — "is
 * this the editable one or a second copy of it?" — and somebody has to answer
 * it rather than have a stale duplicate appear next to a field a teacher
 * believes they are editing.
 */
export const SHARED_WORDING: readonly string[] = [
  'Courses',
  'Opening hours',
  'Programmes',
  'Reviews',
  'Talk to us',
  'Upcoming batches',
  'Videos',
  'What we teach',
];
