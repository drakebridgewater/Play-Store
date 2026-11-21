'use strict';
// Play Store POS: a pretend-play register. No npm dependencies; data lives in one db.json.

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeStore, templateList } = require('./templates');

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

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
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
    customers: [{ id: newId(), name: 'Mom', emoji: '👩' }, { id: newId(), name: 'Dad', emoji: '👨' }],
    ...(loaded || {}),
  };
  if (!loaded) persist('init');
}

function persist(what) {
  rev++;
  const snapshot = JSON.stringify(db, null, 1);
  writeChain = writeChain
    .then(async () => {
      const tmp = `${DB_FILE}.tmp`;
      await fsp.writeFile(tmp, snapshot);
      await fsp.rename(tmp, DB_FILE);
    })
    .catch((e) => console.error('saving db.json failed:', e));
  broadcast(what);
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

async function normItem(b, prev, catIds, fallbackCat, addedBy) {
  const name = clean(b.name, 40);
  if (!name) throw new HttpError(400, 'Every item needs a name');
  return {
    id: prev?.id || newId(),
    categoryId: catIds.has(b.categoryId) ? b.categoryId : fallbackCat,
    name,
    emoji: clean(b.emoji, 16) || '🏷️',
    photo: await resolvePhoto(b.photo, prev),
    price: cents(b.price),
    addedBy: prev?.addedBy || addedBy,
  };
}

async function normStore(b, old) {
  const s = {
    id: old?.id || newId(),
    name: clean(b.name, 40) || 'My Store',
    emoji: clean(b.emoji, 16) || '🏪',
    color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#16a34a',
    taxRate: clamp(Math.round((Number(b.taxRate) || 0) * 100) / 100, 0, 50),
    playMoney: b.playMoney !== false,
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

function pruneOrders() {
  if (db.orders.length <= MAX_ORDERS) return;
  const extra = db.orders.length - MAX_ORDERS;
  let dropped = 0;
  db.orders = db.orders.filter((o) => !(o.status === 'delivered' && dropped < extra && ++dropped));
}

// ---------------------------------------------------------------- API
async function api(req, res, url) {
  const { pathname } = url;
  const method = req.method;
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]

  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ rev })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (pathname === '/api/state' && method === 'GET') {
    return send(res, 200, { rev, stores: db.stores, customers: db.customers, templates: templateList() });
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
      lines.push({ itemId: item.id, name: item.name, emoji: item.emoji, photo: item.photo, price: item.price, qty, done: false });
    }
    if (!lines.length) throw new HttpError(400, 'The order is empty');
    const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const tax = Math.round((subtotal * store.taxRate) / 100);
    const total = subtotal + tax;
    const paid = !!b.paid;
    const now = new Date().toISOString();
    const order = {
      id: newId(), number: db.nextOrderNumber++, storeId: store.id,
      customer: clean(b.customer, 30) || 'Someone', customerEmoji: clean(b.customerEmoji, 16) || '🙂',
      lines, subtotal, tax, total, paid,
      ...(paid ? computeChange(total, b.tendered) : { tendered: null, change: null }),
      status: 'new', createdAt: now, updatedAt: now,
    };
    db.orders.push(order);
    pruneOrders();
    persist('orders');
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

  if (parts[1] === 'orders' && parts.length === 3) {
    const order = db.orders.find((o) => o.id === parts[2]);
    if (!order) throw new HttpError(404, 'Order not found');
    if (method === 'DELETE') {
      db.orders = db.orders.filter((o) => o !== order);
      persist('orders');
      return send(res, 200, { ok: true });
    }
    if (method === 'PATCH') {
      const b = await readJson(req);
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
      if (b.pay) {
        Object.assign(order, { paid: true, ...computeChange(order.total, b.pay.tendered) });
      }
      order.updatedAt = new Date().toISOString();
      persist('orders');
      return send(res, 200, order);
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
  if (pathname === '/api/customers' && method === 'POST') {
    const b = await readJson(req);
    const name = clean(b.name, 30);
    if (!name) throw new HttpError(400, 'Name needed');
    let c = db.customers.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!c) {
      c = { id: newId(), name, emoji: clean(b.emoji, 16) || '🙂' };
      db.customers.push(c);
      persist('state');
    }
    return send(res, 201, c);
  }

  if (pathname === '/api/customers' && method === 'PUT') {
    requirePin(req);
    const b = await readJson(req);
    db.customers = (Array.isArray(b) ? b : []).slice(0, 50)
      .map((c) => ({ id: isId(c.id) ? c.id : newId(), name: clean(c.name, 30), emoji: clean(c.emoji, 16) || '🙂' }))
      .filter((c) => c.name);
    persist('state');
    return send(res, 200, db.customers);
  }

  throw new HttpError(404, 'Not found');
}

// ---------------------------------------------------------------- static files
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
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
  return serveFile(res, file, 'no-cache');
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
    if (e instanceof HttpError) send(res, e.status, { error: e.message });
    else { console.error(e); send(res, 500, { error: 'Something went wrong' }); }
  }
});

loadDb();
server.listen(PORT, () => console.log(`Play Store listening on :${PORT}, data in ${DATA_DIR}`));

async function shutdown() {
  server.close();
  for (const c of clients) c.end();
  await writeChain;
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
