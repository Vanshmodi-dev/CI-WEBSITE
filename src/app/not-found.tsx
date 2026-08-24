import type { Metadata } from 'next';
import { Container } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';

/**
 * A 404 is served with a 404 status, which is the signal that matters; the
 * explicit noindex is belt and braces for the case where something upstream
 * rewrites the status. No canonical: this page represents no document.
 */
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <Container>
      <div className="flex min-h-[60vh] max-w-xl flex-col justify-center py-20">
        <p className="eyebrow text-accent-text">Page not found</p>
        <h1 className="mt-4 text-h1 font-bold leading-tight text-heading lg:text-[44px]">
          We could not find that page.
        </h1>
        <p className="measure mt-4 text-[17px] leading-relaxed text-muted">
          The link may be out of date, or the page may have moved. You can start
          again from the homepage, or get in touch and we will point you to the
          right place.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/">Back to home</Button>
          <Button href="/contact" variant="secondary">
            Contact us
          </Button>
        </div>
      </div>
    </Container>
  );
}
