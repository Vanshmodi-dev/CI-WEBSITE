/**
 * CSV reading and writing — PURE, no imports, no I/O, no dependencies.
 *
 * =============================================================================
 * WHY THERE IS NO SPREADSHEET LIBRARY IN THIS PROJECT
 * =============================================================================
 * Phase 12's brief asks for CSV and, if it can be done safely, XLSX. This file
 * supports CSV only, and that is a decision rather than an omission.
 *
 * CSV is a grammar you can hold in your head: RFC 4180 is a page long, and the
 * parser below implements all of it. XLSX is a ZIP archive of XML documents.
 * Parsing it safely means owning a ZIP reader (decompression bombs), an XML
 * parser (entity expansion, external entities), a shared-string table
 * (unbounded allocation), and a formula grammar. Every one of those is a
 * category of vulnerability, and none of them is a category this project can
 * audit — which is the standing rule for taking on a dependency here.
 *
 * The candidate library is SheetJS. Its free build is no longer published to
 * npm, it has a history of prototype-pollution and ReDoS advisories, and it
 * would run inside the admin panel that holds every student's marks.
 *
 * What the teacher loses: one menu click. Excel, LibreOffice, Google Sheets and
 * Numbers all export CSV from File > Save As. What they gain is an import path
 * whose entire parsing surface is the 120 lines below, which are unit-tested
 * and which nobody can update out from under us.
 *
 * If XLSX is ever genuinely required, the honest way to add it is a separate
 * conversion step outside this application, not a parser inside it.
 *
 * =============================================================================
 * FORMULA INJECTION
 * =============================================================================
 * A CSV cell is text. A spreadsheet application decides otherwise: open a file
 * whose cell begins `=`, `+`, `-`, `@`, tab or carriage return and Excel may
 * evaluate it as a formula. `=HYPERLINK(...)` and worse follow from there, and
 * the payload arrives from whatever a visitor typed into an enquiry form.
 *
 * `neutraliseCell` handles the export direction. It does NOT rewrite values on
 * import — a name is a name, and silently mangling one because it starts with a
 * hyphen would corrupt real data to solve an export problem.
 */

/** A parsed sheet: the header row, and every data row keyed by column name. */
export type CsvTable = {
  headers: string[];
  /** One entry per data row, in file order. Values are raw strings. */
  rows: Array<Record<string, string>>;
  /** Data row count, excluding the header. */
  rowCount: number;
};

export type CsvLimits = {
  maxRows: number;
  maxColumns: number;
  maxCellLength: number;
  maxCells: number;
};

/**
 * Bounds, derived from the expected scale rather than chosen for roundness.
 *
 * The institute is about 1,000 students. `maxRows` is five times that, so a
 * legitimate file never meets it while a runaway one stops early. `maxColumns`
 * is roughly three times the template. `maxCellLength` is the largest column in
 * the schema (`journey`, VARCHAR(4000)) with headroom. `maxCells` bounds the
 * product, because 5,000 rows of 64 columns is a different problem from either
 * limit alone.
 */
export const CSV_LIMITS: CsvLimits = {
  maxRows: 5_000,
  maxColumns: 64,
  maxCellLength: 8_000,
  maxCells: 100_000,
};

export type CsvParseFailure = {
  ok: false;
  /** Teacher-facing. Never a parser internal. */
  message: string;
  line?: number;
};

export type CsvParseSuccess = { ok: true; table: CsvTable };
export type CsvParseResult = CsvParseSuccess | CsvParseFailure;

/**
 * Split CSV text into rows of raw fields, per RFC 4180.
 *
 * Handles quoted fields, embedded commas, embedded newlines, and `""` as an
 * escaped quote. Accepts CRLF, LF and CR line endings, because the three
 * spreadsheet programs a teacher might use produce three different ones.
 *
 * Bounded as it goes rather than after the fact: a file that would exceed the
 * limits stops being parsed at the point it does, so a hostile file cannot
 * allocate its way through the check.
 */
function splitRows(text: string, limits: CsvLimits): string[][] | CsvParseFailure {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;
  let cells = 0;

  const endField = (): CsvParseFailure | null => {
    if (field.length > limits.maxCellLength) {
      return {
        ok: false,
        message: `A cell on line ${line} is longer than ${limits.maxCellLength} characters. Shorten it and save again.`,
        line,
      };
    }
    row.push(field);
    field = '';
    cells += 1;
    if (cells > limits.maxCells) {
      return { ok: false, message: `This file has more than ${limits.maxCells} cells, which is too large to check.` };
    }
    if (row.length > limits.maxColumns) {
      return {
        ok: false,
        message: `Line ${line} has more than ${limits.maxColumns} columns. Check for stray commas.`,
        line,
      };
    }
    return null;
  };

  const endRow = (): CsvParseFailure | null => {
    const failed = endField();
    if (failed) return failed;
    rows.push(row);
    row = [];
    if (rows.length > limits.maxRows) {
      return {
        ok: false,
        message: `This file has more than ${limits.maxRows} rows. Split it into smaller files.`,
      };
    }
    return null;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      const failed = endField();
      if (failed) return failed;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      const failed = endRow();
      if (failed) return failed;
      line += 1;
      continue;
    }
    if (ch === '\n') {
      const failed = endRow();
      if (failed) return failed;
      line += 1;
      continue;
    }
    field += ch;
  }

  if (inQuotes) {
    return {
      ok: false,
      message: 'A quoted value is never closed. Check for a stray " character.',
      line,
    };
  }

  // A file ending with a newline should not produce a phantom trailing row.
  if (field.length > 0 || row.length > 0) {
    const failed = endRow();
    if (failed) return failed;
  }

  return rows;
}

/** Strip a UTF-8 byte-order mark, which Excel writes and nothing wants. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Normalise a header cell for matching.
 *
 * Case and spacing vary with whoever typed the sheet; meaning does not. This is
 * the ONLY place guessing is allowed, and it guesses about column NAMES, never
 * about values.
 */
export function normaliseHeader(raw: string): string {
  return raw
    .replace(/^\u{FEFF}/u, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

export function parseCsv(text: string, limits: CsvLimits = CSV_LIMITS): CsvParseResult {
  if (typeof text !== 'string') {
    return { ok: false, message: 'That file could not be read as text.' };
  }

  // A null byte in a text file is a sign the upload is not what it claims.
  if (text.includes('\u0000')) {
    return { ok: false, message: 'That file contains binary data. Save it as CSV and try again.' };
  }

  const cleaned = stripBom(text);
  if (cleaned.trim().length === 0) {
    return { ok: false, message: 'That file is empty.' };
  }

  const raw = splitRows(cleaned, limits);
  if (!Array.isArray(raw)) return raw;

  const [headerRow, ...dataRows] = raw;
  if (!headerRow || headerRow.every((h) => h.trim().length === 0)) {
    return { ok: false, message: 'The first row must contain the column headings from the template.' };
  }

  const headers = headerRow.map(normaliseHeader);
  const duplicate = headers.find((h, i) => h.length > 0 && headers.indexOf(h) !== i);
  if (duplicate) {
    return { ok: false, message: `The column "${duplicate}" appears more than once.` };
  }

  const rows = dataRows
    // A row of nothing but commas is what a spreadsheet leaves behind when
    // someone deletes content without deleting the row. It is not an error.
    .filter((cells) => cells.some((c) => c.trim().length > 0))
    .map((cells) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header.length > 0) record[header] = cells[index] ?? '';
      });
      return record;
    });

  return { ok: true, table: { headers, rows, rowCount: rows.length } };
}

/* ------------------------------------------------------------- writing ---- */

/** Characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Make a value safe to open in a spreadsheet.
 *
 * Prefixes a single quote, which Excel and LibreOffice both read as "this is
 * text". The apostrophe is not part of the value; it is an instruction to the
 * reader, and it disappears when the cell is read back.
 *
 * Applied on EXPORT only. Import leaves values exactly as written.
 */
export function neutraliseCell(value: string): string {
  return FORMULA_LEAD.test(value) ? `'${value}` : value;
}

/** Quote a field if it needs it, doubling any embedded quotes. */
function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
};

/** Render a table as CSV text, formula-safe and Excel-friendly. */
export function toCsv<T>(columns: ReadonlyArray<CsvColumn<T>>, rows: readonly T[]): string {
  const cell = (raw: string | number | boolean | Date | null | undefined): string => {
    if (raw === null || raw === undefined) return '';
    const text =
      raw instanceof Date
        ? raw.toISOString().slice(0, 10)
        : typeof raw === 'boolean'
          ? raw
            ? 'yes'
            : 'no'
          : String(raw);
    return quote(neutraliseCell(text));
  };

  const lines = [columns.map((c) => quote(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(c.value(row))).join(','));
  }
  // CRLF is what RFC 4180 specifies and what Excel expects. The byte-order mark
  // makes Excel read the file as UTF-8 rather than the local code page, which is
  // the difference between a name rendering correctly and rendering as mojibake.
  // Written as an escape, never as a literal: an invisible character in source
  // is a character nobody can review.
  return `\u{FEFF}${lines.join('\r\n')}\r\n`;
}

/**
 * A filename safe to put in a Content-Disposition header.
 *
 * Never derived from user input in this application, but bounded anyway: the
 * header is a place where a stray quote or newline becomes response splitting.
 */
export function safeDownloadName(base: string): string {
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : 'export';
}
