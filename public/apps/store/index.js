// 🏪 Store app: the lobby (pick a store, or go to the kitchen), plus the cashier and orders screens.
import { S, ui, esc, bar, setAccent, route, lsGet, sfx, dataHooks, api, toast, render } from '../../lib/core.js';
import { hasKitchen, storeById } from './common.js';
import { viewCashier, viewStorePicker, customerModal, cashierActions, cashierScan } from './cashier.js';
import { viewOrders, ordersActions } from './orders.js';
import { returnsModal } from './returns.js';
import { viewServing, counterActions } from './counter.js';

const openOrders = () => S.orders.filter((o) => o.status !== 'delivered').length;

function viewLobby() {
  setAccent('#ff7a45');
  if (!S.stores.length) {
    return bar('🏪 Store') + `<div class="center-msg"><div class="emoji">🏗️</div><h2>No stores yet</h2>
      <p class="muted">Ask a grown-up to open Setup and make a store.</p><a class="btn primary" href="#/setup">⚙️ Setup</a></div>`;
  }
  const open = openOrders();
  const kitchens = S.stores.some(hasKitchen);
  return bar('🏪 Store') + `<div class="setup lobby">
    <h2 class="center">Which store is open?</h2>
    <div class="big-buttons">
      ${S.stores.map((s) => `<a class="big small" style="background:${esc(s.color)}" href="#/cashier/${s.id}">${esc(s.emoji)}<span>${esc(s.name)}</span></a>`).join('')}
    </div>
    ${kitchens ? `<div class="big-buttons lobby-more">
      <a class="big small orders" href="#/orders">👨‍🍳<span>Kitchen orders</span>${open ? `<b class="badge">${open}</b>` : ''}</a>
    </div>` : ''}
    <div class="row lobby-tools">
      <button class="btn" data-act="take-number">🎟️ Take a number</button>
      <a class="btn" href="#/serving">📣 Now serving${S.queue?.serving ? ` ${S.queue.serving}` : ''}</a>
      <button class="btn" data-act="report">📊 Today's report</button>
    </div>
    <p class="center muted small">↩️ Returns: scan the QR code on a receipt.</p>
  </div>`;
}

// New kitchen orders flash and chime on the Orders screen.
dataHooks.push(() => {
  const ids = new Set(S.orders.map((o) => o.id));
  if (ui.seen && route().view === 'orders') {
    const fresh = S.orders.filter((o) => !ui.seen.has(o.id) && o.status === 'new');
    if (fresh.length) {
      fresh.forEach((o) => ui.fresh.add(o.id));
      sfx.newOrder();
      setTimeout(() => { fresh.forEach((o) => ui.fresh.delete(o.id)); }, 3500);
    }
  }
  ui.seen = ids;
});

const NEXT = { new: 'making', making: 'ready', ready: 'delivered' };
const SAY = { making: '👨‍🍳 Making it!', ready: '🔔 Ready!', delivered: '✅ Delivered' };

// Scanning a kitchen ticket moves its order to the next step.
async function advanceTicket(info) {
  const o = info.order;
  const next = NEXT[o.status];
  if (!next) { toast(`Order #${o.number} was already delivered ✅`); return; }
  const updated = await api('PATCH', `/api/orders/${o.id}`, { status: next });
  const i = S.orders.findIndex((x) => x.id === o.id);
  if (i >= 0) S.orders[i] = updated; else S.orders.push(updated);
  if (next === 'ready') sfx.bell(); else sfx.pop();
  toast(`Order #${o.number} for ${updated.customer}: ${SAY[next]}`);
  render();
}

export const storeApp = {
  views: {
    store: viewLobby,
    serving: viewServing,
    cashier: (r) => (r.a ? viewCashier(r.a) : viewStorePicker()),
    orders: (r) => viewOrders(r.a || lsGet('ordersStore') || 'all'),
  },
  actions: { ...cashierActions, ...ordersActions, ...counterActions },
  // Scans anywhere in the Store app: receipts open the Returns desk, kitchen tickets move along,
  // and the register rings things up (see cashierScan).
  async onScan(info, r) {
    if (ui.modal) return false;
    if (info.kind === 'receipt') { await returnsModal(info.order.id); return true; }
    if (info.kind === 'ticket') { await advanceTicket(info); return true; }
    if (r.view === 'cashier') { const s = storeById(r.a); return s ? cashierScan(info, s) : false; }
    return false;
  },
  badge: openOrders,
  // Opening a register asks who the order is for.
  afterRender(r) {
    if (r.view === 'cashier' && r.a && storeById(r.a) && !ui.customer && !ui.askedCustomer && !ui.modal) {
      ui.askedCustomer = true;
      customerModal();
    }
  },
};
