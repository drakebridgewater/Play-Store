'use strict';
// 🔎 Barcode lookup: what a real book (ISBN) or product (UPC/EAN) is, from free public databases,
// so adding one fills in its name and picture. Books: Open Library, then Google Books. Products:
// Open Food Facts and Open Products Facts, then UPCitemdb's free trial (100 lookups a day).
// The picture comes back as a data URL, so it is saved like any photo the kids take.

const TIMEOUT = 6000;
const MAX_IMAGE = 2_000_000;
const CACHE_MAX = 300;
const MISS_TTL = 10 * 60_000; // try a not-found code again after 10 minutes (it may have been the network)
const UA = 'KidsHubPlayStore/1.0 (pretend-play cash register)';

// Book subjects → a fallback picture for the book.
const SUBJECT_EMOJI = [
  [/dinosaur/i, '🦖'], [/dragon/i, '🐉'], [/space|rocket|astronaut|planet/i, '🚀'], [/fair(y|ies)/i, '🧚'],
  [/unicorn/i, '🦄'], [/\bdogs?\b|pupp/i, '🐶'], [/\bcats?\b|kitten/i, '🐱'], [/castle|princess|knight/i, '🏰'],
  [/ocean|\bsea\b|fish|whale/i, '🌊'], [/super ?hero/i, '🦸'], [/myster|detective/i, '🔍'], [/bedtime|night|sleep|moon/i, '🌙'],
  [/\bbears?\b/i, '🐻'], [/train|railroad/i, '🚂'], [/\bart\b|drawing|paint/i, '🎨'],
];

module.exports = function lookup({ HttpError, send }) {
  const cache = new Map(); // code → { result (null = not found), at }

  async function getJson(url) {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }

  // Download a picture into a data URL (JPEG, PNG or WebP only, not too big, not a 1×1 "no cover").
  async function image(url) {
    if (!url) return null;
    try {
      const r = await fetch(String(url).replace(/^http:/, 'https:'), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' });
      if (!r.ok) return null;
      const type = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000 || buf.length > MAX_IMAGE) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch { return null; }
  }

  const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  // Long store titles ("Apple iPhone 6, Space Gray, 64 GB (T-Mobile)") cut down to fit a label.
  function shorten(s, max) {
    s = tidy(s);
    if (s.length <= max) return s;
    const cut = s.split(/\s*[,(|–—]\s*|\s+-\s+/)[0];
    if (cut.length >= 3 && cut.length <= max) return cut;
    return s.slice(0, max + 1).replace(/\s+\S*$/, '').trim() || s.slice(0, max);
  }
  const emojiFor = (subjects) => {
    const text = subjects.join(' | ');
    return SUBJECT_EMOJI.find(([re]) => re.test(text))?.[1] || null;
  };

  // ISBN-10 → ISBN-13 so both kinds find the same book.
  function isbn13(code) {
    if (code.length === 13) return code;
    const body = `978${code.slice(0, 9)}`;
    const sum = [...body].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
    return body + ((10 - (sum % 10)) % 10);
  }

  async function openLibrary(isbn) {
    const d = await getJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const b = d?.[`ISBN:${isbn}`];
    if (!b?.title) return null;
    const covers = [b.cover?.large, b.cover?.medium, `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`];
    return {
      title: b.title,
      author: (b.authors || []).map((a) => a.name).slice(0, 2).join(' & '),
      subjects: (b.subjects || []).map((s) => s.name || s),
      covers,
      source: 'Open Library',
    };
  }

  async function googleBooks(isbn) {
    const d = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const v = d?.items?.[0]?.volumeInfo;
    if (!v?.title) return null;
    const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
    return {
      title: v.title,
      author: (v.authors || []).slice(0, 2).join(' & '),
      subjects: v.categories || [],
      covers: [img && img.replace('zoom=1', 'zoom=2').replace('&edge=curl', ''), img],
      source: 'Google Books',
    };
  }

  async function findBook(code) {
    const isbn = isbn13(code);
    const hit = (await openLibrary(isbn).catch(() => null)) || (await googleBooks(isbn).catch(() => null));
    if (!hit) return null;
    let photo = null;
    for (const u of hit.covers.filter(Boolean)) if ((photo = await image(u))) break;
    // Open Library sometimes knows the book but not its cover; Google may have one.
    if (!photo && hit.source === 'Open Library') {
      const g = await googleBooks(isbn).catch(() => null);
      for (const u of (g?.covers || []).filter(Boolean)) if ((photo = await image(u))) break;
    }
    return { kind: 'book', code, isbn, title: shorten(hit.title, 80), author: shorten(hit.author, 60), emoji: emojiFor(hit.subjects), photo, source: hit.source };
  }

  async function facts(host, code) {
    const d = await getJson(`https://${host}/api/v2/product/${code}.json?fields=product_name,product_name_en,generic_name,brands,quantity,image_front_url,image_url`);
    const p = d?.status === 1 && d.product;
    const name = p && tidy(p.product_name_en || p.product_name || p.generic_name);
    if (!name) return null;
    return { name, brand: tidy(String(p.brands || '').split(',')[0]), size: tidy(p.quantity), images: [p.image_front_url, p.image_url], source: host.includes('food') ? 'Open Food Facts' : 'Open Products Facts' };
  }

  async function upcItemDb(code) {
    const d = await getJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
    const p = d?.items?.[0];
    if (!p?.title) return null;
    return { name: tidy(p.title), brand: tidy(p.brand), size: '', images: p.images || [], source: 'UPCitemdb' };
  }

  async function findProduct(code) {
    const [food, things] = await Promise.all([facts('world.openfoodfacts.org', code).catch(() => null), facts('world.openproductsfacts.org', code).catch(() => null)]);
    const hit = food || things || (await upcItemDb(code).catch(() => null));
    if (!hit) return null;
    let photo = null;
    for (const u of hit.images.filter(Boolean).slice(0, 4)) if ((photo = await image(u))) break;
    // Put the brand in front when the name doesn't say it ("Diet Coke" is fine; "Cheese crackers" → "Ritz Cheese crackers").
    const named = hit.brand && !hit.name.toLowerCase().includes(hit.brand.toLowerCase()) ? `${hit.brand} ${hit.name}` : hit.name;
    return { kind: 'product', code, title: shorten(named, 40), fullTitle: named, brand: hit.brand, size: hit.size, photo, source: hit.source };
  }

  async function find(raw) {
    const code = String(raw || '').replace(/[\s-]/g, '').toUpperCase();
    const isIsbn = /^97[89]\d{10}$/.test(code) || /^\d{9}[\dX]$/.test(code);
    const isProduct = /^\d{8}$|^\d{12,14}$/.test(code);
    if (!isIsbn && !isProduct) throw new HttpError(400, 'That is not a book or product barcode');
    const hit = cache.get(code);
    if (hit && (hit.result || Date.now() - hit.at < MISS_TTL)) return hit.result;
    const result = isIsbn ? await findBook(code) : await findProduct(code.length === 14 ? code.replace(/^0/, '') : code);
    cache.delete(code);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(code, { result, at: Date.now() });
    return result;
  }

  async function handle(req, res, url) {
    if (url.pathname !== '/api/lookup' || req.method !== 'GET') return false;
    const found = await find(url.searchParams.get('code'));
    send(res, 200, found ? { found: true, ...found } : { found: false });
    return true;
  }

  return { handle, find };
};
