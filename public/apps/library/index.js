// 📚 Library: the front desk (scan a library card, then books, to check out; scan a book to bring
// it back), the shelves, and who has what. Due dates are real days; fines are optional.
import { S, ui, esc, api, bar, setAccent, toast, render, sfx, loadAll, money, face, openModal, closeModal } from '../../lib/core.js';
import { canPrint, printSlip, printModal } from '../../lib/print.js';
import { lib, bookById, openLoanOf, person, owedBy, isLate, bookCover, bookModal, shelfPicker, finesModal } from './modals.js';
import { checkoutSlip, thanksSlip, dueText } from './slips.js';

const desk = () => (ui.lib ||= { session: null, last: null });
const tabs = (on) => `<a class="btn ${on === 'desk' ? 'primary' : ''}" href="#/library">🛎️ <span>Desk</span></a>
  <a class="btn ${on === 'shelves' ? 'primary' : ''}" href="#/library/shelves">📚 <span>Shelves</span></a>
  <a class="btn ${on === 'cards' ? 'primary' : ''}" href="#/library/cards">🪪 <span>Who has what</span></a>`;

// Print a slip now if the library is set to, or offer it.
function slip(s, title, to = null) {
  if (lib().settings.autoSlips && canPrint()) { printSlip(s).catch((e) => toast(e.message)); return true; }
  desk().slip = { s, title, to };
  return false;
}

// ------------------------------------------------------------------ front desk
function viewDesk() {
  setAccent('#4f46e5');
  const d = desk();
  const ses = d.session;
  const who = ses && person(ses.customerId);
  const owed = who ? owedBy(who.id) : [];
  const out = who ? lib().loans.filter((l) => !l.inAt && l.customerId === who.id) : [];
  const last = d.last;
  return bar('📚 Library', tabs('desk')) + `<div class="setup lib-desk">
    ${last ? `<section class="panel lib-last ${last.late ? 'late' : ''}">${last.html}
      <div class="row">${d.slip ? '<button class="btn" data-act="lib-slip">🧾 Print the slip</button>' : ''}<button class="btn ghost" data-act="lib-last-x">OK</button></div></section>` : ''}
    ${who ? `<section class="panel lib-session">
        <h3><span class="face">${face(who)}</span><span class="grow">Checking out to ${esc(who.name)}</span><button class="btn" data-act="lib-cancel">✕ Cancel</button></h3>
        ${owed.length ? `<p class="lib-warn">💰 ${esc(who.name)} owes ${money(owed.reduce((a, l) => a + l.fine, 0))} in late fines. <button class="btn" data-act="lib-fines" data-id="${who.id}">Pay now</button></p>` : ''}
        ${out.length ? `<p class="muted">Already has: ${out.map((l) => `${esc(bookById(l.bookId)?.title || 'a book')}${isLate(l) ? ' (late!)' : ''}`).join(', ')}</p>` : ''}
        <ul class="lib-basket">${ses.bookIds.map((id) => { const b = bookById(id); return b ? `<li><span class="book-cover">${bookCover(b)}</span><b class="grow">${esc(b.title)}</b><button class="btn icon" data-act="lib-unpick" data-id="${id}" aria-label="Take it out">✕</button></li>` : ''; }).join('') || '<li class="muted">📷 Scan the books, or pick them from the shelf.</li>'}</ul>
        <div class="dock"><div class="row split"><button class="btn" data-act="lib-pick">➕ Pick from the shelf</button>
          <button class="btn huge primary" style="width:auto;flex:1;max-width:360px" data-act="lib-checkout" ${ses.bookIds.length ? '' : 'disabled'}>📤 Check out ${ses.bookIds.length || ''} book${ses.bookIds.length === 1 ? '' : 's'}</button></div>
        <p class="muted small center">Due back ${esc(dueText(Date.now() + lib().settings.loanDays * 86400000, true))} (${lib().settings.loanDays} days)</p></div>
      </section>`
    : `<section class="lib-idle"><div class="lib-idle-icon">🛎️</div>
        <h2>Scan a library card to borrow books,<br>or scan a book to bring it back.</h2>
        <p class="muted">No scanner? Tap who's borrowing:</p>
        <div class="choices">${S.customers.map((c) => `<button class="choice" data-act="lib-who" data-id="${c.id}"><span class="e">${face(c)}</span>${esc(c.name)}</button>`).join('')}</div>
        <button class="btn" data-act="lib-return-pick">📥 Bring a book back</button></section>`}
  </div>`;
}

function start(customerId) {
  const d = desk();
  if (d.session?.customerId !== customerId) d.session = { customerId, bookIds: [] };
  d.last = null; d.slip = null;
  sfx.pop();
}

async function checkout() {
  const d = desk();
  const ses = d.session; if (!ses?.bookIds.length) return;
  const r = await api('POST', '/api/library/checkout', { customerId: ses.customerId, bookIds: ses.bookIds });
  const who = person(ses.customerId);
  const books = ses.bookIds.map(bookById).filter(Boolean);
  await loadAll();
  sfx.kaching();
  d.session = null;
  const printed = slip(checkoutSlip(who?.name || 'Reader', books, r.dueAt), '📤 Due-date slip', who?.id);
  d.last = { html: `<h3>📤 ${esc(who?.name || 'They')} borrowed ${books.length} book${books.length === 1 ? '' : 's'}!</h3>
    <p class="lib-due">Please bring ${books.length === 1 ? 'it' : 'them'} back by <b>${esc(dueText(r.dueAt, true))}</b></p>${printed ? '<p class="muted">🖨️ The due-date slip is printing.</p>' : ''}` };
  render();
}

async function giveBack(bookId) {
  const b = bookById(bookId);
  const r = await api('POST', '/api/library/return', { bookId });
  const who = person(r.loan.customerId);
  await loadAll();
  const d = desk();
  const printed = slip(thanksSlip(who?.name || 'Someone', b || { title: 'a book' }, r.loan, r.stillOut), '📥 Thank-you slip', who?.id);
  d.last = { late: !!r.loan.daysLate, html: `<h3>📥 Thanks for bringing back “${esc(b?.title || 'the book')}”!</h3>
    ${r.loan.daysLate ? `<p class="lib-late">⏰ It's ${r.loan.daysLate} day${r.loan.daysLate === 1 ? '' : 's'} late.${r.loan.fine ? ` Late fine: <b>${money(r.loan.fine)}</b> <button class="btn" data-act="lib-fines" data-id="${r.loan.customerId}">💰 Pay it</button>` : ''}</p>` : '<p>⭐ Right on time!</p>'}
    ${printed ? '<p class="muted">🖨️ The thank-you slip is printing.</p>' : ''}` };
  if (r.loan.daysLate) sfx.buzz(); else sfx.bell();
  render();
}

// ------------------------------------------------------------------ shelves
function viewShelves() {
  setAccent('#4f46e5');
  const books = [...lib().books].sort((a, b) => a.title.localeCompare(b.title));
  return bar('📚 Shelves', tabs('shelves')) + `<div class="setup">
    <p class="muted center">${books.length} book${books.length === 1 ? '' : 's'} · ${books.filter((b) => openLoanOf(b.id)).length} checked out. Scan a new book's barcode to add it.</p>
    <div class="shelf-grid">
      ${books.map((b) => {
        const loan = openLoanOf(b.id);
        return `<button class="book-tile ${loan ? 'out' : ''}" data-act="lib-book" data-id="${b.id}"><span class="book-cover">${bookCover(b)}</span><b>${esc(b.title)}</b>
          <small class="${loan && isLate(loan) ? 'late' : ''}">${loan ? `${isLate(loan) ? '⏰ LATE' : '📤 Out'} · ${esc(person(loan.customerId)?.name || '')}` : '✅ On the shelf'}</small></button>`;
      }).join('')}
      <button class="book-tile add" data-act="lib-book-new"><span class="book-cover"><span>➕</span></span><b>Add a book</b></button>
    </div></div>`;
}

// ------------------------------------------------------------------ who has what
function viewCards() {
  setAccent('#4f46e5');
  const L = lib();
  const people = S.customers.filter((c) => L.loans.some((l) => l.customerId === c.id && (!l.inAt || (l.fine && !l.finePaid))));
  return bar('🪪 Who has what', tabs('cards')) + `<div class="setup">
    ${people.length ? people.map((c) => {
      const out = L.loans.filter((l) => l.customerId === c.id && !l.inAt);
      const owed = owedBy(c.id);
      return `<section class="panel"><h3><span class="face">${face(c)}</span><span class="grow">${esc(c.name)}</span>
        ${owed.length ? `<button class="btn warn" data-act="lib-fines" data-id="${c.id}">💰 Fines ${money(owed.reduce((a, l) => a + l.fine, 0))}</button>` : ''}</h3>
        <div class="list">${out.map((l) => { const b = bookById(l.bookId); return `<div class="list-row ${isLate(l) ? 'late' : ''}"><span class="book-cover sm">${b ? bookCover(b) : '📕'}</span>
          <span class="grow">${esc(b?.title || 'A book')}<small>${isLate(l) ? '⏰ LATE! Was due' : 'Due'} ${esc(dueText(l.dueAt))}${l.renewals ? ` · renewed ${l.renewals}×` : ''}</small></span>
          ${isLate(l) ? '' : `<button class="btn" data-act="lib-renew" data-id="${l.id}">🔄 Renew</button>`}<button class="btn primary" data-act="lib-return" data-id="${l.bookId}">📥 Return</button></div>`; }).join('') || '<p class="muted">No books out.</p>'}</div></section>`;
    }).join('') : '<div class="center-msg"><div class="emoji">📚</div><h2>Nobody has any library books right now</h2></div>'}
  </div>`;
}

// ------------------------------------------------------------------ scanning
function libraryScan(info) {
  if (ui.modal) return false;
  if (info.kind === 'person') {
    const c = person(info.id); if (!c) return false;
    if (location.hash !== '#/library') location.hash = '#/library';
    start(c.id); render(); toast(`📚 Hi ${c.name}! Scan your books.`);
    return true;
  }
  if (info.kind === 'book') {
    if (info.book.out) { giveBack(info.id).catch((e) => toast(e.message)); return true; }
    const ses = desk().session;
    if (!ses) { toast(`Scan a library card first to borrow “${info.label}”`); return true; }
    if (!ses.bookIds.includes(info.id)) ses.bookIds.push(info.id);
    sfx.pop(); if (location.hash !== '#/library') location.hash = '#/library'; else render();
    return true;
  }
  if (info.product?.format === 'ISBN') { bookModal(null, { isbn: info.code }); return true; }
  return false;
}

export const libraryApp = {
  views: { library: (r) => (r.a === 'shelves' ? viewShelves() : r.a === 'cards' ? viewCards() : viewDesk()) },
  onScan: (info) => libraryScan(info),
  badge: () => lib().loans.filter(isLate).length,
  actions: {
    'lib-who'(el) { start(el.dataset.id); render(); },
    'lib-cancel'() { desk().session = null; render(); },
    'lib-pick'() { shelfPicker((id) => { const s = desk().session; if (s && !s.bookIds.includes(id)) s.bookIds.push(id); sfx.pop(); render(); }); },
    'lib-unpick'(el) { const s = desk().session; if (s) s.bookIds = s.bookIds.filter((x) => x !== el.dataset.id); render(); },
    'lib-checkout'() { return checkout(); },
    'lib-return-pick'() {
      const out = lib().loans.filter((l) => !l.inAt).map((l) => l.bookId);
      if (!out.length) { toast('Every book is on the shelf 👍'); return; }
      shelfPickerOut(out);
    },
    'lib-return'(el) { return giveBack(el.dataset.id); },
    async 'lib-renew'(el) { const l = await api('POST', `/api/library/loans/${el.dataset.id}/renew`); await loadAll(); sfx.pop(); render(); toast(`🔄 Renewed! Now due ${dueText(l.dueAt)}`); },
    'lib-fines'(el) { finesModal(el.dataset.id); },
    'lib-slip'() { const s = desk().slip; if (s) printModal(s.s, { title: s.title, to: s.to }); },
    'lib-last-x'() { desk().last = null; desk().slip = null; render(); },
    'lib-book'(el) { const b = bookById(el.dataset.id); if (b) bookModal(b); },
    'lib-book-new'() { bookModal(null); },
  },
};

// Tap-to-return when there's no scanner: the books that are out.
function shelfPickerOut(ids) {
  openModal({
    render: () => `<div class="sheet"><button class="btn icon close" data-act="close" aria-label="Close">✕</button><h2>📥 Which book came back?</h2>
      <div class="shelf-grid small">${ids.map((id) => { const b = bookById(id); return b ? `<button class="book-tile" data-act="pick" data-id="${id}"><span class="book-cover">${bookCover(b)}</span><b>${esc(b.title)}</b><small>${esc(person(openLoanOf(id)?.customerId)?.name || '')}</small></button>` : ''; }).join('')}</div></div>`,
    act(a, el) { if (a === 'pick') { closeModal(); giveBack(el.dataset.id).catch((e) => toast(e.message)); } },
  });
}
