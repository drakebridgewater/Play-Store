// 🔳 QR Studio: make QR codes (a message, emoji, a secret, a shortcut to an app, a Wi-Fi card),
// show them big, print them, save them, and read any QR code with the scanner.
import { S, ui, esc, api, bar, setAccent, render, toast, loadAll, askConfirm, sfx, openModal } from '../../lib/core.js';
import { printModal, emojiImage, textImage } from '../../lib/print.js';
import { qrSvg } from '../../lib/qr.js';
import { CIPHERS, encode, qrFor } from '../spy/ciphers.js';

const KINDS = {
  message: { e: '💬', name: 'Message' }, emoji: { e: '😀', name: 'Emoji' }, secret: { e: '🕵️', name: 'Secret' },
  link: { e: '🔗', name: 'Open an app' }, wifi: { e: '📶', name: 'Wi-Fi (grown-ups)' },
};
const LINKS = [['store', '🏪 Store'], ['bank', '🏦 Bank'], ['people', '🙂 People'], ['spy', '🕵️ Spy HQ'], ['cipher', '🌀 Cipher Lab'], ['codebreaker', '🔢 Code Breaker'],
  ['missions', '🗺️ Missions'], ['vault', '🔐 Vaults'], ['serving', '📣 Now Serving'], ['scanner', '🔍 Scanner'], ['qr', '🔳 QR Studio'], ['calc', '🧮 Adding Machine'], ['home', '🏠 Home screen']];
const EMOJI = ['😀', '😂', '🥰', '😎', '🤪', '🥳', '😺', '🐶', '🦄', '🐉', '🦖', '🐙', '🌈', '⭐', '🔥', '❤️', '💩', '👻', '👽', '🤖', '🍕', '🍦', '🍩', '🎂', '⚽', '🚀', '🎉', '🎁', '👑', '💎', '🏆', '👋'];

const st = () => (ui.qs ||= { kind: 'message', text: 'Hello from the Kids Hub!', caption: '', cipher: 'caesar', shift: 3, link: 'spy', ssid: '', pass: '' });
const bytes = (s) => new TextEncoder().encode(s).length;
const wifiEsc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');

// What goes inside the QR code.
function content(q = st()) {
  if (q.kind === 'secret') return qrFor(q.cipher, encode(q.cipher, q.text.toUpperCase(), q.shift));
  if (q.kind === 'link') return `KH-G-${q.link.toUpperCase()}`;
  if (q.kind === 'wifi') return q.ssid ? `WIFI:T:WPA;S:${wifiEsc(q.ssid)};P:${wifiEsc(q.pass)};;` : '';
  return q.text;
}
function captionFor(q = st()) {
  if (q.caption.trim()) return q.caption.trim();
  if (q.kind === 'link') return LINKS.find(([k]) => k === q.link)?.[1].replace(/^\S+ /, '') || '';
  if (q.kind === 'wifi') return 'Wi-Fi for guests';
  if (q.kind === 'secret') return 'TOP SECRET';
  return '';
}
const preview = () => {
  const c = content();
  if (!c) return '<div class="qs-empty">Type something to make a code</div>';
  try { return qrSvg(c, { label: c }); } catch (e) { return `<div class="qs-empty">${esc(e.message)}</div>`; }
};

export function viewQr() {
  setAccent('#475569');
  const q = st();
  const c = content();
  const read = ui.qsRead;
  return bar('🔳 QR Studio') + `<div class="setup qr-studio">
    ${read ? `<section class="panel qs-read"><h3><span class="grow">📖 That code says…</span><button class="btn icon" data-act="qs-read-x" aria-label="Close">✕</button></h3>
      <div class="qs-read-text">${esc(read.kind === 'secret' ? read.secret.text : read.code)}</div>
      <p class="muted">${esc(read.label)}${read.detail && read.kind !== 'text' ? ` · ${esc(read.detail)}` : ''}</p>
      ${read.kind === 'secret' ? '<button class="btn primary" data-act="qs-crack">🌀 Crack it in the Cipher Lab</button>' : read.href ? `<a class="btn primary" href="${esc(read.href)}">Go to ${esc(read.go || 'it')} →</a>` : ''}</section>` : ''}
    <section class="panel">
      <nav class="tabs">${Object.entries(KINDS).map(([k, x]) => `<button class="${q.kind === k ? 'on' : ''}" data-act="qs-kind" data-k="${k}">${x.e} ${x.name}</button>`).join('')}</nav>
      <div class="qs-grid">
        <div class="qs-form">
          ${q.kind === 'message' ? `<label class="field">Your message <span class="muted small" id="qs-count">${bytes(q.text)}/213</span><textarea data-qs="text" rows="3" maxlength="213">${esc(q.text)}</textarea></label>
            <p class="muted small">Any phone camera can read it too.</p>` : ''}
          ${q.kind === 'emoji' ? `<div class="field">Your emoji message<div class="qs-emoji-out">${esc(q.text) || '<span class="muted">tap some emoji</span>'}</div></div>
            <div class="cl-emoji-pad light">${EMOJI.map((e) => `<button data-act="qs-emoji" data-e="${e}">${e}</button>`).join('')}<button data-act="qs-emoji-del">⌫</button></div>
            <p class="muted small">Phone cameras show the emoji. (The barcode scanner can only type letters, so it can't read these.)</p>` : ''}
          ${q.kind === 'secret' ? `<label class="field">Secret message<textarea data-qs="text" rows="2" maxlength="120">${esc(q.text)}</textarea></label>
            <div class="row">${['caesar', 'backwards', 'numbers'].map((k) => `<button class="btn ${q.cipher === k ? 'primary' : ''}" data-act="qs-cipher" data-k="${k}">${CIPHERS[k].emoji} ${CIPHERS[k].name}</button>`).join('')}</div>
            ${q.cipher === 'caesar' ? `<div class="row"><span>Wheel turned</span><button class="btn" data-act="qs-shift" data-d="-1">−</button><b>${q.shift}</b><button class="btn" data-act="qs-shift" data-d="1">+</button></div>` : ''}
            <p class="muted small">In code: <code id="qs-coded">${esc(encode(q.cipher, q.text.toUpperCase(), q.shift))}</code>. Scanning it opens Spy HQ's Cipher Lab to crack it.</p>` : ''}
          ${q.kind === 'link' ? `<div class="field">Scanning this code opens…<div class="row">${LINKS.map(([k, n]) => `<button class="btn ${q.link === k ? 'primary' : ''}" data-act="qs-link" data-k="${k}">${n}</button>`).join('')}</div></div>
            <p class="muted small">Stick it on a door or a toy box: scan it to jump straight there.</p>` : ''}
          ${q.kind === 'wifi' ? (ui.pin ? `<label class="field">Network name<input data-qs="ssid" value="${esc(q.ssid)}" autocomplete="off"></label>
            <label class="field">Password<input data-qs="pass" value="${esc(q.pass)}" autocomplete="off"></label>
            <p class="muted small">Guests point their phone camera at it to join. The password is printed on the card too.</p>`
            : '<p>Wi-Fi cards hold the password, so a grown-up needs to unlock ⚙️ Setup first.</p><a class="btn" href="#/setup">⚙️ Setup</a>') : ''}
          <label class="field">Caption <span class="muted small">(printed above the code)</span><input data-qs="caption" value="${esc(q.caption)}" maxlength="60" placeholder="${esc(captionFor({ ...q, caption: '' }) || 'Scan me!')}"></label>
          <div class="row">
            <button class="btn" data-act="qs-big" ${c ? '' : 'disabled'}>🖥️ Show it big</button>
            <button class="btn" data-act="qs-save" ${c ? '' : 'disabled'}>💾 Save</button>
            <button class="btn primary" data-act="qs-print" ${c ? '' : 'disabled'}>🖨️ Print</button>
          </div>
        </div>
        <div class="qs-preview" id="qs-preview">${preview()}</div>
      </div>
    </section>
    <section class="panel">
      <h3>🖼️ Saved codes</h3>
      ${(S.qrCodes || []).length ? `<div class="qs-gallery">${[...S.qrCodes].reverse().map((x) => `<div class="qs-card">
          <div class="qs-mini">${(() => { try { return qrSvg(x.text); } catch { return ''; } })()}</div>
          <b>${esc(x.emoji)} ${esc(x.caption || KINDS[x.kind]?.name || 'Code')}</b>
          <div class="row" style="justify-content:center"><button class="btn icon" data-act="qs-g-big" data-id="${x.id}" aria-label="Show big">🖥️</button>
            <button class="btn icon" data-act="qs-g-print" data-id="${x.id}" aria-label="Print">🖨️</button>
            <button class="btn icon danger" data-act="qs-g-del" data-id="${x.id}" aria-label="Remove">🗑️</button></div></div>`).join('')}</div>`
        : '<p class="muted">Nothing saved yet. Make a code and tap 💾 Save.</p>'}
      <p class="muted small">📖 To read a QR code, just scan it while this screen is open.</p>
    </section>
  </div>`;
}

export function qrInput(e) {
  const k = e.target.dataset.qs;
  if (!k) return;
  const q = st();
  q[k] = e.target.value;
  if (k === 'text' && q.kind === 'message' && bytes(q.text) > 213) { toast('That is as long as a QR code gets here'); }
  const p = document.getElementById('qs-preview'); if (p) p.innerHTML = preview();
  const n = document.getElementById('qs-count'); if (n) n.textContent = `${bytes(q.text)}/213`;
  const cd = document.getElementById('qs-coded'); if (cd) cd.textContent = encode(q.cipher, q.text.toUpperCase(), q.shift);
}

// Full-screen code, to scan off the tablet.
function showBig(text, caption) {
  openModal({
    render: () => `<div class="sheet qs-big" data-act="close">
      ${caption ? `<h2>${esc(caption)}</h2>` : ''}${qrSvg(text, { label: caption || text })}<p class="muted center">Tap to close</p></div>`,
  });
}

function slipFor(text, caption, kind, emoji) {
  return { title: caption || 'QR code', parts: [
    ...(emoji ? [emojiImage(emoji, 88)] : []),
    ...(caption ? [{ t: 'text', s: caption, size: 2, bold: true, align: 'center' }] : []),
    { t: 'qr', data: text, size: 8 },
    ...(kind === 'message' ? [{ t: 'text', s: text, align: 'center' }] : []),
    ...(kind === 'emoji' ? [textImage(text, { size: 40 })] : []),
    ...(kind === 'wifi' ? [{ t: 'text', s: `Network: ${st().ssid}`, align: 'center' }, { t: 'text', s: `Password: ${st().pass}`, bold: true, align: 'center' }] : []),
    ...(kind === 'link' ? [{ t: 'text', s: 'Scan me with the Kids Hub scanner', align: 'center' }] : []),
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// While QR Studio is open, a scan is read out here.
export function qrScan(info) {
  ui.qsRead = info;
  sfx.pop(); render(); window.scrollTo(0, 0);
  return true;
}

export const qrActions = {
  'qs-kind'(el) {
    const q = st(); q.kind = el.dataset.k;
    if (q.kind === 'emoji' && /[A-Za-z]/.test(q.text)) q.text = '🦄🌈⭐';
    if (q.kind !== 'emoji' && !/[A-Za-z0-9]/.test(q.text)) q.text = q.kind === 'secret' ? 'MEET AT THE SWINGS' : 'Hello from the Kids Hub!';
    render();
  },
  'qs-emoji'(el) { const q = st(); if (bytes(q.text + el.dataset.e) <= 213) q.text += el.dataset.e; sfx.pop(); render(); },
  'qs-emoji-del'() { const q = st(); const seg = [...new Intl.Segmenter().segment(q.text)].map((x) => x.segment); seg.pop(); q.text = seg.join(''); render(); },
  'qs-cipher'(el) { st().cipher = el.dataset.k; render(); },
  'qs-shift'(el) { const q = st(); q.shift = ((q.shift + Number(el.dataset.d) - 1 + 25) % 25) + 1; render(); },
  'qs-link'(el) { st().link = el.dataset.k; render(); },
  'qs-big'() { const c = content(); if (c) showBig(c, captionFor()); },
  'qs-print'() { const q = st(); const c = content(); if (c) printModal(slipFor(c, captionFor(), q.kind, null), { title: '🔳 Print QR code' }); },
  async 'qs-save'() {
    const q = st(); const c = content(); if (!c) return;
    await api('POST', '/api/qr', { kind: q.kind, text: c, caption: captionFor(), emoji: KINDS[q.kind].e }, { pin: q.kind === 'wifi' });
    await loadAll(); render(); toast('Saved 💾');
  },
  'qs-read-x'() { ui.qsRead = null; render(); },
  'qs-crack'() { const r = ui.qsRead; if (r?.secret) import('../spy/cipher.js').then((m) => m.loadSecret(r.secret)); },
  'qs-g-big'(el) { const x = S.qrCodes.find((y) => y.id === el.dataset.id); if (x) showBig(x.text, x.caption); },
  'qs-g-print'(el) { const x = S.qrCodes.find((y) => y.id === el.dataset.id); if (x) printModal(slipFor(x.text, x.caption, x.kind === 'wifi' ? 'saved' : x.kind, null), { title: '🔳 Print QR code' }); },
  async 'qs-g-del'(el) {
    const x = S.qrCodes.find((y) => y.id === el.dataset.id); if (!x) return;
    if (!(await askConfirm(`Remove “${x.caption || 'this code'}”?`, { yes: '🗑️ Remove', danger: true }))) return;
    await api('DELETE', `/api/qr/${x.id}`, undefined, { pin: x.kind === 'wifi' }); await loadAll(); render();
  },
};
