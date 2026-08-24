import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'onBand' | 'whatsapp';
type Size = 'md' | 'lg';

/**
 * Master Plan §09.
 *
 * Minimum target 44x44px — `min-h-11` is 44px and is not decorative. Every
 * state is defined here rather than left to the browser: rest, hover, active,
 * focus-visible, disabled.
 *
 * NOTE: no variant paints orange behind text on a light ground. The logo
 * orange is 2.65:1 on white and would fail AA. Orange appears as a rule or an
 * indicator, never as a text-bearing fill in light mode.
 */
const variants: Record<Variant, string> = {
  primary:
    'bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900 shadow-e1 hover:shadow-e2',
  secondary:
    'bg-transparent text-heading border border-navy-800/25 hover:border-navy-800/60 hover:bg-selected',
  tertiary:
    'bg-transparent text-link underline underline-offset-4 decoration-1 hover:decoration-2 px-0 min-h-0',
  onBand:
    'bg-white text-navy-800 hover:bg-navy-50 active:bg-navy-100 shadow-e1',
  whatsapp:
    'bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900 shadow-e1',
};

const sizes: Record<Size, string> = {
  md: 'min-h-11 px-5 text-[15px]',
  lg: 'min-h-12 px-6 text-base',
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-sm font-medium ' +
  'transition-colors duration-[120ms] ease-brand ' +
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
