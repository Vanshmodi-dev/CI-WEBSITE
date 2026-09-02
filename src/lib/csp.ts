/**
 * The two Content Security Policies this site serves, in one place.
 *
 * `next.config.ts` sends the public baseline for every route; `src/proxy.ts`
 * overrides it for `/admin` with a nonce policy. Both used to build their own
 * string, which was fine while the only difference between them was deliberate
 * — and stopped being fine the moment a directive had to change in BOTH for the
 * same reason. Phase 22 was that moment. The comments in those two files
 * explain WHY each policy is shaped the way it is and are still the place to
 * read that; this file is only where the strings are assembled.
 *
 * =============================================================================
 * ⚠ THE `dev` FLAG ADDS 'unsafe-eval'. IT MUST NEVER REACH PRODUCTION.
 * =============================================================================
 *
 * WHAT WAS OBSERVED. Every page under `next dev` logged, once:
 *
 *   "eval() is not supported in this environment. If this page was served with
 *    a Content-Security-Policy header, make sure that 'unsafe-eval' is
 *    included. React will never use eval() in production mode."
 *
 * WHERE IT COMES FROM — measured, not guessed. The string exists in exactly one
 * kind of file in `node_modules`: React's `*.development.js` builds. The caller
 * is `checkEvalAvailabilityOnceDev()` in
 * `react-server-dom-turbopack-client.browser.development.js`, which runs
 * `(0, eval)("null")` inside a try/catch and logs this if it throws. It is
 * invoked from `createResponse` — the function that reads the RSC flight
 * payload — so it fires on every page load and every navigation, on every
 * route. `/gallery` was where it was noticed, not where it lives.
 *
 * The whole module is wrapped in `"production" !== process.env.NODE_ENV`. Of
 * the 36 chunks Turbopack served in dev, that React file was the ONLY one
 * containing `eval(` or `new Function(`; Turbopack's own HMR client contains
 * neither, so hot reload never needed this. Our own source contains neither
 * either — `src/`, `scripts/` and `tests/` have zero matches.
 *
 * WHAT IT BUYS IN DEV. `createFakeServerFunction` eval's a small generated
 * module so a Server Action gets a real named frame with a `//# sourceURL`,
 * which is how a server-side stack becomes readable in the browser console.
 * Next's own CSP guide states the position plainly: "In development,
 * 'unsafe-eval' is required because React uses eval to provide enhanced
 * debugging information... `unsafe-eval` is not required for production.
 * Neither React nor Next.js use eval in production by default."
 *
 * WHY NOT JUST IGNORE IT. Nothing breaks without it — React catches the throw
 * and degrades. But a console that cries wolf on every page is a console nobody
 * reads, and this is the owner-review stage, where the whole point is that the
 * owner reports what they see. A permanently-red console hides the next real
 * error behind it.
 *
 * WHY THIS IS SAFE. `'unsafe-eval'` is added ONLY when the caller passes
 * `dev: true`, and only two callers exist:
 *
 *   - `next.config.ts` derives it from the config PHASE, not from an
 *     environment variable. `next build` is always PHASE_PRODUCTION_BUILD, so
 *     the built manifest cannot carry the token even if someone runs the build
 *     with NODE_ENV=development in their shell.
 *   - `src/proxy.ts` derives it from `process.env.NODE_ENV`, which the bundler
 *     replaces with the literal "production" in a production build. The call
 *     site is emitted as `{dev: !1}`, so no production code path can pass
 *     `true`. The token's bytes DO remain in the chunk, inside this function —
 *     unreachable, not absent. Do not claim more than that.
 *
 * `tests/security.test.ts` asserts both policies in their production form
 * contain no `'unsafe-eval'`, and that the dev form differs by that one token
 * and nothing else.
 */

/**
 * The dev-only relaxation, named once so it is greppable and so the tests can
 * assert on the same constant the policies are built from.
 */
export const DEV_ONLY_SCRIPT_SRC = "'unsafe-eval'";

/** Shared by both policies, and identical in both on purpose. */
const COMMON = {
  /*
    `style-src` keeps `'unsafe-inline'` in both policies: React injects inline
    <style> during streaming SSR, and a nonce cannot be attached to styles React
    emits itself. Far less dangerous than inline script.
  */
  style: "style-src 'self' 'unsafe-inline'",
  /*
    ⚠ i.ytimg.com IS DELIBERATE, AND ITS ABSENCE FROM THE ADMIN WAS A BUG.

    The public policy has allowed YouTube's poster host since Topic 9. The
    admin's did not — and the admin renders those posters in two places that
    exist precisely to be looked at: the video list, so a teacher can tell one
    video from another, and the form's live preview, whose own comment says it
    "proves the link resolved to the video the teacher meant".

    Both were blocked. The preview proved nothing, and every thumbnail in the
    admin was a broken image. Found in Phase 21 by reading the console on each
    admin route rather than by looking at the pages. Sharing the directive
    between the two policies, as this file now does, is what stops the pair
    drifting apart again.

    This admits ONE external image host. Images do not execute; `script-src`,
    `object-src` and `frame-src` are untouched, and the admin's
    `frame-src 'none'` still means no YouTube player can ever load there.
  */
  img: "img-src 'self' data: blob: https://i.ytimg.com",
  font: "font-src 'self'",
  connect: "connect-src 'self'",
  tail: [
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ],
};

/** `script-src`, with the dev-only token appended when — and only when — asked. */
function scriptSrc(sources: string[], dev: boolean): string {
  return ['script-src', ...sources, ...(dev ? [DEV_ONLY_SCRIPT_SRC] : [])].join(' ');
}

/**
 * The public baseline, sent on every route by `next.config.ts`.
 *
 * `'unsafe-inline'` is load-bearing and documented at length there: Next streams
 * the RSC payload as inline `<script>` blocks and the site does not hydrate
 * without it.
 */
export function publicCsp({ dev }: { dev: boolean }): string {
  return [
    "default-src 'self'",
    scriptSrc(["'self'", "'unsafe-inline'"], dev),
    COMMON.style,
    COMMON.img,
    COMMON.font,
    COMMON.connect,
    // youtube-nocookie only — and only once a visitor clicks play (§14).
    "frame-src 'self' https://www.youtube-nocookie.com https://www.google.com",
    ...COMMON.tail,
  ].join('; ');
}

/**
 * The admin policy, sent by `src/proxy.ts`, which overrides the baseline above.
 *
 * `'strict-dynamic'` makes browsers IGNORE `'self'` and `'unsafe-inline'` in
 * `script-src` — that is the point. It does NOT cause them to ignore
 * `'unsafe-eval'`, which is why the dev token still works here.
 */
export function adminCsp(nonce: string, { dev }: { dev: boolean }): string {
  return [
    "default-src 'self'",
    scriptSrc(["'self'", "'unsafe-inline'", `'nonce-${nonce}'`, "'strict-dynamic'"], dev),
    COMMON.style,
    COMMON.img,
    COMMON.font,
    COMMON.connect,
    // No YouTube player may ever load inside the admin.
    "frame-src 'none'",
    ...COMMON.tail,
  ].join('; ');
}
