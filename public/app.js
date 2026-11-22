'use strict';
/* Play Store POS: tablet UI. Plain JS, no build step. */

const $app = document.getElementById('app');
const $modal = document.getElementById('modal');
const $toast = document.getElementById('toast');

const S = { stores: [], customers: [], templates: [], orders: [], banks: [], accounts: [], loaded: false };
const ui = {
  cart: { storeId: null, lines: {} }, // key -> { itemId, qty, recipe }
  customer: null,                      // { name, emoji, photo }
  askedCustomer: false,
  cat: 'all',
  pin: ssGet('pin'),
  pinEntry: '',
  sound: lsGet('sound') !== 'off',
  seen: null,
  fresh: new Set(),
  draft: null, dirty: false,           // store being edited in Setup
  modal: null,
};

const ITEM_EMOJI = ['🍎','🍌','🍓','🍇','🍉','🍊','🥕','🌽','🥦','🍕','🍔','🌭','🌮','🥪','🍟','🍿','🧀','🥚','🥞','🧇','🍪','🍩','🧁','🎂','🍰','🍫','🍬','🍭','🍦','☕','🍵','🧃','🥤','🧋','🥛','💧','🧸','🪀','🎈','🎨','🖍️','✏️','📚','📒','🎮','🕹️','🧩','🎲','🪁','⚽','🏀','🚗','🚂','✈️','🚀','🦖','🐶','🐱','🦄','🐉','💎','🪨','🐚','🌸','🌻','⭐','🌈','🔮','🪄','👑','💍','🎁','📱','💻','🎧','📷','🔋','🔧','🛠️','🧪','🔦','🏷️'];
const PEOPLE_EMOJI = ['🙂','😀','😎','🤠','🥳','🤖','👽','🦸','🧙','👸','🤴','👩','👨','👵','👴','🧒','👶','🐻','🐶','🐱','🦊','🐼'];
const COLORS = ['#ff7a45','#db2777','#9333ea','#2563eb','#0891b2','#16a34a','#ca8a04','#9a5b34','#dc2626','#475569'];
const DENOMS = [
  { v: 10000, label: '$100', kind: 'bill' }, { v: 5000, label: '$50', kind: 'bill' },
  { v: 2000, label: '$20', kind: 'bill' }, { v: 1000, label: '$10', kind: 'bill' },
  { v: 500, label: '$5', kind: 'bill' }, { v: 200, label: '$2', kind: 'bill' }, { v: 100, label: '$1', kind: 'bill' },
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

// Picture for an item, cart line or order line: photo > custom-order drawing > drawn icon > emoji.
function art(x, opts) {
  if (x.photo) return `<img class="art-img" src="${esc(x.photo)}" alt="" data-emoji="${esc(x.emoji || '🏷️')}" loading="lazy">`;
  if (x.builder) return Art.draw(x.builder, x.recipe, opts);
  if (x.icon && Art.ICONS[x.icon]) return Art.icon(x.icon);
  return esc(x.emoji);
}
// A person's face: their photo, else their emoji.
function face(c) {
  return c.photo ? `<img class="face-img" src="${esc(c.photo)}" alt="" data-emoji="${esc(c.emoji || '🙂')}">` : esc(c.emoji || '🙂');
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
const sumOf = (list) => list.reduce((a, v) => a + v, 0);
// Tap-the-money tray: bills, then coins, then what has been handed over so far (tap one to take it back).
function cashTray(given) {
  const btn = (d) => `<button class="money ${d.kind} c${d.v}" data-act="money" data-v="${d.v}">${d.label}</button>`;
  return `<div class="money-tray bills">${DENOMS.filter((d) => d.kind === 'bill').map(btn).join('')}</div>
    <div class="money-tray coins">${DENOMS.filter((d) => d.kind === 'coin').map(btn).join('')}</div>
    <div class="given">${given.length ? given.map((v, i) => `<button data-act="undo" data-i="${i}" aria-label="Take back">${moneyChip(DENOMS.find((d) => d.v === v))}</button>`).join('') : '<span class="muted">No money yet</span>'}</div>`;
}
// Handles the tray's taps for any modal with a `given` list. Returns true when it did.
function trayAct(m, a, el) {
  if (a === 'money') { m.given.push(Number(el.dataset.v)); sfx.pop(); drawModal(); return true; }
  if (a === 'undo') { m.given.splice(Number(el.dataset.i), 1); drawModal(); return true; }
  return false;
}
// 4-digit PIN pad used inside modals (card PINs).
function pinPad(entry) {
  return `<div class="pinpad inline"><div class="dots">${'●'.repeat(entry.length)}${'○'.repeat(Math.max(0, 4 - entry.length))}</div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-act="pk" data-k="${n}">${n}</button>`).join('')}
      <button data-act="pk-clear" aria-label="Clear">✕</button><button data-act="pk" data-k="0">0</button><button data-act="pk-back" aria-label="Delete">⌫</button></div></div>`;
}
function pinAct(m, a, el) {
  if (a === 'pk') { if (m.pin.length < 4) m.pin += el.dataset.k; sfx.pop(); drawModal(); return true; }
  if (a === 'pk-back') { m.pin = m.pin.slice(0, -1); drawModal(); return true; }
  if (a === 'pk-clear') { m.pin = ''; drawModal(); return true; }
  return false;
}

// ------------------------------------------------------------------ bank helpers
const bankById = (id) => S.banks.find((b) => b.id === id);
const CARD_DESIGNS = {
  bank: null, ocean: ['#38bdf8', '#1e3a8a'], grape: ['#c084fc', '#4c1d95'], lava: ['#fb923c', '#b91c1c'],
  forest: ['#4ade80', '#14532d'], gold: ['#fcd34d', '#b45309'], candy: ['#f9a8d4', '#be185d'], night: ['#475569', '#020617'],
};
const BANK_EMOJI = ['🏦', '🐷', '💰', '🪙', '💎', '🦖', '🦄', '🚀', '🌈', '⭐', '🐉', '🏰', '🐻', '🦁', '🍀', '👑'];
function cardBg(design, bank) {
  const d = CARD_DESIGNS[design];
  const c = bank?.color || '#0f766e';
  const [c1, c2] = d || [c, `color-mix(in srgb, ${c} 45%, #000)`];
  return `--c1:${c1};--c2:${c2}`;
}
const allCards = () => S.accounts.flatMap((account) => account.cards.map((card) => ({ account, card })));
// A drawn debit card. `full` shows the whole number (at the bank); elsewhere only the last 4.
function debitCard(account, card, { full = false, small = false, bank = null } = {}) {
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
function when(iso) {
  const d = new Date(iso);
  if (Date.now() - d < 86400000) return ago(iso);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// In-app yes/no box. The browser's built-in confirm box is silently blocked in some places
// (iframes, kiosk and home-screen web views), which made delete buttons do nothing.
function askConfirm(msg, { yes = 'Yes', no = 'No', danger = false } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'ask';
    el.innerHTML = `<div class="sheet" role="alertdialog" aria-modal="true"><p class="ask-msg">${esc(msg)}</p>
      <div class="row split"><button class="btn" data-a="no">${esc(no)}</button><button class="btn ${danger ? 'bad' : 'primary'}" data-a="yes">${esc(yes)}</button></div></div>`;
    const done = (v) => { el.remove(); window.removeEventListener('hashchange', off); document.removeEventListener('keydown', key, true); resolve(v); };
    const off = () => done(false);
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b) done(b.dataset.a === 'yes'); else if (e.target === el) done(false);
    });
    window.addEventListener('hashchange', off);
    document.addEventListener('keydown', key, true);
    document.body.appendChild(el);
    el.querySelector('[data-a=yes]').focus();
  });
}

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
    const err = new Error(data.error || `Something went wrong (${r.status})`);
    err.data = data;
    throw err;
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
  buzz: () => tone([220, 175], 0.25, 'square', 0.2),
};

// ------------------------------------------------------------------ data + live sync
async function loadAll() {
  const [st, od] = await Promise.all([api('GET', '/api/state'), api('GET', '/api/orders')]);
  S.stores = st.stores; S.customers = st.customers; S.templates = st.templates; S.orders = od.orders;
  S.banks = st.banks || []; S.accounts = st.accounts || [];
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
// Only the first draw animates; redraws keep every scroll position so taps don't flash or jump.
function openModal(m) {
  ui.modal = m; $modal.hidden = false;
  $modal.classList.add('opening');
  drawModal();
}
$modal.addEventListener('animationend', (e) => { if (e.target.classList.contains('sheet')) $modal.classList.remove('opening'); });
function drawModal() {
  if (!ui.modal) return;
  const keep = [...$modal.querySelectorAll('.sheet, [data-scroll]')].map((el) => [el.dataset.scroll || 'sheet', el.scrollTop]);
  $modal.innerHTML = ui.modal.render();
  for (const [k, top] of keep) {
    const el = k === 'sheet' ? $modal.querySelector('.sheet') : $modal.querySelector(`[data-scroll="${k}"]`);
    if (el) el.scrollTop = top;
  }
}
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
  else if (r.view === 'people') html = viewPeople();
  else if (r.view === 'bank') html = viewBank(r.a);
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
      <a class="big people" href="#/people">🙂<span>People</span></a>
      <a class="big bank" href="#/bank">🏦<span>Bank</span></a>
      <a class="big setup" href="#/setup">⚙️<span>Setup</span></a>
    </div>
  </div>`;
}

function viewPeople() {
  setAccent('#9333ea');
  return bar('🙂 People') + `<div class="setup">
    <p class="muted center">Tap someone to change their name or picture.</p>
    <div class="people-grid">
      ${S.customers.map((c) => `<button class="person" data-act="person" data-id="${c.id}"><span class="pic">${face(c)}</span><span>${esc(c.name)}</span></button>`).join('')}
      <button class="person add" data-act="person-add"><span class="pic">➕</span><span>Add someone</span></button>
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

// Custom orders (builder items) get one cart line per recipe; everything else one line per item.
const lineKey = (item, recipe) => (item.builder ? `${item.id}|${Art.recipeKey(item.builder, recipe || item.recipe || Art.SAMPLE[item.builder])}` : item.id);
function addLine(item, recipe = null, n = 1) {
  const key = lineKey(item, recipe);
  const l = ui.cart.lines[key] || { itemId: item.id, qty: 0, recipe: item.builder ? Art.normRecipe(item.builder, recipe || item.recipe || Art.SAMPLE[item.builder]) : null };
  l.qty = Math.min(99, l.qty + n);
  ui.cart.lines[key] = l;
}
function cartLines(s) {
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
function totals(s, lines) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.q, 0);
  const tax = Math.round((subtotal * s.taxRate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

function viewCashier(id) {
  const s = storeById(id);
  if (!s) { setAccent(); return bar('Store not found', '', '#/cashier') + `<div class="center-msg"><div class="emoji">🤔</div><p>That store is gone.</p></div>`; }
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
    return `<div class="tile-wrap">
      <button class="tile ${q ? 'in-cart' : ''} ${make ? 'make' : ''}" data-act="add" data-id="${i.id}">
        ${q ? `<span class="qty">${q}</span>` : ''}
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
    `<a class="btn" href="#/orders/${s.id}">👨‍🍳 <span>Orders</span>${open ? `<b>${open}</b>` : ''}</a>`) +
    tabs +
    `<div class="cashier-body">
      <section class="grid">
        ${tiles}
        <button class="tile add" data-act="new-item"><span class="art">➕</span><span class="name">Add my item</span></button>
      </section>
      ${cartHtml(s, who)}
    </div></div>`;
}

function cartHtml(s, who) {
  const lines = cartLines(s);
  const t = totals(s, lines);
  return `<aside class="cart">
    <h3>🛒 Order for <button data-act="pick-customer">${who}</button></h3>
    ${lines.length ? `<ul>${lines.map((l) => `<li>
        <span class="art">${art(l.pic)}</span>
        <span class="nm">${esc(l.name)}<small>${money(l.price * l.q)}${l.recipe ? ` · <button class="line-edit" data-act="edit-line" data-k="${esc(l.key)}">✏️ change</button>` : ''}</small></span>
        <span class="stepper"><button data-act="dec" data-k="${esc(l.key)}" aria-label="One less">−</button><span>${l.q}</span><button data-act="inc" data-k="${esc(l.key)}" aria-label="One more">+</button></span>
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
    <header><span class="num">#${o.number}</span><span class="who"><span class="face">${face({ photo: o.customerPhoto, emoji: o.customerEmoji })}</span> ${esc(o.customer)}</span>
      <span class="ago">${sel === 'all' && s ? `${esc(s.emoji)} ` : ''}${ago(o.createdAt)}</span></header>
    <ul>${o.lines.map((l, i) => `<li class="${l.done ? 'done' : ''} ${l.recipe ? 'custom' : ''}"><button data-act="tick" data-i="${i}" ${o.status === 'delivered' ? 'disabled' : ''}>
        <span class="art">${art(l)}</span><span class="nm">${l.qty > 1 ? `${l.qty} × ` : ''}${esc(l.name)}${l.recipe ? `<small>${esc(Art.detailOf(l.builder, l.recipe))}</small>` : ''}</span><span class="tick">${l.done ? '✓' : ''}</span>
      </button></li>`).join('')}</ul>
    <div class="foot">
      ${o.paid ? `<span class="pill paid">✅ ${o.paidWith?.method === 'card' ? `💳 ••${esc(o.paidWith.last4)}` : 'Paid'} ${money(o.total)}</span>` : `<button class="pill unpaid" data-act="pay">💸 Not paid · ${money(o.total)}</button>`}
      <span class="grow"></span>
      <button class="btn ghost icon" data-act="cancel" aria-label="${o.status === 'delivered' ? 'Remove order' : 'Cancel order'}">🗑️</button>
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
      <div class="dots">${ui.pinEntry ? '●'.repeat(ui.pinEntry.length) : '<span class="hint">Enter the PIN</span>'}</div>
      <div class="keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-act="pin-key" data-k="${n}">${n}</button>`).join('')}
        <button data-act="pin-back" aria-label="Delete">⌫</button><button data-act="pin-key" data-k="0">0</button><button data-act="pin-ok">OK</button>
      </div></div>`;
  }
  if (r.a === 'store' && r.b) return viewStoreEditor(r.b);
  ui.draft = null;
  const open = S.orders.filter((o) => o.status !== 'delivered').length;
  const delivered = S.orders.length - open;
  return bar('⚙️ Setup', '<button class="btn" data-act="lock">🔒 Lock</button>') + `<div class="setup">
    <section class="panel">
      <h3><span class="grow">🏪 Stores</span><button class="btn primary" data-act="new-store">➕ New store</button></h3>
      <div class="list">${S.stores.length ? S.stores.map((s) => `<div class="list-row">
          <span class="e">${esc(s.emoji)}</span>
          <span class="grow">${esc(s.name)}<small>${s.items.length} items · ${s.taxRate ? `${s.taxRate}% tax` : 'no tax'} · ${s.playMoney ? 'play money' : 'tap to pay'} · cards${s.payoutAccountId ? ' → bank' : ''}</small></span>
          <a class="btn" href="#/cashier/${s.id}">🧾 Open</a>
          <a class="btn primary" href="#/setup/store/${s.id}">✏️ Edit</a>
        </div>`).join('') : '<p class="muted">No stores yet. Tap “New store” and pick a template.</p>'}</div>
    </section>
    <section class="panel">
      <h3><span class="grow">🙂 People</span><a class="btn" href="#/people">Manage people</a></h3>
      <p class="muted">Customers, with their names, emoji and photos, live on the home screen under <b>People</b>, so kids can add them without the PIN.</p>
    </section>
    <section class="panel">
      <h3><span class="grow">🏦 Bank</span><a class="btn" href="#/bank">Open the bank</a></h3>
      <p class="muted">Bank accounts and debit cards live on the home screen under <b>Bank</b>. To send a store's card money into someone's account, edit the store and pick an account under “Card payments go into”.</p>
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
      <span class="grow">${esc(i.name)}<small>${i.builder ? `${i.recipe ? '' : 'from '}${money(i.price)} · ${i.recipe ? 'preset' : 'build your own'} ${i.builder}` : money(i.price)}${i.wasPrice > i.price ? ` · sale, was ${money(i.wasPrice)}` : ''}${i.addedBy === 'kid' ? ' · ⭐ added at the register' : ''}</small></span>
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
        <div class="field">Look<div class="row">
          ${[['plain', '🏪 Plain'], ['electronics', '📺 Electronics store']].map(([k, label]) => `<button class="btn ${(d.theme || 'plain') === k ? 'primary' : ''}" data-act="theme" data-t="${k}">${label}</button>`).join('')}
        </div></div>
        <label class="toggle"><input type="checkbox" data-d="playMoney" ${d.playMoney ? 'checked' : ''}> 💵 Pay with play money (bills, coins and change)</label>
        <label class="field">💳 Card payments go into
          <select data-d="payoutAccountId">
            <option value="">Nobody's account (the money just leaves the bank)</option>
            ${S.accounts.map((a) => `<option value="${a.id}" ${d.payoutAccountId === a.id ? 'selected' : ''}>${esc(a.owner.name)} · ${esc(bankById(a.bankId)?.name || 'Bank')}</option>`).join('')}
          </select></label>
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
        <div class="row"><button class="btn" data-act="store-reset">🔄 Fresh menu from a template…</button>
          <button class="btn danger" data-act="store-del">🗑️ Delete this store</button></div>
        <p class="muted">A fresh menu replaces the categories and items with a template's. Items Ethan added himself are kept.</p>
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
      ui.customer = { name: c.name, emoji: c.emoji, photo: c.photo || null };
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
  const later = `<button class="btn" data-act="later">${fresh ? '💸 Pay later' : 'Not now'}</button>`;
  const m = {
    sticky: true, step: 'pay', method: 'cash', given: [], change: 0,
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
          <h2>Approved! Order #${order.number} is paid</h2>
          <div class="change-box"><div class="card-slot">${debitCard(m.card.account, m.card.card, { small: true })}</div>
            <div>Paid <b>${money(order.total)}</b> with the card ending in <b>${esc(order.paidWith.last4)}</b></div>
            ${r.balanceLeft != null ? `<div>${esc(r.owner)} has <b>${money(r.balanceLeft)}</b> left in the bank 🏦</div>` : ''}</div>
          <button class="btn huge primary" data-act="close">👍 Done</button>
        </div>`;
      }
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
        ${fresh ? `<h2>🚀 Order #${order.number} sent to the kitchen!</h2>` : `<button class="btn icon close" data-act="close" aria-label="Close">✕</button><h2>Pay for order #${order.number}</h2>`}
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
      } catch (e) {
        await wait;
        m.error = e; m.step = 'declined';
        sfx.buzz();
      }
      if (ui.modal === m) drawModal();
    },
    async act(a, el) {
      if (trayAct(m, a, el)) return;
      if (pinAct(m, a, el)) { if (m.step === 'card-pin' && m.pin.length === 4) await m.charge(); return; }
      if (a === 'exact') { m.given = breakdown(order.total).flatMap((p) => Array(p.n).fill(p.d.v)); drawModal(); return; }
      if (a === 'method') { m.method = el.dataset.m; drawModal(); return; }
      if (a === 'card') {
        m.card = allCards().find((x) => x.card.id === el.dataset.id);
        if (!m.card) return;
        m.pin = '';
        sfx.pop();
        if (m.card.card.hasPin) { m.step = 'card-pin'; drawModal(); } else await m.charge();
        return;
      }
      if (a === 'pin-ok') { await m.charge(); return; }
      if (a === 'retry') {
        const wrongPin = m.error?.data?.code === 'pin' && m.step === 'declined';
        m.error = null; m.pin = '';
        m.step = wrongPin ? 'card-pin' : 'pay'; m.method = 'card';
        drawModal(); return;
      }
      if (a === 'use-cash') { m.error = null; m.step = 'pay'; m.method = 'cash'; drawModal(); return; }
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

// ------------------------------------------------------------------ bank
function viewBank(sel) {
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
    </div>`;
}

function bankModal(bank) {
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

function openAccountModal(bank) {
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

function accountModal(id) {
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
        </div>
        <h3>💳 Cards</h3>
        ${a.cards.length ? `<div class="card-list">${a.cards.map((c) => `<div class="card-item">${debitCard(a, c, { full: true })}
            <div class="row">
              <button class="btn" data-act="freeze" data-id="${c.id}">${c.frozen ? '☀️ Unfreeze' : '❄️ Freeze'}</button>
              <button class="btn" data-act="card-pin" data-id="${c.id}">🔑 PIN</button>
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
  const custom = !!item?.builder; // builder items price themselves from their recipe
  const f = item
    ? { name: item.name, emoji: item.emoji, icon: item.icon || null, photo: item.photo, price: item.price, wasPrice: item.wasPrice || null, categoryId: item.categoryId }
    : { name: '', emoji: '⭐', icon: null, photo: null, price: 100, wasPrice: null, categoryId: defaultCat || (mode === 'setup' ? cats[0]?.id : null) };
  const catChips = () => {
    const chips = mode === 'kid' && !hasMyStuff ? [{ id: null, name: 'My Stuff', emoji: '⭐' }, ...cats] : cats;
    if (chips.length < 2) return '';
    const sel = f.categoryId ?? (mode === 'kid' ? (cats.find((c) => c.name.toLowerCase() === 'my stuff')?.id ?? null) : null);
    return `<div class="field">Where does it go?<div class="row">${chips.map((c) =>
      `<button class="btn ${c.id === sel ? 'primary' : ''}" data-act="cat" data-id="${c.id ?? ''}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div></div>`;
  };
  const pv = () => (custom ? { builder: item.builder, recipe: item.recipe } : f);
  const m = {
    busy: false,
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${item ? '✏️ Change item' : mode === 'kid' ? '⭐ Add my item' : '➕ New item'}</h2>
        <div class="preview"><div class="tile"><span class="art">${art(pv())}</span><span class="name" id="pv-name">${esc(f.name || 'Name?')}</span><span class="price">${money(f.price)}</span></div></div>
        ${custom ? `<p class="muted center">This is a custom ${item.builder}: its picture and price come from what goes in it.</p>` : `
        <div class="row" style="justify-content:center">
          <button class="btn" data-act="photo-cam">📷 Take a photo</button>
          <button class="btn" data-act="photo-pick">🖼️ Pick a photo</button>
          ${f.photo ? '<button class="btn danger" data-act="photo-del">No photo</button>' : ''}
        </div>`}
        <label class="field">What is it called?<input data-f="name" value="${esc(f.name)}" maxlength="40" autocomplete="off" placeholder="My cool rock"></label>
        ${custom ? '' : `
        <div class="field">${f.photo ? 'Picture (shown if the photo goes missing)' : 'Pick a picture'}
          <div class="emoji-grid" data-scroll="pics">
            ${Art.ICON_KEYS.map((k) => `<button class="ic ${f.icon === k ? 'on' : ''}" data-act="icon" data-k="${k}" aria-label="${esc(Art.ICONS[k].label)}">${Art.icon(k)}</button>`).join('')}
            ${ITEM_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${!f.icon && e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}
          </div></div>
        <div class="field">How much does it cost?
          <div class="price-pad">
            <button class="btn" data-act="price" data-d="-100">−$1</button><button class="btn" data-act="price" data-d="-25">−25¢</button>
            <span class="shown">${money(f.price)}</span>
            <button class="btn" data-act="price" data-d="25">+25¢</button><button class="btn" data-act="price" data-d="100">+$1</button><button class="btn" data-act="price" data-d="500">+$5</button>
          </div>
          <div class="row" style="justify-content:center">${[0, 50, 100, 200, 500, 1000, 2000].map((p) => `<button class="btn ghost" data-act="price-set" data-p="${p}">${p ? money(p) : 'Free'}</button>`).join('')}</div>
        </div>
        ${mode === 'setup' ? `<label class="field">On sale? Old price in $ (leave empty for no sale)
          <input data-f="was" type="number" inputmode="decimal" min="0" step="0.01" value="${f.wasPrice ? (f.wasPrice / 100).toFixed(2) : ''}" placeholder="e.g. 59.99"></label>` : ''}`}
        ${catChips()}
        <div class="row split">
          ${item ? '<button class="btn danger" data-act="delete">🗑️ Remove it</button>' : '<span></span>'}
          <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="save" ${m.busy ? 'disabled' : ''}>✅ Save</button>
        </div>
      </div>`;
    },
    input(t) {
      if (t.dataset.f === 'name') { f.name = t.value; const el = document.getElementById('pv-name'); if (el) el.textContent = f.name || 'Name?'; }
      if (t.dataset.f === 'was') f.wasPrice = Math.round(parseFloat(t.value) * 100) || null;
    },
    enter() { /* Enter in the name field just closes the keyboard */ document.activeElement?.blur(); },
    async act(a, el) {
      if (a === 'emoji') { f.emoji = el.dataset.e; f.icon = null; drawModal(); return; }
      if (a === 'icon') { f.icon = el.dataset.k; drawModal(); return; }
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
        if (!(await askConfirm(`Remove “${item.name}” from the store?`, { yes: '🗑️ Remove', danger: true }))) return;
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

// Custom sandwich / drink: stack layers into a labelled cut-away picture.
const EMPTY_RECIPE = {
  sandwich: { bread: 'white', layers: [], toasted: false },
  drink: { size: 'm', iced: false, layers: [], toppings: [] },
};
function builderModal({ store, item, recipe = null, replaceKey = null }) {
  const B = item.builder;
  const def = Art.BUILDERS[B];
  let rec = Art.normRecipe(B, recipe || EMPTY_RECIPE[B]);
  const m = {
    newIndex: null,
    render() {
      const ni = m.newIndex; m.newIndex = null; // the drop-in animation plays once
      const classic = Art.classicOf(B, rec);
      const full = rec.layers.length >= def.max;
      const chips = B === 'sandwich'
        ? `<div class="field">Bread<div class="row">${Object.entries(def.breads).map(([k, b]) =>
            `<button class="btn chip ${rec.bread === k ? 'primary' : ''}" data-act="bread" data-k="${k}"><i class="dot" style="background:${rec.toasted ? b.toast : b.crumb};border-color:${b.crust}"></i>${b.name}</button>`).join('')}
            <button class="btn chip ${rec.toasted ? 'warn' : ''}" data-act="toast">🔥 ${rec.toasted ? 'Toasted!' : 'Toast it'}</button></div></div>`
        : `<div class="field">Size<div class="row">${Object.entries(def.sizes).map(([k, z]) =>
            `<button class="btn chip ${rec.size === k ? 'primary' : ''}" data-act="size" data-k="${k}">${z.name} · ${money(z.price)}</button>`).join('')}
            <button class="btn chip ${!rec.iced ? 'primary' : ''}" data-act="iced" data-v="0">♨️ Hot</button>
            <button class="btn chip ${rec.iced ? 'primary' : ''}" data-act="iced" data-v="1">🧊 Iced</button></div></div>`;
      const layerBtn = (id, L) => `<button class="ing" data-act="layer" data-id="${id}" ${full ? 'disabled' : ''}>
          <span class="ing-art">${Art.layerArt(B, id)}</span><span>${esc(B === 'drink' && rec.iced && L.iced ? L.iced : L.name)}</span>${L.price ? `<small>+${money(L.price)}</small>` : ''}</button>`;
      const toppings = B === 'drink' ? `<div class="field">On top<div class="ings">${Object.entries(def.toppings).map(([id, t]) =>
          `<button class="ing ${rec.toppings.includes(id) ? 'on' : ''}" data-act="topping" data-id="${id}"><span class="ing-art">${Art.layerArt(B, id)}</span><span>${esc(t.name)}</span><small>+${money(t.price)}</small></button>`).join('')}</div></div>` : '';
      return `<div class="sheet builder">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${B === 'sandwich' ? '🥪 Build a sandwich' : '☕ Make a drink'}</h2>
        <div class="stage-wrap">
          <div class="stage">${Art.draw(B, rec, { labels: true, interactive: true, newIndex: ni })}</div>
          <div class="stage-side">
            <div class="drink-name">${esc(Art.nameOf(B, rec))}</div>
            ${classic?.say ? `<div class="say">[${esc(classic.say)}]</div>` : ''}
            ${classic && rec.layers.length ? `<div class="classic">✨ It's a ${esc(classic.name)}!</div>` : ''}
            <div class="sticker">${money(Art.priceOf(B, rec))}</div>
            <div class="muted small">${rec.layers.length ? 'Tap a layer in the picture to take it off.' : B === 'sandwich' ? 'Tap the fillings to stack them up!' : 'Tap the layers to fill the cup!'}</div>
          </div>
        </div>
        ${chips}
        <div class="field">${B === 'sandwich' ? 'Fillings' : 'Layers'} <span class="muted small">(${rec.layers.length}/${def.max})</span>
          <div class="ings">${Object.entries(def.layers).map(([id, L]) => layerBtn(id, L)).join('')}</div></div>
        ${toppings}
        <div class="row split">
          <span class="row"><button class="btn" data-act="undo" ${rec.layers.length ? '' : 'disabled'}>↩️ Undo</button>
          <button class="btn ghost" data-act="restart" ${rec.layers.length ? '' : 'disabled'}>Start over</button></span>
          <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="add-built">${replaceKey ? '✅ Save changes' : '✅ Add to order'}</button>
        </div>
      </div>`;
    },
    async act(a, el) {
      const set = (next) => { rec = Art.normRecipe(B, next); drawModal(); };
      if (a === 'layer') {
        if (rec.layers.length >= def.max) { toast(B === 'drink' ? "The cup's full! ☕" : "That's as tall as it gets! 🥪"); return; }
        m.newIndex = rec.layers.length;
        sfx.pop();
        set({ ...rec, layers: [...rec.layers, el.dataset.id] });
        return;
      }
      if (a === 'rm-layer') { const layers = [...rec.layers]; layers.splice(Number(el.dataset.i), 1); set({ ...rec, layers }); return; }
      if (a === 'undo') { set({ ...rec, layers: rec.layers.slice(0, -1) }); return; }
      if (a === 'restart') { set({ ...rec, layers: [], ...(B === 'drink' ? { toppings: [] } : {}) }); return; }
      if (a === 'bread') { set({ ...rec, bread: el.dataset.k }); return; }
      if (a === 'toast') { set({ ...rec, toasted: !rec.toasted }); return; }
      if (a === 'size') { set({ ...rec, size: el.dataset.k }); return; }
      if (a === 'iced') { set({ ...rec, iced: el.dataset.v === '1' }); return; }
      if (a === 'topping') {
        const id = el.dataset.id;
        set({ ...rec, toppings: rec.toppings.includes(id) ? rec.toppings.filter((t) => t !== id) : [...rec.toppings, id] });
        return;
      }
      if (a === 'add-built') {
        if (!rec.layers.length && !(await askConfirm(B === 'drink' ? 'The cup is empty. Sell an empty cup?' : 'Just bread? Sell it anyway?'))) return;
        let n = 1;
        if (replaceKey) { n = ui.cart.lines[replaceKey]?.qty || 1; delete ui.cart.lines[replaceKey]; }
        addLine(item, rec, n);
        sfx.pop();
        closeModal(); render();
      }
    },
  };
  openModal(m);
}

function storePickerModal(view) {
  const tile = (href, color, emoji, name) => `<button class="choice store-choice" style="--c:${esc(color)}" data-act="go" data-h="${esc(href)}"><span class="e">${esc(emoji)}</span>${esc(name)}</button>`;
  openModal({
    render: () => `<div class="sheet">
      <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
      <h2>${view === 'orders' ? 'Which orders?' : 'Which store is open?'}</h2>
      <div class="choices">
        ${view === 'orders' ? tile('#/orders/all', '#475569', '🏪', 'All stores') : ''}
        ${S.stores.map((s) => tile(view === 'orders' ? `#/orders/${s.id}` : `#/cashier/${s.id}`, s.color, s.emoji, s.name)).join('')}
      </div></div>`,
    act(a, el) {
      if (a !== 'go') return;
      if (view === 'orders') lsSet('ordersStore', el.dataset.h.split('/').pop());
      closeModal();
      location.hash = el.dataset.h;
    },
  });
}

function templateModal(title, onPick) {
  openModal({
    render: () => `<div class="sheet">
      <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
      <h2>${title}</h2>
      <div class="choices">${S.templates.map((t) => `<button class="choice" data-act="tpl" data-k="${t.key}"><span class="e">${esc(t.emoji)}</span>${esc(t.label)}</button>`).join('')}</div>
    </div>`,
    async act(a, el) { if (a === 'tpl') await onPick(el.dataset.k); },
  });
}

function newStoreModal() {
  templateModal('What kind of store?', async (key) => {
    const s = await api('POST', '/api/stores', { template: key }, { pin: true });
    S.stores.push(s);
    closeModal();
    location.hash = `#/setup/store/${s.id}`;
  });
}

// Add or change a person (customer) from the People page. No PIN.
function personModal(person) {
  const f = person ? { name: person.name, emoji: person.emoji, photo: person.photo || null } : { name: '', emoji: '🙂', photo: null };
  const m = {
    busy: false,
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${person ? `✏️ ${esc(person.name)}` : '➕ Someone new'}</h2>
        <div class="preview"><div class="person big"><span class="pic">${face(f)}</span><span id="pv-name">${esc(f.name || 'Name?')}</span></div></div>
        <div class="row" style="justify-content:center">
          <button class="btn" data-act="photo-cam">📷 Take a photo</button>
          <button class="btn" data-act="photo-pick">🖼️ Pick a photo</button>
          ${f.photo ? '<button class="btn danger" data-act="photo-del">No photo</button>' : ''}
        </div>
        <label class="field">Name<input data-f="name" value="${esc(f.name)}" maxlength="30" autocomplete="off" placeholder="Name"></label>
        <div class="field">${f.photo ? 'Emoji (shown if the photo goes missing)' : 'Pick a face'}
          <div class="emoji-grid" data-scroll="faces">${PEOPLE_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
        <div class="row split">
          ${person ? '<button class="btn danger" data-act="delete">🗑️ Remove</button>' : '<span></span>'}
          <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="save" ${m.busy ? 'disabled' : ''}>✅ Save</button>
        </div>
      </div>`;
    },
    input(t) { if (t.dataset.f === 'name') { f.name = t.value; const el = document.getElementById('pv-name'); if (el) el.textContent = f.name || 'Name?'; } },
    enter() { document.activeElement?.blur(); },
    async act(a, el) {
      if (a === 'emoji') { f.emoji = el.dataset.e; drawModal(); return; }
      if (a === 'photo-del') { f.photo = null; drawModal(); return; }
      if (a === 'photo-cam' || a === 'photo-pick') {
        const file = await readFile(a === 'photo-cam');
        if (!file) return;
        try { f.photo = await shrinkPhoto(file); } catch { toast("Couldn't read that photo"); return; }
        if (ui.modal === m) drawModal();
        return;
      }
      if (a === 'delete') {
        if (!(await askConfirm(`Remove ${person.name}?`, { yes: '🗑️ Remove', danger: true }))) return;
        await api('DELETE', `/api/customers/${person.id}`);
        await loadAll(); closeModal(); render();
        return;
      }
      if (a === 'save') {
        if (!f.name.trim()) { toast('Type their name first ✏️'); return; }
        m.busy = true; drawModal();
        try {
          const body = { ...f, name: f.name.trim() };
          if (person) await api('PUT', `/api/customers/${person.id}`, body);
          else await api('POST', '/api/customers', body);
        } catch (e) { m.busy = false; drawModal(); throw e; }
        await loadAll(); closeModal(); render();
        toast(person ? 'Saved ✅' : `Hi ${f.name.trim()}! 👋`);
      }
    },
  };
  openModal(m);
}

// ------------------------------------------------------------------ actions on the main view
const ACT = {
  // cashier
  cat(el) { ui.cat = el.dataset.id; render(); },
  add(el) {
    const s = storeById(route().a);
    const item = s?.items.find((i) => i.id === el.dataset.id);
    if (!item) return;
    if (item.builder && !item.recipe) { builderModal({ store: s, item }); return; }
    addLine(item); sfx.pop(); render();
  },
  inc(el) { const l = ui.cart.lines[el.dataset.k]; if (l) l.qty = Math.min(99, l.qty + 1); render(); },
  dec(el) { const k = el.dataset.k; const l = ui.cart.lines[k]; if (l && --l.qty <= 0) delete ui.cart.lines[k]; render(); },
  'edit-line'(el) {
    const s = storeById(route().a);
    const l = ui.cart.lines[el.dataset.k];
    const item = l && s?.items.find((i) => i.id === l.itemId);
    if (item?.builder) builderModal({ store: s, item, recipe: l.recipe, replaceKey: el.dataset.k });
  },
  'switch-store'() { storePickerModal(route().view === 'orders' ? 'orders' : 'cashier'); },
  clear() { ui.cart.lines = {}; ui.customer = null; ui.askedCustomer = false; render(); },
  'pick-customer'() { customerModal(); },
  async send() {
    const s = storeById(route().a);
    if (!s) return;
    if (!ui.customer) { customerModal(() => ACT.send()); return; }
    const lines = cartLines(s).map((l) => ({ itemId: l.item.id, qty: l.q, recipe: l.recipe || undefined }));
    const order = await api('POST', '/api/orders', { storeId: s.id, customer: ui.customer.name, customerEmoji: ui.customer.emoji, customerPhoto: ui.customer.photo || null, lines });
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
    const card = o.paidWith?.method === 'card' && o.status !== 'delivered';
    const msg = o.status === 'delivered' ? `Take order #${o.number} for ${o.customer} off the list?`
      : `Cancel order #${o.number} for ${o.customer}?${card ? ` The ${money(o.total)} goes back to their card.` : ''}`;
    if (!(await askConfirm(msg, { yes: o.status === 'delivered' ? '🗑️ Remove' : '🗑️ Cancel order', no: 'Keep it', danger: true }))) return;
    const r = await api('DELETE', `/api/orders/${o.id}`);
    S.orders = S.orders.filter((x) => x.id !== o.id);
    if (r.refunded) { toast(`↩️ ${money(o.total)} went back to the card`); await loadAll(); }
    render();
  },

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
  lock() { ui.pin = null; ssSet('pin', null); location.hash = '#/'; },

  // people (home screen, no PIN)
  person(el) { const c = S.customers.find((x) => x.id === el.dataset.id); if (c) personModal(c); },
  'person-add'() { personModal(null); },

  // setup: main
  'new-store'() { newStoreModal(); },
  async 'clear-delivered'() {
    if (!(await askConfirm('Remove all delivered orders?', { yes: '🧹 Clear' }))) return;
    await api('DELETE', '/api/orders?status=delivered', undefined, { pin: true });
    await loadAll(); render(); toast('Cleared 🧹');
  },
  async 'clear-all'() {
    if (!(await askConfirm('Remove EVERY order, including open ones? Order numbers start again at #1.', { yes: 'Clear all', danger: true }))) return;
    await api('DELETE', '/api/orders?status=all', undefined, { pin: true });
    await loadAll(); render(); toast('All orders cleared');
  },

  // setup: store editor
  color(el) { ui.draft.color = el.dataset.c; ui.dirty = true; render(); },
  theme(el) { ui.draft.theme = el.dataset.t; ui.dirty = true; render(); },
  async 'store-reset'() {
    if (ui.dirty && !(await askConfirm('You have unsaved changes. Throw them away?', { danger: true }))) return;
    const id = ui.draft.id;
    templateModal('Fresh menu from which template?', async (key) => {
      if (!(await askConfirm('Replace all the categories and items? Items added at the register are kept.', { yes: 'Replace', danger: true }))) return;
      const saved = await api('POST', `/api/stores/${id}/reset`, { template: key }, { pin: true });
      S.stores = S.stores.map((s) => (s.id === saved.id ? saved : s));
      ui.draft = clone(saved); ui.dirty = false;
      closeModal(); render();
      toast('Fresh menu ✅');
    });
  },
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
  async 'editor-back'() {
    if (ui.dirty && !(await askConfirm('Leave without saving your changes?', { yes: 'Leave', no: 'Stay', danger: true }))) return;
    ui.draft = null; ui.dirty = false;
    location.hash = '#/setup';
  },
  async 'store-del'() {
    if (!(await askConfirm(`Delete ${ui.draft.name} and all its items? Orders already placed stay.`, { yes: '🗑️ Delete', danger: true }))) return;
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
  if (t.dataset.d && d) {
    d[t.dataset.d] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) || 0 : t.value;
    ui.dirty = true;
  } else if (t.dataset.cat !== undefined && d) {
    d.categories[Number(t.dataset.cat)][t.dataset.k] = t.value;
    ui.dirty = true;
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
