// Item editor (kid and grown-up) and the sandwich / drink builders.
import { $modal, Art, ITEM_EMOJI, api, art, askConfirm, closeModal, drawModal, esc, loadAll, money, openModal, refresh, render, rid, sfx, toast, ui } from '../../lib/core.js';
import { readFile, shrinkPhoto } from '../../lib/photo.js';
import { lookupCode, isIsbn, isProductCode } from '../../lib/lookup.js';
import { addLine } from './cashier.js';

// mode 'kid': saves straight to the server. mode 'setup': edits the Setup draft.
// barcode: a scanned package code to link to a new item ("New item!" at the register).
export function itemModal({ store, item, mode, defaultCat = null, barcode = null }) {
  const cats = mode === 'setup' ? ui.draft.categories : store.categories;
  const hasMyStuff = cats.some((c) => c.name.toLowerCase() === 'my stuff');
  const custom = !!item?.builder; // builder items price themselves from their recipe
  const f = item
    ? { name: item.name, emoji: item.emoji, icon: item.icon || null, photo: item.photo, price: item.price, wasPrice: item.wasPrice || null, categoryId: item.categoryId, barcodes: [...(item.barcodes || [])], ...(mode === 'setup' ? { stock: item.stock ?? null } : {}) }
    : { name: '', emoji: barcode ? '📦' : '⭐', icon: null, photo: null, price: 100, wasPrice: null, categoryId: defaultCat || (mode === 'setup' ? cats[0]?.id : null), barcodes: barcode ? [barcode] : [] };
  const addBarcode = (code) => {
    code = String(code || '').trim();
    if (!/^[\x21-\x7e]{3,40}$/.test(code)) { toast('That barcode looks odd'); return; }
    if (f.barcodes.includes(code)) { toast('That barcode is already on it 👍'); return; }
    if (f.barcodes.length >= 10) { toast('That is plenty of barcodes'); return; }
    f.barcodes.push(code); sfx.pop(); drawModal();
    // A brand-new item with no name yet: find out what it is.
    if (!item && !custom && !f.name.trim() && lookable(code)) look(code);
  };
  const lookable = (code) => isProductCode(code) || isIsbn(code);
  const filled = {}; // what the last lookup filled in, so a new lookup may replace it
  // 🔎 Find the product (or book) online and fill in its name and picture.
  async function look(code, { all = false } = {}) {
    m.looking = true; m.note = null; drawModal();
    const r = await lookupCode(code);
    m.looking = false;
    if (ui.modal !== m) return;
    if (!r) m.note = '📡 Couldn\'t look it up right now. Give it a name and take a photo!';
    else if (!r.found) m.note = '🤷 We couldn\'t find this one. What is it? Give it a name and take a photo!';
    else {
      const may = (k, empty) => all || f[k] === empty || f[k] === filled[k];
      if (may('name', '')) f.name = filled.name = r.title.slice(0, 40).trim();
      if (r.photo && may('photo', null)) f.photo = filled.photo = r.photo;
      if (r.kind === 'book' && !f.icon && may('emoji', '📦')) f.emoji = filled.emoji = r.emoji || '📚';
      m.note = `✨ It's <b>${esc(r.fullTitle || r.title)}</b>${r.size ? ` (${esc(r.size)})` : ''}! Name${r.photo ? ' and picture' : ''} filled in from ${esc(r.source)}. Now give it a price!`;
      sfx.pop();
    }
    drawModal();
  }
  const barcodeField = () => `<div class="field">📦 Barcodes <span class="muted small">(scan the package with the scanner, and it rings up this item)</span>
      <div class="row">${f.barcodes.map((c, i) => `<span class="chip">${esc(c)} <button class="chip-x" data-act="bc-del" data-i="${i}" aria-label="Remove ${esc(c)}">✕</button></span>`).join('') || '<span class="muted">None yet. Scan one now!</span>'}</div>
      ${mode === 'setup' ? '<input data-f="bc" placeholder="…or type a barcode and press Enter" autocomplete="off" inputmode="numeric">' : ''}
      ${!custom && f.barcodes.some(lookable) ? `<div class="row">${f.barcodes.filter(lookable).slice(0, 3).map((c) => `<button class="btn" data-act="look" data-code="${esc(c)}" ${m.looking ? 'disabled' : ''}>🔎 What is ${f.barcodes.filter(lookable).length > 1 ? esc(c) : 'it'}?</button>`).join('')}</div>` : ''}</div>`;
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
    looking: false,
    note: null,
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${item ? '✏️ Change item' : barcode ? '📦 New item!' : mode === 'kid' ? '⭐ Add my item' : '➕ New item'}</h2>
        ${m.looking ? '<p class="center muted">🔎 Looking up this barcode…</p>' : m.note ? `<p class="center muted">${m.note}</p>` : barcode && !item ? '<p class="center muted">Nobody sells this yet. What is it? Take a photo of the box and give it a price!</p>' : ''}
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
        ${barcodeField()}
        ${mode === 'setup' && !custom ? `<div class="field">📦 Stock <span class="muted small">(how many are on the shelf; sales count down, returns and restocking count up)</span>
          <div class="row"><label class="toggle"><input type="checkbox" data-f="track" ${f.stock != null ? 'checked' : ''}> Count them</label>
          ${f.stock != null ? `<button class="btn" data-act="stock" data-d="-1">−</button><b class="stock-n">${f.stock}</b><button class="btn" data-act="stock" data-d="1">+</button><button class="btn" data-act="stock" data-d="10">+10</button>` : '<span class="muted">Not counted: never sells out</span>'}</div></div>` : ''}
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
      if (t.dataset.f === 'track') { f.stock = t.checked ? 10 : null; drawModal(); }
    },
    enter(t) {
      if (t?.dataset.f === 'bc') { addBarcode(t.value); return; }
      document.activeElement?.blur(); // Enter in the name field just closes the keyboard
    },
    // Scanning a package while this is open links its barcode.
    onScan(info) {
      if (info.ours) return false;
      if (info.kind === 'item' && info.id !== item?.id) { toast(`That barcode already belongs to ${info.label}`); return true; }
      addBarcode(info.code);
      return true;
    },
    async act(a, el) {
      if (a === 'look') { await look(el.dataset.code, { all: true }); return; }
      if (a === 'bc-del') { f.barcodes.splice(Number(el.dataset.i), 1); drawModal(); return; }
      if (a === 'stock') { f.stock = Math.max(0, Math.min(999, (f.stock || 0) + Number(el.dataset.d))); drawModal(); return; }
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
  if (barcode && !item && lookable(barcode)) look(barcode);
}

// Custom sandwich / drink: stack layers into a labelled cut-away picture.
export const EMPTY_RECIPE = {
  sandwich: { bread: 'white', layers: [], toasted: false },
  drink: { size: 'm', iced: false, layers: [], toppings: [] },
};
export function builderModal({ store, item, recipe = null, replaceKey = null }) {
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
