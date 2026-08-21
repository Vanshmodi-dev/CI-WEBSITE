import Link from 'next/link';
import { footerNav } from '@/config/nav';
import { institute, addressFull, telHref, whatsappHref } from '@/config/institute';
import { LogoWordmark } from '@/components/domain/logo';

/**
 * SiteFooter — Master Plan §32.
 *
 * Sits on the navy band, so it uses the TYPOGRAPHIC wordmark. The logo JPEG
 * has a white background baked in and would render as a white box here. See
 * src/components/domain/logo.tsx.
 *
 * Every block below renders only if the underlying fact exists. Email, social
 * links and hours are currently null in the config, so they are absent rather
 * than shown as placeholders — the same rule that governs the rest of the site.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  const hasSocial = Boolean(institute.social.youtube || institute.social.instagram);

  return (
    <footer className="bg-band text-band-text">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
          {/* Identity */}
          <div>
            <LogoWordmark onBand showTagline />
            <p className="mt-5 max-w-xs text-small leading-relaxed text-band-muted">
              Commerce coaching in {institute.locality} for Class XI and XII,
              CA Foundation, CA Intermediate and CMA.
            </p>
          </div>

          {/* Link groups */}
          {footerNav.map((group) => (
            <nav key={group.heading} aria-labelledby={`f-${group.heading}`}>
              <h2
                id={`f-${group.heading}`}
                className="eyebrow font-sans text-accent"
              >
                {group.heading}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-small text-band-muted transition-colors hover:text-band-text"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Contact — the NAP block. Single source: src/config/institute.ts */}
        <div className="mt-14 grid grid-cols-1 gap-8 border-t border-white/15 pt-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h2 className="eyebrow font-sans text-accent">Visit</h2>
            <address className="mt-3 text-small leading-relaxed text-band-muted not-italic">
              {addressFull}
            </address>
          </div>

          <div>
            <h2 className="eyebrow font-sans text-accent">Talk to us</h2>
            <ul className="mt-3 flex flex-col gap-2 text-small">
              <li>
                <a href={telHref} className="text-band-muted hover:text-band-text">
                  {institute.phonePrimary.display}
                </a>
              </li>
              <li>
                <a
                  href={whatsappHref()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-band-muted hover:text-band-text"
                >
                  WhatsApp
                </a>
              </li>
              {/* Email omitted — institute.email is null until a domain
                  mailbox exists. Master Plan §22. */}
              {institute.email ? (
                <li>
                  <a
                    href={`mailto:${institute.email}`}
                    className="text-band-muted hover:text-band-text"
                  >
                    {institute.email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          {/* Social block renders only when an account actually exists (§32) */}
          {hasSocial ? (
            <div>
              <h2 className="eyebrow font-sans text-accent">Follow</h2>
              <ul className="mt-3 flex flex-col gap-2 text-small">
                {institute.social.youtube ? (
                  <li>
                    <a
                      href={institute.social.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-band-muted hover:text-band-text"
                    >
                      YouTube
                    </a>
                  </li>
                ) : null}
                {institute.social.instagram ? (
                  <li>
                    <a
                      href={institute.social.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-band-muted hover:text-band-text"
                    >
                      Instagram
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/15 pt-6 text-[13px] text-band-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} {institute.legalEntityName ?? institute.name}. All rights reserved.
          </p>
          <p>
            Built by{' '}
            <a
              href="https://github.com/Vanshmodi-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-band-text underline decoration-white/30 underline-offset-4 hover:decoration-white"
            >
              TradyPerch
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
