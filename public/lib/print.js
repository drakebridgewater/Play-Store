// Receipt printer, browser side: paper preview, black-and-white pictures, and sending slips.
// The slip format and layout live in /slip.js (shared with the server).
import { S, ui, esc, api, toast, openModal, drawModal, sfx } from './core.js';
import { qrMatrix, qrSvg } from './qr.js';
import { code128Bits, code128Svg } from './code128.js';

export const Slip = globalThis.Slip;

// Printer settings and state from the server (S.printer), with safe defaults before it loads.
export const printer = () => S.printer || { enabled: false, status: { state: 'unset' }, cols: 48, dots: 576 };
export const canPrint = () => { const p = printer(); return p.enabled && !!p.address; };

const STATUS = {
  ready: ['🟢', 'Printer ready'], low: ['🟠', 'Paper is running low'], out: ['🔴', 'Out of paper'],
  open: ['🔴', 'The printer lid is open'], offline: ['⚫', "Can't reach the printer"], off: ['⚪', 'The printer is turned off'],
  unset: ['⚪', 'No printer set up'], unknown: ['⚪', 'Checking the printer…'],
};
export function statusLine(p = printer()) {
  const [dot, text] = STATUS[p.status?.state] || STATUS.unknown;
  return `${dot} ${esc(text)}`;
}

// ------------------------------------------------------------------ pictures
// Draw something on a canvas `w` dots wide (a multiple of 8), then make it 1-bit with
// Floyd–Steinberg dithering. Returns an image part for a slip.
export function ditherCanvas(canvas, { align = 'center', contrast = 1.15 } = {}) {
  const { width: w, height: h } = canvas;
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3] / 255; // transparent = white paper
    const lum = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) * a + 255 * (1 - a);
    g[i] = Math.min(255, Math.max(0, (lum - 128) * contrast + 128));
  }
  const bytes = new Uint8Array((w / 8) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const black = g[i] < 128;
      const err = g[i] - (black ? 0 : 255);
      if (black) bytes[y * (w / 8) + (x >> 3)] |= 0x80 >> (x & 7);
      if (x + 1 < w) g[i + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) g[i + w - 1] += (err * 3) / 16;
        g[i + w] += (err * 5) / 16;
        if (x + 1 < w) g[i + w + 1] += err / 16;
      }
    }
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return { t: 'image', w, h, bits: btoa(bin), align };
}

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const round8 = (n) => Math.max(8, Math.round(n / 8) * 8);

// A big emoji as a picture (emoji can't be printed as text).
export function emojiImage(emoji, size = 120) {
  const s = round8(size);
  const c = canvasOf(s, s);
  const x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `${Math.round(s * 0.82)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  x.fillText(emoji, s / 2, s / 2 + s * 0.04);
  return ditherCanvas(c);
}

// An SVG drawing (from art.js) as a picture, `w` dots wide (height from its viewBox).
export async function svgImage(svg, w = 160, h = null) {
  const W = round8(w);
  if (!h) {
    const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1].trim().split(/\s+/).map(Number);
    h = Math.round(vb && vb[2] > 0 ? (W * vb[3]) / vb[2] : W);
  }
  const sized = svg.replace('<svg ', `<svg width="${W}" height="${h}" `);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const c = canvasOf(W, h);
    c.getContext('2d').drawImage(img, 0, 0, W, h);
    return ditherCanvas(c);
  } finally { URL.revokeObjectURL(url); }
}

// A photo (URL) as a square picture.
export async function photoImage(src, size = 192) {
  const s = round8(size);
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
  const c = canvasOf(s, s);
  const side = Math.min(img.width, img.height);
  c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, s, s);
  return ditherCanvas(c, { contrast: 1.4 });
}

// ------------------------------------------------------------------ preview
function imageUrl(o) {
  const c = canvasOf(o.w, o.h);
  const x = c.getContext('2d');
  const d = x.createImageData(o.w, o.h);
  const bytes = atob(o.bits);
  for (let i = 0; i < o.w * o.h; i++) {
    const on = bytes.charCodeAt(i >> 3) & (0x80 >> (i & 7)); // rows are whole bytes, since w is a multiple of 8
    const v = on ? 20 : 255;
    d.data.set([v, v, v, 255], i * 4);
  }
  x.putImageData(d, 0, 0);
  return c.toDataURL();
}

// The slip drawn as a strip of receipt paper, laid out exactly as the printer will.
export function previewHtml(slip) {
  const p = printer();
  let norm;
  try { norm = Slip.normalize(slip, p); } catch (e) { return `<div class="paper"><p>${esc(e.message)}</p></div>`; }
  const pct = (dots) => `${Math.min(100, (dots / p.dots) * 100).toFixed(1)}%`;
  const body = Slip.layout(norm, p).map((o) => {
    if (o.lines) {
      const cls = `pl s${o.size || 1} ${o.bold ? 'b' : ''} ${o.underline ? 'u' : ''} ${o.invert ? 'inv' : ''} a-${o.align || 'left'}`;
      // Inverted text: the printer blacks out behind the letters only, not the whole line.
      return o.lines.map((l) => `<div class="${cls}">${o.invert && l ? `<span>${esc(l)}</span>` : esc(l) || '&nbsp;'}</div>`).join('');
    }
    if (o.t === 'qr') {
      try { return `<div class="pq-real" style="width:${pct(qrMatrix(o.data).length * o.size)}">${qrSvg(o.data, { quiet: 0, label: o.data })}</div>`; }
      catch { return `<div class="pq" style="width:${pct(o.size * 29)}" title="${esc(o.data)}"><span>QR</span></div>`; }
    }
    if (o.t === 'barcode') {
      try {
        const modules = code128Bits(o.data).length;
        const w = Math.max(1, Math.min(3, Math.floor(p.dots / (modules + 20))));
        return `<div class="pb-real" style="width:${pct(modules * w)}">${code128Svg(o.data, { height: 50 })}</div>`;
      } catch { return `<div class="pb"><i></i><span>${esc(o.data)}</span></div>`; }
    }
    if (o.t === 'image') return `<div class="pi a-${o.align}"><img src="${imageUrl(o)}" style="width:${pct(o.w)}" alt=""></div>`;
    if (o.t === 'feed') return '<div class="pl">&nbsp;</div>'.repeat(o.n);
    if (o.t === 'cut') return `<div class="pcut">${p.cut === false ? 'tear here' : '✂'} - - - - - - - - - - - - - -</div>`;
    return '';
  }).join('');
  return `<div class="paper" style="--cols:${p.cols}">${body}</div>`;
}

// ------------------------------------------------------------------ printing
export async function printSlip(slip, { test = false } = {}) {
  const r = await api('POST', '/api/print', { slip, test }, { pin: test });
  sfx.kaching();
  return r;
}

// A preview with a Print button. `slip` can be one slip or a list (printed one after another).
// `back` (optional) returns to the screen that opened it. Any slip can also go to someone's phone
// (📱 My stuff) instead; with the printer off that's the main button. `to` (a person id) is who it's
// for, when the screen knows.
export function printModal(slip, { title = '🧾 Receipt', test = false, back = null, onClose = null, to = null } = {}) {
  const slips = Array.isArray(slip) ? slip : [slip];
  const m = {
    busy: false, done: false, onClose, picking: false, sentTo: null, deal: null, // deal: which slip is being handed out, one per phone
    render() {
      const p = printer();
      const ready = canPrint();
      const person = S.customers.find((c) => c.id === to);
      if (m.picking) {
        return `<div class="sheet">
          <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
          <h2>📲 ${m.deal != null ? `${esc(slips[m.deal].title || 'Slip')} (${m.deal + 1} of ${slips.length}): whose phone?` : 'Whose phone?'}</h2>
          <p class="center muted">It shows up on their phone under 📱 My stuff.${m.deal != null ? ' Then it asks about the next one.' : ''}</p>
          <div class="choices">${S.customers.map((c) => `<button class="choice" data-act="send-to" data-id="${c.id}"><span class="e">${c.photo ? `<img class="face-img" src="${esc(c.photo)}" alt="" data-emoji="${esc(c.emoji || '🙂')}">` : esc(c.emoji || '🙂')}</span>${esc(c.name)}</button>`).join('')}</div>
          <div class="row split"><button class="btn" data-act="unpick">${m.deal != null ? '✋ Stop here' : '← Back'}</button>
            ${slips.length > 1 && m.deal == null ? `<button class="btn" data-act="deal">🃏 One per phone (${slips.length})</button>` : ''}</div>
        </div>`;
      }
      const phoneBtn = (big) => (person
        ? `<button class="btn ${big ? 'huge primary' : ''}" ${big ? 'style="width:auto;flex:1;max-width:340px"' : ''} data-act="send-to" data-id="${person.id}" ${m.busy ? 'disabled' : ''}>📲 ${big ? `Send to ${esc(person.name)}'s phone` : 'Phone'}</button>${big ? '<button class="btn" data-act="pick">Someone else</button>' : ''}`
        : `<button class="btn ${big ? 'huge primary' : ''}" ${big ? 'style="width:auto;flex:1;max-width:340px"' : ''} data-act="pick" ${m.busy ? 'disabled' : ''}>📲 ${big ? 'Send to a phone' : 'Phone'}</button>`);
      return `<div class="sheet print-sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${title}</h2>
        <div class="paper-wrap" data-scroll="paper">${slips.map(previewHtml).join('<div class="paper-gap"></div>')}</div>
        ${ready ? `<p class="center muted">${statusLine(p)}${!test ? ` · ${Math.max(0, p.dailyLimit - p.today)} prints left today${slips.length > 1 ? ` (this uses ${slips.length})` : ''}` : ''}</p>` : ''}
        ${m.sentTo ? `<p class="center">✅ Sent to ${m.sentTo === 'everyone' ? 'their phones' : `${esc(m.sentTo)}'s phone`} 📱</p>` : ''}
        <div class="row split">
          ${back ? '<button class="btn" data-act="back">← Back</button>' : '<span></span>'}
          ${ready || test ? `<span class="row" style="flex:1;justify-content:flex-end">${test ? '' : phoneBtn(false)}<button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="print" ${ready && !m.busy ? '' : 'disabled'}>
            ${m.busy ? '🖨️ Printing…' : m.done ? '🖨️ Print again' : `🖨️ Print${slips.length > 1 ? ` (${slips.length} slips)` : ''}`}</button></span>`
            : `<span class="row" style="flex:1;justify-content:flex-end">${phoneBtn(true)}</span>`}
        </div>
        ${ready || test ? '' : `<p class="center muted small">${p.enabled === false ? '🖨️ The printer is off, so this goes to a phone instead.' : 'No printer set up yet, so this can go to a phone instead.'}</p>`}
      </div>`;
    },
    async act(a, el) {
      if (a === 'back') { back?.(); return; }
      if (a === 'pick') { m.picking = true; drawModal(); return; }
      if (a === 'unpick') { m.picking = false; m.deal = null; drawModal(); return; }
      if (a === 'deal') { m.deal = 0; drawModal(); return; }
      if (a === 'send-to') {
        if (m.busy) return;
        const dealing = m.deal != null;
        m.busy = true; if (!dealing) m.picking = false; drawModal();
        try {
          const r = await api('POST', '/api/inbox', { customerId: el.dataset.id, slips: dealing ? [slips[m.deal]] : slips });
          sfx.pop(); toast(`📲 Sent to ${r.name}'s phone`);
          if (dealing) {
            m.deal++;
            if (m.deal >= slips.length) { m.deal = null; m.picking = false; m.sentTo = 'everyone'; }
          } else m.sentTo = r.name;
        } catch (e) { toast(e.message); }
        m.busy = false;
        if (ui.modal === m) drawModal();
        return;
      }
      if (a !== 'print' || m.busy) return;
      m.busy = true; drawModal();
      try { for (const one of slips) await printSlip(one, { test }); m.done = true; toast('🖨️ Printed!'); }
      catch (e) { toast(e.message); }
      m.busy = false;
      if (ui.modal === m) drawModal();
    },
  };
  openModal(m);
}

// Text that may hold emoji (which the printer can't print as letters), drawn as one picture,
// wrapped to the paper width.
export function textImage(text, { size = 44, width = null } = {}) {
  const W = round8(width || printer().dots);
  const segs = typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter().segment(text)].map((s) => s.segment) : [...text];
  const probe = canvasOf(8, 8).getContext('2d');
  const font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",ui-monospace,monospace`;
  probe.font = font;
  const lines = [];
  let line = '';
  for (const g of segs) {
    if (g === '\n') { lines.push(line); line = ''; continue; }
    if (probe.measureText(line + g).width > W - 8) { lines.push(line); line = g.trim() ? g : ''; } else line += g;
  }
  if (line) lines.push(line);
  const lh = Math.round(size * 1.3);
  const c = canvasOf(W, Math.max(lh, lines.length * lh + 8));
  const x = c.getContext('2d');
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000';
  lines.forEach((l, i) => x.fillText(l, W / 2, i * lh + lh / 2 + 4));
  return ditherCanvas(c);
}
