import type { NextConfig } from 'next';

/**
 * Security headers — Master Plan §19.
 *
 * =============================================================================
 * ⚠ script-src CARRIES 'unsafe-inline'. READ THIS BEFORE CHANGING IT.
 * =============================================================================
 *
 * It used to read `script-src 'self'`, with a comment saying the policy was
 * deliberately strict and must not be weakened. That comment was written
 * without measuring, and the policy did not do what it claimed. It broke the
 * site.
 *
 * WHAT PHASE 9 MEASURED. Lighthouse against a production build reported four
 * blocked inline scripts and `Minified React error #412`. Next.js streams the
 * React Server Component payload as five inline `<script>self.__next_f.push(…)`
 * blocks; `script-src 'self'` blocks every one of them, so React never
 * hydrated. In practice that meant the mobile navigation drawer — the ONLY
 * navigation below the `lg` breakpoint, on a site built mobile-first for
 * parents on Android — could not open. The site had been shipping that way
 * since Phase 3.
 *
 * WHAT WAS TRIED FIRST. `experimental.sri` was built and measured: it adds
 * `integrity` attributes to the seven EXTERNAL script tags and leaves all five
 * inline blocks unhashed, so the violation remains. It does not solve this.
 *
 * WHY NOT A NONCE. The nonce approach in Next's own CSP guide requires every
 * page to be dynamically rendered — the documentation is explicit that "static
 * optimization and Incremental Static Regeneration (ISR) are disabled". This
 * site's entire publish-and-revalidate architecture is built on ISR, and Phase
 * 8 verified it end to end. Trading that away inside a performance phase, to
 * fix a bug, would be the wrong order of operations.
 *
 * SO: the documented no-nonce configuration from that same guide, which
 * restores a working site today.
 *
 * WHAT IT COSTS, PLAINLY. An injected inline `<script>` would now execute. The
 * mitigating facts are that every string rendered on this site passes through
 * React's escaping, there is no `dangerouslySetInnerHTML` outside our own
 * JSON-LD, and no user-supplied HTML is rendered anywhere. That is a smaller
 * risk than a site whose menu does not open — but it IS a real reduction.
 *
 * PHASE 10 SETTLED IT, AND THE ANSWER WAS NOT SITEWIDE. Every /admin route is
 * already force-dynamic, so nonces cost it nothing — and the admin is where the
 * session cookie and every student record live. src/proxy.ts therefore
 * OVERRIDES this policy for /admin with a nonce + 'strict-dynamic' CSP, and the
 * policy below remains the baseline for the public site and the fallback for
 * admin routes if the proxy ever fails to run. Fail-safe, not fail-open.
 *
 * The residual risk this baseline accepts is bounded by what the public pages
 * actually render: no user-supplied HTML anywhere, no dangerouslySetInnerHTML
 * outside our own JSON-LD (which is now unicode-escaped), and every string
 * passed through React's escaping.
 *
 * NOTE ON 'unsafe-inline' FOR STYLES: Next.js injects inline <style> during
 * streaming SSR, so style-src needs it for the same reason. Pre-existing and
 * documented since Phase 3.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com",
  "font-src 'self'",
  "connect-src 'self'",
  // youtube-nocookie only — and only once a visitor clicks play (§14).
  "frame-src 'self' https://www.youtube-nocookie.com https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Fail the build on type errors. A client project should never deploy with
  // them suppressed.
  //
  // Next 16 removed the built-in `next lint` and its `eslint` config key, so
  // linting is a separate step: `npm run lint`, enforced in CI (.github/
  // workflows/ci.yml) and by `npm run verify`.
  typescript: { ignoreBuildErrors: false },

  /**
   * Master Plan §18 — AVIF first, then WebP.
   *
   * PHASE 9 NARROWED THE SIZE LISTS. Next's defaults offer sixteen candidate
   * widths up to 3840px, so the 40px header logo was emitting a fifteen-entry
   * srcset and the optimiser would render a 3840px version of it on request.
   * The browser never picks those — `sizes="40px"` decides that — but the URLs
   * are public, and each one is a real image-optimisation job someone else can
   * ask a server to do.
   *
   * The lists below cover what this site actually renders: avatars and the
   * logo at `imageSizes`, and full-width imagery at `deviceSizes` for when the
   * institute eventually supplies photographs. Anything larger than 1920 is
   * removed because nothing on the site is ever displayed that wide.
   */
  images: {
    formats: ['image/avif', 'image/webp'],
    // Fixed-size images: monograms/portraits (48, 64), the header logo (40 →
    // served at 48/96 for 1x/2x), and headroom for a larger portrait.
    imageSizes: [48, 64, 96, 128, 256],
    // Responsive images, for future photography. Four breakpoints, not eight.
    deviceSizes: [640, 828, 1080, 1920],
    // Optimised renders are immutable for a given source+width+quality, so a
    // short TTL only buys repeated work. One week.
    minimumCacheTTL: 604800,
    remotePatterns: [
      // YouTube thumbnails (Phase 5). Nothing else is permitted.
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/**' },
    ],
  },

  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
