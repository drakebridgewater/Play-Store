// Shared state, helpers, server calls, sounds, live sync and modal plumbing.
// Every app module imports what it needs from here.

export const Art = globalThis.Art; // public/art.js, loaded as a plain script before the modules

export const $app = document.getElementById('app');
export const $modal = document.getElementById('modal');
export const $toast = document.getElementById('toast');

export const S = { stores: [], customers: [], templates: [], orders: [], banks: [], accounts: [], hub: { hidden: [] }, loaded: false };
export const ui = {
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

export const ITEM_EMOJI = ['🍎','🍌','🍓','🍇','🍉','🍊','🥕','🌽','🥦','🍕','🍔','🌭','🌮','🥪','🍟','🍿','🧀','🥚','🥞','🧇','🍪','🍩','🧁','🎂','🍰','🍫','🍬','🍭','🍦','☕','🍵','🧃','🥤','🧋','🥛','💧','🧸','🪀','🎈','🎨','🖍️','✏️','📚','📒','🎮','🕹️','🧩','🎲','🪁','⚽','🏀','🚗','🚂','✈️','🚀','🦖','🐶','🐱','🦄','🐉','💎','🪨','🐚','🌸','🌻','⭐','🌈','🔮','🪄','👑','💍','🎁','📱','💻','🎧','📷','🔋','🔧','🛠️','🧪','🔦','🏷️'];
export const PEOPLE_EMOJI = ['🙂','😀','😎','🤠','🥳','🤖','👽','🦸','🧙','👸','🤴','👩','👨','👵','👴','🧒','👶','🐻','🐶','🐱','🦊','🐼'];
export const COLORS = ['#ff7a45','#db2777','#9333ea','#2563eb','#0891b2','#16a34a','#ca8a04','#9a5b34','#dc2626','#475569'];

export function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
export function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
export function ssSet(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* ignore */ } }
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (c) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);

export const rid = () => Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, 'x');
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const route = () => { const [view = '', a = '', b = ''] = location.hash.replace(/^#\/?/, '').split('/'); return { view, a, b }; };
export const setAccent = (c) => document.documentElement.style.setProperty('--accent', c || '#ff7a45');

// Picture for an item, cart line or order line: photo > custom-order drawing > drawn icon > emoji.
export function art(x, opts) {
  if (x.photo) return `<img class="art-img" src="${esc(x.photo)}" alt="" data-emoji="${esc(x.emoji || '🏷️')}" loading="lazy">`;
  if (x.builder) return Art.draw(x.builder, x.recipe, opts);
  if (x.icon && Art.ICONS[x.icon]) return Art.icon(x.icon);
  return esc(x.emoji);
}
// A person's face: their photo, else their emoji.
export function face(c) {
  return c.photo ? `<img class="face-img" src="${esc(c.photo)}" alt="" data-emoji="${esc(c.emoji || '🙂')}">` : esc(c.emoji || '🙂');
}
// A missing photo falls back to the item's emoji.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.dataset.emoji !== undefined) t.replaceWith(document.createTextNode(t.dataset.emoji));
}, true);

export function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const sumOf = (list) => list.reduce((a, v) => a + v, 0);

export function when(iso) {
  const d = new Date(iso);
  if (Date.now() - d < 86400000) return ago(iso);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// In-app yes/no box. The browser's built-in confirm box is silently blocked in some places
// (iframes, kiosk and home-screen web views), which made delete buttons do nothing.
export function askConfirm(msg, { yes = 'Yes', no = 'No', danger = false } = {}) {
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
export function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, 2800);
}

export async function api(method, url, body, { pin = false } = {}) {
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
export function tone(freqs, dur = 0.12, type = 'sine', gap = 0.09) {
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
export const sfx = {
  pop: () => tone([660], 0.08, 'triangle'),
  scan: () => tone([1900], 0.07, 'square'),
  huh: () => tone([520, 390], 0.14, 'triangle', 0.12),
  kaching: () => tone([988, 1319, 1760], 0.2, 'triangle', 0.08),
  newOrder: () => tone([784, 988, 1175], 0.28, 'sine', 0.16),
  bell: () => tone([1568, 1175], 0.45, 'sine', 0.2),
  buzz: () => tone([220, 175], 0.25, 'square', 0.2),
};

// ------------------------------------------------------------------ data + live sync
export async function loadAll() {
  const [st, od] = await Promise.all([api('GET', '/api/state'), api('GET', '/api/orders')]);
  S.stores = st.stores; S.customers = st.customers; S.templates = st.templates; S.orders = od.orders;
  S.banks = st.banks || []; S.accounts = st.accounts || [];
  S.hub = st.hub || { hidden: [] };
  S.printer = st.printer || null;
  S.queue = st.queue || { next: 1, serving: 0 };
  S.spy = st.spy || null;
  S.qrCodes = st.qrCodes || [];
  S.library = st.library || null;
  S.post = st.post || null;
  S.boxOffice = st.boxOffice || { shows: [], tickets: [] };
  S.coupons = st.coupons || [];
  S.checks = st.checks || [];
  S.loaded = true;
}

// The entry module (app.js) sets how to draw the screen; apps can react to fresh data.
let renderer = () => {};
export function setRenderer(fn) { renderer = fn; }
export function render() { renderer(); }
export const dataHooks = [];

export function onData() {
  for (const hook of dataHooks) hook();
  if (route().view === 'setup') return; // Setup edits a local draft; don't clobber it
  const focused = document.activeElement;
  if (focused && $app.contains(focused) && focused.matches('input, select, textarea')) return;
  render();
}

let refreshTimer;
export function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try { await loadAll(); onData(); } catch { /* offline for a moment; SSE will retry */ }
  }, 60);
}

// The kid's screen (Setup → 📱 Phones, saved on this tablet) also hears "send" from phones.
export const isKidScreen = () => lsGet('kidScreen') === '1';
export const sendHooks = [];
let es = null;
export function connect() {
  es?.close();
  es = new EventSource(`/api/events${isKidScreen() ? '?kid=1' : ''}`);
  es.addEventListener('change', refresh);
  es.addEventListener('hello', refresh); // also fires after a reconnect
  es.addEventListener('send', (e) => { let d; try { d = JSON.parse(e.data); } catch { return; } for (const hook of sendHooks) hook(d); });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(refresh, 30_000);

// ------------------------------------------------------------------ modal plumbing
// Only the first draw animates; redraws keep every scroll position so taps don't flash or jump.
export function openModal(m) {
  ui.modal = m; $modal.hidden = false;
  $modal.classList.add('opening');
  drawModal();
}
$modal.addEventListener('animationend', (e) => { if (e.target.classList.contains('sheet')) $modal.classList.remove('opening'); });
export function drawModal() {
  if (!ui.modal) return;
  const keep = [...$modal.querySelectorAll('.sheet, [data-scroll]')].map((el) => [el.dataset.scroll || 'sheet', el.scrollTop]);
  $modal.innerHTML = ui.modal.render();
  dockButtons($modal.querySelector('.sheet'));
  ui.modal.afterDraw?.($modal);
  for (const [k, top] of keep) {
    const el = k === 'sheet' ? $modal.querySelector('.sheet') : $modal.querySelector(`[data-scroll="${k}"]`);
    if (el) el.scrollTop = top;
  }
}
// Pins a window's last row of buttons (the one with the big or main button, plus any small note
// under it) to the bottom of the window, so it never needs scrolling to.
function dockButtons(sheet) {
  if (!sheet || sheet.querySelector('.dock')) return;
  const kids = [...sheet.children];
  const notes = [];
  for (let i = kids.length - 1; i >= 0; i--) {
    const el = kids[i];
    if (el.matches('.btn.huge') || (el.matches('.row') && el.querySelector('.btn.huge, .btn.primary, .btn.good'))) {
      const dock = document.createElement('div');
      dock.className = 'dock';
      el.before(dock);
      dock.append(el, ...notes.reverse());
      return;
    }
    if (!el.matches('p, small, .muted') || notes.length >= 2) return;
    notes.push(el);
  }
}
export function closeModal() {
  const m = ui.modal;
  ui.modal = null; $modal.hidden = true; $modal.innerHTML = '';
  m?.onClose?.();
}
$modal.addEventListener('click', (e) => {
  if (e.target === $modal) { if (!ui.modal?.sticky) closeModal(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || !ui.modal) return;
  if (el.dataset.act === 'close') { closeModal(); return; }
  if ('tap' in el.dataset && e.detail !== 0) return; // already handled on finger-down (detail 0 = keyboard)
  Promise.resolve(ui.modal.act?.(el.dataset.act, el, e)).catch((err) => toast(err.message));
});
// Keys marked data-tap (the PIN pads) act the moment a finger touches them. A click needs the finger
// to go down and up on the same button without sliding, and every key press redraws the window, so
// quick or slightly sloppy taps were getting lost.
$modal.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-tap]');
  if (!el || !ui.modal || e.button > 0 || el.disabled) return;
  e.preventDefault();
  Promise.resolve(ui.modal.act?.(el.dataset.act, el, e)).catch((err) => toast(err.message));
});
$modal.addEventListener('input', (e) => ui.modal?.input?.(e.target, e));
$modal.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) ui.modal?.enter?.(e.target); });

export function bar(title, right = '', back = '#/') {
  return `<header class="bar"><a class="btn icon" href="${back}" aria-label="Back">←</a><h2>${title}</h2>${right}</header>`;
}
