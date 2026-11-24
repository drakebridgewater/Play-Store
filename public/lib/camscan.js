// 📷 Camera scanner: for when the Bluetooth scanner won't connect. A small camera window in the
// corner reads QR codes, printed Kids Hub labels and real barcodes, and each one goes through
// exactly the same path as a Bluetooth scan, so every app reacts the same way.
// Uses the browser's built-in BarcodeDetector where there is one (Chrome on Android). Everywhere
// else (iPad: Safari and Chrome there are both Safari inside) it loads a copy of the same reader
// from public/vendor/ (ZXing as WebAssembly, ~1 MB, fetched once). Browsers only allow the
// camera on https:// (or localhost).
import { esc, lsGet, lsSet, toast } from './core.js';
import { scanned } from './scan.js';

const FORMATS = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39'];
const EVERY = 120;     // ms between looks
const GONE = 1200;     // ms a code has to be out of view before it can be scanned again
const COOLDOWN = 700;  // ms after any scan before the next one

const cameraPossible = () => !!navigator.mediaDevices?.getUserMedia;
export const camSupported = () => cameraPossible() && typeof WebAssembly === 'object';

// The built-in reader if it reads what we need (QR + product barcodes), else the bundled one.
let reader = null;
function getReader() {
  return (reader ||= (async () => {
    try {
      if ('BarcodeDetector' in window) {
        const ok = await BarcodeDetector.getSupportedFormats();
        if (ok.includes('qr_code') && ok.includes('ean_13')) return new BarcodeDetector({ formats: FORMATS.filter((f) => ok.includes(f)) });
      }
    } catch { /* fall through to the bundled reader */ }
    const zx = await import('/vendor/barcode-detector.js');
    await zx.prepareZXingModule({ overrides: { locateFile: (file, prefix) => (file.endsWith('.wasm') ? `/vendor/${file}` : prefix + file) }, fireImmediately: true });
    return new zx.BarcodeDetector({ formats: FORMATS });
  })().catch((e) => { reader = null; throw e; }));
}

let detector = null;
let stream = null;
let timer = null;
let last = { code: null, seen: 0, at: 0 };
let facing = lsGet('camFacing') === 'user' ? 'user' : 'environment';
let torch = false;

// The 📷 button floats over everything (modals too), like a scanner sitting next to the tablet.
const $btn = document.createElement('button');
$btn.id = 'cam-fab';
$btn.className = 'btn icon';
$btn.type = 'button';
$btn.setAttribute('aria-label', 'Scan with the camera');
$btn.textContent = '📷';
$btn.hidden = !cameraPossible() || lsGet('camButton') === 'off';
document.body.appendChild($btn);

const $win = document.createElement('div');
$win.id = 'cam-win';
$win.hidden = true;
document.body.appendChild($win);

export function setCamButton(on) { lsSet('camButton', on ? 'on' : 'off'); $btn.hidden = !on || !cameraPossible() || !$win.hidden; }
export const camButtonOn = () => lsGet('camButton') !== 'off';

function draw(msg = '') {
  $win.innerHTML = `<div class="cam-view"><video playsinline muted></video><i class="cam-aim"></i><span class="cam-msg">${esc(msg || 'Hold the code in the box · drag to move')}</span></div>
    <div class="cam-bar">
      <button class="btn" data-cam="flip" aria-label="Switch camera">🔄</button>
      <button class="btn" data-cam="torch" aria-label="Flashlight" hidden>🔦</button>
      <button class="btn primary" data-cam="close">✕ Done</button>
    </div>`;
}

async function start() {
  stop();
  const video = $win.querySelector('video');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    setMsg(e.name === 'NotAllowedError' ? '🚫 The camera is blocked. A grown-up can allow it in the browser settings.' : '😕 No camera found');
    return;
  }
  video.srcObject = stream;
  await video.play().catch(() => {});
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.() || {};
  const tb = $win.querySelector('[data-cam=torch]');
  if (tb) tb.hidden = !caps.torch;
  if (caps.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
  $win.querySelector('.cam-view').classList.toggle('mirror', facing === 'user');
  loop(video);
}

function stop() {
  clearTimeout(timer); timer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null; torch = false;
}

function setMsg(s) { const m = $win.querySelector('.cam-msg'); if (m) m.textContent = s; }

function loop(video) {
  timer = setTimeout(async () => {
    if (!stream) return;
    if (detector && video.readyState >= 2) {
      let found = [];
      try { found = await detector.detect(video); } catch { /* frame not ready */ }
      const now = Date.now();
      // A UPC-A read as EAN-13 has a 0 in front: send the 12 digits, like a Bluetooth scanner does.
      const code = found.map((f) => (f.format === 'ean_13' && /^0\d{12}$/.test(f.rawValue) ? f.rawValue.slice(1) : f.rawValue)).find((v) => v && v.length >= 3);
      if (code) {
        const fresh = code !== last.code || now - last.seen > GONE;
        last.seen = now;
        if (fresh && now - last.at > COOLDOWN) {
          last = { code, seen: now, at: now };
          const v = $win.querySelector('.cam-view');
          v?.classList.remove('hit'); void v?.offsetWidth; v?.classList.add('hit');
          setMsg(`✅ ${code.length > 24 ? `${code.slice(0, 24)}…` : code}`);
          navigator.vibrate?.(60);
          scanned(code);
        }
      }
    }
    if (stream) loop(video);
  }, EVERY);
}

export async function openCamScanner() {
  if (!camSupported()) {
    toast(cameraPossible() ? 'This browser is too old to read barcodes with the camera.' : 'The camera needs the secure (https://) address of the Kids Hub.');
    return;
  }
  last = { code: null, seen: 0, at: 0 };
  draw(detector ? '' : '⏳ Getting the barcode reader ready…');
  $win.hidden = false; $btn.hidden = true;
  restorePlace();
  start();
  if (!detector) {
    try { detector = await getReader(); if (!$win.hidden) setMsg('Hold the code in the box · drag to move'); }
    catch { if (!$win.hidden) setMsg('😕 The barcode reader didn’t load. Check the internet and try again.'); }
  }
}

export function closeCamScanner() {
  stop();
  $win.hidden = true; $win.innerHTML = '';
  $btn.hidden = !camButtonOn() || !cameraPossible();
}

$btn.addEventListener('click', openCamScanner);
$win.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cam]');
  if (!b) return;
  if (b.dataset.cam === 'close') closeCamScanner();
  if (b.dataset.cam === 'flip') { facing = facing === 'user' ? 'environment' : 'user'; lsSet('camFacing', facing); start(); }
  if (b.dataset.cam === 'torch' && stream) {
    torch = !torch;
    stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch }] }).catch(() => { torch = false; });
    b.classList.toggle('primary', torch);
  }
});
// Drag the camera window by its picture, so it never sits on top of what you need. It stays put.
function place(x, y) {
  const r = $win.getBoundingClientRect();
  x = Math.max(4, Math.min(innerWidth - r.width - 4, x));
  y = Math.max(4, Math.min(innerHeight - r.height - 4, y));
  Object.assign($win.style, { left: `${x}px`, top: `${y}px`, bottom: 'auto' });
  return [x, y];
}
let drag = null;
$win.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.cam-view')) return;
  const r = $win.getBoundingClientRect();
  drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
  $win.setPointerCapture(e.pointerId);
});
$win.addEventListener('pointermove', (e) => { if (drag?.id === e.pointerId) drag.at = place(e.clientX - drag.dx, e.clientY - drag.dy); });
$win.addEventListener('pointerup', () => { if (drag?.at) lsSet('camAt', JSON.stringify(drag.at)); drag = null; });
function restorePlace() {
  try { const [x, y] = JSON.parse(lsGet('camAt') || 'null') || []; if (Number.isFinite(x)) place(x, y); } catch { /* corner it is */ }
}

// Let go of the camera when the tablet sleeps or the app is put away; pick it up again after.
document.addEventListener('visibilitychange', () => {
  if ($win.hidden) return;
  if (document.hidden) stop(); else start();
});
