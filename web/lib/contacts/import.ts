// Spreadsheet -> contact rows, in the browser.
//
// Parsing runs client-side so the user sees the detected columns and a preview
// before anything is written. The server still re-validates every phone number
// (see /api/contacts), because a hand-crafted request never touches this file.
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ImportedContact {
  name?: string | null;
  phone: string;
  email?: string | null;
  company?: string | null;
  loanType?: string | null;
  loanAmount?: number | null;
  /** Columns we don't recognise, preserved rather than discarded. */
  customFields?: Record<string, unknown>;
}

export interface ImportResult {
  contacts: ImportedContact[];
  /** Header actually used for each known field, for "we read X as phone". */
  mapping: Record<string, string | null>;
  /** Rows dropped because they had no usable phone number. */
  skipped: number;
  totalRows: number;
  headers: string[];
}

/** Header patterns, most specific first so "phone number" doesn't win "name". */
const PATTERNS: { field: keyof ImportedContact; test: RegExp }[] = [
  { field: 'phone', test: /^(phone|mobile|mob|contact|number|msisdn|whatsapp|cell|telephone|tel)/i },
  { field: 'email', test: /e-?mail/i },
  { field: 'loanAmount', test: /(loan.?amount|amount|ticket|requirement|value)/i },
  { field: 'loanType', test: /(loan.?type|product|category|purpose)/i },
  { field: 'company', test: /(company|employer|organisation|organization|firm|business)/i },
  { field: 'name', test: /name/i },
];

function detect(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {
    name: null, phone: null, email: null, company: null, loanType: null, loanAmount: null,
  };

  for (const { field, test } of PATTERNS) {
    if (mapping[field]) continue;
    const hit = headers.find((h) => !Object.values(mapping).includes(h) && test.test(h.trim()));
    if (hit) mapping[field] = hit;
  }
  return mapping;
}

/**
 * Loose client-side phone check.
 *
 * Deliberately permissive — it only decides whether to show the row in the
 * preview. lib/contacts/phone.ts does the real E.164 normalisation server-side.
 */
function looksLikePhone(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return s;
}

function toRows(records: Record<string, unknown>[], headers: string[]): ImportResult {
  const mapping = detect(headers);
  const known = new Set(Object.values(mapping).filter(Boolean) as string[]);

  const contacts: ImportedContact[] = [];
  let skipped = 0;

  for (const rec of records) {
    // Without a header match, fall back to the first column that parses as a
    // phone number — spreadsheets exported from CRMs often have no headers.
    const phoneRaw = mapping.phone ? rec[mapping.phone] : Object.values(rec).find(looksLikePhone);
    const phone = looksLikePhone(phoneRaw);
    if (!phone) {
      skipped++;
      continue;
    }

    const custom: Record<string, unknown> = {};
    for (const h of headers) {
      if (known.has(h)) continue;
      const v = rec[h];
      if (v !== undefined && v !== null && String(v).trim()) custom[h] = v;
    }

    const amountRaw = mapping.loanAmount ? rec[mapping.loanAmount] : null;
    const amount = amountRaw != null ? Number(String(amountRaw).replace(/[^\d.]/g, '')) : NaN;

    contacts.push({
      phone,
      name: mapping.name ? String(rec[mapping.name] ?? '').trim() || null : null,
      email: mapping.email ? String(rec[mapping.email] ?? '').trim() || null : null,
      company: mapping.company ? String(rec[mapping.company] ?? '').trim() || null : null,
      loanType: mapping.loanType ? String(rec[mapping.loanType] ?? '').trim() || null : null,
      loanAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
      customFields: Object.keys(custom).length ? custom : undefined,
    });
  }

  return { contacts, mapping, skipped, totalRows: records.length, headers };
}

function parseCsv(text: string): ImportResult {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  return toRows(parsed.data ?? [], headers);
}

function parseSheet(buffer: ArrayBuffer): ImportResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { contacts: [], mapping: {}, skipped: 0, totalRows: 0, headers: [] };

  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const headers = Object.keys(records[0] ?? {}).map((h) => h.trim());
  return toRows(records, headers);
}

export const ACCEPTED_TYPES = '.csv,.tsv,.txt,.xls,.xlsx';

/** Parse a user-selected file. Rejects with a readable message on failure. */
export async function parseContactFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseSheet(await file.arrayBuffer());
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return parseCsv(await file.text());
  }
  throw new Error('Upload a CSV or Excel file (.csv, .tsv, .xls, .xlsx).');
}
