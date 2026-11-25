// 🧾 Cashier: the register screen, cart and who-is-it-for picker.
import { $modal, Art, PEOPLE_EMOJI, S, api, art, bar, closeModal, drawModal, esc, face, loadAll, lsSet, money, openModal, render, route, setAccent, sfx, toast, ui } from '../../lib/core.js';
import { hasKitchen, storeById, storePickerModal } from './common.js';
import { builderModal, itemModal } from './items.js';
import { payModal } from './pay.js';
import { showScanCard } from '../../lib/scan.js';
import { autoTicket, couponSlips } from './slips.js';
import { printModal } from '../../lib/print.js';

// #/cashier with no store: straight in when there's only one, else pick on the Store screen.
export function viewStorePicker() {
  location.replace(S.stores.length === 1 ? `#/cashier/${S.stores[0].id}` : '#/store');
  return null;
}

// Custom orders (builder items) get one cart line per recipe; everything else one line per item.
export const lineKey = (item, recipe) => (item.builder ? `${item.id}|${Art.recipeKey(item.builder, recipe || item.recipe || Art.SAMPLE[item.builder])}` : item.id);
// How many of an item are already in the cart, and whether one more fits in the stock.
const inCartQty = (itemId) => Object.values(ui.cart.lines).reduce((a, l) => a + (l.itemId === itemId ? l.qty : 0), 0);
export function roomFor(item, n = 1) {
  if (item.stock == null) return true;
  if (inCartQty(item.id) + n <= item.stock) return true;
  toast(item.stock ? `Only ${item.stock} ${item.name} left!` : `${item.name} is sold out! 😮`);
  return false;
}
export function addLine(item, recipe = null, n = 1) {
  if (!roomFor(item, n)) return;
  const key = lineKey(item, recipe);
  const l = ui.cart.lines[key] || { itemId: item.id, qty: 0, recipe: item.builder ? Art.normRecipe(item.builder, recipe || item.recipe || Art.SAMPLE[item.builder]) : null };
  l.qty = Math.min(99, l.qty + n);
  ui.cart.lines[key] = l;
}
export function cartLines(s) {
  return Object.entries(ui.cart.lines).map(([key, l]) => {
    const item = s.items.find((i) => i.id === l.itemId);
    if (!item || l.qty <= 0) return null;
    if (!item.builder) return { key, item, q: l.qty, name: item.name, price: item.price, pic: item };
    const same = item.recipe && Art.recipeKey(item.builder, item.recipe) === Art.recipeKey(item.builder, l.recipe);
    return {
      key, item, q: l.qty, recipe: l.recipe, pic: { builder: item.builder, recipe: l.recipe },
      name: same ? item.name : Art.nameOf(item.builder, l.recipe), price: Art.priceOf(item.builder, l.recipe),
    };
  }).filter(Boolean);
}
export function totals(s, lines) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.q, 0);
  const c = ui.cart.coupon;
  let discount = 0;
  let note = '';
  if (c) {
    if (c.kind === 'amount') discount = Math.min(c.value, subtotal);
    else if (c.kind === 'percent') discount = Math.round((subtotal * c.value) / 100);
    else { const l = lines.find((x) => x.item.id === c.itemId); discount = l ? l.price : 0; if (!l) note = 'Put the free item in the order'; }
  }
  const tax = Math.round(((subtotal - discount) * s.taxRate) / 100);
  return { subtotal, discount, note, tax, total: subtotal - discount + tax };
}

export function viewCashier(id) {
  const s = storeById(id);
  if (!s) { setAccent(); return bar('Store not found', '', '#/store') + `<div class="center-msg"><div class="emoji">🤔</div><p>That store is gone.</p></div>`; }
  lsSet('ordersStore', id);
  if (ui.cart.storeId !== id) { ui.cart = { storeId: id, lines: {} }; ui.cat = 'all'; }
  for (const [k, l] of Object.entries(ui.cart.lines)) if (!s.items.some((i) => i.id === l.itemId)) delete ui.cart.lines[k];
  setAccent(s.color);

  const cats = s.categories.filter((c) => s.items.some((i) => i.categoryId === c.id));
  if (ui.cat !== 'all' && !cats.some((c) => c.id === ui.cat)) ui.cat = 'all';
  const items = s.items.filter((i) => ui.cat === 'all' || i.categoryId === ui.cat);
  const open = S.orders.filter((o) => o.storeId === id && o.status !== 'delivered').length;
  const who = ui.customer ? `<span class="face">${face(ui.customer)}</span> ${esc(ui.customer.name)}` : '👤 Who?';
  const inCart = (id) => Object.values(ui.cart.lines).reduce((a, l) => a + (l.itemId === id ? l.qty : 0), 0);

  const tabs = cats.length > 1 ? `<nav class="tabs">
      <button class="${ui.cat === 'all' ? 'on' : ''}" data-act="cat" data-id="all">✨ Everything</button>
      ${cats.map((c) => `<button class="${ui.cat === c.id ? 'on' : ''}" data-act="cat" data-id="${c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}
    </nav>` : '';

  const tiles = items.map((i) => {
    const q = inCart(i.id);
    const make = i.builder && !i.recipe;
    const sale = !i.builder && i.wasPrice > i.price;
    const out = i.stock != null && i.stock <= 0;
    return `<div class="tile-wrap">
      <button class="tile ${q ? 'in-cart' : ''} ${make ? 'make' : ''} ${out && !ui.restock ? 'sold-out' : ''}" data-act="${ui.restock ? 'restock' : 'add'}" data-id="${i.id}">
        ${q ? `<span class="qty">${q}</span>` : ''}
        ${i.stock != null ? `<span class="stock ${i.stock <= 2 ? 'low' : ''}">${out ? 'Sold out!' : `${i.stock} left`}</span>` : ''}
        ${sale ? `<span class="save">SAVE ${money(i.wasPrice - i.price)}</span>` : ''}
        ${make ? '<span class="make-badge">✨ Make it!</span>' : ''}
        <span class="art">${art(i)}</span><span class="name">${esc(i.name)}</span>
        <span class="price-row"><span class="price">${make ? `from ${money(i.price)}` : money(i.price)}</span>${sale ? `<s class="was">${money(i.wasPrice)}</s>` : ''}</span>
      </button>
      ${i.addedBy === 'kid' ? `<button class="edit" data-act="edit-item" data-id="${i.id}" aria-label="Change ${esc(i.name)}">✏️</button>` : ''}
    </div>`;
  }).join('');

  const title = S.stores.length > 1
    ? `<button class="switch" data-act="switch-store">${esc(s.emoji)} ${esc(s.name)} <span class="caret">▾</span></button>`
    : `${esc(s.emoji)} ${esc(s.name)}`;
  return `<div class="store-wrap theme-${esc(s.theme || 'plain')}">` + bar(title,
    `<button class="btn ${ui.priceCheck ? 'warn' : ''}" data-act="price-check" aria-pressed="${!!ui.priceCheck}">🔍 <span>${ui.priceCheck ? 'Price check is on' : 'Price check'}</span></button>` +
    `<button class="btn ${ui.restock ? 'warn' : ''}" data-act="restock-mode" aria-pressed="${!!ui.restock}">📦 <span>${ui.restock ? 'Restocking' : 'Restock'}</span></button>` +
    '<button class="btn" data-act="coupon-make">🎟️ <span>Coupons</span></button>' +
    (hasKitchen(s) ? `<a class="btn" href="#/orders/${s.id}">👨‍🍳 <span>Orders</span>${open ? `<b>${open}</b>` : ''}</a>` : ''), '#/store') +
    (ui.priceCheck ? '<div class="price-check-banner">🔍 Price check: scan something to see what it costs. Tap the button again to sell.</div>' : '') +
    (ui.restock ? '<div class="price-check-banner">📦 Restocking: tap or scan things to count one more onto the shelf. Tap Restocking again to sell.</div>' : '') +
    tabs +
    `<div class="cashier-body">
      <section class="grid">
        ${tiles}
        <button class="tile add" data-act="new-item"><span class="art">➕</span><span class="name">Add my item</span></button>
      </section>
      ${cartHtml(s, who)}
    </div></div>`;
}

export function cartHtml(s, who) {
  const lines = cartLines(s);
  const t = totals(s, lines);
  return `<aside class="cart">
    <h3>🛒 Order for <button data-act="pick-customer">${who}</button></h3>
    ${lines.length ? `<ul>${lines.map((l) => `<li>
        <span class="art">${art(l.pic)}</span>
        <span class="nm">${esc(l.name)}<small>${money(l.price * l.q)}${l.recipe ? ` · <button class="line-edit" data-act="edit-line" data-k="${esc(l.key)}">✏️ change</button>` : ''}</small></span>
        <span class="stepper"><button data-act="dec" data-k="${esc(l.key)}" aria-label="One less">−</button><span>${l.q}</span><button data-act="inc" data-k="${esc(l.key)}" aria-label="One more">+</button></span>
      </li>`).join('')}</ul>` : '<p class="muted">Tap things to add them to the order.</p>'}
    ${ui.cart.coupon ? `<div class="cart-coupon">🎟️ ${esc(ui.cart.coupon.label)}${t.note ? `<small>${esc(t.note)}</small>` : ''}<button class="btn icon" data-act="coupon-x" aria-label="Take the coupon off">✕</button></div>` : ''}
    <dl class="totals">
      ${s.taxRate || t.discount ? `<dt>Subtotal</dt><dd>${money(t.subtotal)}</dd>` : ''}
      ${t.discount ? `<dt>Coupon</dt><dd>−${money(t.discount)}</dd>` : ''}
      ${s.taxRate ? `<dt>Tax (${s.taxRate}%)</dt><dd>${money(t.tax)}</dd>` : ''}
      <dt class="total">Total</dt><dd class="total">${money(t.total)}</dd>
    </dl>
    <button class="btn huge primary" data-act="send" ${lines.length ? '' : 'disabled'}>${hasKitchen(s) ? '🚀 Send Order' : '🧾 Checkout'}</button>
    ${lines.length || ui.customer ? '<button class="btn ghost" data-act="clear">Start over</button>' : ''}
  </aside>`;
}

// ------------------------------------------------------------------ modals
export function customerModal(after) {
  const m = {
    adding: false, name: '', emoji: '🙂', remember: true,
    // Scanning a member card picks that person.
    onScan(info) {
      const c = info.kind === 'person' && S.customers.find((x) => x.id === info.id);
      if (!c) return false;
      sfx.pop(); m.done(c); toast(`Hi ${c.name}! 👋`);
      return true;
    },
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>Who is this order for?</h2>
        <div class="choices">
          ${S.customers.map((c) => `<button class="choice" data-act="pick" data-id="${c.id}"><span class="e">${face(c)}</span>${esc(c.name)}</button>`).join('')}
          <button class="choice ${m.adding ? 'on' : ''}" data-act="someone"><span class="e">➕</span>Someone new</button>
        </div>
        ${m.adding ? `
          <label class="field">Their name<input data-f="name" value="${esc(m.name)}" maxlength="30" autocomplete="off" placeholder="Name"></label>
          <div class="emoji-grid">${PEOPLE_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === m.emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
          <label class="toggle"><input type="checkbox" data-f="remember" ${m.remember ? 'checked' : ''}> Remember them for next time</label>
          <button class="btn huge primary" data-act="ok">👍 OK</button>` : ''}
      </div>`;
    },
    done(c) {
      ui.customer = { id: c.id, name: c.name, emoji: c.emoji, photo: c.photo || null };
      closeModal();
      render();
      after?.();
    },
    async act(a, el) {
      if (a === 'pick') { this.done(S.customers.find((c) => c.id === el.dataset.id)); return; }
      if (a === 'someone') { m.adding = true; drawModal(); $modal.querySelector('[data-f=name]')?.focus(); return; }
      if (a === 'emoji') { m.emoji = el.dataset.e; drawModal(); return; }
      if (a === 'ok') await this.enter();
    },
    async enter() {
      const name = m.name.trim();
      if (!name) { toast('Type their name first ✏️'); return; }
      if (m.remember) {
        const c = await api('POST', '/api/customers', { name, emoji: m.emoji });
        if (!S.customers.some((x) => x.id === c.id)) S.customers.push(c);
        this.done(c);
      } else this.done({ name, emoji: m.emoji });
    },
    input(t) {
      if (t.dataset.f === 'name') m.name = t.value;
      if (t.dataset.f === 'remember') m.remember = t.checked;
    },
  };
  openModal(m);
}

export const cashierActions = {
  // cashier
  cat(el) { ui.cat = el.dataset.id; render(); },
  add(el) {
    const s = storeById(route().a);
    const item = s?.items.find((i) => i.id === el.dataset.id);
    if (!item) return;
    if (item.builder && !item.recipe) { builderModal({ store: s, item }); return; }
    addLine(item); sfx.pop(); render();
  },
  inc(el) {
    const l = ui.cart.lines[el.dataset.k];
    const item = l && storeById(route().a)?.items.find((i) => i.id === l.itemId);
    if (l && item && roomFor(item)) l.qty = Math.min(99, l.qty + 1);
    render();
  },
  dec(el) { const k = el.dataset.k; const l = ui.cart.lines[k]; if (l && --l.qty <= 0) delete ui.cart.lines[k]; render(); },
  'edit-line'(el) {
    const s = storeById(route().a);
    const l = ui.cart.lines[el.dataset.k];
    const item = l && s?.items.find((i) => i.id === l.itemId);
    if (item?.builder) builderModal({ store: s, item, recipe: l.recipe, replaceKey: el.dataset.k });
  },
  'switch-store'() { storePickerModal(route().view === 'orders' ? 'orders' : 'cashier'); },
  clear() { ui.cart.lines = {}; ui.cart.coupon = null; ui.customer = null; ui.askedCustomer = false; render(); },
  'restock-mode'() { ui.restock = !ui.restock; ui.priceCheck = false; sfx.pop(); render(); },
  async restock(el) { await restockItem(storeById(route().a), el.dataset.id); },
  'coupon-x'() { ui.cart.coupon = null; render(); },
  'coupon-make'() { const s = storeById(route().a); if (s) couponMaker(s); },
  'pick-customer'() { customerModal(); },
  send() { return sendOrder(); },
  'price-check'() { ui.priceCheck = !ui.priceCheck; ui.restock = false; sfx.pop(); render(); },
  'new-item'() {
    const s = storeById(route().a);
    if (s) itemModal({ store: s, item: null, mode: 'kid', defaultCat: ui.cat !== 'all' ? ui.cat : null });
  },
  'edit-item'(el) {
    const s = storeById(route().a);
    const item = s?.items.find((i) => i.id === el.dataset.id);
    if (item) itemModal({ store: s, item, mode: 'kid' });
  },
};

// Send the cart as an order, then pay. `cardId`: a debit card that was just scanned.
export async function sendOrder({ cardId = null } = {}) {
  const s = storeById(route().a);
  if (!s) return;
  if (!cartLines(s).length) return;
  if (!ui.customer) { customerModal(() => sendOrder({ cardId })); return; }
  const lines = cartLines(s).map((l) => ({ itemId: l.item.id, qty: l.q, recipe: l.recipe || undefined }));
  let order;
  try {
    order = await api('POST', '/api/orders', { storeId: s.id, customerId: ui.customer.id || null, customer: ui.customer.name, customerEmoji: ui.customer.emoji, customerPhoto: ui.customer.photo || null, lines, couponId: ui.cart.coupon?.id });
  } catch (e) {
    if (['used', 'store'].includes(e.data?.code)) { ui.cart.coupon = null; render(); }
    if (e.data?.code === 'stock') loadAll().then(render, () => {});
    throw e;
  }
  S.orders.push(order);
  if (hasKitchen(s)) { sfx.newOrder(); autoTicket(order); }
  payModal(order, { fresh: true, checkout: !hasKitchen(s), cardId });
}

// Scans on the register screen (when no window is open, or the window passed on them).
export function cashierScan(info, s) {
  if (ui.modal) return false;
  if (info.kind === 'person') {
    const c = S.customers.find((x) => x.id === info.id);
    if (!c) return false;
    ui.customer = { id: c.id, name: c.name, emoji: c.emoji, photo: c.photo || null };
    ui.askedCustomer = true;
    sfx.pop(); render(); toast(`This order is for ${c.name} 👋`);
    return true;
  }
  if (info.kind === 'card') {
    if (!cartLines(s).length) { toast('Ring something up first, then scan the card 💳'); return true; }
    sendOrder({ cardId: info.card.id });
    return true;
  }
  if (info.kind === 'coupon') {
    if (info.coupon.used) { sfx.buzz(); toast('That coupon was already used ❌'); return true; }
    if (info.coupon.storeId && info.coupon.storeId !== s.id) { sfx.buzz(); toast(`That coupon is for another store (${info.detail.split(' · ')[0]})`); return true; }
    const c = (S.coupons || []).find((x) => x.id === info.id);
    if (!c) return false;
    ui.cart.coupon = c; sfx.kaching(); render(); toast(`🎟️ ${c.label}!`);
    return true;
  }
  if (info.kind === 'item' && info.item.storeId === s.id) {
    const item = s.items.find((i) => i.id === info.item.id);
    if (!item) return false;
    if (ui.restock) { restockItem(s, item.id); return true; }
    if (ui.priceCheck) { priceCard(item); return true; }
    if (item.builder && !item.recipe) { builderModal({ store: s, item }); return true; }
    addLine(item); sfx.pop(); render();
    toast(`+1 ${item.name} · ${money(item.price)}`);
    return true;
  }
  if (info.kind === 'product' && !ui.priceCheck) {
    // A real package nobody has sold yet: make it a new item, with its barcode attached.
    itemModal({ store: s, item: null, mode: 'kid', barcode: info.code });
    return true;
  }
  return false;
}

// Price check: the item and its price, big, without adding it.
function priceCard(item) {
  showScanCard({ code: item.barcodes?.[0] || `KH-I-${item.id.toUpperCase()}`, kind: 'price', emoji: item.emoji, photo: item.photo, icon: item.icon,
    label: item.name, price: money(item.price), detail: item.wasPrice > item.price ? `On sale! It was ${money(item.wasPrice)}` : '' });
}

// 📦 Restock: one more onto the shelf (only items that count stock).
async function restockItem(s, itemId) {
  const item = s?.items.find((i) => i.id === itemId);
  if (!item) return;
  try {
    const r = await api('POST', `/api/stores/${s.id}/items/${itemId}/stock`, { add: 1 });
    item.stock = r.stock; sfx.pop(); render(); toast(`📦 ${item.name}: ${r.stock} on the shelf`);
  } catch (e) { sfx.buzz(); toast(e.message); }
}

// 🎟️ Make coupons and print them. Each one works once.
function couponMaker(store) {
  const items = store.items.filter((i) => !i.builder || i.recipe);
  const m = {
    kind: 'amount', value: 100, itemId: items[0]?.id || null, count: 1, anyStore: false,
    render() {
      const opts = m.kind === 'amount' ? [50, 100, 200, 500].map((v) => [v, `${money(v)} off`]) : m.kind === 'percent' ? [10, 25, 50, 100].map((v) => [v, v === 100 ? 'All free!' : `${v}% off`]) : null;
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>🎟️ Make coupons</h2>
        <div class="pay-tabs"><button class="${m.kind === 'amount' ? 'on' : ''}" data-act="k" data-k="amount">💵 Money off</button><button class="${m.kind === 'percent' ? 'on' : ''}" data-act="k" data-k="percent">％ Percent off</button><button class="${m.kind === 'item' ? 'on' : ''}" data-act="k" data-k="item">🎁 Free thing</button></div>
        ${opts ? `<div class="row" style="justify-content:center">${opts.map(([v, l]) => `<button class="btn ${m.value === v ? 'primary' : ''}" data-act="v" data-v="${v}">${l}</button>`).join('')}</div>`
          : `<div class="tag-picks" data-scroll="items">${items.map((i) => `<button class="tag-pick ${m.itemId === i.id ? 'on' : ''}" data-act="item" data-id="${i.id}"><span class="art">${art(i)}</span><span>${esc(i.name)}</span></button>`).join('')}</div>`}
        <div class="row" style="justify-content:center"><span>How many?</span>${[1, 2, 3, 5].map((n) => `<button class="btn ${m.count === n ? 'primary' : ''}" data-act="n" data-n="${n}">${n}</button>`).join('')}</div>
        <label class="toggle"><input type="checkbox" data-f="any" ${m.anyStore ? 'checked' : ''}> Works at any store (not just ${esc(store.name)})</label>
        <button class="btn huge primary" data-act="make">🎟️ Make ${m.count} coupon${m.count === 1 ? '' : 's'}</button>
      </div>`;
    },
    input(t) { if (t.dataset.f === 'any') m.anyStore = t.checked; },
    async act(a, el) {
      if (a === 'k') { m.kind = el.dataset.k; m.value = m.kind === 'percent' ? 25 : 100; drawModal(); return; }
      if (a === 'v') { m.value = Number(el.dataset.v); drawModal(); return; }
      if (a === 'item') { m.itemId = el.dataset.id; drawModal(); return; }
      if (a === 'n') { m.count = Number(el.dataset.n); drawModal(); return; }
      if (a === 'make') {
        const made = await api('POST', '/api/coupons', { storeId: m.anyStore ? null : store.id, kind: m.kind, value: m.value, itemId: m.itemId, count: m.count });
        await loadAll(); sfx.kaching();
        printModal(couponSlips(made, m.anyStore ? null : store), { title: '🎟️ Print coupons' });
      }
    },
  };
  openModal(m);
}
