// The customer's receipt for an order, as a slip for the receipt printer.
import { Art, toast } from '../../lib/core.js';
import { Slip, printer, emojiImage, printSlip, canPrint } from '../../lib/print.js';
import { funLine } from '../../lib/fun.js';
import { storeById } from './common.js';

// `extra.receipt` is what the bank said after a card payment ({ owner, balanceLeft }).
export function receiptSlip(order, extra = {}) {
  const s = storeById(order.storeId) || { name: 'Store', emoji: '🏪', taxRate: 0 };
  const $ = Slip.money;
  const when = new Date(order.updatedAt || order.createdAt || Date.now());
  const parts = [
    emojiImage(s.emoji || '🏪', 112),
    { t: 'text', s: s.name, size: 2, bold: true, align: 'center' },
    { t: 'text', s: 'Thank you for shopping with us!', align: 'center' },
    { t: 'rule' },
    { t: 'text', s: `ORDER #${order.number}`, size: 2, bold: true, align: 'center' },
    { t: 'text', s: `For: ${order.customer}`, align: 'center' },
    { t: 'text', s: when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), align: 'center' },
    { t: 'rule', ch: '=' },
  ];
  for (const l of order.lines) {
    parts.push({ t: 'row', left: `${l.qty > 1 ? `${l.qty} x ` : ''}${l.name}`, right: $(l.price * l.qty) });
    if (l.recipe) parts.push({ t: 'text', s: `   ${Art.detailOf(l.builder, l.recipe)}` });
  }
  parts.push({ t: 'rule' });
  if (order.tax) {
    parts.push({ t: 'row', left: 'Subtotal', right: $(order.subtotal) });
    parts.push({ t: 'row', left: `Tax (${s.taxRate}%)`, right: $(order.tax) });
  }
  parts.push({ t: 'row', left: 'TOTAL', right: $(order.total), size: 2, bold: true });
  if (!order.paid) {
    parts.push({ t: 'text', s: 'NOT PAID YET - pay later', bold: true, invert: true, align: 'center' });
  } else if (order.paidWith?.method === 'card') {
    parts.push({ t: 'row', left: `Debit card ****${order.paidWith.last4}`, right: $(order.total) });
    if (extra.receipt?.balanceLeft != null) parts.push({ t: 'row', left: `${extra.receipt.owner} has left in the bank`, right: $(extra.receipt.balanceLeft) });
    parts.push({ t: 'text', s: 'APPROVED', bold: true, align: 'center' });
  } else {
    if (order.tendered != null && order.tendered !== order.total) parts.push({ t: 'row', left: 'Cash', right: $(order.tendered) });
    else parts.push({ t: 'row', left: 'Cash', right: $(order.total) });
    if (order.change) parts.push({ t: 'row', left: 'Change', right: $(order.change), bold: true });
  }
  parts.push({ t: 'rule' }, { t: 'qr', data: `KH-R-${order.id.toUpperCase()}`, size: 5 }, { t: 'text', s: 'Keep this receipt for returns', align: 'center' });
  if (printer().funLines) parts.push({ t: 'rule', ch: '.' }, { t: 'text', s: funLine(), align: 'center' });
  parts.push({ t: 'feed', n: 1 }, { t: 'cut' });
  return { title: `Receipt #${order.number}`, parts };
}

// After a sale: print right away when Setup → Printer says so. Returns true when it tried.
export function autoReceipt(order, extra) {
  if (!printer().autoReceipt || !canPrint()) return false;
  printSlip(receiptSlip(order, extra)).catch((e) => toast(e.message));
  return true;
}
