'use strict';
// 📦 Post Office: places around the house (each with a door sign), parcels with postage paid at the
// counter, tracking (Accepted → Sorting → Out for delivery → Delivered), and delivery by scanning
// the right door sign.

const SIZES = { letter: 'Letter', small: 'Small box', big: 'Big box', giant: 'Giant box' };
const EXTRAS = { fragile: 'Fragile', express: 'Express', signature: 'Signature' };
const STEPS = ['accepted', 'sorting', 'out', 'delivered'];
const DEFAULT_RATES = { letter: 50, small: 100, big: 200, giant: 300, perPound: 25, fragile: 50, express: 100, signature: 50, far: 100 };
const DEFAULT_PLACES = [
  ['Kitchen', '🍳', false], ['Living Room', '🛋️', false], ['Bedroom', '🛏️', false], ['Bathroom', '🛁', false],
  ['Front Door', '🚪', false], ['Garage', '🚗', false], ["Grandma's House", '👵', true], ['The North Pole', '🎅', true],
];
const MAX_DONE = 200;

module.exports = function post(ctx) {
  const { HttpError, newId, clean, clamp, cents, send, readJson, requirePin, persist, addTxn, accountById, checkCard } = ctx;
  const db = () => ctx.db();
  const zoneFor = (i) => String.fromCharCode(65 + (i % 26));
  const P = () => {
    const d = db();
    if (!d.post) {
      d.post = {
        places: DEFAULT_PLACES.map(([name, emoji, far], i) => ({ id: newId(), name, emoji, far, zone: zoneFor(i) })),
        parcels: [], settings: { rates: { ...DEFAULT_RATES }, payoutAccountId: null, autoLabel: true },
      };
      persist('post', { quiet: true }); // keep these ids: door signs get printed with them
    }
    d.post.settings.rates = { ...DEFAULT_RATES, ...d.post.settings.rates };
    return d.post;
  };
  const place = (id) => P().places.find((p) => p.id === id);
  const parcelById = (id) => {
    const x = P().parcels.find((p) => p.id === id);
    if (!x) throw new HttpError(404, 'That parcel is lost in the mail');
    return x;
  };

  // Postage: size, plus each pound over 1, plus extras, plus far-away places. Shared with the counter screen.
  function postage({ size, weight, extras, toPlaceId }, rates = P().settings.rates) {
    const lines = [[SIZES[size], rates[size]]];
    const lbs = Math.max(0, Math.ceil(weight) - 1);
    if (lbs) lines.push([`${lbs} extra pound${lbs === 1 ? '' : 's'}`, lbs * rates.perPound]);
    for (const x of extras) lines.push([EXTRAS[x], rates[x]]);
    if (place(toPlaceId)?.far) lines.push(['Far away', rates.far]);
    return { lines, total: lines.reduce((a, [, c]) => a + c, 0) };
  }

  function publicPost() {
    const p = P();
    const open = p.parcels.filter((x) => x.status !== 'delivered');
    const done = p.parcels.filter((x) => x.status === 'delivered').slice(-30);
    return { places: p.places, parcels: [...open, ...done], settings: p.settings };
  }

  function event(parcel, status, extra = {}) {
    parcel.status = status;
    parcel.events.push({ at: new Date().toISOString(), status, ...extra });
  }

  async function handle(req, res, url, parts) {
    const method = req.method;
    const p = P();
    const ok = (status, body, what = 'post') => { persist(what); send(res, status, body); return true; };

    // ---- send a parcel (pay at the counter: cash or debit card)
    if (url.pathname === '/api/post/parcels' && method === 'POST') {
      const b = await readJson(req);
      const from = db().customers.find((c) => c.id === b.fromId);
      if (!from) throw new HttpError(400, 'Who is sending it? Scan their member card.');
      const to = place(b.toPlaceId);
      if (!to) throw new HttpError(400, 'Where is it going? Pick a place.');
      const toPerson = db().customers.find((c) => c.id === b.toPersonId) || null;
      const size = SIZES[b.size] ? b.size : 'small';
      const weight = clamp(Math.round((Number(b.weight) || 0) * 10) / 10, 0, 50);
      const extras = [...new Set((Array.isArray(b.extras) ? b.extras : []).filter((x) => EXTRAS[x]))];
      const cost = postage({ size, weight, extras, toPlaceId: to.id });
      let paidWith = { method: 'cash' };
      let receipt = null;
      let change = 0;
      if (cost.total) {
        if (b.pay?.method === 'card') {
          const { account, card } = await checkCard(b.pay.cardId, b.pay.pin, cost.total);
          addTxn(account, -cost.total, 'purchase', `📦 Postage to ${to.name}`, { cardId: card.id });
          const payout = accountById(p.settings.payoutAccountId);
          if (payout && payout !== account) addTxn(payout, cost.total, 'sale', `📦 Postage from ${account.owner.name}`);
          paidWith = { method: 'card', last4: card.number.slice(-4) };
          receipt = { owner: account.owner.name, balanceLeft: account.balance };
        } else {
          const tendered = b.pay?.tendered == null ? cost.total : cents(b.pay.tendered);
          if (tendered < cost.total) throw new HttpError(400, 'Not enough money yet');
          change = tendered - cost.total;
        }
      }
      const parcel = {
        id: newId(), fromId: from.id, fromName: from.name, toPersonId: toPerson?.id || null, toName: toPerson?.name || null,
        toPlaceId: to.id, size, weight, extras, postage: cost.total, paidWith, status: 'accepted', events: [], createdAt: new Date().toISOString(),
      };
      event(parcel, 'accepted');
      p.parcels.push(parcel);
      const done = p.parcels.filter((x) => x.status === 'delivered');
      if (done.length > MAX_DONE) { const drop = new Set(done.slice(0, done.length - MAX_DONE)); p.parcels = p.parcels.filter((x) => !drop.has(x)); }
      return ok(201, { parcel, receipt, change }, paidWith.method === 'card' ? 'state' : 'post');
    }
    if (parts[2] === 'parcels' && parts[3] && parts[4] === 'advance' && method === 'POST') {
      // At the counter: Accepted → Sorting → Out for delivery. Delivering needs the door sign.
      const parcel = parcelById(parts[3]);
      const i = STEPS.indexOf(parcel.status);
      if (i >= 2) throw new HttpError(400, parcel.status === 'delivered' ? 'That parcel was already delivered' : 'It is out for delivery. Scan the door sign where it goes!');
      event(parcel, STEPS[i + 1]);
      return ok(200, parcel);
    }
    if (parts[2] === 'parcels' && parts[3] && parts[4] === 'deliver' && method === 'POST') {
      const parcel = parcelById(parts[3]);
      if (parcel.status === 'delivered') throw new HttpError(400, 'That parcel was already delivered', { code: 'done' });
      const b = await readJson(req);
      const at = place(b.placeId);
      if (!at) throw new HttpError(400, 'Scan a door sign');
      if (at.id !== parcel.toPlaceId) {
        const right = place(parcel.toPlaceId);
        throw new HttpError(400, `Wrong house! This one goes to ${right ? `${right.emoji} ${right.name}` : 'somewhere else'}.`, { code: 'wrong', placeId: parcel.toPlaceId });
      }
      event(parcel, 'delivered', { placeId: at.id });
      return ok(200, parcel);
    }

    // ---- places and rates (grown-ups)
    if (url.pathname === '/api/post/places' && method === 'PUT') {
      requirePin(req);
      const b = await readJson(req);
      const old = new Map(p.places.map((x) => [x.id, x]));
      const list = (Array.isArray(b.places) ? b.places : []).slice(0, 26).map((x, i) => ({
        id: old.has(x.id) ? x.id : newId(), name: clean(x.name, 40) || `Place ${i + 1}`, emoji: clean(x.emoji, 16) || '🏠', far: !!x.far, zone: zoneFor(i),
      }));
      if (!list.length) throw new HttpError(400, 'Keep at least one place');
      const busy = p.parcels.find((x) => x.status !== 'delivered' && !list.some((y) => y.id === x.toPlaceId));
      if (busy) throw new HttpError(400, `A parcel is still on its way to ${old.get(busy.toPlaceId)?.name || 'that place'}. Deliver it first.`);
      p.places = list;
      return ok(200, p.places);
    }
    if (url.pathname === '/api/post/settings' && method === 'PUT') {
      requirePin(req);
      const b = await readJson(req);
      const r = p.settings.rates;
      for (const k of Object.keys(DEFAULT_RATES)) if (b.rates?.[k] !== undefined) r[k] = clamp(cents(b.rates[k]), 0, 10000);
      if (b.payoutAccountId !== undefined) p.settings.payoutAccountId = accountById(b.payoutAccountId) ? b.payoutAccountId : null;
      if (b.autoLabel !== undefined) p.settings.autoLabel = !!b.autoLabel;
      return ok(200, p.settings);
    }
    return false;
  }

  function resetPlay() { P().parcels = []; }

  return { handle, publicPost, resetPlay, postage, SIZES, EXTRAS };
};
