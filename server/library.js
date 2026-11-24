'use strict';
// 📚 Library: books (real ones with an ISBN, or homemade ones with a printed label), loans with
// real due dates, and optional late fines paid at the desk in play money or by debit card.

const DAY = 86_400_000;
const DEFAULTS = () => ({ books: [], loans: [], settings: { loanDays: 7, finePerDay: 25, fineAccountId: null, autoSlips: true } });
const MAX_BOOKS = 500;
const MAX_CLOSED = 300; // returned loans kept for history

module.exports = function library(ctx) {
  const { HttpError, newId, clean, clamp, cents, send, readJson, requirePin, persist, addTxn, accountById, resolvePhoto, checkCard } = ctx;
  const db = () => ctx.db();
  const L = () => {
    const d = db();
    d.library = { ...DEFAULTS(), ...(d.library || {}) };
    d.library.settings = { ...DEFAULTS().settings, ...d.library.settings };
    return d.library;
  };

  const openLoan = (bookId) => L().loans.find((l) => l.bookId === bookId && !l.inAt);
  const findBook = (id) => {
    const b = L().books.find((x) => x.id === id);
    if (!b) throw new HttpError(404, 'That book is gone');
    return b;
  };
  const person = (id) => db().customers.find((c) => c.id === id);

  // Due at the end of the day, loanDays from now.
  function dueFrom(now, days) {
    const d = new Date(now.getTime() + days * DAY);
    d.setHours(23, 59, 59, 0);
    return d;
  }
  // Whole days late (returned the day after it was due = 1 day late). Capped at 30.
  function daysLate(loan, at = new Date()) {
    const end = new Date(loan.inAt || at);
    const due = new Date(loan.dueAt);
    return end > due ? Math.min(30, Math.floor((end - due) / DAY) + 1) : 0;
  }

  function publicLibrary() {
    const lib = L();
    const open = lib.loans.filter((l) => !l.inAt);
    const owed = lib.loans.filter((l) => l.inAt && l.fine && !l.finePaid);
    const recent = lib.loans.filter((l) => l.inAt).slice(-40);
    return { books: lib.books, loans: [...open, ...owed.filter((l) => !recent.includes(l)), ...recent], settings: lib.settings };
  }

  function normBook(b, old) {
    const title = clean(b.title, 80);
    if (!title) throw new HttpError(400, 'Every book needs a title');
    const isbn = String(b.isbn ?? old?.isbn ?? '').replace(/[^0-9X]/gi, '');
    return {
      id: old?.id || newId(), title, author: clean(b.author, 60), emoji: clean(b.emoji, 16) || '📕',
      isbn: /^\d{10}$|^\d{13}$|^\d{9}X$/i.test(isbn) ? isbn.toUpperCase() : null,
      photo: old ? old.photo : null, createdAt: old?.createdAt || new Date().toISOString(),
    };
  }

  function prune() {
    const lib = L();
    const closed = lib.loans.filter((l) => l.inAt && (!l.fine || l.finePaid));
    if (closed.length > MAX_CLOSED) {
      const drop = new Set(closed.slice(0, closed.length - MAX_CLOSED));
      lib.loans = lib.loans.filter((l) => !drop.has(l));
    }
  }

  async function handle(req, res, url, parts) {
    const method = req.method;
    const lib = L();
    const ok = (status, body, what = 'library') => { persist(what); send(res, status, body); return true; };

    // ---- books (no PIN: kids run the library)
    if (url.pathname === '/api/library/books' && method === 'POST') {
      if (lib.books.length >= MAX_BOOKS) throw new HttpError(400, 'The shelves are full');
      const b = await readJson(req);
      const book = normBook(b, null);
      if (book.isbn && lib.books.some((x) => x.isbn === book.isbn)) throw new HttpError(400, 'That book is already in the library');
      book.photo = await resolvePhoto(b.photo, null);
      lib.books.push(book);
      return ok(201, book);
    }
    if (parts[2] === 'books' && parts.length === 4) {
      const book = findBook(parts[3]);
      if (method === 'PUT') {
        const b = await readJson(req);
        const next = normBook(b, book);
        if (next.isbn && lib.books.some((x) => x !== book && x.isbn === next.isbn)) throw new HttpError(400, 'Another book already has that ISBN');
        next.photo = await resolvePhoto(b.photo, book);
        lib.books[lib.books.indexOf(book)] = next;
        return ok(200, next);
      }
      if (method === 'DELETE') {
        if (openLoan(book.id)) throw new HttpError(400, 'That book is checked out. Return it first.');
        lib.books = lib.books.filter((x) => x !== book);
        lib.loans = lib.loans.filter((l) => l.bookId !== book.id || (l.fine && !l.finePaid));
        return ok(200, { ok: true });
      }
    }

    // ---- check out, return, renew
    if (url.pathname === '/api/library/checkout' && method === 'POST') {
      const b = await readJson(req);
      const who = person(b.customerId);
      if (!who) throw new HttpError(400, 'Scan a library card first');
      const ids = [...new Set(Array.isArray(b.bookIds) ? b.bookIds : [])].slice(0, 20);
      if (!ids.length) throw new HttpError(400, 'Pick some books to check out');
      const now = new Date();
      const due = dueFrom(now, lib.settings.loanDays).toISOString();
      const loans = ids.map((id) => {
        const book = findBook(id);
        if (openLoan(book.id)) throw new HttpError(400, `“${book.title}” is already checked out`);
        return { id: newId(), bookId: book.id, customerId: who.id, outAt: now.toISOString(), dueAt: due, inAt: null, renewals: 0, fine: 0, finePaid: false };
      });
      lib.loans.push(...loans);
      return ok(201, { loans, dueAt: due });
    }
    if (url.pathname === '/api/library/return' && method === 'POST') {
      const b = await readJson(req);
      const loan = openLoan(b.bookId);
      if (!loan) throw new HttpError(400, 'That book is already on the shelf');
      loan.inAt = new Date().toISOString();
      const late = daysLate(loan);
      loan.daysLate = late;
      loan.fine = late * lib.settings.finePerDay;
      loan.finePaid = loan.fine === 0;
      prune();
      return ok(200, { loan, stillOut: lib.loans.filter((l) => !l.inAt && l.customerId === loan.customerId).length });
    }
    if (parts[2] === 'loans' && parts[3] && parts[4] === 'renew' && method === 'POST') {
      const loan = lib.loans.find((l) => l.id === parts[3] && !l.inAt);
      if (!loan) throw new HttpError(404, 'That book is not checked out');
      if (daysLate(loan)) throw new HttpError(400, 'This book is late. Bring it back to the desk first!');
      if (loan.renewals >= 2) throw new HttpError(400, 'This book was renewed twice already. Time to bring it back!');
      loan.dueAt = dueFrom(new Date(), lib.settings.loanDays).toISOString();
      loan.renewals += 1;
      return ok(200, loan);
    }
    if (parts[2] === 'loans' && parts[3] && parts.length === 4 && method === 'PUT') {
      // Grown-ups can move a due date (to forgive a late book, or to try out fines).
      requirePin(req);
      const loan = lib.loans.find((l) => l.id === parts[3] && !l.inAt);
      if (!loan) throw new HttpError(404, 'That book is not checked out');
      const due = new Date((await readJson(req)).dueAt);
      if (Number.isNaN(due.getTime())) throw new HttpError(400, 'Pick a date');
      due.setHours(23, 59, 59, 0);
      loan.dueAt = due.toISOString();
      return ok(200, loan);
    }

    // ---- fines
    if (url.pathname === '/api/library/fines/pay' && method === 'POST') {
      const b = await readJson(req);
      const loans = lib.loans.filter((l) => (b.loanIds || []).includes(l.id) && l.fine && !l.finePaid);
      if (!loans.length) throw new HttpError(400, 'Nothing to pay');
      const total = loans.reduce((a, l) => a + l.fine, 0);
      let receipt = null;
      if (b.method === 'card') {
        const { account, card } = await checkCard(b.cardId, b.pin, total);
        addTxn(account, -total, 'purchase', `📚 Library fine (${loans.length} book${loans.length === 1 ? '' : 's'})`, { cardId: card.id });
        const payout = accountById(lib.settings.fineAccountId);
        if (payout && payout !== account) addTxn(payout, total, 'sale', `📚 Library fine from ${account.owner.name}`);
        receipt = { owner: account.owner.name, balanceLeft: account.balance, last4: card.number.slice(-4) };
      } else if (b.tendered != null && cents(b.tendered) < total) {
        throw new HttpError(400, 'Not enough money yet');
      }
      const at = new Date().toISOString();
      for (const l of loans) Object.assign(l, { finePaid: true, finePaidAt: at, finePaidWith: b.method === 'card' ? 'card' : 'cash' });
      prune();
      persist('state');
      send(res, 200, { total, change: b.method === 'card' || b.tendered == null ? 0 : cents(b.tendered) - total, receipt });
      return true;
    }
    if (url.pathname === '/api/library/fines/forgive' && method === 'POST') {
      requirePin(req);
      const ids = (await readJson(req)).loanIds || [];
      for (const l of lib.loans) if (ids.includes(l.id) && l.fine && !l.finePaid) Object.assign(l, { finePaid: true, forgiven: true });
      prune();
      return ok(200, { ok: true });
    }

    // ---- settings (grown-ups)
    if (url.pathname === '/api/library/settings' && method === 'PUT') {
      requirePin(req);
      const b = await readJson(req);
      const s = lib.settings;
      Object.assign(s, {
        loanDays: clamp(Math.round(Number(b.loanDays ?? s.loanDays)) || 7, 1, 60),
        finePerDay: b.finePerDay === undefined ? s.finePerDay : clamp(cents(b.finePerDay), 0, 1000),
        fineAccountId: b.fineAccountId === undefined ? s.fineAccountId : accountById(b.fineAccountId) ? b.fineAccountId : null,
        autoSlips: b.autoSlips === undefined ? s.autoSlips : !!b.autoSlips,
      });
      return ok(200, s);
    }
    return false;
  }

  // Reset play data: every book back on the shelf, no fines owed.
  function resetPlay() { L().loans = []; }

  return { handle, publicLibrary, resetPlay, daysLate };
};
