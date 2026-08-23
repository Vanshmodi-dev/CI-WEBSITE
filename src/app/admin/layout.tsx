import type { Metadata } from 'next';

/**
 * Outer admin layout.
 *
 * Deliberately does NOT authenticate — /admin/login lives underneath it and
 * must stay reachable. Authentication happens in (dashboard)/layout.tsx and,
 * independently, inside every admin server action.
 *
 * `noindex` here covers every admin route, including the sign-in page.
 */
export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Commerce Insight Admin' },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
