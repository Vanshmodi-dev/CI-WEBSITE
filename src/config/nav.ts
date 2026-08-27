import { publishedCourses } from './institute.ts';

export type NavLink = {
  href: string;
  label: string;
  children?: ReadonlyArray<{ href: string; label: string }>;
};

/**
 * Primary navigation — Master Plan §01.
 *
 * ⚠ THE RULE: a route appears here ONLY if the page exists.
 *
 * This was not true before Phase 6. The navigation listed /faculty, /reviews,
 * /videos and /gallery, none of which had been built — every one was a 404
 * served from the most prominent element on the site. Those four are removed
 * until their pages exist and the content behind them is confirmed:
 *
 *   /faculty  — BUILT IN PHASE 16, TOPIC 6. The page exists, so by the rule
 *               above it belongs here. It is HIDDEN BY DEFAULT until the
 *               institute adds staff: see HIDDEN_UNTIL_POPULATED below.
 *   /reviews  — BUILT IN PHASE 16, TOPIC 7. The page exists and degrades
 *               honestly with no payload, so by the rule above it belongs
 *               here. HIDDEN BY DEFAULT until the engine is activated.
 *   /videos   — needs the YouTube channel ID (not supplied)
 *   /gallery  — BUILT IN PHASE 16, TOPIC 8. The page exists and has a real
 *               empty state, so by the rule above it belongs here. HIDDEN BY
 *               DEFAULT until the institute adds photographs.
 *
 * Adding a link here before its page exists is the one change that must not be
 * made casually.
 */
export const primaryNav: ReadonlyArray<NavLink> = [
  { href: '/about', label: 'About' },
  {
    href: '/courses',
    label: 'Courses',
    children: publishedCourses.map((c) => ({
      href: `/courses/${c.slug}`,
      label: c.name,
    })),
  },
  { href: '/faculty', label: 'Teachers' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/results', label: 'Results' },
  { href: '/stories', label: 'Stories' },
  { href: '/announcements', label: 'Updates' },
  { href: '/contact', label: 'Contact' },
];

/**
 * Menu entries whose page exists but which start HIDDEN.
 *
 * The Phase 6 rule — "a route appears here only if the page exists" — is about
 * never linking to a 404. It is silent on a page that exists and is empty, and
 * an empty section is a different kind of weak: a visitor who clicks Teachers
 * and finds "we are putting this together" learns that the institute has not
 * finished its website.
 *
 * So the route is registered (it exists, it is reachable, it is in the
 * sitemap), and the MENU entry defaults to hidden. The teacher turns it on in
 * Website text once there are teachers to show. That reuses the visibility
 * toggle Phase 15 already built rather than adding a second mechanism, and it
 * puts the decision with the person who knows whether the page is ready.
 */
export const HIDDEN_UNTIL_POPULATED: readonly string[] = [
  '/faculty',
  '/reviews',
  '/gallery',
];

/** Footer groups. Same rule: only routes that exist. */
export const footerNav: ReadonlyArray<{
  heading: string;
  links: ReadonlyArray<NavLink>;
}> = [
  {
    heading: 'Institute',
    links: [
      { href: '/about', label: 'About' },
      { href: '/announcements', label: 'Updates' },
    ],
  },
  {
    heading: 'Programmes',
    links: [{ href: '/courses', label: 'All courses' }],
  },
  {
    heading: 'Students',
    links: [
      { href: '/results', label: 'Results' },
      { href: '/stories', label: 'Student stories' },
    ],
  },
  {
    heading: 'Admissions',
    links: [
      { href: '/admissions', label: 'Admissions & enquiry' },
      { href: '/contact', label: 'Contact' },
    ],
  },
];
