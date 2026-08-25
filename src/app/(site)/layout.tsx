import { SiteHeader } from '@/components/domain/site-header';
import { SiteFooter } from '@/components/domain/site-footer';
import { WhatsAppButton } from '@/components/domain/whatsapp-button';
import { siteJsonLd, jsonLdScript } from '@/lib/seo';

/**
 * The PUBLIC site chrome.
 *
 * =============================================================================
 * WHY THIS ROUTE GROUP EXISTS (Phase 14)
 * =============================================================================
 * All of this used to live in the root layout, which meant it rendered on
 * EVERY route - including every `/admin` page.
 *
 * Phase 14 measured what that cost, in a real browser, signed in as an admin:
 *
 *   /admin at 360px  - public header 65px, public footer 1208px,
 *                      total page 2508px. The marketing footer was 48% of the
 *                      teacher's scroll on their own dashboard.
 *   /admin at 1280px - header 81px, footer 561px of a 1543px page.
 *
 * Plus a floating WhatsApp "message us" button over the admin panel, a second
 * set of navigation links duplicating the admin's own, and the public
 * EducationalOrganization JSON-LD on pages that are `noindex` anyway.
 *
 * It had never been caught because no suite looked at an admin page below
 * 1280px: verify-ux.mjs tests nine viewports across PUBLIC routes only, and
 * verify-teacher.mjs pinned the admin to 1280x900 on the assumption that "a
 * teacher is on a laptop for admin work".
 *
 * A route group is the fix rather than a CSS override because `(site)` is
 * PATH-TRANSPARENT: `src/app/(site)/about/page.tsx` still serves `/about`. No
 * URL changes, no redirects, and the chrome is genuinely not rendered for the
 * admin rather than merely hidden with `display: none` after being sent.
 *
 * The root layout keeps only `<html>`, `<body>` and the skip link - the things
 * every route genuinely shares.
 */
export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <WhatsAppButton />

      {/* EducationalOrganization + WebSite, as one @graph so the WebSite's
          publisher reference resolves. No AggregateRating, no Review, no
          SearchAction - see src/lib/seo.ts for why each is absent.

          Public routes only: the admin is noindex, so structured data there
          describes the institute to nobody. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(siteJsonLd()) }}
      />
    </>
  );
}
