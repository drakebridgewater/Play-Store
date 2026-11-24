'use strict';
// 🎟️ Box Office: make a show (name, time, seats, price), sell seats from a seat map, print tickets,
// and scan them at the door (once each, for the right show, on the right day).

const ROWS = 'ABCDEFGH';

module.exports = function boxOffice(ctx) {
  const { HttpError, newId, clean, clamp, cents, send, readJson, persist, addTxn, accountById, checkCard, today } = ctx;
  const db = () => ctx.db();
  const B = () => (db().boxOffice ||= { shows: [], tickets: [] });
  const findShow = (id) => {
    const s = B().shows.find((x) => x.id === id);
    if (!s) throw new HttpError(404, 'That show is gone');
    return s;
  };
  const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA');

  function publicBoxOffice() {
    const b = B();
    return { shows: b.shows, tickets: b.tickets.filter((t) => b.shows.some((s) => s.id === t.showId)) };
  }

  function normShow(b, old) {
    const name = clean(b.name, 50);
    if (!name) throw new HttpError(400, 'Every show needs a name');
    const at = new Date(b.at || old?.at || Date.now());
    if (Number.isNaN(at.getTime())) throw new HttpError(400, 'Pick when the show is');
    const rows = clamp(Math.round(Number(b.rows ?? old?.rows) || 4), 1, 8);
    const seatsPerRow = clamp(Math.round(Number(b.seatsPerRow ?? old?.seatsPerRow) || 6), 1, 10);
    if (old && B().tickets.some((t) => t.showId === old.id && !seatExists(t.seat, rows, seatsPerRow))) throw new HttpError(400, 'Some sold seats would disappear. Keep the theater at least this big.');
    return {
      id: old?.id || newId(), name, emoji: clean(b.emoji, 16) || '🎭', at: at.toISOString(), rows, seatsPerRow,
      price: b.price === undefined ? old?.price ?? 0 : clamp(cents(b.price), 0, 100000),
      storeId: db().stores.some((s) => s.id === b.storeId) ? b.storeId : null,
      payoutAccountId: accountById(b.payoutAccountId) ? b.payoutAccountId : null,
      createdAt: old?.createdAt || new Date().toISOString(),
    };
  }
  function seatExists(seat, rows, per) {
    const m = /^([A-H])(\d{1,2})$/.exec(seat);
    return !!m && ROWS.indexOf(m[1]) < rows && Number(m[2]) >= 1 && Number(m[2]) <= per;
  }

  async function handle(req, res, url, parts) {
    const method = req.method;
    const b = B();
    const ok = (status, body, what = 'boxoffice') => { persist(what); send(res, status, body); return true; };

    if (url.pathname === '/api/shows' && method === 'POST') {
      if (b.shows.length >= 40) throw new HttpError(400, 'That is a lot of shows. Remove some old ones first.');
      const show = normShow(await readJson(req), null);
      b.shows.push(show);
      return ok(201, show);
    }
    if (parts[1] === 'shows' && parts[2] && parts.length === 3) {
      const show = findShow(parts[2]);
      if (method === 'PUT') { const next = normShow(await readJson(req), show); b.shows[b.shows.indexOf(show)] = next; return ok(200, next); }
      if (method === 'DELETE') {
        const sold = b.tickets.filter((t) => t.showId === show.id);
        if (sold.length && dayOf(show.at) >= today()) throw new HttpError(400, 'Tickets are sold for this show. Remove it after the show day.');
        b.shows = b.shows.filter((x) => x !== show);
        b.tickets = b.tickets.filter((t) => t.showId !== show.id);
        return ok(200, { ok: true });
      }
    }

    // Sell seats. Free shows need no paying; otherwise cash or a debit card.
    if (parts[1] === 'shows' && parts[3] === 'tickets' && method === 'POST') {
      const show = findShow(parts[2]);
      const body = await readJson(req);
      const who = db().customers.find((c) => c.id === body.customerId);
      if (!who) throw new HttpError(400, 'Who are the tickets for?');
      const seats = [...new Set(Array.isArray(body.seats) ? body.seats : [])].slice(0, 20);
      if (!seats.length) throw new HttpError(400, 'Pick some seats');
      for (const s of seats) {
        if (!seatExists(s, show.rows, show.seatsPerRow)) throw new HttpError(400, `There is no seat ${s}`);
        if (b.tickets.some((t) => t.showId === show.id && t.seat === s)) throw new HttpError(400, `Seat ${s} is already taken`, { code: 'taken' });
      }
      const total = show.price * seats.length;
      let paidBy = 'free', receipt = null, change = 0;
      if (total) {
        if (body.pay?.method === 'card') {
          const { account, card } = await checkCard(body.pay.cardId, body.pay.pin, total);
          addTxn(account, -total, 'purchase', `🎟️ ${seats.length} ticket${seats.length === 1 ? '' : 's'} · ${show.name}`, { cardId: card.id });
          const payout = accountById(show.payoutAccountId);
          if (payout && payout !== account) addTxn(payout, total, 'sale', `🎟️ Tickets for ${show.name} (${who.name})`);
          paidBy = 'card'; receipt = { owner: account.owner.name, balanceLeft: account.balance };
        } else {
          const tendered = body.pay?.tendered == null ? total : cents(body.pay.tendered);
          if (tendered < total) throw new HttpError(400, 'Not enough money yet');
          paidBy = 'cash'; change = tendered - total;
        }
      }
      const at = new Date().toISOString();
      const tickets = seats.map((seat) => ({ id: newId(), showId: show.id, customerId: who.id, name: who.name, seat, price: show.price, paidBy, at, usedAt: null }));
      b.tickets.push(...tickets);
      if (b.tickets.length > 2000) b.tickets.splice(0, b.tickets.length - 2000);
      return ok(201, { tickets, receipt, change }, paidBy === 'card' ? 'state' : 'boxoffice');
    }

    // At the door: right show, right day, not used before.
    if (parts[1] === 'showtickets' && parts[2] && parts[3] === 'admit' && method === 'POST') {
      const t = b.tickets.find((x) => x.id === parts[2]);
      if (!t) throw new HttpError(404, 'That ticket is not real 🤔', { code: 'fake' });
      const show = b.shows.find((s) => s.id === t.showId);
      const { showId } = await readJson(req);
      if (showId && showId !== t.showId) throw new HttpError(400, `Wrong show! This ticket is for ${show ? `${show.emoji} ${show.name}` : 'another show'}.`, { code: 'wrong' });
      if (show && dayOf(show.at) < today()) throw new HttpError(400, 'That show was on another day. This ticket is old!', { code: 'old' });
      if (t.usedAt) throw new HttpError(400, `Already used! Seat ${t.seat} came in at ${new Date(t.usedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`, { code: 'used' });
      t.usedAt = new Date().toISOString();
      return ok(200, { ticket: t, inside: b.tickets.filter((x) => x.showId === t.showId && x.usedAt).length });
    }
    return false;
  }

  function resetPlay() { B().tickets = []; }

  return { handle, publicBoxOffice, resetPlay };
};
