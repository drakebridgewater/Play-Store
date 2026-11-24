// 🧮 Adding Machine: a big-key calculator with a paper tape, like an old shop adding machine.
// Scanning a price tag or a linked package adds its price. Money mode shows the answer as
// bills and coins. The tape prints on the receipt printer.
import { ui, esc, bar, setAccent, render, sfx, toast, lsGet, lsSet } from '../../lib/core.js';
import { breakdown, moneyChip } from '../../lib/cash.js';
import { printModal } from '../../lib/print.js';

const OPS = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b };
const st = () => {
  if (!ui.calc) {
    let saved = null;
    try { saved = JSON.parse(lsGet('calcTape') || 'null'); } catch { /* fresh */ }
    ui.calc = { entry: '', acc: null, op: null, tape: [], money: true, fresh: false, ...(saved || {}) };
  }
  return ui.calc;
};
const save = () => { const c = st(); lsSet('calcTape', JSON.stringify({ acc: c.acc, op: c.op, tape: c.tape.slice(-80), money: c.money })); };
const round = (n) => Math.round(n * 1e6) / 1e6;
const fmt = (n, money = st().money) => (n == null || !Number.isFinite(n) ? '' : money ? n.toFixed(2) : String(round(n)));

function shown() {
  const c = st();
  if (c.entry !== '') return c.entry;
  return c.acc == null ? '0' : fmt(c.acc);
}

// An operator key: fold the number typed so far into the running total.
function press(op, label = '') {
  const c = st();
  if (c.entry !== '' && c.entry !== '.') {
    const v = Number(c.entry);
    if (c.acc == null || c.fresh) { c.acc = v; c.fresh = false; }
    else {
      if (c.op === '÷' && v === 0) { sfx.buzz(); toast("Oops! You can't share by zero 🙃"); c.entry = ''; return; }
      c.acc = round(OPS[c.op || '+'](c.acc, v));
    }
    c.tape.push({ n: v, op: c.op || ' ', label });
    c.entry = '';
  }
  if (op === '=') {
    if (c.acc != null) c.tape.push({ n: c.acc, op: '=', total: true });
    c.op = null; c.fresh = true;
  } else { c.op = op; c.fresh = false; }
  sfx.pop(); save(); render();
}

export function viewCalc() {
  setAccent('#ca8a04');
  const c = st();
  const val = Number(shown());
  const cents = Math.round(val * 100);
  const coins = c.money && cents > 0 && cents <= 10_000_000 ? breakdown(cents) : [];
  const key = (k, act, cls = '') => `<button class="ck ${cls}" data-act="${act}" data-k="${k}">${k}</button>`;
  return bar('🧮 Adding Machine', `<button class="btn ${c.money ? 'primary' : ''}" data-act="calc-money">💵 <span>Money</span></button>`) + `<div class="calc-app">
    <div class="calc-left">
      <div class="calc-display"><small>${c.op && c.entry !== '' ? `${fmt(c.acc)} ${c.op}` : c.op ? `${c.op}` : ''}</small><b>${esc(c.money && c.entry === '' ? `$${shown()}` : shown())}</b></div>
      ${coins.length ? `<div class="calc-coins">${coins.map((p) => `<span class="each">${moneyChip(p.d)} × ${p.n}</span>`).join('')}</div>` : ''}
      <div class="calc-keys">
        ${key('C', 'calc-clear', 'fn')}${key('⌫', 'calc-back', 'fn')}${key('÷', 'calc-op', 'op')}${key('×', 'calc-op', 'op')}
        ${key('7', 'calc-d')}${key('8', 'calc-d')}${key('9', 'calc-d')}${key('−', 'calc-op', 'op')}
        ${key('4', 'calc-d')}${key('5', 'calc-d')}${key('6', 'calc-d')}${key('+', 'calc-op', 'op')}
        ${key('1', 'calc-d')}${key('2', 'calc-d')}${key('3', 'calc-d')}${key('=', 'calc-eq', 'eq')}
        ${key('0', 'calc-d', 'zero')}${key('.', 'calc-d')}
      </div>
      <p class="muted small center">🏷️ Scan a price tag to add its price.</p>
    </div>
    <div class="calc-tape-wrap">
      <div class="calc-tape" id="calc-tape">${c.tape.length ? c.tape.map((t) => `<div class="tl ${t.total ? 'total' : ''} ${t.op === 'sep' ? 'sep' : ''}">${t.op === 'sep' ? '' : `<span class="lb">${esc(t.label || '')}</span><span class="n">${fmt(t.n)}</span><span class="o">${t.total ? '*' : esc(t.op.trim())}</span>`}</div>`).join('') : '<div class="tl muted">The paper tape is empty</div>'}</div>
      <div class="row"><button class="btn" data-act="calc-tape-clear">🧽 New tape</button><button class="btn primary" data-act="calc-print" ${c.tape.length ? '' : 'disabled'}>🖨️ Print the tape</button></div>
    </div>
  </div>`;
}

export function calcAfterRender() {
  const t = document.getElementById('calc-tape');
  if (t) t.scrollTop = t.scrollHeight;
}

// Scanning a price adds it.
export function calcScan(info) {
  if (info.kind !== 'item' || !info.item) return false;
  const c = st();
  if (c.entry !== '') press(c.op || '+'); // count what was being typed first
  c.fresh = false; c.op = '+';             // then add the price to the running total
  c.entry = String(info.item.price / 100);
  press('+', info.label);
  toast(`+ ${info.label} $${(info.item.price / 100).toFixed(2)}`);
  return true;
}

function tapeSlip() {
  const c = st();
  return { title: 'Adding machine tape', parts: [
    { t: 'text', s: 'ADDING MACHINE', bold: true, align: 'center' },
    { t: 'text', s: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), align: 'center' },
    { t: 'rule' },
    ...c.tape.flatMap((t) => (t.op === 'sep' ? [{ t: 'rule', ch: '.' }]
      : [{ t: 'row', left: t.label || '', right: `${fmt(t.n)} ${t.total ? '*' : t.op.trim() || ' '}`, bold: !!t.total, size: t.total ? 2 : 1 }])),
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

export const calcActions = {
  'calc-d'(el) {
    const c = st();
    if (c.fresh && c.op === null) { c.acc = null; c.fresh = false; c.tape.push({ op: 'sep' }); }
    const k = el.dataset.k;
    if (k === '.' && c.entry.includes('.')) return;
    if (c.entry.replace('.', '').length >= 12) return;
    c.entry = c.entry === '0' && k !== '.' ? k : c.entry + k;
    sfx.pop(); render();
  },
  'calc-op'(el) { press(el.dataset.k); },
  'calc-eq'() { press('='); },
  'calc-back'() { const c = st(); c.entry = c.entry.slice(0, -1); render(); },
  'calc-clear'() { const c = st(); Object.assign(c, { entry: '', acc: null, op: null, fresh: false }); if (c.tape.length && c.tape.at(-1).op !== 'sep') c.tape.push({ op: 'sep' }); save(); render(); },
  'calc-money'() { const c = st(); c.money = !c.money; save(); render(); },
  'calc-tape-clear'() { const c = st(); c.tape = []; save(); render(); },
  'calc-print'() { printModal(tapeSlip(), { title: '🧾 Adding machine tape' }); },
};
