// 🏦 Bank: banks, accounts, debit cards. No PIN.
import { S, api, askConfirm, bar, closeModal, drawModal, esc, face, loadAll, lsGet, lsSet, money, openModal, render, route, setAccent, sfx, sumOf, toast, ui, when } from '../lib/core.js';
import { breakdown, cashTray, moneyChip, pinAct, pinPad, trayAct } from '../lib/cash.js';
import { printModal, emojiImage } from '../lib/print.js';
import { checkWriter, cashCheckModal } from './checks.js';

// ------------------------------------------------------------------ bank helpers
export const bankById = (id) => S.banks.find((b) => b.id === id);
export const CARD_DESIGNS = {
  bank: null, ocean: ['#38bdf8', '#1e3a8a'], grape: ['#c084fc', '#4c1d95'], lava: ['#fb923c', '#b91c1c'],
  forest: ['#4ade80', '#14532d'], gold: ['#fcd34d', '#b45309'], candy: ['#f9a8d4', '#be185d'], night: ['#475569', '#020617'],
};
export const BANK_EMOJI = ['🏦', '🐷', '💰', '🪙', '💎', '🦖', '🦄', '🚀', '🌈', '⭐', '🐉', '🏰', '🐻', '🦁', '🍀', '👑'];
export function cardBg(design, bank) {
  const d = CARD_DESIGNS[design];
  const c = bank?.color || '#0f766e';
  const [c1, c2] = d || [c, `color-mix(in srgb, ${c} 45%, #000)`];
  return `--c1:${c1};--c2:${c2}`;
}
export const allCards = () => S.accounts.flatMap((account) => account.cards.map((card) => ({ account, card })));
// A drawn debit card. `full` shows the whole number (at the bank); elsewhere only the last 4.
export function debitCard(account, card, { full = false, small = false, bank = null } = {}) {
  const b = bank || bankById(account.bankId) || { name: 'Bank', emoji: '🏦', color: '#0f766e' };
  const n = card.number || '';
  const num = n ? (full ? n.match(/.{4}/g).join(' ') : `•••• ${n.slice(-4)}`) : '•••• •••• •••• ••••';
  return `<div class="dcard ${small ? 'small' : ''} ${card.frozen ? 'frozen' : ''}" style="${cardBg(card.design, b)}">
    <div class="dc-top"><span class="dc-bank">${esc(b.emoji)} ${esc(b.name)}</span><span class="dc-kind">DEBIT</span></div>
    <div class="dc-mid"><span class="dc-chip"></span><span class="dc-wave">)))</span></div>
    <div class="dc-num">${num}</div>
    <div class="dc-bot"><span class="dc-name">${esc(account.owner?.name || 'Your name')}</span>${card.hasPin ? '<span class="dc-pin">🔒 PIN</span>' : ''}</div>
    ${card.frozen ? '<div class="dc-frost">❄️ Frozen</div>' : ''}
  </div>`;
}

// ------------------------------------------------------------------ bank
export function viewBank(sel) {
  if (!S.banks.length) {
    setAccent('#0f766e');
    return bar('🏦 Bank') + `<div class="center-msg"><div class="emoji">🏗️</div><h2>No banks yet</h2>
      <button class="btn primary" data-act="bank-new">➕ Make a bank</button></div>`;
  }
  const bank = bankById(sel) || bankById(lsGet('bank')) || S.banks[0];
  lsSet('bank', bank.id);
  setAccent(bank.color);
  const accts = S.accounts.filter((a) => a.bankId === bank.id);
  const vault = sumOf(accts.map((a) => a.balance));
  const nCards = sumOf(accts.map((a) => a.cards.length));
  const tabs = S.banks.length > 1 ? `<nav class="tabs">${S.banks.map((b) => `<button class="${b.id === bank.id ? 'on' : ''}" data-act="bank-tab" data-id="${b.id}">${esc(b.emoji)} ${esc(b.name)}</button>`).join('')}</nav>` : '';
  return bar(`${esc(bank.emoji)} ${esc(bank.name)}`,
    `<button class="btn" data-act="bank-edit">✏️ <span>This bank</span></button><button class="btn" data-act="bank-new">➕ <span>New bank</span></button>`) +
    tabs + `<div class="setup">
      <section class="bank-hero">
        <span class="logo">${esc(bank.emoji)}</span>
        <div class="grow"><h2>${esc(bank.name)}</h2><div>${accts.length} account${accts.length === 1 ? '' : 's'} · ${nCards} card${nCards === 1 ? '' : 's'}</div></div>
        <div class="vault"><small>Money in the vault</small><strong>${money(vault)}</strong></div>
      </section>
      <div class="accounts-grid">
        ${accts.map((a) => `<button class="acct" data-act="acct" data-id="${a.id}">
            <span class="pic">${face(a.owner)}</span><span class="nm">${esc(a.owner.name)}</span>
            <span class="bal">${money(a.balance)}</span>
            <span class="mini-cards">${a.cards.map((c) => `<i class="${c.frozen ? 'frozen' : ''}" style="${cardBg(c.design, bank)}"></i>`).join('')}</span>
          </button>`).join('')}
        <button class="acct add" data-act="acct-open"><span class="pic">➕</span><span class="nm">Open an account</span></button>
      </div>
      ${(S.checks || []).filter((c) => !c.cashedAt && !c.voidAt).length ? `<section class="panel"><h3>🧾 Checks waiting to be cashed <span class="muted small">(or scan one)</span></h3>
        <div class="list">${S.checks.filter((c) => !c.cashedAt && !c.voidAt).map((c) => `<div class="list-row"><span class="e">🧾</span><span class="grow">${money(c.amount)} from ${esc(c.fromName)} to ${esc(c.toName)}<small>No. ${c.number}${c.memo ? ` · ${esc(c.memo)}` : ''}</small></span><button class="btn primary" data-act="check-cash" data-id="${c.id}">💰 Cash it</button></div>`).join('')}</div></section>` : ''}
    </div>`;
}

export function bankModal(bank) {
  const f = bank ? { name: bank.name, emoji: bank.emoji, color: bank.color } : { name: '', emoji: '🐷', color: '#db2777' };
  const used = bank && S.accounts.some((a) => a.bankId === bank.id);
  const m = {
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${bank ? `✏️ ${esc(bank.name)}` : '🏦 New bank'}</h2>
        <div class="preview" id="bank-pv">${debitCard({ owner: { name: 'Your name' } }, { design: 'bank' }, { bank: { ...f, name: f.name || 'My Bank' } })}</div>
        <label class="field">Bank name<input data-f="name" value="${esc(f.name)}" maxlength="30" autocomplete="off" placeholder="Piggy Bank"></label>
        <div class="field">Logo<div class="emoji-grid">${BANK_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
        <div class="field">Color<div class="swatches">${['#0f766e', ...COLORS].map((c) => `<button data-act="color" data-c="${c}" class="${c === f.color ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
        <div class="row split">
          ${bank ? `<button class="btn danger" data-act="delete" ${used ? 'disabled' : ''}>🗑️ Delete bank</button>` : '<span></span>'}
          <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="save">✅ Save</button>
        </div>
        ${used ? '<p class="muted small center">To delete this bank, close its accounts first.</p>' : ''}
      </div>`;
    },
    input(t) {
      if (t.dataset.f !== 'name') return;
      f.name = t.value;
      const pv = document.querySelector('#bank-pv .dc-bank');
      if (pv) pv.textContent = `${f.emoji} ${f.name || 'My Bank'}`;
    },
    enter() { document.activeElement?.blur(); },
    async act(a, el) {
      if (a === 'emoji') { f.emoji = el.dataset.e; drawModal(); return; }
      if (a === 'color') { f.color = el.dataset.c; drawModal(); return; }
      if (a === 'delete') {
        if (!(await askConfirm(`Delete ${bank.name}?`, { yes: '🗑️ Delete', danger: true }))) return;
        await api('DELETE', `/api/banks/${bank.id}`);
        await loadAll(); closeModal(); location.hash = '#/bank'; render();
        return;
      }
      if (a === 'save') {
        if (!f.name.trim()) { toast('Give the bank a name first ✏️'); return; }
        const body = { ...f, name: f.name.trim() };
        const saved = bank ? await api('PUT', `/api/banks/${bank.id}`, body) : await api('POST', '/api/banks', body);
        await loadAll(); closeModal();
        lsSet('bank', saved.id);
        if (route().a === saved.id) render(); else location.hash = `#/bank/${saved.id}`;
        toast(bank ? 'Saved ✅' : `${saved.name} is open for business! 🎉`);
      }
    },
  };
  openModal(m);
}

export function openAccountModal(bank) {
  const m = {
    who: null, gift: 0,
    render() {
      const have = new Set(S.accounts.filter((a) => a.bankId === bank.id).map((a) => a.customerId));
      const people = S.customers.filter((c) => !have.has(c.id));
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>🎉 Open an account at ${esc(bank.emoji)} ${esc(bank.name)}</h2>
        ${people.length ? `<div class="field">Who is it for?</div>
          <div class="choices">${people.map((c) => `<button class="choice ${m.who === c.id ? 'on' : ''}" data-act="who" data-id="${c.id}"><span class="e">${face(c)}</span>${esc(c.name)}</button>`).join('')}</div>`
          : '<p class="center muted">Everyone already has an account here. Add more people on the <b>People</b> page.</p>'}
        <div class="field">Welcome gift 🎁<div class="row">${[0, 500, 1000, 2000, 5000, 10000].map((v) => `<button class="btn ${m.gift === v ? 'primary' : ''}" data-act="gift" data-v="${v}">${v ? money(v) : 'Nothing'}</button>`).join('')}</div></div>
        <button class="btn huge primary" data-act="open" ${m.who ? '' : 'disabled'}>🏦 Open the account</button>
      </div>`;
    },
    async act(a, el) {
      if (a === 'who') { m.who = el.dataset.id; drawModal(); return; }
      if (a === 'gift') { m.gift = Number(el.dataset.v); drawModal(); return; }
      if (a === 'open') {
        const acct = await api('POST', '/api/accounts', { bankId: bank.id, customerId: m.who, opening: m.gift });
        await loadAll(); sfx.kaching();
        closeModal(); render();
        accountModal(acct.id);
        toast(`Welcome to ${bank.name}, ${acct.owner.name}! 🎉`);
      }
    },
  };
  openModal(m);
}

export function accountModal(id) {
  const m = {
    step: 'main', given: [], txns: null, design: 'bank', pin: '', pinCard: null, cashOut: 0,
    get acct() { return S.accounts.find((a) => a.id === id); },
    get gave() { return sumOf(m.given); },
    async reload() {
      try {
        await loadAll();
        m.txns = (await api('GET', `/api/accounts/${id}/transactions`)).transactions;
      } catch { /* closed meanwhile */ }
      if (ui.modal === m) drawModal();
    },
    go(step) { m.step = step; m.given = []; m.pin = ''; drawModal(); },
    render() {
      const a = m.acct;
      const x = '<button class="btn icon close" data-act="close" aria-label="Close">✕</button>';
      if (!a) return `<div class="sheet">${x}<h2>This account is closed</h2></div>`;
      const bank = bankById(a.bankId);
      const back = '<button class="btn" data-act="back">← Back</button>';
      const name = esc(a.owner.name);
      if (m.step === 'deposit') {
        return `<div class="sheet">${x}<h2>💵 Put money in</h2>
          <div class="muted center">Tap the money ${name} gives you:</div>
          ${cashTray(m.given)}
          <div class="row split">${back}<button class="btn huge good" style="width:auto;flex:1;max-width:400px" data-act="deposit" ${m.gave ? '' : 'disabled'}>🏦 Put ${money(m.gave)} in</button></div></div>`;
      }
      if (m.step === 'withdraw') {
        const over = m.gave > a.balance;
        return `<div class="sheet">${x}<h2>🏧 Take money out</h2>
          <div class="pay-total">${name} has<strong>${money(a.balance)}</strong></div>
          <div class="muted center">Tap the money they want to take:</div>
          ${cashTray(m.given)}
          ${over ? `<div class="center bad-text">That's more than ${name} has!</div>` : ''}
          <div class="row split">${back}<button class="btn huge good" style="width:auto;flex:1;max-width:400px" data-act="withdraw" ${m.gave && !over ? '' : 'disabled'}>🏧 Take out ${money(m.gave)}</button></div></div>`;
      }
      if (m.step === 'cash-out') {
        return `<div class="sheet"><div class="celebrate">💵</div><h2>Give ${name} ${money(m.cashOut)}</h2>
          <div class="change-box"><div class="change-list">${breakdown(m.cashOut).map((p) => `<span class="each">${moneyChip(p.d)} × ${p.n}</span>`).join('')}</div>
          <div>${name} has ${money(a.balance)} left in the bank</div></div>
          <button class="btn huge primary" data-act="back">👍 Done</button></div>`;
      }
      if (m.step === 'new-card') {
        return `<div class="sheet">${x}<h2>💳 New debit card</h2>
          <div class="preview">${debitCard(a, { design: m.design, hasPin: m.pin.length === 4 })}</div>
          <div class="field">Pick a look<div class="designs">${Object.keys(CARD_DESIGNS).map((k) => `<button class="design ${m.design === k ? 'on' : ''}" data-act="design" data-k="${k}" style="${cardBg(k, bank)}" aria-label="${k}"></button>`).join('')}</div></div>
          <div class="field">Secret PIN <span class="muted small">(4 numbers, or leave it empty for no PIN)</span></div>
          ${pinPad(m.pin)}
          <div class="row split">${back}<button class="btn huge primary" style="width:auto;flex:1;max-width:400px" data-act="make-card" ${m.pin.length === 0 || m.pin.length === 4 ? '' : 'disabled'}>💳 Make the card</button></div></div>`;
      }
      if (m.step === 'pin') {
        const c = a.cards.find((k) => k.id === m.pinCard);
        if (!c) { m.step = 'main'; return m.render(); }
        return `<div class="sheet">${x}<h2>🔑 New PIN for the card ending in ${esc(c.number.slice(-4))}</h2>
          ${pinPad(m.pin)}
          <div class="row split">${back}<span class="row">
            ${c.hasPin ? '<button class="btn danger" data-act="pin-remove">No PIN</button>' : ''}
            <button class="btn huge primary" style="width:auto" data-act="pin-save" ${m.pin.length === 4 ? '' : 'disabled'}>✅ Save PIN</button></span></div></div>`;
      }
      return `<div class="sheet">${x}
        <div class="acct-head"><span class="pic">${face(a.owner)}</span>
          <div class="grow"><h2>${name}</h2><div class="muted">${esc(bank?.emoji || '🏦')} ${esc(bank?.name || 'Bank')}</div></div>
          <div class="bal"><small>In the bank</small><strong>${money(a.balance)}</strong></div></div>
        <div class="row acct-actions">
          <button class="btn good" data-act="go" data-s="deposit">💵 Put money in</button>
          <button class="btn" data-act="go" data-s="withdraw" ${a.balance ? '' : 'disabled'}>🏧 Take money out</button>
          <button class="btn primary" data-act="go" data-s="new-card" ${a.cards.length >= 5 ? 'disabled' : ''}>💳 New card</button>
          <button class="btn" data-act="write-check">✍️ Write a check</button>
        </div>
        <h3>💳 Cards</h3>
        ${a.cards.length ? `<div class="card-list">${a.cards.map((c) => `<div class="card-item">${debitCard(a, c, { full: true })}
            <div class="row">
              <button class="btn" data-act="freeze" data-id="${c.id}">${c.frozen ? '☀️ Unfreeze' : '❄️ Freeze'}</button>
              <button class="btn" data-act="card-pin" data-id="${c.id}">🔑 PIN</button>
              <button class="btn" data-act="print-card" data-id="${c.id}">🖨️ Print</button>
              <button class="btn danger" data-act="cut" data-id="${c.id}">✂️ Cut up</button>
            </div></div>`).join('')}</div>` : '<p class="muted">No cards yet. Make one to pay at the stores!</p>'}
        <h3>📜 History</h3>
        <ul class="txns" data-scroll="txns">${m.txns ? (m.txns.length ? m.txns.map((t) => `<li>
            <span class="memo">${esc(t.memo)}<small>${when(t.at)}</small></span>
            <span class="amt ${t.amount < 0 ? 'neg' : 'pos'}">${t.amount < 0 ? '−' : '+'}${money(Math.abs(t.amount))}<small>${money(t.balance)}</small></span>
          </li>`).join('') : '<li class="muted">Nothing yet</li>') : '<li class="muted">Loading…</li>'}</ul>
        <div class="row"><button class="btn danger" data-act="close-acct">🗑️ Close account</button></div>
      </div>`;
    },
    async act(a, el) {
      const acct = m.acct;
      if (!acct) return;
      if (trayAct(m, a, el) || pinAct(m, a, el)) return;
      const card = el.dataset.id && acct.cards.find((c) => c.id === el.dataset.id);
      if (a === 'back') { m.go('main'); return; }
      if (a === 'go') { m.go(el.dataset.s); return; }
      if (a === 'write-check') { checkWriter(acct, () => { openModal(m); m.reload(); }); return; }
      if (a === 'design') { m.design = el.dataset.k; drawModal(); return; }
      if (a === 'deposit') {
        const amount = m.gave;
        await api('POST', `/api/accounts/${id}/deposit`, { amount });
        sfx.kaching(); toast(`${money(amount)} is in the bank 🏦`);
        m.go('main'); await m.reload(); return;
      }
      if (a === 'withdraw') {
        const amount = m.gave;
        await api('POST', `/api/accounts/${id}/withdraw`, { amount });
        sfx.kaching(); m.cashOut = amount;
        m.go('cash-out'); await m.reload(); return;
      }
      if (a === 'make-card') {
        await api('POST', `/api/accounts/${id}/cards`, { design: m.design, pin: m.pin || undefined });
        sfx.kaching(); toast('Here is your new card! 💳');
        m.go('main'); await m.reload(); return;
      }
      if (a === 'freeze' && card) {
        await api('PUT', `/api/cards/${card.id}`, { frozen: !card.frozen });
        toast(card.frozen ? 'Card works again ☀️' : 'Card frozen ❄️ It cannot pay until you unfreeze it.');
        await m.reload(); return;
      }
      if (a === 'card-pin' && card) { m.pinCard = card.id; m.go('pin'); return; }
      if (a === 'pin-save' || a === 'pin-remove') {
        await api('PUT', `/api/cards/${m.pinCard}`, { pin: a === 'pin-save' ? m.pin : '' });
        toast(a === 'pin-save' ? 'New PIN saved 🔑' : 'PIN removed');
        m.go('main'); await m.reload(); return;
      }
      if (a === 'print-card' && card) { printModal(debitCardSlip(acct, card), { title: '💳 Print the card', back: () => openModal(m) }); return; }
      if (a === 'cut' && card) {
        if (!(await askConfirm(`Cut up the card ending in ${card.number.slice(-4)}? ✂️`, { yes: '✂️ Cut it up', danger: true }))) return;
        await api('DELETE', `/api/cards/${card.id}`);
        await m.reload(); return;
      }
      if (a === 'close-acct') {
        const bal = acct.balance;
        if (!(await askConfirm(`Close ${acct.owner.name}'s account?${bal ? ` Give them their ${money(bal)} in cash.` : ''} Their cards stop working.`, { yes: '🗑️ Close it', danger: true }))) return;
        await api('DELETE', `/api/accounts/${id}`);
        await loadAll(); closeModal(); render();
        toast(bal ? `Account closed. Hand over ${money(bal)} 💵` : 'Account closed');
      }
    },
    onClose() { render(); },
  };
  openModal(m);
  m.reload();
}

export const bankActions = {
  // bank (home screen, no PIN)
  'bank-tab'(el) { location.hash = `#/bank/${el.dataset.id}`; },
  'bank-new'() { bankModal(null); },
  'bank-edit'() { const b = bankById(lsGet('bank')) || S.banks[0]; if (b) bankModal(b); },
  acct(el) { accountModal(el.dataset.id); },
  'acct-open'() {
    const b = bankById(lsGet('bank')) || S.banks[0];
    if (!S.customers.length) { toast('Add some people first (🙂 People on the home screen)'); return; }
    if (b) openAccountModal(b);
  },
};

export const bankApp = {
  views: { bank: (r) => viewBank(r.a) },
  actions: { ...bankActions, 'check-cash'(el) { cashCheckModal(el.dataset.id); } },
  // At the Bank, scanning a check cashes it.
  onScan(info) { if (info.kind !== 'check' || ui.modal) return false; cashCheckModal(info.id); return true; },
};

// A paper debit card. Its QR code picks the card at any register; the PIN is still asked for.
export function debitCardSlip(account, card) {
  const b = bankById(account.bankId) || { name: 'Bank', emoji: '🏦' };
  return { title: `${account.owner.name}'s card`, parts: [
    emojiImage(b.emoji || '🏦', 96),
    { t: 'text', s: b.name, size: 2, bold: true, align: 'center' },
    { t: 'text', s: 'DEBIT CARD', bold: true, invert: true, align: 'center' },
    { t: 'text', s: card.number.match(/.{4}/g).join(' '), size: 1, align: 'center' },
    { t: 'text', s: account.owner.name.toUpperCase(), size: 2, bold: true, align: 'center' },
    { t: 'qr', data: `KH-C-${card.id.toUpperCase()}`, size: 6 },
    { t: 'text', s: card.hasPin ? 'Scan to pay. You still need your secret PIN!' : 'Scan to pay.', align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}
