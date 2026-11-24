// 🕵️ Spy HQ: the HQ screen, agents and badges, and routing to Code Breaker, Cipher Lab,
// Vaults and Missions. Spy screens use a dark "night ops" look (class spy).
import { S, ui, esc, bar, setAccent, api, toast, openModal, drawModal, closeModal, loadAll, render, sfx, lsGet, lsSet, askConfirm, PEOPLE_EMOJI, face } from '../../lib/core.js';
import { readFile, shrinkPhoto } from '../../lib/photo.js';
import { printModal } from '../../lib/print.js';
import { badgeSlip } from './slips.js';
import { viewCodeBreaker, cbActions } from './codebreaker.js';
import { viewCipher, cipherActions, cipherAfterRender, cipherInput, loadSecret } from './cipher.js';
import { viewVaults, vaultActions } from './vault.js';
import { viewMissions, missionActions, scanClue } from './missions.js';

export const spy = () => S.spy || { agents: [], records: [], vaults: [], missions: [], places: [] };
export const agent = () => spy().agents.find((a) => a.id === lsGet('spyAgent')) || null;
export const agentName = () => (agent() ? `Agent ${agent().codename}` : 'Mystery Agent');
export const spyBar = (title, right = '', back = '#/spy') => `<div class="spy">${bar(title, right, back)}`;

const ADJ = ['Silver', 'Shadow', 'Midnight', 'Golden', 'Secret', 'Thunder', 'Velvet', 'Ninja', 'Turbo', 'Cosmic', 'Silent', 'Sneaky', 'Lucky', 'Rocket', 'Crystal', 'Iron', 'Stealthy', 'Mighty'];
const ANIMAL = ['Fox', 'Owl', 'Panther', 'Falcon', 'Wolf', 'Tiger', 'Gecko', 'Shark', 'Raven', 'Cobra', 'Lynx', 'Otter', 'Badger', 'Hawk', 'Penguin', 'Dragon', 'Moose', 'Octopus'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const codename = () => `${pick(ADJ)} ${pick(ANIMAL)}`;
const AGENT_EMOJI = ['🕵️', '🦊', '🦉', '🐆', '🦅', '🐺', '🐯', '🦎', '🦈', '🐍', '🐧', '🐉', '🥷', '🦸', '🤖', '👽'];

const agentFace = (a) => (a?.photo ? `<img class="face-img" src="${esc(a.photo)}" alt="" data-emoji="${esc(a.emoji || '🕵️')}">` : esc(a?.emoji || '🕵️'));

// ------------------------------------------------------------------ HQ
function viewHQ() {
  setAccent('#22c55e');
  const a = agent();
  const tiles = [
    ['#/spy/codebreaker', '🔢', 'Code Breaker', '#2563eb'],
    ['#/spy/cipher', '🌀', 'Cipher Lab', '#9333ea'],
    ['#/spy/vault', '🔐', 'Vaults', '#ca8a04'],
    ['#/spy/missions', '🗺️', 'Missions', '#dc2626'],
    ['#/spy/agents', '🪪', 'Agents', '#0891b2'],
  ];
  return spyBar('🕵️ Spy HQ', '', '#/') + `<div class="spy-body">
    <section class="agent-on-duty">
      ${a ? `<span class="pic">${agentFace(a)}</span><div class="grow"><small>ON DUTY</small><b>Agent ${esc(a.codename)}</b><small>No. ${esc(a.number)}</small></div>
        <button class="btn" data-act="spy-switch">🔄 Switch</button>`
        : `<div class="grow"><b>Who's on duty?</b><small>Pick your agent, or scan your badge 🪪</small></div>
        ${spy().agents.slice(0, 6).map((x) => `<button class="btn" data-act="spy-pick" data-id="${x.id}">${esc(x.emoji || '🕵️')} ${esc(x.codename)}</button>`).join('')}
        <button class="btn primary" data-act="agent-new">➕ New agent</button>`}
    </section>
    <nav class="app-grid">${tiles.map(([href, e, name, c]) => `<a class="app-tile" href="${href}" style="--c:${c}"><span class="app-icon">${e}</span><span class="app-name">${name}</span></a>`).join('')}</nav>
  </div></div>`;
}

// ------------------------------------------------------------------ agents
function viewAgents() {
  setAccent('#22c55e');
  const recs = spy().records;
  return spyBar('🪪 Agents') + `<div class="spy-body">
    <div class="agent-grid">
      ${spy().agents.map((a) => {
        const best = recs.filter((r) => r.agentId === a.id).map((r) => `${r.level}: ${r.guesses}`).join(' · ');
        return `<div class="agent-card ${a.id === lsGet('spyAgent') ? 'on' : ''}">
          <span class="pic">${agentFace(a)}</span><b>Agent ${esc(a.codename)}</b><small>No. ${esc(a.number)}${best ? ` · 🔢 best ${esc(best)}` : ''}</small>
          <div class="row" style="justify-content:center">
            <button class="btn" data-act="spy-pick" data-id="${a.id}">${a.id === lsGet('spyAgent') ? '✅ On duty' : 'On duty'}</button>
            <button class="btn" data-act="agent-badge" data-id="${a.id}">🪪 Badge</button>
            <button class="btn icon" data-act="agent-edit" data-id="${a.id}" aria-label="Change">✏️</button>
          </div></div>`;
      }).join('')}
      <button class="agent-card add" data-act="agent-new"><span class="pic">➕</span><b>New agent</b></button>
    </div></div></div>`;
}

function agentModal(old) {
  const f = old ? { codename: old.codename, emoji: old.emoji, photo: old.photo || null, customerId: old.customerId } : { codename: codename(), emoji: '🕵️', photo: null, customerId: null };
  const m = {
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${old ? '✏️ Change agent' : '🕵️ New agent'}</h2>
        <div class="preview"><div class="person big"><span class="pic">${agentFace(f)}</span><span>Agent ${esc(f.codename)}</span></div></div>
        <label class="field">Codename<div class="row"><input data-f="codename" value="${esc(f.codename)}" maxlength="40" autocomplete="off" style="flex:1"><button class="btn" data-act="roll">🎲 New name</button></div></label>
        <div class="row" style="justify-content:center"><button class="btn" data-act="photo-cam">📷 Photo</button><button class="btn" data-act="photo-pick">🖼️ Pick</button>${f.photo ? '<button class="btn danger" data-act="photo-del">No photo</button>' : ''}</div>
        <div class="field">Spy face<div class="emoji-grid">${AGENT_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
        <div class="field">Who is it, really? <span class="muted small">(top secret)</span><div class="choices">
          ${S.customers.map((c) => `<button class="choice ${f.customerId === c.id ? 'on' : ''}" data-act="who" data-id="${c.id}"><span class="e">${face(c)}</span>${esc(c.name)}</button>`).join('')}</div></div>
        <div class="row split">${old ? '<button class="btn danger" data-act="delete">🗑️ Retire</button>' : '<span></span>'}
          <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="save">✅ Save</button></div>
      </div>`;
    },
    input(t) { if (t.dataset.f === 'codename') f.codename = t.value; },
    enter() { document.activeElement?.blur(); },
    async act(a, el) {
      if (a === 'roll') { f.codename = codename(); sfx.pop(); drawModal(); return; }
      if (a === 'emoji') { f.emoji = el.dataset.e; drawModal(); return; }
      if (a === 'who') { f.customerId = f.customerId === el.dataset.id ? null : el.dataset.id; drawModal(); return; }
      if (a === 'photo-del') { f.photo = null; drawModal(); return; }
      if (a === 'photo-cam' || a === 'photo-pick') {
        const file = await readFile(a === 'photo-cam'); if (!file) return;
        try { f.photo = await shrinkPhoto(file); } catch { toast("Couldn't read that photo"); return; }
        if (ui.modal === m) drawModal(); return;
      }
      if (a === 'delete') {
        if (!(await askConfirm(`Retire Agent ${old.codename}?`, { yes: '🗑️ Retire', danger: true }))) return;
        await api('DELETE', `/api/spy/agents/${old.id}`); await loadAll(); closeModal(); render(); return;
      }
      if (a === 'save') {
        if (!f.codename.trim()) { toast('Every agent needs a codename'); return; }
        const saved = old ? await api('PUT', `/api/spy/agents/${old.id}`, f) : await api('POST', '/api/spy/agents', f);
        if (!old) lsSet('spyAgent', saved.id);
        await loadAll(); closeModal(); render();
        if (!old) { accessGranted(saved); printModal(await badgeSlip(saved), { title: '🪪 Your agent badge' }); }
      }
    },
  };
  openModal(m);
}

// The big green "ACCESS GRANTED" moment when a badge is scanned.
function accessGranted(a) {
  const el = document.createElement('div');
  el.className = 'access-granted';
  el.innerHTML = `<div><div class="ag-pic">${agentFace(a)}</div><div class="ag-title">ACCESS GRANTED</div><div class="ag-name">Welcome, Agent ${esc(a.codename)}</div></div>`;
  document.body.appendChild(el);
  sfx.kaching();
  el.addEventListener('click', () => el.remove());
  setTimeout(() => el.remove(), 2200);
}

const SUB = { codebreaker: viewCodeBreaker, cipher: viewCipher, vault: viewVaults, missions: viewMissions, agents: viewAgents };

export const spyApp = {
  views: { spy: (r) => (SUB[r.a] ? SUB[r.a](r) : viewHQ()) },
  actions: {
    ...cbActions, ...cipherActions, ...vaultActions, ...missionActions,
    'spy-pick'(el) { lsSet('spyAgent', el.dataset.id); const a = agent(); sfx.pop(); if (a) toast(`Agent ${a.codename} is on duty 🕵️`); render(); },
    'spy-switch'() { lsSet('spyAgent', ''); render(); },
    'agent-new'() { agentModal(null); },
    'agent-edit'(el) { const a = spy().agents.find((x) => x.id === el.dataset.id); if (a) agentModal(a); },
    async 'agent-badge'(el) { const a = spy().agents.find((x) => x.id === el.dataset.id); if (a) printModal(await badgeSlip(a), { title: '🪪 Agent badge' }); },
  },
  afterRender(r) { if (r.view === 'spy' && r.a === 'cipher') cipherAfterRender(); },
  onInput(e, r) { if (r.view === 'spy' && r.a === 'cipher') cipherInput(e); },
  // Spy codes work anywhere in the Kids Hub: badges log in, clue cards and secret messages open
  // the right Spy HQ screen.
  async anyScan(info) {
    if (ui.modal) return false;
    if (info.kind === 'agent') {
      const a = spy().agents.find((x) => x.id === info.id);
      if (!a) return false;
      lsSet('spyAgent', a.id);
      if (!location.hash.startsWith('#/spy')) location.hash = '#/spy'; else render();
      accessGranted(a);
      return true;
    }
    if (info.kind === 'clue') { await scanClue(info.clue); return true; }
    if (info.kind === 'secret') { loadSecret(info.secret); return true; }
    return false;
  },
};
