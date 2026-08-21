import type { NextConfig } from 'next';

/**
 * Security headers — Master Plan §19.
 *
 * The CSP is deliberately strict and carries no 'unsafe-inline' for scripts.
 * The TP Reviews Engine's integration kit is built to work under exactly this
 * policy, so we must not weaken it to accommodate anything else later.
 *
 * NOTE ON 'unsafe-inline' FOR STYLES: Next.js injects inline <style> during
 * streaming SSR, so style-src needs it until we adopt a nonce strategy. That
 * is a known, documented compromise — not an oversight. Scripts remain strict.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self'",
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

  // Master Plan §18 — AVIF first, then WebP.
  images: {
    formats: ['image/avif', 'image/webp'],
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
