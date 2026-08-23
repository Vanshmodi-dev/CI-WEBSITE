'use client';

import { useState } from 'react';
import { inputClass } from '@/components/primitives/field';

export type SubjectRow = { subject: string; score: string };

/**
 * Subject-wise marks.
 *
 * A commerce result is more persuasive broken down — "Accounts 99, Economics
 * 98" says more than "96%". The model existed since Phase 4 but had no way to
 * enter anything into it, so no result could ever show its subjects.
 *
 * Rows are plain repeated inputs rather than a nested form: the server reads
 * `subjectName[]` and `subjectScore[]` in parallel, so this works without
 * JavaScript too — the JS here only adds and removes rows.
 *
 * A half-filled row (a subject with no mark, or a mark with no subject) is
 * dropped by the server rather than guessed at.
 */
export function SubjectScores({ initial = [] }: { initial?: SubjectRow[] }) {
  const [rows, setRows] = useState<SubjectRow[]>(
    initial.length > 0 ? initial : [{ subject: '', score: '' }],
  );

  function update(index: number, patch: Partial<SubjectRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <div>
      <p className="text-small font-medium text-text">Subject marks</p>
      <p className="mt-0.5 text-[13px] text-muted">
        Optional. Leave blank if you would rather show only the overall result.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`subject-${index}`}>
              Subject {index + 1}
            </label>
            <input
              id={`subject-${index}`}
              name="subjectName"
              type="text"
              maxLength={60}
              placeholder="Subject"
              value={row.subject}
              onChange={(e) => update(index, { subject: e.target.value })}
              className={`${inputClass(false)} flex-1`}
            />
            <label className="sr-only" htmlFor={`subject-score-${index}`}>
              Marks for subject {index + 1}
            </label>
            <input
              id={`subject-score-${index}`}
              name="subjectScore"
              type="number"
              step="0.01"
              min={0}
              placeholder="Marks"
              value={row.score}
              onChange={(e) => update(index, { score: e.target.value })}
              className={`${inputClass(false)} w-28`}
            />
            <button
              type="button"
              onClick={() => setRows((c) => (c.length > 1 ? c.filter((_, i) => i !== index) : c))}
              disabled={rows.length === 1}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-rule text-muted transition-colors hover:bg-surface disabled:opacity-40"
            >
              <span className="sr-only">Remove subject {index + 1}</span>
              <span aria-hidden="true">&times;</span>
            </button>
          </li>
        ))}
      </ul>

      {rows.length < 15 ? (
        <button
          type="button"
          onClick={() => setRows((c) => [...c, { subject: '', score: '' }])}
          className="mt-3 inline-flex min-h-11 items-center rounded-sm border border-rule px-3 text-small text-text transition-colors hover:bg-surface"
        >
          + Add a subject
        </button>
      ) : null}
    </div>
  );
}
