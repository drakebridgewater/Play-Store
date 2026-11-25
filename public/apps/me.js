// 📱 My stuff: someone's own page on their phone (guests, grandparents, grown-ups). Their bank money
// and cards, member card, receipts, tickets, library books, checks, and slips sent to them instead
// of printed. Every code can be held up for the kid to scan off the phone, or 📲 sent straight to
// the kid's tablet (Setup → 📱 Phones), where it acts exactly like a scan.
import { S, api, bar, dataHooks, esc, face, lsGet, lsSet, money, openModal, render, route, setAccent, sfx, toast, when } from '../lib/core.js';
import { qrSvg } from '../lib/qr.js';
import { previewHtml } from '../lib/print.js';
import { bankById, debitCard } from './bank.js';
import { personModal } from './people.js';
import { receiptSlip } from './store/receipt.js';
import { storeById } from './store/common.js';
import { ticketSlip } from './tickets/index.js';
import { checkSlip } from './checks.js';
import { lib, bookById, bookCover, isLate, owedBy } from './library/modals.js';
import { dueText } from './library/slips.js';

export const me = () => S.customers.find((c) => c.id === lsGet('me')) || null;
export const joinUrl = () => `${location.origin}/#/me`;

// ------------------------------------------------------------------ this person's things
// Receipts and slips come from the server (the tablets only keep today's open orders).
const mine = { for: null, orders: [], inbox: [], sig: '' };
let whoami;      // what the login proxy says (Authelia), to suggest a name
let helloFor = null;

function seenSet() { try { return new Set(JSON.parse(lsGet('meSeen') || '[]')); } catch { return new Set(); } }
function saveSeen(set) { lsSet('meSeen', JSON.stringify([...set].slice(-400))); }

async function loadMine() {
  const p = me();
  if (!p) return;
  let r;
  try { r = await api('GET', `/api/me/${p.id}`); } catch { return; }
  if (me()?.id !== p.id) return;
  // Tell them when something new lands while the page is open: a receipt, a slip, or an order that's ready.
  const first = mine.for !== p.id;
  const seen = seenSet();
  const news = [];
  for (const o of r.orders) {
    if (!seen.has(o.id)) { seen.add(o.id); news.push(`🧾 New receipt from ${storeById(o.storeId)?.name || 'the store'}`); }
    if (o.status === 'ready' && !seen.has(`${o.id}:ready`)) { seen.add(`${o.id}:ready`); news.push(`✅ Order #${o.number} is ready! Go get it 🏃`); }
  }
  for (const x of r.inbox) if (!seen.has(x.id)) { seen.add(x.id); news.push(`📬 ${x.slip.title}${x.from ? ` from ${x.from}` : ''}`); }
  saveSeen(seen);
  if (!first && news.length) { sfx.newOrder(); navigator.vibrate?.(200); toast(news.at(-1)); }
  const sig = JSON.stringify([r.orders.map((o) => [o.id, o.status, o.paid, o.updatedAt]), r.inbox.map((x) => x.id)]);
  Object.assign(mine, { for: p.id, orders: r.orders, inbox: r.inbox });
  if (sig !== mine.sig || first) { mine.sig = sig; if (route().view === 'me') render(); }
}
dataHooks.push(() => { if (route().view === 'me' && me()) loadMine(); });

async function sendCode(code, what = 'it') {
  if (!code) return;
  const r = await api('POST', '/api/send', { code, from: me()?.name || 'Someone' });
  if (r.screens) { sfx.pop(); toast(`📲 Sent ${what} to the tablet!`); }
  else toast('No tablet is listening 😕 A grown-up can turn it on in ⚙️ Setup → 📱 Phones');
}
const sendBtn = (code, what) => `<button class="btn icon me-send" data-act="me-send" data-code="${esc(code)}" data-what="${esc(what)}" aria-label="Send to the tablet">📲</button>`;
const firstCode = (slip) => slip?.parts?.find((x) => x.t === 'qr')?.data || slip?.parts?.find((x) => x.t === 'barcode')?.data || null;
const seatText = (seat) => { const [, row, n] = /^([A-Z])(\d+)$/.exec(seat || '') || []; return row ? `Row ${row}, seat ${n}` : esc(seat || ''); };

// ------------------------------------------------------------------ screens
function viewWho() {
  setAccent('#0ea5e9');
  if (whoami === undefined) {
    whoami = null;
    api('GET', '/api/whoami').then((r) => { whoami = r; if (route().view === 'me' && !me()) render(); }).catch(() => {});
  }
  const names = [whoami?.name, whoami?.user].filter(Boolean).map((n) => n.toLowerCase());
  const guess = names.length ? S.customers.find((c) => names.some((n) => n === c.name.toLowerCase() || n.split(/\s+/)[0] === c.name.toLowerCase())) : null;
  return bar('📱 Who are you?') + `<div class="setup me-who">
    <p class="center muted">Tap your name. This phone will remember you and keep your bank card, receipts and tickets here.</p>
    ${guess ? `<button class="btn huge primary" data-act="me-pick" data-id="${guess.id}">${face(guess)} I'm ${esc(guess.name)}</button>` : ''}
    <div class="people-grid">
      ${S.customers.map((c) => `<button class="person" data-act="me-pick" data-id="${c.id}"><span class="pic">${face(c)}</span><span>${esc(c.name)}</span></button>`).join('')}
      <button class="person add" data-act="me-new"><span class="pic">➕</span><span>I'm new here</span></button>
    </div>
  </div>`;
}

function viewMe() {
  const p = me();
  if (!p) return viewWho();
  setAccent('#0ea5e9');
  if (mine.for !== p.id) loadMine();
  if (helloFor !== p.id) { helloFor = p.id; api('POST', `/api/me/${p.id}/hello`).catch(() => {}); }
  const accts = S.accounts.filter((a) => a.customerId === p.id);
  const total = accts.reduce((t, a) => t + a.balance, 0);
  return bar(`📱 ${esc(p.name)}`, '<button class="btn" data-act="me-switch">🔄 <span>Not me</span></button>') + `<div class="setup me">
    <section class="me-hero"><span class="pic">${face(p)}</span>
      <div class="grow"><h2>${esc(p.name)}</h2><div>${accts.length ? 'Money in the bank' : 'No bank account yet'}</div></div>
      ${accts.length ? `<strong class="me-total">${money(total)}</strong>` : ''}</section>
    ${moneySection(accts)}
    ${memberSection(p)}
    ${receiptsSection()}
    ${ticketsSection(p)}
    ${booksSection(p)}
    ${checksSection(p)}
    ${inboxSection()}
    <p class="muted small center">Hold a code up to the scanner 🔫, or tap 📲 to send it to the kid's tablet.</p>
  </div>`;
}

function moneySection(accts) {
  if (!accts.length) return '<section class="panel"><h3>💳 My money</h3><p class="muted">Ask the banker to open an account for you at the 🏦 Bank!</p></section>';
  return `<section class="panel"><h3>💳 My money</h3>${accts.map((a) => {
    const b = bankById(a.bankId);
    return `<div class="me-acct">
      <div class="row split"><b>${esc(b?.emoji || '🏦')} ${esc(b?.name || 'Bank')}</b><span class="me-bal">${money(a.balance)}</span></div>
      ${a.cards.length ? `<div class="me-cards">${a.cards.map((c) => `<div class="me-card">
          <button class="me-card-pic" data-act="me-card" data-id="${c.id}">${debitCard(a, c, { small: true })}</button>
          <div class="row center-row"><button class="btn primary" data-act="me-card" data-id="${c.id}">🔳 Pay with it</button>${sendBtn(`KH-C-${c.id.toUpperCase()}`, 'your card')}</div>
        </div>`).join('')}</div>` : '<p class="muted small">No card yet. The bank can make you one 💳</p>'}
      <button class="btn ghost" data-act="me-history" data-id="${a.id}">📜 What I spent</button>
    </div>`;
  }).join('')}</section>`;
}

const memberSection = (p) => `<section class="panel"><h3>🪪 Member card</h3>
  <div class="list-row"><span class="grow">Scan it at the store, library or box office so they know it's you.</span>
    <button class="btn" data-act="me-member">🔳 Show</button>${sendBtn(`KH-P-${p.id.toUpperCase()}`, 'your member card')}</div></section>`;

function receiptsSection() {
  const list = mine.orders;
  const status = (o) => (o.status === 'ready' ? '<span class="chip me-ready">✅ Ready!</span>' : o.status === 'making' ? '<span class="chip">👨‍🍳 Making</span>' : o.status === 'new' ? '<span class="chip">📨 Ordered</span>' : '');
  return `<section class="panel"><h3>🧾 Receipts</h3>${list.length ? `<div class="list">${list.map((o) => {
    const s = storeById(o.storeId);
    return `<div class="list-row"><button class="me-open" data-act="me-receipt" data-id="${o.id}"><span class="e">${esc(s?.emoji || '🏪')}</span>
      <span class="grow">${esc(s?.name || 'Store')} · #${o.number}<small>${when(o.createdAt)}${o.paid ? '' : ' · not paid yet'}${o.customer && o.customerId !== me()?.id ? ` · for ${esc(o.customer)}` : ''}</small></span>
      ${status(o)}<b>${money(o.total)}</b></button>${sendBtn(`KH-R-${o.id.toUpperCase()}`, 'the receipt')}</div>`;
  }).join('')}</div>` : mine.for ? '<p class="muted">Nothing yet. Go buy something! 🛍️</p>' : '<p class="muted">Loading…</p>'}</section>`;
}

function myTickets(p) {
  const shows = S.boxOffice?.shows || [];
  return (S.boxOffice?.tickets || []).filter((t) => t.customerId === p.id).map((t) => ({ t, s: shows.find((x) => x.id === t.showId) })).filter((x) => x.s)
    .sort((a, b) => (a.t.usedAt ? 1 : 0) - (b.t.usedAt ? 1 : 0) || String(a.s.at).localeCompare(String(b.s.at)));
}
function ticketsSection(p) {
  const list = myTickets(p);
  if (!list.length) return '';
  return `<section class="panel"><h3>🎟️ Tickets</h3><div class="list">${list.map(({ t, s }) => `<div class="list-row ${t.usedAt ? 'me-used' : ''}">
    <button class="me-open" data-act="me-ticket" data-id="${t.id}"><span class="e">${esc(s.emoji || '🎭')}</span>
      <span class="grow">${esc(s.name)}<small>${esc(when(s.at))} · ${seatText(t.seat)}</small></span>${t.usedAt ? '<span class="chip">✅ Used</span>' : ''}</button>
    ${t.usedAt ? '' : sendBtn(`KH-T-${t.id.toUpperCase()}`, 'your ticket')}</div>`).join('')}</div></section>`;
}

function booksSection(p) {
  const out = lib().loans.filter((l) => l.customerId === p.id && !l.inAt);
  const owed = owedBy(p.id);
  if (!out.length && !owed.length) return '';
  const fine = owed.reduce((t, l) => t + l.fine, 0);
  return `<section class="panel"><h3>📚 Library books</h3><div class="list">${out.map((l) => {
    const b = bookById(l.bookId);
    return `<div class="list-row"><span class="e book-cover">${b ? bookCover(b) : '📕'}</span>
      <span class="grow">${esc(b?.title || 'A book')}<small class="${isLate(l) ? 'bad-text' : ''}">${isLate(l) ? `⏰ Late! It was due ${esc(dueText(l.dueAt))}` : `Bring it back by ${esc(dueText(l.dueAt, true))}`}</small></span></div>`;
  }).join('')}</div>${fine ? `<p class="bad-text">💰 You owe ${money(fine)} in late fines. Pay at the 📚 Library desk.</p>` : ''}</section>`;
}

function checksSection(p) {
  const list = (S.checks || []).filter((c) => c.toCustomerId === p.id && !c.cashedAt && !c.voidAt);
  if (!list.length) return '';
  return `<section class="panel"><h3>🧾 Checks for me</h3><div class="list">${list.map((c) => `<div class="list-row">
    <button class="me-open" data-act="me-check" data-id="${c.id}"><span class="e">🧾</span><span class="grow">${money(c.amount)} from ${esc(c.fromName)}<small>No. ${c.number}${c.memo ? ` · ${esc(c.memo)}` : ''} · cash it at the 🏦 Bank</small></span></button>
    ${sendBtn(`KH-H-${c.id.toUpperCase()}`, 'the check')}</div>`).join('')}</div></section>`;
}

function inboxSection() {
  if (!mine.inbox.length) return '';
  return `<section class="panel"><h3>📬 Sent to me</h3><div class="list">${mine.inbox.map((x) => {
    const code = firstCode(x.slip);
    return `<div class="list-row"><button class="me-open" data-act="me-slip" data-id="${x.id}"><span class="e">📄</span>
      <span class="grow">${esc(x.slip.title)}<small>${when(x.at)}${x.from ? ` · from ${esc(x.from)}` : ''}</small></span></button>
      ${code ? sendBtn(code, 'it') : ''}<button class="btn icon" data-act="me-slip-del" data-id="${x.id}" aria-label="Throw away">🗑️</button></div>`;
  }).join('')}</div></section>`;
}

// ------------------------------------------------------------------ windows
// A code big enough to scan off the phone, with the paper version under it when there is one.
function codeModal({ title, code = null, top = '', slip = null, what = 'it' }) {
  openModal({
    render() {
      return `<div class="sheet me-code">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${title}</h2>${top}
        ${code ? `<div class="me-qr">${qrSvg(code, { quiet: 4 })}</div>
          <p class="muted small center">Hold it up to the scanner 🔫 If it won't beep, turn your screen brightness up.</p>` : ''}
        ${slip ? `<div class="paper-wrap" data-scroll="paper">${previewHtml(slip)}</div>` : ''}
        ${code ? '<button class="btn huge primary" data-act="send">📲 Send to the tablet</button>' : ''}
      </div>`;
    },
    async act(a) { if (a === 'send') await sendCode(code, what); },
  });
}

async function historyModal(account) {
  const { transactions } = await api('GET', `/api/accounts/${account.id}/transactions`);
  openModal({
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>📜 ${esc(bankById(account.bankId)?.name || 'Bank')}</h2>
        <ul class="txns">${transactions.length ? transactions.map((t) => `<li>
          <span class="memo">${esc(t.memo)}<small>${when(t.at)}</small></span>
          <span class="amt ${t.amount < 0 ? 'neg' : 'pos'}">${t.amount < 0 ? '−' : '+'}${money(Math.abs(t.amount))}<small>${money(t.balance)}</small></span></li>`).join('') : '<li class="muted">Nothing yet</li>'}</ul>
      </div>`;
    },
  });
}

// "Put it on your phone": a QR code a guest scans with their phone's camera.
export function joinModal() {
  openModal({
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>📱 Put it on your phone</h2>
        <p class="center">Point your phone's camera at this. Your bank card, receipts and tickets will be on your phone, ready to scan.</p>
        <div class="me-qr">${qrSvg(joinUrl(), { quiet: 4 })}</div>
        <p class="center muted small"><code>${esc(joinUrl())}</code></p>
      </div>`;
    },
  });
}

// ------------------------------------------------------------------ the app
function myCard(id) {
  for (const a of S.accounts.filter((x) => x.customerId === me()?.id)) {
    const c = a.cards.find((k) => k.id === id);
    if (c) return { a, c };
  }
  return null;
}

export const meApp = {
  views: { me: viewMe },
  actions: {
    'me-pick'(el) { lsSet('me', el.dataset.id); mine.for = null; sfx.pop(); render(); },
    'me-new'() { personModal(null, { onSaved: (c) => { lsSet('me', c.id); mine.for = null; render(); } }); },
    'me-switch'() { lsSet('me', ''); mine.for = null; render(); },
    'me-send'(el) { return sendCode(el.dataset.code, el.dataset.what); },
    'me-card'(el) {
      const x = myCard(el.dataset.id);
      if (!x) return;
      codeModal({ title: '💳 Pay with this card', code: `KH-C-${x.c.id.toUpperCase()}`, what: 'your card',
        top: `<div class="card-slot">${debitCard(x.a, x.c)}</div>
          <p class="center">${x.c.frozen ? '❄️ This card is frozen. Unfreeze it at the bank first.' : x.c.hasPin ? 'You type your secret PIN on the tablet 🔒' : `${money(x.a.balance)} to spend`}</p>` });
    },
    'me-member'() {
      const p = me();
      if (p) codeModal({ title: '🪪 Member card', code: `KH-P-${p.id.toUpperCase()}`, what: 'your member card', top: `<div class="preview"><div class="person big"><span class="pic">${face(p)}</span><span>${esc(p.name)}</span></div></div>` });
    },
    'me-receipt'(el) {
      const o = mine.orders.find((x) => x.id === el.dataset.id);
      if (o) codeModal({ title: `🧾 Receipt #${o.number}`, code: `KH-R-${o.id.toUpperCase()}`, slip: receiptSlip(o), what: 'the receipt' });
    },
    'me-ticket'(el) {
      const x = myTickets(me() || {}).find(({ t }) => t.id === el.dataset.id);
      if (x) codeModal({ title: `🎟️ ${esc(x.s.name)}`, code: x.t.usedAt ? null : `KH-T-${x.t.id.toUpperCase()}`, slip: ticketSlip(x.s, x.t), what: 'your ticket' });
    },
    async 'me-check'(el) {
      const c = (S.checks || []).find((x) => x.id === el.dataset.id);
      if (c) codeModal({ title: `🧾 Check No. ${c.number}`, code: `KH-H-${c.id.toUpperCase()}`, slip: await checkSlip(c), what: 'the check' });
    },
    'me-slip'(el) {
      const x = mine.inbox.find((i) => i.id === el.dataset.id);
      if (x) codeModal({ title: esc(x.slip.title), code: firstCode(x.slip), slip: x.slip });
    },
    async 'me-slip-del'(el) {
      await api('DELETE', `/api/inbox/${el.dataset.id}`);
      mine.inbox = mine.inbox.filter((x) => x.id !== el.dataset.id);
      render();
    },
    'me-history'(el) { const a = S.accounts.find((x) => x.id === el.dataset.id); if (a) return historyModal(a); },
    'me-join'() { joinModal(); },
  },
};
