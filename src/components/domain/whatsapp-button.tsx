import { institute } from '@/config/institute';
import { getContactBlock, whatsappLink } from '@/lib/site-content';

/**
 * The single persistent action — Master Plan §07.
 *
 * Brand navy rather than WhatsApp green: green fights a blue-and-white palette
 * and reads as a bolted-on third-party widget, which is the opposite of what
 * this site is trying to communicate.
 *
 * DELIBERATELY A SERVER COMPONENT. Per-page message pre-filling would need
 * `usePathname`, which would push a client component onto every route for one
 * string. Course pages — where attribution actually matters for a lead —
 * render their own contextual CTA with the course name instead. This keeps the
 * global JS budget intact (§18).
 *
 * Phase 15: the number is read rather than imported, so changing it in the
 * admin changes the one control that appears on every page. Still a server
 * component - the read is a cached query shared with the header and footer.
 */
export async function WhatsAppButton() {
  const contact = await getContactBlock();

  return (
    <a
      href={whatsappLink(contact.whatsappNumber)}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-navy-800 text-white shadow-e3 transition-colors hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
      /*
        ⚠ THE NAME IS READ, NOT SPELLED OUT.

        This label used to hard-code "Commerce Insight". The institute name is
        deliberately code-owned — it is matched to the Google Business Profile,
        and a mismatch weakens the listing they are matched on — but code-owned
        means ONE place, and this was a second copy of it on every page of the
        site. A rename would have left the only control a screen-reader user
        finds on every route announcing the old name.
      */
      aria-label={`Chat with ${institute.name} on WhatsApp`}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 18.14h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.05-.2-.31a8.19 8.19 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.38-1.99-1.23-.74-.65-1.24-1.46-1.38-1.71-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.09-.16.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.55-.43h-.47c-.16 0-.42.06-.64.31-.22.25-.84.82-.84 2s.86 2.32.98 2.48c.12.17 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.5.57.19 1.1.16 1.51.1.46-.07 1.42-.58 1.62-1.15.2-.56.2-1.05.14-1.15-.06-.1-.22-.16-.47-.28Z" />
      </svg>
    </a>
  );
}
