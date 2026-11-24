// ⚙️ Setup (grown-ups, PIN): stores, menus, reset.
import { Art, COLORS, S, api, art, askConfirm, bar, clone, closeModal, drawModal, esc, loadAll, money, openModal, render, rid, setAccent, ssSet, sumOf, toast, ui } from '../lib/core.js';
import { bankById } from './bank.js';
import { hasKitchen, storeById } from './store/common.js';
import { itemModal } from './store/items.js';
import { printer, statusLine, printModal, emojiImage, svgImage } from '../lib/print.js';
import { priceTagSlips } from './store/slips.js';
import { spyPanel, spyAdminActions } from './spy/admin.js';
import { libraryPanel, libraryField, libraryAdminActions } from './library/admin.js';
import { postPanel, postField, postAdminActions } from './post/admin.js';
import { APPS } from './registry.js';
import { camSupported, camButtonOn, setCamButton } from '../lib/camscan.js';

// ------------------------------------------------------------------ setup views
export function viewSetup(r) {
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
          <span class="grow">${esc(s.name)}<small>${s.items.length} items · ${s.taxRate ? `${s.taxRate}% tax` : 'no tax'} · ${hasKitchen(s) ? 'kitchen orders' : 'checkout only'} · ${s.playMoney ? 'play money' : 'tap to pay'} · cards${s.payoutAccountId ? ' → bank' : ''}</small></span>
          <a class="btn" href="#/cashier/${s.id}">🧾 Open</a>
          <a class="btn primary" href="#/setup/store/${s.id}">✏️ Edit</a>
        </div>`).join('') : '<p class="muted">No stores yet. Tap “New store” and pick a template.</p>'}</div>
    </section>
    ${printerPanel()}
    ${couponPanel()}
    ${libraryPanel()}
    ${postPanel()}
    ${spyPanel()}
    <section class="panel">
      <h3>🏠 Home screen</h3>
      <p class="muted">Tap an app to show or hide it on the home screen. Hidden apps still work if you go to them another way.</p>
      <div class="row">${APPS.map((a) => {
        const off = S.hub.hidden.includes(a.id);
        return `<button class="btn ${off ? '' : 'primary'}" data-act="hub-toggle" data-id="${a.id}" aria-pressed="${!off}">${a.emoji} ${esc(a.name)}${off ? ' · hidden' : ''}</button>`;
      }).join('')}</div>
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
        <button class="btn danger" data-act="reset">🔄 Reset play data…</button>
      </div>
    </section>
    <section class="panel">
      <h3>📱 Tablet tip</h3>
      <p>On Android, open this page in Chrome, then ⋮ → <b>Add to Home screen</b> for a full-screen app.</p>
    </section>
    <section class="panel">
      <h3>📷 Camera scanner</h3>
      <p class="muted">When the Bluetooth scanner won't connect, the 📷 button in the bottom corner scans with the tablet's camera instead: QR codes, printed labels and real barcodes all work. 🔄 switches between the front and back camera. Works on Android tablets and iPads. This setting is just for this tablet.</p>
      ${camSupported() ? '' : `<p class="lib-warn">${window.isSecureContext ? 'This browser is too old to read barcodes with the camera.' : 'The camera only works on the secure <b>https://</b> address of the Kids Hub.'}</p>`}
      <label class="toggle"><input type="checkbox" data-act="cam-toggle" ${camButtonOn() ? 'checked' : ''}> Show the 📷 button</label>
    </section>
  </div>`;
}

export function viewStoreEditor(id) {
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
        <label class="toggle"><input type="checkbox" data-d="kitchen" ${hasKitchen(d) ? 'checked' : ''}> 👨‍🍳 Send orders to the kitchen (the Orders screen). Turn off for shops that hand things over at the register, like a tech store.</label>
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
        <h3><span class="grow">🏷️ Items (${d.items.length})</span><button class="btn" data-act="tags">🏷️ Price tags</button><button class="btn primary" data-act="item-add">➕ Add item</button></h3>
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

// Reset play data (grown-ups). Stores, menus, prices, banks and photos are always kept.
export function resetModal() {
  const m = {
    step: ui.pin ? 'pick' : 'pin', pin: '',
    o: { orders: true, bankMoney: true, accounts: false, kidItems: false, people: false, spy: false, scans: false, library: false, post: false, boxOffice: false, checks: false },
    render() {
      const x = '<button class="btn icon close" data-act="close" aria-label="Close">✕</button>';
      if (m.step === 'pin') {
        return `<div class="sheet">${x}<h2>Grown-ups only 🔒</h2>
          <div class="pinpad inline"><div class="dots">${m.pin ? '●'.repeat(m.pin.length) : '<span class="hint">Enter the PIN</span>'}</div>
          <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-act="pk" data-k="${n}">${n}</button>`).join('')}
            <button data-act="pk-back" aria-label="Delete">⌫</button><button data-act="pk" data-k="0">0</button><button data-act="pin-ok">OK</button></div></div></div>`;
      }
      const kid = sumOf(S.stores.map((s) => s.items.filter((i) => i.addedBy === 'kid').length));
      const inBank = sumOf(S.accounts.map((a) => a.balance));
      const row = (k, label, note, disabled = false) => `<label class="toggle reset-opt ${disabled ? 'off' : ''}">
          <input type="checkbox" data-o="${k}" ${m.o[k] ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${label}<small>${note}</small></span></label>`;
      const any = Object.values(m.o).some(Boolean);
      return `<div class="sheet">${x}<h2>🔄 Reset play data</h2>
        <p class="muted center">Pick what to clear. Stores, menus, prices, banks and photos are always kept.</p>
        <div class="reset-opts">
          ${row('orders', '🧾 All orders', `${S.orders.length} order${S.orders.length === 1 ? '' : 's'}. Order numbers start again at #1.`)}
          ${row('bankMoney', '🏦 Empty the bank accounts', `Every account goes to $0 (${money(inBank)} in the bank now) and the history is cleared. Accounts and cards are kept.`, m.o.accounts)}
          ${row('accounts', '💳 Close all bank accounts', `${S.accounts.length} account${S.accounts.length === 1 ? '' : 's'} and their cards are removed.`, m.o.people)}
          ${row('kidItems', '⭐ Items added at the register', `${kid} item${kid === 1 ? '' : 's'} added with “Add my item”.`)}
          ${row('people', '🙂 People', 'Back to just Mom and Dad. This also closes the bank accounts.')}
          ${row('boxOffice', '🎟️ Show tickets', 'All tickets are cleared, so every seat is free again. The shows stay.')}
          ${row('checks', '🧾 Checks', 'Every check is forgotten (money already moved stays moved).')}
          ${row('post', '📦 Mail', 'All parcels are cleared. Places and door signs stay.')}
          ${row('library', '📚 Library loans', 'Every book goes back on the shelf and fines are cleared. The books stay.')}
          ${row('scans', '🔍 Scanner list', 'Forget everything the Scanner app remembers being scanned.')}
          ${row('spy', '🕵️ Spy HQ progress', 'Vaults lock again, missions start over and Code Breaker records are cleared. Agents, missions and vaults are kept; money already taken from a vault stays taken.')}
        </div>
        <button class="btn huge bad" data-act="go-reset" ${any ? '' : 'disabled'}>🔄 Reset</button>
      </div>`;
    },
    input(t) {
      if (!t.dataset.o) return;
      m.o[t.dataset.o] = t.checked;
      if (m.o.people) m.o.accounts = true;
      if (m.o.accounts) m.o.bankMoney = true;
      drawModal();
    },
    async act(a, el) {
      if (a === 'pk') { if (m.pin.length < 12) m.pin += el.dataset.k; drawModal(); return; }
      if (a === 'pk-back') { m.pin = m.pin.slice(0, -1); drawModal(); return; }
      if (a === 'pin-ok') {
        try { await api('POST', '/api/pin', { pin: m.pin }); } catch { m.pin = ''; drawModal(); toast('That PIN is not right'); return; }
        ui.pin = m.pin; ssSet('pin', ui.pin);
        m.step = 'pick'; drawModal(); return;
      }
      if (a === 'go-reset') {
        if (!(await askConfirm('Reset the checked things? This can’t be undone.', { yes: '🔄 Reset', no: 'Cancel', danger: true }))) return;
        await api('POST', '/api/reset', m.o, { pin: true });
        await loadAll(); closeModal(); render();
        toast('All fresh! 🧹');
      }
    },
  };
  openModal(m);
}

export function templateModal(title, onPick) {
  openModal({
    render: () => `<div class="sheet">
      <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
      <h2>${title}</h2>
      <div class="choices">${S.templates.map((t) => `<button class="choice" data-act="tpl" data-k="${t.key}"><span class="e">${esc(t.emoji)}</span>${esc(t.label)}</button>`).join('')}</div>
    </div>`,
    async act(a, el) { if (a === 'tpl') await onPick(el.dataset.k); },
  });
}

export function newStoreModal() {
  templateModal('What kind of store?', async (key) => {
    const s = await api('POST', '/api/stores', { template: key }, { pin: true });
    S.stores.push(s);
    closeModal();
    location.hash = `#/setup/store/${s.id}`;
  });
}

export function onField(e) {
  const t = e.target;
  const d = ui.draft;
  if (libraryField(t) || postField(t)) return;
  if (t.dataset.pf && ui.pf) {
    ui.pf[t.dataset.pf] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) || 0 : t.value.trim();
    ui.pfDirty = true;
  } else if (t.dataset.d && d) {
    d[t.dataset.d] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) || 0 : t.value;
    ui.dirty = true;
  } else if (t.dataset.cat !== undefined && d) {
    d.categories[Number(t.dataset.cat)][t.dataset.k] = t.value;
    ui.dirty = true;
  }
}

export const setupActions = {
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
  // setup: main
  'new-store'() { newStoreModal(); },
  async 'clear-delivered'() {
    if (!(await askConfirm('Remove all delivered orders?', { yes: '🧹 Clear' }))) return;
    await api('DELETE', '/api/orders?status=delivered', undefined, { pin: true });
    await loadAll(); render(); toast('Cleared 🧹');
  },
  reset() { resetModal(); },
  ...spyAdminActions,
  ...libraryAdminActions,
  ...postAdminActions,
  async 'coupon-del'(el) { await api('DELETE', `/api/coupons/${el.dataset.id}`); await loadAll(); render(); },
  tags() {
    if (ui.dirty) { toast('Save the store first 💾, then print its price tags'); return; }
    const s = storeById(ui.draft.id);
    if (s) tagsModal(s);
  },
  'pf-paper'(el) { ui.pf.paper = Number(el.dataset.v); ui.pfDirty = true; render(); },
  async 'pf-save'() { await savePrinter(); toast('Printer settings saved ✅'); },
  async 'pf-check'() { S.printer = await api('POST', '/api/printer/check'); render(); },
  async 'pf-test'() {
    if (ui.pfDirty) await savePrinter();
    printModal(await testSlip(), { title: '🧾 Test print', test: true });
  },
  'cam-toggle'(el) { setCamButton(el.checked); },
  async 'hub-toggle'(el) {
    const id = el.dataset.id;
    const hidden = S.hub.hidden.includes(id) ? S.hub.hidden.filter((x) => x !== id) : [...S.hub.hidden, id];
    S.hub = await api('PUT', '/api/hub', { hidden }, { pin: true });
    render();
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

export const setupApp = { views: { setup: viewSetup }, actions: setupActions, onField };

// ------------------------------------------------------------------ receipt printer
const PF_KEYS = ['enabled', 'host', 'port', 'paper', 'dailyLimit', 'maxCm', 'autoReceipt', 'autoTicket', 'funLines', 'cut'];
async function savePrinter() {
  S.printer = await api('PUT', '/api/printer', ui.pf, { pin: true });
  ui.pf = null; ui.pfDirty = false;
  render();
}

function printerPanel() {
  const p = printer();
  ui.pf ||= Object.fromEntries(PF_KEYS.map((k) => [k, p[k]]));
  const f = ui.pf;
  return `<section class="panel">
      <h3><span class="grow">🖨️ Receipt printer</span><button class="btn" data-act="pf-check">🔄 Check</button></h3>
      <p><b>${statusLine(p)}</b>${p.status?.message && p.status.state === 'offline' ? ` <span class="muted">(${esc(p.status.message)})</span>` : ''}${p.address ? ` <span class="muted">· ${esc(p.address)}</span>` : ''}</p>
      <label class="toggle"><input type="checkbox" data-pf="enabled" ${f.enabled ? 'checked' : ''}> Printer on</label>
      <div class="form-grid">
        <label class="field">Printer address (IP)<input data-pf="host" value="${esc(f.host)}" maxlength="253" placeholder="${esc(p.envHost || '192.168.1.50')}" autocomplete="off" inputmode="url"></label>
        <label class="field">Port<input data-pf="port" type="number" inputmode="numeric" min="1" max="65535" value="${f.port}"></label>
      </div>
      ${p.envHost && !f.host ? `<p class="muted small">Using ${esc(p.envHost)} from PRINTER_HOST. Type an address here to use a different one.</p>` : ''}
      <div class="field">Paper<div class="row">${(p.papers || []).map((x) => `<button class="btn ${f.paper === x.id ? 'primary' : ''}" data-act="pf-paper" data-v="${x.id}">${esc(x.label)}</button>`).join('')}</div>
        <span class="muted small">If the row of numbers on the test print wraps onto a second line, pick fewer letters.</span></div>
      <div class="form-grid">
        <label class="field">Prints a day<input data-pf="dailyLimit" type="number" inputmode="numeric" min="1" max="500" value="${f.dailyLimit}"></label>
        <label class="field">Longest slip (cm)<input data-pf="maxCm" type="number" inputmode="numeric" min="10" max="200" value="${f.maxCm}"></label>
      </div>
      <label class="toggle"><input type="checkbox" data-pf="cut" ${f.cut !== false ? 'checked' : ''}> ✂️ Cut the paper after each slip (turn off if the printer has no cutter or it's switched off; the paper then feeds out to tear)</label>
      <label class="toggle"><input type="checkbox" data-pf="autoReceipt" ${f.autoReceipt ? 'checked' : ''}> 🧾 Print a receipt automatically after every sale</label>
      <label class="toggle"><input type="checkbox" data-pf="autoTicket" ${f.autoTicket ? 'checked' : ''}> 🎫 Print a kitchen ticket automatically for every new kitchen order</label>
      <label class="toggle"><input type="checkbox" data-pf="funLines" ${f.funLines ? 'checked' : ''}> 😄 Jokes and fun facts at the bottom of receipts</label>
      <p class="muted">Printed today: <b>${p.today}</b> of ${p.dailyLimit}. When the limit is reached, kids see “The printer is resting until tomorrow” and can still look at the preview. Test prints don't count against it.</p>
      <div class="row"><button class="btn primary" data-act="pf-save">💾 Save printer settings</button><button class="btn" data-act="pf-test">🧾 Test print</button></div>
    </section>`;
}

// Everything the printer can do, on one slip: sizes, styles, a picture, a QR code and a barcode.
async function testSlip() {
  const p = printer();
  let pic;
  try { pic = await svgImage(Art.icon('cupcake'), 192); } catch { pic = emojiImage('🧁', 160); }
  return { title: 'Test print', parts: [
    emojiImage('🖨️', 96),
    { t: 'text', s: 'KIDS HUB', size: 3, bold: true, align: 'center' },
    { t: 'text', s: 'Printer test', size: 2, align: 'center' },
    { t: 'text', s: new Date().toLocaleString(), align: 'center' },
    { t: 'rule', ch: '=' },
    { t: 'text', s: 'Normal text. Café, 25¢, ½ off.' },
    { t: 'text', s: 'Bold text', bold: true },
    { t: 'text', s: 'Underlined text', underline: true },
    { t: 'text', s: ' White on black ', invert: true, align: 'center' },
    { t: 'text', s: 'Size 2', size: 2 },
    { t: 'text', s: 'Size 3', size: 3 },
    { t: 'text', s: 'Left' }, { t: 'text', s: 'Center', align: 'center' }, { t: 'text', s: 'Right', align: 'right' },
    { t: 'row', left: 'A row with a price', right: '$12.34' },
    { t: 'text', s: '1234567890'.repeat(10).slice(0, p.cols) },
    { t: 'rule' },
    pic,
    { t: 'text', s: 'A drawing, in dots', align: 'center' },
    { t: 'rule' },
    { t: 'qr', data: 'KH-TEST-QR', size: 6 },
    { t: 'text', s: 'QR code', align: 'center' },
    { t: 'barcode', data: 'KH-TEST-123' },
    { t: 'rule' },
    { t: 'text', s: `Set up for ${p.label || `${p.cols} letters a line`}. If the numbers above fill one line exactly, the paper setting is right.`, align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// 🏷️ Pick items and print price tags with barcodes (scan them at the register to ring them up).
function tagsModal(store) {
  const sellable = store.items.filter((i) => !i.builder || i.recipe);
  const on = new Set(sellable.map((i) => i.id));
  const m = {
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>🏷️ Price tags for ${esc(store.name)}</h2>
        <p class="center muted">Each tag has a barcode. Scan it at the register to ring the item up. Tap to pick which to print.</p>
        <div class="row" style="justify-content:center"><button class="btn" data-act="all">All</button><button class="btn" data-act="none">None</button></div>
        <div class="tag-picks" data-scroll="tags">${sellable.map((i) => `<button class="tag-pick ${on.has(i.id) ? 'on' : ''}" data-act="t" data-id="${i.id}">
          <span class="art">${art(i)}</span><span>${esc(i.name)}</span><b>${money(i.price)}</b></button>`).join('')}</div>
        <button class="btn huge primary" data-act="go" ${on.size ? '' : 'disabled'}>🏷️ Make ${on.size} tag${on.size === 1 ? '' : 's'}</button>
      </div>`;
    },
    async act(a, el) {
      if (a === 't') { on.has(el.dataset.id) ? on.delete(el.dataset.id) : on.add(el.dataset.id); drawModal(); return; }
      if (a === 'all') { sellable.forEach((i) => on.add(i.id)); drawModal(); return; }
      if (a === 'none') { on.clear(); drawModal(); return; }
      if (a === 'go') {
        const slips = await priceTagSlips(store, sellable.filter((i) => on.has(i.id)));
        printModal(slips, { title: '🏷️ Price tags', back: () => openModal(m) });
      }
    },
  };
  openModal(m);
}

// 🎟️ Coupons: made at the register (🎟️ Coupons button); listed here to tidy up.
function couponPanel() {
  const list = S.coupons || [];
  if (!list.length) return '';
  const open = list.filter((c) => !c.usedAt);
  const storeName = (id) => S.stores.find((s) => s.id === id)?.name || 'any store';
  return `<section class="panel">
    <h3>🎟️ Coupons</h3>
    <p class="muted">${open.length} not used yet, ${list.length - open.length} used. Make more with the 🎟️ Coupons button at the register.</p>
    <div class="list">${list.slice(-30).reverse().map((c) => `<div class="list-row"><span class="e">🎟️</span><span class="grow">${esc(c.label)}<small>${esc(storeName(c.storeId))} · ${c.usedAt ? 'used' : 'not used yet'}</small></span>
      <button class="btn icon danger" data-act="coupon-del" data-id="${c.id}" aria-label="Remove">✕</button></div>`).join('')}</div>
  </section>`;
}
