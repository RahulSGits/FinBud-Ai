/**
 * Normalise a phone number to E.164.
 *
 * India-first: a bare 10-digit number is assumed to be Indian, which is the
 * dominant case in imported spreadsheets. Returns null when the input cannot
 * be a valid number, so callers can report skipped rows instead of silently
 * dialling something wrong.
 */
export function normalisePhone(raw: string): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;

  if (t.startsWith('+')) {
    const d = t.slice(1).replace(/\D/g, '');
    return d.length >= 10 ? `+${d}` : null;
  }

  const d = t.replace(/\D/g, '');
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith('91')) return `+${d}`;
  return d.length >= 10 ? `+${d}` : null;
}
