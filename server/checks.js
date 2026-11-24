'use strict';
// 🧾 Checks: write one from your bank account to someone, print it, and they cash it at the Bank
// (into their account, or as play cash). It bounces if the writer doesn't have the money.

module.exports = function checks(ctx) {
  const { HttpError, newId, clean, cents, send, readJson, persist, addTxn, accountById } = ctx;
  const db = () => ctx.db();
  const list = () => (db().checks ||= []);
  const MAX_SIG = 60_000; // a small drawn signature (PNG data URL)

  function publicChecks() {
    const all = list();
    const open = all.filter((c) => !c.cashedAt && !c.voidAt);
    const done = all.filter((c) => c.cashedAt || c.voidAt).slice(-30);
    return [...open, ...done];
  }

  async function handle(req, res, url, parts) {
    const method = req.method;
    if (url.pathname === '/api/checks' && method === 'POST') {
      const b = await readJson(req);
      const from = accountById(b.fromAccountId);
      if (!from) throw new HttpError(400, 'Whose bank account is the check from?');
      const to = db().customers.find((c) => c.id === b.toCustomerId);
      if (!to) throw new HttpError(400, 'Who is the check for?');
      const amount = cents(b.amount);
      if (!amount) throw new HttpError(400, 'How much is the check for?');
      const sig = typeof b.signature === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.signature) && b.signature.length <= MAX_SIG ? b.signature : null;
      if (!sig) throw new HttpError(400, 'Sign the check first ✍️');
      if (list().length >= 300) list().splice(0, list().length - 299);
      const n = list().filter((c) => c.fromAccountId === from.id).length + 101;
      const check = { id: newId(), number: n, fromAccountId: from.id, fromName: from.owner.name, toCustomerId: to.id, toName: to.name, amount, memo: clean(b.memo, 60), signature: sig, at: new Date().toISOString(), cashedAt: null, voidAt: null };
      list().push(check);
      persist('state');
      send(res, 201, check); return true;
    }
    if (parts[2] && parts[3] === 'cash' && method === 'POST') {
      const check = list().find((c) => c.id === parts[2]);
      if (!check) throw new HttpError(404, 'That check is not real 🤔');
      if (check.cashedAt) throw new HttpError(400, 'That check was already cashed', { code: 'cashed' });
      if (check.voidAt) throw new HttpError(400, 'That check was torn up', { code: 'void' });
      const from = accountById(check.fromAccountId);
      if (!from) throw new HttpError(400, `${check.fromName}'s account is closed, so the check bounced! 🏀`, { code: 'bounced' });
      if (from.balance < check.amount) throw new HttpError(400, `Bounced! 🏀 ${check.fromName} doesn't have enough money in the bank.`, { code: 'bounced' });
      const b = await readJson(req);
      const into = b.accountId ? accountById(b.accountId) : null;
      if (b.accountId && (!into || into.customerId !== check.toCustomerId)) throw new HttpError(400, `Put it in ${check.toName}'s own account`);
      addTxn(from, -check.amount, 'check', `🧾 Check #${check.number} to ${check.toName}`, { checkId: check.id });
      if (into) addTxn(into, check.amount, 'check', `🧾 Check #${check.number} from ${check.fromName}`, { checkId: check.id });
      Object.assign(check, { cashedAt: new Date().toISOString(), cashedInto: into ? into.id : 'cash' });
      persist('state');
      send(res, 200, { check, cashOut: into ? 0 : check.amount, balance: into ? into.balance : null }); return true;
    }
    if (parts[2] && parts[3] === 'void' && method === 'POST') {
      const check = list().find((c) => c.id === parts[2]);
      if (!check || check.cashedAt) throw new HttpError(400, 'That check can’t be torn up now');
      check.voidAt = new Date().toISOString();
      persist('state');
      send(res, 200, check); return true;
    }
    return false;
  }

  return { handle, publicChecks };
};
