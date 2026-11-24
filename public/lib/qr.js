// QR code encoder for showing codes on screen (the receipt printer draws its own). Byte mode,
// error correction level M, versions 1–10 (up to 213 bytes). No dependencies.
// Follows the QR Code spec (ISO/IEC 18004): data → Reed–Solomon blocks → matrix → best mask.

// Per version (index = version): [data codewords per block…], EC codewords per block (level M).
const BLOCKS = [null,
  [[16], 10], [[28], 16], [[44], 26], [[32, 32], 18], [[43, 43], 24],
  [[27, 27, 27, 27], 16], [[31, 31, 31, 31], 18], [[38, 38, 39, 39], 22],
  [[36, 36, 36, 37, 37], 22], [[43, 43, 43, 43, 44], 26]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const gfMul = (x, y) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
};
function rsDivisor(degree) {
  const d = new Array(degree).fill(0);
  d[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { d[j] = gfMul(d[j], root); if (j + 1 < degree) d[j] ^= d[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return d;
}
function rsRemainder(data, divisor) {
  const r = new Array(divisor.length).fill(0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

// Returns a square array of rows (true = dark), without the quiet zone.
export function qrMatrix(text, { mask: forceMask = null } = {}) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const cap = BLOCKS[v][0].reduce((a, n) => a + n, 0) * 8;
    if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap) { version = v; break; }
  }
  if (!version) throw new Error('That is too long for a QR code here');
  const [blocks, ecLen] = BLOCKS[version];
  const capBytes = blocks.reduce((a, n) => a + n, 0);

  // Bits: mode 0100 (bytes), length, data, terminator, padding.
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capBytes * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capBytes; pad ^= 0xec ^ 0x11) data.push(pad);

  // Split into blocks, add error correction, interleave.
  const div = rsDivisor(ecLen);
  let k = 0;
  const dataBlocks = blocks.map((n) => { const b = data.slice(k, k + n); k += n; return b; });
  const ecBlocks = dataBlocks.map((b) => rsRemainder(b, div));
  const codewords = [];
  for (let i = 0; i < Math.max(...blocks); i++) for (const b of dataBlocks) if (i < b.length) codewords.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const b of ecBlocks) codewords.push(b[i]);

  // The matrix and its fixed patterns.
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fixed[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[version];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const d = (0 << 3) | mask; // level M = 00
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    const bit = (i) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true); // the always-dark module
  };
  drawFormat(0); // reserve the spots
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((v >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }

  // Data, in the zigzag order.
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fixed[y][x] && n < codewords.length * 8) { m[y][x] = ((codewords[n >>> 3] >>> (7 - (n & 7))) & 1) === 1; n++; }
      }
    }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (k2) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[k2](x, y)) m[y][x] = !m[y][x]; };
  // Pick the mask that leaves the fewest confusing patterns (long runs, 2×2 blocks, finder look-alikes, imbalance).
  const penalty = () => {
    let p = 0;
    const lineScore = (get) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          if (b < size && get(a, b) === get(a, b - 1)) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
        for (let b = 0; b + 10 < size; b++) {
          const s = [...Array(11).keys()].map((q) => (get(a, b + q) ? 1 : 0)).join('');
          if (s === '10111010000' || s === '00001011101') p += 40;
        }
      }
    };
    lineScore((y, x) => m[y][x]);
    lineScore((x, y) => m[y][x]);
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = forceMask;
  if (best === null) {
    let low = Infinity;
    for (let k2 = 0; k2 < 8; k2++) {
      applyMask(k2); drawFormat(k2);
      const p = penalty();
      if (p < low) { low = p; best = k2; }
      applyMask(k2);
    }
  }
  applyMask(best); drawFormat(best);
  return m;
}

// The code as an SVG (with a 4-module quiet zone), for screens.
export function qrSvg(text, { cls = 'qr-svg', label = '', quiet = 4 } = {}) {
  const m = qrMatrix(text);
  const n = m.length + quiet * 2;
  let d = '';
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${label.replace(/"/g, '&quot;') || 'QR code'}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
