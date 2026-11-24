// Library windows: add or change a book, pick books off the shelf, and pay late fines.
import { S, ui, esc, api, money, toast, openModal, drawModal, closeModal, loadAll, render, sfx, askConfirm, face, sumOf } from '../../lib/core.js';
import { payBox } from '../../lib/paybox.js';
import { readFile, shrinkPhoto } from '../../lib/photo.js';
import { printModal } from '../../lib/print.js';
import { labelSlips, dueText } from './slips.js';

export const lib = () => S.library || { books: [], loans: [], settings: { loanDays: 7, finePerDay: 25 } };
export const bookById = (id) => lib().books.find((b) => b.id === id);
export const openLoanOf = (bookId) => lib().loans.find((l) => l.bookId === bookId && !l.inAt);
export const person = (id) => S.customers.find((c) => c.id === id);
export const owedBy = (customerId) => lib().loans.filter((l) => l.customerId === customerId && l.inAt && l.fine && !l.finePaid);
export const isLate = (loan) => !loan.inAt && Date.now() > Date.parse(loan.dueAt);
export const bookCover = (b) => (b.photo ? `<img src="${esc(b.photo)}" alt="" data-emoji="${esc(b.emoji || '📕')}">` : `<span>${esc(b.emoji || '📕')}</span>`);

const BOOK_EMOJI = ['📕', '📗', '📘', '📙', '📓', '📔', '📒', '📚', '🦖', '🐉', '🚀', '🧚', '🦄', '🐶', '🐱', '🏰', '🌊', '🦸', '🔍', '✏️', '🎨', '🌙', '🐻', '🚂'];

// ➕ / ✏️ a book. `isbn`: from scanning a book nobody added yet.
export function bookModal(old, { isbn = null } = {}) {
  const f = old ? { title: old.title, author: old.author || '', emoji: old.emoji, photo: old.photo || null, isbn: old.isbn || '' } : { title: '', author: '', emoji: '📕', photo: null, isbn: isbn || '' };
  const loan = old && openLoanOf(old.id);
  const m = {
    busy: false,
    onScan(info) {
      if (info.ours) return false;
      if (info.product?.format === 'ISBN' || info.kind === 'book') { f.isbn = info.code; sfx.pop(); drawModal(); return true; }
      return false;
    },
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${old ? '✏️ Change book' : isbn ? '📚 New book!' : '➕ Add a book'}</h2>
        ${isbn && !old ? '<p class="center muted">This book isn\'t in the library yet. Type its title and take a photo of the cover!</p>' : ''}
        <div class="preview"><div class="book-cover big">${bookCover(f)}</div></div>
        <div class="row" style="justify-content:center"><button class="btn" data-act="photo-cam">📷 Cover photo</button><button class="btn" data-act="photo-pick">🖼️ Pick</button>${f.photo ? '<button class="btn danger" data-act="photo-del">No photo</button>' : ''}</div>
        <label class="field">Title<input data-f="title" value="${esc(f.title)}" maxlength="80" autocomplete="off" placeholder="The Very Hungry Caterpillar"></label>
        <label class="field">Author <span class="muted small">(optional)</span><input data-f="author" value="${esc(f.author)}" maxlength="60" autocomplete="off"></label>
        <label class="field">ISBN barcode <span class="muted small">(scan the back of the book, or leave empty for a homemade book)</span><input data-f="isbn" value="${esc(f.isbn)}" maxlength="17" inputmode="numeric" autocomplete="off"></label>
        <div class="field">${f.photo ? 'Picture if the photo goes missing' : 'Picture'}<div class="emoji-grid">${BOOK_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
        ${loan ? `<p class="center">📤 Out with <b>${esc(person(loan.customerId)?.name || 'someone')}</b>, due ${esc(dueText(loan.dueAt))}</p>` : ''}
        <div class="row split">
          <span class="row">${old ? `<button class="btn danger" data-act="delete" ${loan ? 'disabled' : ''}>🗑️ Remove</button><button class="btn" data-act="label">🏷️ Label</button>` : ''}</span>
          <button class="btn huge primary" style="width:auto;flex:1;max-width:320px" data-act="save" ${m.busy ? 'disabled' : ''}>✅ Save</button></div>
      </div>`;
    },
    input(t) { if (t.dataset.f) f[t.dataset.f] = t.value; },
    enter() { document.activeElement?.blur(); },
    async act(a, el) {
      if (a === 'emoji') { f.emoji = el.dataset.e; drawModal(); return; }
      if (a === 'photo-del') { f.photo = null; drawModal(); return; }
      if (a === 'photo-cam' || a === 'photo-pick') {
        const file = await readFile(a === 'photo-cam'); if (!file) return;
        try { f.photo = await shrinkPhoto(file); } catch { toast("Couldn't read that photo"); return; }
        if (ui.modal === m) drawModal(); return;
      }
      if (a === 'label') { printModal(labelSlips([old]), { title: '🏷️ Book label', back: () => openModal(m) }); return; }
      if (a === 'delete') {
        if (!(await askConfirm(`Take “${old.title}” out of the library?`, { yes: '🗑️ Remove', danger: true }))) return;
        await api('DELETE', `/api/library/books/${old.id}`); await loadAll(); closeModal(); render(); return;
      }
      if (a === 'save') {
        if (!f.title.trim()) { toast('Every book needs a title ✏️'); return; }
        m.busy = true; drawModal();
        try {
          const saved = old ? await api('PUT', `/api/library/books/${old.id}`, f) : await api('POST', '/api/library/books', f);
          await loadAll(); closeModal(); render();
          toast(old ? 'Saved ✅' : `“${saved.title}” is on the shelf! 📚`);
          if (!old && !saved.isbn) printModal(labelSlips([saved]), { title: '🏷️ A label for your homemade book' });
        } catch (e) { m.busy = false; drawModal(); throw e; }
      }
    },
  };
  openModal(m);
}

// Pick books off the shelf for someone (when there's no scanner handy).
export function shelfPicker(onPick) {
  const avail = lib().books.filter((b) => !openLoanOf(b.id)).sort((a, b) => a.title.localeCompare(b.title));
  openModal({
    render: () => `<div class="sheet">
      <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
      <h2>📚 Which book?</h2>
      ${avail.length ? `<div class="shelf-grid small">${avail.map((b) => `<button class="book-tile" data-act="pick" data-id="${b.id}"><span class="book-cover">${bookCover(b)}</span><b>${esc(b.title)}</b></button>`).join('')}</div>`
        : '<p class="center">Every book is checked out!</p>'}
    </div>`,
    act(a, el) { if (a === 'pick') { closeModal(); onPick(el.dataset.id); } },
  });
}

// 💰 Late fines, paid at the desk: play cash (with change) or a debit card (PIN asked).
export function finesModal(customerId) {
  const who = person(customerId);
  const loans = owedBy(customerId);
  if (!loans.length) { toast('No fines! 🎉'); return; }
  payBox({
    title: `💰 Library fines for ${who ? `${face(who)} ${esc(who.name)}` : 'someone'}`,
    lines: loans.map((l) => ({ label: bookById(l.bookId)?.title || 'A book', note: `${l.daysLate} day${l.daysLate === 1 ? '' : 's'} late`, amount: l.fine })),
    total: sumOf(loans.map((l) => l.fine)),
    customerId,
    doneText: 'Fines paid. Thank you!',
    async onPay(body) { const r = await api('POST', '/api/library/fines/pay', { loanIds: loans.map((l) => l.id), ...body }); await loadAll(); render(); return r; },
  });
}
