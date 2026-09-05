import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import { publicCsp } from './src/lib/csp';

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
 *
 * PHASE 22 MOVED THE STRING, NOT THE POLICY. The directives now live in
 * `src/lib/csp.ts`, which builds this baseline and the admin's from one place
 * and adds `'unsafe-eval'` to `script-src` FOR THE DEV SERVER ONLY. React's
 * development build probes `eval()` while reading the RSC payload and logs a
 * console error on every page when a CSP forbids it; the measurement and the
 * safety argument are in that file's header. Production is byte-for-byte the
 * policy documented above.
 *
 * THE DEV FLAG COMES FROM THE CONFIG PHASE, NOT FROM `process.env.NODE_ENV`.
 * `next build` always runs as PHASE_PRODUCTION_BUILD, so a stray
 * `NODE_ENV=development` in someone's shell cannot bake the token into a
 * production manifest — which is where these headers are resolved and from
 * which `next start` serves them.
 */
const securityHeaders = (csp: string) => [
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

  /**
   * The spreadsheet import posts a file to a Server Action, and Next caps that
   * body at 1 MB by default.
   *
   * This is set ABOVE `UPLOAD_LIMITS.maxBytes` (2 MB, in src/lib/import/run.ts)
   * on purpose. Whichever limit is lower is the one a teacher meets, and ours
   * produces a sentence they can act on - "that file is larger than 2 MB, split
   * it" - where the framework's produces a 500. Phase 12 found that by
   * uploading a 1.5 MB file and getting a server error.
   *
   * A file beyond 3 MB still hits the framework limit. That is far outside the
   * ~200 KB a thousand-row results file actually weighs, and the alternative is
   * letting an admin post arbitrarily large bodies.
   */
  experimental: {
    /*
      Raised from 3 MB to 8 MB in Phase 16 for photo uploads.

      `MEDIA_LIMITS.maxBytes` is 6 MB — a photograph straight off a phone. This
      sits above it, with room for multipart overhead, for the same reason the
      CSV limit does: whichever cap is lower is the one a teacher meets, and
      ours produces a sentence they can act on where the framework's produces a
      500 with no explanation.

      It is NOT a licence to post 8 MB. Every upload path checks its own limit
      first, before the bytes are read.
    */
    serverActions: { bodySizeLimit: '8mb' },
  },

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
    /*
      ⚠ ONE ENTRY PER HOST, EACH WITH A PATH. No wildcard hostnames.

      Every entry here is a host this site will ask its own image optimiser to
      fetch from on request. A wildcard would turn the optimiser into an open
      proxy that anybody can point at anything by crafting a URL.

      If a host is added here, `netlify.toml`'s `[images] remote_images` needs
      the matching entry too — Netlify Image CDN keeps its own allowlist and
      fails closed without it.
    */
    remotePatterns: [
      // YouTube thumbnails (Phase 5).
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/**' },
      /*
        Cloudinary (5 Sep 2026), scoped to this account's delivery prefix.

        Uploaded photographs are normally served through `/media/[key]`, which
        is same-origin and needs no entry here at all. This exists so that
        `next/image` can also be pointed at a Cloudinary URL directly — the
        share-card and any future direct-CDN rendering — without reopening the
        allowlist later under time pressure.

        The pathname is NOT `/**`: it is narrowed to Cloudinary's IMAGE DELIVERY
        path, so the optimiser cannot be aimed at the raw/video/fetch endpoints
        on that host. It does NOT pin the cloud name — that value arrives from
        the environment at runtime and is not reliably present when this config
        is evaluated at build time, so hardcoding it would break the build on a
        host that sets it later. The residual exposure is images from other
        Cloudinary accounts, which is a public CDN either way.

        The CSP is deliberately unchanged. `img-src` does not list
        res.cloudinary.com because nothing renders a Cloudinary URL directly:
        `/media/[key]` is same-origin, and `next/image` re-serves optimised
        output from `/_next/image`, which is also same-origin. Add the host to
        `src/lib/csp.ts` only when something genuinely emits a bare Cloudinary
        `<img src>`.
      */
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/*/image/upload/**',
      },
    ],
  },

  poweredByHeader: false,
};

/**
 * Config as a function, so the phase is available. Everything above is
 * phase-independent; only the CSP asks which phase it is being built for.
 */
export default function config(phase: string): NextConfig {
  const csp = publicCsp({ dev: phase === PHASE_DEVELOPMENT_SERVER });

  return {
    ...nextConfig,
    async headers() {
      return [{ source: '/:path*', headers: securityHeaders(csp) }];
    },
  };
}
