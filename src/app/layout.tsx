import type { Metadata, Viewport } from 'next';
import { Source_Serif_4, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { institute } from '@/config/institute';
import { SITE_URL, instituteJsonLd } from '@/lib/seo';
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
  weight: ['400', '500', '600'],
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

        {/* EducationalOrganization only. No AggregateRating / Review — see
            src/lib/seo.ts for why. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(instituteJsonLd()) }}
        />
      </body>
    </html>
  );
}
