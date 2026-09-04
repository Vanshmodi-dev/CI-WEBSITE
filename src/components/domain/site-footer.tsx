import Link from 'next/link';
import { institute } from '@/config/institute';
import {
  getFooterNav,
  getContactBlock,
  getSiteContent,
  whatsappLink,
} from '@/lib/site-content';
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
 *
 * ALL EIGHT COLUMN HEADINGS ARE EDITABLE (Phase 18). Four of them were, and
 * four were not, purely because they sat in different JSX blocks — a teacher
 * could rename "Programmes" but not "Opening hours". Nothing justified the
 * split, so there is no longer one.
 */
export async function SiteFooter() {
  const year = new Date().getFullYear();
  // Server component, so it reads the edited content directly. `cache()` in
  // site-content.ts means this shares one query with the header above it.
  const [footerNav, contact, content] = await Promise.all([
    getFooterNav(),
    getContactBlock(),
    getSiteContent(),
  ]);

  /*
    EMAIL AND SOCIAL COME FROM THE ADMIN NOW, not from `institute.ts`.

    Both used to be code constants pinned to `null`, so the day the institute
    finally had an address or a channel, showing it needed a developer. Topic 12
    made them editable fields with the config values as their fallbacks, which
    means the behaviour when nothing is supplied is UNCHANGED — the blocks below
    still render nothing at all rather than a placeholder.
  */
  const hasSocial = Boolean(contact.social.youtube || contact.social.instagram);
  const whatsappHref = () => whatsappLink(contact.whatsappNumber);

  return (
    /*
      PHASE 25. The footer is the deepest navy on the site and the only place a
      gradient appears: a slow wash from --band to --band-2 across the whole
      block, which stops 300px of flat colour from reading as a dead zone. The
      gold hairline along the top edge is the same one the closing call to
      action carries, so the two navy surfaces at the foot of the page are
      visibly the same family rather than two different blues.

      ⚠ THE SOLID `bg-band` IS DECLARED AS WELL AS THE GRADIENT, AND IT IS
      NOT REDUNDANT.
      A gradient is a background-IMAGE, so an element carrying only one has a
      computed background-COLOR of transparent. Anything resolving a background
      by walking the tree - a contrast checker, and this project has one in
      scripts/verify-ux.mjs - then walks straight past the footer to the white
      page behind it and measures white text on white. It reported exactly that
      on all thirteen public routes. The solid colour underneath is both the
      honest answer to that question and the fallback if the gradient ever
      fails to paint.
    */
    <footer className="relative isolate bg-band bg-gradient-to-b from-band to-band-2 text-band-text">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent/0 via-accent-gold/60 to-accent/0"
      />
      <div className="container-page py-16 md:py-24">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
          {/* Identity */}
          <div>
            <LogoWordmark onBand showTagline />
            {/*
              ⚠ THIS SENTENCE USED TO BE HARD-CODED HERE.

              It names the exact list of programmes the institute runs, on every
              page of the site, and changing it needed a developer. Phase 18's
              content audit found it in no registry and no code-owned list — it
              was simply missed. It is `footer.description` now, and the
              fallback is the sentence that shipped.
            */}
            <p className="mt-6 max-w-xs text-small leading-relaxed text-band-muted">
              {content['footer.description']}
            </p>
          </div>

          {/* Link groups */}
          {footerNav.map((group) => (
            <nav key={group.heading} aria-labelledby={`f-${group.heading}`}>
              <h2
                id={`f-${group.heading}`}
                className="eyebrow font-sans text-accent-gold"
              >
                {group.heading}
              </h2>
              <ul className="mt-5 flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="band-link text-small"
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
        <div className="mt-16 grid grid-cols-1 gap-10 border-t border-white/12 pt-12 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h2 className="eyebrow font-sans text-accent-gold">{content['footer.visit.heading']}</h2>
            <address className="mt-3 text-small leading-relaxed text-band-muted not-italic">
              {contact.addressLine}
            </address>
          </div>

          <div>
            <h2 className="eyebrow font-sans text-accent-gold">{content['footer.talk.heading']}</h2>
            <ul className="mt-3 flex flex-col gap-2 text-small">
              <li>
                <a
                  href={contact.telHref}
                  className="band-link"
                >
                  {contact.phonePrimaryDisplay}
                </a>
              </li>
              <li>
                <a
                  href={whatsappHref()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="band-link"
                >
                  WhatsApp
                </a>
              </li>
              {/* Absent until somebody enters one in Admin -> Website text.
                  Never a placeholder address. Master Plan §22. */}
              {contact.email ? (
                <li>
                  <a
                    href={`mailto:${contact.email}`}
                    className="band-link"
                  >
                    {contact.email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          {/* Hours appear only once the institute has entered them in the
              admin. Never a guessed "9 AM - 7 PM": a wrong opening time sends
              somebody to a locked door. */}
          {contact.hours.length > 0 ? (
            <div>
              <h2 className="eyebrow font-sans text-accent-gold">{content['footer.hours.heading']}</h2>
              <ul className="mt-3 flex flex-col gap-2 text-small text-band-muted">
                {contact.hours.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Social block renders only when an account actually exists (§32) */}
          {hasSocial ? (
            <div>
              <h2 className="eyebrow font-sans text-accent-gold">{content['footer.follow.heading']}</h2>
              <ul className="mt-3 flex flex-col gap-2 text-small">
                {contact.social.youtube ? (
                  <li>
                    <a
                      href={contact.social.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="band-link"
                    >
                      YouTube
                    </a>
                  </li>
                ) : null}
                {contact.social.instagram ? (
                  <li>
                    <a
                      href={contact.social.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="band-link"
                    >
                      Instagram
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/12 pt-8 text-[13px] text-band-muted sm:flex-row sm:items-center sm:justify-between">
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
