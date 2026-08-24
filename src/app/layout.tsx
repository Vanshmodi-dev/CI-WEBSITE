import type { Metadata, Viewport } from 'next';
import { Source_Serif_4, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { institute } from '@/config/institute';
import { SITE_URL, siteJsonLd } from '@/lib/seo';
import { isIndexable } from '@/config/launch';
import { SiteHeader } from '@/components/domain/site-header';
import { SiteFooter } from '@/components/domain/site-footer';
import { WhatsAppButton } from '@/components/domain/whatsapp-button';

/**
 * Fonts are SELF-HOSTED and subset by next/font at build time — no runtime
 * request to a third-party font host, which would be render-blocking on the
 * mid-range Android devices this audience uses (Master Plan §18).
 *
 * The pairing mirrors the logo: its wordmark is a high-contrast serif and its
 * tagline a humanist sans. Both families also carry Devanagari cuts, so a
 * future Hindi surface would need no new typeface.
 *
 * -----------------------------------------------------------------------------
 * WHAT PHASE 9 MEASURED, AND WHAT IT CHANGED
 * -----------------------------------------------------------------------------
 * Fonts were 118.6 KB — the single heaviest category on the page after the
 * framework, and all of it preloaded, so five font files competed for bandwidth
 * at the exact moment the LCP text needed to paint.
 *
 * Serif and sans are variable fonts: one file each covers every weight we use,
 * 49.7 KB and 39.3 KB. Those stay preloaded — they set the headline and the
 * body, which IS the largest contentful paint on every page.
 *
 * Mono was the problem. Google serves IBM Plex Mono as three static files, one
 * per weight, 29.5 KB in total, and weight 500 was used nowhere in the codebase
 * at all. Two changes, no design change:
 *   · weight 500 dropped        — 9.8 KB and one request that bought nothing
 *   · preload turned off        — mono sets the 11px uppercase eyebrow labels
 *                                 and admin chrome, never an LCP element, so it
 *                                 has no business in the critical path.
 *                                 `display: swap` covers the swap-in.
 */
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-source-serif',
  weight: ['400', '600', '700'],
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-sans',
  weight: ['400', '500', '600'],
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-mono',
  // 400 for admin metadata rows, 600 for the `.eyebrow` label. Nothing in the
  // app renders mono at 500 — verified before removing it, and a test in
  // tests/seo.test.ts fails if a `font-medium` + `font-mono` pairing appears.
  weight: ['400', '600'],
  // Off the critical path on purpose — see the note above.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${institute.name} — ${institute.tagline}`,
    template: `%s — ${institute.name}`,
  },
  description: `Commerce coaching in ${institute.locality} for Class XI and XII, CA Foundation, CA Intermediate and CMA.`,
  applicationName: institute.name,
  formatDetection: { telephone: true, address: true, email: false },
  // Governed by src/config/launch.ts — never edited here. That file requires
  // both a reviewed code change and a real production domain before anything
  // becomes indexable.
  robots: isIndexable()
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0A121C' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-IN"
      className={`${sourceSerif.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        {/* Skip link — Master Plan §20. Visible only on keyboard focus. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-navy-800 focus:px-4 focus:py-3 focus:text-white"
        >
          Skip to content
        </a>

        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        <WhatsAppButton />

        {/* EducationalOrganization + WebSite, as one @graph so the WebSite's
            publisher reference resolves. No AggregateRating, no Review, no
            SearchAction — see src/lib/seo.ts for why each is absent. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }}
        />
      </body>
    </html>
  );
}
