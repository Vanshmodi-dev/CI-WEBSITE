import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { getPrisma, isDatabaseConfigured } from '@/lib/db';
import { logUnexpected } from '@/lib/log';
import { PageHeader, Card, EmptyPanel, TableShell, Td } from '@/components/admin/ui';
import { EXPORT_KINDS } from '@/lib/export';
import { COLUMNS } from '@/lib/import/columns';
import { ImportForm } from './import-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Data' };

type Overview = {
  totalRecords: number;
  publicRecords: number;
  privateRecords: number;
  imported: number;
  lastImport: {
    at: Date;
    actorLabel: string;
    filename: string;
    rowsCreated: number;
    rowsUpdated: number;
    rowsRejected: number;
    madePublic: number;
  } | null;
  history: Array<{
    id: string;
    at: Date;
    actorLabel: string;
    filename: string;
    rowsTotal: number;
    rowsCreated: number;
    rowsUpdated: number;
    rowsRejected: number;
    madePublic: number;
    durationMs: number;
  }>;
};

const EMPTY: Overview = {
  totalRecords: 0,
  publicRecords: 0,
  privateRecords: 0,
  imported: 0,
  lastImport: null,
  history: [],
};

/**
 * The figures on this page are counted, never estimated.
 *
 * If the tables are empty, every number is zero and the panel says so. Nothing
 * here invents a total to make the screen look inhabited.
 */
async function loadOverview(): Promise<Overview> {
  if (!isDatabaseConfigured()) return EMPTY;
  try {
    const prisma = getPrisma();
    const [total, published, imported, history] = await Promise.all([
      prisma.topper.count(),
      prisma.topper.count({ where: { published: true } }),
      prisma.topper.count({ where: { importRef: { not: null } } }),
      prisma.importRun.findMany({
        orderBy: { at: 'desc' },
        take: 20,
        select: {
          id: true,
          at: true,
          actorLabel: true,
          filename: true,
          rowsTotal: true,
          rowsCreated: true,
          rowsUpdated: true,
          rowsRejected: true,
          madePublic: true,
          durationMs: true,
        },
      }),
    ]);
    return {
      totalRecords: total,
      publicRecords: published,
      privateRecords: total - published,
      imported,
      lastImport: history[0] ?? null,
      history,
    };
  } catch (error) {
    logUnexpected('admin.data.overview_failed', error);
    return EMPTY;
  }
}

const IST = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

export default async function DataPage() {
  await requireAdmin();
  const overview = await loadOverview();

  return (
    <>
      <PageHeader
        title="Data"
        description="Bring results in from a spreadsheet, and take a copy of anything out. Importing never puts a record on the website."
      />

      <Card className="mb-8">
        <h2 className="font-display text-[16px] font-semibold text-heading">Where things stand</h2>
        <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Student records" value={overview.totalRecords} />
          <Stat label="On the website" value={overview.publicRecords} />
          <Stat label="Kept private" value={overview.privateRecords} />
          <Stat label="Came from a spreadsheet" value={overview.imported} />
        </dl>
        {overview.totalRecords === 0 ? (
          <p className="mt-5 text-small text-muted">
            There are no student records yet. Download the template below, fill it in, and check it
            here.
          </p>
        ) : null}
      </Card>

      <div className="mb-10">
        <ImportForm />
      </div>

      {/* -------------------------------------------------------- template -- */}
      <Card className="mb-8">
        <h2 className="font-display text-[16px] font-semibold text-heading">
          The columns the file needs
        </h2>
        <p className="mt-1 text-small text-muted">
          Your spreadsheet needs a first row with these headings. Capitals and spacing do not
          matter.{' '}
          <a href="/admin/data/download?kind=template" className="text-link underline">
            Download a blank template
          </a>
          .
        </p>
        <div className="mt-5">
          <TableShell headings={['Column', 'Needed?', 'What it means', 'What to write']}>
            {COLUMNS.map((c) => (
              <tr key={c.key} className="border-t border-rule align-top">
                <Td>
                  <span className="font-medium text-heading">{c.header}</span>
                  {c.affectsVisibility ? (
                    <span className="mt-1 block text-[11px] uppercase tracking-wide text-accent-text">
                      affects what shows
                    </span>
                  ) : null}
                </Td>
                <Td>{c.required ? 'Required' : 'Optional'}</Td>
                <Td className="text-muted">{c.meaning}</Td>
                <Td className="text-muted">{c.accepted}</Td>
              </tr>
            ))}
          </TableShell>
        </div>
        <p className="mt-4 text-small text-muted">
          There is no column for putting a record on the website, and that is deliberate. A
          spreadsheet cell is not a decision about a child&rsquo;s photograph. Import the records,
          then publish them one at a time in Students.
        </p>
      </Card>

      {/* --------------------------------------------------------- exports -- */}
      <Card className="mb-8">
        <h2 className="font-display text-[16px] font-semibold text-heading">Take a copy</h2>
        <p className="mt-1 text-small text-muted">
          Every file opens in Excel or Google Sheets. The results file has the same columns as the
          import template, so you can edit it and bring it back.
        </p>
        <ul className="mt-5 flex flex-col gap-3">
          {EXPORT_KINDS.map((k) => (
            <li
              key={k.kind}
              className="flex flex-col gap-2 rounded-md border border-rule bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-small font-medium text-heading">{k.label}</p>
                <p className="text-small text-muted">{k.note}</p>
              </div>
              <a
                href={`/admin/data/download?kind=${k.kind}`}
                className="inline-flex min-h-11 shrink-0 items-center rounded-sm border border-rule bg-paper px-4 text-small font-medium text-text hover:bg-surface"
              >
                Download CSV
              </a>
            </li>
          ))}
        </ul>
      </Card>

      {/* --------------------------------------------------------- history -- */}
      <Card>
        <h2 className="font-display text-[16px] font-semibold text-heading">Past imports</h2>
        <p className="mt-1 text-small text-muted">
          What was imported and when. The spreadsheets themselves are never kept.
        </p>
        <div className="mt-5">
          {overview.history.length === 0 ? (
            <EmptyPanel
              title="Nothing imported yet"
              description="Once you import a file, it will be listed here with what it changed."
            />
          ) : (
            <TableShell
              headings={['When', 'Who', 'File', 'Rows', 'Added', 'Corrected', 'Rejected', 'Made public', 'Took']}
            >
              {overview.history.map((run) => (
                <tr key={run.id} className="border-t border-rule">
                  <Td className="whitespace-nowrap">{IST.format(run.at)}</Td>
                  <Td>{run.actorLabel}</Td>
                  <Td className="max-w-[16rem] truncate">{run.filename}</Td>
                  <Td className="tabular-nums">{run.rowsTotal}</Td>
                  <Td className="tabular-nums">{run.rowsCreated}</Td>
                  <Td className="tabular-nums">{run.rowsUpdated}</Td>
                  <Td className="tabular-nums">{run.rowsRejected}</Td>
                  <Td className="tabular-nums">{run.madePublic}</Td>
                  <Td className="tabular-nums">{(run.durationMs / 1000).toFixed(1)}s</Td>
                </tr>
              ))}
            </TableShell>
          )}
        </div>
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-small text-muted">{label}</dt>
      <dd className="mt-1 font-display text-[28px] font-bold tabular-nums text-heading">{value}</dd>
    </div>
  );
}
