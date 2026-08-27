import Image from 'next/image';
import Link from 'next/link';
import type { PublicGalleryItem } from '@/lib/public-data';

/**
 * The homepage gallery teaser — photographs that LINK to the gallery.
 *
 * =============================================================================
 * WHY THIS IS NOT `GalleryViewer`
 * =============================================================================
 * The homepage originally reused the viewer, and that was wrong twice over.
 *
 * BEHAVIOUR. A visitor who taps a photograph on the homepage is expressing
 * interest in the photographs, not in that one photograph. Opening a lightbox
 * over the homepage answers a question they did not ask and leaves them where
 * they started; a link takes them to the gallery, which is where the rest of
 * the pictures are.
 *
 * COST. `GalleryViewer` is a client component, so putting it on the homepage
 * shipped its JavaScript to every visitor of the busiest page on the site for a
 * band most of them never scroll to. This file is a server component and ships
 * none.
 *
 * The gallery page still gets the full viewer. That is where somebody has
 * already said they want to look at photographs.
 */
export function GalleryStrip({ items }: { items: readonly PublicGalleryItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <Link
            href="/gallery"
            /*
              The link's accessible name says where it goes AND what the picture
              shows. A name of "Gallery" repeated four times is what a screen
              reader would otherwise announce, which is useless for choosing.
            */
            aria-label={`Gallery: ${item.alt}`}
            className="group block w-full min-w-0 overflow-hidden rounded-md border border-rule bg-surface transition-colors hover:border-navy-600/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
          >
            {/*
              The same fixed 4:3 box the gallery grid uses, so the homepage and
              the gallery crop identically and the layout is known before any
              photograph loads.
            */}
            <span className="relative block aspect-[4/3] w-full">
              <Image
                src={item.imageUrl}
                alt={item.alt}
                fill
                sizes="(max-width: 639px) 50vw, 25vw"
                className="object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.03] motion-reduce:transition-none"
                /* Lazy, from `next/image`'s default. Nothing here overrides it. */
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
