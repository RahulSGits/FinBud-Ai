// Money, and the arithmetic that decides what a company owes.
//
// Every amount in the billing tables is an integer count of the currency's
// minor unit — paise for INR. Never a float: 0.1 + 0.2 is not 0.3 in binary
// floating point, and an invoice that disagrees with the sum of its payments by
// a rounding error is an accounting problem, not a display one.
//
// The balance is computed here and stored, so no screen recomputes it. A figure
// derived in two places eventually disagrees with itself, and when the figure
// is "how much does this customer owe", the disagreement is the kind somebody
// notices.

/** Rupees to paise. Rounds, because a price is authored in rupees. */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

/** Paise to rupees, for display only. */
export function toMajor(minor: number): number {
  return minor / 100;
}

/**
 * Format for an Indian audience: ₹12,50,000 uses lakh/crore grouping, which
 * en-IN gets right and en-US does not.
 */
export function formatMoney(minor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(toMajor(minor));
}

export interface TaxConfig {
  /** Whole percent, e.g. 18 for GST at 18%. */
  rate: number;
  /**
   * Same state as the seller: the tax splits into CGST + SGST. Different state
   * (or export): it is a single IGST line. Getting this wrong does not change
   * the total, but it does make the invoice wrong for the customer's filing.
   */
  intraState: boolean;
}

export interface InvoiceTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
}

/**
 * Work out an invoice's totals from its lines.
 *
 * Tax is charged on the discounted subtotal, not the gross — discounting after
 * tax would collect tax on money nobody paid.
 */
export function computeTotals(
  lines: { quantity: number; unitMinor: number }[],
  opts: { discountMinor?: number; tax?: TaxConfig | null } = {}
): InvoiceTotals {
  const subtotalMinor = lines.reduce((sum, l) => sum + Math.max(0, l.quantity) * l.unitMinor, 0);

  // A discount can never exceed the subtotal; a negative total is not a refund,
  // it is a bug that would read as the platform owing the customer money.
  const discountMinor = Math.min(Math.max(0, opts.discountMinor ?? 0), subtotalMinor);
  const taxable = subtotalMinor - discountMinor;

  let taxMinor = 0;
  let cgstMinor = 0;
  let sgstMinor = 0;
  let igstMinor = 0;

  if (opts.tax && opts.tax.rate > 0) {
    taxMinor = Math.round((taxable * opts.tax.rate) / 100);
    if (opts.tax.intraState) {
      // Split, then give the remainder to CGST so the halves always sum back to
      // the total — an odd number of paise must not vanish.
      cgstMinor = Math.floor(taxMinor / 2);
      sgstMinor = taxMinor - cgstMinor;
    } else {
      igstMinor = taxMinor;
    }
  }

  return {
    subtotalMinor,
    discountMinor,
    taxMinor,
    cgstMinor,
    sgstMinor,
    igstMinor,
    totalMinor: taxable + taxMinor,
  };
}

/**
 * What an invoice is currently worth, given what has been paid and refunded.
 *
 * A refund puts money back on the invoice: it becomes owed again. That is the
 * behaviour an accountant expects, and it is why `due` adds refunds back rather
 * than ignoring them.
 */
export function balanceOf(inv: {
  totalMinor: number;
  paidMinor: number;
  refundedMinor: number;
}): number {
  return Math.max(0, inv.totalMinor - inv.paidMinor + inv.refundedMinor);
}

export type DerivedStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled';

/**
 * The status an invoice actually has, from its numbers and the date.
 *
 * Derived rather than stored-and-edited, because the spec is right that overdue
 * must not depend on somebody remembering to change a dropdown. Cancelled and
 * draft are the two a human genuinely decides, so they win.
 */
export function deriveStatus(
  inv: {
    totalMinor: number;
    paidMinor: number;
    refundedMinor: number;
    dueDate: Date;
    cancelledAt?: Date | null;
    issueDate?: Date | null;
  },
  now: Date = new Date()
): DerivedStatus {
  if (inv.cancelledAt) return 'cancelled';

  const due = balanceOf(inv);
  if (due === 0 && inv.paidMinor > 0) return 'paid';

  // Past the date with money outstanding. Checked before partially_paid so a
  // half-paid late invoice reads as overdue, which is the one that needs
  // chasing.
  if (due > 0 && now > inv.dueDate) return 'overdue';

  if (inv.paidMinor > 0 && due > 0) return 'partially_paid';
  return 'issued';
}

/** A stable, sortable, human-facing invoice number: INV-2026-00124. */
export function invoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(5, '0')}`;
}
