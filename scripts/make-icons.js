'use strict';
// Renders public/icon-192.png and public/icon-512.png (same shapes as public/icon.svg)
// with no dependencies: node scripts/make-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ORANGE = hex('#ff7a45'), WHITE = hex('#ffffff'), YELLOW = hex('#ffd23f');
const WINDOW = hex('#ffd9c7'), DOOR = hex('#ffb38f');

const inRound = (x, y, x0, y0, w, h, r) => {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

// Colour at a point in the 512x512 design space; null = transparent.
function shade(x, y) {
  if (!inRound(x, y, 0, 0, 512, 512, 112)) return null;
  for (let k = 0; k < 8; k++) {
    if ((x - (116 + 40 * k)) ** 2 + (y - 210) ** 2 <= 400) return k % 2 ? YELLOW : WHITE;
  }
  if (x >= 96 && x < 416 && y >= 130 && y < 210) return Math.floor((x - 96) / 40) % 2 ? YELLOW : WHITE;
  if (inRound(x, y, 226, 290, 60, 110, 6)) return DOOR;
  if (inRound(x, y, 150, 260, 56, 60, 6) || inRound(x, y, 306, 260, 56, 60, 6)) return WINDOW;
  if (inRound(x, y, 120, 230, 272, 170, 10)) return WHITE;
  return ORANGE;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function render(size) {
  const SS = 4; // supersampling per axis
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = shade(((px + (sx + 0.5) / SS) * 512) / size, ((py + (sy + 0.5) / SS) * 512) / size);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      if (a) { raw[o] = r / a; raw[o + 1] = g / a; raw[o + 2] = b / a; }
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const out = path.join(__dirname, '..', 'public', `icon-${size}.png`);
  fs.writeFileSync(out, render(size));
  console.log('wrote', out);
}
