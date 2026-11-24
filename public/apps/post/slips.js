// Post Office slips: the shipping label, door signs for each place, and a strip of stamps.
import { emojiImage, ditherCanvas, printer } from '../../lib/print.js';

const $ = (c) => `$${(c / 100).toFixed(2)}`;
const SIZE = { letter: 'Letter', small: 'Small box', big: 'Big box', giant: 'Giant box' };
const BANNER = { fragile: 'FRAGILE - HANDLE WITH CARE', express: 'EXPRESS', signature: 'SIGNATURE NEEDED' };

export function labelSlip(parcel, place) {
  return { title: `Label ${parcel.id}`, parts: [
    { t: 'text', s: 'KIDS HUB POST', bold: true, invert: true, align: 'center' },
    { t: 'text', s: ` ${place?.zone || '?'} `, size: 4, bold: true, invert: true, align: 'center' },
    { t: 'text', s: `ZONE ${place?.zone || '?'}`, bold: true, align: 'center' },
    { t: 'rule', ch: '=' },
    { t: 'text', s: `FROM: ${parcel.fromName}` },
    { t: 'text', s: 'TO:', bold: true },
    ...(parcel.toName ? [{ t: 'text', s: parcel.toName, size: 2, bold: true }] : []),
    { t: 'text', s: place?.name || 'Somewhere', size: 2, bold: true },
    { t: 'rule' },
    { t: 'row', left: SIZE[parcel.size] || 'Parcel', right: `${parcel.weight} lb` },
    ...parcel.extras.map((x) => ({ t: 'text', s: BANNER[x] || x.toUpperCase(), bold: true, invert: true, align: 'center' })),
    { t: 'rule' },
    { t: 'qr', data: `KH-M-${parcel.id.toUpperCase()}`, size: 7 },
    { t: 'text', s: `Tracking KH-M-${parcel.id.toUpperCase()}`, align: 'center' },
    { t: 'text', s: `Postage paid ${$(parcel.postage)}`, align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// A sign for each place's door. The mail carrier scans it to deliver.
export function doorSignSlips(places) {
  return places.map((p) => ({ title: `${p.name} door sign`, parts: [
    emojiImage(p.emoji || '🏠', 160),
    { t: 'text', s: p.name, size: 3, bold: true, align: 'center' },
    { t: 'text', s: ` ZONE ${p.zone} `, size: 2, bold: true, invert: true, align: 'center' },
    { t: 'qr', data: `KH-L-${p.id.toUpperCase()}`, size: 8 },
    { t: 'text', s: 'Mail carriers: scan me to deliver!', align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] }));
}

// A strip of postage stamps, drawn as a picture: perforated edges, a picture and a price.
const STAMP_PICS = ['🦖', '🚀', '🌈', '🐙', '🦄', '🍕', '⚽', '🐝'];
export function stampsSlip(value = 25, count = 8) {
  const W = Math.floor(printer().dots / 8) * 8;
  const per = 4;
  const sw = Math.floor(W / per);
  const sh = Math.round(sw * 1.2);
  const rows = Math.ceil(count / per);
  const c = document.createElement('canvas');
  c.width = W; c.height = rows * sh;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, c.height);
  for (let i = 0; i < count; i++) {
    const left = (i % per) * sw, top = Math.floor(i / per) * sh;
    const pad = 6;
    x.fillStyle = '#000'; x.fillRect(left + pad, top + pad, sw - pad * 2, sh - pad * 2);
    x.fillStyle = '#fff';
    // perforations: little bites out of every edge
    for (let k = left + pad + 5; k < left + sw - pad; k += 10) { x.beginPath(); x.arc(k, top + pad, 3.5, 0, 7); x.arc(k, top + sh - pad, 3.5, 0, 7); x.fill(); }
    for (let k = top + pad + 5; k < top + sh - pad; k += 10) { x.beginPath(); x.arc(left + pad, k, 3.5, 0, 7); x.arc(left + sw - pad, k, 3.5, 0, 7); x.fill(); }
    x.fillRect(left + pad + 8, top + pad + 8, sw - pad * 2 - 16, sh - pad * 2 - 16);
    x.fillStyle = '#000'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `${Math.round(sw * 0.42)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.fillText(STAMP_PICS[i % STAMP_PICS.length], left + sw / 2, top + sh * 0.46);
    x.font = `bold ${Math.round(sw * 0.12)}px sans-serif`;
    x.fillText('KIDS HUB', left + sw / 2, top + pad + 22);
    x.fillText(value % 100 ? `${value}¢` : `$${value / 100}`, left + sw / 2, top + sh - pad - 22);
  }
  return { title: 'Stamps', parts: [
    { t: 'text', s: 'KIDS HUB POST - STAMPS', bold: true, align: 'center' },
    ditherCanvas(c, { contrast: 1.3 }),
    { t: 'text', s: 'Cut them apart and stick one on every letter!', align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}
