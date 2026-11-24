'use strict';
// What is this code? Scanned (or typed) codes are looked up here and answered with a small
// description the browser can show or act on. Codes never hold PINs or balances: they only
// point at things. Our own codes look like KH-<letter>-<id>; see docs/kids-hub-design.md.

const money = (c) => `$${(c / 100).toFixed(2)}`;

// Real product barcodes: EAN-13, UPC-A, EAN-8 (and ISBN, which is EAN-13 starting 978/979).
function productInfo(digits) {
  const format = digits.length === 13 ? (/^97[89]/.test(digits) ? 'ISBN' : 'EAN-13') : digits.length === 12 ? 'UPC-A' : 'EAN-8';
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return { format, valid: check === Number(digits.at(-1)), check };
}

function findOrder(db, id) { return db.orders.find((o) => o.id === id); }

function orderInfo(db, o, kind) {
  const store = db.stores.find((s) => s.id === o.storeId);
  const kitchen = store && store.kitchen !== false;
  return {
    kind, id: o.id, app: 'store',
    emoji: kind === 'receipt' ? '🧾' : '🎫',
    label: `${kind === 'receipt' ? 'Receipt' : 'Kitchen ticket'} for order #${o.number}`,
    detail: [store ? `${store.emoji} ${store.name}` : 'A store that is gone', `for ${o.customer}`, money(o.total),
      o.paid ? (o.paidWith?.method === 'card' ? `paid by card ••${o.paidWith.last4}` : 'paid') : 'not paid yet',
      kitchen ? { new: 'new', making: 'being made', ready: 'ready!', delivered: 'delivered' }[o.status] : null].filter(Boolean).join(' · '),
    href: kitchen ? `#/orders/${o.storeId}` : store ? `#/cashier/${store.id}` : '#/store',
    go: kitchen ? 'Kitchen orders' : 'The store',
    order: { id: o.id, number: o.number, storeId: o.storeId, total: o.total, paid: o.paid, status: o.status },
  };
}

function lookup(db, raw) {
  const code = String(raw ?? '').trim().slice(0, 300);
  if (!code) return { kind: 'empty', code, emoji: '🤔', label: 'That scan was empty' };

  const kh = /^KH-([A-Z])-([A-Z0-9]{1,24})$/i.exec(code);
  if (kh) {
    const letter = kh[1].toUpperCase();
    const id = kh[2].toLowerCase();
    const base = { code, ours: true };
    if (letter === 'P') {
      const c = db.customers.find((x) => x.id === id);
      if (c) return { ...base, kind: 'person', id, app: 'people', emoji: c.emoji, photo: c.photo || null, label: `${c.name}'s member card`, detail: 'A person on the People list', href: '#/people', go: 'People' };
    }
    if (letter === 'C') {
      for (const a of db.accounts) {
        const card = a.cards.find((k) => k.id === id);
        if (card) {
          const bank = db.banks.find((b) => b.id === a.bankId);
          return { ...base, kind: 'card', id, app: 'bank', emoji: '💳', label: `${a.owner.name}'s debit card ••${card.number.slice(-4)}`,
            detail: `${bank ? `${bank.emoji} ${bank.name}` : 'Bank'}${card.frozen ? ' · frozen ❄️' : ''}`, href: `#/bank/${a.bankId}`, go: 'The bank',
            card: { id: card.id, accountId: a.id, customerId: a.customerId, last4: card.number.slice(-4), frozen: !!card.frozen } };
        }
      }
    }
    if (letter === 'R' || letter === 'K') {
      const o = findOrder(db, id);
      if (o) return { ...base, ...orderInfo(db, o, letter === 'R' ? 'receipt' : 'ticket') };
      return { ...base, kind: 'gone', emoji: '🧾', label: letter === 'R' ? 'An old receipt' : 'An old kitchen ticket', detail: 'That order has been cleared away.' };
    }
    if (letter === 'I') {
      for (const s of db.stores) {
        const item = s.items.find((i) => i.id === id);
        if (item) return { ...base, kind: 'item', id, app: 'store', emoji: item.emoji, photo: item.photo || null, icon: item.icon || null, label: item.name, detail: `${money(item.price)} at ${s.emoji} ${s.name}`, href: `#/cashier/${s.id}`, go: s.name, item: { id: item.id, storeId: s.id, price: item.price } };
      }
    }
    return { ...base, kind: 'gone', emoji: '👻', label: 'A Kids Hub code', detail: 'Whatever it belonged to is gone now.' };
  }
  if (/^KH-TEST/i.test(code)) return { code, ours: true, kind: 'test', emoji: '🎉', label: 'The printer test code', detail: 'The scanner works!' };

  if (/^\d{8}$|^\d{12,13}$/.test(code)) {
    const p = productInfo(code);
    // A store item someone linked to this barcode (Setup → item → barcodes).
    for (const s of db.stores) {
      const item = s.items.find((i) => Array.isArray(i.barcodes) && i.barcodes.includes(code));
      if (item) return { code, kind: 'item', id: item.id, app: 'store', product: p, emoji: item.emoji, photo: item.photo || null, icon: item.icon || null, label: item.name, detail: `${money(item.price)} at ${s.emoji} ${s.name}`, href: `#/cashier/${s.id}`, go: s.name, item: { id: item.id, storeId: s.id, price: item.price } };
    }
    return { code, kind: 'product', product: p, emoji: p.format === 'ISBN' ? '📚' : '📦',
      label: p.format === 'ISBN' ? 'A book barcode' : 'A product barcode',
      detail: `${p.format}${p.valid ? ' · the check digit is right ✅' : ' · the check digit looks wrong 🤔'}` };
  }
  return { code, kind: 'text', emoji: '💬', label: 'Some writing', detail: code.length > 120 ? `${code.slice(0, 120)}…` : code };
}

module.exports = { lookup, productInfo };
