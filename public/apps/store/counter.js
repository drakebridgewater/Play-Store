// The shop counter: take a number (deli style), the Now Serving screen, and the end-of-day report.
import { S, api, esc, money, bar, setAccent, openModal, drawModal, sfx, toast, askConfirm, render } from '../../lib/core.js';
import { canPrint, printSlip, printModal } from '../../lib/print.js';
import { queueSlip, reportSlip } from './slips.js';

const queue = () => S.queue || { next: 1, serving: 0 };

// 🎟️ Take a number: prints a ticket (if there's a printer) and shows the number big.
export async function takeNumber() {
  const q = await api('POST', '/api/queue', { action: 'take' });
  S.queue = q;
  sfx.pop();
  let printed = false;
  if (canPrint()) {
    try { await printSlip(queueSlip(q.number, q.serving)); printed = true; } catch (e) { toast(e.message); }
  }
  openModal({
    render: () => `<div class="sheet center">
      <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
      <h2>🎟️ Your number is</h2>
      <div class="queue-number">${q.number}</div>
      <p class="pay-total" style="font-size:22px">${q.serving ? `Now serving ${q.serving}` : 'You are first in line!'}</p>
      ${printed ? '<p class="muted">🖨️ Take your ticket from the printer.</p>' : ''}
      <button class="btn huge primary" data-act="close">👍 OK</button></div>`,
  });
}

// 📣 Now Serving: a big screen for the counter. Every tablet shows the same number.
export function viewServing() {
  setAccent('#7c3aed');
  const q = queue();
  const waiting = Math.max(0, q.next - 1 - q.serving);
  return bar('📣 Now serving', '<button class="btn" data-act="queue-reset">🔄 <span>Start over</span></button>', '#/store') + `<div class="serving">
    <div class="serving-label">NOW SERVING</div>
    <div class="serving-number">${q.serving || '–'}</div>
    <div class="serving-wait">${waiting ? `${waiting} waiting · next number is ${q.serving + 1}` : 'Nobody is waiting'}</div>
    <div class="row" style="justify-content:center">
      <button class="btn huge primary" style="width:auto" data-act="queue-next" ${waiting ? '' : 'disabled'}>📣 Next, please!</button>
      <button class="btn huge" style="width:auto" data-act="take-number">🎟️ Take a number</button>
    </div>
  </div>`;
}

export const counterActions = {
  'take-number'() { return takeNumber(); },
  async 'queue-next'() {
    S.queue = await api('POST', '/api/queue', { action: 'next' });
    sfx.bell(); render();
  },
  async 'queue-reset'() {
    if (!(await askConfirm('Start the numbers again from 1?', { yes: '🔄 Start over' }))) return;
    S.queue = await api('POST', '/api/queue', { action: 'reset' });
    render();
  },
  report() { return reportModal(); },
};

// 📊 Today's report, for one store or all of them.
export async function reportModal() {
  const m = {
    storeId: '', r: null,
    async load() { m.r = await api('GET', `/api/report${m.storeId ? `?storeId=${m.storeId}` : ''}`); drawModal(); },
    name() { const s = S.stores.find((x) => x.id === m.storeId); return s ? s.name : 'All stores'; },
    render() {
      const r = m.r;
      const row = (k, v, cls = '') => `<dt class="${cls}">${k}</dt><dd class="${cls}">${v}</dd>`;
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>📊 Today's report</h2>
        ${S.stores.length > 1 ? `<div class="row" style="justify-content:center">
          <button class="btn ${m.storeId ? '' : 'primary'}" data-act="pick" data-id="">🏪 All stores</button>
          ${S.stores.map((s) => `<button class="btn ${m.storeId === s.id ? 'primary' : ''}" data-act="pick" data-id="${s.id}">${esc(s.emoji)} ${esc(s.name)}</button>`).join('')}</div>` : ''}
        ${r ? `<dl class="totals report">
          ${row('Orders', r.orders)}${row('Things sold', r.items)}
          ${row('Paid with cash', money(r.cash))}${row('Paid with cards', money(r.card))}
          ${r.tax ? row('Tax collected', money(r.tax)) : ''}
          ${r.refunds ? row(`Returns (${r.refundCount})`, `−${money(r.refunds)}`) : ''}
          ${row('Total', money(r.sales - r.refunds), 'total')}
          ${row('Cash in the drawer', money(r.cash - r.cashRefunds))}
          ${r.unpaid ? row(`Not paid yet (${r.unpaid})`, money(r.unpaidAmount)) : ''}
        </dl>
        ${r.best.length ? `<p class="center">⭐ Best seller: <b>${esc(r.best[0].name)}</b> × ${r.best[0].qty}</p>` : '<p class="center muted">No sales yet today.</p>'}` : '<p class="center muted">Adding it all up…</p>'}
        <button class="btn huge primary" data-act="print" ${r ? '' : 'disabled'}>🧾 Print the report</button>
      </div>`;
    },
    async act(a, el) {
      if (a === 'pick') { m.storeId = el.dataset.id; m.r = null; drawModal(); await m.load(); return; }
      if (a === 'print') printModal(reportSlip(m.r, m.name()), { title: '📊 End of day', back: () => openModal(m) });
    },
  };
  openModal(m);
  await m.load();
}
