'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicGalleryItem } from '@/lib/public-data';

/**
 * The gallery grid, and the fullscreen viewer it opens.
 *
 * =============================================================================
 * WHY A VIEWER EXISTS AT ALL
 * =============================================================================
 * Not because galleries usually have one. `docs/brief/01-master-directive.md`
 * section 22 asks for a "fullscreen viewer/lightbox" and
 * `docs/brief/02-vision-brief.md` repeats it as "Categories + fullscreen
 * viewer". It is a stated requirement, so it is built — and built as a complete
 * accessibility surface rather than a visual effect, because a homemade modal
 * is one of the most reliable ways to strand a keyboard user on a page.
 *
 * =============================================================================
 * IT IS A NATIVE <dialog>, AND THAT IS THE ENTIRE ACCESSIBILITY STRATEGY
 * =============================================================================
 * `showModal()` gives four things that hand-written modals get wrong, from the
 * browser rather than from this file:
 *
 *   - the focus TRAP, so Tab cannot escape into the page behind
 *   - ESCAPE closes, with no key handler of ours to forget
 *   - everything outside is made inert for assistive technology, which
 *     `aria-hidden` juggling only approximates
 *   - the top layer, so no z-index in the site can ever cover it
 *
 * What the browser does NOT reliably do is return focus to the exact control
 * that opened it, so that is done here, explicitly, on close.
 *
 * =============================================================================
 * THE GRID IS BUTTONS, NOT CLICKABLE DIVS
 * =============================================================================
 * Each tile is a real <button>, so it is tabbable, has a focus ring, announces
 * itself, and responds to Enter and Space without a key handler. `aria-haspopup
 * ="dialog"` tells a screen-reader user what pressing it will do before they
 * press it.
 */
export function GalleryViewer({ items }: { items: readonly PublicGalleryItem[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const [index, setIndex] = useState<number | null>(null);

  const current = index === null ? null : (items[index] ?? null);

  const open = useCallback((i: number, trigger: HTMLButtonElement) => {
    openerRef.current = trigger;
    setIndex(i);
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const step = useCallback(
    (delta: number) => {
      setIndex((prev) => {
        if (prev === null || items.length === 0) return prev;
        // Wraps, so arrowing past the end is a loop rather than a dead key.
        return (prev + delta + items.length) % items.length;
      });
    },
    [items.length],
  );

  /*
    OPENING IS AN EFFECT BECAUSE `showModal()` NEEDS THE ELEMENT TO EXIST.

    The dialog content is rendered from `index`, so the call has to happen after
    that render. This is the narrow case the rule against setState-in-effect is
    not about: nothing here sets state, it calls a DOM method to match the DOM
    to state that already changed.
  */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (index !== null && !dialog.open) dialog.showModal();
  }, [index]);

  /*
    FOCUS GOES BACK WHERE IT CAME FROM.

    `close` fires for the Escape key, the close button and a backdrop click
    alike, so restoring focus here covers every route out of the dialog rather
    than only the one with a handler on it. Without this, closing the viewer
    drops focus onto <body> and a keyboard user restarts from the top of the
    page — having lost the tile they were looking at.
  */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onClose = () => {
      setIndex(null);
      openerRef.current?.focus();
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (items.length < 2) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    }
  };

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {items.map((item, i) => (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              onClick={(e) => open(i, e.currentTarget)}
              aria-haspopup="dialog"
              /*
                AN EXPLICIT NAME THAT STATES THE ACTION.

                A button whose only content is an image takes its name from
                that image's alt text, which is correct per the accessible-name
                spec but says only what the photograph SHOWS — not that
                pressing this opens it larger. Where a caption exists the
                computed name would also have been alt and caption run
                together, which is noise.

                So the button says what it does and what it will show. The
                image keeps its own alt, because the image still needs one.
              */
              aria-label={`View photograph: ${item.alt}`}
              className="group block w-full min-w-0 overflow-hidden rounded-md border border-rule bg-surface transition-colors hover:border-navy-600/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
            >
              {/*
                A FIXED ASPECT RATIO, NOT MASONRY.

                The brief says "masonry/grid" and this is the grid half. A CSS
                `columns` masonry reflows reading order down each column, so the
                visual order and the tab order stop matching — on a page whose
                only interactive elements are these tiles, that is a real cost
                for a look. A 4:3 box with `object-cover` also means the layout
                is known before any image loads, so the grid cannot shift as
                photographs arrive.
              */}
              <span className="relative block aspect-[4/3] w-full">
                <Image
                  src={item.imageUrl}
                  alt={item.alt}
                  fill
                  /*
                    Two columns on phones, three on tablets, four on desktop.
                    Telling the optimiser the DISPLAYED width stops it serving a
                    1920px render into a 160px box, which is the single biggest
                    weight mistake a gallery can make.
                  */
                  sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
                  className="object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.03] motion-reduce:transition-none"
                  /*
                    Lazy by default — `next/image` does this unless told
                    otherwise, and nothing here overrides it. A gallery is the
                    one page where eagerly loading everything is most tempting
                    and most expensive.
                  */
                />
              </span>
              {item.caption ? (
                <span className="block px-3 py-2 text-left text-[13px] leading-snug text-muted [overflow-wrap:anywhere]">
                  {item.caption}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onKeyDown={onKeyDown}
        aria-label="Photograph viewer"
        className="m-auto max-h-[90dvh] w-[min(92vw,1100px)] rounded-lg border border-rule bg-paper p-0 text-text backdrop:bg-black/70"
      >
        {current ? (
          <div className="flex max-h-[90dvh] flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-rule px-4 py-3">
              <p className="min-w-0 text-small font-medium text-heading">
                {items.length > 1 ? (
                  <>
                    {/* A position, so a screen-reader user knows where they are. */}
                    Photograph {index !== null ? index + 1 : 1} of {items.length}
                  </>
                ) : (
                  'Photograph'
                )}
              </p>
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm px-3 text-small font-medium text-muted transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-surface">
              {/*
                `unoptimized` is NOT used: the viewer image is the one place a
                larger render is justified, and the optimiser is what keeps it
                from being the original camera file.
              */}
              <Image
                src={current.imageUrl}
                alt={current.alt}
                width={1600}
                height={1200}
                sizes="(max-width: 1100px) 92vw, 1100px"
                className="h-auto w-full object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3">
              <p className="measure min-w-0 text-small text-muted [overflow-wrap:anywhere]">
                {current.caption ?? current.alt}
              </p>
              {items.length > 1 ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="inline-flex min-h-11 items-center rounded-sm border border-rule px-3 text-small font-medium text-text transition-colors hover:bg-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="inline-flex min-h-11 items-center rounded-sm border border-rule px-3 text-small font-medium text-text transition-colors hover:bg-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
