// Store slips for the receipt printer (besides the customer's receipt, in receipt.js):
// kitchen tickets, price tags, return slips, take-a-number tickets and the end-of-day report.
import { Art, toast } from '../../lib/core.js';
import { Slip, printer, canPrint, printSlip, emojiImage, svgImage } from '../../lib/print.js';
import { funLine } from '../../lib/fun.js';
import { storeById } from './common.js';

const $ = (c) => Slip.money(c);
const time = (d = new Date()) => new Date(d).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const storeOf = (id) => storeById(id) || { name: 'Store', emoji: '🏪', taxRate: 0 };

// For the kitchen: big order number, who it's for, each thing to make (with a picture of
// custom sandwiches and drinks), and a QR code to scan when the order moves on.
export async function kitchenTicketSlip(order) {
  const s = storeOf(order.storeId);
  const parts = [
    { t: 'text', s: 'KITCHEN', bold: true, invert: true, align: 'center' },
    { t: 'text', s: `#${order.number}`, size: 4, bold: true, align: 'center' },
    { t: 'text', s: order.customer, size: 2, align: 'center' },
    { t: 'text', s: `${s.name} - ${time(order.createdAt)}`, align: 'center' },
    { t: 'rule', ch: '=' },
  ];
  for (const l of order.lines) {
    parts.push({ t: 'text', s: `${l.qty} x ${l.name}`, size: 2, bold: true });
    if (l.recipe) {
      try { parts.push({ ...(await svgImage(Art.draw(l.builder, l.recipe), 224)), align: 'center' }); } catch { /* no picture */ }
      parts.push({ t: 'text', s: Art.detailOf(l.builder, l.recipe) });
    }
    parts.push({ t: 'rule', ch: '.' });
  }
  parts.push(
    { t: 'text', s: order.paid ? 'PAID' : 'NOT PAID YET', bold: true, align: 'center' },
    { t: 'qr', data: `KH-K-${order.id.toUpperCase()}`, size: 6 },
    { t: 'text', s: 'Scan me to move the order along', align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  );
  return { title: `Kitchen ticket #${order.number}`, parts };
}

// After an order goes to the kitchen: print its ticket when Setup → Printer says so.
export function autoTicket(order) {
  if (!printer().autoTicket || !canPrint()) return false;
  kitchenTicketSlip(order).then(printSlip).catch((e) => toast(e.message));
  return true;
}

// Price tags: one strip per item, with a barcode the scanner rings up. A few per slip, so each
// print stays under the length limit.
export async function priceTagSlips(store, items, perSlip = 4) {
  const tags = [];
  for (const i of items) {
    let pic;
    try { pic = i.icon && Art.ICONS[i.icon] ? await svgImage(Art.icon(i.icon), 96) : emojiImage(i.emoji || '🏷️', 88); } catch { pic = null; }
    const sale = !i.builder && i.wasPrice > i.price;
    tags.push([
      ...(pic ? [pic] : []),
      { t: 'text', s: i.name, size: 2, bold: true, align: 'center' },
      ...(sale ? [{ t: 'text', s: `SALE! Was ${$(i.wasPrice)}`, bold: true, invert: true, align: 'center' }] : []),
      { t: 'text', s: $(i.price), size: 3, bold: true, align: 'center' },
      { t: 'barcode', data: `KH-I-${i.id.toUpperCase()}` },
      { t: 'text', s: store.name, align: 'center' },
      { t: 'cut' },
    ]);
  }
  const slips = [];
  for (let k = 0; k < tags.length; k += perSlip) {
    slips.push({ title: `Price tags ${k / perSlip + 1}`, parts: tags.slice(k, k + perSlip).flat() });
  }
  return slips;
}

// What came back at the Returns desk.
export function returnSlip(order, refund) {
  const s = storeOf(order.storeId);
  return { title: `Return #${order.number}`, parts: [
    { t: 'text', s: s.name, size: 2, bold: true, align: 'center' },
    { t: 'text', s: 'RETURN', bold: true, invert: true, align: 'center' },
    { t: 'text', s: `Order #${order.number} for ${order.customer}`, align: 'center' },
    { t: 'text', s: time(refund.at), align: 'center' },
    { t: 'rule', ch: '=' },
    ...refund.lines.map((l) => ({ t: 'row', left: `${l.qty > 1 ? `${l.qty} x ` : ''}${l.name}`, right: $(l.price * l.qty) })),
    { t: 'rule' },
    { t: 'row', left: 'GIVEN BACK', right: $(refund.amount), size: 2, bold: true },
    refund.method === 'card'
      ? { t: 'text', s: `Put back on the debit card ****${refund.last4}${refund.balanceLeft != null ? `. ${refund.owner} now has ${$(refund.balanceLeft)} in the bank.` : ''}` }
      : { t: 'text', s: 'Given back in cash.' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// Take a number (deli counter).
export function queueSlip(number, serving) {
  return { title: `Number ${number}`, parts: [
    { t: 'text', s: 'KIDS HUB STORE', bold: true, align: 'center' },
    { t: 'text', s: 'Your number', size: 2, align: 'center' },
    { t: 'text', s: String(number), size: 4, bold: true, align: 'center' },
    { t: 'text', s: serving ? `Now serving: ${serving}` : 'You are first!', align: 'center' },
    { t: 'text', s: 'Please wait until we call your number.', align: 'center' },
    { t: 'text', s: time(), align: 'center' },
    ...(printer().funLines ? [{ t: 'rule', ch: '.' }, { t: 'text', s: funLine(), align: 'center' }] : []),
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// The shopkeeper's end-of-day report.
export function reportSlip(r, storeName) {
  const take = r.sales - r.refunds;
  return { title: 'End of day', parts: [
    { t: 'text', s: 'END OF DAY', size: 2, bold: true, align: 'center' },
    { t: 'text', s: storeName, bold: true, align: 'center' },
    { t: 'text', s: new Date(`${r.day}T12:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), align: 'center' },
    { t: 'rule', ch: '=' },
    { t: 'row', left: 'Orders', right: String(r.orders) },
    ...(r.firstNumber ? [{ t: 'row', left: 'Order numbers', right: `#${r.firstNumber}-#${r.lastNumber}` }] : []),
    { t: 'row', left: 'Things sold', right: String(r.items) },
    { t: 'row', left: 'Paid with cash', right: $(r.cash) },
    { t: 'row', left: 'Paid with cards', right: $(r.card) },
    ...(r.tax ? [{ t: 'row', left: 'Tax collected', right: $(r.tax) }] : []),
    ...(r.refunds ? [{ t: 'row', left: `Returns (${r.refundCount})`, right: `-${$(r.refunds)}` }] : []),
    { t: 'rule' },
    { t: 'row', left: 'TOTAL', right: $(take), size: 2, bold: true },
    { t: 'row', left: 'Cash in the drawer', right: $(r.cash - r.cashRefunds), bold: true },
    ...(r.unpaid ? [{ t: 'row', left: `Not paid yet (${r.unpaid})`, right: $(r.unpaidAmount) }] : []),
    ...(r.best.length ? [{ t: 'rule' }, { t: 'text', s: 'BEST SELLERS', bold: true, align: 'center' },
      ...r.best.map((b, k) => ({ t: 'row', left: `${k + 1}. ${b.name}`, right: `x${b.qty}` }))] : []),
    { t: 'rule' },
    { t: 'text', s: r.orders ? 'Great job today!' : 'No sales yet today.', bold: true, align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}
