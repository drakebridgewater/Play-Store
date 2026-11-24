// Spy HQ slips for the receipt printer: badges, certificates, secret messages, key cards,
// clue cards and mission logs.
import { emojiImage, photoImage, textImage } from '../../lib/print.js';
import { ABC, CIPHERS, EMOJI_KEY, encode, qrFor } from './ciphers.js';

const clock = (s) => `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
const top = (label) => [{ t: 'text', s: 'SPY HQ', bold: true, invert: true, align: 'center' }, { t: 'text', s: label, size: 2, bold: true, align: 'center' }];

export async function badgeSlip(agent) {
  let pic;
  try { pic = agent.photo ? await photoImage(agent.photo, 200) : emojiImage(agent.emoji || '🕵️', 160); } catch { pic = emojiImage('🕵️', 160); }
  return { title: `Badge: ${agent.codename}`, parts: [
    ...top('AGENT BADGE'), { t: 'text', s: 'TOP SECRET', align: 'center' }, { t: 'rule', ch: '=' },
    pic,
    { t: 'text', s: `Agent ${agent.codename}`, size: 2, bold: true, align: 'center' },
    { t: 'text', s: `Agent number ${agent.number}`, align: 'center' },
    { t: 'qr', data: `KH-A-${agent.id.toUpperCase()}`, size: 7 },
    { t: 'text', s: 'Scan at Spy HQ to log in. If found, return to HQ!', align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

export function certificateSlip({ agentName, guesses, seconds, rank, level, length }) {
  return { title: 'Code Breaker certificate', parts: [
    ...top('CODE CRACKED!'), { t: 'rule', ch: '*' },
    { t: 'text', s: 'This certifies that', align: 'center' },
    { t: 'text', s: agentName, size: 2, bold: true, align: 'center' },
    { t: 'text', s: `cracked a ${length}-symbol ${level} code in ${guesses} guess${guesses === 1 ? '' : 'es'} (${clock(seconds)}).`, align: 'center' },
    { t: 'text', s: `RANK: ${rank.toUpperCase()}`, size: 2, bold: true, align: 'center' },
    { t: 'rule', ch: '*' },
    { t: 'text', s: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// The secret code for Code Breaker, to fold over and check at the end.
export function sealedSlip(names) {
  return { title: 'Sealed code', parts: [
    ...top('SEALED CODE'),
    { t: 'text', s: 'DO NOT OPEN UNTIL YOU CRACK IT!', bold: true, align: 'center' },
    { t: 'feed', n: 6 }, { t: 'text', s: '- - - - fold here - - - -', align: 'center' }, { t: 'feed', n: 2 },
    ...names.map((n, i) => ({ t: 'text', s: `${i + 1}. ${n}`, size: 2, bold: true })),
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// A secret message: the coded text (as a picture for emoji code) and a QR code to scan back in.
export function secretSlip(cipher, secret, from) {
  const c = CIPHERS[cipher];
  return { title: 'Secret message', parts: [
    ...top('SECRET MESSAGE'), { t: 'text', s: `Code: ${c.name}`, align: 'center' }, { t: 'rule', ch: '=' },
    cipher === 'emoji' ? textImage(secret, { size: 40 }) : { t: 'text', s: secret, size: 2, bold: true, align: 'center' },
    { t: 'rule', ch: '=' },
    ...(from ? [{ t: 'text', s: `From: Agent ${from}`, align: 'center' }] : []),
    { t: 'qr', data: qrFor(cipher, secret), size: 5 },
    { t: 'text', s: 'Scan me in the Cipher Lab to decode', align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}

// A decoder key card for one cipher.
export function keySlip(cipher, shift = 3) {
  const c = CIPHERS[cipher];
  const parts = [...top('DECODER KEY'), { t: 'text', s: c.name, bold: true, align: 'center' }, { t: 'rule', ch: '=' }];
  const pairs = [...ABC].map((L) => [L, cipher === 'emoji' ? EMOJI_KEY[ABC.indexOf(L)] : encode(cipher, L, shift)]);
  if (cipher === 'emoji') {
    for (let k = 0; k < 26; k += 7) parts.push(textImage(pairs.slice(k, k + 7).map(([L, e]) => `${L}${e}`).join(' '), { size: 34 }));
  } else {
    if (cipher === 'caesar') parts.push({ t: 'text', s: `Wheel turned ${shift}`, align: 'center' });
    for (let k = 0; k < 26; k += 13) {
      const row = pairs.slice(k, k + 13);
      parts.push({ t: 'text', s: row.map(([L]) => L.padEnd(3)).join(''), bold: true }, { t: 'text', s: row.map(([, e]) => String(e).padEnd(3)).join('') }, { t: 'feed', n: 1 });
    }
    parts.push({ t: 'text', s: 'Top row: real letter. Bottom row: secret code.', align: 'center' });
  }
  parts.push({ t: 'feed', n: 1 }, { t: 'cut' });
  return { title: `Key: ${c.name}`, parts };
}

// Clue cards to hide around the house. The clue itself isn't printed: scan the card to read it.
export function clueCardSlips(mission, perSlip = 3) {
  const cards = mission.clues.map((c, i) => [
    { t: 'text', s: 'SPY HQ', bold: true, invert: true, align: 'center' },
    { t: 'text', s: i === 0 ? 'START HERE' : 'SECRET CLUE', size: 2, bold: true, align: 'center' },
    { t: 'qr', data: `KH-X-${c.id.toUpperCase()}`, size: 7 },
    { t: 'text', s: 'Scan me at Spy HQ', align: 'center' },
    { t: 'text', s: `${mission.name} - card ${i + 1} of ${mission.clues.length}${i === 0 ? ' - give this one to the agent' : c.spot ? ` - hide: ${c.spot}` : ''}`, align: 'center' },
    { t: 'cut' },
  ]);
  const slips = [];
  for (let k = 0; k < cards.length; k += perSlip) slips.push({ title: `Clue cards ${k / perSlip + 1}`, parts: cards.slice(k, k + perSlip).flat() });
  return slips;
}

export function missionLogSlip({ mission, agentName, seconds, clues }) {
  return { title: 'Mission log', parts: [
    ...top('MISSION COMPLETE'), { t: 'rule', ch: '=' },
    { t: 'row', left: 'Mission', right: mission },
    { t: 'row', left: 'Agent', right: agentName },
    { t: 'row', left: 'Clues found', right: String(clues) },
    { t: 'row', left: 'Time', right: clock(seconds) },
    { t: 'rule', ch: '=' },
    { t: 'text', s: 'Excellent work, agent. HQ is proud of you.', align: 'center' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}
