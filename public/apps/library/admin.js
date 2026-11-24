// ⚙️ Setup → Library (grown-ups): loan length, late fines and where they go, auto-printed slips,
// moving due dates (to forgive a late book or try out fines) and forgiving fines.
import { S, ui, esc, api, money, render, toast, loadAll } from '../../lib/core.js';
import { printModal } from '../../lib/print.js';
import { bankById } from '../bank.js';
import { lib, bookById, person, isLate } from './modals.js';
import { labelSlips, dueText } from './slips.js';

const KEYS = ['loanDays', 'finePerDay', 'fineAccountId', 'autoSlips'];

export function libraryPanel() {
  const L = lib();
  ui.lf ||= Object.fromEntries(KEYS.map((k) => [k, L.settings[k]]));
  const f = ui.lf;
  const out = L.loans.filter((l) => !l.inAt);
  const owed = L.loans.filter((l) => l.inAt && l.fine && !l.finePaid);
  const homemade = L.books.filter((b) => !b.isbn);
  return `<section class="panel">
    <h3>📚 Library</h3>
    <div class="form-grid">
      <label class="field">Borrow for (days)<input data-lf="loanDays" type="number" inputmode="numeric" min="1" max="60" value="${f.loanDays}"></label>
      <label class="field">Late fine per day in $ (0 = no fines)<input data-lf="finePerDay" type="number" inputmode="decimal" min="0" max="10" step="0.05" value="${(f.finePerDay / 100).toFixed(2)}"></label>
      <label class="field">Fines paid by card go into
        <select data-lf="fineAccountId"><option value="">Nobody's account</option>${S.accounts.map((a) => `<option value="${a.id}" ${f.fineAccountId === a.id ? 'selected' : ''}>${esc(a.owner.name)} · ${esc(bankById(a.bankId)?.name || 'Bank')}</option>`).join('')}</select></label>
    </div>
    <label class="toggle"><input type="checkbox" data-lf="autoSlips" ${f.autoSlips ? 'checked' : ''}> 🧾 Print the due-date and thank-you slips automatically (when the printer is set up)</label>
    <div class="row"><button class="btn primary" data-act="lf-save">💾 Save library settings</button>
      ${homemade.length ? `<button class="btn" data-act="lf-labels">🏷️ Labels for ${homemade.length} homemade book${homemade.length === 1 ? '' : 's'}</button>` : ''}</div>
    ${out.length ? `<h4>📤 Checked out</h4><div class="list">${out.map((l) => `<div class="list-row ${isLate(l) ? 'late' : ''}">
        <span class="grow">${esc(bookById(l.bookId)?.title || 'A book')} · ${esc(person(l.customerId)?.name || 'someone')}<small>${isLate(l) ? '⏰ late, was due' : 'due'} ${esc(dueText(l.dueAt))}</small></span>
        <button class="btn" data-act="lf-due" data-id="${l.id}" data-days="-3">Make it 3 days late</button>
        <button class="btn" data-act="lf-due" data-id="${l.id}" data-days="7">Due in a week</button></div>`).join('')}</div>` : ''}
    ${owed.length ? `<h4>💰 Fines owed</h4><div class="list">${owed.map((l) => `<div class="list-row"><span class="grow">${esc(person(l.customerId)?.name || 'Someone')} · ${esc(bookById(l.bookId)?.title || 'a book')}<small>${l.daysLate} days late</small></span>
        <b>${money(l.fine)}</b><button class="btn" data-act="lf-forgive" data-id="${l.id}">🙂 Forgive</button></div>`).join('')}</div>` : ''}
  </section>`;
}

export function libraryField(t) {
  if (!t.dataset.lf || !ui.lf) return false;
  const k = t.dataset.lf;
  ui.lf[k] = t.type === 'checkbox' ? t.checked : k === 'finePerDay' ? Math.round(parseFloat(t.value) * 100) || 0 : k === 'loanDays' ? Number(t.value) || 7 : t.value || null;
  return true;
}

export const libraryAdminActions = {
  async 'lf-save'() {
    await api('PUT', '/api/library/settings', ui.lf, { pin: true });
    ui.lf = null; await loadAll(); render(); toast('Library settings saved 📚');
  },
  'lf-labels'() { printModal(labelSlips(lib().books.filter((b) => !b.isbn)), { title: '🏷️ Book labels' }); },
  async 'lf-due'(el) {
    const d = new Date(Date.now() + Number(el.dataset.days) * 86400000);
    await api('PUT', `/api/library/loans/${el.dataset.id}`, { dueAt: d.toISOString() }, { pin: true });
    await loadAll(); render();
  },
  async 'lf-forgive'(el) {
    await api('POST', '/api/library/fines/forgive', { loanIds: [el.dataset.id] }, { pin: true });
    await loadAll(); render(); toast('Fine forgiven 🙂');
  },
};
