'use strict';
// What is this code? Scanned (or typed) codes are looked up here and answered with a small
// description the browser can show or act on. Codes never hold PINs or balances: they only
// point at things. Our own codes look like KH-<letter>-<id>; see docs/kids-hub-design.md.

const money = (c) => `$${(c / 100).toFixed(2)}`;

// Shortcut codes (KH-G-<name>) and where they go.
const GO = {
  store: ['#/store', '🏪', 'the Store'], bank: ['#/bank', '🏦', 'the Bank'], people: ['#/people', '🙂', 'People'],
  spy: ['#/spy', '🕵️', 'Spy HQ'], cipher: ['#/spy/cipher', '🌀', 'the Cipher Lab'], codebreaker: ['#/spy/codebreaker', '🔢', 'Code Breaker'],
  missions: ['#/spy/missions', '🗺️', 'Missions'], vault: ['#/spy/vault', '🔐', 'the Vaults'], serving: ['#/serving', '📣', 'Now Serving'],
  library: ['#/library', '📚', 'the Library'], tickets: ['#/tickets', '🎟️', 'the Box Office'], post: ['#/post', '📦', 'the Post Office'], carrier: ['#/post/carrier', '🚚', 'the mail bag'], scanner: ['#/scanner', '🔍', 'the Scanner'], qr: ['#/qr', '🔳', 'QR Studio'], calc: ['#/calc', '🧮', 'the Adding Machine'], home: ['#/', '🏠', 'the home screen'],
};

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

// A library book: on the shelf, or out with someone (and when it's due).
function bookInfo(db, book) {
  const loan = (db.library?.loans || []).find((l) => l.bookId === book.id && !l.inAt);
  const who = loan && db.customers.find((c) => c.id === loan.customerId);
  const due = loan && new Date(loan.dueAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return {
    kind: 'book', id: book.id, app: 'library', emoji: book.emoji || '📕', photo: book.photo || null, label: book.title,
    detail: loan ? `Library book · out with ${who ? who.name : 'someone'}, due ${due}` : 'Library book · on the shelf',
    href: '#/library', go: 'the Library', book: { id: book.id, out: !!loan, customerId: loan?.customerId || null, loanId: loan?.id || null },
  };
}

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
    if (letter === 'U') {
      const c = (db.coupons || []).find((x) => x.id === id);
      if (c) {
        const store = db.stores.find((s) => s.id === c.storeId);
        const item = db.stores.flatMap((s) => s.items).find((i) => i.id === c.itemId);
        const label = c.kind === 'percent' ? `${c.value}% off` : c.kind === 'item' ? `Free ${item ? item.name : 'item'}` : `${money(c.value)} off`;
        return { ...base, kind: 'coupon', id, app: 'store', emoji: '🎟️', label: `Coupon: ${label}`, detail: `${store ? `At ${store.emoji} ${store.name}` : 'At any store'} · ${c.usedAt ? 'already used ❌' : 'not used yet ✅'}`,
          href: store ? `#/cashier/${store.id}` : '#/store', go: store ? store.name : 'the Store', coupon: { id, storeId: c.storeId, used: !!c.usedAt } };
      }
    }
    if (letter === 'H') {
      const ch = (db.checks || []).find((x) => x.id === id);
      if (ch) {
        const from = (db.accounts || []).find((a) => a.id === ch.fromAccountId);
        const to = db.customers.find((c) => c.id === ch.toCustomerId);
        return { ...base, kind: 'check', id, app: 'bank', emoji: '🧾', label: `A check for ${money(ch.amount)}`, detail: `From ${from ? from.owner.name : 'someone'} to ${to ? to.name : 'someone'} · ${ch.cashedAt ? 'already cashed' : ch.voidAt ? 'torn up' : 'not cashed yet'}`,
          href: '#/bank', go: 'the Bank', check: { id, amount: ch.amount, cashed: !!ch.cashedAt } };
      }
    }
    if (letter === 'T') {
      const t = (db.boxOffice?.tickets || []).find((x) => x.id === id);
      if (t) {
        const show = (db.boxOffice.shows || []).find((s) => s.id === t.showId);
        const who = db.customers.find((c) => c.id === t.customerId);
        return { ...base, kind: 'showticket', id, app: 'tickets', emoji: show ? show.emoji : '🎟️', label: `Ticket: ${show ? show.name : 'a show'}`,
          detail: `Seat ${t.seat}${who ? ` · ${who.name}` : ''} · ${t.usedAt ? 'already used' : 'not used yet'}`, href: show ? `#/tickets/door/${show.id}` : '#/tickets', go: 'the door',
          ticket: { id, showId: t.showId, seat: t.seat, used: !!t.usedAt } };
      }
    }
    if (letter === 'M') {
      const parcel = (db.post?.parcels || []).find((x) => x.id === id);
      if (parcel) {
        const to = (db.post.places || []).find((x) => x.id === parcel.toPlaceId);
        const say = { accepted: 'accepted at the counter', sorting: 'being sorted', out: 'out for delivery', delivered: 'delivered ✅' }[parcel.status];
        return { ...base, kind: 'parcel', id, app: 'post', emoji: parcel.size === 'letter' ? '✉️' : '📦', label: `A parcel for ${parcel.toName || (to ? to.name : 'someone')}`,
          detail: `From ${parcel.fromName} to ${to ? `${to.emoji} ${to.name}` : 'somewhere'} · ${say}`, href: `#/post/track/${id}`, go: 'tracking',
          parcel: { id, status: parcel.status, toPlaceId: parcel.toPlaceId } };
      }
    }
    if (letter === 'L') {
      const pl = (db.post?.places || []).find((x) => x.id === id);
      if (pl) return { ...base, kind: 'place', id, app: 'post', emoji: pl.emoji, label: `${pl.name} door sign`, detail: `Post Office zone ${pl.zone}. Mail carriers scan it to deliver.`, href: '#/post/carrier', go: 'the mail bag', place: { id, name: pl.name, emoji: pl.emoji, zone: pl.zone } };
    }
    if (letter === 'B') {
      const book = (db.library?.books || []).find((x) => x.id === id);
      if (book) return { ...base, ...bookInfo(db, book) };
    }
    if (letter === 'G' && GO[id]) {
      // "Open an app" codes made in QR Studio: KH-G-SPY opens Spy HQ.
      return { ...base, kind: 'go', id, emoji: GO[id][1], label: `Open ${GO[id][2]}`, detail: 'A shortcut code from QR Studio', href: GO[id][0], go: GO[id][2] };
    }
    const spy = db.spy || { agents: [], missions: [] };
    if (letter === 'A') {
      const a = spy.agents.find((x) => x.id === id);
      if (a) return { ...base, kind: 'agent', id, app: 'spy', emoji: a.emoji || '🕵️', photo: a.photo || null, label: `Agent ${a.codename}`, detail: `Spy HQ badge · agent number ${a.number}`, href: '#/spy', go: 'Spy HQ' };
    }
    if (letter === 'X') {
      for (const m of spy.missions) {
        const i = m.clues.findIndex((c) => c.id === id);
        if (i >= 0) return { ...base, kind: 'clue', id, app: 'spy', emoji: '🗝️', label: 'A secret clue card!', detail: `Part of the mission "${m.name}". Open Spy HQ to read it.`, href: `#/spy/missions/${m.id}`, go: 'Spy HQ', clue: { missionId: m.id, clueId: id } };
      }
    }
    return { ...base, kind: 'gone', emoji: '👻', label: 'A Kids Hub code', detail: 'Whatever it belonged to is gone now.' };
  }
  // Secret messages printed in Spy HQ's Cipher Lab: SPY:<CIPHER>:<message>
  const secret = /^SPY:([A-Z]+):(.+)$/i.exec(code);
  if (secret) return { code, ours: true, kind: 'secret', app: 'spy', emoji: '✉️', label: 'A secret message!', detail: 'Decode it in Spy HQ\'s Cipher Lab.', href: '#/spy/cipher', go: 'Cipher Lab', secret: { cipher: secret[1].toLowerCase(), text: secret[2] } };
  if (/^KH-TEST/i.test(code)) return { code, ours: true, kind: 'test', emoji: '🎉', label: 'The printer test code', detail: 'The scanner works!' };

  if (/^\d{8}$|^\d{12,13}$/.test(code)) {
    const p = productInfo(code);
    // A store item someone linked to this barcode (Setup → item → barcodes).
    for (const s of db.stores) {
      const item = s.items.find((i) => Array.isArray(i.barcodes) && i.barcodes.includes(code));
      if (item) return { code, kind: 'item', id: item.id, app: 'store', product: p, emoji: item.emoji, photo: item.photo || null, icon: item.icon || null, label: item.name, detail: `${money(item.price)} at ${s.emoji} ${s.name}`, href: `#/cashier/${s.id}`, go: s.name, item: { id: item.id, storeId: s.id, price: item.price } };
    }
    const book = (db.library?.books || []).find((x) => x.isbn === code);
    if (book) return { code, product: p, ...bookInfo(db, book) };
    return { code, kind: 'product', product: p, emoji: p.format === 'ISBN' ? '📚' : '📦',
      label: p.format === 'ISBN' ? 'A book barcode' : 'A product barcode',
      detail: `${p.format}${p.valid ? ' · the check digit is right ✅' : ' · the check digit looks wrong 🤔'}` };
  }
  return { code, kind: 'text', emoji: '💬', label: 'Some writing', detail: code.length > 120 ? `${code.slice(0, 120)}…` : code };
}

module.exports = { lookup, productInfo, GO };
