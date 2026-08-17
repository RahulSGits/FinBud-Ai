// Proves the money arithmetic in lib/billing/money.ts.
//
//   node scripts/test-billing-money.mjs
//
// Money is the one place a rounding error becomes an argument with a customer,
// so the rules that decide what is owed are tested rather than assumed:
// integers throughout, tax on the discounted subtotal, GST halves that sum back
// to the whole, refunds re-opening a balance, and overdue derived from the date
// rather than from somebody remembering to change a dropdown.
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(root, '.money-'));
let pass = 0, fail = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log('        expected', JSON.stringify(expected)); console.log('        actual  ', JSON.stringify(actual)); }
}

try {
  const out = join(dir, 'money.mjs');
  execFileSync('npx', ['esbuild', 'lib/billing/money.ts', '--format=esm', `--outfile=${out}`, '--log-level=error'],
    { cwd: root, stdio: 'inherit' });
  const M = await import(out);

  console.log('\nIntegers, not floats:');
  // The canonical float trap: 0.1 + 0.2 !== 0.3.
  check('0.1 + 0.2 in paise is exact', M.toMinor(0.1) + M.toMinor(0.2), M.toMinor(0.3));
  check('₹25,000 is 2,500,000 paise', M.toMinor(25000), 2500000);

  console.log('\nTotals:');
  const plain = M.computeTotals([{ quantity: 1, unitMinor: 2500000 }]);
  check('no tax, no discount', plain.totalMinor, 2500000);

  const taxed = M.computeTotals([{ quantity: 1, unitMinor: 2500000 }], { tax: { rate: 18, intraState: true } });
  check('18% GST on ₹25,000', taxed.taxMinor, 450000);
  check('CGST + SGST = tax', taxed.cgstMinor + taxed.sgstMinor, taxed.taxMinor);
  check('total = subtotal + tax', taxed.totalMinor, 2500000 + 450000);

  const inter = M.computeTotals([{ quantity: 1, unitMinor: 2500000 }], { tax: { rate: 18, intraState: false } });
  check('inter-state is a single IGST line', [inter.igstMinor, inter.cgstMinor], [450000, 0]);

  // An odd tax amount must not lose a paisa in the CGST/SGST split.
  const odd = M.computeTotals([{ quantity: 1, unitMinor: 1111 }], { tax: { rate: 18, intraState: true } });
  check('odd tax splits without losing a paisa', odd.cgstMinor + odd.sgstMinor, odd.taxMinor);

  console.log('\nDiscounts:');
  const disc = M.computeTotals([{ quantity: 1, unitMinor: 1000000 }], { discountMinor: 200000, tax: { rate: 18, intraState: true } });
  check('tax charged on the discounted amount', disc.taxMinor, Math.round((1000000 - 200000) * 0.18));
  const over = M.computeTotals([{ quantity: 1, unitMinor: 1000 }], { discountMinor: 999999 });
  check('discount cannot exceed subtotal', over.totalMinor, 0);

  console.log('\nBalance and status:');
  const base = { totalMinor: 5000000, dueDate: new Date('2026-08-15') };
  const past = new Date('2026-09-01');
  const before = new Date('2026-08-01');

  check('unpaid balance', M.balanceOf({ ...base, paidMinor: 0, refundedMinor: 0 }), 5000000);
  check('part paid', M.balanceOf({ ...base, paidMinor: 2000000, refundedMinor: 0 }), 3000000);
  check('fully paid', M.balanceOf({ ...base, paidMinor: 5000000, refundedMinor: 0 }), 0);
  check('a refund re-opens the balance', M.balanceOf({ ...base, paidMinor: 5000000, refundedMinor: 1000000 }), 1000000);

  check('paid', M.deriveStatus({ ...base, paidMinor: 5000000, refundedMinor: 0 }, before), 'paid');
  check('partially paid before the due date', M.deriveStatus({ ...base, paidMinor: 2000000, refundedMinor: 0 }, before), 'partially_paid');
  check('overdue is derived from the date', M.deriveStatus({ ...base, paidMinor: 0, refundedMinor: 0 }, past), 'overdue');
  check('half paid and late still reads overdue', M.deriveStatus({ ...base, paidMinor: 2000000, refundedMinor: 0 }, past), 'overdue');
  check('paid stays paid after the due date', M.deriveStatus({ ...base, paidMinor: 5000000, refundedMinor: 0 }, past), 'paid');
  check('cancelled wins over overdue', M.deriveStatus({ ...base, paidMinor: 0, refundedMinor: 0, cancelledAt: new Date() }, past), 'cancelled');

  console.log('\nPresentation:');
  check('lakh grouping', M.formatMoney(125000000), '₹12,50,000');
  check('invoice number', M.invoiceNumber(2026, 124), 'INV-2026-00124');

  console.log(`\n${pass} passed, ${fail} failed\n`);
} finally { rmSync(dir, { recursive: true, force: true }); }
process.exit(fail === 0 ? 0 : 1);
