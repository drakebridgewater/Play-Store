// 🔎 Look up a real book (ISBN) or product barcode on the internet, through the server.
// Returns { found, kind, title, author?, brand?, emoji?, photo? (a small square data URL) } or null
// when there is no internet or the code is not a book or product barcode.
import { shrinkPhoto } from './photo.js';

const seen = new Map();

export const isIsbn = (code) => /^97[89]\d{10}$|^\d{9}[\dX]$/i.test(String(code || '').replace(/[\s-]/g, ''));
export const isProductCode = (code) => /^\d{8}$|^\d{12,14}$/.test(String(code || '').trim());

export async function lookupCode(code) {
  code = String(code || '').replace(/[\s-]/g, '');
  if (seen.has(code)) return seen.get(code);
  let r;
  try {
    const res = await fetch(`/api/lookup?code=${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    r = await res.json();
  } catch { return null; }
  // Fit the whole cover or box into the square (no cropping off the title), on white.
  if (r.photo) {
    try { r.photo = await shrinkPhoto(await (await fetch(r.photo)).blob(), { fit: 'contain' }); } catch { r.photo = null; }
  }
  seen.set(code, r);
  return r;
}
