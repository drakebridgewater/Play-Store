// 🗺️ Missions (the kid's side): scan the clue cards in order. Each scan shows the next clue,
// some in secret code to crack in the Cipher Lab. The last one gives the vault code.
import { ui, esc, api, toast, render, sfx } from '../../lib/core.js';
import { printModal } from '../../lib/print.js';
import { agent, agentName, spy, spyBar } from './index.js';
import { CIPHERS, encode } from './ciphers.js';
import { openInLab } from './cipher.js';
import { missionLogSlip } from './slips.js';

const missionById = (id) => spy().missions.find((m) => m.id === id);
const agentQ = () => (agent() ? `?agent=${agent().id}` : '');

export function viewMissions(r) {
  if (r.b) return viewMission(r.b);
  const me = agent()?.id || null;
  return spyBar('🗺️ Missions') + `<div class="spy-body">
    ${spy().missions.length ? `<div class="vault-grid">${spy().missions.map((m) => {
      const runs = m.runs.filter((x) => x.agentId === me);
      const live = runs.find((x) => !x.doneAt);
      const done = runs.some((x) => x.doneAt);
      return `<a class="vault-card mission ${done ? 'open' : ''}" href="#/spy/missions/${m.id}"><span class="v-emoji">${esc(m.emoji)}</span><b>${esc(m.name)}</b>
        <small>${live ? `🔎 ${live.found} of ${m.clueCount} clues found` : done ? '✅ Mission complete' : `${m.clueCount} clues · not started`}</small></a>`;
    }).join('')}</div>`
    : '<div class="center-msg"><div class="emoji">🗺️</div><h2>No missions yet</h2><p>Ask a grown-up to make one in ⚙️ Setup → Spy HQ. They print the clue cards and hide them!</p></div>'}
  </div></div>`;
}

function clueCard(c) {
  const coded = c.cipher && c.cipher !== 'none';
  const shown = coded ? encode(c.cipher, c.text, c.shift) : c.text;
  return `<div class="clue-card ${coded ? 'coded' : ''}">
    <div class="clue-n">CLUE ${c.index + 1} of ${c.total}</div>
    <div class="clue-text">${esc(shown)}</div>
    ${coded ? `<div class="clue-code">🔐 ${esc(CIPHERS[c.cipher].name)}${c.cipher === 'caesar' ? `, wheel turned ${c.shift}` : ''}
      <button class="btn" data-act="ms-lab" data-i="${c.index}">🌀 Crack it in the Cipher Lab</button></div>` : ''}
  </div>`;
}

function viewMission(id) {
  const m = missionById(id);
  if (!m) return spyBar('🗺️ Mission', '', '#/spy/missions') + '<div class="spy-body center"><p>That mission is gone.</p></div></div>';
  const st = ui.ms && ui.ms.id === id && ui.ms.agent === (agent()?.id || null) ? ui.ms : null;
  if (!st) {
    ui.ms = { id, agent: agent()?.id || null, found: [], done: null, loading: true };
    api('GET', `/api/spy/missions/${id}/run${agentQ()}`).then((r) => {
      if (ui.ms?.id !== id) return;
      ui.ms.found = r.run ? r.run.found : []; ui.ms.loading = false; render();
    }, () => {});
  }
  const s = ui.ms;
  const total = m.clueCount;
  const next = s.found.length;
  return spyBar(`${esc(m.emoji)} ${esc(m.name)}`, '', '#/spy/missions') + `<div class="spy-body mission-room">
    <div class="ms-progress">${[...Array(total).keys()].map((k) => `<i class="${k < next ? 'got' : k === next && !s.done ? 'now' : ''}"></i>`).join('')}</div>
    ${s.done ? `<div class="ms-done">
        <div class="celebrate">🏆</div><h2>MISSION COMPLETE</h2>
        <p>${esc(agentName())} found all ${total} clues${s.done.seconds != null ? ` in ${Math.floor(s.done.seconds / 60)} min ${s.done.seconds % 60} s` : ''}!</p>
        ${s.done.vaultCode ? `<p class="ms-vault">The code for <b>${esc(s.done.vaultName)}</b> is</p><div class="ms-code">${[...s.done.vaultCode].map((d) => `<span>${d}</span>`).join('')}</div>
          <a class="btn huge primary" href="#/spy/vault/${s.done.vaultId}">🔐 Go open the vault!</a>` : ''}
        <button class="btn" data-act="ms-log">🧾 Print the mission log</button>
      </div>`
    : s.loading ? '<p class="center muted">Contacting HQ…</p>'
    : `<div class="ms-scan"><div class="radar"><i></i></div>
        <h2>${next === 0 ? 'Scan the START HERE card to begin!' : `Find clue card ${next + 1} and scan it!`}</h2>
        <p class="muted">${next === 0 ? 'Your grown-up has it.' : 'The clue below tells you where it is hiding.'}</p></div>`}
    <div class="clue-list">${[...s.found].reverse().map(clueCard).join('')}</div>
  </div></div>`;
}

// A clue card was scanned (anywhere in the Kids Hub).
export async function scanClue({ missionId, clueId }) {
  const m = missionById(missionId);
  const href = `#/spy/missions/${missionId}`;
  if (location.hash !== href) location.hash = href;
  if (!ui.ms || ui.ms.id !== missionId || ui.ms.agent !== (agent()?.id || null)) ui.ms = { id: missionId, agent: agent()?.id || null, found: [], done: null, loading: false };
  try {
    const r = await api('POST', `/api/spy/missions/${missionId}/scan${agentQ()}`, { clueId });
    if (!r.again) ui.ms.found = [...ui.ms.found.filter((c) => c.index !== r.index), r].sort((a, b) => a.index - b.index);
    ui.ms.loading = false;
    if (r.done) { ui.ms.done = r; sfx.kaching(); } else if (r.again) { sfx.pop(); toast('You already found that one 👍'); } else { sfx.bell(); toast(`🗝️ Clue ${r.index + 1} of ${r.total}!`); }
  } catch (e) {
    sfx.buzz(); toast(`🚫 ${e.message}`);
  }
  if (m) render();
}

export const missionActions = {
  'ms-lab'(el) {
    const c = ui.ms?.found.find((x) => x.index === Number(el.dataset.i));
    if (c) openInLab(c.cipher, encode(c.cipher, c.text, c.shift));
  },
  'ms-log'() {
    const m = missionById(ui.ms?.id); if (!m || !ui.ms.done) return;
    printModal(missionLogSlip({ mission: m.name, agentName: agentName(), seconds: ui.ms.done.seconds || 0, clues: m.clueCount }), { title: '🧾 Mission log' });
  },
};
