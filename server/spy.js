'use strict';
// 🕵️ Spy HQ: agents, Code Breaker records, vaults and scavenger-hunt missions.
// Secrets (vault combinations, prizes, clue text) stay on the server: kids only get a clue's
// text by scanning its card in the right order, and a prize by opening its vault.

const SPY_DEFAULTS = () => ({ agents: [], records: [], vaults: [], missions: [], places: [] });
const LEVELS = ['easy', 'medium', 'hard'];
const CIPHERS = ['none', 'caesar', 'backwards', 'numbers'];

module.exports = function spy(ctx) {
  const { HttpError, newId, isId, clean, clamp, cents, send, readJson, requirePin, pinOk, persist, addTxn, accountById, resolvePhoto, isPhotoPath } = ctx;
  const db = () => ctx.db();
  const S = () => { const d = db(); d.spy = { ...SPY_DEFAULTS(), ...(d.spy || {}) }; return d.spy; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const find = (list, id, what) => {
    const x = list.find((v) => v.id === id);
    if (!x) throw new HttpError(404, `That ${what} is gone`);
    return x;
  };

  // What every tablet sees (no combinations, no hidden prizes, no clue text).
  function publicSpy() {
    const s = S();
    return {
      agents: s.agents,
      records: s.records,
      places: s.places,
      vaults: s.vaults.map((v) => ({
        id: v.id, name: v.name, emoji: v.emoji, length: v.combo.length, hints: v.hints, madeBy: v.madeBy,
        prizeKind: v.prize.kind, amount: v.prize.kind === 'bank' ? v.prize.amount : null,
        openedAt: v.openedAt, openedBy: v.openedBy, claimed: !!v.claimedAt,
        prize: v.openedAt ? v.prize : null, // revealed once it's open
      })),
      missions: s.missions.map((m) => ({
        id: m.id, name: m.name, emoji: m.emoji, clueCount: m.clues.length, vaultId: m.vaultId,
        runs: m.runs.map((r) => ({ agentId: r.agentId, found: r.found.length, startedAt: r.startedAt, doneAt: r.doneAt })),
      })),
    };
  }

  function normVault(b, old, grownup) {
    const combo = String(b.combo ?? old?.combo ?? '').replace(/\D/g, '');
    if (combo.length < 3 || combo.length > 6) throw new HttpError(400, 'A vault code is 3 to 6 numbers');
    const kind = b.prize?.kind === 'bank' ? 'bank' : 'message';
    if (kind === 'bank' && !grownup) throw new HttpError(401, 'Grown-up PIN needed for a money prize');
    const prize = kind === 'bank'
      ? { kind, amount: cents(b.prize.amount), text: clean(b.prize.text, 200) }
      : { kind, text: clean(b.prize?.text, 300) || 'You did it! 🎉' };
    if (kind === 'bank' && (!prize.amount || prize.amount > 100_000)) throw new HttpError(400, 'Pick a prize between $0.01 and $1,000');
    return {
      id: old?.id || newId(), name: clean(b.name, 40) || 'The Vault', emoji: clean(b.emoji, 16) || '🔐',
      combo, prize, hints: b.hints !== false, madeBy: old?.madeBy || (grownup ? 'grownup' : 'kid'),
      openedAt: null, openedBy: null, claimedAt: null, createdAt: old?.createdAt || new Date().toISOString(),
    };
  }

  function normMission(b, old) {
    const s = S();
    const clues = [];
    const oldClues = new Map((old?.clues || []).map((c) => [c.id, c]));
    for (const c of (Array.isArray(b.clues) ? b.clues : []).slice(0, 12)) {
      const text = clean(c.text, 300);
      if (!text) continue;
      const cipher = CIPHERS.includes(c.cipher) ? c.cipher : 'none';
      clues.push({
        id: isId(c.id) && oldClues.has(c.id) ? c.id : newId(), text, cipher,
        shift: clamp(Math.round(Number(c.shift) || 3), 1, 25), spot: clean(c.spot, 80),
      });
    }
    if (clues.length < 1) throw new HttpError(400, 'A mission needs at least one clue');
    const vaultId = s.vaults.some((v) => v.id === b.vaultId) ? b.vaultId : null;
    return {
      id: old?.id || newId(), name: clean(b.name, 40) || 'Secret Mission', emoji: clean(b.emoji, 16) || '🗺️',
      clues, vaultId, runs: old?.runs || [], createdAt: old?.createdAt || new Date().toISOString(),
    };
  }

  // The clue a kid may see, with its cipher (they decode it in Cipher Lab).
  const showClue = (m, i) => ({ index: i, total: m.clues.length, id: m.clues[i].id, text: m.clues[i].text, cipher: m.clues[i].cipher, shift: m.clues[i].shift });

  function runFor(m, agentId) {
    return m.runs.find((r) => r.agentId === (agentId || null) && !r.doneAt) || null;
  }

  async function handle(req, res, url, parts) {
    const { pathname } = url;
    const method = req.method;
    if (parts[1] !== 'spy') return false;
    const s = S();

    // ---- agents (no PIN: it's pretend play)
    if (pathname === '/api/spy/agents' && method === 'POST') {
      const b = await readJson(req);
      if (s.agents.length >= 50) throw new HttpError(400, 'That is a lot of agents already');
      const codename = clean(b.codename, 40);
      if (!codename) throw new HttpError(400, 'Every agent needs a codename');
      const agent = {
        id: newId(), codename, emoji: clean(b.emoji, 16) || '🕵️', photo: await resolvePhoto(b.photo, null),
        customerId: db().customers.some((c) => c.id === b.customerId) ? b.customerId : null,
        number: String(s.agents.reduce((n, a) => Math.max(n, Number(a.number) || 0), 0) + 1).padStart(3, '0'),
        createdAt: new Date().toISOString(),
      };
      s.agents.push(agent);
      persist('spy');
      send(res, 201, agent); return true;
    }
    if (parts[2] === 'agents' && parts.length === 4) {
      const agent = find(s.agents, parts[3], 'agent');
      if (method === 'PUT') {
        const b = await readJson(req);
        Object.assign(agent, {
          codename: clean(b.codename, 40) || agent.codename, emoji: clean(b.emoji, 16) || agent.emoji,
          photo: await resolvePhoto(b.photo, agent),
          customerId: b.customerId === undefined ? agent.customerId : db().customers.some((c) => c.id === b.customerId) ? b.customerId : null,
        });
        persist('spy'); send(res, 200, agent); return true;
      }
      if (method === 'DELETE') {
        s.agents = s.agents.filter((a) => a !== agent);
        s.records = s.records.filter((r) => r.agentId !== agent.id);
        persist('spy'); send(res, 200, { ok: true }); return true;
      }
    }

    // ---- Code Breaker best scores (fewest guesses, then fastest) per agent and level
    if (pathname === '/api/spy/records' && method === 'POST') {
      const b = await readJson(req);
      const level = LEVELS.includes(b.level) ? b.level : 'custom';
      const agentId = s.agents.some((a) => a.id === b.agentId) ? b.agentId : null;
      const guesses = clamp(Math.round(Number(b.guesses) || 0), 1, 20);
      const seconds = clamp(Math.round(Number(b.seconds) || 0), 0, 36000);
      const old = s.records.find((r) => r.agentId === agentId && r.level === level);
      let best = false;
      if (!old) { s.records.push({ agentId, level, guesses, seconds, at: new Date().toISOString(), wins: 1 }); best = true; }
      else {
        old.wins = (old.wins || 0) + 1;
        if (guesses < old.guesses || (guesses === old.guesses && seconds < old.seconds)) { Object.assign(old, { guesses, seconds, at: new Date().toISOString() }); best = true; }
      }
      persist('spy'); send(res, 200, { best }); return true;
    }

    // ---- vaults: anyone can make one with a message inside; money prizes need the PIN
    if (pathname === '/api/spy/vaults' && method === 'POST') {
      if (s.vaults.length >= 30) throw new HttpError(400, 'That is a lot of vaults already');
      const v = normVault(await readJson(req), null, pinOk(req));
      s.vaults.push(v);
      persist('spy'); send(res, 201, { id: v.id }); return true;
    }
    if (pathname === '/api/spy/admin' && method === 'GET') {
      requirePin(req);
      send(res, 200, { vaults: s.vaults, missions: s.missions, places: s.places }); return true;
    }
    if (pathname === '/api/spy/places' && method === 'PUT') {
      requirePin(req);
      const b = await readJson(req);
      s.places = (Array.isArray(b.places) ? b.places : []).map((p) => clean(p, 60)).filter(Boolean).slice(0, 40);
      persist('spy'); send(res, 200, { places: s.places }); return true;
    }
    if (parts[2] === 'vaults' && parts[3]) {
      const v = find(s.vaults, parts[3], 'vault');
      const grownupOnly = v.madeBy === 'grownup' || v.prize.kind === 'bank';
      if (parts.length === 4 && method === 'PUT') {
        if (grownupOnly) requirePin(req);
        const next = normVault(await readJson(req), v, pinOk(req));
        s.vaults[s.vaults.indexOf(v)] = next;
        persist('spy'); send(res, 200, { id: next.id }); return true;
      }
      if (parts.length === 4 && method === 'DELETE') {
        if (grownupOnly) requirePin(req);
        s.vaults = s.vaults.filter((x) => x !== v);
        for (const m of s.missions) if (m.vaultId === v.id) m.vaultId = null;
        persist('spy'); send(res, 200, { ok: true }); return true;
      }
      if (parts[4] === 'try' && method === 'POST') {
        const b = await readJson(req);
        const guess = String(b.combo ?? '').replace(/\D/g, '');
        if (v.openedAt) { send(res, 200, { open: true, already: true, prize: v.prize }); return true; }
        if (guess !== v.combo) {
          await sleep(400); // slows down guessing every number
          const right = [...guess].filter((d, i) => d === v.combo[i]).length;
          send(res, 200, { open: false, hint: v.hints && guess.length === v.combo.length ? right : null }); return true;
        }
        const agent = s.agents.find((a) => a.id === b.agentId);
        Object.assign(v, { openedAt: new Date().toISOString(), openedBy: agent ? agent.codename : null });
        persist('spy');
        send(res, 200, { open: true, prize: v.prize }); return true;
      }
      if (parts[4] === 'claim' && method === 'POST') {
        // A money prize goes into one bank account, once.
        if (!v.openedAt) throw new HttpError(400, 'Open the vault first');
        if (v.prize.kind !== 'bank') throw new HttpError(400, 'This vault has no money in it');
        if (v.claimedAt) throw new HttpError(400, 'Someone already took the money');
        const acct = accountById((await readJson(req)).accountId);
        if (!acct) throw new HttpError(400, 'Pick a bank account');
        addTxn(acct, v.prize.amount, 'deposit', `🔐 Prize from ${v.name}`);
        v.claimedAt = new Date().toISOString();
        persist('state'); send(res, 200, { balance: acct.balance, owner: acct.owner.name }); return true;
      }
      if (parts[4] === 'lock' && method === 'POST') {
        // Close it again to play once more. A claimed money prize stays claimed.
        if (grownupOnly) requirePin(req);
        Object.assign(v, { openedAt: null, openedBy: null });
        if (v.prize.kind === 'bank' && v.claimedAt) v.claimedAt = null; // grown-up re-filled it
        persist('spy'); send(res, 200, { ok: true }); return true;
      }
    }

    // ---- missions: grown-ups build them; kids play by scanning the clue cards in order
    if (pathname === '/api/spy/missions' && method === 'POST') {
      requirePin(req);
      if (s.missions.length >= 30) throw new HttpError(400, 'That is a lot of missions already');
      const m = normMission(await readJson(req), null);
      s.missions.push(m);
      persist('spy'); send(res, 201, m); return true;
    }
    if (parts[2] === 'missions' && parts[3]) {
      const m = find(s.missions, parts[3], 'mission');
      if (parts.length === 4 && method === 'PUT') {
        requirePin(req);
        const next = normMission(await readJson(req), m);
        s.missions[s.missions.indexOf(m)] = next;
        persist('spy'); send(res, 200, next); return true;
      }
      if (parts.length === 4 && method === 'DELETE') {
        requirePin(req);
        s.missions = s.missions.filter((x) => x !== m);
        persist('spy'); send(res, 200, { ok: true }); return true;
      }
      if (parts[4] === 'reset' && method === 'POST') {
        requirePin(req);
        m.runs = [];
        persist('spy'); send(res, 200, { ok: true }); return true;
      }
      const agentId = s.agents.some((a) => a.id === url.searchParams.get('agent')) ? url.searchParams.get('agent') : null;
      if (parts[4] === 'run' && method === 'GET') {
        // The clues this agent already found (to show them again), and how far along they are.
        const r = runFor(m, agentId);
        send(res, 200, { run: r ? { startedAt: r.startedAt, found: r.found.map((id) => showClue(m, m.clues.findIndex((c) => c.id === id))) } : null, total: m.clues.length });
        return true;
      }
      if (parts[4] === 'scan' && method === 'POST') {
        const b = await readJson(req);
        const i = m.clues.findIndex((c) => c.id === String(b.clueId || '').toLowerCase());
        if (i < 0) throw new HttpError(404, 'That clue card is not part of this mission');
        let r = runFor(m, agentId);
        if (!r) {
          if (i !== 0) throw new HttpError(400, "That's not where the mission starts, agent. Find clue card 1!", { code: 'order' });
          r = { agentId, startedAt: new Date().toISOString(), found: [], doneAt: null };
          m.runs.push(r);
          if (m.runs.length > 50) m.runs.splice(0, m.runs.length - 50);
        }
        if (r.found.includes(m.clues[i].id)) { send(res, 200, { ...showClue(m, i), again: true }); return true; }
        if (i !== r.found.length) throw new HttpError(400, "That's not your next clue, agent. Keep looking!", { code: 'order' });
        r.found.push(m.clues[i].id);
        const done = r.found.length === m.clues.length;
        const out = { ...showClue(m, i), done };
        if (done) {
          r.doneAt = new Date().toISOString();
          out.seconds = Math.round((Date.parse(r.doneAt) - Date.parse(r.startedAt)) / 1000);
          const v = s.vaults.find((x) => x.id === m.vaultId);
          if (v) Object.assign(out, { vaultId: v.id, vaultName: v.name, vaultCode: v.combo });
        }
        persist('spy');
        send(res, 200, out); return true;
      }
    }
    return false;
  }

  // Reset play data: forget who opened what and mission progress (agents and builds are kept).
  function resetPlay() {
    const s = S();
    for (const v of s.vaults) Object.assign(v, { openedAt: null, openedBy: null, ...(v.prize.kind === 'bank' ? {} : { claimedAt: null }) });
    for (const m of s.missions) m.runs = [];
    s.records = [];
  }

  return { handle, publicSpy, resetPlay, isPhotoPath };
};
