import Image from 'next/image';
import Link from 'next/link';
import { thumbnailUrl } from '@/lib/video';
import type { PublicVideo } from '@/lib/public-data';

/**
 * The homepage videos teaser — posters that LINK to /videos.
 *
 * =============================================================================
 * WHY THIS IS NOT `VideoPlayer`
 * =============================================================================
 * Topic 8 shipped the gallery viewer on the homepage and had to take it off
 * again: it is a client component, so the busiest page on the site paid for its
 * JavaScript for a band most visitors never scroll to. The same is true here
 * and the same answer applies — this file is a server component and ships none.
 *
 * It is also better behaviour. A visitor tapping a video on the homepage is
 * expressing interest in the teaching, not in that one clip; sending them to
 * /videos gives them the whole set with the filters, rather than starting
 * playback inside a page they were still scanning. Nobody wants a video to
 * start talking at them on a homepage.
 *
 * =============================================================================
 * NO IFRAME IS CREATED HERE UNDER ANY CIRCUMSTANCE
 * =============================================================================
 * Three posters, three lazy images from `i.ytimg.com`, and no third-party
 * JavaScript. A homepage visitor who never clicks has run none of YouTube's
 * code.
 */
export function VideoStrip({ videos }: { videos: readonly PublicVideo[] }) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      {videos.map((video) => (
        <li key={video.id} className="min-w-0">
          <Link
            href="/videos"
            className="group block w-full min-w-0 overflow-hidden rounded-md border border-rule bg-paper transition-colors hover:border-navy-600/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
          >
            <span className="relative block aspect-video w-full bg-navy-800">
              <Image
                src={thumbnailUrl(video.youtubeId)}
                /*
                  Empty alt: the title sits directly beneath and is part of the
                  link's accessible name, so describing the still as well would
                  make a screen reader announce the same video twice.
                */
                alt=""
                fill
                sizes="(max-width: 639px) 100vw, 33vw"
                className="object-cover opacity-90 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
              />
              {/* Decorative play mark, so the tile reads as a video not a photo. */}
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-0.5 fill-current">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>
            </span>

            <span className="block px-4 py-3 text-small font-medium leading-snug text-heading [overflow-wrap:anywhere]">
              {video.title}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
