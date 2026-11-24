// 🎟️ Box Office: make a show, sell seats from a seat map, print tickets, and scan them at the door.
import { S, ui, esc, api, bar, setAccent, toast, render, sfx, loadAll, money, face, openModal, drawModal, closeModal, askConfirm } from '../../lib/core.js';
import { canPrint, printSlip, printModal, emojiImage } from '../../lib/print.js';
import { payBox } from '../../lib/paybox.js';
import { bankById } from '../bank.js';

const ROWS = 'ABCDEFGH';
const SHOW_EMOJI = ['🎭', '🎬', '🧸', '🪄', '🎤', '🎻', '🤡', '🦁', '🦖', '🚀', '🧚', '🍿', '⚽', '🎨', '🐶', '👑'];
const bo = () => S.boxOffice || { shows: [], tickets: [] };
const showById = (id) => bo().shows.find((s) => s.id === id);
const ticketsFor = (id) => bo().tickets.filter((t) => t.showId === id);
const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const isPast = (s) => new Date(s.at).toLocaleDateString('en-CA') < new Date().toLocaleDateString('en-CA');
const tabs = (on) => `<a class="btn ${on === 'list' ? 'primary' : ''}" href="#/tickets">🎟️ <span>Shows</span></a>`;

// ------------------------------------------------------------------ shows
function viewShows() {
  setAccent('#db2777');
  const shows = [...bo().shows].sort((a, b) => a.at.localeCompare(b.at));
  return bar('🎟️ Box Office', tabs('list')) + `<div class="setup">
    <div class="show-grid">
      ${shows.map((s) => {
        const sold = ticketsFor(s.id).length, seats = s.rows * s.seatsPerRow, inside = ticketsFor(s.id).filter((t) => t.usedAt).length;
        return `<section class="show-card ${isPast(s) ? 'past' : ''}"><div class="show-emoji">${esc(s.emoji)}</div><h3>${esc(s.name)}</h3>
          <p>${esc(when(s.at))}</p><p class="muted">${s.price ? money(s.price) : 'Free'} · ${sold} of ${seats} seats sold${inside ? ` · ${inside} inside` : ''}</p>
          <div class="row" style="justify-content:center"><a class="btn primary" href="#/tickets/sell/${s.id}">🎟️ Sell</a><a class="btn" href="#/tickets/door/${s.id}">🚪 Door</a>
            <button class="btn icon" data-act="show-edit" data-id="${s.id}" aria-label="Change">✏️</button></div></section>`;
      }).join('')}
      <button class="show-card add" data-act="show-new"><div class="show-emoji">➕</div><h3>Make a show</h3><p class="muted">A movie night, a puppet show, a concert…</p></button>
    </div></div>`;
}

function showModal(old) {
  const at = old ? new Date(old.at) : new Date(Date.now() + 3600_000);
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const f = old ? { ...old, at: local(at) } : { name: '', emoji: '🎭', at: local(at), rows: 4, seatsPerRow: 6, price: 100, storeId: '', payoutAccountId: '' };
  const m = {
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${old ? '✏️ Change the show' : '🎭 Make a show'}</h2>
        <label class="field">Show name<input data-f="name" value="${esc(f.name)}" maxlength="50" placeholder="The Great Puppet Show" autocomplete="off"></label>
        <div class="field">Picture<div class="emoji-grid">${SHOW_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
        <label class="field">When<input type="datetime-local" data-f="at" value="${esc(f.at)}"></label>
        <div class="field">Seats: ${f.rows} rows × ${f.seatsPerRow} seats = <b>${f.rows * f.seatsPerRow}</b>
          <div class="row"><span>Rows</span><button class="btn" data-act="rows" data-d="-1">−</button><b>${f.rows}</b><button class="btn" data-act="rows" data-d="1">+</button>
            <span>Seats in a row</span><button class="btn" data-act="per" data-d="-1">−</button><b>${f.seatsPerRow}</b><button class="btn" data-act="per" data-d="1">+</button></div></div>
        <div class="field">Ticket price<div class="row">${[0, 50, 100, 200, 500].map((p) => `<button class="btn ${f.price === p ? 'primary' : ''}" data-act="price" data-p="${p}">${p ? money(p) : 'Free'}</button>`).join('')}</div></div>
        <div class="form-grid">
          <label class="field">🍿 Snack bar (a store)<select data-f="storeId"><option value="">None</option>${S.stores.map((s) => `<option value="${s.id}" ${f.storeId === s.id ? 'selected' : ''}>${esc(s.emoji)} ${esc(s.name)}</option>`).join('')}</select></label>
          <label class="field">💳 Card money goes into<select data-f="payoutAccountId"><option value="">Nobody's account</option>${S.accounts.map((a) => `<option value="${a.id}" ${f.payoutAccountId === a.id ? 'selected' : ''}>${esc(a.owner.name)} · ${esc(bankById(a.bankId)?.name || 'Bank')}</option>`).join('')}</select></label>
        </div>
        <div class="row split">${old ? '<button class="btn danger" data-act="delete">🗑️ Remove</button>' : '<span></span>'}
          <button class="btn huge primary" style="width:auto;flex:1;max-width:320px" data-act="save">✅ Save</button></div>
      </div>`;
    },
    input(t) { if (t.dataset.f) f[t.dataset.f] = t.value; },
    enter() { document.activeElement?.blur(); },
    async act(a, el) {
      if (a === 'emoji') { f.emoji = el.dataset.e; drawModal(); return; }
      if (a === 'rows') { f.rows = Math.max(1, Math.min(8, f.rows + Number(el.dataset.d))); drawModal(); return; }
      if (a === 'per') { f.seatsPerRow = Math.max(1, Math.min(10, f.seatsPerRow + Number(el.dataset.d))); drawModal(); return; }
      if (a === 'price') { f.price = Number(el.dataset.p); drawModal(); return; }
      if (a === 'delete') {
        if (!(await askConfirm(`Remove “${old.name}”?`, { yes: '🗑️ Remove', danger: true }))) return;
        await api('DELETE', `/api/shows/${old.id}`); await loadAll(); closeModal(); render(); return;
      }
      if (a === 'save') {
        if (!f.name.trim()) { toast('Give the show a name ✏️'); return; }
        const body = { ...f, at: new Date(f.at).toISOString(), storeId: f.storeId || null, payoutAccountId: f.payoutAccountId || null };
        if (old) await api('PUT', `/api/shows/${old.id}`, body); else await api('POST', '/api/shows', body);
        await loadAll(); closeModal(); render(); toast(old ? 'Saved ✅' : '🎭 The show is on!');
      }
    },
  };
  openModal(m);
}

// ------------------------------------------------------------------ selling
const sale = (id) => (ui.bo && ui.bo.showId === id ? ui.bo : (ui.bo = { showId: id, customerId: null, seats: [], done: null }));

function seatMap(s, picked = [], { pick = true } = {}) {
  const taken = new Map(ticketsFor(s.id).map((t) => [t.seat, t]));
  return `<div class="stage-label">🎭 STAGE</div><div class="seat-map" style="--per:${s.seatsPerRow}">
    ${[...ROWS.slice(0, s.rows)].map((r) => `<span class="row-label">${r}</span>${Array.from({ length: s.seatsPerRow }, (_, i) => {
      const seat = `${r}${i + 1}`;
      const t = taken.get(seat);
      return `<button class="seat ${t ? (t.usedAt ? 'in' : 'taken') : picked.includes(seat) ? 'picked' : ''}" ${pick ? `data-act="seat" data-seat="${seat}"` : ''} ${t && pick ? 'disabled' : ''} aria-label="Seat ${seat}${t ? ' taken' : ''}">${i + 1}</button>`;
    }).join('')}<span class="row-label">${r}</span>`).join('')}
  </div>`;
}

function viewSell(id) {
  const s = showById(id);
  setAccent('#db2777');
  if (!s) return bar('🎟️ Sell tickets', tabs()) + '<div class="setup"><p class="center">That show is gone.</p></div>';
  const st = sale(id);
  if (st.done) {
    return bar(`${esc(s.emoji)} ${esc(s.name)}`, tabs()) + `<div class="setup"><section class="panel post-sent"><div class="celebrate">🍿</div>
      <h2>Enjoy the show!</h2><p class="center">Seats ${st.done.tickets.map((t) => `<b>${esc(t.seat)}</b>`).join(', ')} for ${esc(st.done.tickets[0].name)}</p>
      ${st.done.printed ? '<p class="center muted">🖨️ The tickets are printing.</p>' : ''}
      <div class="row" style="justify-content:center"><button class="btn" data-act="bo-print">🎟️ ${st.done.printed ? 'Print them again' : 'Print the tickets'}</button><button class="btn primary" data-act="bo-more">🎟️ Sell more</button></div></section></div>`;
  }
  const total = s.price * st.seats.length;
  return bar(`${esc(s.emoji)} ${esc(s.name)}`, tabs()) + `<div class="setup">
    <p class="center muted">${esc(when(s.at))} · ${s.price ? `${money(s.price)} a seat` : 'Free!'}${isPast(s) ? ' · ⚠️ this show was on another day' : ''}</p>
    <section class="panel"><h3>👤 Who are the tickets for? <span class="muted small">(or scan a member card)</span></h3>
      <div class="choices">${S.customers.map((c) => `<button class="choice ${st.customerId === c.id ? 'on' : ''}" data-act="bo-who" data-id="${c.id}"><span class="e">${face(c)}</span>${esc(c.name)}</button>`).join('')}</div></section>
    <section class="panel"><h3>💺 Pick the seats</h3>${seatMap(s, st.seats)}
      <p class="center muted small">🟩 free · 🟦 picked · ⬜ sold</p></section>
    <div class="row split"><span class="pay-total" style="font-size:24px">${st.seats.length} seat${st.seats.length === 1 ? '' : 's'} · <strong style="display:inline">${total ? money(total) : 'Free'}</strong></span>
      <button class="btn huge primary" style="width:auto" data-act="bo-buy" ${st.customerId && st.seats.length ? '' : 'disabled'}>${total ? '💰 Pay & print tickets' : '🎟️ Get the tickets'}</button></div>
  </div>`;
}

async function buy(id) {
  const s = showById(id), st = sale(id);
  const who = S.customers.find((c) => c.id === st.customerId);
  const total = s.price * st.seats.length;
  const finish = async (r) => {
    await loadAll();
    st.done = { tickets: r.tickets, printed: false };
    st.seats = [];
    if (canPrint()) { st.done.printed = true; for (const t of r.tickets) await printSlip(ticketSlip(s, t)).catch((e) => toast(e.message)); }
    render();
  };
  const body = { customerId: st.customerId, seats: st.seats };
  if (!total) { await finish(await api('POST', `/api/shows/${id}/tickets`, body)); sfx.kaching(); return; }
  payBox({
    title: `🎟️ ${st.seats.length} ticket${st.seats.length === 1 ? '' : 's'} for ${esc(who?.name || '')}`,
    lines: st.seats.map((seat) => ({ label: `Seat ${seat}`, amount: s.price })), total, customerId: st.customerId, doneText: 'Tickets paid! 🍿',
    async onPay(pay) { const r = await api('POST', `/api/shows/${id}/tickets`, { ...body, pay }); await finish(r); return r; },
  });
}

export function ticketSlip(s, t) {
  const [, row, n] = /^([A-H])(\d+)$/.exec(t.seat) || [];
  return { title: `Ticket ${t.seat}`, parts: [
    emojiImage(s.emoji || '🎭', 112),
    { t: 'text', s: s.name, size: 2, bold: true, align: 'center' },
    { t: 'text', s: when(s.at), align: 'center' },
    { t: 'rule', ch: '=' },
    { t: 'text', s: ` ROW ${row} - SEAT ${n} `, size: 2, bold: true, invert: true, align: 'center' },
    { t: 'text', s: t.name, align: 'center' },
    { t: 'qr', data: `KH-T-${t.id.toUpperCase()}`, size: 6 },
    { t: 'text', s: `${t.price ? `$${(t.price / 100).toFixed(2)}` : 'FREE'} - keep this ticket! Scan it at the door.`, align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// ------------------------------------------------------------------ the door
function viewDoor(id) {
  const s = showById(id);
  setAccent('#db2777');
  if (!s) return bar('🚪 Door', tabs()) + '<div class="setup"><p class="center">That show is gone.</p></div>';
  const ts = ticketsFor(id);
  const inside = ts.filter((t) => t.usedAt).length;
  const last = ui.door && ui.door.showId === id ? ui.door : null;
  const snack = s.storeId && S.stores.find((x) => x.id === s.storeId);
  return bar(`🚪 ${esc(s.name)}`, `${snack ? `<a class="btn" href="#/cashier/${snack.id}">🍿 <span>Snack bar</span></a>` : ''}${tabs()}`) + `<div class="setup door">
    <div class="door-count">👥 <b>${inside}</b> of ${ts.length} ticket${ts.length === 1 ? '' : 's'} inside</div>
    ${last ? `<section class="door-result ${last.ok ? 'ok' : 'bad'}"><div class="big-mark">${last.ok ? '✅' : '❌'}</div><h2>${esc(last.title)}</h2>${last.sub ? `<p>${esc(last.sub)}</p>` : ''}</section>`
      : '<section class="door-result wait"><div class="big-mark">🎟️</div><h2>Scan tickets at the door</h2></section>'}
    <section class="panel"><h3>💺 Who's in</h3>${seatMap(s, [], { pick: false })}<p class="center muted small">🟥 inside · ⬜ not here yet</p></section>
    ${ts.filter((t) => !t.usedAt).length ? `<section class="panel"><h3>No scanner? Let them in:</h3><div class="row">${ts.filter((t) => !t.usedAt).map((t) => `<button class="btn" data-act="door-let" data-id="${t.id}">${esc(t.seat)} · ${esc(t.name)}</button>`).join('')}</div></section>` : ''}
  </div>`;
}

async function admit(ticketId, showId) {
  try {
    const r = await api('POST', `/api/showtickets/${ticketId}/admit`, { showId });
    const [, row, n] = /^([A-H])(\d+)$/.exec(r.ticket.seat) || [];
    ui.door = { showId, ok: true, title: `Welcome, ${r.ticket.name}!`, sub: `Row ${row}, seat ${n}. Enjoy the show! 🍿` };
    sfx.kaching();
  } catch (e) {
    ui.door = { showId, ok: false, title: e.message };
    sfx.buzz();
  }
  await loadAll(); render();
}

// ------------------------------------------------------------------ scanning
async function ticketsScan(info, r) {
  if (ui.modal) return false;
  if (info.kind === 'showticket') {
    if (r.a === 'door' && r.b) { await admit(info.id, r.b); return true; }
    location.hash = `#/tickets/door/${info.ticket.showId}`;
    await admit(info.id, info.ticket.showId);
    return true;
  }
  if (info.kind === 'person' && r.a === 'sell' && r.b) { sale(r.b).customerId = info.id; sfx.pop(); render(); return true; }
  return false;
}

export const ticketsApp = {
  views: { tickets: (r) => (r.a === 'sell' ? viewSell(r.b) : r.a === 'door' ? viewDoor(r.b) : viewShows()) },
  onScan: ticketsScan,
  // A show ticket scanned on any screen: go to that show's door and let them in.
  async anyScan(info) {
    if (info.kind !== 'showticket' || ui.modal || location.hash.startsWith('#/tickets')) return false;
    location.hash = `#/tickets/door/${info.ticket.showId}`;
    await admit(info.id, info.ticket.showId);
    return true;
  },
  actions: {
    'show-new'() { showModal(null); },
    'show-edit'(el) { const s = showById(el.dataset.id); if (s) showModal(s); },
    'bo-who'(el) { sale(location.hash.split('/')[3]).customerId = el.dataset.id; sfx.pop(); render(); },
    seat(el) {
      const st = sale(location.hash.split('/')[3]);
      const k = el.dataset.seat;
      st.seats = st.seats.includes(k) ? st.seats.filter((x) => x !== k) : [...st.seats, k].slice(0, 20);
      sfx.pop(); render();
    },
    'bo-buy'() { return buy(location.hash.split('/')[3]); },
    'bo-more'() { const st = sale(location.hash.split('/')[3]); st.done = null; render(); },
    'bo-print'() { const s = showById(location.hash.split('/')[3]); const st = ui.bo; if (s && st?.done) printModal(st.done.tickets.map((t) => ticketSlip(s, t)), { title: '🎟️ Tickets' }); },
    'door-let'(el) { return admit(el.dataset.id, location.hash.split('/')[3]); },
  },
};
