import { Container } from '@/components/primitives/section';
import { Button } from '@/components/primitives/button';

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
