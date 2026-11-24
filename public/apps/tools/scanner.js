// 🔍 Scanner: a "what is this?" machine. Scan anything: our codes say what they are, real
// barcodes show where they were registered and how the check digit works, QR codes show their text.
import { ui, esc, api, bar, setAccent, render, art, when } from '../../lib/core.js';
import { printModal } from '../../lib/print.js';
import { countryOf, checkSteps } from '../../lib/gs1.js';

const picOf = (info) => (info.photo || info.icon ? art({ photo: info.photo, icon: info.icon, emoji: info.emoji }) : esc(info.emoji || '❓'));

function detective(code) {
  const c = checkSteps(code);
  return `<div class="detective">
    <h3>🕵️ Check-digit detective</h3>
    <p class="muted">The last number is a check digit: it proves the scanner read everything right. Multiply each number by its helper (1 or 3), add them all up…</p>
    <div class="det-grid">${c.steps.map((s) => `<span><b>${s.d}</b><i>×${s.w}</i><em>${s.p}</em></span>`).join('')}<span class="last"><b>${c.last}</b><i>check</i><em>?</em></span></div>
    <p>Add them up: <b>${c.sum}</b>. The next number ending in 0 is <b>${c.next}</b>. ${c.next} − ${c.sum} = <b class="det-answer">${c.check}</b></p>
    <p class="det-verdict ${c.ok ? 'ok' : 'bad'}">${c.ok ? `✅ The last digit is ${c.last}. The barcode checks out!` : `🤔 The last digit is ${c.last}, not ${c.check}. Something's off with this barcode!`}</p>
  </div>`;
}

function result(info) {
  const digits = info.product ? info.code : null;
  const where = digits && countryOf(digits);
  const isLink = info.kind === 'text' && /^https?:\/\//i.test(info.code);
  return `<section class="scan-result">
    <div class="sr-head"><span class="sr-pic">${picOf(info)}</span>
      <div class="grow"><h2>${esc(info.label)}</h2>${info.detail ? `<p>${esc(info.detail)}</p>` : ''}</div>
      ${info.href ? `<a class="btn primary" href="${esc(info.href)}">Go to ${esc(info.go || 'it')} →</a>` : ''}</div>
    ${digits ? `<div class="sr-digits">${[...digits].map((d) => `<span>${d}</span>`).join('')}</div>
      <p class="sr-facts"><b>${esc(info.product.format)}</b> barcode${where ? ` · ${where.flag} The company signed up for it in <b>${esc(where.name)}</b> (it starts with ${where.prefix})` : ''}</p>
      ${detective(digits)}`
    : `<p class="sr-code"><code>${esc(info.code)}</code></p>${isLink ? '<p class="muted">That\'s a web address. The Kids Hub doesn\'t open web pages, so ask a grown-up.</p>' : ''}`}
    <div class="row"><button class="btn" data-act="sc-print">🧾 Print a scan report</button></div>
  </section>`;
}

export function viewScanner() {
  setAccent('#0891b2');
  if (!ui.scLog && !ui.scLogLoading) loadLog();
  const log = ui.scLog;
  return bar('🔍 Scanner') + `<div class="setup scanner-app">
    ${ui.lastScan ? result(ui.lastScan) : `<section class="scan-wait"><div class="radar light"><i></i></div><h2>Scan anything!</h2>
      <p class="muted">A cereal box, a book, a receipt, a QR code… The Scanner tells you all about it.</p></section>`}
    <section class="panel">
      <h3>📜 ${log ? `You scanned <b>${log.today}</b> thing${log.today === 1 ? '' : 's'} today!` : 'Scans'}</h3>
      ${log?.log.length ? `<ul class="scan-log">${log.log.slice(0, 20).map((x) => `<li><span class="e">${esc(x.emoji || '❓')}</span><span class="grow">${esc(x.label)}<small><code>${esc(x.code.length > 32 ? `${x.code.slice(0, 32)}…` : x.code)}</code></small></span><span class="muted">${when(x.at)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}
    </section>
  </div>`;
}

async function loadLog() {
  ui.scLogLoading = true;
  try { ui.scLog = await api('GET', '/api/scanlog'); } catch { /* offline */ }
  ui.scLogLoading = false;
  render();
}

// On the Scanner screen, every scan shows up here (instead of the pop-up card).
export function scannerScan(info) {
  ui.lastScan = info;
  ui.scLog = null; // reload the list
  render();
  window.scrollTo(0, 0);
  return true;
}

function reportSlip(info) {
  const digits = info.product ? info.code : null;
  const where = digits && countryOf(digits);
  const c = digits && checkSteps(digits);
  return { title: 'Scan report', parts: [
    { t: 'text', s: 'SCAN REPORT', size: 2, bold: true, align: 'center' },
    { t: 'text', s: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), align: 'center' },
    { t: 'rule', ch: '=' },
    { t: 'text', s: info.label, size: 2, bold: true },
    ...(info.detail ? [{ t: 'text', s: info.detail }] : []),
    ...(digits ? [
      { t: 'row', left: 'Type', right: info.product.format },
      ...(where ? [{ t: 'text', s: `Signed up in ${where.name} (prefix ${where.prefix})` }] : []),
      { t: 'text', s: `Check digit: ${c.sum} -> ${c.next}, so ${c.check}. ${c.ok ? 'It checks out!' : 'Something is off!'}` },
    ] : []),
    { t: 'rule' },
    ...(info.code.length <= 40 && /^[\x20-\x7e]+$/.test(info.code) ? [{ t: 'barcode', data: info.code }] : [{ t: 'qr', data: info.code, size: 5 }]),
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

export const scannerActions = {
  'sc-print'() { if (ui.lastScan) printModal(reportSlip(ui.lastScan), { title: '🧾 Scan report' }); },
};
