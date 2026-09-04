import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Container — one max width, one set of gutters, used everywhere.
 * Master Plan §09: 1200px cap, gutters 20 / 32 / 48.
 */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('container-page', className)}>
      {children}
    </div>
  );
}

/**
 * Section — vertical rhythm for a page band.
 * Padding 64 / 96 / 128 by breakpoint (Master Plan §09).
 *
 * `tone` selects the ground. `band` is the navy brand surface, which carries
 * white text at 13.40:1.
 *
 * SECTION SEPARATION — Phase 15.
 *
 * Until Phase 15 the only thing separating one band from the next was the
 * paper/surface tone step. Measured, that step is 1.05:1 in light and 1.10:1
 * in dark: below the threshold at which an edge is visible at all, which is
 * why the homepage read as one continuous field with headings floating in it.
 *
 * Raising the tint until the step is visible would make the page stripy and
 * still would not carry hierarchy. So the separation is now a HAIRLINE — the
 * rule token measures 1.36:1 light and 1.47:1 dark against paper, which is
 * plenty for a 1px edge — plus spacing and layout variation. The tone step is
 * kept as a secondary cue, not the primary one.
 *
 * `rule` defaults on for paper/surface and off for band, because the navy
 * ground already separates itself. Pass `rule={false}` where a section
 * deliberately continues the one above it.
 */
export function Section({
  children,
  className,
  tone = 'paper',
  rule,
  id,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'paper' | 'surface' | 'tint' | 'band';
  rule?: boolean;
  id?: string;
  labelledBy?: string;
}) {
  /*
    FOUR GROUNDS, AND ONLY ONE OF THEM IS A STATEMENT.

    paper and surface are 1.03:1 apart and tint is 1.09:1 - all three are
    breathing room, and Phase 15 was right that you cannot build rhythm out of
    a step that small. band is the one that does the work: a full-strength navy
    section between two light ones is a break nobody can miss, which is why the
    homepage uses it exactly twice and never twice in a row.
  */
  const tones = {
    paper: 'bg-paper text-text',
    surface: 'bg-surface text-text',
    tint: 'bg-tint text-text',
    band: 'bg-band text-band-text',
  } as const;

  /* A hairline belongs BETWEEN two light grounds. Against navy it would be
     invisible, and next to navy it is redundant - the colour is the edge. */
  const showRule = rule ?? tone !== 'band';

  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        /* Section rhythm. Generous, and one step more so on desktop than the
           old 64/96/112, because the type above it grew with clamp(). */
        'py-16 md:py-24 lg:py-32',
        showRule && 'border-t border-rule',
        tones[tone],
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

/**
 * SectionHeader — eyebrow, title, optional standfirst, optional trailing action.
 *
 * The eyebrow is the one place orange appears as text on light grounds, so it
 * uses --accent-text (4.59:1), never the raw logo orange. Above it sits a
 * short accent rule: that bar is the marker a reader's eye lands on when
 * scanning, and it is the one piece of structure that makes each band announce
 * itself without needing a background change.
 *
 * `action` is the "All results →" style link that four homepage sections were
 * each laying out by hand before Phase 15. One implementation, one baseline.
 */
export function SectionHeader({
  eyebrow,
  title,
  standfirst,
  action,
  id,
  onBand = false,
  className,
}: {
  eyebrow?: string;
  /*
    A NODE, not a string, since Topic 12 made these headings editable.
    `SiteContent` indexes to `string | undefined`, and the alternative was
    a `?? ''` at each of seven call sites - which would quietly render an
    EMPTY heading in the one case it is meant to guard against. It is only
    ever rendered as the content of an <h2>.
  */
  title: ReactNode;
  standfirst?: string;
  action?: ReactNode;
  id?: string;
  onBand?: boolean;
  className?: string;
}) {
  const heading = (
    <>
      {eyebrow ? (
        <p
          className={cn(
            'eyebrow mb-4 flex items-center gap-3',
            /* On navy the brand orange is a 6.4:1 text colour and is used as
               one; on light it would be 2.06:1, so the darkened token is. */
            onBand ? 'text-accent-gold' : 'text-accent-text',
          )}
        >
          <span
            aria-hidden="true"
            className="h-[2px] w-8 shrink-0 rounded-full bg-accent"
          />
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className={cn(
          /* No lg: size any more - --text-h2 is a clamp() and interpolates
             across the whole range instead of stepping once at 1024px. */
          'font-display text-h2 font-bold leading-[1.12] tracking-[-0.02em]',
          onBand ? 'text-band-text' : 'text-heading',
        )}
      >
        {title}
      </h2>
      {standfirst ? (
        <p
          className={cn(
            'measure mt-4 text-[17px] leading-relaxed',
            onBand ? 'text-band-muted' : 'text-muted',
          )}
        >
          {standfirst}
        </p>
      ) : null}
    </>
  );

  if (!action) {
    return <header className={cn('mb-10 md:mb-16', className)}>{heading}</header>;
  }

  return (
    <header
      className={cn(
        'mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-16',
        className,
      )}
    >
      <div className="min-w-0">{heading}</div>
      {action}
    </header>
  );
}

/**
 * PageHeader — the masthead every inner page opens with.
 *
 * Seven pages were each hand-writing the identical eyebrow + `text-h1` +
 * standfirst block, and every one of them set the title in the SANS face while
 * card headings two bands lower were set in the serif display face. The result
 * was a site whose most important line of type on each page was the one piece
 * of type not using the brand's headline font.
 *
 * One implementation now, in display serif, with the same accent rule that
 * marks a SectionHeader — so a page title and a section title are visibly the
 * same family of thing at two different weights.
 */
export function PageHeader({
  eyebrow,
  title,
  standfirst,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  standfirst?: ReactNode;
  children?: ReactNode;
}) {
  return (
    /*
      THE MASTHEAD IS A COMPOSITION NOW, not a stack on plain paper.

      A soft navy bloom from the top-left and a gold one from the top-right,
      both far below the threshold where they read as colour, over a faint grid
      that fades out before it reaches the type. Three decorative layers, no
      markup a screen reader can find, and nothing that moves.
    */
    <section className="relative isolate overflow-hidden border-b border-rule bg-surface">
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 grid-pattern" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bloom-navy" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bloom-gold" />
      <Container>
        <div className="max-w-3xl py-16 md:py-24">
          {eyebrow ? (
            <p className="eyebrow flex items-center gap-3 text-accent-text">
              <span
                aria-hidden="true"
                className="h-[2px] w-8 shrink-0 rounded-full bg-accent"
              />
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-5 font-display text-h1 font-bold leading-[1.08] tracking-[-0.025em] text-heading">
            {title}
          </h1>
          {standfirst ? (
            <p className="measure mt-5 text-[18px] leading-relaxed text-muted">
              {standfirst}
            </p>
          ) : null}
          {children}
        </div>
      </Container>
    </section>
  );
}

/**
 * ClosingCta — the framed block every page ends on.
 *
 * This used to be `<Section tone="band">` on all six pages, and the site
 * footer is also navy: every page therefore terminated in roughly 700px of
 * unbroken navy, in which the call to action — the single most important
 * element on the page for a business that runs on enquiries — was the least
 * distinguishable thing on screen. Two large flat areas of the same colour do
 * not read as two things.
 *
 * A framed block on paper is smaller, sits at higher contrast against its
 * surroundings, and leaves the navy footer as the only navy at the foot of the
 * page, which is what makes the footer read as the end of the document.
 *
 * `actions` are passed in rather than built here so each page keeps its own
 * wording; the frame is what is shared.
 */
export function ClosingCta({
  id,
  title,
  body,
  actions,
}: {
  id: string;
  title: ReactNode;
  body: ReactNode;
  actions: ReactNode;
}) {
  return (
    <Section tone="paper" labelledBy={id}>
      {/*
        PHASE 25 PAINTED THIS BLOCK NAVY, and the Phase 15 argument for not
        doing so still holds - it just no longer applies. That argument was
        that a navy call to action bled into the navy footer below it, so the
        single most important element on the page became the least
        distinguishable. What has changed is that the block is now INSET on a
        light section with its own margin above and below, so there is white
        between it and the footer. It reads as a plate, not as the start of the
        footer, and the page ends light -> navy plate -> light -> navy footer.

        The frame carries a gold hairline along its top edge: the one place on
        the page where the accent runs the full width of anything.
      */}
      <div className="relative isolate overflow-hidden rounded-lg bg-band text-band-text shadow-e2">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent via-accent-gold to-accent/0"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background-image:radial-gradient(38rem_24rem_at_15%_120%,color-mix(in_srgb,var(--navy-600)_60%,transparent),transparent_70%)]"
        />
        <div className="flex flex-col gap-8 p-8 md:p-12 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div>
            <h2
              id={id}
              className="font-display text-h2 font-bold leading-[1.12] tracking-[-0.02em] text-band-text"
            >
              {title}
            </h2>
            <p className="measure mt-4 text-[17px] leading-relaxed text-band-muted">
              {body}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">{actions}</div>
        </div>
      </div>
    </Section>
  );
}
