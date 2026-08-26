import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getEnquiry } from '@/lib/admin-data';
import { PageHeader, Card, StatusPill } from '@/components/admin/ui';
import { CLASS_LEVEL_LABELS, type ClassLevelValue } from '@/lib/validation';
import { ENQUIRY_STATUS_LABELS, courseLabel, formatDateTime } from '@/lib/admin-format';
import { whatsappHref } from '@/config/institute';
import { EnquiryControls } from './controls';

export const dynamic = 'force-dynamic';

export default async function EnquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const enquiry = await getEnquiry(id).catch(() => null);
  if (!enquiry) notFound();

  return (
    <>
      <Link href="/admin/enquiries" className="mb-4 inline-block text-small text-link">
        ← Back to enquiries
      </Link>

      <PageHeader
        title={enquiry.name}
        description={`Received ${formatDateTime(enquiry.createdAt)}`}
        action={
          <StatusPill tone={enquiry.status === 'NEW' ? 'new' : 'done'}>
            {ENQUIRY_STATUS_LABELS[enquiry.status] ?? enquiry.status}
          </StatusPill>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="font-display text-[18px] font-semibold text-heading">
              Their enquiry
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail label="Interested in">
                {CLASS_LEVEL_LABELS[enquiry.classLevel as ClassLevelValue] ??
                  enquiry.classLevel}
              </Detail>
              {enquiry.courseSlug ? (
                <Detail label="Came from course">
                  {courseLabel(enquiry.courseSlug)}
                </Detail>
              ) : null}
              <Detail label="Phone">
                <a href={`tel:${enquiry.phone}`} className="text-link tabular-nums">
                  {enquiry.phone}
                </a>
              </Detail>
              {enquiry.email ? (
                <Detail label="Email">
                  <a href={`mailto:${enquiry.email}`} className="text-link">
                    {enquiry.email}
                  </a>
                </Detail>
              ) : null}
              <Detail label="Page they used">{enquiry.sourcePage}</Detail>
            </dl>

            {enquiry.message ? (
              <div className="mt-6 border-t border-rule pt-4">
                <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  Message
                </dt>
                {/* Rendered as text. React escapes by default and this is
                    visitor-supplied content — it never becomes HTML. */}
                <p className="mt-2 whitespace-pre-wrap text-text">
                  {enquiry.message}
                </p>
              </div>
            ) : null}
          </Card>

          <EnquiryControls
            id={enquiry.id}
            status={enquiry.status}
            notes={enquiry.notes ?? ''}
          />
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <h2 className="font-display text-[16px] font-semibold text-heading">
              Get in touch
            </h2>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href={`tel:${enquiry.phone}`}
                className="inline-flex min-h-11 items-center justify-center rounded-sm bg-navy-800 px-4 text-small font-medium text-white hover:bg-navy-700"
              >
                Call {enquiry.name.split(' ')[0]}
              </a>
              <a
                href={whatsappHref()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-sm border border-rule px-4 text-small text-text hover:bg-surface"
              >
                Open WhatsApp
              </a>
            </div>
            <p className="mt-4 border-t border-rule pt-3 text-[13px] text-muted">
              Their details are only used to answer this enquiry.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}
