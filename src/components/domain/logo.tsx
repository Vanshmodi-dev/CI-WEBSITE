import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { institute } from '@/config/institute';

/**
 * COMMERCE INSIGHT LOGO
 * =============================================================================
 *
 * ⚠ ASSET CONSTRAINT — READ BEFORE CHANGING ANYTHING HERE
 *
 * The only artwork we hold is a 2560x2560 JPEG with a WHITE BACKGROUND BAKED IN.
 * It has no alpha channel (verified: mode RGB, no 'A' band).
 *
 * Therefore:
 *   - `<LogoMark>` may ONLY be placed on white or near-white grounds. On navy
 *     or on a photograph it renders as a white box, which looks broken.
 *   - We do NOT key out the white to fake transparency. Chroma-keying a JPEG
 *     leaves haloed, semi-transparent edge pixels on a mark with curves and
 *     fine serifs, and it is destructive — the result would be visibly worse
 *     than not using the logo. This is a deliberate instruction from the
 *     client, not an oversight.
 *   - For dark and navy grounds use `<LogoWordmark>`, which sets the name in
 *     Source Serif 4. The logo's own wordmark is a high-contrast serif, so the
 *     typographic version is faithful to the brand rather than a substitute.
 *
 * Tracked as a dependency in docs/design/BRAND-ASSETS-PENDING.md. When the
 * transparent vector arrives, `<LogoWordmark>` on dark grounds is replaced by
 * the real mark and this comment goes away.
 */

const LOGO_SRC = '/brand/commerce-insight-logo.jpg';

/**
 * The square mark. LIGHT GROUNDS ONLY.
 * `priority` because in the header it is above the fold on every page.
 */
export function LogoMark({
  size = 40,
  priority = false,
  className,
}: {
  size?: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={LOGO_SRC}
      alt=""
      width={size}
      height={size}
      priority={priority}
      /* Decorative here — the accessible name comes from the adjacent
         wordmark text, so announcing it twice would be noise. */
      aria-hidden="true"
      className={cn('shrink-0 select-none', className)}
      sizes={`${size}px`}
    />
  );
}

/**
 * The name set in type. Safe on ANY ground — this is what the footer and any
 * dark surface uses.
 */
export function LogoWordmark({
  className,
  onBand = false,
  showTagline = false,
}: {
  className?: string;
  onBand?: boolean;
  showTagline?: boolean;
}) {
  return (
    <span className={cn('flex flex-col leading-none', className)}>
      <span
        className={cn(
          'font-display text-[19px] font-bold tracking-[0.01em] uppercase',
          onBand ? 'text-band-text' : 'text-heading',
        )}
      >
        {institute.name}
      </span>
      {showTagline ? (
        <span
          className={cn(
            'mt-1.5 text-[11px] leading-tight tracking-wide',
            onBand ? 'text-band-muted' : 'text-muted',
          )}
        >
          {institute.tagline}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Header lock-up: square mark + typographic name.
 *
 * We compose it this way because no horizontal lock-up artwork exists yet and
 * the square mark alone is too tall for a header bar. Once the official
 * horizontal lock-up arrives this becomes a single image.
 */
export function LogoLockup({
  href = '/',
  priority = false,
  onBand = false,
}: {
  href?: string;
  priority?: boolean;
  onBand?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-sm"
      aria-label={`${institute.name} — home`}
    >
      {/* The mark is omitted on band grounds: white-background JPEG. */}
      {onBand ? null : <LogoMark size={40} priority={priority} />}
      <LogoWordmark onBand={onBand} />
    </Link>
  );
}
