'use client';

import { useState } from 'react';
import { mapEmbedUrl, mapViewUrl, type Coordinates } from '@/lib/location';

/**
 * The map: a placeholder that becomes Google Maps when somebody asks for it.
 *
 * =============================================================================
 * NO IFRAME EXISTS UNTIL A VISITOR CLICKS
 * =============================================================================
 * Master Plan §15 requires this and gives the reason: "An eagerly-loaded Google
 * Maps iframe is typically the heaviest thing on a page and it sits below the
 * fold — there is no reason to pay for it on every visit."
 *
 * The privacy half matters at least as much. An eager embed means every visitor
 * to the contact page is announced to Google — IP, user-agent, referrer, and
 * whatever cookies they carry — whether or not they wanted a map. Here, a
 * visitor who reads the address and calls the number has contacted Google not
 * at all.
 *
 * This is the same shape as the Topic 9 video facade, deliberately: one pattern
 * for third-party embeds, verified once.
 *
 * =============================================================================
 * THE PLACEHOLDER IS NOT A PICTURE OF A MAP
 * =============================================================================
 * A static map image would be the prettier placeholder and would cost a request
 * to Google — either at build time with a key we do not have, or at view time,
 * which is the exact contact this component exists to avoid. So the placeholder
 * is drawn in CSS from the site's own tokens: it says what it is and what
 * pressing it will do, and it ships no bytes from anybody else.
 *
 * =============================================================================
 * THE SRC IS BUILT FROM TWO NUMBERS
 * =============================================================================
 * `mapEmbedUrl` takes `Coordinates` — not a URL, not a string. There is no code
 * path in which an operator-supplied string becomes this `src`, because the
 * only thing an operator can supply is a latitude and a longitude that have
 * been parsed, range-checked and rounded.
 */
export function MapPanel({
  coordinates,
  label,
}: {
  coordinates: Coordinates;
  /** What the map shows, for the iframe's accessible name. */
  label: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-surface">
      <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
        {shown ? (
          /*
            `title` IS REQUIRED, NOT DECORATIVE.

            An iframe with no accessible name is announced as "frame" and a
            screen-reader user has no idea what is inside it. This one says
            which place it shows.

            No `allow` list: a map needs no camera, microphone, geolocation or
            payment permission from us. Omitting the attribute grants nothing,
            which is the correct minimum — Google's own snippet asks for
            geolocation, and we do not pass it on.

            No `sandbox`: the map needs scripts and its own origin to work, and
            `allow-scripts` plus `allow-same-origin` together is equivalent to
            no sandbox at all. `frame-src` in the CSP is the real control and it
            permits exactly one host.
          */
          <iframe
            src={mapEmbedUrl(coordinates)}
            title={`Map showing ${label}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShown(true)}
            className="group absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 bg-surface px-6 text-center transition-colors hover:bg-selected focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy-600"
          >
            {/*
              A CSS-drawn suggestion of streets. Decorative, and hidden from
              assistive technology: it carries no information the button's own
              name does not already give.
            */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:repeating-linear-gradient(90deg,var(--color-rule-strong)_0_1px,transparent_1px_44px),repeating-linear-gradient(0deg,var(--color-rule-strong)_0_1px,transparent_1px_44px)]"
            />
            <span
              aria-hidden="true"
              className="relative flex h-12 w-12 items-center justify-center rounded-full bg-navy-800 text-white transition-transform duration-200 motion-safe:group-hover:scale-110 motion-reduce:transition-none"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
              </svg>
            </span>
            <span className="relative font-display text-[17px] font-semibold text-heading">
              Show the map
            </span>
            <span className="measure relative text-small text-muted">
              The map loads from Google only when you ask for it, so nothing is
              sent to them before you do.
            </span>
          </button>
        )}
      </div>

      <p className="border-t border-rule px-5 py-3 text-[13px] text-muted">
        {/*
          A way out that does not depend on the embed working. If Google is
          blocked, slow, or refuses the frame, this link still goes to the map.
        */}
        <a
          href={mapViewUrl(coordinates)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link underline underline-offset-2 hover:text-heading"
        >
          Open in Google Maps
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </div>
  );
}
