// 👨‍🍳 Orders: the kitchen screen.
import { Art, S, ago, api, art, askConfirm, bar, esc, face, loadAll, lsSet, money, render, setAccent, sfx, toast, ui } from '../../lib/core.js';
import { hasKitchen, storeById } from './common.js';
import { payModal } from './pay.js';
import { kitchenTicketSlip } from './slips.js';
import { printModal } from '../../lib/print.js';

export function viewOrders(sel) {
  if (sel !== 'all' && !hasKitchen(storeById(sel))) sel = 'all';
  const single = sel === 'all' ? null : storeById(sel);
  setAccent(single?.color || '#2563eb');
  const kitchens = S.stores.filter(hasKitchen);
  const list = S.orders.filter((o) => (sel === 'all' || o.storeId === sel) && hasKitchen(storeById(o.storeId)));
  const col = (st) => list.filter((o) => o.status === st).sort((a, b) => a.number - b.number);

  const agg = new Map();
  for (const o of list) {
    if (o.status !== 'new' && o.status !== 'making') continue;
    for (const l of o.lines) {
      if (l.done) continue;
      const k = `${o.storeId}:${l.itemId || l.name}:${l.recipe ? JSON.stringify(l.recipe) : ''}`;
      const e = agg.get(k) || { l, n: 0 };
      e.n += l.qty;
      agg.set(k, e);
    }
  }
  const toMake = [...agg.values()].sort((a, b) => b.n - a.n);

  const picker = `<button class="btn switch-btn" data-act="switch-store">${single ? `${esc(single.emoji)} ${esc(single.name)}` : '🏪 All stores'} <span class="caret">▾</span></button>`;
  const column = (st, title) => {
    const os = col(st);
    return `<div class="col"><h3>${title} ${os.length ? `<span class="badge">${os.length}</span>` : ''}</h3>
      <div class="stack">${os.length ? os.map((o) => orderCard(o, sel)).join('') : '<div class="empty">Nothing here</div>'}</div></div>`;
  };
  const delivered = col('delivered').reverse();

  return bar('👨‍🍳 Orders',
    `${kitchens.length > 1 ? picker : ''}
     <button class="btn icon" data-act="sound" aria-label="Sound">${ui.sound ? '🔔' : '🔕'}</button>
     <button class="btn icon" data-act="reset" aria-label="Reset play data">🧹</button>
     <a class="btn" href="#/serving">📣 <span>${S.queue?.serving ? `Now serving ${S.queue.serving}` : 'Numbers'}</span></a>
     <a class="btn" href="#/cashier${single ? `/${single.id}` : ''}">🧾 <span>Cashier</span></a>`, '#/store') +
    `<div class="orders-body">
      <aside class="to-make">
        <h3>🧑‍🍳 Things to make</h3>
        ${toMake.length ? `<ul>${toMake.map((e) => `<li><span class="art">${art(e.l)}</span><span>${esc(e.l.name)}</span><span class="n">×${e.n}</span></li>`).join('')}</ul>`
          : '<p class="muted">All done! 🎉</p>'}
      </aside>
      <div>
        <div class="columns">${column('new', '🆕 New')}${column('making', '👨‍🍳 Making')}${column('ready', '🔔 Ready')}</div>
        ${delivered.length ? `<details class="delivered-list"><summary>✅ Delivered (${delivered.length})</summary>
          <div class="columns">${delivered.map((o) => orderCard(o, sel)).join('')}</div></details>` : ''}
      </div>
    </div>`;
}

export function orderCard(o, sel) {
  const s = storeById(o.storeId);
  const allDone = o.lines.every((l) => l.done);
  const next = {
    new: '<button class="btn warn" data-act="status" data-s="making">👨‍🍳 Start</button>',
    making: `<button class="btn good" data-act="status" data-s="ready">${allDone ? '🔔 Ready!' : 'Ready!'}</button>`,
    ready: '<button class="btn primary" data-act="status" data-s="delivered">✅ Delivered</button>',
    delivered: '',
  }[o.status];
  return `<article class="order ${ui.fresh.has(o.id) ? 'fresh' : ''}" style="--c:${esc(s?.color || '#9ca3af')}" data-order="${o.id}">
    <header><span class="num">#${o.number}</span><span class="who"><span class="face">${face({ photo: o.customerPhoto, emoji: o.customerEmoji })}</span> ${esc(o.customer)}</span>
      <span class="ago">${sel === 'all' && s ? `${esc(s.emoji)} ` : ''}${ago(o.createdAt)}</span></header>
    <ul>${o.lines.map((l, i) => `<li class="${l.done ? 'done' : ''} ${l.recipe ? 'custom' : ''}"><button data-act="tick" data-i="${i}" ${o.status === 'delivered' ? 'disabled' : ''}>
        <span class="art">${art(l)}</span><span class="nm">${l.qty > 1 ? `${l.qty} × ` : ''}${esc(l.name)}${l.recipe ? `<small>${esc(Art.detailOf(l.builder, l.recipe))}</small>` : ''}</span><span class="tick">${l.done ? '✓' : ''}</span>
      </button></li>`).join('')}</ul>
    <div class="foot">
      ${o.paid ? `<span class="pill paid">✅ ${o.paidWith?.method === 'card' ? `💳 ••${esc(o.paidWith.last4)}` : 'Paid'} ${money(o.total)}</span>` : `<button class="pill unpaid" data-act="pay">💸 Not paid · ${money(o.total)}</button>`}
      <span class="grow"></span>
      <button class="btn ghost icon" data-act="cancel" aria-label="${o.status === 'delivered' ? 'Remove order' : 'Cancel order'}">🗑️</button>
      <button class="btn ghost icon" data-act="ticket-print" aria-label="Print kitchen ticket">🎫</button>
      ${next}
    </div>
  </article>`;
}

export function orderOf(el) {
  const id = el.closest('[data-order]')?.dataset.order;
  const o = S.orders.find((x) => x.id === id);
  if (!o) throw new Error('That order is gone');
  return o;
}

export const ordersActions = {
  // orders
  sound() { ui.sound = !ui.sound; lsSet('sound', ui.sound ? 'on' : 'off'); if (ui.sound) sfx.pop(); render(); },
  async tick(el) {
    const o = orderOf(el);
    Object.assign(o, await api('PATCH', `/api/orders/${o.id}`, { toggleLine: Number(el.dataset.i) }));
    sfx.pop();
    render();
  },
  async status(el) {
    const o = orderOf(el);
    Object.assign(o, await api('PATCH', `/api/orders/${o.id}`, { status: el.dataset.s }));
    if (el.dataset.s === 'ready') sfx.bell();
    render();
  },
  pay(el) { payModal(orderOf(el)); },
  async 'ticket-print'(el) { printModal(await kitchenTicketSlip(orderOf(el)), { title: '🎫 Kitchen ticket' }); },
  async cancel(el) {
    const o = orderOf(el);
    const card = o.paidWith?.method === 'card' && o.status !== 'delivered';
    const msg = o.status === 'delivered' ? `Take order #${o.number} for ${o.customer} off the list?`
      : `Cancel order #${o.number} for ${o.customer}?${card ? ` The ${money(o.total)} goes back to their card.` : ''}`;
    if (!(await askConfirm(msg, { yes: o.status === 'delivered' ? '🗑️ Remove' : '🗑️ Cancel order', no: 'Keep it', danger: true }))) return;
    const r = await api('DELETE', `/api/orders/${o.id}`);
    S.orders = S.orders.filter((x) => x.id !== o.id);
    if (r.refunded) { toast(`↩️ ${money(o.total)} went back to the card`); await loadAll(); }
    render();
  },
};
