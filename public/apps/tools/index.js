// The standalone tools: 🔍 Scanner, 🔳 QR Studio and 🧮 Adding Machine.
import { ui, toast, sfx } from '../../lib/core.js';
import { viewScanner, scannerScan, scannerActions } from './scanner.js';
import { viewQr, qrInput, qrScan, qrActions } from './qrstudio.js';
import { viewCalc, calcScan, calcActions, calcAfterRender } from './calc.js';

export const toolsApp = {
  views: { scanner: viewScanner, qr: viewQr, calc: viewCalc },
  actions: { ...scannerActions, ...qrActions, ...calcActions },
  onInput(e, r) { if (r.view === 'qr') qrInput(e); },
  afterRender(r) { if (r.view === 'calc') calcAfterRender(); },
  // The Scanner and QR Studio read every scan themselves (no jumping off to other apps).
  ownsScans: (r) => r.view === 'scanner' || r.view === 'qr',
  onScan(info, r) {
    if (r.view === 'scanner') return scannerScan(info);
    if (r.view === 'qr') return qrScan(info);
    if (r.view === 'calc') return calcScan(info);
    return false;
  },
  // Shortcut codes from QR Studio (KH-G-…) open their app from anywhere.
  anyScan(info) {
    if (info.kind !== 'go' || ui.modal) return false;
    sfx.pop(); toast(`${info.emoji} ${info.label}`);
    location.hash = info.href;
    return true;
  },
};
