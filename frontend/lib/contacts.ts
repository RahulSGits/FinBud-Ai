// Shared CSV contact parser used by the campaign builder and the campaign
// editor. Detects the phone + name columns and returns the actual rows.
export interface ParsedContact { name: string; phone: string; }

export interface ParseResult {
  contacts: ParsedContact[];
  phoneCol: string;
  nameCol: string;
}

export function parseContactsCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 1) return { contacts: [], phoneCol: '—', nameCol: '—' };

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  let phoneIdx = headers.findIndex((h) => /phone|mobile|number|contact|whatsapp/.test(h));
  let nameIdx = headers.findIndex((h) => /name/.test(h));

  // If the first row has no header keywords, treat it as data (phone in col 0).
  const hasHeader = phoneIdx >= 0 || nameIdx >= 0;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (phoneIdx < 0) phoneIdx = 0;

  const contacts: ParsedContact[] = [];
  for (const line of dataLines) {
    const cols = line.split(',').map((c) => c.trim());
    const rawPhone = cols[phoneIdx] || '';
    const phone = rawPhone.replace(/[^\d+]/g, '');
    if (phone.replace(/\D/g, '').length < 6) continue;
    const name = nameIdx >= 0 ? (cols[nameIdx] || '') : '';
    contacts.push({ name, phone });
  }

  return {
    contacts,
    phoneCol: hasHeader && headers[phoneIdx] ? headers[phoneIdx] : 'column 1',
    nameCol: nameIdx >= 0 ? headers[nameIdx] : '—',
  };
}
