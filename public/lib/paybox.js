// A pay window for any amount (library fines, postage…): play cash with change worked out, or a
// debit card (tapped or scanned) with its PIN. `onPay(body)` does the paying on the server, with
// body = { method: 'cash', tendered } or { method: 'card', cardId, pin }, and returns
// { change?, receipt?: { owner, balanceLeft } }. It throws to decline.
import { esc, money, openModal, drawModal, sfx, sumOf } from './core.js';
import { cashTray, trayAct, pinPad, pinAct, breakdown, moneyChip } from './cash.js';
import { allCards, debitCard } from '../apps/bank.js';

export function payBox({ title, lines = [], total, customerId = null, onPay, onDone = null, doneText = 'Paid. Thank you!', playMoney = true }) {
  const m = {
    method: playMoney ? 'cash' : 'card', given: [], pin: '', card: null, step: 'pay', change: 0, receipt: null, error: null, busy: false,
    get gave() { return sumOf(m.given); },
    cards() { const mine = (x) => (x.account.customerId === customerId ? 1 : 0); return allCards().sort((x, y) => mine(y) - mine(x)); },
    async pay(body) {
      if (m.busy) return;
      m.busy = true; m.error = null; drawModal();
      try {
        const r = (await onPay(body)) || {};
        m.change = r.change || 0; m.receipt = r.receipt || null; m.step = 'done'; sfx.kaching();
      } catch (e) { m.error = e.message; m.step = 'pay'; sfx.buzz(); }
      m.busy = false; drawModal();
    },
    async useCard(id) {
      m.card = allCards().find((x) => x.card.id === id); if (!m.card) return;
      m.pin = ''; m.error = null; m.method = 'card';
      if (m.card.card.hasPin) { m.step = 'pin'; drawModal(); } else await m.pay({ method: 'card', cardId: id });
    },
    // Scanning a paper debit card pays with it.
    onScan(info) { if (info.kind !== 'card' || m.step === 'done') return false; m.useCard(info.card.id); return true; },
    render() {
      const x = '<button class="btn icon close" data-act="close" aria-label="Close">✕</button>';
      if (m.step === 'done') {
        return `<div class="sheet center"><div class="celebrate">✅</div><h2>${esc(doneText)}</h2>
          ${m.receipt ? `<p>💳 ${esc(m.receipt.owner)} has <b>${money(m.receipt.balanceLeft)}</b> left in the bank 🏦</p>`
            : m.change ? `<div class="change-box"><div>Give back</div><strong>${money(m.change)}</strong><div class="change-list">${breakdown(m.change).map((p) => `<span class="each">${moneyChip(p.d)} × ${p.n}</span>`).join('')}</div></div>` : ''}
          <button class="btn huge primary" data-act="close">👍 Done</button></div>`;
      }
      const list = lines.length ? `<ul class="fine-list">${lines.map((l) => `<li><span>${esc(l.label)}</span><small>${esc(l.note || '')}</small><b>${money(l.amount)}</b></li>`).join('')}</ul>` : '';
      const head = `<h2>${title}</h2>${list}<div class="pay-total">Total<strong>${money(total)}</strong></div>`;
      if (m.step === 'pin') {
        return `<div class="sheet">${x}<h2>🔒 Type the card's PIN</h2><div class="card-slot">${debitCard(m.card.account, m.card.card, { small: true })}</div>${pinPad(m.pin)}
          <div class="row split"><button class="btn" data-act="back">← Other card</button><button class="btn huge good" style="width:auto" data-act="pin-ok" ${m.pin.length === 4 && !m.busy ? '' : 'disabled'}>✅ OK</button></div></div>`;
      }
      const tabs = playMoney ? `<div class="pay-tabs"><button class="${m.method === 'cash' ? 'on' : ''}" data-act="method" data-m="cash">💵 Cash</button><button class="${m.method === 'card' ? 'on' : ''}" data-act="method" data-m="card">💳 Card</button></div>` : '';
      const err = m.error ? `<p class="center bad-text">❌ ${esc(m.error)}</p>` : '';
      if (m.method === 'card') {
        return `<div class="sheet">${x}${head}${tabs}${err}<div class="muted center">Tap the card, or scan it:</div>
          <div class="card-picks" data-scroll="cards">${m.cards().map((c) => `<button class="card-pick" data-act="card" data-id="${c.card.id}">${debitCard(c.account, c.card, { small: true })}</button>`).join('') || '<p class="muted center">No debit cards yet. Make one at the 🏦 Bank.</p>'}</div></div>`;
      }
      return `<div class="sheet">${x}${head}${tabs}${err}<div class="muted center">Tap the money they give you:</div>${cashTray(m.given)}
        ${m.gave > total ? `<div class="change-box"><div>Change to give back: <b>${money(m.gave - total)}</b></div></div>` : ''}
        <div class="row split"><button class="btn" data-act="exact">👌 Exact amount</button>
          <button class="btn huge good" style="width:auto;flex:1;max-width:320px" data-act="paid" ${m.gave >= total && !m.busy ? '' : 'disabled'}>💰 Paid ${money(m.gave)}</button></div></div>`;
    },
    async act(a, el) {
      if (trayAct(m, a, el)) return;
      if (pinAct(m, a, el)) { if (m.step === 'pin' && m.pin.length === 4) await m.pay({ method: 'card', cardId: m.card.card.id, pin: m.pin }); return; }
      if (a === 'method') { m.method = el.dataset.m; m.error = null; drawModal(); return; }
      if (a === 'exact') { m.given = breakdown(total).flatMap((p) => Array(p.n).fill(p.d.v)); drawModal(); return; }
      if (a === 'paid') { await m.pay({ method: 'cash', tendered: m.gave }); return; }
      if (a === 'card') { await m.useCard(el.dataset.id); return; }
      if (a === 'back') { m.step = 'pay'; m.method = 'card'; drawModal(); return; }
      if (a === 'pin-ok') await m.pay({ method: 'card', cardId: m.card.card.id, pin: m.pin });
    },
    onClose() { if (m.step === 'done') onDone?.(); },
  };
  openModal(m);
  return m;
}
