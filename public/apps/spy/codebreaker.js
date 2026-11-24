// 🔢 Code Breaker: guess the hidden code. After each guess, 🟢 = right symbol in the right spot,
// 🟡 = right symbol in the wrong spot. A grown-up or friend can set the code instead.
import { ui, esc, api, toast, openModal, drawModal, closeModal, render, sfx } from '../../lib/core.js';
import { printModal } from '../../lib/print.js';
import { agent, agentName, spy, spyBar } from './index.js';
import { certificateSlip, sealedSlip } from './slips.js';

const SETS = {
  colors: { name: '🎨 Colors', items: [['#ef4444', 'Red'], ['#f97316', 'Orange'], ['#facc15', 'Yellow'], ['#22c55e', 'Green'], ['#3b82f6', 'Blue'], ['#a855f7', 'Purple'], ['#ec4899', 'Pink'], ['#92400e', 'Brown']] },
  animals: { name: '🐶 Animals', items: [['🐶', 'Dog'], ['🐱', 'Cat'], ['🐭', 'Mouse'], ['🐰', 'Bunny'], ['🦊', 'Fox'], ['🐻', 'Bear'], ['🐼', 'Panda'], ['🐸', 'Frog']] },
  numbers: { name: '🔢 Numbers', items: [['1', 'One'], ['2', 'Two'], ['3', 'Three'], ['4', 'Four'], ['5', 'Five'], ['6', 'Six'], ['7', 'Seven'], ['8', 'Eight']] },
};
const LEVELS = {
  easy: { name: 'Easy', len: 3, syms: 4, repeats: false, tries: 10 },
  medium: { name: 'Medium', len: 4, syms: 6, repeats: false, tries: 10 },
  hard: { name: 'Hard', len: 5, syms: 8, repeats: true, tries: 12 },
};

const sym = (set, i, cls = '') => {
  const [v] = SETS[set].items[i];
  return set === 'colors' ? `<span class="cb-sym color ${cls}" style="--c:${v}"></span>` : `<span class="cb-sym ${cls}">${esc(v)}</span>`;
};

function randomCode(L) {
  const pool = [...Array(L.syms).keys()];
  const out = [];
  while (out.length < L.len) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool[i]);
    if (!L.repeats) pool.splice(i, 1);
  }
  return out;
}

export function score(secret, guess) {
  let green = 0;
  const a = {}, b = {};
  guess.forEach((g, i) => { if (g === secret[i]) green++; else { a[g] = (a[g] || 0) + 1; b[secret[i]] = (b[secret[i]] || 0) + 1; } });
  const yellow = Object.keys(a).reduce((n, k) => n + Math.min(a[k], b[k] || 0), 0);
  return { green, yellow };
}

function newGame(level = ui.cb?.level || 'easy', set = ui.cb?.set || 'colors', secret = null) {
  const L = LEVELS[level];
  ui.cb = { level, set, secret: secret || randomCode(L), rows: [], cur: [], start: Date.now(), done: false, won: false, setBy: secret ? 'friend' : 'hq' };
}

const rankFor = (guesses, len) => (guesses <= len ? 'Master Spy' : guesses <= len + 3 ? 'Ace Agent' : 'Rookie');

export function viewCodeBreaker() {
  if (!ui.cb) newGame();
  const g = ui.cb;
  const L = LEVELS[g.level];
  const left = L.tries - g.rows.length;
  const pegs = (r) => `<span class="cb-pegs" aria-label="${r.green} right spot, ${r.yellow} wrong spot">${'🟢'.repeat(r.green)}${'🟡'.repeat(r.yellow)}${'⚪'.repeat(L.len - r.green - r.yellow)}</span>`;
  const rec = spy().records.find((r) => r.agentId === (agent()?.id || null) && r.level === g.level);
  return spyBar('🔢 Code Breaker', '<button class="btn" data-act="cb-new">🔄 New code</button>') + `<div class="spy-body cb">
    <div class="row cb-opts">
      ${Object.entries(LEVELS).map(([k, l]) => `<button class="btn ${g.level === k ? 'primary' : ''}" data-act="cb-level" data-k="${k}">${l.name}</button>`).join('')}
      <span class="grow"></span>
      ${Object.entries(SETS).map(([k, s]) => `<button class="btn ${g.set === k ? 'primary' : ''}" data-act="cb-set" data-k="${k}">${s.name}</button>`).join('')}
      <button class="btn" data-act="cb-friend">👥 Someone sets the code</button>
    </div>
    <p class="cb-info">Crack the <b>${L.len}-symbol</b> code${g.setBy === 'friend' ? ' your friend set' : ''}! ${L.syms} symbols, ${L.repeats ? 'and symbols can repeat' : 'no repeats'}.
      ${g.done ? '' : `<b>${left}</b> guess${left === 1 ? '' : 'es'} left.`}${rec ? ` <span class="muted">Your best: ${rec.guesses} guesses.</span>` : ''}</p>
    <div class="cb-board">
      ${g.rows.map((r, n) => `<div class="cb-row"><span class="cb-n">${n + 1}</span><span class="cb-guess">${r.guess.map((i) => sym(g.set, i)).join('')}</span>${pegs(r)}</div>`).join('')}
      ${g.done ? `<div class="cb-row secret"><span class="cb-n">🔓</span><span class="cb-guess">${g.secret.map((i) => sym(g.set, i)).join('')}</span><span class="cb-pegs">${g.won ? 'Cracked!' : 'The code'}</span></div>`
        : `<div class="cb-row current"><span class="cb-n">${g.rows.length + 1}</span><span class="cb-guess">${[...Array(L.len).keys()].map((k) => (g.cur[k] !== undefined ? `<button class="cb-slot" data-act="cb-unpick" data-k="${k}">${sym(g.set, g.cur[k])}</button>` : '<span class="cb-slot empty"></span>')).join('')}</span></div>`}
    </div>
    ${g.done ? `<div class="row" style="justify-content:center"><button class="btn huge primary" style="width:auto" data-act="cb-new">🔄 Another code</button></div>` : `
    <div class="cb-palette">${SETS[g.set].items.slice(0, L.syms).map((_, i) => `<button class="cb-pick" data-act="cb-sym" data-i="${i}" ${!L.repeats && g.cur.includes(i) ? 'disabled' : ''}>${sym(g.set, i)}</button>`).join('')}</div>
    <div class="row" style="justify-content:center">
      <button class="btn" data-act="cb-back" ${g.cur.length ? '' : 'disabled'}>⌫ Undo</button>
      <button class="btn huge primary" style="width:auto" data-act="cb-check" ${g.cur.length === L.len ? '' : 'disabled'}>✅ Check</button>
    </div>`}
  </div></div>`;
}

async function win() {
  const g = ui.cb;
  const L = LEVELS[g.level];
  const guesses = g.rows.length;
  const seconds = Math.round((Date.now() - g.start) / 1000);
  const rank = rankFor(guesses, L.len);
  sfx.kaching();
  let best = false;
  if (g.setBy === 'hq') { try { best = (await api('POST', '/api/spy/records', { agentId: agent()?.id || null, level: g.level, guesses, seconds })).best; } catch { /* offline */ } }
  const cert = () => certificateSlip({ agentName: agentName(), guesses, seconds, rank, level: L.name.toLowerCase(), length: L.len });
  const m = {
    render: () => `<div class="sheet center">
      <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
      <div class="celebrate">🎉</div><h2>Code cracked!</h2>
      <p class="pay-total" style="font-size:22px">${guesses} guess${guesses === 1 ? '' : 'es'} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</p>
      <p class="cb-rank">${rank}</p>
      ${best ? '<p>⭐ That\'s your best ever!</p>' : ''}
      <div class="row split"><button class="btn" data-act="cert">🧾 Certificate</button><button class="btn huge primary" style="width:auto;flex:1;max-width:300px" data-act="close">👍 Done</button></div></div>`,
    act(a) { if (a === 'cert') printModal(cert(), { title: '🏆 Certificate', back: () => openModal(m) }); },
  };
  openModal(m);
}

// Someone else picks the code while the code breaker looks away.
function friendModal() {
  const g = ui.cb;
  const L = LEVELS[g.level];
  const m = {
    code: [],
    render() {
      return `<div class="sheet center">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>👀 Look away, code breaker!</h2>
        <p>Pick a ${L.len}-symbol secret code${L.repeats ? '' : ' (no repeats)'}.</p>
        <div class="cb-guess big">${[...Array(L.len).keys()].map((k) => (m.code[k] !== undefined ? sym(g.set, m.code[k]) : '<span class="cb-slot empty"></span>')).join('')}</div>
        <div class="cb-palette">${SETS[g.set].items.slice(0, L.syms).map((_, i) => `<button class="cb-pick" data-act="p" data-i="${i}" ${(!L.repeats && m.code.includes(i)) || m.code.length >= L.len ? 'disabled' : ''}>${sym(g.set, i)}</button>`).join('')}</div>
        <div class="row split"><button class="btn" data-act="undo" ${m.code.length ? '' : 'disabled'}>⌫ Undo</button>
          <button class="btn" data-act="seal" ${m.code.length === L.len ? '' : 'disabled'}>🧾 Print it sealed</button>
          <button class="btn huge primary" style="width:auto" data-act="go" ${m.code.length === L.len ? '' : 'disabled'}>🔒 Hide it & play</button></div>
      </div>`;
    },
    act(a, el) {
      if (a === 'p') { m.code.push(Number(el.dataset.i)); sfx.pop(); drawModal(); return; }
      if (a === 'undo') { m.code.pop(); drawModal(); return; }
      if (a === 'seal') { printModal(sealedSlip(m.code.map((i) => SETS[g.set].items[i][1])), { title: '🧾 Sealed code', back: () => openModal(m) }); return; }
      if (a === 'go') { newGame(g.level, g.set, m.code); closeModal(); render(); toast('Code hidden! 🔒 Start guessing.'); }
    },
  };
  openModal(m);
}

export const cbActions = {
  'cb-new'() { newGame(); render(); },
  'cb-level'(el) { newGame(el.dataset.k, ui.cb.set); render(); },
  'cb-set'(el) { newGame(ui.cb.level, el.dataset.k); render(); },
  'cb-friend'() { friendModal(); },
  'cb-sym'(el) { const g = ui.cb; if (g.cur.length < LEVELS[g.level].len) { g.cur.push(Number(el.dataset.i)); sfx.pop(); render(); } },
  'cb-unpick'(el) { ui.cb.cur.splice(Number(el.dataset.k), 1); render(); },
  'cb-back'() { ui.cb.cur.pop(); render(); },
  async 'cb-check'() {
    const g = ui.cb;
    const L = LEVELS[g.level];
    if (g.cur.length !== L.len || g.done) return;
    const r = { guess: [...g.cur], ...score(g.secret, g.cur) };
    g.rows.push(r); g.cur = [];
    if (r.green === L.len) { g.done = true; g.won = true; render(); await win(); return; }
    if (g.rows.length >= L.tries) { g.done = true; sfx.buzz(); render(); toast('Out of guesses! Here was the code 🔓'); return; }
    sfx.pop(); render();
  },
};
