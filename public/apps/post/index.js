// 📦 Post Office: the counter (who from, who to, size, scale, extras, postage), the mail carrier's
// bag (scan parcels in, then scan the door sign where they go), and tracking.
import { S, ui, esc, api, bar, setAccent, toast, render, sfx, loadAll, money, face, lsGet, lsSet, when } from '../../lib/core.js';
import { canPrint, printSlip, printModal } from '../../lib/print.js';
import { payBox } from '../../lib/paybox.js';
import { labelSlip, stampsSlip } from './slips.js';

export const post = () => S.post || { places: [], parcels: [], settings: { rates: {}, autoLabel: true } };
export const placeById = (id) => post().places.find((p) => p.id === id);
const parcelById = (id) => post().parcels.find((p) => p.id === id);
const person = (id) => S.customers.find((c) => c.id === id);

const SIZES = [['letter', '✉️', 'Letter', [0.1, 0.5]], ['small', '📦', 'Small box', [1, 3]], ['big', '📦', 'Big box', [3, 6]], ['giant', '📦', 'Giant box', [6, 10]]];
const EXTRAS = [['fragile', '⚠️', 'Fragile'], ['express', '⚡', 'Express'], ['signature', '✍️', 'Signature']];
const STEPS = [['accepted', '📥', 'Accepted'], ['sorting', '🗂️', 'Sorting'], ['out', '🚚', 'Out for delivery'], ['delivered', '✅', 'Delivered']];
const stepName = (s) => STEPS.find(([k]) => k === s)?.[2] || s;

// Same postage rules as the server (server/post.js), to show the price as it's built.
function postage(f) {
  const r = post().settings.rates;
  const lines = [{ label: SIZES.find(([k]) => k === f.size)[2], amount: r[f.size] }];
  const lbs = Math.max(0, Math.ceil(f.weight) - 1);
  if (lbs) lines.push({ label: `${lbs} extra pound${lbs === 1 ? '' : 's'}`, amount: lbs * r.perPound });
  for (const x of f.extras) lines.push({ label: EXTRAS.find(([k]) => k === x)[2], amount: r[x] });
  if (placeById(f.toPlaceId)?.far) lines.push({ label: 'Far away', amount: r.far });
  return { lines, total: lines.reduce((a, l) => a + l.amount, 0) };
}

const form = () => (ui.po ||= { fromId: null, toPersonId: null, toPlaceId: null, size: 'small', weight: 0, extras: [], sent: null });
const tabs = (on) => `<a class="btn ${on === 'counter' ? 'primary' : ''}" href="#/post">🏤 <span>Counter</span></a>
  <a class="btn ${on === 'carrier' ? 'primary' : ''}" href="#/post/carrier">🚚 <span>Mail bag</span>${bag().length ? `<b>${bag().length}</b>` : ''}</a>
  <a class="btn ${on === 'track' ? 'primary' : ''}" href="#/post/track">🔎 <span>Tracking</span></a>`;

// ------------------------------------------------------------------ counter
function viewCounter() {
  setAccent('#dc2626');
  const f = form();
  if (f.sent) return viewSent(f.sent);
  const cost = postage(f);
  const chip = (act, id, on, inner) => `<button class="choice ${on ? 'on' : ''}" data-act="${act}" data-id="${id}">${inner}</button>`;
  return bar('📦 Post Office', tabs('counter')) + `<div class="setup post-counter">
    <section class="panel"><h3>📤 From <span class="muted small">(scan a member card)</span></h3>
      <div class="choices">${S.customers.map((c) => chip('po-from', c.id, f.fromId === c.id, `<span class="e">${face(c)}</span>${esc(c.name)}`)).join('')}</div></section>
    <section class="panel"><h3>📬 To <span class="muted small">(a person, if you like, and where it goes; or scan a door sign)</span></h3>
      <div class="choices">${chip('po-to', '', !f.toPersonId, '<span class="e">🏠</span>Just a place')}${S.customers.map((c) => chip('po-to', c.id, f.toPersonId === c.id, `<span class="e">${face(c)}</span>${esc(c.name)}`)).join('')}</div>
      <div class="place-chips">${post().places.map((p) => `<button class="place-chip ${f.toPlaceId === p.id ? 'on' : ''}" data-act="po-place" data-id="${p.id}"><b class="zone">${esc(p.zone)}</b><span>${esc(p.emoji)} ${esc(p.name)}</span>${p.far ? '<small>far away</small>' : ''}</button>`).join('')}</div></section>
    <div class="post-row">
      <section class="panel"><h3>📦 Size</h3><div class="size-picks">${SIZES.map(([k, e, n], i) => `<button class="size-pick s${i} ${f.size === k ? 'on' : ''}" data-act="po-size" data-k="${k}"><span>${e}</span>${n}<small>${money(post().settings.rates[k] || 0)}</small></button>`).join('')}</div></section>
      <section class="panel"><h3>⚖️ Scale</h3><div class="scale"><div class="scale-read" id="po-weight">${f.weight.toFixed(1)} <small>lb</small></div>
        <div class="row" style="justify-content:center"><button class="btn" data-act="po-w" data-d="-0.5">−</button><button class="btn primary" data-act="po-weigh">⚖️ Weigh it</button><button class="btn" data-act="po-w" data-d="0.5">+</button></div></div></section>
    </div>
    <section class="panel"><h3>✨ Extras</h3><div class="row">${EXTRAS.map(([k, e, n]) => `<button class="btn ${f.extras.includes(k) ? 'primary' : ''}" data-act="po-extra" data-k="${k}">${e} ${n} +${money(post().settings.rates[k] || 0)}</button>`).join('')}</div></section>
    <section class="panel postage"><h3>💌 Postage</h3>
      <ul class="fine-list">${cost.lines.map((l) => `<li><span>${esc(l.label)}</span><small></small><b>${money(l.amount)}</b></li>`).join('')}</ul>
      <div class="row split"><span class="pay-total" style="font-size:24px">Total <strong style="display:inline">${money(cost.total)}</strong></span>
        <button class="btn huge primary" style="width:auto" data-act="po-send" ${f.fromId && f.toPlaceId ? '' : 'disabled'}>💰 Pay & send</button></div>
      ${!f.fromId || !f.toPlaceId ? `<p class="muted small">${!f.fromId ? 'Pick who it is from. ' : ''}${!f.toPlaceId ? 'Pick where it goes.' : ''}</p>` : ''}</section>
  </div>`;
}

function viewSent(id) {
  const p = parcelById(id);
  const pl = p && placeById(p.toPlaceId);
  return bar('📦 Post Office', tabs('counter')) + `<div class="setup"><section class="panel post-sent">
    <div class="celebrate">📮</div><h2>Sent! It's on its way to ${pl ? `${esc(pl.emoji)} ${esc(pl.name)}` : 'its place'}.</h2>
    ${p ? `<p class="center">Tracking number <code>KH-M-${esc(p.id.toUpperCase())}</code> · Zone <b>${esc(pl?.zone || '?')}</b></p>` : ''}
    ${ui.poPrinted ? '<p class="center muted">🖨️ The shipping label is printing. Stick it on the parcel!</p>' : ''}
    <div class="row" style="justify-content:center"><button class="btn" data-act="po-label" data-id="${esc(id)}">🏷️ ${ui.poPrinted ? 'Print the label again' : 'Print the label'}</button>
      <button class="btn" data-act="po-stamps">🖼️ Print stamps</button><a class="btn" href="#/post/track/${esc(id)}">🔎 Track it</a>
      <button class="btn primary" data-act="po-new">📦 Send another</button></div>
  </section></div>`;
}

async function send() {
  const f = form();
  const cost = postage(f);
  const from = person(f.fromId);
  const body = { fromId: f.fromId, toPersonId: f.toPersonId, toPlaceId: f.toPlaceId, size: f.size, weight: f.weight, extras: f.extras };
  const done = async (r) => {
    await loadAll();
    f.sent = r.parcel.id; ui.poPrinted = false;
    if (post().settings.autoLabel && canPrint()) { ui.poPrinted = true; printSlip(labelSlip(r.parcel, placeById(r.parcel.toPlaceId))).catch((e) => toast(e.message)); }
    render();
  };
  if (!cost.total) { await done(await api('POST', '/api/post/parcels', { ...body, pay: { method: 'cash' } })); sfx.kaching(); return; }
  payBox({
    title: `💌 Postage for ${from ? esc(from.name) : 'this parcel'}`, lines: cost.lines, total: cost.total, customerId: f.fromId, doneText: 'Postage paid! 📮',
    async onPay(pay) { const r = await api('POST', '/api/post/parcels', { ...body, pay }); await done(r); return r; },
  });
}

// ⚖️ The pretend scale wobbles, then settles on a weight that fits the box size.
function weigh() {
  const f = form();
  const [lo, hi] = SIZES.find(([k]) => k === f.size)[3];
  const target = Math.round((lo + Math.random() * (hi - lo)) * 10) / 10;
  const el = document.getElementById('po-weight');
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / 900);
    const wob = (1 - k) * Math.sin(now / 40) * hi * 0.4;
    if (el) el.innerHTML = `${Math.max(0, target * k + wob).toFixed(1)} <small>lb</small>`;
    if (k < 1) requestAnimationFrame(tick); else { f.weight = target; sfx.pop(); render(); }
  };
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ mail carrier
const bag = () => { try { return JSON.parse(lsGet('mailBag') || '[]').filter((id) => parcelById(id)?.status !== 'delivered' && parcelById(id)); } catch { return []; } };
const setBag = (ids) => lsSet('mailBag', JSON.stringify([...new Set(ids)]));

function viewCarrier() {
  setAccent('#dc2626');
  const ids = bag();
  const waiting = post().parcels.filter((p) => p.status !== 'delivered' && !ids.includes(p.id));
  const last = ui.poLast;
  return bar('🚚 Mail bag', tabs('carrier')) + `<div class="setup">
    ${last ? `<section class="panel post-result ${last.ok ? 'ok' : 'bad'}"><h3>${last.html}</h3><button class="btn ghost" data-act="po-last-x">OK</button></section>` : ''}
    <section class="panel"><h3>🎒 In your bag (${ids.length})</h3>
      ${ids.length ? `<div class="list">${ids.map((id) => { const p = parcelById(id); const pl = placeById(p.toPlaceId); return `<div class="list-row"><span class="e">${p.size === 'letter' ? '✉️' : '📦'}</span>
        <span class="grow">To ${esc(p.toName || pl?.name || '')}<small>${esc(pl?.emoji || '')} ${esc(pl?.name || '')} · zone ${esc(pl?.zone || '?')}${p.extras.includes('fragile') ? ' · ⚠️ fragile!' : ''}</small></span>
        <b class="zone big-zone">${esc(pl?.zone || '?')}</b><button class="btn icon" data-act="po-unbag" data-id="${id}" aria-label="Take it out">✕</button></div>`; }).join('')}</div>
        <p class="muted">Walk to the door sign and scan it to deliver. No scanner? Tap where you are:</p>
        <div class="place-chips">${post().places.map((p) => `<button class="place-chip" data-act="po-at" data-id="${p.id}"><b class="zone">${esc(p.zone)}</b><span>${esc(p.emoji)} ${esc(p.name)}</span></button>`).join('')}</div>`
      : '<p class="muted">Empty! Scan a parcel\'s label to put it in your bag.</p>'}</section>
    ${waiting.length ? `<section class="panel"><h3>📮 Waiting at the post office</h3><div class="list">${waiting.map((p) => { const pl = placeById(p.toPlaceId); return `<div class="list-row"><span class="e">${p.size === 'letter' ? '✉️' : '📦'}</span>
      <span class="grow">To ${esc(p.toName || pl?.name || '')}<small>${esc(pl?.emoji || '')} ${esc(pl?.name || '')} · ${esc(stepName(p.status))}</small></span><button class="btn" data-act="po-bag" data-id="${p.id}">🎒 Put in bag</button></div>`; }).join('')}</div></section>` : ''}
  </div>`;
}

async function toBag(id) {
  const p = parcelById(id);
  if (!p) return;
  if (p.status === 'delivered') { toast('That one was already delivered ✅'); return; }
  // Going in the carrier's bag means it's out for delivery.
  for (let s = p.status; s === 'accepted' || s === 'sorting';) s = (await api('POST', `/api/post/parcels/${id}/advance`)).status;
  setBag([...bag(), id]);
  await loadAll(); sfx.pop(); render();
  toast(`🎒 In the bag: to ${placeById(p.toPlaceId)?.name || 'its place'}`);
}

// At a door: deliver everything in the bag that goes here.
async function deliverAt(placeId) {
  const pl = placeById(placeId);
  const ids = bag();
  const here = ids.filter((id) => parcelById(id)?.toPlaceId === placeId);
  if (!here.length) {
    sfx.buzz();
    const where = [...new Set(ids.map((id) => placeById(parcelById(id).toPlaceId)?.name).filter(Boolean))];
    ui.poLast = { ok: false, html: `🙈 Wrong house! Nothing in your bag goes to ${esc(pl?.name || 'here')}.${where.length ? ` Try: ${where.map(esc).join(', ')}.` : ''}` };
    render(); return;
  }
  for (const id of here) await api('POST', `/api/post/parcels/${id}/deliver`, { placeId });
  setBag(ids.filter((id) => !here.includes(id)));
  await loadAll(); sfx.bell();
  ui.poLast = { ok: true, html: `🎉 Delivered ${here.length} parcel${here.length === 1 ? '' : 's'} to ${esc(pl?.emoji || '')} ${esc(pl?.name || '')}!` };
  render();
}

// ------------------------------------------------------------------ tracking
function viewTrack(id) {
  setAccent('#dc2626');
  if (id) {
    const p = parcelById(id);
    if (!p) return bar('🔎 Tracking', tabs('track')) + '<div class="setup"><p class="center">That parcel is lost in the mail. 🕳️</p></div>';
    const pl = placeById(p.toPlaceId);
    const at = (s) => p.events.find((e) => e.status === s);
    return bar('🔎 Tracking', tabs('track')) + `<div class="setup"><section class="panel">
      <h2>${p.size === 'letter' ? '✉️' : '📦'} To ${esc(p.toName ? `${p.toName}, ` : '')}${esc(pl?.emoji || '')} ${esc(pl?.name || '')}</h2>
      <p class="muted">From ${esc(p.fromName)} · ${esc(SIZES.find(([k]) => k === p.size)?.[2] || '')}, ${p.weight} lb${p.extras.length ? ` · ${p.extras.map((x) => EXTRAS.find(([k]) => k === x)?.[2]).join(', ')}` : ''} · postage ${money(p.postage)} · <code>KH-M-${esc(p.id.toUpperCase())}</code></p>
      <ol class="timeline">${STEPS.map(([k, e, n]) => { const ev = at(k); return `<li class="${ev ? 'done' : ''} ${p.status === k ? 'now' : ''}"><span class="dot">${e}</span><b>${n}</b><small>${ev ? when(ev.at) : ''}</small></li>`; }).join('')}</ol>
      <div class="row">${['accepted', 'sorting'].includes(p.status) ? '<button class="btn primary" data-act="po-advance">➡️ Move it along</button>' : ''}
        <button class="btn" data-act="po-label" data-id="${p.id}">🏷️ Label</button></div></section></div>`;
  }
  const list = [...post().parcels].reverse();
  return bar('🔎 Tracking', tabs('track')) + `<div class="setup">
    ${list.length ? `<div class="list">${list.map((p) => { const pl = placeById(p.toPlaceId); const i = STEPS.findIndex(([k]) => k === p.status); return `<a class="list-row" href="#/post/track/${p.id}"><span class="e">${p.size === 'letter' ? '✉️' : '📦'}</span>
      <span class="grow">To ${esc(p.toName || pl?.name || '')}<small>${esc(p.fromName)} → ${esc(pl?.emoji || '')} ${esc(pl?.name || '')}</small></span>
      <span class="mini-steps">${STEPS.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span><b>${esc(stepName(p.status))}</b></a>`; }).join('')}</div>`
      : '<div class="center-msg"><div class="emoji">📭</div><h2>No mail yet</h2><p>Send a parcel at the counter!</p></div>'}
  </div>`;
}

// ------------------------------------------------------------------ scanning
async function postScan(info, r) {
  if (ui.modal) return false;
  const view = r.a || 'counter';
  if (info.kind === 'parcel') {
    if (view === 'carrier') { await toBag(info.id); return true; }
    if (view === 'counter' && ['accepted', 'sorting'].includes(info.parcel.status)) {
      const p = await api('POST', `/api/post/parcels/${info.id}/advance`); await loadAll(); sfx.pop();
      toast(`📦 ${stepName(p.status)}!`);
    }
    location.hash = `#/post/track/${info.id}`;
    return true;
  }
  if (info.kind === 'place') {
    if (view === 'carrier') { await deliverAt(info.id); return true; }
    if (view === 'counter') { form().toPlaceId = info.id; sfx.pop(); render(); toast(`📬 Going to ${info.place.name}`); return true; }
    return false;
  }
  if (info.kind === 'person' && view === 'counter') {
    const f = form();
    if (!f.fromId || f.sent) { f.sent = null; f.fromId = info.id; toast(`📤 From ${person(info.id)?.name}`); } else { f.toPersonId = info.id; toast(`📬 To ${person(info.id)?.name}`); }
    sfx.pop(); render(); return true;
  }
  return false;
}

export const postApp = {
  views: { post: (r) => (r.a === 'carrier' ? viewCarrier() : r.a === 'track' ? viewTrack(r.b) : viewCounter()) },
  onScan: postScan,
  badge: () => bag().length,
  // Walking around with a full mail bag: a door sign scanned on any screen delivers.
  async anyScan(info) {
    if (info.kind !== 'place' || ui.modal || !bag().length || location.hash.startsWith('#/post')) return false;
    location.hash = '#/post/carrier';
    await deliverAt(info.id);
    return true;
  },
  actions: {
    'po-from'(el) { const f = form(); f.fromId = el.dataset.id; sfx.pop(); render(); },
    'po-to'(el) { form().toPersonId = el.dataset.id || null; sfx.pop(); render(); },
    'po-place'(el) { form().toPlaceId = el.dataset.id; sfx.pop(); render(); },
    'po-size'(el) { form().size = el.dataset.k; sfx.pop(); render(); },
    'po-w'(el) { const f = form(); f.weight = Math.max(0, Math.min(50, Math.round((f.weight + Number(el.dataset.d)) * 10) / 10)); render(); },
    'po-weigh'() { weigh(); },
    'po-extra'(el) { const f = form(); const k = el.dataset.k; f.extras = f.extras.includes(k) ? f.extras.filter((x) => x !== k) : [...f.extras, k]; sfx.pop(); render(); },
    'po-send'() { return send(); },
    'po-new'() { ui.po = null; render(); },
    'po-label'(el) { const p = parcelById(el.dataset.id); if (p) printModal(labelSlip(p, placeById(p.toPlaceId)), { title: '🏷️ Shipping label' }); },
    'po-stamps'() { printModal(stampsSlip(25, 8), { title: '🖼️ Stamps' }); },
    'po-bag'(el) { return toBag(el.dataset.id); },
    'po-unbag'(el) { setBag(bag().filter((x) => x !== el.dataset.id)); render(); },
    'po-at'(el) { return deliverAt(el.dataset.id); },
    'po-last-x'() { ui.poLast = null; render(); },
    async 'po-advance'() { const id = location.hash.split('/')[3]; await api('POST', `/api/post/parcels/${id}/advance`); await loadAll(); sfx.pop(); render(); },
  },
};
