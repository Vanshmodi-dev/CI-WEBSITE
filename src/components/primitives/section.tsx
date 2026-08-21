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
    <div className={cn('mx-auto w-full max-w-[1200px] px-5 md:px-8 lg:px-12', className)}>
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
 */
export function Section({
  children,
  className,
  tone = 'paper',
  id,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'paper' | 'surface' | 'band';
  id?: string;
  labelledBy?: string;
}) {
  const tones = {
    paper: 'bg-paper text-text',
    surface: 'bg-surface text-text',
    band: 'bg-band text-band-text',
  } as const;

  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn('py-16 md:py-24 lg:py-32', tones[tone], className)}
    >
      <Container>{children}</Container>
    </section>
  );
}

/**
 * SectionHeader — eyebrow, title, optional standfirst.
 *
 * The eyebrow is the one place orange appears as text on light grounds, so it
 * uses --accent-text (4.59:1), never the raw logo orange.
 */
export function SectionHeader({
  eyebrow,
  title,
  standfirst,
  id,
  onBand = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  standfirst?: string;
  id?: string;
  onBand?: boolean;
  className?: string;
}) {
  return (
    <header className={cn('mb-10 md:mb-14', className)}>
      {eyebrow ? (
        <p className={cn('eyebrow mb-3', onBand ? 'text-accent' : 'text-accent-text')}>
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className={cn(
          'text-h2 lg:text-[32px] font-bold leading-[1.2]',
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
    </header>
  );
}
