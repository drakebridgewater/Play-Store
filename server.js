'use strict';
// Play Store POS: a pretend-play register. No npm dependencies; data lives in one db.json.

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeStore, templateList, hasTemplate } = require('./templates');
const Art = require('./public/art.js');
const Slip = require('./public/slip.js');
const Printer = require('./server/printer.js');
const Codes = require('./server/codes.js');

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || '/data';
const SETUP_PIN = String(process.env.SETUP_PIN || '1234');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const MAX_BODY = 4 * 1024 * 1024;
const MAX_PHOTO = 1.5 * 1024 * 1024;
const MAX_ORDERS = 1000;
const STATUSES = ['new', 'making', 'ready', 'delivered'];
const MAX_TXNS = 5000;
const CARD_DESIGNS = new Set(['bank', 'ocean', 'grape', 'lava', 'forest', 'gold', 'candy', 'night']);

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const newId = () => crypto.randomBytes(5).toString('hex');
const isId = (v) => typeof v === 'string' && /^[a-z0-9]{1,24}$/.test(v);
const clean = (v, max = 40) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const cents = (v) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, 'Price must be between $0 and $100,000');
  return n;
};

// ---------------------------------------------------------------- storage
let db;
let rev = 0;
let writeChain = Promise.resolve();

function loadDb() {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  let loaded = null;
  try {
    loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      const keep = `${DB_FILE}.corrupt-${Date.now()}`;
      try { fs.copyFileSync(DB_FILE, keep); } catch { /* ignore */ }
      console.error(`db.json unreadable (${e.message}); kept a copy at ${keep} and starting fresh`);
    }
  }
  db = {
    version: 1, stores: [], orders: [], nextOrderNumber: 1,
    customers: defaultPeople(),
    banks: [{ id: newId(), name: 'Play Bank', emoji: '🏦', color: '#0f766e' }],
    accounts: [], transactions: [],
    hub: { hidden: [] },
    queue: { next: 1, serving: 0 },
    qrCodes: [], scanLog: [], coupons: [], checks: [],
    ...(loaded || {}),
  };
  db.printer = { ...PRINTER_DEFAULTS, ...(db.printer || {}) };
  if (!PAPER[db.printer.paper]) db.printer.paper = OLD_PAPER[db.printer.paper] || PRINTER_DEFAULTS.paper;
  // Stores made before the kitchen setting: electronics-look (tech) stores just check out.
  let migrated = false;
  for (const s of db.stores) if (s.kitchen === undefined) { s.kitchen = s.theme !== 'electronics'; migrated = true; }
  if (!loaded || !loaded.banks || migrated) persist('init');
}
function defaultPeople() {
  return [{ id: newId(), name: 'Mom', emoji: '👩' }, { id: newId(), name: 'Dad', emoji: '👨' }];
}

// quiet: save without telling every tablet to reload (for things only one screen needs, like the scan log).
function persist(what, { quiet = false } = {}) {
  rev++;
  const snapshot = JSON.stringify(db, null, 1);
  writeChain = writeChain
    .then(async () => {
      const tmp = `${DB_FILE}.tmp`;
      await fsp.writeFile(tmp, snapshot);
      await fsp.rename(tmp, DB_FILE);
    })
    .catch((e) => console.error('saving db.json failed:', e));
  if (!quiet) broadcast(what);
}

// ---------------------------------------------------------------- receipt printer
// Settings live in db.json (Setup → Printer). PRINTER_HOST / PRINTER_PORT give the address
// when Setup leaves it empty. The printer's state is only kept in memory.
const PRINTER_DEFAULTS = {
  enabled: true, host: '', port: 9100, paper: 48, dailyLimit: 40, maxCm: 40,
  autoReceipt: false, autoTicket: false, funLines: true, cut: true, usage: { day: '', count: 0 },
};
// Paper choices, by letters a line in the normal font. Epson TM-T88 printers print 42 letters
// (512 dots at 180 dpi) on 80 mm paper; most other 80 mm printers print 48 (576 dots at 203 dpi).
const PAPER = {
  48: { label: '80 mm · 48 letters', dots: 576, cols: 48, dpmm: 8 },
  42: { label: '80 mm · 42 letters (Epson TM-T88)', dots: 512, cols: 42, dpmm: 7.1 },
  32: { label: '58 mm · 32 letters', dots: 384, cols: 32, dpmm: 8 },
};
const OLD_PAPER = { 80: 48, 58: 32 }; // settings saved before the 42-letter choice
let printerStatus = { state: 'unknown', message: '' };
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the container's TZ
function printerAddress() {
  const p = db.printer;
  return { host: p.host || process.env.PRINTER_HOST || '', port: p.host ? p.port : Number(process.env.PRINTER_PORT) || p.port };
}
function printsToday() { return db.printer.usage.day === today() ? db.printer.usage.count : 0; }
function publicPrinter() {
  const { usage, ...settings } = db.printer;
  const addr = printerAddress();
  return { ...settings, ...PAPER[settings.paper], papers: Object.entries(PAPER).map(([id, x]) => ({ id: Number(id), label: x.label })), address: addr.host ? `${addr.host}:${addr.port}` : '', envHost: process.env.PRINTER_HOST || '', today: printsToday(), status: printerStatus };
}
function setPrinterStatus(state, message = '') {
  if (printerStatus.state === state && printerStatus.message === message) return;
  printerStatus = { state, message };
  broadcast('printer');
}
function statusFrom(st) {
  if (st.cover === 'open') return ['open', 'The lid is open'];
  if (st.paper === 'out') return ['out', 'Out of paper'];
  if (st.paper === 'low') return ['low', 'Paper is running low'];
  return ['ready', ''];
}
async function checkPrinter() {
  const { host, port } = printerAddress();
  if (!db.printer.enabled) return setPrinterStatus('off');
  if (!host) return setPrinterStatus('unset');
  try { setPrinterStatus(...statusFrom(await Printer.queue(() => Printer.talk(host, port, null)))); }
  catch (e) { setPrinterStatus('offline', e.message); }
}
setInterval(checkPrinter, 30_000).unref();

async function printSlip(raw, { test = false } = {}) {
  const p = db.printer;
  const { host, port } = printerAddress();
  if (!p.enabled) throw new HttpError(409, 'The printer is turned off');
  if (!host) throw new HttpError(409, 'No printer is set up yet');
  if (!test && printsToday() >= p.dailyLimit) throw new HttpError(429, 'The printer is resting until tomorrow 😴', { code: 'limit' });
  const paper = PAPER[p.paper];
  let slip;
  try { slip = Slip.normalize(raw, paper); } catch (e) { throw new HttpError(400, e.message); }
  if (Slip.heightDots(Slip.layout(slip, paper)) > p.maxCm * 10 * paper.dpmm) throw new HttpError(400, 'That is too long for the printer', { code: 'length' });
  const job = Printer.escpos(slip, { ...paper, cut: p.cut });
  try {
    setPrinterStatus(...statusFrom(await Printer.queue(() => Printer.talk(host, port, job))));
  } catch (e) {
    setPrinterStatus(/paper/.test(e.message) ? 'out' : /lid/.test(e.message) ? 'open' : 'offline', e.message);
    throw new HttpError(503, e.message, { code: 'printer' });
  }
  if (!test) { p.usage = { day: today(), count: printsToday() + 1 }; persist('printer'); }
  return { ok: true, left: Math.max(0, p.dailyLimit - p.usage.count) };
}

// ---------------------------------------------------------------- live updates (SSE)
const clients = new Set();
function broadcast(what) {
  const msg = `event: change\ndata: ${JSON.stringify({ rev, what })}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25_000).unref();

// ---------------------------------------------------------------- helpers
function send(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Too big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Bad JSON')); }
    });
    req.on('error', reject);
  });
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const pinMatches = (pin) => crypto.timingSafeEqual(sha(pin), sha(SETUP_PIN));
const pinOk = (req) => pinMatches(req.headers['x-setup-pin'] || '');
function requirePin(req) { if (!pinOk(req)) throw new HttpError(401, 'Grown-up PIN needed'); }

function findStore(id) {
  const s = db.stores.find((x) => x.id === id);
  if (!s) throw new HttpError(404, 'Store not found');
  return s;
}

async function savePhoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Photo must be a JPEG, PNG or WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_PHOTO) throw new HttpError(413, 'Photo is too big');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = `${newId()}${newId()}.${ext}`;
  await fsp.writeFile(path.join(PHOTO_DIR, file), buf);
  return `/photos/${file}`;
}

// photo: data URL = new photo, '' / null = remove, anything else = keep the previous one.
async function resolvePhoto(input, prev) {
  if (typeof input === 'string' && input.startsWith('data:')) return savePhoto(input);
  if (input === null || input === '') return null;
  return prev?.photo || null;
}

const isPhotoPath = (v) => typeof v === 'string' && /^\/photos\/[a-z0-9]+\.(jpg|png|webp)$/.test(v);

async function normItem(b, prev, catIds, fallbackCat, addedBy) {
  const name = clean(b.name, 40);
  if (!name) throw new HttpError(400, 'Every item needs a name');
  // Builder items (custom sandwiches/drinks) price themselves from their recipe.
  const builder = Art.BUILDERS[b.builder] ? b.builder : null;
  const recipe = builder && b.recipe ? Art.normRecipe(builder, b.recipe) : null;
  const price = builder ? (recipe ? Art.priceOf(builder, recipe) : Art.startPrice(builder)) : cents(b.price);
  const was = b.wasPrice ? cents(b.wasPrice) : 0;
  return {
    id: prev?.id || newId(),
    categoryId: catIds.has(b.categoryId) ? b.categoryId : fallbackCat,
    name,
    emoji: clean(b.emoji, 16) || '🏷️',
    icon: Object.prototype.hasOwnProperty.call(Art.ICONS, b.icon) ? b.icon : null,
    photo: await resolvePhoto(b.photo, prev),
    price,
    wasPrice: !builder && was > price ? was : null,
    builder,
    recipe,
    barcodes: normBarcodes(b.barcodes === undefined ? prev?.barcodes : b.barcodes),
    // How many are left (null = not counted). Sales take from it, returns and restocking add to it.
    stock: builder ? null : b.stock === undefined ? prev?.stock ?? null : b.stock === null || b.stock === '' ? null : clamp(Math.round(Number(b.stock)) || 0, 0, 999),
    addedBy: prev?.addedBy || addedBy,
  };
}

// Barcodes linked to an item (real product codes scanned at the register). Up to 10 per item.
function normBarcodes(list) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    const code = String(v ?? '').trim();
    if (/^[\x21-\x7e]{3,40}$/.test(code) && !out.includes(code)) out.push(code);
  }
  return out.slice(0, 10);
}

async function normStore(b, old) {
  const s = {
    id: old?.id || newId(),
    name: clean(b.name, 40) || 'My Store',
    emoji: clean(b.emoji, 16) || '🏪',
    color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#16a34a',
    theme: b.theme === 'electronics' ? 'electronics' : 'plain',
    taxRate: clamp(Math.round((Number(b.taxRate) || 0) * 100) / 100, 0, 50),
    playMoney: b.playMoney !== false,
    kitchen: b.kitchen !== false,
    payoutAccountId: accountById(b.payoutAccountId) ? b.payoutAccountId : null,
    categories: [],
    items: [],
  };
  const seen = new Set();
  for (const c of (Array.isArray(b.categories) ? b.categories : []).slice(0, 40)) {
    const id = isId(c.id) && !seen.has(c.id) ? c.id : newId();
    seen.add(id);
    s.categories.push({ id, name: clean(c.name, 30) || 'Things', emoji: clean(c.emoji, 16) || '🏷️' });
  }
  if (!s.categories.length) s.categories.push({ id: newId(), name: 'Items', emoji: '🏷️' });
  const catIds = new Set(s.categories.map((c) => c.id));
  const oldItems = new Map((old?.items || []).map((i) => [i.id, i]));
  for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 500)) {
    s.items.push(await normItem(it, oldItems.get(it.id), catIds, s.categories[0].id, 'grownup'));
  }
  return s;
}

function myStuffCategory(store) {
  let cat = store.categories.find((c) => c.name.toLowerCase() === 'my stuff');
  if (!cat) { cat = { id: newId(), name: 'My Stuff', emoji: '⭐' }; store.categories.unshift(cat); }
  return cat.id;
}

function computeChange(total, tendered) {
  if (tendered == null) return { tendered: null, change: null };
  const t = cents(tendered);
  if (t < total) throw new HttpError(400, 'Not enough money yet');
  return { tendered: t, change: t - total };
}

// ---------------------------------------------------------------- bank
// Accounts belong to a bank and a person; debit cards belong to an account.
function findBank(id) {
  const b = db.banks.find((x) => x.id === id);
  if (!b) throw new HttpError(404, 'Bank not found');
  return b;
}
const accountById = (id) => (id ? db.accounts.find((a) => a.id === id) : null);
function findAccount(id) {
  const a = accountById(id);
  if (!a) throw new HttpError(404, 'Account not found');
  return a;
}
function findCard(id) {
  for (const account of db.accounts) {
    const card = account.cards.find((c) => c.id === id);
    if (card) return { account, card };
  }
  throw new HttpError(404, 'That card is gone');
}
function normBank(b, old) {
  return {
    id: old?.id || newId(),
    name: clean(b.name, 30) || 'Play Bank',
    emoji: clean(b.emoji, 16) || '🏦',
    color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#0f766e',
  };
}
const normPin = (v) => {
  if (v == null || v === '') return null;
  if (!/^\d{4}$/.test(String(v))) throw new HttpError(400, 'A card PIN is 4 numbers');
  return String(v);
};
// 16 digits starting with 4, with a valid Luhn check digit, like a real card.
function cardNumber() {
  const d = [4, ...Array.from({ length: 14 }, () => crypto.randomInt(10))];
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let x = d[d.length - 1 - i];
    if (i % 2 === 0) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
  }
  return [...d, (10 - (sum % 10)) % 10].join('');
}
function addTxn(account, amount, kind, memo, extra = {}) {
  account.balance += amount;
  db.transactions.push({ id: newId(), accountId: account.id, kind, amount, balance: account.balance, memo: clean(memo, 80), at: new Date().toISOString(), ...extra });
  if (db.transactions.length > MAX_TXNS) db.transactions.splice(0, db.transactions.length - MAX_TXNS);
}
// What clients see: card PINs never leave the server.
const publicAccount = (a) => ({ ...a, cards: a.cards.map(({ pin, ...c }) => ({ ...c, hasPin: !!pin })) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Paying with a debit card anywhere (store, library): frozen, PIN and balance checks.
async function checkCard(cardId, pin, amount) {
  const { account, card } = findCard(cardId);
  if (card.frozen) throw new HttpError(400, 'This card is frozen ❄️', { code: 'frozen' });
  if (card.pin && String(pin ?? '') !== card.pin) { await sleep(500); throw new HttpError(400, 'Wrong PIN', { code: 'pin' }); }
  if (account.balance < amount) {
    throw new HttpError(400, 'Not enough money in the bank', { code: 'funds', balance: account.balance });
  }
  return { account, card };
}

async function chargeCard(order, cardId, pin) {
  const { account, card } = await checkCard(cardId, pin, order.total);
  const store = db.stores.find((s) => s.id === order.storeId);
  const where = store ? `${store.emoji} ${store.name}` : 'Shop';
  addTxn(account, -order.total, 'purchase', `${where} · order #${order.number}`, { orderId: order.id, cardId: card.id });
  // Card money lands in the store's own account, if Setup picked one.
  const payout = accountById(store?.payoutAccountId);
  if (payout && payout !== account) {
    addTxn(payout, order.total, 'sale', `💳 Card sale · order #${order.number} (${order.customer})`, { orderId: order.id });
  }
  Object.assign(order, {
    paid: true, tendered: order.total, change: 0,
    paidWith: { method: 'card', cardId: card.id, last4: card.number.slice(-4), accountId: account.id, bankId: account.bankId, payoutAccountId: payout && payout !== account ? payout.id : null },
  });
  return { owner: account.owner.name, balanceLeft: account.balance };
}

// A cancelled card order gives the money back (and takes it back out of the store's account).
function refundCard(order) {
  const pw = order.paidWith;
  if (pw?.method !== 'card' || pw.refunded) return;
  const acct = accountById(pw.accountId);
  if (acct) addTxn(acct, order.total, 'refund', `↩️ Refund · order #${order.number}`, { orderId: order.id });
  const payout = accountById(pw.payoutAccountId);
  const take = payout ? Math.min(payout.balance, order.total) : 0;
  if (take) addTxn(payout, -take, 'refund', `↩️ Refund to ${order.customer} · order #${order.number}`, { orderId: order.id });
  pw.refunded = true;
}

// Put things back on the shelf (cancelled sales, returns, restocking). Only items that count stock.
function restock(store, list) {
  if (!store) return;
  for (const { itemId, qty } of list) {
    const item = store.items.find((i) => i.id === itemId);
    if (item && item.stock != null) item.stock = Math.min(999, item.stock + qty);
  }
}

// ---------------------------------------------------------------- coupons
// { id, storeId?, kind: amount | percent | item, value, itemId?, label, usedAt?, orderId? }
function findCoupon(id) {
  const c = db.coupons.find((x) => x.id === String(id || '').toLowerCase());
  if (!c) throw new HttpError(404, 'That coupon is not real 🤔');
  return c;
}
function couponLabel(c) {
  if (c.kind === 'percent') return `${c.value}% off`;
  if (c.kind === 'item') {
    const item = db.stores.flatMap((s) => s.items).find((i) => i.id === c.itemId);
    return `Free ${item ? item.name : 'item'}`;
  }
  return `$${(c.value / 100).toFixed(2)} off`;
}
function couponDiscount(c, lines, store, subtotal) {
  if (c.usedAt) throw new HttpError(400, 'That coupon was already used', { code: 'used' });
  if (c.storeId && c.storeId !== store.id) {
    const s = db.stores.find((x) => x.id === c.storeId);
    throw new HttpError(400, `That coupon is for ${s ? s.name : 'another store'}`, { code: 'store' });
  }
  let amount = 0;
  if (c.kind === 'amount') amount = Math.min(c.value, subtotal);
  else if (c.kind === 'percent') amount = Math.round((subtotal * c.value) / 100);
  else {
    const line = lines.find((l) => l.itemId === c.itemId);
    if (!line) throw new HttpError(400, `${couponLabel(c)}: put one in the order first!`, { code: 'item' });
    amount = line.price;
  }
  return { couponId: c.id, label: couponLabel(c), amount };
}

// Give back some lines of a paid order (the Returns desk). Card money goes back to the card;
// cash is handed back by the kid. Tax comes back in proportion.
function refundLines(order, wanted) {
  if (!order.paid) throw new HttpError(400, 'This order was never paid, so there is nothing to give back');
  order.refunds ||= [];
  const back = (i) => order.refunds.reduce((n, r) => n + r.lines.filter((l) => l.i === i).reduce((a, l) => a + l.qty, 0), 0);
  const lines = [];
  for (const w of Array.isArray(wanted) ? wanted : []) {
    const i = Math.round(Number(w.i));
    const line = order.lines[i];
    const qty = clamp(Math.round(Number(w.qty) || 0), 0, 99);
    if (!line || !qty) continue;
    if (qty > line.qty - back(i)) throw new HttpError(400, `Only ${line.qty - back(i)} ${line.name} can come back`);
    lines.push({ i, qty, name: line.name, price: line.price });
  }
  if (!lines.length) throw new HttpError(400, 'Pick something to give back');
  const part = lines.reduce((a, l) => a + l.price * l.qty, 0);
  // What those lines really cost: their share of the total (so tax and any coupon count too).
  const already = order.refunds.reduce((a, r) => a + r.amount, 0);
  const amount = Math.min(order.subtotal ? Math.round((part * order.total) / order.subtotal) : 0, order.total - already);
  restock(db.stores.find((s) => s.id === order.storeId), lines.map((l) => ({ itemId: order.lines[l.i].itemId, qty: l.qty })));
  const pw = order.paidWith || { method: 'cash' };
  const refund = { id: newId(), at: new Date().toISOString(), lines, amount, method: pw.method === 'card' ? 'card' : 'cash' };
  if (refund.method === 'card') {
    const acct = accountById(pw.accountId);
    if (acct) addTxn(acct, amount, 'refund', `↩️ Return · order #${order.number}`, { orderId: order.id });
    const payout = accountById(pw.payoutAccountId);
    const take = payout ? Math.min(payout.balance, amount) : 0;
    if (take) addTxn(payout, -take, 'refund', `↩️ Return for ${order.customer} · order #${order.number}`, { orderId: order.id });
    refund.last4 = pw.last4;
    refund.balanceLeft = acct ? acct.balance : null;
    refund.owner = acct ? acct.owner.name : null;
  }
  order.refunds.push(refund);
  order.updatedAt = refund.at;
  return refund;
}

// Today's numbers for the shopkeeper's end-of-day report (all stores, or one).
function dayReport(storeId) {
  const day = today();
  const orders = db.orders.filter((o) => new Date(o.createdAt).toLocaleDateString('en-CA') === day && (!storeId || o.storeId === storeId));
  const r = { day, orders: orders.length, paid: 0, sales: 0, tax: 0, cash: 0, card: 0, unpaid: 0, unpaidAmount: 0, refunds: 0, cashRefunds: 0, refundCount: 0, items: 0, best: [] };
  const counts = new Map();
  for (const o of orders) {
    for (const l of o.lines) { r.items += l.qty; counts.set(l.name, (counts.get(l.name) || 0) + l.qty); }
    if (!o.paid) { r.unpaid++; r.unpaidAmount += o.total; continue; }
    r.paid++; r.sales += o.total; r.tax += o.tax;
    if (o.paidWith?.method === 'card') r.card += o.total; else r.cash += o.total;
    for (const f of o.refunds || []) { r.refunds += f.amount; r.refundCount++; if (f.method === 'cash') r.cashRefunds += f.amount; }
  }
  r.best = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, qty]) => ({ name, qty }));
  r.firstNumber = orders.length ? Math.min(...orders.map((o) => o.number)) : null;
  r.lastNumber = orders.length ? Math.max(...orders.map((o) => o.number)) : null;
  return r;
}

function pruneOrders() {
  if (db.orders.length <= MAX_ORDERS) return;
  const extra = db.orders.length - MAX_ORDERS;
  let dropped = 0;
  db.orders = db.orders.filter((o) => !(o.status === 'delivered' && dropped < extra && ++dropped));
}

// ---------------------------------------------------------------- API
// 🎟️ Box Office and 🧾 checks live in server/boxoffice.js and server/checks.js.
const BoxOffice = require('./server/boxoffice.js')({
  db: () => db, HttpError, newId, clean, clamp, cents, send, readJson, persist, addTxn, accountById, checkCard, today,
});
const Checks = require('./server/checks.js')({
  db: () => db, HttpError, newId, clean, cents, send, readJson, persist, addTxn, accountById,
});

// 📦 Post Office routes live in server/post.js.
const Post = require('./server/post.js')({
  db: () => db, HttpError, newId, clean, clamp, cents, send, readJson, requirePin, persist, addTxn, accountById, checkCard,
});

// 📚 Library routes live in server/library.js.
const Library = require('./server/library.js')({
  db: () => db, HttpError, newId, isId, clean, clamp, cents, send, readJson, requirePin, persist,
  addTxn, accountById, resolvePhoto, checkCard, today,
});

// 🔎 Book and product barcode lookups live in server/lookup.js.
const Lookup = require('./server/lookup.js')({ HttpError, send });

// 🕵️ Spy HQ routes live in server/spy.js.
const Spy = require('./server/spy.js')({
  db: () => db, HttpError, newId, isId, clean, clamp, cents, send, readJson, requirePin, pinOk, persist,
  addTxn, accountById, resolvePhoto, isPhotoPath,
});

async function api(req, res, url) {
  const { pathname } = url;
  const method = req.method;
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  if (parts[1] === 'lookup' && await Lookup.handle(req, res, url)) return;
  if (parts[1] === 'spy' && await Spy.handle(req, res, url, parts)) return;
  if (parts[1] === 'library' && await Library.handle(req, res, url, parts)) return;
  if (parts[1] === 'post' && await Post.handle(req, res, url, parts)) return;
  if ((parts[1] === 'shows' || parts[1] === 'showtickets') && await BoxOffice.handle(req, res, url, parts)) return;
  if (parts[1] === 'checks' && await Checks.handle(req, res, url, parts)) return;

  // Coupons: anyone can make them (the shopkeeper prints them); each works once.
  if (pathname === '/api/coupons' && method === 'POST') {
    const b = await readJson(req);
    const kind = ['amount', 'percent', 'item'].includes(b.kind) ? b.kind : 'amount';
    const storeId = db.stores.some((s) => s.id === b.storeId) ? b.storeId : null;
    let value = 0, itemId = null;
    if (kind === 'amount') value = clamp(cents(b.value), 1, 100000);
    if (kind === 'percent') value = clamp(Math.round(Number(b.value)) || 0, 1, 100);
    if (kind === 'item') {
      itemId = db.stores.flatMap((s) => s.items).some((i) => i.id === b.itemId) ? b.itemId : null;
      if (!itemId) throw new HttpError(400, 'Pick the free item');
    }
    const count = clamp(Math.round(Number(b.count) || 1), 1, 10);
    if (db.coupons.length + count > 200) throw new HttpError(400, 'That is a lot of coupons already');
    const made = Array.from({ length: count }, () => ({ id: newId(), storeId, kind, value, itemId, usedAt: null, orderId: null, createdAt: new Date().toISOString() }));
    db.coupons.push(...made);
    persist('state');
    return send(res, 201, made.map((c) => ({ ...c, label: couponLabel(c) })));
  }
  if (parts[1] === 'coupons' && parts.length === 3 && method === 'DELETE') {
    db.coupons = db.coupons.filter((c) => c.id !== parts[2]);
    persist('state');
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ rev })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (pathname === '/api/state' && method === 'GET') {
    return send(res, 200, {
      rev, stores: db.stores, customers: db.customers, templates: templateList(),
      banks: db.banks, accounts: db.accounts.map(publicAccount), hub: db.hub, printer: publicPrinter(), queue: db.queue, spy: Spy.publicSpy(), qrCodes: db.qrCodes, library: Library.publicLibrary(), post: Post.publicPost(), boxOffice: BoxOffice.publicBoxOffice(),
      coupons: db.coupons.map((c) => ({ ...c, label: couponLabel(c) })), checks: Checks.publicChecks(),
    });
  }

  // Home screen: which app tiles are hidden (grown-ups).
  if (pathname === '/api/hub' && method === 'PUT') {
    requirePin(req);
    const b = await readJson(req);
    const hidden = Array.isArray(b.hidden) ? b.hidden.filter((id) => typeof id === 'string' && /^[a-z]{1,20}$/.test(id)) : [];
    db.hub = { ...db.hub, hidden: [...new Set(hidden)].slice(0, 30) };
    persist('hub');
    return send(res, 200, db.hub);
  }

  // What is this code? (scanner) GET /api/codes?c=KH-R-ABC123
  if (pathname === '/api/codes' && method === 'GET') {
    const info = Codes.lookup(db, url.searchParams.get('c'));
    if (url.searchParams.get('log') === '1' && info.code) {
      // The Scanner app's "everything scanned today" list. Kept to the last 200 scans.
      db.scanLog.push({ code: info.code, kind: info.kind, label: info.label, emoji: info.emoji, at: new Date().toISOString() });
      if (db.scanLog.length > 200) db.scanLog = db.scanLog.slice(-200);
      persist('scan', { quiet: true });
    }
    return send(res, 200, info);
  }
  if (pathname === '/api/scanlog' && method === 'GET') {
    const day = today();
    const todays = db.scanLog.filter((x) => new Date(x.at).toLocaleDateString('en-CA') === day);
    return send(res, 200, { today: todays.length, log: db.scanLog.slice(-60).reverse() });
  }

  // QR Studio: saved codes. A Wi-Fi card needs the PIN (it holds the password).
  if (pathname === '/api/qr' && method === 'POST') {
    const b = await readJson(req);
    const kind = ['message', 'emoji', 'secret', 'link', 'wifi'].includes(b.kind) ? b.kind : 'message';
    if (kind === 'wifi') requirePin(req);
    const text = String(b.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
    if (!text) throw new HttpError(400, 'Type something to put in the code');
    if (Buffer.byteLength(text, 'utf8') > 213) throw new HttpError(400, 'That is too long for a QR code');
    if (db.qrCodes.length >= 60) throw new HttpError(400, 'The gallery is full. Remove some first');
    const q = { id: newId(), kind, text, caption: clean(b.caption, 60), emoji: clean(b.emoji, 16) || '🔳', at: new Date().toISOString() };
    db.qrCodes.push(q);
    persist('qr');
    return send(res, 201, q);
  }
  if (parts[1] === 'qr' && parts.length === 3 && method === 'DELETE') {
    const q = db.qrCodes.find((x) => x.id === parts[2]);
    if (!q) throw new HttpError(404, 'That code is gone');
    if (q.kind === 'wifi') requirePin(req);
    db.qrCodes = db.qrCodes.filter((x) => x !== q);
    persist('qr');
    return send(res, 200, { ok: true });
  }
  // Printing needs no PIN (kids print receipts); a test print does, and skips the daily limit.
  if (pathname === '/api/print' && method === 'POST') {
    const b = await readJson(req);
    if (b.test) requirePin(req);
    return send(res, 200, await printSlip(b.slip, { test: !!b.test }));
  }
  if (pathname === '/api/printer/check' && method === 'POST') {
    await checkPrinter();
    return send(res, 200, publicPrinter());
  }
  if (pathname === '/api/printer' && method === 'PUT') {
    requirePin(req);
    const b = await readJson(req);
    const p = db.printer;
    const host = clean(b.host ?? p.host, 253);
    if (host && !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host)) throw new HttpError(400, 'The printer address should look like 192.168.1.50');
    Object.assign(p, {
      enabled: b.enabled === undefined ? p.enabled : !!b.enabled,
      host,
      port: clamp(Math.round(Number(b.port ?? p.port)) || 9100, 1, 65535),
      paper: PAPER[Number(b.paper)] ? Number(b.paper) : p.paper,
      dailyLimit: clamp(Math.round(Number(b.dailyLimit ?? p.dailyLimit)) || 1, 1, 500),
      maxCm: clamp(Math.round(Number(b.maxCm ?? p.maxCm)) || 40, 10, 200),
      autoReceipt: b.autoReceipt === undefined ? p.autoReceipt : !!b.autoReceipt,
      autoTicket: b.autoTicket === undefined ? p.autoTicket : !!b.autoTicket,
      funLines: b.funLines === undefined ? p.funLines : !!b.funLines,
      cut: b.cut === undefined ? p.cut : !!b.cut,
    });
    persist('printer');
    await checkPrinter();
    return send(res, 200, publicPrinter());
  }

  if (pathname === '/api/pin' && method === 'POST') {
    const b = await readJson(req);
    if (pinMatches(b.pin || '')) return send(res, 200, { ok: true });
    await new Promise((r) => setTimeout(r, 600));
    throw new HttpError(401, 'Wrong PIN');
  }

  // ---- orders
  if (pathname === '/api/orders' && method === 'GET') {
    const storeId = url.searchParams.get('storeId');
    const since = Date.now() - 12 * 3600 * 1000;
    let list = db.orders.filter((o) => !storeId || o.storeId === storeId);
    const open = list.filter((o) => o.status !== 'delivered');
    const done = list.filter((o) => o.status === 'delivered' && Date.parse(o.updatedAt) > since).slice(-30);
    return send(res, 200, { rev, orders: [...open, ...done] });
  }

  if (pathname === '/api/orders' && method === 'POST') {
    const b = await readJson(req);
    const store = findStore(b.storeId);
    const lines = [];
    for (const l of (Array.isArray(b.lines) ? b.lines : []).slice(0, 100)) {
      const item = store.items.find((i) => i.id === l.itemId);
      const qty = clamp(Math.round(Number(l.qty) || 0), 0, 99);
      if (!item || !qty) continue;
      const line = { itemId: item.id, name: item.name, emoji: item.emoji, icon: item.icon || null, photo: item.photo, price: item.price, qty, done: false };
      if (item.builder) {
        // Custom order: the server names and prices it from the recipe, never from the client.
        const recipe = Art.normRecipe(item.builder, l.recipe || item.recipe || Art.SAMPLE[item.builder]);
        const same = item.recipe && Art.recipeKey(item.builder, item.recipe) === Art.recipeKey(item.builder, recipe);
        Object.assign(line, { builder: item.builder, recipe, price: Art.priceOf(item.builder, recipe), name: same ? item.name : Art.nameOf(item.builder, recipe) });
      }
      lines.push(line);
    }
    if (!lines.length) throw new HttpError(400, 'The order is empty');
    // Stock: is there enough of everything?
    const want = new Map();
    for (const l of lines) want.set(l.itemId, (want.get(l.itemId) || 0) + l.qty);
    for (const [itemId, qty] of want) {
      const item = store.items.find((i) => i.id === itemId);
      if (item.stock != null && qty > item.stock) throw new HttpError(400, item.stock ? `Only ${item.stock} ${item.name} left!` : `${item.name} is sold out!`, { code: 'stock', itemId });
    }
    const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const coupon = b.couponId ? findCoupon(b.couponId) : null;
    const discount = coupon ? couponDiscount(coupon, lines, store, subtotal) : null;
    const taxable = subtotal - (discount?.amount || 0);
    const tax = Math.round((taxable * store.taxRate) / 100);
    const total = taxable + tax;
    for (const [itemId, qty] of want) { const item = store.items.find((i) => i.id === itemId); if (item.stock != null) item.stock -= qty; }
    const paid = !!b.paid;
    const now = new Date().toISOString();
    const order = {
      id: newId(), number: db.nextOrderNumber++, storeId: store.id,
      customer: clean(b.customer, 30) || 'Someone', customerEmoji: clean(b.customerEmoji, 16) || '🙂',
      customerPhoto: isPhotoPath(b.customerPhoto) ? b.customerPhoto : null,
      lines, subtotal, discount, tax, total, paid,
      ...(paid ? computeChange(total, b.tendered) : { tendered: null, change: null }),
      // Stores without a kitchen (e.g. the Tech Store) hand things over at the register.
      status: store.kitchen === false ? 'delivered' : 'new', createdAt: now, updatedAt: now,
    };
    db.orders.push(order);
    if (coupon) Object.assign(coupon, { usedAt: now, orderId: order.id });
    pruneOrders();
    persist(coupon || want.size ? 'state' : 'orders');
    return send(res, 201, order);
  }

  if (pathname === '/api/orders' && method === 'DELETE') {
    requirePin(req);
    const which = url.searchParams.get('status');
    if (which === 'delivered') db.orders = db.orders.filter((o) => o.status !== 'delivered');
    else if (which === 'all') db.orders = [];
    else throw new HttpError(400, 'status=delivered or status=all');
    if (!db.orders.length) db.nextOrderNumber = 1;
    persist('orders');
    return send(res, 200, { ok: true });
  }

  // Reset play data. Stores, menus, prices, banks and photos are always kept.
  if (pathname === '/api/reset' && method === 'POST') {
    requirePin(req);
    const b = await readJson(req);
    if (b.orders) { db.orders = []; db.nextOrderNumber = 1; db.queue = { next: 1, serving: 0 }; }
    if (b.people) { db.customers = defaultPeople(); b.accounts = true; } // accounts belong to people
    if (b.accounts) {
      db.accounts = []; db.transactions = [];
      for (const s of db.stores) s.payoutAccountId = null;
    } else if (b.bankMoney) {
      for (const a of db.accounts) a.balance = 0;
      db.transactions = [];
    }
    if (b.spy) Spy.resetPlay();
    if (b.scans) db.scanLog = [];
    if (b.library) Library.resetPlay();
    if (b.post) Post.resetPlay();
    if (b.boxOffice) BoxOffice.resetPlay();
    if (b.checks) db.checks = [];
    if (b.orders) for (const c of db.coupons) Object.assign(c, { usedAt: null, orderId: null });
    if (b.kidItems) {
      for (const s of db.stores) {
        s.items = s.items.filter((i) => i.addedBy !== 'kid');
        if (s.categories.length > 1) s.categories = s.categories.filter((c) => c.name.toLowerCase() !== 'my stuff' || s.items.some((i) => i.categoryId === c.id));
      }
    }
    persist('state');
    return send(res, 200, { ok: true });
  }

  if (parts[1] === 'orders' && parts[3] === 'refund' && parts.length === 4 && method === 'POST') {
    const order = db.orders.find((o) => o.id === parts[2]);
    if (!order) throw new HttpError(404, 'That order is gone');
    const refund = refundLines(order, (await readJson(req)).lines);
    persist('state');
    return send(res, 200, { order, refund });
  }

  if (pathname === '/api/report' && method === 'GET') {
    return send(res, 200, dayReport(url.searchParams.get('storeId') || null));
  }

  // Take a number (deli counter): one queue for the whole Store app. No PIN.
  if (pathname === '/api/queue' && method === 'POST') {
    const b = await readJson(req);
    const q = db.queue;
    let number = null;
    if (b.action === 'take') { number = q.next; q.next += 1; }
    else if (b.action === 'next') { if (q.serving < q.next - 1) q.serving += 1; }
    else if (b.action === 'reset') { q.next = 1; q.serving = 0; }
    else throw new HttpError(400, 'Unknown action');
    persist('queue');
    return send(res, 200, { ...q, number });
  }

  if (parts[1] === 'orders' && parts.length === 3) {
    const order = db.orders.find((o) => o.id === parts[2]);
    if (!order) throw new HttpError(404, 'Order not found');
    if (method === 'GET') return send(res, 200, order);
    if (method === 'DELETE') {
      // Cancelling an open order refunds a card payment; removing a delivered one is just tidying up.
      const refunded = order.status !== 'delivered' && order.paidWith?.method === 'card';
      if (refunded) refundCard(order);
      // A cancelled sale (not one that was handed over) puts the stock and the coupon back.
      const store = db.stores.find((s) => s.id === order.storeId);
      const cancelled = order.status !== 'delivered' || (store?.kitchen === false && !order.paid);
      if (cancelled) {
        restock(store, order.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })));
        const c = order.discount && db.coupons.find((x) => x.id === order.discount.couponId);
        if (c && c.orderId === order.id) Object.assign(c, { usedAt: null, orderId: null });
      }
      db.orders = db.orders.filter((o) => o !== order);
      persist(refunded || cancelled ? 'state' : 'orders');
      return send(res, 200, { ok: true, refunded });
    }
    if (method === 'PATCH') {
      const b = await readJson(req);
      let receipt = null;
      if (b.pay) {
        if (order.paid) throw new HttpError(400, 'This order is already paid');
        if (b.pay.cardId) receipt = await chargeCard(order, b.pay.cardId, b.pay.pin);
        else Object.assign(order, { paid: true, paidWith: { method: 'cash' }, ...computeChange(order.total, b.pay.tendered) });
      }
      if (b.status !== undefined) {
        if (!STATUSES.includes(b.status)) throw new HttpError(400, 'Unknown status');
        order.status = b.status;
      }
      if (b.toggleLine !== undefined) {
        const line = order.lines[Number(b.toggleLine)];
        if (!line) throw new HttpError(400, 'No such line');
        line.done = !line.done;
        if (line.done && order.status === 'new') order.status = 'making';
      }
      order.updatedAt = new Date().toISOString();
      persist(receipt ? 'state' : 'orders');
      return send(res, 200, receipt ? { ...order, receipt } : order);
    }
  }

  // ---- stores (grown-up setup)
  if (pathname === '/api/stores' && method === 'POST') {
    requirePin(req);
    const b = await readJson(req);
    const store = makeStore(b.template, newId);
    if (b.name) store.name = clean(b.name, 40);
    db.stores.push(store);
    persist('state');
    return send(res, 201, store);
  }

  if (parts[1] === 'stores' && parts[3] === 'reset' && parts.length === 4 && method === 'POST') {
    // Fresh menu from a template; keeps the store's id, name, tax, money setting and kid items.
    requirePin(req);
    const store = findStore(parts[2]);
    const b = await readJson(req);
    if (!hasTemplate(b.template)) throw new HttpError(400, 'Unknown template');
    const fresh = makeStore(b.template, newId);
    const next = { ...fresh, id: store.id, name: store.name, taxRate: store.taxRate, playMoney: store.playMoney, payoutAccountId: store.payoutAccountId || null };
    const kids = store.items.filter((i) => i.addedBy === 'kid');
    if (kids.length) {
      const cat = myStuffCategory(next);
      next.items.push(...kids.map((i) => ({ ...i, categoryId: cat })));
    }
    db.stores[db.stores.indexOf(store)] = next;
    persist('state');
    return send(res, 200, next);
  }

  if (parts[1] === 'stores' && parts.length === 3) {
    const store = findStore(parts[2]);
    if (method === 'PUT') {
      requirePin(req);
      const next = await normStore(await readJson(req), store);
      db.stores[db.stores.indexOf(store)] = next;
      persist('state');
      return send(res, 200, next);
    }
    if (method === 'DELETE') {
      requirePin(req);
      db.stores = db.stores.filter((s) => s !== store);
      persist('state');
      return send(res, 200, { ok: true });
    }
  }

  // ---- items: anyone can add their own; items added without the PIN stay editable without it
  if (parts[1] === 'stores' && parts[3] === 'items' && parts[5] === 'stock' && parts.length === 6 && method === 'POST') {
    const store = findStore(parts[2]);
    const item = store.items.find((i) => i.id === parts[4]);
    if (!item) throw new HttpError(404, 'Item not found');
    if (item.stock == null) throw new HttpError(400, `${item.name} isn't counted. A grown-up can turn on stock in Setup.`, { code: 'untracked' });
    item.stock = clamp(item.stock + clamp(Math.round(Number((await readJson(req)).add) || 1), 1, 99), 0, 999);
    persist('state');
    return send(res, 200, { stock: item.stock });
  }
  if (parts[1] === 'stores' && parts[3] === 'items' && (parts.length === 4 || parts.length === 5)) {
    const store = findStore(parts[2]);
    const catIds = new Set(store.categories.map((c) => c.id));
    if (parts.length === 4 && method === 'POST') {
      const b = await readJson(req);
      const fallback = catIds.has(b.categoryId) ? b.categoryId : myStuffCategory(store);
      catIds.add(fallback);
      const item = await normItem(b, null, catIds, fallback, pinOk(req) ? 'grownup' : 'kid');
      store.items.push(item);
      persist('state');
      return send(res, 201, item);
    }
    if (parts.length === 5) {
      const item = store.items.find((i) => i.id === parts[4]);
      if (!item) throw new HttpError(404, 'Item not found');
      if (item.addedBy !== 'kid') requirePin(req);
      if (method === 'PUT') {
        const next = await normItem(await readJson(req), item, catIds, item.categoryId, item.addedBy);
        store.items[store.items.indexOf(item)] = next;
        persist('state');
        return send(res, 200, next);
      }
      if (method === 'DELETE') {
        store.items = store.items.filter((i) => i !== item);
        persist('state');
        return send(res, 200, { ok: true });
      }
    }
  }

  // ---- customers
  // People are managed from the home screen without the PIN (it's pretend play).
  if (pathname === '/api/customers' && method === 'POST') {
    const b = await readJson(req);
    const name = clean(b.name, 30);
    if (!name) throw new HttpError(400, 'Name needed');
    let c = db.customers.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!c) {
      if (db.customers.length >= 100) throw new HttpError(400, 'That is a lot of people already');
      c = { id: newId(), name, emoji: clean(b.emoji, 16) || '🙂', photo: await resolvePhoto(b.photo, null) };
      db.customers.push(c);
      persist('state');
    }
    return send(res, 201, c);
  }

  if (parts[1] === 'customers' && parts.length === 3) {
    const c = db.customers.find((x) => x.id === parts[2]);
    if (!c) throw new HttpError(404, 'Person not found');
    if (method === 'PUT') {
      const b = await readJson(req);
      const name = clean(b.name, 30);
      if (!name) throw new HttpError(400, 'Name needed');
      Object.assign(c, { name, emoji: clean(b.emoji, 16) || '🙂', photo: await resolvePhoto(b.photo, c) });
      for (const a of db.accounts) if (a.customerId === c.id) a.owner = { name: c.name, emoji: c.emoji, photo: c.photo || null };
      persist('state');
      return send(res, 200, c);
    }
    if (method === 'DELETE') {
      db.customers = db.customers.filter((x) => x !== c);
      persist('state');
      return send(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/customers' && method === 'PUT') {
    requirePin(req);
    const b = await readJson(req);
    const old = new Map(db.customers.map((c) => [c.id, c]));
    db.customers = (Array.isArray(b) ? b : []).slice(0, 100)
      .map((c) => ({ id: isId(c.id) ? c.id : newId(), name: clean(c.name, 30), emoji: clean(c.emoji, 16) || '🙂', photo: old.get(c.id)?.photo || null }))
      .filter((c) => c.name);
    persist('state');
    return send(res, 200, db.customers);
  }

  // ---- bank (pretend play, no PIN; the bank tellers are kids)
  if (pathname === '/api/banks' && method === 'POST') {
    if (db.banks.length >= 20) throw new HttpError(400, 'That is a lot of banks already');
    const bank = normBank(await readJson(req));
    db.banks.push(bank);
    persist('state');
    return send(res, 201, bank);
  }

  if (parts[1] === 'banks' && parts.length === 3) {
    const bank = findBank(parts[2]);
    if (method === 'PUT') {
      Object.assign(bank, normBank(await readJson(req), bank));
      persist('state');
      return send(res, 200, bank);
    }
    if (method === 'DELETE') {
      if (db.accounts.some((a) => a.bankId === bank.id)) throw new HttpError(400, 'Close all its accounts first');
      db.banks = db.banks.filter((x) => x !== bank);
      persist('state');
      return send(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/accounts' && method === 'POST') {
    const b = await readJson(req);
    const bank = findBank(b.bankId);
    const person = db.customers.find((c) => c.id === b.customerId);
    if (!person) throw new HttpError(400, 'Pick who the account is for');
    if (db.accounts.some((a) => a.bankId === bank.id && a.customerId === person.id)) throw new HttpError(400, `${person.name} already has an account here`);
    if (db.accounts.length >= 200) throw new HttpError(400, 'That is a lot of accounts already');
    const account = {
      id: newId(), bankId: bank.id, customerId: person.id,
      owner: { name: person.name, emoji: person.emoji, photo: person.photo || null },
      balance: 0, cards: [], createdAt: new Date().toISOString(),
    };
    db.accounts.push(account);
    const gift = b.opening ? cents(b.opening) : 0;
    addTxn(account, gift, 'open', gift ? 'Welcome gift 🎁' : 'Account opened 🎉');
    persist('state');
    return send(res, 201, publicAccount(account));
  }

  if (parts[1] === 'accounts' && parts.length >= 3) {
    const account = findAccount(parts[2]);
    if (parts.length === 3 && method === 'DELETE') {
      const cashOut = account.balance;
      db.accounts = db.accounts.filter((a) => a !== account);
      db.transactions = db.transactions.filter((t) => t.accountId !== account.id);
      for (const s of db.stores) if (s.payoutAccountId === account.id) s.payoutAccountId = null;
      persist('state');
      return send(res, 200, { ok: true, cashOut });
    }
    if (parts.length === 4 && parts[3] === 'transactions' && method === 'GET') {
      const list = db.transactions.filter((t) => t.accountId === account.id).slice(-60).reverse();
      return send(res, 200, { transactions: list });
    }
    if (parts.length === 4 && (parts[3] === 'deposit' || parts[3] === 'withdraw') && method === 'POST') {
      const amount = cents((await readJson(req)).amount);
      if (!amount) throw new HttpError(400, 'Add some money first');
      if (parts[3] === 'withdraw') {
        if (amount > account.balance) throw new HttpError(400, `Not enough money. There is only $${(account.balance / 100).toFixed(2)}`, { code: 'funds', balance: account.balance });
        addTxn(account, -amount, 'withdraw', '🏧 Cash out');
      } else {
        addTxn(account, amount, 'deposit', '💵 Cash in');
      }
      persist('state');
      return send(res, 200, publicAccount(account));
    }
    if (parts.length === 4 && parts[3] === 'cards' && method === 'POST') {
      const b = await readJson(req);
      if (account.cards.length >= 5) throw new HttpError(400, 'Five cards is the most for one account');
      const card = {
        id: newId(), number: cardNumber(), pin: normPin(b.pin),
        design: CARD_DESIGNS.has(b.design) ? b.design : 'bank', frozen: false, createdAt: new Date().toISOString(),
      };
      account.cards.push(card);
      persist('state');
      return send(res, 201, publicAccount(account));
    }
  }

  if (parts[1] === 'cards' && parts.length === 3) {
    const { account, card } = findCard(parts[2]);
    if (method === 'PUT') {
      const b = await readJson(req);
      if (b.frozen !== undefined) card.frozen = !!b.frozen;
      if (b.pin !== undefined) card.pin = normPin(b.pin);
      if (b.design !== undefined && CARD_DESIGNS.has(b.design)) card.design = b.design;
      persist('state');
      return send(res, 200, publicAccount(account));
    }
    if (method === 'DELETE') {
      account.cards = account.cards.filter((c) => c !== card);
      persist('state');
      return send(res, 200, publicAccount(account));
    }
  }

  throw new HttpError(404, 'Not found');
}

// ---------------------------------------------------------------- static files
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
};

async function serveFile(res, file, cache) {
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': cache });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

async function statics(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  const p = decodeURIComponent(url.pathname);
  if (p.startsWith('/photos/')) {
    const name = p.slice(8);
    if (!/^[a-z0-9]+\.(jpg|png|webp)$/.test(name)) throw new HttpError(404, 'Not found');
    return serveFile(res, path.join(PHOTO_DIR, name), 'public, max-age=31536000, immutable');
  }
  const rel = p === '/' ? 'index.html' : p.slice(1);
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Not found');
  // The bundled barcode reader (~1 MB) only changes with an app update: keep it for a week.
  return serveFile(res, file, rel.startsWith('vendor/') ? 'public, max-age=604800' : 'no-cache');
}

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await statics(req, res, url);
  } catch (e) {
    if (res.headersSent) { res.end(); return; }
    if (e instanceof HttpError) send(res, e.status, { error: e.message, ...(e.extra || {}) });
    else { console.error(e); send(res, 500, { error: 'Something went wrong' }); }
  }
});

loadDb();
server.listen(PORT, () => console.log(`Kids Hub listening on :${PORT}, data in ${DATA_DIR}`));
checkPrinter();

async function shutdown() {
  server.close();
  for (const c of clients) c.end();
  await writeChain;
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
