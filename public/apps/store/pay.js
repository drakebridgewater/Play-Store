// Paying for an order: cash with change, debit card with PIN, or later.
import { S, api, closeModal, drawModal, esc, face, money, openModal, refresh, render, sfx, sumOf, toast, ui } from '../../lib/core.js';
import { breakdown, cashTray, moneyChip, pinAct, pinPad, trayAct } from '../../lib/cash.js';
import { allCards, debitCard } from '../bank.js';
import { storeById } from './common.js';
import { receiptSlip, autoReceipt } from './receipt.js';
import { printModal } from '../../lib/print.js';

// "The receipt is on Grandma's phone": whoever the order is for, or whoever paid with their card,
// if they've opened 📱 My stuff on a phone in the last couple of weeks.
function phoneNote(order) {
  const recent = (c) => c?.phoneAt && Date.now() - Date.parse(c.phoneAt) < 14 * 86400000;
  const payer = S.accounts.find((a) => a.id === order.paidWith?.accountId);
  const people = [S.customers.find((c) => c.id === order.customerId), S.customers.find((c) => c.id === payer?.customerId)].filter(recent);
  const names = [...new Set(people.map((c) => c.name))];
  return names.length ? `<p class="center">📲 The receipt is on ${names.map(esc).join(' and ')}'s phone</p>` : '';
}

// checkout: a store without a kitchen. There's no "pay later"; Cancel throws the unpaid order away.
export function payModal(order, { fresh = false, checkout = false, cardId = null } = {}) {
  const s = storeById(order.storeId);
  const playMoney = s ? s.playMoney : true;
  const later = checkout ? '<button class="btn" data-act="void">✕ Cancel</button>'
    : `<button class="btn" data-act="later">${fresh ? '💸 Pay later' : 'Not now'}</button>`;
  const m = {
    sticky: true, step: 'pay', method: 'cash', given: [], change: 0, printed: false,
    // A debit card put in the card machine (tapped, or scanned): ask its PIN, or charge it.
    async useCard(id) {
      m.card = allCards().find((x) => x.card.id === id);
      if (!m.card) { toast('That card is gone'); return; }
      m.pin = ''; m.error = null; m.method = 'card';
      sfx.pop();
      if (m.card.card.hasPin) { m.step = 'card-pin'; drawModal(); } else await m.charge();
    },
    // Scanning a debit card while paying uses it.
    onScan(info) {
      if (info.kind !== 'card' || !['pay', 'declined', 'card-pin'].includes(m.step)) return false;
      m.useCard(info.card.id);
      return true;
    },
    card: null, pin: '', receipt: null, error: null,
    get gave() { return sumOf(m.given); },
    // Every card, with the customer's own cards first.
    cards() {
      const mine = (x) => (x.account.owner.name.toLowerCase() === order.customer.toLowerCase() ? 1 : 0);
      return allCards().sort((x, y) => mine(y) - mine(x));
    },
    render() {
      const who = `<span class="face">${face({ photo: order.customerPhoto, emoji: order.customerEmoji })}</span> ${esc(order.customer)}`;
      if (m.step === 'done' && order.paidWith?.method === 'card') {
        const r = m.receipt || {};
        return `<div class="sheet">
          <div class="celebrate">✅</div>
          <h2>Approved! ${checkout ? 'Sold! 🛍️' : `Order #${order.number} is paid`}</h2>
          <div class="change-box"><div class="card-slot">${debitCard(m.card.account, m.card.card, { small: true })}</div>
            <div>Paid <b>${money(order.total)}</b> with the card ending in <b>${esc(order.paidWith.last4)}</b></div>
            ${r.balanceLeft != null ? `<div>${esc(r.owner)} has <b>${money(r.balanceLeft)}</b> left in the bank 🏦</div>` : ''}</div>
          ${m.printed ? '<p class="center muted">🖨️ Printing the receipt…</p>' : ''}${phoneNote(order)}
          <div class="row split"><button class="btn" data-act="receipt">🧾 Receipt</button>
            <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="close">👍 Done</button></div>
        </div>`;
      }
      if (m.step === 'done') {
        const parts = breakdown(m.change);
        return `<div class="sheet">
          <div class="celebrate">🎉</div>
          <h2>${checkout ? 'Sold! Hand over the stuff 🛍️' : `Order #${order.number} is paid!`}</h2>
          ${m.change > 0 ? `<div class="change-box"><div>Give back</div><strong>${money(m.change)}</strong>
              <div class="change-list">${parts.map((p) => `<span class="each">${moneyChip(p.d)} × ${p.n}</span>`).join('')}</div></div>`
            : '<div class="change-box"><strong>No change!</strong><div>They gave the exact amount 👌</div></div>'}
          ${m.printed ? '<p class="center muted">🖨️ Printing the receipt…</p>' : ''}${phoneNote(order)}
          <div class="row split"><button class="btn" data-act="receipt">🧾 Receipt</button>
            <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="close">👍 Done</button></div>
        </div>`;
      }
      if (m.step === 'later') {
        return `<div class="sheet"><div class="celebrate">📨</div>
          <h2>Order #${order.number} went to the kitchen!</h2>
          <p class="pay-total">They'll pay later 💸</p>
          ${m.printed ? '<p class="center muted">🖨️ Printing the receipt…</p>' : ''}${phoneNote(order)}
          <div class="row split"><button class="btn" data-act="receipt">🧾 Receipt</button>
            <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="close">👍 Done</button></div></div>`;
      }
      if (m.step === 'processing') {
        return `<div class="sheet"><div class="card-slot inserting">${debitCard(m.card.account, m.card.card, { small: true })}</div>
          <h2>📶 Talking to the bank…</h2><div class="thinking"><i></i><i></i><i></i></div></div>`;
      }
      if (m.step === 'declined') {
        const e = m.error?.data || {};
        const reason = e.code === 'funds' ? `${esc(m.card.account.owner.name)} only has ${money(e.balance)} in the bank, and this costs ${money(order.total)}.`
          : e.code === 'pin' ? 'That PIN is not right 🔒'
            : e.code === 'frozen' ? 'This card is frozen ❄️ Unfreeze it at the bank.'
              : esc(m.error?.message || 'Something went wrong');
        return `<div class="sheet"><div class="celebrate">❌</div><h2>Declined</h2>
          <div class="card-slot">${debitCard(m.card.account, m.card.card, { small: true })}</div>
          <p class="pay-total">${reason}</p>
          <div class="row split">${later}<span class="row">
            ${playMoney ? '<button class="btn" data-act="use-cash">💵 Pay with cash</button>' : ''}
            <button class="btn primary" data-act="retry">🔁 Try again</button></span></div></div>`;
      }
      if (m.step === 'card-pin') {
        return `<div class="sheet"><h2>🔒 Type the card's PIN</h2>
          <div class="card-slot">${debitCard(m.card.account, m.card.card, { small: true })}</div>
          ${pinPad(m.pin)}
          <div class="row split"><button class="btn" data-act="retry">← Other card</button>
            <button class="btn huge good" style="width:auto;flex:1;max-width:300px" data-act="pin-ok" ${m.pin.length === 4 ? '' : 'disabled'}>✅ OK</button></div></div>`;
      }
      const cards = m.cards();
      const tabs = cards.length ? `<div class="pay-tabs">
          <button class="${m.method === 'cash' ? 'on' : ''}" data-act="method" data-m="cash">💵 Cash</button>
          <button class="${m.method === 'card' ? 'on' : ''}" data-act="method" data-m="card">💳 Card</button></div>` : '';
      const gave = m.gave;
      const enough = gave >= order.total;
      let body;
      if (m.method === 'card') {
        body = `<div class="muted center">Which card are they paying with? Tap it to put it in the card machine.</div>
          <div class="card-picks" data-scroll="cards">${cards.map((x) => `<button class="card-pick" data-act="card" data-id="${x.card.id}">${debitCard(x.account, x.card, { small: true })}</button>`).join('')}</div>
          <div class="row split">${later}</div>`;
      } else {
        body = `${playMoney ? `
          <div class="muted center">Tap the money they give you:</div>
          ${cashTray(m.given)}
          <div class="row split"><span class="pay-total" style="font-size:22px">They gave: <b>${money(gave)}</b></span>
            <button class="btn" data-act="exact">👌 Exact amount</button></div>
          ${enough && gave > order.total ? `<div class="change-box"><div>Change to give back: <b>${money(gave - order.total)}</b></div></div>` : ''}
          ${!enough && gave ? `<div class="muted center">Still need ${money(order.total - gave)} more</div>` : ''}
        ` : ''}
        <div class="row split">${later}
          <button class="btn huge good" style="width:auto;flex:1" data-act="paid" ${playMoney && !enough ? 'disabled' : ''}>💰 Paid!</button>
        </div>`;
      }
      return `<div class="sheet">
        ${checkout ? '<h2>🧾 Checkout</h2>' : fresh ? `<h2>🚀 Order #${order.number} sent to the kitchen!</h2>` : `<button class="btn icon close" data-act="close" aria-label="Close">✕</button><h2>Pay for order #${order.number}</h2>`}
        <div class="pay-total">${who} pays<strong>${money(order.total)}</strong></div>
        ${tabs}${body}
      </div>`;
    },
    async charge() {
      m.step = 'processing'; drawModal();
      const wait = new Promise((r) => setTimeout(r, 1200));
      try {
        const [updated] = await Promise.all([api('PATCH', `/api/orders/${order.id}`, { pay: { cardId: m.card.card.id, pin: m.pin || undefined } }), wait]);
        m.receipt = updated.receipt;
        delete updated.receipt;
        Object.assign(order, updated);
        m.step = 'done';
        sfx.kaching();
        m.printed = autoReceipt(order, { receipt: m.receipt });
      } catch (e) {
        await wait;
        m.error = e; m.step = 'declined';
        sfx.buzz();
      }
      if (ui.modal === m) drawModal();
    },
    async act(a, el) {
      if (trayAct(m, a, el)) return;
      if (a === 'receipt') {
        printModal(receiptSlip(order, { receipt: m.receipt }), { back: () => openModal(m), onClose: () => m.onClose(), to: order.customerId });
        return;
      }
      if (pinAct(m, a, el)) { if (m.step === 'card-pin' && m.pin.length === 4) await m.charge(); return; }
      if (a === 'exact') { m.given = breakdown(order.total).flatMap((p) => Array(p.n).fill(p.d.v)); drawModal(); return; }
      if (a === 'method') { m.method = el.dataset.m; drawModal(); return; }
      if (a === 'card') { await m.useCard(el.dataset.id); return; }
      if (a === 'pin-ok') { await m.charge(); return; }
      if (a === 'retry') {
        const wrongPin = m.error?.data?.code === 'pin' && m.step === 'declined';
        m.error = null; m.pin = '';
        m.step = wrongPin ? 'card-pin' : 'pay'; m.method = 'card';
        drawModal(); return;
      }
      if (a === 'use-cash') { m.error = null; m.step = 'pay'; m.method = 'cash'; drawModal(); return; }
      if (a === 'later') { if (fresh) { m.step = 'later'; drawModal(); } else closeModal(); return; }
      if (a === 'void') {
        await api('DELETE', `/api/orders/${order.id}`);
        S.orders = S.orders.filter((x) => x.id !== order.id);
        closeModal(); return;
      }
      if (a === 'paid') {
        const updated = await api('PATCH', `/api/orders/${order.id}`, { pay: { tendered: playMoney ? m.gave : order.total } });
        Object.assign(order, updated);
        m.change = updated.change || 0;
        m.step = 'done';
        sfx.kaching();
        m.printed = autoReceipt(order, { receipt: m.receipt });
        drawModal();
      }
    },
    onClose() {
      // A cancelled checkout keeps the cart so they can try again.
      if (fresh && (!checkout || order.paid)) { ui.cart.lines = {}; ui.cart.coupon = null; ui.customer = null; ui.askedCustomer = false; }
      refresh();
      render();
    },
  };
  openModal(m);
  if (cardId) m.useCard(cardId);
}
