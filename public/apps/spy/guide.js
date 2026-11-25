// 🧑‍🏫 Spy HQ guide for grown-ups: what each spy screen is, how to play it with a kid, and what to
// say to help without giving the answer away. Opened from the "Grown-ups" button on every spy screen.
import { esc, openModal, route } from '../../lib/core.js';

const GUIDES = {
  hq: {
    title: '🕵️ Spy HQ',
    what: 'Pretend secret-agent training. Four games, each practising something different: <b>Code Breaker</b> (logic), <b>Cipher Lab</b> (letters and secret codes), <b>Vaults</b> (numbers), and <b>Missions</b> (a scavenger hunt that ties them together). Nobody can lose money here, and only the Code Breaker has a clock.',
    sections: [
      ['Getting started', [
        'Make an agent: <b>🪪 Agents → ➕ New agent</b>. Roll a codename with 🎲, take a photo, and tap who it really is.',
        'The <b>badge</b> has a QR code. Scanning it anywhere in the Kids Hub logs that agent in with a big <b>ACCESS GRANTED</b> screen. Kids love this part.',
        'The agent <b>on duty</b> gets the credit: Code Breaker records and mission progress are kept per agent. Tap 🔄 Switch to change.',
      ]],
      ['A good first afternoon', [
        'Code Breaker on Easy, together, talking through each guess (see its guide).',
        'Cipher Lab: you write a secret, he cracks it. Then swap.',
        'Finish with a mission whose last clue opens a vault with a small bank reward inside.',
      ]],
      ['What needs the grown-up PIN', [
        'Building missions (⚙️ Setup → Spy HQ), and vaults with <b>money</b> inside. Everything else he can do on his own, including making vaults with a message inside.',
      ]],
    ],
  },
  codebreaker: {
    title: '🔢 Code Breaker',
    what: 'HQ hides a code (colors, animals or numbers). He guesses, and after each guess HQ answers with dots: <b>🟢 = right thing in the right spot</b>, <b>🟡 = right thing, wrong spot</b>. The dots don\'t say <i>which</i> picks they mean. That\'s the puzzle.',
    sections: [
      ['Levels', [
        '<b>Easy:</b> 3 picks from 4 choices, no repeats, 10 tries. Start here.',
        '<b>Medium:</b> 4 from 6, no repeats, 10 tries.',
        '<b>Hard:</b> 5 from 8, <b>repeats allowed</b>, 12 tries.',
      ]],
      ['How to help (without telling)', [
        'After every row, ask: <i>“What did that guess tell us?”</i> Get him to say it out loud before the next guess.',
        '<b>🟢 + 🟡 together</b> = how many of his picks are in the code at all. Two dots on Easy means one pick is wrong.',
        'Got a 🟡? Keep that thing, but <b>move it to a different spot</b>.',
        'Not sure which one earned the 🟢? <b>Change just one thing</b> and see what happens to the dots.',
        'No dots at all is great news: none of those are in the code, so cross them off.',
      ]],
      ['Playing together', [
        '<b>👥 Someone sets the code:</b> you pick the code while he looks away. <b>🧾 Print it sealed</b> makes a “do not open” slip to check at the end, so he knows you didn\'t change it.',
        'The best teacher: <b>let him set the code and you guess, thinking out loud.</b> He hears the strategy and gets to be the judge.',
        'Winning prints a certificate with his rank (Rookie → Ace → Master Spy).',
      ]],
    ],
  },
  cipher: {
    title: '🌀 Cipher Lab',
    what: 'Four secret codes for turning a message into gibberish and back. <b>🔒 Make a secret</b>: type a normal message, see it coded. <b>🔓 Crack a secret</b>: type the coded message, see the real one. ↕️ Swap flips them.',
    sections: [
      ['The four codes, easiest first', [
        '<b>😺 Emoji code:</b> every letter is a picture of something starting with that letter (A = 🍎 apple, B = 🐻 bear…). Great for kids who are still reading.',
        '<b>🔁 Backwards alphabet:</b> A swaps with Z, B with Y, C with X…',
        '<b>🔢 Number code:</b> A = 1, B = 2 … Z = 26. Letters are joined by dashes and words split by spaces: HI MOM = 8-9 13-15-13.',
        '<b>🌀 Cipher wheel:</b> every letter moves the same number of steps along the alphabet. ◀ ▶ turn the wheel. To crack a message you need to know how far it was turned. Clues always tell you.',
      ]],
      ['How to help', [
        'The app shows the answer instantly, so the learning happens <b>on paper</b>. Print a <b>🗝️ key card</b> (or send it to your phone) and have him crack the first few letters by hand before he checks with the app.',
        'Keep messages short and fun: <b>HI</b>, <b>PIZZA</b>, <b>LOOK UNDER THE SINK</b>.',
        'On the wheel, ask: <i>“If A moved 3 steps, where did it land? So to go back…?”</i>',
      ]],
      ['Games', [
        'You make a secret and <b>🖨️ print</b> it (or send it to someone\'s phone). The printed message has a QR code: scanning it in the Cipher Lab loads it ready to crack. Then he makes one for you.',
        'Missions use these codes. A coded clue says which code (and how far the wheel turned), and <b>🌀 Crack it in the Cipher Lab</b> opens it ready to go.',
      ]],
    ],
  },
  vault: {
    title: '🔐 Vaults',
    what: 'A safe with a number code. Type the right code and the door swings open to show what\'s inside: a secret message, or play money for his bank account.',
    sections: [
      ['Making one', [
        '<b>➕ Make a vault:</b> a name, a picture, the code (3 or more numbers), and the secret message inside. He can make these himself to hide messages for you.',
        '<b>🔥 Give hints:</b> after a wrong try, the vault says how many numbers are in the right spot. Leave it on for kids.',
        '<b>Money inside</b> needs the grown-up PIN. Whoever opens it picks a bank account and it\'s paid once.',
        'A vault he made with a message inside can be <b>🔒 locked again</b> to play again.',
      ]],
      ['How to help', [
        'With hints on it\'s the same thinking as Code Breaker: <b>change one number at a time</b> and watch the 🔥 count go up or down.',
        'Each wrong try makes HQ pause for a moment, so random guessing is slow on purpose. Thinking is faster.',
        'Make the code the answer to a question: <i>“How many people are in the beach house?”</i>, a birthday, or the number of shells he found.',
      ]],
    ],
  },
  missions: {
    title: '🗺️ Missions',
    what: 'A scavenger hunt. Each clue card has a QR code, and the clue itself is <b>not printed</b>, so he has to scan the card to read it. The clue leads to where the next card is hidden. The last clue can give the code to a vault with a reward inside.',
    sections: [
      ['Setting one up (⚙️ Setup → Spy HQ)', [
        '<b>⚡ Quick mission:</b> pick 3–8 hiding spots in order from a list of house places (each comes with a rhyming riddle), plus any of your own. Every other clue can be in wheel code. The fastest way to start.',
        '<b>➕ New mission:</b> write up to 12 clues yourself, pick a code for each, and note each hiding spot. The note prints in tiny letters on the card, so you remember where it goes.',
        'Link a <b>vault</b> for the finale, with a message or a money reward inside.',
        'Print the clue cards and hide them in order. Card 1 says <b>START HERE</b>: just hand it to him.',
      ]],
      ['No printer? Use people instead of places', [
        'In the print window for the clue cards, tap <b>📲 → 🃏 One per phone</b> and give each card to a different person. Each card shows up on that person\'s phone under 📱 My stuff.',
        'Then write the clues about people (<i>“Find the agent who makes the coffee”</i>). He hunts down each person and scans the code on their phone. This works great in a full house.',
        'Or print a couple of missions at home before the trip and pack the cards.',
      ]],
      ['While he plays', [
        'He scans a card on the tablet → reads the clue → goes looking. Scanning out of order says <i>“That\'s not your next clue, agent.”</i> Progress is saved per agent.',
        'Read riddles together and ask <i>“What in the house is like that?”</i> rather than pointing.',
        'Coded clues: he cracks them in the Cipher Lab first. Help with the first letter, then let him go.',
        'Hide the first cards somewhere easy and visible, then get trickier. At the end, <b>🧾 print the mission log</b> with his time.',
      ]],
    ],
  },
  agents: {
    title: '🪪 Agents',
    what: 'Everyone can have a secret agent: a codename, a spy face or photo, and an agent number.',
    sections: [
      ['Tips', [
        '<b>Who is it, really?</b> links the agent to a person. Then the badge can go to that person\'s phone, and grown-ups can play agent too.',
        'The <b>🪪 Badge</b> QR code logs the agent in from anywhere in the Kids Hub. A badge on a grown-up\'s phone works too: hold it up to the scanner.',
        'Each agent\'s best Code Breaker scores show on their card.',
      ]],
    ],
  },
};

export function guideButton() {
  return '<button class="btn" data-act="spy-guide">🧑‍🏫 <span>Grown-ups</span></button>';
}

export function guideModal(topic = route().a || 'hq') {
  const g = GUIDES[topic] || GUIDES.hq;
  const others = Object.entries(GUIDES).filter(([k]) => k !== topic && GUIDES[topic]);
  openModal({
    render() {
      return `<div class="sheet spy-guide">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>🧑‍🏫 ${g.title}: for grown-ups</h2>
        <p>${g.what}</p>
        ${g.sections.map(([h, items]) => `<h3>${esc(h)}</h3><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`).join('')}
        <div class="row">${others.map(([k, x]) => `<button class="btn" data-act="topic" data-k="${k}">${x.title}</button>`).join('')}</div>
      </div>`;
    },
    act(a, el) { if (a === 'topic') guideModal(el.dataset.k); },
  });
}
