'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { checkImportFile, confirmImport, type ImportState } from './actions';
import { Card, Notice, TableShell, Td } from '@/components/admin/ui';
import { Button } from '@/components/primitives/button';

const initial: ImportState = { status: 'idle' };

/**
 * The import screen.
 *
 * TWO STEPS, ALWAYS. "Check this file" reads and reports; "Import these
 * records" writes. There is no single button that does both, because the whole
 * point of this screen is that the teacher sees what will happen before it
 * happens.
 *
 * The same file input serves both steps. The browser keeps the selection across
 * the round trip, so the confirm submits the same bytes again — which is what
 * lets the server re-check the plan instead of trusting a summary, and what
 * means no uploaded spreadsheet is ever stored anywhere.
 */
export function ImportForm() {
  const [checkState, runCheck] = useActionState<ImportState, FormData>(checkImportFile, initial);
  const [importState, runImport] = useActionState<ImportState, FormData>(confirmImport, initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  // The import result supersedes the check once it exists.
  const state = importState.status === 'idle' ? checkState : importState;
  const plan = state.plan;
  const canImport = state.status === 'checked' && plan && plan.problems.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <SectionHeading title={"Import student results"} description={"Upload a CSV file from your spreadsheet. Nothing is saved until you have checked it and confirmed."} />
        <form action={runCheck} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="import-file" className="text-small font-medium text-text">
              Your spreadsheet, saved as CSV
            </label>
            <input
              ref={fileRef}
              id="import-file"
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              onChange={(e) => setChosen(e.target.files?.[0]?.name ?? null)}
              aria-describedby="import-file-help"
              className="w-full rounded-sm border border-rule bg-paper px-3 py-2.5 text-base text-text file:mr-3 file:rounded-sm file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-small file:text-text"
            />
            <p id="import-file-help" className="text-small text-muted">
              In Excel or Google Sheets choose File, then Save As, then CSV.{' '}
              <a href="/admin/data/download?kind=template" className="text-link underline">
                Download the template
              </a>{' '}
              if you have not filled one in yet.
            </p>
          </div>

          <div>
            <CheckButton />
          </div>
        </form>
      </Card>

      {state.status === 'error' && state.message ? (
        <Notice tone="danger" title="This file was not imported">
          {state.message}
        </Notice>
      ) : null}

      {state.status === 'imported' && state.imported ? (
        <Notice tone="ok" title="Imported">
          {state.imported.created} added and {state.imported.updated} corrected, in{' '}
          {(state.imported.durationMs / 1000).toFixed(1)} seconds.{' '}
          <strong>Nothing was put on the website.</strong> To show a result publicly, open it in
          Students and publish it there.
        </Notice>
      ) : null}

      {plan ? (
        <>
          <Card>
            <SectionHeading
              title="What this file contains"
              description={state.filename ? `Checked: ${state.filename}` : undefined}
            />
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Rows checked" value={plan.rowsTotal} />
              <Figure label="New records" value={plan.createCount} />
              <Figure label="Corrections" value={plan.updateCount} />
              <Figure
                label="Need attention"
                value={plan.problems.length}
                tone={plan.problems.length > 0 ? 'warn' : undefined}
              />
            </dl>

            <div className="mt-6 rounded-md border border-rule bg-surface p-4">
              <p className="text-small font-medium text-heading">
                {plan.wouldBecomePublic === 0
                  ? 'No record will appear on the website.'
                  : `${plan.wouldBecomePublic} records would become visible.`}
              </p>
              <p className="mt-1 text-small text-muted">
                Importing never publishes anything. Records are stored privately, and you decide
                afterwards, one at a time, what the website shows.
                {plan.updatesToLiveRecords > 0 ? (
                  <>
                    {' '}
                    <strong className="text-heading">
                      {plan.updatesToLiveRecords} of these corrections change a record that is on
                      the website right now
                    </strong>
                    , so what visitors read will change.
                  </>
                ) : null}
              </p>
            </div>
          </Card>

          {plan.problems.length > 0 ? (
            <Card>
        <SectionHeading title={"Rows that need attention"} description={"Fix these in your spreadsheet, save it as CSV again, and check it once more. Nothing has been saved."} />
              <TableShell
                label="Rows that need attention"
                headings={['Row', 'Column', 'What is wrong', 'What to do']}
              >
                {plan.problems.map((p, i) => (
                  <tr key={`${p.line}-${p.column}-${i}`} className="border-t border-rule">
                    <Td className="tabular-nums">{p.line}</Td>
                    <Td>{p.column}</Td>
                    <Td>{p.problem}</Td>
                    <Td className="text-muted">{p.expected}</Td>
                  </tr>
                ))}
              </TableShell>
              {plan.problems.length >= 200 ? (
                <p className="mt-3 text-small text-muted">
                  Showing the first 200. Fix these and check again to see any others.
                </p>
              ) : null}
            </Card>
          ) : null}

          {plan.preview.length > 0 ? (
            <Card>
        <SectionHeading title={"What the website would show"} description={"For each record, what a visitor would see and why."} />
              <TableShell
                label="What a visitor would see"
                headings={['Reference', 'Student', 'Result', 'Name shown', 'Photograph', 'Why']}
              >
                {plan.preview.map((v) => (
                  <tr key={v.importRef} className="border-t border-rule align-top">
                    <Td className="font-mono text-[12px]">{v.importRef}</Td>
                    <Td>{v.studentName}</Td>
                    <Td>{v.resultVisible ? 'On the website' : 'Private'}</Td>
                    <Td>{v.nameShown ?? 'Not shown'}</Td>
                    <Td>{v.photoShown ? 'Shown' : 'Not shown'}</Td>
                    <Td className="text-muted">
                      {v.reasons.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {v.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </tr>
                ))}
              </TableShell>
              {plan.previewTruncated > 0 ? (
                <p className="mt-3 text-small text-muted">
                  and {plan.previewTruncated} more, all stored privately in the same way.
                </p>
              ) : null}
            </Card>
          ) : null}

          {canImport ? (
            <Card>
        <SectionHeading title={"Ready to import"} description={"This adds the records to your private list. It does not put anything on the website."} />
              <form action={runImport} className="flex flex-col gap-4">
                <input type="hidden" name="digest" value={state.digest ?? ''} />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm-file" className="text-small font-medium text-text">
                    Choose the same file again to confirm
                  </label>
                  <input
                    id="confirm-file"
                    type="file"
                    name="file"
                    accept=".csv,text/csv"
                    required
                    aria-describedby="confirm-file-help"
                    className="w-full rounded-sm border border-rule bg-paper px-3 py-2.5 text-base text-text file:mr-3 file:rounded-sm file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-small file:text-text"
                  />
                  <p id="confirm-file-help" className="text-small text-muted">
                    {chosen ? `You checked ${chosen}. ` : ''}
                    Your file is never kept on the server, so it is read once more to import it. If
                    it has changed since you checked it, we will show you the differences instead of
                    importing.
                  </p>
                </div>
                <div>
                  <ImportButton
                    count={plan.createCount + plan.updateCount}
                  />
                </div>
              </form>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div>
      <dt className="text-small text-muted">{label}</dt>
      <dd
        className={`mt-1 font-display text-[28px] font-bold tabular-nums ${
          tone === 'warn' && value > 0 ? 'text-warn' : 'text-heading'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function CheckButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Checking…' : 'Check this file'}
    </Button>
  );
}

/**
 * The confirm button names what it will do and how much of it.
 *
 * "Import 962 records" rather than "Save": the count is the thing the teacher
 * should read before pressing, and a vague verb on a bulk write is how people
 * end up surprised.
 */
function ImportButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Importing…' : `Import ${count} ${count === 1 ? 'record' : 'records'}`}
    </Button>
  );
}

/** A titled section inside a Card, matching the pattern used elsewhere in the admin. */
function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-[16px] font-semibold text-heading">{title}</h2>
      {description ? <p className="mt-1 text-small text-muted">{description}</p> : null}
    </div>
  );
}
