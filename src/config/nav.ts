import { publishedCourses } from './institute';

export type NavLink = {
  href: string;
  label: string;
  /** Rendered as a dropdown when present. */
  children?: ReadonlyArray<{ href: string; label: string }>;
};

/**
 * Primary navigation — Master Plan §01.
 *
 * Seven items plus one distinct Enquire action. Courses is the only dropdown.
 * Gallery deliberately lives in the footer, not here: it is a page people
 * browse once already interested, not one they navigate to first.
 *
 * Routes are added here only when the page actually exists. A nav link to an
 * unwritten page is a 404 in the most damaging place on the site.
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
  { href: '/faculty', label: 'Faculty' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/videos', label: 'Videos' },
  { href: '/contact', label: 'Contact' },
];

/** Footer groups. Same rule: only routes that exist. */
export const footerNav: ReadonlyArray<{ heading: string; links: ReadonlyArray<NavLink> }> = [
  {
    heading: 'Institute',
    links: [
      { href: '/about', label: 'About' },
      { href: '/faculty', label: 'Faculty' },
      { href: '/gallery', label: 'Gallery' },
    ],
  },
  {
    heading: 'Programmes',
    links: [{ href: '/courses', label: 'All courses' }],
  },
  {
    heading: 'Evidence',
    links: [
      { href: '/results', label: 'Results' },
      { href: '/reviews', label: 'Google reviews' },
      { href: '/videos', label: 'Videos' },
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
