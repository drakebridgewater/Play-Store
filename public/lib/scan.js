// Bluetooth barcode / QR scanner. The scanner acts like a keyboard: it types the whole code in a
// few milliseconds and presses Enter. People can't type that fast, so a burst of quick keys
// ending in Enter (or Tab) is a scan. Scans never land in text boxes, except ones marked
// data-scan="accept", which keep the text and get a "scan" event.
import { api, esc, sfx, toast } from './core.js';

// Grouping keys into a burst is generous; whether a burst is a scan is decided by its average speed.
const GAP = 100;     // ms: keys further apart than this start a new burst…
const HICCUP = 250;  // ms: …unless the burst is already clearly a scan (Bluetooth sends keys in packets)
const AVG = 35;      // ms: a scan averages faster than this between keys
const MIN = 3;       // characters: shortest code we treat as a scan
const IDLE = 120;    // ms: scanners set up without Enter end after this pause (long codes only)

let buf = '';
let held = '';       // characters kept out of the text box because they looked like a scan
let times = [];
let target = null;   // the text box that had focus when the burst started
let idleTimer;
let handler = null;  // (info) => true when the open app dealt with the scan itself

export function setScanHandler(fn) { handler = fn; }

const isText = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|tel|email|number|password|)$/i.test(el.type)));
const fast = () => times.length > 1 && (times.at(-1) - times[0]) / (times.length - 1) <= AVG;
const maxGap = () => (buf.length >= 2 && fast() ? HICCUP : GAP);

function reset() { buf = ''; held = ''; times = []; target = null; clearTimeout(idleTimer); }

// Not a scan after all (a fast typist): put back the characters we held out of the text box.
function giveBack() {
  const el = target;
  const text = held;
  reset();
  if (!text || !isText(el)) return;
  try {
    const at = el.selectionEnd ?? el.value.length;
    el.setRangeText(text, at, at, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } catch { /* number inputs: nothing to put back into */ }
}

// Take the scanned characters back out of the text box they were typed into.
function unleak(el, code) {
  if (!isText(el) || el.dataset.scan === 'accept') return;
  try {
    const end = el.selectionEnd ?? el.value.length;
    for (let n = code.length; n > 0; n--) { // whatever part of the code reached the box
      if (el.value.slice(end - n, end) === code.slice(0, n) || el.value.slice(end - n, end) === code.slice(-n)) {
        el.value = el.value.slice(0, end - n) + el.value.slice(end);
        el.setSelectionRange(end - n, end - n);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }
  } catch { /* number inputs have no selection; leave them */ }
}

function finish() {
  const code = buf;
  const el = target;
  reset();
  if (el?.dataset.scan === 'accept') { el.dispatchEvent(new CustomEvent('scan', { bubbles: true, detail: { code } })); return; }
  unleak(el, code);
  scanned(code);
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const now = performance.now();
  if (e.key === 'Enter' || e.key === 'Tab') {
    if (buf.length >= MIN && fast() && now - times.at(-1) <= maxGap()) {
      e.preventDefault(); e.stopImmediatePropagation(); // don't submit forms or close keyboards
      finish();
    } else giveBack();
    return;
  }
  if (e.key.length !== 1) return; // Shift and friends don't count (and don't break the burst)
  if (times.length && now - times.at(-1) > maxGap()) giveBack();
  if (!buf) target = document.activeElement;
  buf += e.key; times.push(now);
  // Three keys faster than any typist: keep the rest out of the text box as they arrive.
  if (buf.length >= 3 && fast() && target?.dataset.scan !== 'accept') { e.preventDefault(); held += e.key; }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (buf.length >= 8 && fast()) finish(); else giveBack(); }, Math.max(IDLE, maxGap() + 20));
}, true);

// ------------------------------------------------------------------ what happens after a scan
export const scanState = { last: null, at: 0 };

export async function scanned(code) {
  sfx.scan();
  scanState.last = code; scanState.at = Date.now();
  document.getElementById('scan-chip')?.replaceWith(chipEl());
  let info;
  try { info = await api('GET', `/api/codes?c=${encodeURIComponent(code)}`); }
  catch (e) { toast(e.message); return; }
  if (handler && (await handler(info))) return;
  showScanCard(info);
}

function chipEl() {
  const span = document.createElement('span');
  span.innerHTML = scanChip(true);
  return span.firstElementChild;
}
// The scanner chip on the home screen: lights up for a moment after each scan.
export function scanChip(flash = false) {
  const recent = scanState.last && Date.now() - scanState.at < 60_000;
  return `<span class="chip scan-chip ${flash ? 'flash' : ''}" id="scan-chip">🔫 ${recent ? `Heard: <code>${esc(scanState.last.length > 18 ? `${scanState.last.slice(0, 18)}…` : scanState.last)}</code>` : 'Scan something!'}</span>`;
}

// ------------------------------------------------------------------ the "What is this?" card
// Its own layer above everything, so a scan never wipes out a half-finished form or payment.
const $card = document.createElement('div');
$card.id = 'scancard';
$card.hidden = true;
document.body.appendChild($card);
let cardTimer;

export function closeScanCard() { $card.hidden = true; $card.innerHTML = ''; clearTimeout(cardTimer); }
window.addEventListener('hashchange', closeScanCard);
$card.addEventListener('click', (e) => {
  if (e.target === $card) { closeScanCard(); return; }
  const b = e.target.closest('[data-sc]');
  if (!b) return;
  if (b.dataset.sc === 'go') location.hash = b.dataset.href; // hashchange closes the card
  else closeScanCard();
});

const pic = (info) => (info.photo ? `<img src="${esc(info.photo)}" alt="" data-emoji="${esc(info.emoji || '❓')}">`
  : info.icon && globalThis.Art?.ICONS[info.icon] ? globalThis.Art.icon(info.icon) : esc(info.emoji || '❓'));

export function showScanCard(info) {
  if (info.kind === 'gone' || info.kind === 'empty') sfx.huh?.();
  const unknown = info.kind === 'product' || info.kind === 'text';
  const go = info.href && !location.hash.startsWith(info.href);
  $card.innerHTML = `<div class="sheet scan-sheet" role="dialog" aria-label="What is this?">
    <div class="scan-top">${info.kind === 'price' ? '🔍 Price check' : unknown ? '✨ New code!' : '🔍 What is this?'}</div>
    <div class="scan-pic">${pic(info)}</div>
    <h2>${esc(info.label)}</h2>
    ${info.price ? `<div class="scan-price">${esc(info.price)}</div>` : ''}
    ${info.detail ? `<p class="scan-detail">${esc(info.detail)}</p>` : ''}
    <p class="scan-code"><code>${esc(info.code)}</code></p>
    ${unknown ? '<p class="muted small center">Nothing in the Kids Hub uses this code yet.</p>' : ''}
    <div class="row ${go ? 'split' : 'center-row'}">
      <button class="btn" data-sc="ok">👍 OK</button>
      ${go ? `<button class="btn primary" data-sc="go" data-href="${esc(info.href)}">Go to ${esc(info.go || 'it')} →</button>` : ''}
    </div>
  </div>`;
  $card.hidden = false;
  clearTimeout(cardTimer);
  cardTimer = setTimeout(closeScanCard, 20_000);
}

// For trying it without a scanner: kidsHubScan('KH-TEST-QR') in the browser console.
globalThis.kidsHubScan = scanned;
