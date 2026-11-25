// ⚙️ Setup → Spy HQ (grown-ups): build missions (or a quick one from house places), print the
// clue cards, and make vaults, including ones with play money inside.
import { S, ui, esc, api, toast, openModal, drawModal, closeModal, loadAll, render, money, askConfirm } from '../../lib/core.js';
import { printModal } from '../../lib/print.js';
import { CIPHERS } from './ciphers.js';
import { clueCardSlips } from './slips.js';
import { guideModal } from './guide.js';

// Hiding places with a riddle each, for quick missions. The riddle points at the place.
const PLACES = [
  { name: 'Fridge', spot: 'on the fridge door', riddle: "I'm cold inside and full of snacks. Look on my door, then hurry back!" },
  { name: 'Couch', spot: 'under a couch cushion', riddle: 'Where do you sit to watch a show? Look under a cushion, down below!' },
  { name: 'Bed', spot: 'under your pillow', riddle: 'Where do you sleep and dream all night? Under your pillow, out of sight!' },
  { name: 'Bathtub', spot: 'by the bathtub', riddle: 'Splish, splash, bubbles galore. Your clue is by the tub, for sure!' },
  { name: 'Front door', spot: 'by the front door', riddle: 'People come in and people go out. Check by the front door, without a doubt!' },
  { name: 'Bookshelf', spot: 'on the bookshelf', riddle: 'I hold many stories, tall and small. Look on my shelves, I know them all!' },
  { name: 'Shoes', spot: 'inside a shoe', riddle: 'Your feet go in me every day. Peek inside before you play!' },
  { name: 'Toy box', spot: 'in the toy box', riddle: 'Blocks and cars and teddy bears. Dig in the toy box, if you dare!' },
  { name: 'Washing machine', spot: 'on the washing machine', riddle: 'I spin and swish your socks so clean. Look on top of the washing machine!' },
  { name: 'Plant', spot: 'by a plant', riddle: 'I drink water and love the sun. Look by my pot, this clue is fun!' },
  { name: 'Mailbox', spot: 'in the mailbox', riddle: 'Letters come to me each day. Check inside, then on your way!' },
  { name: 'Desk', spot: 'in a desk drawer', riddle: 'Pencils, paper, crayons too. Open my drawer, the clue is for you!' },
  { name: 'Coats', spot: 'in a coat pocket', riddle: 'I keep you warm when it is cold. Check my pocket, be brave and bold!' },
  { name: 'Table', spot: 'under the kitchen table', riddle: 'Where we eat our breakfast and lunch. Look underneath, I have a hunch!' },
  { name: 'Oven mitt', spot: 'in an oven mitt', riddle: 'I keep hands safe from heat so hot. Look inside me, is it there or not?' },
  { name: 'Car', spot: 'by the car', riddle: 'Vroom vroom, I take you far. Look near the family car!' },
];

const admin = () => ui.spyAdmin;
async function loadAdmin() {
  ui.spyAdminLoading = true;
  try { ui.spyAdmin = await api('GET', '/api/spy/admin', undefined, { pin: true }); ui.spyAdminAt = Date.now(); } catch { ui.spyAdmin = null; }
  ui.spyAdminLoading = false;
  render();
}
async function reload() { await loadAll(); await loadAdmin(); }

export function spyPanel() {
  if (admin() && Date.now() - (ui.spyAdminAt || 0) > 10_000 && !ui.spyAdminLoading) loadAdmin(); // fresh when coming back to Setup
  if (!admin()) {
    if (!ui.spyAdminLoading) loadAdmin();
    return '<section class="panel"><h3>🕵️ Spy HQ</h3><p class="muted">Loading…</p></section>';
  }
  const { missions, vaults } = admin();
  const vname = (id) => vaults.find((v) => v.id === id)?.name;
  return `<section class="panel">
    <h3><span class="grow">🕵️ Spy HQ missions</span><button class="btn" data-act="sp-guide">🧑‍🏫 How it works</button><button class="btn" data-act="sp-quick">⚡ Quick mission</button><button class="btn primary" data-act="sp-mission-new">➕ New mission</button></h3>
    <p class="muted">Print the clue cards, hide them, and hand over the START HERE card. Scanning a card shows its clue, in order only. The last clue gives the vault code.</p>
    <div class="list">${missions.length ? missions.map((m) => {
      const done = m.runs.filter((r) => r.doneAt).length;
      return `<div class="list-row"><span class="e">${esc(m.emoji)}</span>
        <span class="grow">${esc(m.name)}<small>${m.clues.length} clues${m.vaultId ? ` · ends at 🔐 ${esc(vname(m.vaultId) || 'a vault')}` : ' · no vault'}${m.runs.length ? ` · played ${m.runs.length}×, finished ${done}×` : ''}</small></span>
        <button class="btn" data-act="sp-cards" data-id="${m.id}">🖨️ Clue cards</button>
        <button class="btn" data-act="sp-mission-edit" data-id="${m.id}">✏️ Edit</button>
        ${m.runs.length ? `<button class="btn icon" data-act="sp-mission-reset" data-id="${m.id}" aria-label="Play again from the start">🔄</button>` : ''}
      </div>`;
    }).join('') : '<p class="muted">No missions yet.</p>'}</div>
    <h3 style="margin-top:14px"><span class="grow">🔐 Vaults</span><button class="btn" data-act="sp-vault-new">➕ New vault</button></h3>
    <div class="list">${vaults.length ? vaults.map((v) => `<div class="list-row"><span class="e">${esc(v.emoji)}</span>
        <span class="grow">${esc(v.name)} · code <b>${esc(v.combo)}</b><small>${v.prize.kind === 'bank' ? `💰 ${money(v.prize.amount)}${v.claimedAt ? ' (taken)' : ''}` : `💬 “${esc(v.prize.text)}”`} · ${v.openedAt ? `🔓 opened${v.openedBy ? ` by ${esc(v.openedBy)}` : ''}` : '🔒 locked'}${v.madeBy === 'kid' ? ' · made by a kid' : ''}</small></span>
        ${v.openedAt ? `<button class="btn" data-act="sp-vault-lock" data-id="${v.id}">🔒 Lock${v.prize.kind === 'bank' && v.claimedAt ? ' & refill' : ''}</button>` : ''}
        <button class="btn" data-act="sp-vault-edit" data-id="${v.id}">✏️ Edit</button></div>`).join('') : '<p class="muted">No vaults yet.</p>'}</div>
  </section>`;
}

// ------------------------------------------------------------------ mission editor
function missionModal(old, preset = null) {
  const src = preset || old;
  const f = src ? { name: src.name, emoji: src.emoji, vaultId: src.vaultId || '', clues: src.clues.map((c) => ({ ...c })) }
    : { name: 'Secret Mission', emoji: '🗺️', vaultId: admin().vaults[0]?.id || '', clues: [{ text: '', cipher: 'none', shift: 3, spot: 'give to the agent' }] };
  const m = {
    render() {
      return `<div class="sheet wide">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${old ? '✏️ Edit mission' : '🗺️ New mission'}</h2>
        <div class="form-grid">
          <label class="field">Mission name<input data-mf="name" value="${esc(f.name)}" maxlength="40"></label>
          <label class="field">Emoji<input data-mf="emoji" value="${esc(f.emoji)}" maxlength="16"></label>
          <label class="field">Ends at the vault
            <select data-mf="vaultId"><option value="">No vault</option>${admin().vaults.map((v) => `<option value="${v.id}" ${f.vaultId === v.id ? 'selected' : ''}>${esc(v.emoji)} ${esc(v.name)} (code ${esc(v.combo)})</option>`).join('')}</select></label>
        </div>
        <ol class="clue-edit">${f.clues.map((c, i) => `<li>
          <div class="row"><b class="grow">Card ${i + 1}${i === 0 ? ' · START HERE (hand it over)' : ''}${i === f.clues.length - 1 && f.clues.length > 1 ? ' · last card' : ''}</b>
            <button class="btn icon" data-act="up" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button>
            <button class="btn icon" data-act="down" data-i="${i}" ${i < f.clues.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button>
            <button class="btn icon danger" data-act="del" data-i="${i}" ${f.clues.length > 1 ? '' : 'disabled'} aria-label="Remove">✕</button></div>
          <textarea data-ci="${i}" data-k="text" rows="2" maxlength="300" placeholder="What the clue says, e.g. where the next card is hiding">${esc(c.text)}</textarea>
          <div class="form-grid">
            <label class="field">Secret code<select data-ci="${i}" data-k="cipher"><option value="none">None, plain words</option>${['caesar', 'backwards', 'numbers'].map((k) => `<option value="${k}" ${c.cipher === k ? 'selected' : ''}>${CIPHERS[k].emoji} ${CIPHERS[k].name}</option>`).join('')}</select></label>
            ${c.cipher === 'caesar' ? `<label class="field">Wheel turns<input type="number" min="1" max="25" data-ci="${i}" data-k="shift" value="${c.shift || 3}"></label>` : ''}
            <label class="field">Where you hide this card<input data-ci="${i}" data-k="spot" value="${esc(c.spot || '')}" maxlength="80" placeholder="under the couch"></label>
          </div></li>`).join('')}</ol>
        <div class="row split"><button class="btn" data-act="add" ${f.clues.length < 12 ? '' : 'disabled'}>➕ Add a card</button>
          ${old ? '<button class="btn danger" data-act="delete">🗑️ Delete mission</button>' : ''}</div>
        <p class="muted small">After the last card, HQ shows the vault's code. Each card's clue should say where the <i>next</i> card is hiding.</p>
        <button class="btn huge primary" data-act="save">💾 Save, then print the cards</button>
      </div>`;
    },
    input(t) {
      if (t.dataset.mf) f[t.dataset.mf] = t.value;
      if (t.dataset.ci !== undefined) {
        const c = f.clues[Number(t.dataset.ci)];
        c[t.dataset.k] = t.dataset.k === 'shift' ? Number(t.value) || 3 : t.value;
        if (t.dataset.k === 'cipher') drawModal();
      }
    },
    async act(a, el) {
      const i = Number(el.dataset.i);
      const swap = (x, y) => { [f.clues[x], f.clues[y]] = [f.clues[y], f.clues[x]]; drawModal(); };
      if (a === 'up') return swap(i, i - 1);
      if (a === 'down') return swap(i, i + 1);
      if (a === 'del') { f.clues.splice(i, 1); drawModal(); return; }
      if (a === 'add') { f.clues.push({ text: '', cipher: 'none', shift: 3, spot: '' }); drawModal(); return; }
      if (a === 'delete') {
        if (!(await askConfirm(`Delete the mission “${old.name}”?`, { yes: '🗑️ Delete', danger: true }))) return;
        await api('DELETE', `/api/spy/missions/${old.id}`, undefined, { pin: true }); await reload(); closeModal(); return;
      }
      if (a === 'save') {
        if (f.clues.some((c) => !c.text.trim())) { toast('Every card needs a clue ✏️'); return; }
        const saved = old ? await api('PUT', `/api/spy/missions/${old.id}`, f, { pin: true }) : await api('POST', '/api/spy/missions', f, { pin: true });
        await reload();
        printModal(clueCardSlips(saved), { title: `🖨️ Clue cards: ${esc(saved.name)}` });
      }
    },
  };
  openModal(m);
}

// ⚡ Quick mission: pick hiding places in order; HQ writes rhyming clues for them.
function quickModal() {
  const custom = (S.spy?.places || []).map((p) => ({ name: p, spot: p, riddle: `Your next clue is hiding ${p}. Go find it, agent!` }));
  const all = [...PLACES, ...custom];
  const m = {
    order: [], coded: true, vaultId: admin().vaults[0]?.id || '',
    render() {
      return `<div class="sheet wide">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>⚡ Quick mission</h2>
        <p class="center muted">Tap 3 to 8 hiding places, in the order the agent should find them.</p>
        <div class="place-picks">${all.map((p, i) => { const n = m.order.indexOf(i); return `<button class="tag-pick ${n >= 0 ? 'on' : ''}" data-act="p" data-i="${i}">${n >= 0 ? `<b class="pick-n">${n + 1}</b>` : ''}<span>${esc(p.name)}</span><small>${esc(p.spot)}</small></button>`; }).join('')}</div>
        <label class="field">Ends at the vault<select data-q="vault"><option value="">No vault</option>${admin().vaults.map((v) => `<option value="${v.id}" ${m.vaultId === v.id ? 'selected' : ''}>${esc(v.emoji)} ${esc(v.name)}</option>`).join('')}</select></label>
        <label class="toggle"><input type="checkbox" data-q="coded" ${m.coded ? 'checked' : ''}> 🌀 Make every other clue a secret code (cipher wheel, turned 3)</label>
        <button class="btn huge primary" data-act="go" ${m.order.length >= 3 ? '' : 'disabled'}>✨ Write the clues (${m.order.length} places)</button>
      </div>`;
    },
    input(t) { if (t.dataset.q === 'coded') m.coded = t.checked; if (t.dataset.q === 'vault') m.vaultId = t.value; },
    act(a, el) {
      if (a === 'p') {
        const i = Number(el.dataset.i); const n = m.order.indexOf(i);
        if (n >= 0) m.order.splice(n, 1); else if (m.order.length < 8) m.order.push(i);
        drawModal(); return;
      }
      if (a === 'go') {
        const places = m.order.map((i) => all[i]);
        // Card 1 is handed over and points at place 1; card k is hidden at place k-1 and points at place k.
        const clues = places.map((p, k) => ({ text: p.riddle, cipher: m.coded && k % 2 === 1 ? 'caesar' : 'none', shift: 3, spot: k === 0 ? 'give to the agent' : places[k - 1].spot }));
        clues.push({ text: 'You found the last clue! Agent, you are a superstar.', cipher: 'none', shift: 3, spot: places.at(-1).spot });
        missionModal(null, { name: `Mission ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`, emoji: '⚡', vaultId: m.vaultId, clues });
      }
    },
  };
  openModal(m);
}

// ------------------------------------------------------------------ vault editor (money allowed)
function vaultModal(old) {
  const f = old ? { name: old.name, emoji: old.emoji, combo: old.combo, kind: old.prize.kind, amount: old.prize.amount || 500, text: old.prize.text || '', hints: old.hints }
    : { name: 'The Big Vault', emoji: '💰', combo: String(Math.floor(1000 + Math.random() * 9000)), kind: 'bank', amount: 500, text: 'Mission accomplished!', hints: true };
  const m = {
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${old ? '✏️ Edit vault' : '🔐 New vault'}</h2>
        <div class="form-grid">
          <label class="field">Name<input data-v="name" value="${esc(f.name)}" maxlength="40"></label>
          <label class="field">Emoji<input data-v="emoji" value="${esc(f.emoji)}" maxlength="16"></label>
          <label class="field">Code (3 to 6 numbers)<input data-v="combo" value="${esc(f.combo)}" inputmode="numeric" maxlength="6"></label>
        </div>
        <div class="field">What's inside?<div class="row">
          <button class="btn ${f.kind === 'bank' ? 'primary' : ''}" data-act="kind" data-k="bank">💰 Play money</button>
          <button class="btn ${f.kind === 'message' ? 'primary' : ''}" data-act="kind" data-k="message">💬 A message</button></div></div>
        ${f.kind === 'bank' ? `<label class="field">Amount in $<input data-v="amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${(f.amount / 100).toFixed(2)}"></label>
          <p class="muted small">Whoever opens it puts the money in a bank account, once. Lock & refill it here to play again.</p>` : ''}
        <label class="field">${f.kind === 'bank' ? 'Note with the money (optional)' : 'The message'}<textarea data-v="text" rows="2" maxlength="300">${esc(f.text)}</textarea></label>
        <label class="toggle"><input type="checkbox" data-v="hints" ${f.hints ? 'checked' : ''}> 🔥 Give hints (how many numbers are in the right spot)</label>
        <div class="row split">${old ? '<button class="btn danger" data-act="delete">🗑️ Delete vault</button>' : '<span></span>'}
          <button class="btn huge primary" style="width:auto;flex:1;max-width:320px" data-act="save">💾 Save</button></div>
      </div>`;
    },
    input(t) {
      const k = t.dataset.v; if (!k) return;
      f[k] = k === 'hints' ? t.checked : k === 'amount' ? Math.round(parseFloat(t.value) * 100) || 0 : t.value;
    },
    async act(a, el) {
      if (a === 'kind') { f.kind = el.dataset.k; drawModal(); return; }
      if (a === 'delete') {
        if (!(await askConfirm(`Delete ${old.name}?`, { yes: '🗑️ Delete', danger: true }))) return;
        await api('DELETE', `/api/spy/vaults/${old.id}`, undefined, { pin: true }); await reload(); closeModal(); return;
      }
      if (a === 'save') {
        const body = { name: f.name, emoji: f.emoji, combo: f.combo, hints: f.hints, prize: { kind: f.kind, amount: f.amount, text: f.text } };
        if (old) await api('PUT', `/api/spy/vaults/${old.id}`, body, { pin: true }); else await api('POST', '/api/spy/vaults', body, { pin: true });
        await reload(); closeModal(); toast('Vault saved 🔐');
      }
    },
  };
  openModal(m);
}

const missionOf = (el) => admin()?.missions.find((x) => x.id === el.dataset.id);
const vaultOf = (el) => admin()?.vaults.find((x) => x.id === el.dataset.id);

export const spyAdminActions = {
  'sp-guide'() { guideModal('missions'); },
  'sp-mission-new'() { missionModal(null); },
  'sp-quick'() { quickModal(); },
  'sp-mission-edit'(el) { const m = missionOf(el); if (m) missionModal(m); },
  'sp-cards'(el) { const m = missionOf(el); if (m) printModal(clueCardSlips(m), { title: `🖨️ Clue cards: ${esc(m.name)}` }); },
  async 'sp-mission-reset'(el) {
    const m = missionOf(el); if (!m) return;
    if (!(await askConfirm(`Start “${m.name}” over for everyone?`, { yes: '🔄 Start over' }))) return;
    await api('POST', `/api/spy/missions/${m.id}/reset`, undefined, { pin: true }); await reload();
  },
  'sp-vault-new'() { vaultModal(null); },
  'sp-vault-edit'(el) { const v = vaultOf(el); if (v) vaultModal(v); },
  async 'sp-vault-lock'(el) {
    const v = vaultOf(el); if (!v) return;
    await api('POST', `/api/spy/vaults/${v.id}/lock`, undefined, { pin: true }); await reload(); toast('Locked again 🔒');
  },
};
export const spyAdminReset = () => { ui.spyAdmin = null; };
