// ⚙️ Setup → Post Office (grown-ups): the places mail can go (rooms and pretend places, each with
// a printed door sign), postage prices, where card postage goes, and auto-printed labels.
import { S, ui, esc, api, render, toast, loadAll } from '../../lib/core.js';
import { printModal } from '../../lib/print.js';
import { bankById } from '../bank.js';
import { post } from './index.js';
import { doorSignSlips } from './slips.js';

const RATES = [['letter', '✉️ Letter'], ['small', '📦 Small box'], ['big', '📦 Big box'], ['giant', '📦 Giant box'], ['perPound', '⚖️ Each pound over 1'],
  ['fragile', '⚠️ Fragile'], ['express', '⚡ Express'], ['signature', '✍️ Signature'], ['far', '🌍 Far-away place']];

function draft() {
  const p = post();
  ui.pof ||= { places: p.places.map((x) => ({ ...x })), rates: { ...p.settings.rates }, payoutAccountId: p.settings.payoutAccountId || '', autoLabel: p.settings.autoLabel };
  return ui.pof;
}

export function postPanel() {
  const f = draft();
  return `<section class="panel">
    <h3><span class="grow">📦 Post Office places</span><button class="btn" data-act="pof-signs">🖨️ Door signs</button><button class="btn" data-act="pof-add">➕ Add a place</button></h3>
    <p class="muted">Rooms of the house and pretend places. Print a door sign for each and tape it up: the mail carrier scans it to deliver. Far-away places cost extra postage.</p>
    <div class="list">${f.places.map((p, i) => `<div class="list-row">
        <b class="zone">${String.fromCharCode(65 + i)}</b>
        <input class="emoji-in" data-pof-place="${i}" data-k="emoji" value="${esc(p.emoji)}" maxlength="16" aria-label="Emoji">
        <input class="grow-in" data-pof-place="${i}" data-k="name" value="${esc(p.name)}" maxlength="40" aria-label="Place name">
        <label class="toggle small"><input type="checkbox" data-pof-place="${i}" data-k="far" ${p.far ? 'checked' : ''}> far</label>
        <button class="btn icon" data-act="pof-sign" data-i="${i}" aria-label="Print this door sign">🖨️</button>
        <button class="btn icon danger" data-act="pof-del" data-i="${i}" aria-label="Remove">✕</button></div>`).join('')}</div>
    <h4>💌 Postage</h4>
    <div class="form-grid">${RATES.map(([k, n]) => `<label class="field">${n} ($)<input type="number" inputmode="decimal" min="0" step="0.05" data-pof-rate="${k}" value="${((f.rates[k] || 0) / 100).toFixed(2)}"></label>`).join('')}</div>
    <label class="field">Card postage goes into
      <select data-pof="payoutAccountId"><option value="">Nobody's account</option>${S.accounts.map((a) => `<option value="${a.id}" ${f.payoutAccountId === a.id ? 'selected' : ''}>${esc(a.owner.name)} · ${esc(bankById(a.bankId)?.name || 'Bank')}</option>`).join('')}</select></label>
    <label class="toggle"><input type="checkbox" data-pof="autoLabel" ${f.autoLabel ? 'checked' : ''}> 🏷️ Print the shipping label automatically (when the printer is set up)</label>
    <button class="btn primary" data-act="pof-save">💾 Save Post Office</button>
  </section>`;
}

export function postField(t) {
  const f = ui.pof;
  if (!f) return false;
  if (t.dataset.pofPlace !== undefined) { const p = f.places[Number(t.dataset.pofPlace)]; p[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value; return true; }
  if (t.dataset.pofRate) { f.rates[t.dataset.pofRate] = Math.round(parseFloat(t.value) * 100) || 0; return true; }
  if (t.dataset.pof) { f[t.dataset.pof] = t.type === 'checkbox' ? t.checked : t.value; return true; }
  return false;
}

export const postAdminActions = {
  'pof-add'() { const f = draft(); if (f.places.length >= 26) { toast('26 places is the most (zones A to Z)'); return; } f.places.push({ name: 'New place', emoji: '🏠', far: false }); render(); },
  'pof-del'(el) { const f = draft(); if (f.places.length < 2) { toast('Keep at least one place'); return; } f.places.splice(Number(el.dataset.i), 1); render(); },
  async 'pof-save'() {
    const f = draft();
    await api('PUT', '/api/post/places', { places: f.places }, { pin: true });
    await api('PUT', '/api/post/settings', { rates: f.rates, payoutAccountId: f.payoutAccountId || null, autoLabel: f.autoLabel }, { pin: true });
    ui.pof = null; await loadAll(); render(); toast('Post Office saved 📦');
  },
  'pof-signs'() { if (ui.pof && JSON.stringify(ui.pof.places.map((p) => p.id)) !== JSON.stringify(post().places.map((p) => p.id))) { toast('Save first 💾, then print the door signs'); return; } printModal(doorSignSlips(post().places), { title: '🖨️ Door signs' }); },
  'pof-sign'(el) { const p = post().places[Number(el.dataset.i)]; if (!p || !ui.pof || ui.pof.places[Number(el.dataset.i)]?.id !== p.id) { toast('Save first 💾, then print the door sign'); return; } printModal(doorSignSlips([p]), { title: `🖨️ ${p.name} door sign` }); },
};
