// Library slips: the due-date slip, the thank-you slip, and barcode labels for homemade books.
import { printer } from '../../lib/print.js';
import { funLine } from '../../lib/fun.js';

const $ = (c) => `$${(c / 100).toFixed(2)}`;
export const dueText = (iso, long = false) => new Date(iso).toLocaleDateString([], long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
const head = [{ t: 'text', s: 'KIDS HUB LIBRARY', bold: true, invert: true, align: 'center' }];
const fun = () => (printer().funLines ? [{ t: 'rule', ch: '.' }, { t: 'text', s: funLine(), align: 'center' }] : []);

export function checkoutSlip(name, books, dueAt) {
  return { title: 'Library checkout', parts: [
    ...head,
    { t: 'text', s: 'Checked out to', align: 'center' },
    { t: 'text', s: name, size: 2, bold: true, align: 'center' },
    { t: 'rule', ch: '=' },
    ...books.map((b) => ({ t: 'text', s: `- ${b.title}${b.author ? ` (${b.author})` : ''}`, bold: true })),
    { t: 'rule', ch: '=' },
    { t: 'text', s: 'PLEASE RETURN BY', align: 'center' },
    { t: 'text', s: dueText(dueAt, true), size: 2, bold: true, align: 'center' },
    { t: 'text', s: 'Need more time? Renew at the desk.', align: 'center' },
    ...fun(), { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

export function thanksSlip(name, book, loan, stillOut) {
  return { title: 'Library return', parts: [
    ...head,
    { t: 'text', s: 'THANK YOU!', size: 2, bold: true, align: 'center' },
    { t: 'text', s: `${name} brought back`, align: 'center' },
    { t: 'text', s: book.title, size: 2, bold: true, align: 'center' },
    { t: 'text', s: new Date(loan.inAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), align: 'center' },
    { t: 'rule' },
    loan.daysLate
      ? { t: 'text', s: `${loan.daysLate} day${loan.daysLate === 1 ? '' : 's'} late.${loan.fine ? ` Fine: ${$(loan.fine)}` : ''}`, bold: true, align: 'center' }
      : { t: 'text', s: 'Right on time! Great job.', bold: true, align: 'center' },
    { t: 'text', s: stillOut ? `You still have ${stillOut} library book${stillOut === 1 ? '' : 's'}.` : 'You have no library books out.', align: 'center' },
    ...fun(), { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// Labels for books without a barcode (homemade books, comics…). Stick one inside the cover.
export function labelSlips(books, perSlip = 4) {
  const labels = books.map((b) => [
    { t: 'text', s: 'KIDS HUB LIBRARY', align: 'center' },
    { t: 'text', s: b.title, size: 2, bold: true, align: 'center' },
    ...(b.author ? [{ t: 'text', s: b.author, align: 'center' }] : []),
    { t: 'barcode', data: `KH-B-${b.id.toUpperCase()}` },
    { t: 'cut' },
  ]);
  const out = [];
  for (let k = 0; k < labels.length; k += perSlip) out.push({ title: `Book labels ${k / perSlip + 1}`, parts: labels.slice(k, k + perSlip).flat() });
  return out;
}
