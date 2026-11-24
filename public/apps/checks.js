// 🧾 Checks (Bank): write one with a drawn signature, print it, and cash it at the Bank. The money
// comes out of the writer's account; it bounces if there isn't enough.
import { S, ui, esc, api, money, toast, openModal, drawModal, closeModal, loadAll, render, sfx, face } from '../lib/core.js';
import { breakdown, moneyChip } from '../lib/cash.js';
import { printModal, ditherCanvas } from '../lib/print.js';

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ''}`;
  return `${words(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${words(n % 1000)}` : ''}`;
}
// "Three dollars and 50/100", like on a real check.
export const amountWords = (c) => { const w = words(Math.floor(c / 100)); return `${w[0].toUpperCase()}${w.slice(1)} dollar${Math.floor(c / 100) === 1 ? '' : 's'} and ${String(c % 100).padStart(2, '0')}/100`; };

const PRICE_STEPS = [[-100, '−$1'], [-25, '−25¢'], [25, '+25¢'], [100, '+$1'], [500, '+$5']];

// ✍️ Write a check from this account. `back` returns to the account window.
export function checkWriter(account, back) {
  const f = { to: null, amount: 100, memo: '', sig: null };
  const m = {
    drawing: false,
    render() {
      const people = S.customers.filter((c) => c.id !== account.customerId);
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>✍️ Write a check</h2>
        <div class="check-paper">
          <div class="row split"><b>${esc(account.owner.name)}</b><small>${new Date().toLocaleDateString()}</small></div>
          <div class="check-line">Pay to: <b>${esc(S.customers.find((c) => c.id === f.to)?.name || '______')}</b><span class="check-amt">${money(f.amount)}</span></div>
          <div class="check-words">${esc(amountWords(f.amount))}</div>
          <div class="row split"><span>For: ${esc(f.memo || '______')}</span><span class="sig-label">Signature</span></div>
          <canvas class="sig-pad" width="480" height="120" aria-label="Sign here with your finger"></canvas>
          <div class="row" style="justify-content:flex-end"><button class="btn" data-act="sig-clear">🧽 Sign again</button></div>
        </div>
        <div class="field">Who is it for?<div class="choices">${people.map((c) => `<button class="choice ${f.to === c.id ? 'on' : ''}" data-act="to" data-id="${c.id}"><span class="e">${face(c)}</span>${esc(c.name)}</button>`).join('')}</div></div>
        <div class="field">How much? <span class="muted small">(${esc(account.owner.name)} has ${money(account.balance)})</span>
          <div class="price-pad">${PRICE_STEPS.slice(0, 2).map(([d, l]) => `<button class="btn" data-act="amt" data-d="${d}">${l}</button>`).join('')}<span class="shown">${money(f.amount)}</span>${PRICE_STEPS.slice(2).map(([d, l]) => `<button class="btn" data-act="amt" data-d="${d}">${l}</button>`).join('')}</div></div>
        <label class="field">What's it for? <span class="muted small">(optional)</span><input data-f="memo" value="${esc(f.memo)}" maxlength="60" placeholder="Pizza money" autocomplete="off"></label>
        <div class="row split">${back ? '<button class="btn" data-act="back">← Back</button>' : '<span></span>'}
          <button class="btn huge primary" style="width:auto;flex:1;max-width:320px" data-act="write" ${f.to && f.amount > 0 ? '' : 'disabled'}>🧾 Write it & print</button></div>
      </div>`;
    },
    // The signature pad: draw with a finger; the drawing survives redraws.
    afterDraw(root) {
      const c = root.querySelector('.sig-pad');
      if (!c) return;
      const x = c.getContext('2d');
      x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111';
      if (f.sig) { const img = new Image(); img.onload = () => x.drawImage(img, 0, 0); img.src = f.sig; }
      const pt = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
      c.addEventListener('pointerdown', (e) => { m.drawing = true; c.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(...pt(e)); e.preventDefault(); });
      c.addEventListener('pointermove', (e) => { if (!m.drawing) return; x.lineTo(...pt(e)); x.stroke(); });
      const end = () => { if (m.drawing) { m.drawing = false; f.sig = c.toDataURL('image/png'); } };
      c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    },
    input(t) { if (t.dataset.f === 'memo') f.memo = t.value; },
    enter() { document.activeElement?.blur(); },
    async act(a, el) {
      if (a === 'back') { back?.(); return; }
      if (a === 'to') { f.to = el.dataset.id; sfx.pop(); drawModal(); return; }
      if (a === 'amt') { f.amount = Math.max(25, Math.min(100000, f.amount + Number(el.dataset.d))); drawModal(); return; }
      if (a === 'sig-clear') { f.sig = null; drawModal(); return; }
      if (a === 'write') {
        if (!f.sig) { toast('Sign the check first ✍️'); return; }
        const check = await api('POST', '/api/checks', { fromAccountId: account.id, toCustomerId: f.to, amount: f.amount, memo: f.memo, signature: f.sig });
        await loadAll(); sfx.kaching();
        printModal(await checkSlip(check), { title: '🧾 Print the check', back: back || null });
      }
    },
  };
  openModal(m);
}

export async function checkSlip(check) {
  const acct = S.accounts.find((a) => a.id === check.fromAccountId);
  const bank = acct && S.banks.find((b) => b.id === acct.bankId);
  let sig = null;
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = check.signature; });
    const c = document.createElement('canvas'); c.width = 288; c.height = 72;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 288, 72); x.drawImage(img, 0, 0, 288, 72);
    sig = { ...ditherCanvas(c, { contrast: 1.6 }), align: 'right' };
  } catch { /* no picture */ }
  return { title: `Check #${check.number}`, parts: [
    { t: 'row', left: bank ? bank.name.toUpperCase() : 'KIDS HUB BANK', right: `No. ${check.number}`, bold: true },
    { t: 'row', left: check.fromName, right: new Date(check.at).toLocaleDateString() },
    { t: 'rule', ch: '=' },
    { t: 'text', s: 'PAY TO THE ORDER OF' },
    { t: 'row', left: check.toName, right: `$${(check.amount / 100).toFixed(2)}`, size: 2, bold: true },
    { t: 'text', s: amountWords(check.amount) },
    { t: 'rule' },
    ...(check.memo ? [{ t: 'text', s: `For: ${check.memo}` }] : []),
    ...(sig ? [sig] : []),
    { t: 'text', s: `Signed: ${check.fromName}`, align: 'right' },
    { t: 'rule', ch: '=' },
    { t: 'qr', data: `KH-H-${check.id.toUpperCase()}`, size: 5 },
    { t: 'text', s: 'Cash it at the Bank: scan the code', align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// 🏦 Cash a check: into the payee's own account, or as play cash. It may bounce.
export function cashCheckModal(checkId) {
  const ch = (S.checks || []).find((c) => c.id === checkId);
  if (!ch) { toast('That check is not real 🤔'); return; }
  const accts = S.accounts.filter((a) => a.customerId === ch.toCustomerId);
  const m = {
    result: null, error: null,
    render() {
      const x = '<button class="btn icon close" data-act="close" aria-label="Close">✕</button>';
      const card = `<div class="check-paper small"><div class="row split"><b>${esc(ch.fromName)}</b><small>No. ${ch.number}</small></div>
        <div class="check-line">Pay to: <b>${esc(ch.toName)}</b><span class="check-amt">${money(ch.amount)}</span></div>
        <div class="check-words">${esc(amountWords(ch.amount))}</div>${ch.memo ? `<div>For: ${esc(ch.memo)}</div>` : ''}
        <img class="sig-img" src="${esc(ch.signature)}" alt="signature"></div>`;
      if (m.result) {
        const r = m.result;
        return `<div class="sheet center"><div class="celebrate">💰</div><h2>Check cashed!</h2>${card}
          ${r.cashOut ? `<div class="change-box"><div>Give ${esc(ch.toName)}</div><strong>${money(r.cashOut)}</strong><div class="change-list">${breakdown(r.cashOut).map((p) => `<span class="each">${moneyChip(p.d)} × ${p.n}</span>`).join('')}</div></div>`
            : `<p>${esc(ch.toName)} has <b>${money(r.balance)}</b> in the bank now 🏦</p>`}
          <button class="btn huge primary" data-act="close">👍 Done</button></div>`;
      }
      if (ch.cashedAt || ch.voidAt) return `<div class="sheet center">${x}<h2>${ch.cashedAt ? '❌ Already cashed' : '❌ Torn up'}</h2>${card}</div>`;
      return `<div class="sheet center">${x}<h2>🧾 Cash this check?</h2>${card}
        ${m.error ? `<p class="bad-text"><b>${esc(m.error)}</b></p>` : ''}
        <div class="choices">${accts.map((a) => `<button class="choice" data-act="into" data-id="${a.id}"><span class="e">🏦</span>Put it in ${esc(a.owner.name)}'s ${esc(S.banks.find((b) => b.id === a.bankId)?.name || 'bank')} account</button>`).join('')}
          <button class="choice" data-act="cash"><span class="e">💵</span>Give ${esc(ch.toName)} cash</button></div>
        <button class="btn danger" data-act="void">✂️ Tear it up</button></div>`;
    },
    async act(a, el) {
      if (a !== 'into' && a !== 'cash' && a !== 'void') return;
      try {
        if (a === 'void') { await api('POST', `/api/checks/${ch.id}/void`); await loadAll(); closeModal(); render(); toast('Torn up ✂️'); return; }
        m.result = await api('POST', `/api/checks/${ch.id}/cash`, a === 'into' ? { accountId: el.dataset.id } : {});
        sfx.kaching(); await loadAll(); render();
      } catch (e) { m.error = e.message; sfx.buzz(); }
      if (ui.modal === m) drawModal();
    },
  };
  openModal(m);
}
