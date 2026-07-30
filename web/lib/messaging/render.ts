// WhatsApp template rendering.
//
// Pure and dependency-free on purpose: no Prisma, no database, no environment.
// The template editor (client) and the send path (server) both call this, so it
// has to produce byte-identical output in either place — a preview that differs
// from what the customer receives is worse than no preview at all.

export type PlaceholderName =
  | 'customer_name'
  | 'first_name'
  | 'phone'
  | 'company'
  | 'loan_type'
  | 'loan_amount'
  | 'agent_name'
  | 'employee_name'
  | 'company_name'
  | 'callback_time';

/** What the caller knows about this particular send. Every field is optional. */
export interface TemplateVars {
  customer_name?: string | null;
  first_name?: string | null;
  phone?: string | null;
  company?: string | null;
  loan_type?: string | null;
  loan_amount?: number | string | null;
  agent_name?: string | null;
  employee_name?: string | null;
  company_name?: string | null;
  callback_time?: string | null;
}

/** One entry of the editor's insert menu. */
export interface Placeholder {
  /** The exact text to insert into a body, braces included. */
  token: string;
  label: string;
  example: string;
}

interface Spec {
  label: string;
  example: string;
  /**
   * Used when the value is missing at send time.
   *
   * There is deliberately no "leave it as-is" option. A lead imported without a
   * name is completely normal, and a customer receiving the literal text
   * "Hi {{customer_name}}," on WhatsApp reads as a broken mail-merge from a
   * company they are about to hand financial documents to. A neutral word costs
   * nothing; a leaked token costs the lead.
   */
  fallback: string;
}

// Declaration order is the order the insert menu shows them in.
const SPECS: Record<PlaceholderName, Spec> = {
  customer_name: {
    label: "Customer's full name",
    example: 'Rahul Sharma',
    fallback: 'there',
  },
  first_name: {
    label: "Customer's first name",
    example: 'Rahul',
    fallback: 'there',
  },
  phone: {
    label: "Customer's phone number",
    example: '+919876543210',
    fallback: 'your registered number',
  },
  company: {
    label: "Customer's employer or business",
    example: 'Infosys',
    fallback: 'your company',
  },
  loan_type: {
    label: 'Loan product enquired about',
    example: 'home loan',
    fallback: 'loan',
  },
  loan_amount: {
    label: 'Loan amount, formatted in rupees',
    example: '₹25,00,000',
    fallback: 'the amount you requested',
  },
  agent_name: {
    label: 'AI agent that made the call',
    example: 'Priya',
    fallback: 'our assistant',
  },
  employee_name: {
    label: 'Employee sending the message',
    example: 'Anita Desai',
    fallback: 'your Finance Buddha advisor',
  },
  company_name: {
    label: 'Our company name',
    example: 'Finance Buddha',
    fallback: 'Finance Buddha',
  },
  callback_time: {
    label: 'Scheduled callback, if one is booked',
    example: 'Tue, 30 Jul, 10:30 am',
    fallback: 'shortly',
  },
};

const NAMES = Object.keys(SPECS) as PlaceholderName[];

export const PLACEHOLDERS: Placeholder[] = NAMES.map((name) => ({
  token: `{{${name}}}`,
  label: SPECS[name].label,
  example: SPECS[name].example,
}));

/**
 * A fresh regex per call.
 *
 * A module-level /g regex carries `lastIndex` between calls, which silently
 * skips tokens when `exec` is used in a loop. Cheap to rebuild, impossible to
 * get wrong.
 */
function tokenPattern(): RegExp {
  return /\{\{([^{}]*)\}\}/g;
}

function isKnown(name: string): name is PlaceholderName {
  return Object.prototype.hasOwnProperty.call(SPECS, name);
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstWord(value: string): string {
  const parts = value.split(/\s+/);
  return parts[0] || value;
}

/**
 * Indian digit grouping: last three digits, then pairs (₹25,00,000).
 *
 * Hand-rolled rather than delegated to Intl so this module stays pure and gives
 * the same answer on a Node build without full ICU data.
 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

/** Whole rupees, grouped Indian-style, with the currency symbol. */
export function formatRupees(amount: number): string {
  const rounded = Math.round(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';
  return `${sign}₹${groupIndian(String(rounded))}`;
}

/** Numbers become ₹-formatted; anything else ("twelve lakh") passes through. */
function resolveAmount(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  const numeric =
    typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]/g, ''));

  if (Number.isFinite(numeric) && numeric > 0) return formatRupees(numeric);
  return text(raw) || null;
}

function resolve(name: PlaceholderName, vars: TemplateVars): string {
  if (name === 'loan_amount') {
    return resolveAmount(vars.loan_amount) ?? SPECS.loan_amount.fallback;
  }

  if (name === 'first_name') {
    // Contacts are imported with one `name` column, so the first name is almost
    // always derived rather than supplied.
    const explicit = text(vars.first_name);
    if (explicit) return firstWord(explicit);
    const full = text(vars.customer_name);
    if (full) return firstWord(full);
    return SPECS.first_name.fallback;
  }

  return text(vars[name]) || SPECS[name].fallback;
}

/**
 * Substitute every `{{token}}` in a body.
 *
 * Known tokens resolve to their value or their neutral fallback. Unknown ones —
 * a typo such as `{{customer name}}` that slipped past the editor, or a token
 * from an older build — are removed entirely rather than passed through, for the
 * same reason fallbacks exist: braces must never reach a customer.
 */
export function renderTemplate(body: string, vars: TemplateVars = {}): string {
  let dropped = false;

  const substituted = String(body ?? '').replace(tokenPattern(), (_match, inner: string) => {
    const name = String(inner).trim().toLowerCase();
    if (!isKnown(name)) {
      dropped = true;
      return '';
    }
    return resolve(name, vars);
  });

  // Only tidy when something was removed — otherwise the author's own spacing
  // (indented lists, deliberate blank lines) is left exactly as written.
  const cleaned = dropped
    ? substituted.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '')
    : substituted;

  return cleaned.trim();
}

/**
 * Tokens in `body` that this module does not understand, deduped and returned
 * with their braces so the editor can quote them back verbatim.
 *
 * The API rejects a save that produces any, which is what turns a silent
 * mail-merge failure into a message the author can fix.
 */
export function extractPlaceholders(body: string): string[] {
  const pattern = tokenPattern();
  const source = String(body ?? '');
  const seen: Record<string, true> = {};
  const unknown: string[] = [];

  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    const name = String(match[1]).trim().toLowerCase();
    if (!isKnown(name) && !seen[match[0]]) {
      seen[match[0]] = true;
      unknown.push(match[0]);
    }
    match = pattern.exec(source);
  }

  return unknown;
}
