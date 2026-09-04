import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'tertiary'
  | 'onBand'
  | 'onBandSecondary'
  | 'whatsapp';
type Size = 'md' | 'lg';

/**
 * Master Plan §09.
 *
 * Minimum target 44x44px — `min-h-11` is 44px and is not decorative. Every
 * state is defined here rather than left to the browser: rest, hover, active,
 * focus-visible, disabled.
 *
 * ORANGE, AND THE ONE WAY IT IS ALLOWED TO CARRY TEXT.
 *
 * The brand orange is 2.06:1 on white, so an orange button with white text is
 * not a button anybody with low vision can read, and Phase 9 removed the last
 * attempt at one. The 'accent' variant below does the only thing that works:
 * orange FILL with DEEP NAVY text, measured at 6.75:1. It is deliberately not
 * the default - one accent button per page, at the moment of highest intent.
 *
 * The two 'onBand' variants exist because half the calls to action on this
 * site now sit on navy, where a navy primary button is invisible. They are the
 * same two shapes as primary/secondary, inverted.
 */
const variants: Record<Variant, string> = {
  primary:
    'bg-navy-700 text-white hover:bg-navy-900 active:bg-navy-950 shadow-e1 hover:shadow-e2',
  // The border was `border-navy-800/25`, a fixed navy at 25% opacity. On the
  // light ground that is a faint grey and works; in dark mode it is navy over
  // near-black, so the outline vanished and the button read as loose text —
  // "Talk to us" and "WhatsApp us" both lost their edges entirely. The rule
  // tokens are theme-aware, so they hold an edge on either ground.
  secondary:
    'bg-transparent text-heading border border-rule-strong hover:border-muted hover:bg-selected',
  /* Orange fill, deep navy text. 6.75:1, and the only orange text-bearing
     surface on the site. */
  accent:
    'bg-accent text-navy-950 hover:bg-accent-gold active:bg-accent-300 shadow-e1 hover:shadow-e2',
  tertiary:
    'bg-transparent text-link underline underline-offset-4 decoration-1 hover:decoration-2 px-0 min-h-0',
  onBand:
    'bg-white text-navy-700 hover:bg-navy-50 active:bg-navy-100 shadow-e1',
  /* On navy, a hairline of white at 45% holds an edge without competing with
     the solid button beside it. */
  onBandSecondary:
    'bg-transparent text-band-text border border-white/45 hover:border-white hover:bg-white/10',
  whatsapp:
    'bg-navy-700 text-white hover:bg-navy-900 active:bg-navy-950 shadow-e1',
};

/* 44px and 52px. The floor is the touch target (Master Plan §09); the large
   size is for the two or three moments a page actually asks for something. */
const sizes: Record<Size, string> = {
  md: 'min-h-11 px-5 text-[15px]',
  lg: 'min-h-[52px] px-7 text-base',
};

/*
  SQUARE-ISH, NOT A PILL. A 6px corner on a 52px button reads as an
  institution; a 26px one reads as a consumer app, and this site is asking
  parents for their child's marks. Pills are kept for badges and tags, which
  is the shape difference that lets a reader tell a control from a label.

  The transition covers colour, border, shadow and transform together, because
  the lift on hover is 1px and looks broken if it arrives before the shade does.
*/
const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold tracking-[-0.005em] ' +
  'transition-[background-color,border-color,color,box-shadow,transform] ' +
  'duration-[var(--duration-fast)] ease-brand motion-safe:hover:-translate-y-px ' +
  'disabled:opacity-50 disabled:pointer-events-none';

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type ButtonAsLink = CommonProps & {
  href: string;
  /** Set for outbound links (WhatsApp, YouTube, Google). */
  external?: boolean;
};

type ButtonAsButton = CommonProps &
  ComponentPropsWithoutRef<'button'> & { href?: undefined };

export function Button(props: ButtonAsLink | ButtonAsButton) {
  const { variant = 'primary', size = 'md', className, children } = props;
  const classes = cn(base, variants[variant], sizes[size], className);

  if ('href' in props && props.href !== undefined) {
    const { href, external } = props;
    if (external) {
      return (
        <a
          href={href}
          className={classes}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  const { variant: _v, size: _s, className: _c, children: _ch, ...rest } =
    props as ButtonAsButton;
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
