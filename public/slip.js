/* Slips: what goes on the receipt printer. One slip format drives both the on-screen paper
 * preview (browser, window.Slip) and the ESC/POS bytes (server, require). Sharing the text
 * cleaning, word wrap and row padding here means the preview shows exactly what prints.
 *
 * A slip is { title, parts: [...] }. Parts:
 *   { t: 'text', s, size: 1-4, bold, align: 'left'|'center'|'right', underline, invert }
 *   { t: 'row', left, right, size, bold }          left text, right text pushed to the edge
 *   { t: 'rule', ch: '-' | '=' | '.' }             a line across the paper
 *   { t: 'qr', data, size: 3-10 }                  drawn by the printer itself
 *   { t: 'barcode', data }                         Code 128, with the text under it
 *   { t: 'image', w, h, bits, align }              1-bit rows (w a multiple of 8), base64, 1 = black
 *   { t: 'feed', n }                               blank lines
 *   { t: 'cut' }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Slip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Printers start in code page 437. These are its characters 0x80-0xFF.
  const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
  const PRINTABLE = new Set(CP437_HIGH);
  const SWAP = { '‘': "'", '’': "'", '‚': ',', '“': '"', '”': '"', '–': '-', '—': '-', '−': '-', '×': 'x', '•': '*', '…': '...', '€': 'EUR', '\t': ' ', 'Á': 'A', 'À': 'A', 'Â': 'A', 'Ã': 'A', 'ã': 'a', 'õ': 'o', 'Ó': 'O', 'Ú': 'U', 'Í': 'I', 'È': 'E', 'Ê': 'E', 'Ë': 'E', 'Ô': 'O', 'Œ': 'OE', 'œ': 'oe' };

  // Only characters the printer can print: emoji and other symbols are dropped.
  function clean(s) {
    let out = '';
    for (const ch of String(s ?? '').normalize('NFC')) {
      const c = ch.codePointAt(0);
      if (c >= 0x20 && c < 0x7f) out += ch;
      else if (SWAP[ch] !== undefined) out += SWAP[ch];
      else if (PRINTABLE.has(ch)) out += ch;
      else if (ch === '\n') out += '\n';
    }
    return out.replace(/[  ]{2,}/g, ' ').split('\n').map((l) => l.trim()).join('\n').trim();
  }

  // Word wrap to `width` characters; words longer than a line are split.
  function wrap(text, width) {
    const lines = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (let word of para.split(' ')) {
        if (!word) continue;
        while (word.length > width) {
          if (line) { lines.push(line); line = ''; }
          lines.push(word.slice(0, width)); word = word.slice(width);
        }
        if (!word) continue;
        if (!line) line = word;
        else if (line.length + 1 + word.length <= width) line += ` ${word}`;
        else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  }

  const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const ALIGNS = new Set(['left', 'center', 'right']);

  // Check and tidy a slip from anywhere (the server never trusts the browser). Throws a message.
  function normalize(slip, { dots = 576 } = {}) {
    if (!slip || !Array.isArray(slip.parts)) throw new Error('That slip is empty');
    if (slip.parts.length > 200) throw new Error('That slip is too long');
    const parts = [];
    for (const p of slip.parts) {
      if (!p || typeof p !== 'object') continue;
      const size = clampInt(p.size, 1, 4, 1);
      if (p.t === 'text') {
        const s = clean(String(p.s ?? '').slice(0, 2000));
        if (s) parts.push({ t: 'text', s, size, bold: !!p.bold, underline: !!p.underline, invert: !!p.invert, align: ALIGNS.has(p.align) ? p.align : 'left' });
      } else if (p.t === 'row') {
        parts.push({ t: 'row', left: clean(String(p.left ?? '').slice(0, 200)), right: clean(String(p.right ?? '').slice(0, 60)), size: Math.min(size, 2), bold: !!p.bold });
      } else if (p.t === 'rule') {
        parts.push({ t: 'rule', ch: ['-', '=', '.', '*'].includes(p.ch) ? p.ch : '-' });
      } else if (p.t === 'qr') {
        const data = String(p.data ?? '').slice(0, 300);
        if (data) parts.push({ t: 'qr', data, size: clampInt(p.size, 3, 10, 6) });
      } else if (p.t === 'barcode') {
        const data = String(p.data ?? '').replace(/[^\x20-\x7e]/g, '').replace(/[{}]/g, '').slice(0, 40);
        if (data) parts.push({ t: 'barcode', data });
      } else if (p.t === 'image') {
        const w = clampInt(p.w, 8, dots, 0), h = clampInt(p.h, 1, 1600, 0);
        const bits = String(p.bits ?? '');
        if (w % 8 || !h || !/^[A-Za-z0-9+/]*={0,2}$/.test(bits)) throw new Error('That picture is broken');
        const bytes = Math.floor((bits.length * 3) / 4) - (bits.endsWith('==') ? 2 : bits.endsWith('=') ? 1 : 0);
        if (bytes !== (w / 8) * h) throw new Error('That picture is the wrong size');
        parts.push({ t: 'image', w, h, bits, align: ALIGNS.has(p.align) ? p.align : 'center' });
      } else if (p.t === 'feed') {
        parts.push({ t: 'feed', n: clampInt(p.n, 1, 10, 1) });
      } else if (p.t === 'cut') {
        parts.push({ t: 'cut' });
      }
    }
    if (!parts.length) throw new Error('That slip is empty');
    return { title: clean(String(slip.title ?? 'Slip').slice(0, 60)) || 'Slip', parts };
  }

  // Lay a (normalized) slip out in printer lines. `cols` is characters per line at size 1.
  function layout(slip, { cols = 48 } = {}) {
    const ops = [];
    for (const p of slip.parts) {
      if (p.t === 'text') {
        ops.push({ ...p, lines: wrap(p.s, Math.max(1, Math.floor(cols / p.size))) });
      } else if (p.t === 'row') {
        const width = Math.floor(cols / p.size);
        const right = p.right.slice(0, width);
        const room = Math.max(0, width - right.length - (right ? 1 : 0));
        const left = wrap(p.left || ' ', Math.max(1, room));
        const lines = left.map((l, i) => (i === left.length - 1 ? l.padEnd(width - right.length) + right : l));
        ops.push({ t: 'row', size: p.size, bold: p.bold, lines });
      } else if (p.t === 'rule') {
        ops.push({ t: 'rule', lines: [p.ch.repeat(cols)] });
      } else {
        ops.push(p);
      }
    }
    return ops;
  }

  // Roughly how tall a slip is, in printer dots (8 dots = 1 mm), for the length limit.
  const LINE = 30;
  function heightDots(ops) {
    let h = 0;
    for (const o of ops) {
      if (o.lines) h += o.lines.length * LINE * (o.size || 1);
      else if (o.t === 'qr') h += o.size * 33 + LINE;
      else if (o.t === 'barcode') h += 80 + LINE * 2;
      else if (o.t === 'image') h += o.h;
      else if (o.t === 'feed') h += o.n * LINE;
      else if (o.t === 'cut') h += LINE * 4;
    }
    return h;
  }

  const money = (c) => `$${(Math.round(c) / 100).toFixed(2)}`;

  return { CP437_HIGH, clean, wrap, normalize, layout, heightDots, money, LINE };
});
