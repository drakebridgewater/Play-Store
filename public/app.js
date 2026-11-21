'use strict';
/* Play Store POS: tablet UI. Plain JS, no build step. */

const $app = document.getElementById('app');
const $modal = document.getElementById('modal');
const $toast = document.getElementById('toast');

const S = { stores: [], customers: [], templates: [], orders: [], loaded: false };
const ui = {
  cart: { storeId: null, lines: {} }, // itemId -> qty
  customer: null,                      // { name, emoji }
  askedCustomer: false,
  cat: 'all',
  pin: ssGet('pin'),
  pinEntry: '',
  sound: lsGet('sound') !== 'off',
  seen: null,
  fresh: new Set(),
  draft: null, dirty: false,           // store being edited in Setup
  custDraft: null, custDirty: false,
  modal: null,
};

const ITEM_EMOJI = ['🍎','🍌','🍓','🍇','🍉','🍊','🥕','🌽','🥦','🍕','🍔','🌭','🌮','🥪','🍟','🍿','🧀','🥚','🥞','🧇','🍪','🍩','🧁','🎂','🍰','🍫','🍬','🍭','🍦','☕','🍵','🧃','🥤','🧋','🥛','💧','🧸','🪀','🎈','🎨','🖍️','✏️','📚','📒','🎮','🕹️','🧩','🎲','🪁','⚽','🏀','🚗','🚂','✈️','🚀','🦖','🐶','🐱','🦄','🐉','💎','🪨','🐚','🌸','🌻','⭐','🌈','🔮','🪄','👑','💍','🎁','📱','💻','🎧','📷','🔋','🔧','🛠️','🧪','🔦','🏷️'];
const PEOPLE_EMOJI = ['🙂','😀','😎','🤠','🥳','🤖','👽','🦸','🧙','👸','🤴','👩','👨','👵','👴','🧒','👶','🐻','🐶','🐱','🦊','🐼'];
const COLORS = ['#ff7a45','#db2777','#9333ea','#2563eb','#0891b2','#16a34a','#ca8a04','#9a5b34','#dc2626','#475569'];
const DENOMS = [
  { v: 2000, label: '$20', kind: 'bill' }, { v: 1000, label: '$10', kind: 'bill' },
  { v: 500, label: '$5', kind: 'bill' }, { v: 100, label: '$1', kind: 'bill' },
  { v: 25, label: '25¢', kind: 'coin' }, { v: 10, label: '10¢', kind: 'coin' },
  { v: 5, label: '5¢', kind: 'coin' }, { v: 1, label: '1¢', kind: 'coin' },
];

// ------------------------------------------------------------------ helpers
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function ssSet(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* ignore */ } }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);
const storeById = (id) => S.stores.find((s) => s.id === id);
const rid = () => Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, 'x');
const clone = (o) => JSON.parse(JSON.stringify(o));
const route = () => { const [view = '', a = '', b = ''] = location.hash.replace(/^#\/?/, '').split('/'); return { view, a, b }; };
const setAccent = (c) => document.documentElement.style.setProperty('--accent', c || '#ff7a45');

function art(x) {
  return x.photo
    ? `<img class="art-img" src="${esc(x.photo)}" alt="" data-emoji="${esc(x.emoji)}" loading="lazy">`
    : esc(x.emoji);
}
// A missing photo falls back to the item's emoji.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.dataset.emoji !== undefined) t.replaceWith(document.createTextNode(t.dataset.emoji));
}, true);

function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function breakdown(c) {
  const out = [];
  for (const d of DENOMS) { const n = Math.floor(c / d.v); if (n) { out.push({ d, n }); c -= n * d.v; } }
  return out;
}
const moneyChip = (d, extra = '') => `<span class="money ${d.kind} c${d.v} mini ${extra}">${d.label}</span>`;

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, 2800);
}

async function api(method, url, body, { pin = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (pin && ui.pin) headers['x-setup-pin'] = ui.pin;
  const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && pin) { ui.pin = null; ssSet('pin', null); setTimeout(render, 0); }
    throw new Error(data.error || `Something went wrong (${r.status})`);
  }
  return data;
}

// ------------------------------------------------------------------ sounds
let ac;
document.addEventListener('pointerdown', () => {
  try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { /* no audio */ }
}, { passive: true });
function tone(freqs, dur = 0.12, type = 'sine', gap = 0.09) {
  if (!ui.sound || !ac) return;
  try {
    let t = ac.currentTime;
    for (const f of freqs) {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
      t += gap;
    }
  } catch { /* ignore */ }
}
const sfx = {
  pop: () => tone([660], 0.08, 'triangle'),
  kaching: () => tone([988, 1319, 1760], 0.2, 'triangle', 0.08),
  newOrder: () => tone([784, 988, 1175], 0.28, 'sine', 0.16),
  bell: () => tone([1568, 1175], 0.45, 'sine', 0.2),
};

// ------------------------------------------------------------------ data + live sync
async function loadAll() {
  const [st, od] = await Promise.all([api('GET', '/api/state'), api('GET', '/api/orders')]);
  S.stores = st.stores; S.customers = st.customers; S.templates = st.templates; S.orders = od.orders;
  S.loaded = true;
}

function onData() {
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
  if (route().view === 'setup') return; // Setup edits a local draft; don't clobber it
  const focused = document.activeElement;
  if (focused && $app.contains(focused) && focused.matches('input, select, textarea')) return;
  render();
}

let refreshTimer;
function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try { await loadAll(); onData(); } catch { /* offline for a moment; SSE will retry */ }
  }, 60);
}

function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('change', refresh);
  es.addEventListener('hello', refresh); // also fires after a reconnect
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(refresh, 30_000);

// ------------------------------------------------------------------ modal plumbing
function openModal(m) { ui.modal = m; $modal.hidden = false; drawModal(); }
function drawModal() { if (ui.modal) $modal.innerHTML = ui.modal.render(); }
function closeModal() {
  const m = ui.modal;
  ui.modal = null; $modal.hidden = true; $modal.innerHTML = '';
  m?.onClose?.();
}
$modal.addEventListener('click', (e) => {
  if (e.target === $modal) { if (!ui.modal?.sticky) closeModal(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || !ui.modal) return;
  if (el.dataset.act === 'close') { closeModal(); return; }
  Promise.resolve(ui.modal.act?.(el.dataset.act, el, e)).catch((err) => toast(err.message));
});
$modal.addEventListener('input', (e) => ui.modal?.input?.(e.target, e));
$modal.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) ui.modal?.enter?.(e.target); });

// ------------------------------------------------------------------ views
function render() {
  if (!S.loaded) return;
  const r = route();
  let html;
  if (r.view === 'cashier') html = r.a ? viewCashier(r.a) : viewStorePicker('cashier');
  else if (r.view === 'orders') html = viewOrders(r.a || lsGet('ordersStore') || 'all');
  else if (r.view === 'setup') html = viewSetup(r);
  else html = viewHome();
  if (html == null) return;
  $app.innerHTML = html;
  if (r.view === 'cashier' && r.a && storeById(r.a) && !ui.customer && !ui.askedCustomer && !ui.modal) {
    ui.askedCustomer = true;
    customerModal();
  }
}

function bar(title, right = '', back = '#/') {
  return `<header class="bar"><a class="btn icon" href="${back}" aria-label="Back">←</a><h2>${title}</h2>${right}</header>`;
}

function viewHome() {
  setAccent('#ff7a45');
  const open = S.orders.filter((o) => o.status !== 'delivered').length;
  return `<div class="home">
    <h1>🏪 Play Store</h1>
    <div class="big-buttons">
      <a class="big cashier" href="#/cashier">🧾<span>Cashier</span></a>
      <a class="big orders" href="#/orders">👨‍🍳<span>Orders</span>${open ? `<b class="badge">${open}</b>` : ''}</a>
      <a class="big setup" href="#/setup">⚙️<span>Setup</span></a>
    </div>
  </div>`;
}

function viewStorePicker() {
  setAccent('#ff7a45');
  if (S.stores.length === 1) { location.replace(`#/cashier/${S.stores[0].id}`); return null; }
  if (!S.stores.length) {
    return bar('🧾 Cashier') + `<div class="center-msg"><div class="emoji">🏗️</div><h2>No stores yet</h2>
      <p class="muted">Ask a grown-up to open Setup and make a store.</p><a class="btn primary" href="#/setup">⚙️ Setup</a></div>`;
  }
  return bar('Which store is open?') + `<div class="setup"><div class="big-buttons">
    ${S.stores.map((s) => `<a class="big small" style="background:${esc(s.color)}" href="#/cashier/${s.id}">${esc(s.emoji)}<span>${esc(s.name)}</span></a>`).join('')}
  </div></div>`;
}

function cartLines(s) {
  return Object.entries(ui.cart.lines)
    .map(([id, q]) => ({ item: s.items.find((i) => i.id === id), q }))
    .filter((l) => l.item && l.q > 0);
}
function totals(s, lines) {
  const subtotal = lines.reduce((a, l) => a + l.item.price * l.q, 0);
  const tax = Math.round((subtotal * s.taxRate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

function viewCashier(id) {
  const s = storeById(id);
  if (!s) { setAccent(); return bar('Store not found', '', '#/cashier') + `<div class="center-msg"><div class="emoji">🤔</div><p>That store is gone.</p></div>`; }
  lsSet('ordersStore', id);
  if (ui.cart.storeId !== id) { ui.cart = { storeId: id, lines: {} }; ui.cat = 'all'; }
  for (const k of Object.keys(ui.cart.lines)) if (!s.items.some((i) => i.id === k)) delete ui.cart.lines[k];
  setAccent(s.color);

  const cats = s.categories.filter((c) => s.items.some((i) => i.categoryId === c.id));
  if (ui.cat !== 'all' && !cats.some((c) => c.id === ui.cat)) ui.cat = 'all';
  const items = s.items.filter((i) => ui.cat === 'all' || i.categoryId === ui.cat);
  const open = S.orders.filter((o) => o.storeId === id && o.status !== 'delivered').length;
  const who = ui.customer ? `${esc(ui.customer.emoji)} ${esc(ui.customer.name)}` : '👤 Who?';

  const tabs = cats.length > 1 ? `<nav class="tabs">
      <button class="${ui.cat === 'all' ? 'on' : ''}" data-act="cat" data-id="all">✨ Everything</button>
      ${cats.map((c) => `<button class="${ui.cat === c.id ? 'on' : ''}" data-act="cat" data-id="${c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}
    </nav>` : '';

  const tiles = items.map((i) => {
    const q = ui.cart.lines[i.id] || 0;
    return `<div class="tile-wrap">
      <button class="tile ${q ? 'in-cart' : ''}" data-act="add" data-id="${i.id}">
        ${q ? `<span class="qty">${q}</span>` : ''}
        <span class="art">${art(i)}</span><span class="name">${esc(i.name)}</span><span class="price">${money(i.price)}</span>
      </button>
      ${i.addedBy === 'kid' ? `<button class="edit" data-act="edit-item" data-id="${i.id}" aria-label="Change ${esc(i.name)}">✏️</button>` : ''}
    </div>`;
  }).join('');

  return bar(`${esc(s.emoji)} ${esc(s.name)}`,
    `<a class="btn" href="#/orders/${s.id}">👨‍🍳 <span>Orders</span>${open ? `<b>${open}</b>` : ''}</a>`,
    S.stores.length > 1 ? '#/cashier' : '#/') +
    tabs +
    `<div class="cashier-body">
      <section class="grid">
        ${tiles}
        <button class="tile add" data-act="new-item"><span class="art">➕</span><span class="name">Add my item</span></button>
      </section>
      ${cartHtml(s, who)}
    </div>`;
}

function cartHtml(s, who) {
  const lines = cartLines(s);
  const t = totals(s, lines);
  return `<aside class="cart">
    <h3>🛒 Order for <button data-act="pick-customer">${who}</button></h3>
    ${lines.length ? `<ul>${lines.map((l) => `<li>
        <span class="art">${art(l.item)}</span>
        <span class="nm">${esc(l.item.name)}<small>${money(l.item.price * l.q)}</small></span>
        <span class="stepper"><button data-act="dec" data-id="${l.item.id}" aria-label="One less">−</button><span>${l.q}</span><button data-act="inc" data-id="${l.item.id}" aria-label="One more">+</button></span>
      </li>`).join('')}</ul>` : '<p class="muted">Tap things to add them to the order.</p>'}
    <dl class="totals">
      ${s.taxRate ? `<dt>Subtotal</dt><dd>${money(t.subtotal)}</dd><dt>Tax (${s.taxRate}%)</dt><dd>${money(t.tax)}</dd>` : ''}
      <dt class="total">Total</dt><dd class="total">${money(t.total)}</dd>
    </dl>
    <button class="btn huge primary" data-act="send" ${lines.length ? '' : 'disabled'}>🚀 Send Order</button>
    ${lines.length || ui.customer ? '<button class="btn ghost" data-act="clear">Start over</button>' : ''}
  </aside>`;
}

function viewOrders(sel) {
  if (sel !== 'all' && !storeById(sel)) sel = 'all';
  const single = sel === 'all' ? null : storeById(sel);
  setAccent(single?.color || '#2563eb');
  const list = S.orders.filter((o) => sel === 'all' || o.storeId === sel);
  const col = (st) => list.filter((o) => o.status === st).sort((a, b) => a.number - b.number);

  const agg = new Map();
  for (const o of list) {
    if (o.status !== 'new' && o.status !== 'making') continue;
    for (const l of o.lines) {
      if (l.done) continue;
      const k = `${o.storeId}:${l.itemId || l.name}`;
      const e = agg.get(k) || { l, n: 0 };
      e.n += l.qty;
      agg.set(k, e);
    }
  }
  const toMake = [...agg.values()].sort((a, b) => b.n - a.n);

  const picker = `<select data-act-change="orders-store" aria-label="Store">
      <option value="all">All stores</option>
      ${S.stores.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.emoji)} ${esc(s.name)}</option>`).join('')}
    </select>`;
  const column = (st, title) => {
    const os = col(st);
    return `<div class="col"><h3>${title} ${os.length ? `<span class="badge">${os.length}</span>` : ''}</h3>
      <div class="stack">${os.length ? os.map((o) => orderCard(o, sel)).join('') : '<div class="empty">Nothing here</div>'}</div></div>`;
  };
  const delivered = col('delivered').reverse();

  return bar('👨‍🍳 Orders',
    `${S.stores.length > 1 ? picker : ''}
     <button class="btn icon" data-act="sound" aria-label="Sound">${ui.sound ? '🔔' : '🔕'}</button>
     <a class="btn" href="#/cashier${single ? `/${single.id}` : ''}">🧾 <span>Cashier</span></a>`) +
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

function orderCard(o, sel) {
  const s = storeById(o.storeId);
  const allDone = o.lines.every((l) => l.done);
  const next = {
    new: '<button class="btn warn" data-act="status" data-s="making">👨‍🍳 Start</button>',
    making: `<button class="btn good" data-act="status" data-s="ready">${allDone ? '🔔 Ready!' : 'Ready!'}</button>`,
    ready: '<button class="btn primary" data-act="status" data-s="delivered">✅ Delivered</button>',
    delivered: '',
  }[o.status];
  return `<article class="order ${ui.fresh.has(o.id) ? 'fresh' : ''}" style="--c:${esc(s?.color || '#9ca3af')}" data-order="${o.id}">
    <header><span class="num">#${o.number}</span><span class="who">${esc(o.customerEmoji)} ${esc(o.customer)}</span>
      <span class="ago">${sel === 'all' && s ? `${esc(s.emoji)} ` : ''}${ago(o.createdAt)}</span></header>
    <ul>${o.lines.map((l, i) => `<li class="${l.done ? 'done' : ''}"><button data-act="tick" data-i="${i}" ${o.status === 'delivered' ? 'disabled' : ''}>
        <span class="art">${art(l)}</span><span class="nm">${l.qty > 1 ? `${l.qty} × ` : ''}${esc(l.name)}</span><span class="tick">${l.done ? '✓' : ''}</span>
      </button></li>`).join('')}</ul>
    <div class="foot">
      ${o.paid ? `<span class="pill paid">✅ Paid ${money(o.total)}</span>` : `<button class="pill unpaid" data-act="pay">💸 Not paid · ${money(o.total)}</button>`}
      <span class="grow"></span>
      ${o.status !== 'delivered' ? '<button class="btn ghost icon" data-act="cancel" aria-label="Cancel order">🗑️</button>' : ''}
      ${next}
    </div>
  </article>`;
}

// ------------------------------------------------------------------ setup views
function viewSetup(r) {
  setAccent('#475569');
  if (!ui.pin) {
    return bar('⚙️ Setup') + `<div class="pinpad" id="pinpad">
      <h2>Grown-ups only 🔒</h2>
      <div class="dots">${ui.pinEntry ? '●'.repeat(ui.pinEntry.length) : '<span class="muted">Enter the PIN</span>'}</div>
      <div class="keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-act="pin-key" data-k="${n}">${n}</button>`).join('')}
        <button data-act="pin-back" aria-label="Delete">⌫</button><button data-act="pin-key" data-k="0">0</button><button data-act="pin-ok">OK</button>
      </div></div>`;
  }
  if (r.a === 'store' && r.b) return viewStoreEditor(r.b);
  ui.draft = null;
  if (!ui.custDraft || !ui.custDirty) { ui.custDraft = clone(S.customers); ui.custDirty = false; }
  const open = S.orders.filter((o) => o.status !== 'delivered').length;
  const delivered = S.orders.length - open;
  return bar('⚙️ Setup', '<button class="btn" data-act="lock">🔒 Lock</button>') + `<div class="setup">
    <section class="panel">
      <h3><span class="grow">🏪 Stores</span><button class="btn primary" data-act="new-store">➕ New store</button></h3>
      <div class="list">${S.stores.length ? S.stores.map((s) => `<div class="list-row">
          <span class="e">${esc(s.emoji)}</span>
          <span class="grow">${esc(s.name)}<small>${s.items.length} items · ${s.taxRate ? `${s.taxRate}% tax` : 'no tax'} · ${s.playMoney ? 'play money' : 'tap to pay'}</small></span>
          <a class="btn" href="#/cashier/${s.id}">🧾 Open</a>
          <a class="btn primary" href="#/setup/store/${s.id}">✏️ Edit</a>
        </div>`).join('') : '<p class="muted">No stores yet. Tap “New store” and pick a template.</p>'}</div>
    </section>
    <section class="panel">
      <h3><span class="grow">🙂 Customers</span><button class="btn" data-act="cust-add">➕ Add</button></h3>
      <div class="list">${ui.custDraft.map((c, i) => `<div class="list-row">
          <input class="emoji-in" data-cust="${i}" data-k="emoji" value="${esc(c.emoji)}" maxlength="16" aria-label="Emoji">
          <input class="grow-in" data-cust="${i}" data-k="name" value="${esc(c.name)}" maxlength="30" placeholder="Name" aria-label="Name">
          <button class="btn icon danger" data-act="cust-del" data-i="${i}" aria-label="Remove">✕</button>
        </div>`).join('')}</div>
      <div class="row end"><button class="btn primary" data-act="cust-save" id="cust-save" ${ui.custDirty ? '' : 'disabled'}>💾 Save customers</button></div>
    </section>
    <section class="panel">
      <h3>🧾 Orders</h3>
      <p class="muted">${open} open, ${delivered} delivered in the last 12 hours or so.</p>
      <div class="row">
        <button class="btn" data-act="clear-delivered">🧹 Clear delivered orders</button>
        <button class="btn danger" data-act="clear-all">Clear ALL orders and restart at #1</button>
      </div>
    </section>
    <section class="panel">
      <h3>📱 Tablet tip</h3>
      <p>On Android, open this page in Chrome, then ⋮ → <b>Add to Home screen</b> for a full-screen app.</p>
    </section>
  </div>`;
}

function viewStoreEditor(id) {
  if (!ui.draft || ui.draft.id !== id) {
    const s = storeById(id);
    if (!s) return bar('Store not found', '', '#/setup');
    ui.draft = clone(s);
    ui.dirty = false;
  }
  const d = ui.draft;
  setAccent(d.color);
  const itemRows = (cat) => d.items.filter((i) => i.categoryId === cat.id).map((i) => `<div class="list-row">
      <span class="e">${art(i)}</span>
      <span class="grow">${esc(i.name)}<small>${money(i.price)}${i.addedBy === 'kid' ? ' · ⭐ added at the register' : ''}</small></span>
      <button class="btn" data-act="item-edit" data-id="${esc(i.id)}">✏️ Edit</button>
    </div>`).join('') || '<p class="muted">No items in this category.</p>';
  return `<header class="bar"><button class="btn icon" data-act="editor-back" aria-label="Back">←</button>
      <h2>${esc(d.emoji)} ${esc(d.name)}</h2><button class="btn" data-act="store-save">💾 Save</button></header>
    <div class="setup">
      <section class="panel">
        <h3>🏪 Store</h3>
        <div class="form-grid">
          <label class="field">Name<input data-d="name" value="${esc(d.name)}" maxlength="40"></label>
          <label class="field">Emoji<input data-d="emoji" value="${esc(d.emoji)}" maxlength="16"></label>
          <label class="field">Tax %<input data-d="taxRate" type="number" inputmode="decimal" min="0" max="50" step="0.25" value="${d.taxRate}"></label>
        </div>
        <div class="field">Color<div class="swatches">${COLORS.map((c) => `<button data-act="color" data-c="${c}" class="${c === d.color ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
        <label class="toggle"><input type="checkbox" data-d="playMoney" ${d.playMoney ? 'checked' : ''}> 💵 Pay with play money (bills, coins and change)</label>
      </section>
      <section class="panel">
        <h3><span class="grow">🗂️ Categories</span><button class="btn" data-act="cat-add">➕ Add</button></h3>
        <div class="list">${d.categories.map((c, i) => `<div class="list-row">
            <input class="emoji-in" data-cat="${i}" data-k="emoji" value="${esc(c.emoji)}" maxlength="16" aria-label="Emoji">
            <input class="grow-in" data-cat="${i}" data-k="name" value="${esc(c.name)}" maxlength="30" aria-label="Category name">
            <button class="btn icon danger" data-act="cat-del" data-i="${i}" aria-label="Remove">✕</button>
          </div>`).join('')}</div>
      </section>
      <section class="panel">
        <h3><span class="grow">🏷️ Items (${d.items.length})</span><button class="btn primary" data-act="item-add">➕ Add item</button></h3>
        ${d.categories.map((c) => `<h4>${esc(c.emoji)} ${esc(c.name)}</h4><div class="list">${itemRows(c)}</div>`).join('')}
      </section>
      <section class="panel">
        <h3>⚠️ Careful</h3>
        <div class="row"><button class="btn danger" data-act="store-del">🗑️ Delete this store</button></div>
      </section>
    </div>`;
}

// ------------------------------------------------------------------ modals
function customerModal(after) {
  const m = {
    adding: false, name: '', emoji: '🙂', remember: true,
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>Who is this order for?</h2>
        <div class="choices">
          ${S.customers.map((c) => `<button class="choice" data-act="pick" data-id="${c.id}"><span class="e">${esc(c.emoji)}</span>${esc(c.name)}</button>`).join('')}
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
      ui.customer = { name: c.name, emoji: c.emoji };
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

function payModal(order, { fresh = false } = {}) {
  const s = storeById(order.storeId);
  const playMoney = s ? s.playMoney : true;
  const m = {
    sticky: true, step: 'pay', given: [], change: 0,
    get gave() { return m.given.reduce((a, v) => a + v, 0); },
    render() {
      if (m.step === 'done') {
        const parts = breakdown(m.change);
        return `<div class="sheet">
          <div class="celebrate">🎉</div>
          <h2>Order #${order.number} is paid!</h2>
          ${m.change > 0 ? `<div class="change-box"><div>Give back</div><strong>${money(m.change)}</strong>
              <div class="change-list">${parts.map((p) => `<span class="each">${moneyChip(p.d)} × ${p.n}</span>`).join('')}</div></div>`
            : '<div class="change-box"><strong>No change!</strong><div>They gave the exact amount 👌</div></div>'}
          <button class="btn huge primary" data-act="close">👍 Done</button>
        </div>`;
      }
      if (m.step === 'later') {
        return `<div class="sheet"><div class="celebrate">📨</div>
          <h2>Order #${order.number} went to the kitchen!</h2>
          <p class="pay-total">They'll pay later 💸</p>
          <button class="btn huge primary" data-act="close">👍 Done</button></div>`;
      }
      const gave = m.gave;
      const enough = gave >= order.total;
      return `<div class="sheet">
        ${fresh ? `<h2>🚀 Order #${order.number} sent to the kitchen!</h2>` : `<button class="btn icon close" data-act="close" aria-label="Close">✕</button><h2>Pay for order #${order.number}</h2>`}
        <div class="pay-total">${esc(order.customerEmoji)} ${esc(order.customer)} pays<strong>${money(order.total)}</strong></div>
        ${playMoney ? `
          <div class="muted" style="text-align:center">Tap the money they give you:</div>
          <div class="money-tray">${DENOMS.map((d) => `<button class="money ${d.kind} c${d.v}" data-act="money" data-v="${d.v}">${d.label}</button>`).join('')}</div>
          <div class="given">${m.given.length ? m.given.map((v, i) => `<button data-act="undo" data-i="${i}" aria-label="Take back">${moneyChip(DENOMS.find((d) => d.v === v))}</button>`).join('') : '<span class="muted">No money yet</span>'}</div>
          <div class="row split"><span class="pay-total" style="font-size:22px">They gave: <b>${money(gave)}</b></span>
            <button class="btn" data-act="exact">👌 Exact amount</button></div>
          ${enough && gave > order.total ? `<div class="change-box"><div>Change to give back: <b>${money(gave - order.total)}</b></div></div>` : ''}
          ${!enough && gave ? `<div class="muted" style="text-align:center">Still need ${money(order.total - gave)} more</div>` : ''}
        ` : ''}
        <div class="row split">
          <button class="btn" data-act="later">${fresh ? '💸 Pay later' : 'Not now'}</button>
          <button class="btn huge good" style="width:auto;flex:1" data-act="paid" ${playMoney && !enough ? 'disabled' : ''}>💰 Paid!</button>
        </div>
      </div>`;
    },
    async act(a, el) {
      if (a === 'money') { m.given.push(Number(el.dataset.v)); sfx.pop(); drawModal(); return; }
      if (a === 'undo') { m.given.splice(Number(el.dataset.i), 1); drawModal(); return; }
      if (a === 'exact') { m.given = breakdown(order.total).flatMap((p) => Array(p.n).fill(p.d.v)); drawModal(); return; }
      if (a === 'later') { if (fresh) { m.step = 'later'; drawModal(); } else closeModal(); return; }
      if (a === 'paid') {
        const updated = await api('PATCH', `/api/orders/${order.id}`, { pay: { tendered: playMoney ? m.gave : order.total } });
        Object.assign(order, updated);
        m.change = updated.change || 0;
        m.step = 'done';
        sfx.kaching();
        drawModal();
      }
    },
    onClose() {
      if (fresh) { ui.cart.lines = {}; ui.customer = null; ui.askedCustomer = false; }
      refresh();
      render();
    },
  };
  openModal(m);
}

function readFile(capture) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (capture) inp.setAttribute('capture', 'environment');
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}

async function shrinkPhoto(file) {
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(file); });
  }
  const w = img.width, h = img.height, side = Math.min(w, h), size = Math.min(480, side);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.82);
}

// mode 'kid': saves straight to the server. mode 'setup': edits the Setup draft.
function itemModal({ store, item, mode, defaultCat = null }) {
  const cats = mode === 'setup' ? ui.draft.categories : store.categories;
  const hasMyStuff = cats.some((c) => c.name.toLowerCase() === 'my stuff');
  const f = item
    ? { name: item.name, emoji: item.emoji, photo: item.photo, price: item.price, categoryId: item.categoryId }
    : { name: '', emoji: '⭐', photo: null, price: 100, categoryId: defaultCat || (mode === 'setup' ? cats[0]?.id : null) };
  const catChips = () => {
    const chips = mode === 'kid' && !hasMyStuff ? [{ id: null, name: 'My Stuff', emoji: '⭐' }, ...cats] : cats;
    if (chips.length < 2) return '';
    const sel = f.categoryId ?? (mode === 'kid' ? (cats.find((c) => c.name.toLowerCase() === 'my stuff')?.id ?? null) : null);
    return `<div class="field">Where does it go?<div class="row">${chips.map((c) =>
      `<button class="btn ${c.id === sel ? 'primary' : ''}" data-act="cat" data-id="${c.id ?? ''}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div></div>`;
  };
  const m = {
    busy: false,
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${item ? '✏️ Change item' : mode === 'kid' ? '⭐ Add my item' : '➕ New item'}</h2>
        <div class="preview"><div class="tile"><span class="art">${art(f)}</span><span class="name" id="pv-name">${esc(f.name || 'Name?')}</span><span class="price">${money(f.price)}</span></div></div>
        <div class="row" style="justify-content:center">
          <button class="btn" data-act="photo-cam">📷 Take a photo</button>
          <button class="btn" data-act="photo-pick">🖼️ Pick a photo</button>
          ${f.photo ? '<button class="btn danger" data-act="photo-del">No photo</button>' : ''}
        </div>
        <label class="field">What is it called?<input data-f="name" value="${esc(f.name)}" maxlength="40" autocomplete="off" placeholder="My cool rock"></label>
        <div class="field">${f.photo ? 'Emoji (shown if the photo goes missing)' : 'Pick a picture'}
          <div class="emoji-grid">${ITEM_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
        <div class="field">How much does it cost?
          <div class="price-pad">
            <button class="btn" data-act="price" data-d="-100">−$1</button><button class="btn" data-act="price" data-d="-25">−25¢</button>
            <span class="shown">${money(f.price)}</span>
            <button class="btn" data-act="price" data-d="25">+25¢</button><button class="btn" data-act="price" data-d="100">+$1</button><button class="btn" data-act="price" data-d="500">+$5</button>
          </div>
          <div class="row" style="justify-content:center">${[0, 50, 100, 200, 500, 1000, 2000].map((p) => `<button class="btn ghost" data-act="price-set" data-p="${p}">${p ? money(p) : 'Free'}</button>`).join('')}</div>
        </div>
        ${catChips()}
        <div class="row split">
          ${item ? '<button class="btn danger" data-act="delete">🗑️ Remove it</button>' : '<span></span>'}
          <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="save" ${m.busy ? 'disabled' : ''}>✅ Save</button>
        </div>
      </div>`;
    },
    input(t) {
      if (t.dataset.f === 'name') { f.name = t.value; const pv = document.getElementById('pv-name'); if (pv) pv.textContent = f.name || 'Name?'; }
    },
    enter() { /* Enter in the name field just closes the keyboard */ document.activeElement?.blur(); },
    async act(a, el) {
      if (a === 'emoji') { f.emoji = el.dataset.e; drawModal(); return; }
      if (a === 'price') { f.price = Math.max(0, f.price + Number(el.dataset.d)); drawModal(); return; }
      if (a === 'price-set') { f.price = Number(el.dataset.p); drawModal(); return; }
      if (a === 'cat') { f.categoryId = el.dataset.id || null; drawModal(); return; }
      if (a === 'photo-del') { f.photo = null; drawModal(); return; }
      if (a === 'photo-cam' || a === 'photo-pick') {
        const file = await readFile(a === 'photo-cam');
        if (!file) return;
        try { f.photo = await shrinkPhoto(file); } catch { toast("Couldn't read that photo"); return; }
        if (ui.modal === m) drawModal();
        return;
      }
      if (a === 'delete') {
        if (!confirm(`Remove “${item.name}” from the store?`)) return;
        if (mode === 'setup') { ui.draft.items = ui.draft.items.filter((i) => i.id !== item.id); ui.dirty = true; }
        else { await api('DELETE', `/api/stores/${store.id}/items/${item.id}`); refresh(); }
        closeModal(); render();
        return;
      }
      if (a === 'save') {
        if (!f.name.trim()) { toast('Give it a name first ✏️'); $modal.querySelector('[data-f=name]')?.focus(); return; }
        if (mode === 'setup') {
          const categoryId = f.categoryId || ui.draft.categories[0].id;
          if (item) Object.assign(item, f, { categoryId });
          else ui.draft.items.push({ id: `new${rid()}`, ...f, categoryId, addedBy: 'grownup' });
          ui.dirty = true;
          closeModal(); render();
          return;
        }
        m.busy = true; drawModal();
        try {
          const body = { ...f, name: f.name.trim() };
          if (item) await api('PUT', `/api/stores/${store.id}/items/${item.id}`, body);
          else await api('POST', `/api/stores/${store.id}/items`, body);
        } catch (e) { m.busy = false; drawModal(); throw e; }
        await loadAll();
        closeModal(); render();
        toast(item ? 'Changed! ✏️' : `${f.name.trim()} is for sale now! 🎉`);
      }
    },
  };
  openModal(m);
}

function newStoreModal() {
  openModal({
    render: () => `<div class="sheet">
      <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
      <h2>What kind of store?</h2>
      <div class="choices">${S.templates.map((t) => `<button class="choice" data-act="tpl" data-k="${t.key}"><span class="e">${esc(t.emoji)}</span>${esc(t.label)}</button>`).join('')}</div>
    </div>`,
    async act(a, el) {
      if (a !== 'tpl') return;
      const s = await api('POST', '/api/stores', { template: el.dataset.k }, { pin: true });
      S.stores.push(s);
      closeModal();
      location.hash = `#/setup/store/${s.id}`;
    },
  });
}

// ------------------------------------------------------------------ actions on the main view
const ACT = {
  // cashier
  cat(el) { ui.cat = el.dataset.id; render(); },
  add(el) { ui.cart.lines[el.dataset.id] = (ui.cart.lines[el.dataset.id] || 0) + 1; sfx.pop(); render(); },
  inc(el) { ui.cart.lines[el.dataset.id] = Math.min(99, (ui.cart.lines[el.dataset.id] || 0) + 1); render(); },
  dec(el) { const id = el.dataset.id; ui.cart.lines[id] = (ui.cart.lines[id] || 0) - 1; if (ui.cart.lines[id] <= 0) delete ui.cart.lines[id]; render(); },
  clear() { ui.cart.lines = {}; ui.customer = null; ui.askedCustomer = false; render(); },
  'pick-customer'() { customerModal(); },
  async send() {
    const s = storeById(route().a);
    if (!s) return;
    if (!ui.customer) { customerModal(() => ACT.send()); return; }
    const lines = cartLines(s).map((l) => ({ itemId: l.item.id, qty: l.q }));
    const order = await api('POST', '/api/orders', { storeId: s.id, customer: ui.customer.name, customerEmoji: ui.customer.emoji, lines });
    S.orders.push(order);
    sfx.newOrder();
    payModal(order, { fresh: true });
  },
  'new-item'() {
    const s = storeById(route().a);
    if (s) itemModal({ store: s, item: null, mode: 'kid', defaultCat: ui.cat !== 'all' ? ui.cat : null });
  },
  'edit-item'(el) {
    const s = storeById(route().a);
    const item = s?.items.find((i) => i.id === el.dataset.id);
    if (item) itemModal({ store: s, item, mode: 'kid' });
  },

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
  async cancel(el) {
    const o = orderOf(el);
    if (!confirm(`Cancel order #${o.number} for ${o.customer}?`)) return;
    await api('DELETE', `/api/orders/${o.id}`);
    S.orders = S.orders.filter((x) => x !== o);
    render();
  },

  // setup: PIN
  'pin-key'(el) { if (ui.pinEntry.length < 12) ui.pinEntry += el.dataset.k; render(); },
  'pin-back'() { ui.pinEntry = ui.pinEntry.slice(0, -1); render(); },
  async 'pin-ok'() {
    try {
      await api('POST', '/api/pin', { pin: ui.pinEntry });
      ui.pin = ui.pinEntry; ssSet('pin', ui.pin);
    } catch {
      document.getElementById('pinpad')?.classList.add('shake');
      await new Promise((r) => setTimeout(r, 400));
      toast('That PIN is not right');
    }
    ui.pinEntry = '';
    render();
  },
  lock() { ui.pin = null; ssSet('pin', null); ui.custDraft = null; location.hash = '#/'; },

  // setup: main
  'new-store'() { newStoreModal(); },
  'cust-add'() { ui.custDraft.push({ name: '', emoji: '🙂' }); ui.custDirty = true; render(); },
  'cust-del'(el) { ui.custDraft.splice(Number(el.dataset.i), 1); ui.custDirty = true; render(); },
  async 'cust-save'() {
    S.customers = await api('PUT', '/api/customers', ui.custDraft, { pin: true });
    ui.custDraft = clone(S.customers); ui.custDirty = false;
    render();
    toast('Customers saved ✅');
  },
  async 'clear-delivered'() {
    if (!confirm('Remove all delivered orders?')) return;
    await api('DELETE', '/api/orders?status=delivered', undefined, { pin: true });
    await loadAll(); render(); toast('Cleared 🧹');
  },
  async 'clear-all'() {
    if (!confirm('Remove EVERY order, including open ones? Order numbers start again at #1.')) return;
    await api('DELETE', '/api/orders?status=all', undefined, { pin: true });
    await loadAll(); render(); toast('All orders cleared');
  },

  // setup: store editor
  color(el) { ui.draft.color = el.dataset.c; ui.dirty = true; render(); },
  'cat-add'() { ui.draft.categories.push({ id: `c${rid()}`, name: 'New category', emoji: '🏷️' }); ui.dirty = true; render(); },
  'cat-del'(el) {
    const d = ui.draft;
    if (d.categories.length < 2) { toast('A store needs at least one category'); return; }
    const [gone] = d.categories.splice(Number(el.dataset.i), 1);
    const moved = d.items.filter((i) => i.categoryId === gone.id);
    moved.forEach((i) => { i.categoryId = d.categories[0].id; });
    if (moved.length) toast(`Moved ${moved.length} item(s) to ${d.categories[0].name}`);
    ui.dirty = true; render();
  },
  'item-add'() { itemModal({ store: null, item: null, mode: 'setup' }); },
  'item-edit'(el) { const item = ui.draft.items.find((i) => i.id === el.dataset.id); if (item) itemModal({ store: null, item, mode: 'setup' }); },
  async 'store-save'() {
    const saved = await api('PUT', `/api/stores/${ui.draft.id}`, ui.draft, { pin: true });
    S.stores = S.stores.map((s) => (s.id === saved.id ? saved : s));
    ui.draft = clone(saved); ui.dirty = false;
    render();
    toast('Saved ✅');
  },
  'editor-back'() {
    if (ui.dirty && !confirm('Leave without saving your changes?')) return;
    ui.draft = null; ui.dirty = false;
    location.hash = '#/setup';
  },
  async 'store-del'() {
    if (!confirm(`Delete ${ui.draft.name} and all its items? Orders already placed stay.`)) return;
    await api('DELETE', `/api/stores/${ui.draft.id}`, undefined, { pin: true });
    S.stores = S.stores.filter((s) => s.id !== ui.draft.id);
    ui.draft = null; ui.dirty = false;
    location.hash = '#/setup';
  },
};

function orderOf(el) {
  const id = el.closest('[data-order]')?.dataset.order;
  const o = S.orders.find((x) => x.id === id);
  if (!o) throw new Error('That order is gone');
  return o;
}

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !$app.contains(el)) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el, e)).catch((err) => toast(err.message));
});

function onField(e) {
  const t = e.target;
  const d = ui.draft;
  if (t.dataset.actChange === 'orders-store' && e.type === 'change') {
    lsSet('ordersStore', t.value);
    location.hash = `#/orders/${t.value}`;
    return;
  }
  if (t.dataset.d && d) {
    d[t.dataset.d] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) || 0 : t.value;
    ui.dirty = true;
  } else if (t.dataset.cat !== undefined && d) {
    d.categories[Number(t.dataset.cat)][t.dataset.k] = t.value;
    ui.dirty = true;
  } else if (t.dataset.cust !== undefined && ui.custDraft) {
    ui.custDraft[Number(t.dataset.cust)][t.dataset.k] = t.value;
    ui.custDirty = true;
    const b = document.getElementById('cust-save');
    if (b) b.disabled = false;
  }
}
$app.addEventListener('input', onField);
$app.addEventListener('change', onField);

window.addEventListener('hashchange', () => { if (ui.modal) closeModal(); window.scrollTo(0, 0); render(); });
window.addEventListener('beforeunload', (e) => { if (ui.dirty) e.preventDefault(); });

// ------------------------------------------------------------------ start
(async function start() {
  try {
    await loadAll();
    ui.seen = new Set(S.orders.map((o) => o.id));
    render();
  } catch {
    $app.innerHTML = '<div class="center-msg"><div class="emoji">😵</div><h2>Can\'t reach the store</h2><p class="muted">Check the Wi-Fi, then reload.</p><button class="btn primary" onclick="location.reload()">🔄 Try again</button></div>';
  }
  connect();
})();
