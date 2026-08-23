import { publishedCourses } from './institute';

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
 *   /faculty  — needs verified credentials and portraits (not supplied)
 *   /reviews  — needs the Review Engine activated (client action pending)
 *   /videos   — needs the YouTube channel ID (not supplied)
 *   /gallery  — needs photography (not supplied)
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
  { href: '/results', label: 'Results' },
  { href: '/stories', label: 'Stories' },
  { href: '/announcements', label: 'Updates' },
  { href: '/contact', label: 'Contact' },
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
