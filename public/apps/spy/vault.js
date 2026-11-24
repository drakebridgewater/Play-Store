// 🔐 Vaults: keypad safes with something inside. Kids make vaults with a secret message;
// grown-ups can put play money inside (Setup → Spy HQ), which pays out once.
import { S, ui, esc, api, toast, openModal, drawModal, closeModal, loadAll, render, sfx, money, askConfirm, face } from '../../lib/core.js';
import { agent, spy, spyBar } from './index.js';

const VAULT_EMOJI = ['🔐', '💎', '🏴‍☠️', '👑', '🍪', '🧸', '🦖', '🚀', '🎁', '🗝️', '💰', '🌟'];
const vaultById = (id) => spy().vaults.find((v) => v.id === id);

export function viewVaults(r) {
  if (r.b) return viewVault(r.b);
  return spyBar('🔐 Vaults') + `<div class="spy-body">
    <div class="vault-grid">
      ${spy().vaults.map((v) => `<a class="vault-card ${v.openedAt ? 'open' : ''}" href="#/spy/vault/${v.id}">
        <span class="v-emoji">${esc(v.emoji)}</span><b>${esc(v.name)}</b>
        <small>${v.openedAt ? `🔓 Opened${v.openedBy ? ` by ${esc(v.openedBy)}` : ''}` : `🔒 ${v.length}-number code`}${v.prizeKind === 'bank' && !v.claimed ? ' · 💰 money inside!' : ''}</small></a>`).join('')}
      <button class="vault-card add" data-act="vault-new"><span class="v-emoji">➕</span><b>Make a vault</b><small>Hide a secret message inside</small></button>
    </div>
  </div></div>`;
}

function safe(open) {
  return `<div class="safe ${open ? 'is-open' : ''}" id="safe">
    <div class="safe-inside">${open ? '✨' : ''}</div>
    <div class="safe-door"><div class="safe-dial"><i></i></div><div class="safe-handle"></div><div class="safe-bolts"><b></b><b></b><b></b></div></div>
  </div>`;
}

function viewVault(id) {
  const v = vaultById(id);
  if (!v) return spyBar('🔐 Vault', '', '#/spy/vault') + '<div class="spy-body center"><p>That vault is gone.</p></div></div>';
  const t = (ui.vt && ui.vt.id === id) ? ui.vt : (ui.vt = { id, entry: '', hint: null, tries: 0 });
  const prize = v.prize;
  return spyBar(`${esc(v.emoji)} ${esc(v.name)}`, v.openedAt && v.madeBy === 'kid' && v.prizeKind !== 'bank' ? '<button class="btn" data-act="vault-lock">🔒 Lock it again</button>' : '', '#/spy/vault') + `<div class="spy-body vault-room">
    ${safe(!!v.openedAt)}
    ${v.openedAt ? `<div class="vault-prize">
        <div class="celebrate">🎉</div><h2>The vault is open!</h2>
        ${prize?.text ? `<p class="prize-text">${esc(prize.text)}</p>` : ''}
        ${v.prizeKind === 'bank' ? (v.claimed ? '<p class="muted">The money inside was already taken. 💸</p>'
          : `<p class="prize-money">💰 ${money(v.amount)}</p><button class="btn huge primary" data-act="vault-claim">🏦 Put it in a bank account</button>`) : ''}
        ${v.openedBy ? `<p class="muted">Opened by ${esc(v.openedBy)}</p>` : ''}
      </div>`
    : `<div class="vault-pad">
        <div class="vault-display">${[...Array(v.length).keys()].map((k) => `<span>${t.entry[k] ?? ''}</span>`).join('')}</div>
        ${t.hint != null ? `<p class="vault-hint">${t.hint === 0 ? '🥶 No numbers in the right spot.' : `🔥 ${t.hint} number${t.hint === 1 ? ' is' : 's are'} in the right spot!`}</p>` : `<p class="vault-hint">${v.hints ? 'Type the code. HQ gives hints!' : 'Type the code.'}</p>`}
        <div class="keys vault-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-act="vault-key" data-k="${n}">${n}</button>`).join('')}
          <button data-act="vault-back" aria-label="Delete">⌫</button><button data-act="vault-key" data-k="0">0</button><button data-act="vault-try" class="go">OPEN</button></div>
      </div>`}
  </div></div>`;
}

function claimModal(v) {
  openModal({
    render: () => `<div class="sheet">
      <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
      <h2>💰 Whose bank account gets ${money(v.amount)}?</h2>
      ${S.accounts.length ? `<div class="choices">${S.accounts.map((a) => `<button class="choice" data-act="acct" data-id="${a.id}"><span class="e">${face(a.owner)}</span>${esc(a.owner.name)}</button>`).join('')}</div>`
        : '<p class="center">Nobody has a bank account yet. Open one in the 🏦 Bank first, then come back!</p>'}
    </div>`,
    async act(a, el) {
      if (a !== 'acct') return;
      const r = await api('POST', `/api/spy/vaults/${v.id}/claim`, { accountId: el.dataset.id });
      sfx.kaching(); await loadAll(); closeModal(); render();
      toast(`${money(v.amount)} is in ${r.owner}'s account. ${r.owner} has ${money(r.balance)} now 🏦`);
    },
  });
}

// Kids make vaults with a message inside (money prizes are made in Setup).
export function vaultModal() {
  const f = { name: '', emoji: '🔐', combo: '', text: '', hints: true };
  const m = {
    pin: '',
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>🔐 Make a vault</h2>
        <label class="field">Vault name<input data-f="name" value="${esc(f.name)}" maxlength="40" placeholder="The Secret Safe" autocomplete="off"></label>
        <div class="field">Look<div class="emoji-grid">${VAULT_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
        <label class="field">What's inside? (a secret message)<textarea data-f="text" rows="2" maxlength="300" placeholder="The treasure is under the big tree!">${esc(f.text)}</textarea></label>
        <div class="field">Secret code <span class="muted small">(3 to 6 numbers)</span>
          <div class="vault-display small">${m.pin ? [...m.pin].map((d) => `<span>${d}</span>`).join('') : '<span class="muted">tap the numbers</span>'}</div>
          <div class="pinpad inline"><div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-act="k" data-k="${n}">${n}</button>`).join('')}
            <button data-act="kc" aria-label="Clear">✕</button><button data-act="k" data-k="0">0</button><button data-act="kb" aria-label="Delete">⌫</button></div></div></div>
        <label class="toggle"><input type="checkbox" data-f="hints" ${f.hints ? 'checked' : ''}> 🔥 Give hints (how many numbers are in the right spot)</label>
        <button class="btn huge primary" data-act="save" ${m.pin.length >= 3 ? '' : 'disabled'}>🔒 Lock the vault</button>
      </div>`;
    },
    input(t) { if (t.dataset.f === 'hints') f.hints = t.checked; else if (t.dataset.f) f[t.dataset.f] = t.value; },
    async act(a, el) {
      if (a === 'emoji') { f.emoji = el.dataset.e; drawModal(); return; }
      if (a === 'k') { if (m.pin.length < 6) m.pin += el.dataset.k; sfx.pop(); drawModal(); return; }
      if (a === 'kb') { m.pin = m.pin.slice(0, -1); drawModal(); return; }
      if (a === 'kc') { m.pin = ''; drawModal(); return; }
      if (a === 'save') {
        const r = await api('POST', '/api/spy/vaults', { name: f.name.trim() || 'The Secret Safe', emoji: f.emoji, combo: m.pin, hints: f.hints, prize: { kind: 'message', text: f.text.trim() } });
        await loadAll(); closeModal(); location.hash = `#/spy/vault/${r.id}`;
        toast(`Locked! 🔒 Don't forget the code: ${m.pin}`);
      }
    },
  };
  openModal(m);
}

export const vaultActions = {
  'vault-new'() { vaultModal(); },
  'vault-key'(el) {
    const v = vaultById(ui.vt?.id); if (!v) return;
    if (ui.vt.entry.length < v.length) { ui.vt.entry += el.dataset.k; sfx.pop(); render(); }
  },
  'vault-back'() { if (ui.vt) { ui.vt.entry = ui.vt.entry.slice(0, -1); render(); } },
  async 'vault-try'() {
    const v = vaultById(ui.vt?.id); if (!v) return;
    if (ui.vt.entry.length !== v.length) { toast(`The code has ${v.length} numbers`); return; }
    const r = await api('POST', `/api/spy/vaults/${v.id}/try`, { combo: ui.vt.entry, agentId: agent()?.id || null });
    if (!r.open) {
      sfx.buzz(); ui.vt.hint = r.hint; ui.vt.entry = ''; ui.vt.tries++;
      render(); document.getElementById('safe')?.classList.add('shake');
      return;
    }
    sfx.kaching(); ui.vt = null;
    await loadAll(); render();
  },
  'vault-claim'() { const v = vaultById(location.hash.split('/')[3]); if (v) claimModal(v); },
  async 'vault-lock'() {
    const id = location.hash.split('/')[3];
    if (!(await askConfirm('Lock this vault again so someone else can crack it?', { yes: '🔒 Lock it' }))) return;
    await api('POST', `/api/spy/vaults/${id}/lock`); await loadAll(); render();
  },
};
