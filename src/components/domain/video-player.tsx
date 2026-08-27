'use client';

import Image from 'next/image';
import { useId, useState } from 'react';
import { thumbnailUrl, embedUrl, watchUrl } from '@/lib/video';
import type { PublicVideo } from '@/lib/public-data';

/**
 * One video: a poster that becomes a player when somebody asks for it.
 *
 * =============================================================================
 * NO IFRAME EXISTS UNTIL A VISITOR CLICKS PLAY
 * =============================================================================
 * Master Plan section 14 requires this, and the arithmetic is why. A YouTube
 * iframe is not one request — it is a document, its player JavaScript, its CSS,
 * its fonts and its API calls, and it runs a third party's code inside our page.
 * Six of them on a page is six of those, paid for by every visitor including the
 * ones who never press play, on a phone, on mobile data.
 *
 * So what renders is a poster image and a button. The iframe is created in
 * response to a click, and only for the video that was clicked. A visitor who
 * reads the titles and leaves has contacted YouTube exactly once per thumbnail
 * — `i.ytimg.com` for the image — and has run none of its code.
 *
 * =============================================================================
 * THE PLAYER REPLACES THE POSTER IN PLACE. THERE IS NO MODAL
 * =============================================================================
 * A dialog was considered and rejected. It is a whole accessibility surface —
 * focus trap, restore, Escape, inert background — and it buys nothing here: the
 * card is already 16:9 and already the right size to watch in. Gallery has a
 * dialog because a thumbnail genuinely is too small to see a photograph in; a
 * video is watched at the size it is presented.
 *
 * Rejecting a modal also removes the failure it brings: a focus trap somebody
 * gets stuck in.
 *
 * =============================================================================
 * EVERY URL IS BUILT FROM THE ID
 * =============================================================================
 * `thumbnailUrl`, `embedUrl` and `watchUrl` all take the eleven-character id
 * and construct a string. None of them takes a stored URL, because none is
 * stored. `youtubeId` reaching here has been through the parser, a CHECK
 * constraint and a read-path re-check.
 */
export function VideoPlayer({ video }: { video: PublicVideo }) {
  const [playing, setPlaying] = useState(false);
  const titleId = useId();

  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-rule bg-paper">
      <div className="relative aspect-video w-full bg-navy-800">
        {playing ? (
          /*
            THE `allow` LIST IS THE MINIMUM THAT PLAYS A VIDEO.

            `autoplay` because the visitor just pressed play; `encrypted-media`
            because YouTube uses EME for some content and playback fails without
            it. Deliberately ABSENT: accelerometer, gyroscope, clipboard-write,
            web-share, camera, microphone, geolocation, payment — the list
            YouTube's own copy-paste snippet includes and none of which a video
            needs to play inside a page like this one.

            No `sandbox` attribute. The player requires `allow-scripts` and
            `allow-same-origin` to function, and those two together are
            equivalent to no sandbox at all — adding it would be security
            theatre that reads as a control. The real control is `frame-src` in
            the CSP, which permits exactly one origin.
          */
          <iframe
            src={embedUrl(video.youtubeId)}
            title={video.title}
            allow="autoplay; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            /*
              The name states the ACTION and the subject. A button named only
              by the thumbnail's alt text would announce a description of a
              picture, not "this plays a video".
            */
            aria-label={`Play video: ${video.title}`}
            className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
          >
            <Image
              src={thumbnailUrl(video.youtubeId)}
              /*
                EMPTY ALT, DELIBERATELY.

                The button already carries the accessible name, and the poster
                is a still from the video the title describes. Repeating the
                title here would make a screen reader announce it twice.
              */
              alt=""
              fill
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
              className="object-cover opacity-90 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
            />
            {/* The play affordance. Decorative: the button is already named. */}
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-200 motion-safe:group-hover:scale-110 motion-reduce:transition-none">
                <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-0.5 fill-current">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-5">
        <h3
          id={titleId}
          className="font-display text-[17px] font-semibold leading-snug text-heading [overflow-wrap:anywhere]"
        >
          {video.title}
        </h3>

        {video.description ? (
          <p className="measure mt-2 text-small leading-relaxed text-muted [overflow-wrap:anywhere]">
            {video.description}
          </p>
        ) : null}

        <p className="mt-4 pt-1 text-[13px]">
          {/*
            LEAVING THE SITE IS STATED, NOT IMPLIED.

            `target="_blank"` with `rel="noopener noreferrer"`: noopener because
            a new tab must not get a handle on this window, noreferrer because
            YouTube does not need to be told which page of ours the visitor came
            from. The visually hidden words make the new tab audible as well as
            visible.
          */}
          <a
            href={watchUrl(video.youtubeId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link underline underline-offset-2 hover:text-heading"
          >
            Watch on YouTube
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </div>
    </article>
  );
}
