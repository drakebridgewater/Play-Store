'use strict';
// Receipt printer: turns a laid-out slip (public/slip.js) into ESC/POS bytes and sends them
// to a network printer on TCP port 9100. No dependencies.

const net = require('node:net');
const Slip = require('../public/slip.js');

const ESC = 0x1b, GS = 0x1d, DLE = 0x10;
const CP437 = new Map([...Slip.CP437_HIGH].map((ch, i) => [ch, 0x80 + i]));

// Text to code page 437 bytes (slip.js already dropped anything the printer can't print).
function enc(s) {
  const out = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    out.push(c < 0x80 ? c : CP437.get(ch) ?? 0x3f);
  }
  return out;
}

const ALIGN = { left: 0, center: 1, right: 2 };

// ESC/POS for a normalized slip. cfg: { dots, cols, cut }. cut: false feeds the slip past the
// tear bar instead of cutting (for printers with the autocutter turned off).
function escpos(slip, cfg) {
  const b = [];
  const push = (...xs) => { for (const x of xs) b.push(x); };
  const align = (a) => push(ESC, 0x61, ALIGN[a] ?? 0);
  const style = ({ size = 1, bold = false, underline = false, invert = false } = {}) => {
    push(GS, 0x21, ((size - 1) << 4) | (size - 1)); // width and height multiplier
    push(ESC, 0x45, bold ? 1 : 0);
    push(ESC, 0x2d, underline ? 1 : 0);
    push(GS, 0x42, invert ? 1 : 0);
  };
  const line = (s) => { push(...enc(s), 0x0a); };

  push(ESC, 0x40);          // reset
  push(ESC, 0x74, 0);       // code page 437
  for (const o of Slip.layout(slip, cfg)) {
    if (o.t === 'text') {
      align(o.align); style(o); o.lines.forEach(line);
    } else if (o.t === 'row' || o.t === 'rule') {
      align('left'); style(o); o.lines.forEach(line);
    } else if (o.t === 'qr') {
      align('center'); style();
      const data = Buffer.from(o.data, 'utf8');
      const n = data.length + 3;
      push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0);           // model 2
      push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, o.size);            // module size
      push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31);              // error correction M
      push(GS, 0x28, 0x6b, n & 0xff, n >> 8, 0x31, 0x50, 0x30, ...data); // store
      push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);              // print
      push(0x0a);
    } else if (o.t === 'barcode') {
      align('center'); style();
      const data = enc(o.data);
      const modules = (data.length + 3) * 11 + 13 + 20; // Code 128 B plus quiet zones
      const width = Math.max(1, Math.min(3, Math.floor(cfg.dots / modules)));
      push(GS, 0x68, 80);        // height
      push(GS, 0x77, width);     // module width
      push(GS, 0x48, 2);         // text below
      push(GS, 0x66, 0);         // text font A
      push(GS, 0x6b, 73, data.length + 2, 0x7b, 0x42, ...data); // CODE128, code set B
      push(0x0a);
    } else if (o.t === 'image') {
      align(o.align); style();
      const bytes = Buffer.from(o.bits, 'base64');
      const row = o.w / 8;
      for (let y = 0; y < o.h; y += 128) { // bands, so small printer buffers keep up
        const h = Math.min(128, o.h - y);
        push(GS, 0x76, 0x30, 0, row & 0xff, row >> 8, h & 0xff, h >> 8);
        for (let i = y * row; i < (y + h) * row; i++) b.push(bytes[i]);
      }
    } else if (o.t === 'feed') {
      push(ESC, 0x64, o.n);
    } else if (o.t === 'cut') {
      if (cfg.cut === false) push(ESC, 0x64, 5); // feed past the tear bar
      else push(GS, 0x56, 66, 3); // feed to the cutter, then partial cut (Epson function B)
    }
  }
  style(); align('left');
  return Buffer.from(b);
}

// Paper and cover state from the real-time status bytes (DLE EOT 1, 2, 4).
function parseStatus(bytes) {
  if (bytes.length < 3) return { online: true, paper: 'unknown', cover: 'unknown' };
  const [printer, offline, paper] = bytes;
  return {
    online: !(printer & 0x08),
    cover: offline & 0x04 ? 'open' : 'closed',
    paper: paper & 0x60 ? 'out' : paper & 0x0c ? 'low' : 'ok',
  };
}

// One connection: ask for status, then (if there's paper) send the job. Resolves with the status.
function talk(host, port, job, { timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    const got = [];
    let phase = 'connect';
    let waitTimer;
    const fail = (msg) => { cleanup(); sock.destroy(); reject(new Error(msg)); };
    const cleanup = () => { clearTimeout(waitTimer); sock.setTimeout(0); };
    sock.setTimeout(timeout, () => fail(phase === 'connect' ? "Can't reach the printer" : 'The printer stopped answering'));
    sock.on('error', (e) => fail(e.code === 'ECONNREFUSED' || e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH' ? "Can't reach the printer" : `Printer problem (${e.code || e.message})`));
    sock.on('connect', () => {
      phase = 'status';
      sock.write(Buffer.from([DLE, 0x04, 1, DLE, 0x04, 2, DLE, 0x04, 4]));
      waitTimer = setTimeout(afterStatus, 800); // some printers never answer status; carry on
    });
    sock.on('data', (d) => { got.push(...d); if (phase === 'status' && got.length >= 3) { clearTimeout(waitTimer); afterStatus(); } });
    function afterStatus() {
      if (phase !== 'status') return;
      const status = parseStatus(got);
      if (!job) { phase = 'done'; cleanup(); sock.end(); resolve(status); return; }
      if (status.paper === 'out') return fail('The printer is out of paper');
      if (status.cover === 'open') return fail('The printer lid is open');
      phase = 'send';
      sock.end(job, () => { phase = 'done'; cleanup(); resolve(status); });
    }
  });
}

// One job at a time, in order.
let chain = Promise.resolve();
function queue(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

module.exports = { escpos, talk, queue, parseStatus };
