// Play money: bills and coins, the tap-the-money tray, and the 4-number PIN pad.
import { drawModal, sfx } from './core.js';

export const DENOMS = [
  { v: 10000, label: '$100', kind: 'bill' }, { v: 5000, label: '$50', kind: 'bill' },
  { v: 2000, label: '$20', kind: 'bill' }, { v: 1000, label: '$10', kind: 'bill' },
  { v: 500, label: '$5', kind: 'bill' }, { v: 200, label: '$2', kind: 'bill' }, { v: 100, label: '$1', kind: 'bill' },
  { v: 25, label: '25¢', kind: 'coin' }, { v: 10, label: '10¢', kind: 'coin' },
  { v: 5, label: '5¢', kind: 'coin' }, { v: 1, label: '1¢', kind: 'coin' },
];

export function breakdown(c) {
  const out = [];
  for (const d of DENOMS) { const n = Math.floor(c / d.v); if (n) { out.push({ d, n }); c -= n * d.v; } }
  return out;
}
export const moneyChip = (d, extra = '') => `<span class="money ${d.kind} c${d.v} mini ${extra}">${d.label}</span>`;

// Tap-the-money tray: bills, then coins, then what has been handed over so far (tap one to take it back).
export function cashTray(given) {
  const btn = (d) => `<button class="money ${d.kind} c${d.v}" data-act="money" data-v="${d.v}">${d.label}</button>`;
  return `<div class="money-tray bills">${DENOMS.filter((d) => d.kind === 'bill').map(btn).join('')}</div>
    <div class="money-tray coins">${DENOMS.filter((d) => d.kind === 'coin').map(btn).join('')}</div>
    <div class="given">${given.length ? given.map((v, i) => `<button data-act="undo" data-i="${i}" aria-label="Take back">${moneyChip(DENOMS.find((d) => d.v === v))}</button>`).join('') : '<span class="muted">No money yet</span>'}</div>`;
}
// Handles the tray's taps for any modal with a `given` list. Returns true when it did.
export function trayAct(m, a, el) {
  if (a === 'money') { m.given.push(Number(el.dataset.v)); sfx.pop(); drawModal(); return true; }
  if (a === 'undo') { m.given.splice(Number(el.dataset.i), 1); drawModal(); return true; }
  return false;
}
// 4-digit PIN pad used inside modals (card PINs).
export function pinPad(entry) {
  return `<div class="pinpad inline"><div class="dots">${'●'.repeat(entry.length)}${'○'.repeat(Math.max(0, 4 - entry.length))}</div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-act="pk" data-k="${n}">${n}</button>`).join('')}
      <button data-act="pk-clear" aria-label="Clear">✕</button><button data-act="pk" data-k="0">0</button><button data-act="pk-back" aria-label="Delete">⌫</button></div></div>`;
}
export function pinAct(m, a, el) {
  if (a === 'pk') { if (m.pin.length < 4) m.pin += el.dataset.k; sfx.pop(); drawModal(); return true; }
  if (a === 'pk-back') { m.pin = m.pin.slice(0, -1); drawModal(); return true; }
  if (a === 'pk-clear') { m.pin = ''; drawModal(); return true; }
  return false;
}
