// 🌀 Cipher Lab: write and crack secret messages. The cipher wheel turns by dragging it (or
// with the arrows), and messages print with a QR code that loads them back here.
import { ui, esc, render, sfx, toast } from '../../lib/core.js';
import { printModal } from '../../lib/print.js';
import { agent, spyBar } from './index.js';
import { ABC, CIPHERS, EMOJI_KEY, encode, decode, fromQr } from './ciphers.js';
import { secretSlip, keySlip } from './slips.js';

const STEP = 360 / 26;
const state = () => (ui.cl ||= { cipher: 'caesar', shift: 3, mode: 'encode', text: 'MEET ME AT THE TREEHOUSE' });
const output = () => { const c = state(); return c.mode === 'encode' ? encode(c.cipher, c.text, c.shift) : decode(c.cipher, c.text, c.shift); };
const mod = (n) => ((n % 26) + 26) % 26;

// Two rings of letters: the outer is the real letter, the inner (turned) is its secret letter.
function wheel(shift) {
  const ring = (r, cls, size) => [...ABC].map((L, i) => {
    const a = (i * STEP - 90) * (Math.PI / 180);
    return `<text class="${cls}" x="${(150 + r * Math.cos(a)).toFixed(1)}" y="${(150 + r * Math.sin(a)).toFixed(1)}" font-size="${size}" text-anchor="middle" dominant-baseline="central" transform="rotate(${i * STEP} ${(150 + r * Math.cos(a)).toFixed(1)} ${(150 + r * Math.sin(a)).toFixed(1)})">${L}</text>`;
  }).join('');
  return `<svg class="cipher-wheel" viewBox="0 0 300 300" aria-label="Cipher wheel, turned ${shift}">
    <circle cx="150" cy="150" r="146" class="w-outer"/>
    ${ring(128, 'w-l-out', 19)}
    <g class="w-inner" id="w-inner" style="transform: rotate(${-shift * STEP}deg); transform-origin: 150px 150px">
      <circle cx="150" cy="150" r="110" class="w-in"/>
      ${ring(94, 'w-l-in', 17)}
      <circle cx="150" cy="150" r="70" class="w-hub"/>
    </g>
    <path d="M150 8 l-9 -6 h18 z" class="w-mark"/>
    <text x="150" y="142" class="w-shift" text-anchor="middle" id="w-shift">${shift}</text>
    <text x="150" y="166" class="w-sub" text-anchor="middle">TURNS</text>
  </svg>`;
}

export function viewCipher() {
  const c = state();
  const info = CIPHERS[c.cipher];
  return spyBar('🌀 Cipher Lab') + `<div class="spy-body cipher-lab">
    <nav class="tabs dark">${Object.entries(CIPHERS).map(([k, x]) => `<button class="${c.cipher === k ? 'on' : ''}" data-act="cl-cipher" data-k="${k}">${x.emoji} ${x.name}</button>`).join('')}</nav>
    <p class="cl-tip">${esc(info.tip)}</p>
    <div class="cl-grid">
      ${c.cipher === 'caesar' ? `<div class="cl-wheel">${wheel(c.shift)}
        <div class="row" style="justify-content:center"><button class="btn" data-act="cl-turn" data-d="-1" aria-label="Turn left">◀</button>
          <span class="cl-map" id="cl-map">A → ${ABC[mod(c.shift)]}</span><button class="btn" data-act="cl-turn" data-d="1" aria-label="Turn right">▶</button></div>
        <p class="muted small center">Drag the inner wheel to turn it.</p></div>`
      : `<div class="cl-key">${[...ABC].map((L) => `<span><b>${L}</b>${esc(c.cipher === 'emoji' ? EMOJI_KEY[ABC.indexOf(L)] : encode(c.cipher, L, c.shift))}</span>`).join('')}</div>`}
      <div class="cl-work">
        <div class="pay-tabs"><button class="${c.mode === 'encode' ? 'on' : ''}" data-act="cl-mode" data-m="encode">🔒 Make a secret</button><button class="${c.mode === 'decode' ? 'on' : ''}" data-act="cl-mode" data-m="decode">🔓 Crack a secret</button></div>
        <label class="field">${c.mode === 'encode' ? 'Your message' : 'The secret message'}
          <textarea data-cl="text" rows="3" maxlength="300" autocomplete="off" autocapitalize="characters">${esc(c.text)}</textarea></label>
        ${c.cipher === 'emoji' && c.mode === 'decode' ? `<div class="cl-emoji-pad">${EMOJI_KEY.map((e) => `<button data-act="cl-emoji" data-e="${e}">${e}</button>`).join('')}<button data-act="cl-emoji" data-e=" ">␣</button><button data-act="cl-del">⌫</button></div>` : ''}
        <div class="cl-out-label">${c.mode === 'encode' ? '🔒 Secret code' : '🔓 It says'}</div>
        <div class="cl-out" id="cl-out">${esc(output()) || '&nbsp;'}</div>
        <div class="row">
          <button class="btn" data-act="cl-swap">↕️ Swap</button>
          <button class="btn" data-act="cl-clear">🧽 Clear</button>
          <span class="grow"></span>
          <button class="btn" data-act="cl-key">🗝️ Print key card</button>
          <button class="btn primary" data-act="cl-print">🖨️ Print secret</button>
        </div>
      </div>
    </div>
  </div></div>`;
}

function refreshOut() {
  const out = document.getElementById('cl-out');
  if (out) out.textContent = output() || ' ';
}
function setShift(n) {
  const c = state();
  c.shift = mod(n);
  const g = document.getElementById('w-inner');
  if (g) g.style.transform = `rotate(${-c.shift * STEP}deg)`;
  const s = document.getElementById('w-shift'); if (s) s.textContent = c.shift;
  const mp = document.getElementById('cl-map'); if (mp) mp.textContent = `A → ${ABC[c.shift]}`;
  refreshOut();
}

export function cipherInput(e) {
  if (e.target.dataset.cl !== 'text') return;
  state().text = e.target.value;
  refreshOut();
}

// Dragging the wheel: follow the finger's angle around the middle.
export function cipherAfterRender() {
  const svg = document.querySelector('.cipher-wheel');
  if (!svg) return;
  let start = null;
  const angle = (e) => { const r = svg.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * (180 / Math.PI); };
  svg.addEventListener('pointerdown', (e) => { start = { a: angle(e), shift: state().shift }; svg.setPointerCapture(e.pointerId); e.preventDefault(); });
  svg.addEventListener('pointermove', (e) => {
    if (!start) return;
    let d = angle(e) - start.a;
    if (d > 180) d -= 360; if (d < -180) d += 360;
    const next = mod(start.shift - Math.round(d / STEP));
    if (next !== state().shift) { setShift(next); sfx.pop(); }
  });
  const end = () => { start = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}

// A secret message scanned from paper (SPY:<cipher>:<text>) opens here, ready to crack.
export function loadSecret({ cipher, text }) {
  if (!CIPHERS[cipher]) { toast('That secret uses a code HQ does not know'); return; }
  ui.cl = { ...state(), cipher, mode: 'decode', text: fromQr(cipher, text) };
  if (location.hash !== '#/spy/cipher') location.hash = '#/spy/cipher'; else render();
  sfx.pop(); toast('✉️ Secret message loaded. Crack it, agent!');
}
// From a mission clue: open the lab with the coded clue in it.
export function openInLab(cipher, text) {
  ui.cl = { ...state(), cipher, mode: 'decode', text };
  location.hash = '#/spy/cipher';
}

export const cipherActions = {
  'cl-cipher'(el) { state().cipher = el.dataset.k; render(); },
  'cl-mode'(el) { state().mode = el.dataset.m; render(); },
  'cl-turn'(el) { setShift(state().shift + Number(el.dataset.d)); sfx.pop(); },
  'cl-swap'() { const c = state(); c.text = output(); c.mode = c.mode === 'encode' ? 'decode' : 'encode'; render(); },
  'cl-clear'() { state().text = ''; render(); document.querySelector('[data-cl=text]')?.focus(); },
  'cl-emoji'(el) { state().text += el.dataset.e; sfx.pop(); render(); },
  'cl-del'() { const c = state(); const seg = [...new Intl.Segmenter().segment(c.text)].map((x) => x.segment); seg.pop(); c.text = seg.join(''); render(); },
  'cl-key'() { const c = state(); printModal(keySlip(c.cipher, c.shift), { title: '🗝️ Decoder key card' }); },
  'cl-print'() {
    const c = state();
    const secret = c.mode === 'encode' ? output() : c.text;
    if (!secret.trim()) { toast('Write a message first ✏️'); return; }
    printModal(secretSlip(c.cipher, secret.trim(), agent()?.codename), { title: '✉️ Secret message' });
  },
};
