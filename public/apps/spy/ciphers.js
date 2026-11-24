// Secret codes for Spy HQ: cipher wheel (Caesar shift), backwards alphabet, number code and
// emoji code. Plain functions, so the Cipher Lab, missions and printing all agree.

export const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const CIPHERS = {
  caesar: { name: 'Cipher wheel', emoji: '🌀', tip: 'Every letter moves along the alphabet. Turn the wheel to set how far.' },
  backwards: { name: 'Backwards alphabet', emoji: '🔁', tip: 'A swaps with Z, B with Y, C with X…' },
  numbers: { name: 'Number code', emoji: '🔢', tip: 'A is 1, B is 2, C is 3… all the way to Z is 26.' },
  emoji: { name: 'Emoji code', emoji: '😺', tip: 'Every letter is a picture: A is for 🍎 apple, B is for 🐻 bear…' },
};
// A is for apple, B is for bear… so the key is easy to remember.
export const EMOJI_KEY = ['🍎', '🐻', '🐱', '🐶', '🥚', '🐸', '🍇', '🎩', '🍦', '🧃', '🪁', '🦁', '🌙', '🥜', '🐙', '🐧', '👑', '🌈', '⭐', '🌮', '☂️', '🎻', '🐳', '❌', '🪀', '🦓'];
const strip = (e) => e.replace(/️/g, '');
const EMOJI_INDEX = new Map(EMOJI_KEY.map((e, i) => [strip(e), i]));

const mod = (n, m) => ((n % m) + m) % m;

function shiftLetters(text, shift) {
  return text.replace(/[A-Za-z]/g, (ch) => {
    const up = ch.toUpperCase();
    const out = ABC[mod(ABC.indexOf(up) + shift, 26)];
    return ch === up ? out : out.toLowerCase();
  });
}
const backwards = (text) => text.replace(/[A-Za-z]/g, (ch) => {
  const up = ch.toUpperCase();
  const out = ABC[25 - ABC.indexOf(up)];
  return ch === up ? out : out.toLowerCase();
});

// Number code: letters in a word joined by dashes, words by spaces. "HI MOM" → "8-9 13-15-13".
const toNumbers = (text) => text.toUpperCase().split(/(\s+)/).map((w) => (/\s/.test(w) ? ' ' : [...w].map((c) => (ABC.includes(c) ? ABC.indexOf(c) + 1 : c)).join('-'))).join('').replace(/ +/g, ' ').trim();
const fromNumbers = (text) => text.trim().split(/\s+/).map((w) => w.split('-').map((p) => (/^\d+$/.test(p) && +p >= 1 && +p <= 26 ? ABC[+p - 1] : p)).join('')).join(' ');

const toEmoji = (text) => [...text.toUpperCase()].map((c) => (ABC.includes(c) ? EMOJI_KEY[ABC.indexOf(c)] : c)).join('');
function fromEmoji(text) {
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter().segment(text)].map((s) => s.segment) : [...text];
  return seg.map((g) => { const i = EMOJI_INDEX.get(strip(g)); return i === undefined ? g : ABC[i]; }).join('');
}

export function encode(cipher, text, shift = 3) {
  if (cipher === 'caesar') return shiftLetters(text, shift);
  if (cipher === 'backwards') return backwards(text);
  if (cipher === 'numbers') return toNumbers(text);
  if (cipher === 'emoji') return toEmoji(text);
  return text;
}
export function decode(cipher, text, shift = 3) {
  if (cipher === 'caesar') return shiftLetters(text, -shift);
  if (cipher === 'backwards') return backwards(text);
  if (cipher === 'numbers') return fromNumbers(text);
  if (cipher === 'emoji') return fromEmoji(text);
  return text;
}

// What goes in a printed secret message's QR code: SPY:<CIPHER>:<message>. The scanner types it
// like a keyboard, so emoji (which it can't type) travel as letters moved 13 places.
export function qrFor(cipher, secret) {
  const body = cipher === 'emoji' ? shiftLetters(fromEmoji(secret), 13) : secret;
  return `SPY:${cipher.toUpperCase()}:${body.toUpperCase()}`;
}
export function fromQr(cipher, body) {
  return cipher === 'emoji' ? toEmoji(shiftLetters(body, 13)) : body;
}
