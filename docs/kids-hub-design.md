# 🧒 Kids Hub: design

The Play Store becomes one app in a **Kids Hub**: a tablet-style home screen of pretend-play apps that share people, play money, a Bluetooth scanner and a network receipt printer.

Status: **phases 1–6 are built** (hub and code split, printer, scanner and codes, store with scan and print, Spy HQ, Scanner / QR Studio / Adding Machine). Everything else is still design. Build order is at the bottom.

**Hardware it's designed for**
- **Scanner:** Bluetooth, 2D (reads QR codes and barcodes). Paired to the tablet, it acts as a keyboard: it types the code, then presses Enter.
- **Receipt printer:** network ESC/POS, 80 mm paper. It's an Epson TM-T88V: 512 dots across at 180 dpi, 42 characters a line in the normal font (other 80 mm printers are usually 576 dots, 48 characters). The **server** prints to it over TCP port 9100, so any device in the house can print.

---

## 1. Principles
1. **Same stack.** One Node container, zero npm dependencies, one `db.json`. Everything here can be written with `node:net`, `node:http` and plain browser JavaScript.
2. **Everything printed can be scanned.** Receipts, cards, tickets, labels and clue cards all carry a code that does something when it's scanned.
3. **The Bank is the money.** Every app that charges or pays uses the existing accounts, cards and cash tray. No second currency.
4. **Kids run it, grown-ups set it up.** Making things and playing need no PIN. Settings, rewards that add money, printer limits and deleting other people's things do.
5. **The printer is a bonus.** Every print has an on-screen paper preview, so all of this still works when the printer is off or out of paper.
6. **Scanned codes are just lookups.** A code never holds a PIN or a balance. Scanning a debit card picks the card, and its PIN is still asked for.

---

## 2. The hub

`#/` becomes an app grid. Each app is a big tile with its own color, like the current home buttons.

| Tile | Kind | Route |
|---|---|---|
| 🏪 Store | connected | `#/store` lobby, then the existing `#/cashier/:id` and `#/orders/:id` screens |
| 🏦 Bank | shared | `#/bank` |
| 🙂 People | shared | `#/people` |
| 📚 Library | connected | `#/library` |
| 📦 Post Office | connected | `#/post` |
| 🎟️ Box Office | connected | `#/tickets` |
| 🔍 Scanner | standalone | `#/scanner` |
| 🔳 QR Studio | standalone | `#/qr` |
| 🧮 Adding Machine | standalone | `#/calc` |
| 🕵️ Spy HQ | standalone | `#/spy` |
| ⚙️ Setup | grown-ups | `#/setup` (a small ⚙️ button on the hub, not a tile) |

- A status strip at the top of the hub shows 🔫 *scanner heard* (lights up on every scan) and 🖨️ *printer ready / out of paper / off*.
- Setup → **Home screen** picks which tiles show, so new apps can be hidden until they're ready. (Built. Reordering tiles is not built yet.)
- Scanning on the hub opens a **"What is this?"** card (see 3.2), with a button to jump to the app it belongs to.

---

## 3. Shared services

### 3.1 People and member cards
People stay as they are. Each person also gets a **member card**: one printed card with their photo, name and QR code. The same card is their library card, store loyalty card, box-office ID and post-office return address.

- Printed on the receipt printer: the photo is dithered to black and white, with the name in big letters and a QR code. It's sized like a bank card (about 54 mm wide), so it can be cut out and glued to cardboard or laminated.
- Scanning a member card: in the Store it picks the customer, in the Library it starts a checkout, in the Box Office it finds their tickets.

### 3.2 Scan service (`public/lib/scan.js`)
**Telling a scan from typing.** A scanner types a whole code in a few milliseconds and ends with Enter. A person can't type that fast.
- A keydown listener on `window` (capture phase) groups keys into a burst (a pause over 100 ms starts a new one, or over 250 ms once the burst is clearly a scan, because Bluetooth sends keys in packets). Three or more characters averaging under 35 ms apart and ending in Enter or Tab count as a scan; so do 8 or more with no Enter, after a short pause.
- When a text box has focus, the first two characters land in it before the burst is recognized. From the third fast character on, the service holds characters back; when the scan finishes it removes the two that leaked. If the burst turns out not to be a scan (a fast typist), the held characters are put back. The scan's Enter is swallowed so it never submits a form. Text boxes that *want* a scan (for example the barcode field in Setup) set `data-scan="accept"` and keep the text.
- Each scan plays a beep (Web Audio, no files) and flashes the status strip.
- The "What is this?" card is its own layer above modals, so a scan never throws away a half-finished form or payment.

**Dispatch.** `GET /api/codes?c=<code>` (built, `server/codes.js`) asks the server what a code is, and returns `{kind, id, app, label, …}` or `{kind: 'product', format: 'ean13', …}` for real products.
1. The open app gets first chance (`onScan(info)`). The Library, for example, handles books and member cards.
2. If it doesn't want it, the "What is this?" card shows the label, a picture and a **Go to …** button.
3. If nothing knows the code, the card says "New code!" and offers what you can do with it: add it to the store, add it as a library book, or just look at it in Scanner.

### 3.3 Code formats
Our own codes are short, uppercase and built only from characters that type the same on any keyboard layout.

| Code | Means | Printed as |
|---|---|---|
| `KH-P-<id>` | person (member card) | QR |
| `KH-C-<id>` | debit card (never the PIN) | QR |
| `KH-R-<id>` | receipt (returns) | QR |
| `KH-K-<id>` | kitchen ticket | QR |
| `KH-I-<id>` | store item (price tag) | Code 128 barcode |
| `KH-U-<id>` | coupon | QR |
| `KH-B-<id>` | library book with no ISBN | Code 128 |
| `KH-M-<id>` | parcel tracking number | QR |
| `KH-L-<id>` | place (a room's door sign) | QR |
| `KH-T-<id>` | event ticket | QR |
| `KH-A-<id>` | spy agent badge | QR |
| `KH-X-<id>` | mission clue card | QR |
| `KH-Q-<id>` | saved QR Studio code | QR |
| digits, 8, 12 or 13 long | real product: EAN-8, UPC-A, EAN-13 | — |
| 978… / 979… | book (ISBN) | — |
| anything else | free text (e.g. a QR from QR Studio) | — |

IDs use the existing `newId()` (10 hex characters), uppercased on print and lowercased on lookup.

### 3.4 Print service

**Server (`printer.js`)**
- A tiny **ESC/POS writer**: reset, align, bold, size (1×–4×), underline, line feed, cut, **native QR** (`GS ( k`), **native Code 128** (`GS k 73`) with human-readable text underneath, and **raster images** (`GS v 0`). The printer draws QR codes and barcodes itself, so the server doesn't need an encoder for those.
- A **print queue**: one job at a time, sent over a raw TCP socket to `PRINTER_HOST:PRINTER_PORT` with a 5-second timeout. A failed job goes back to the sender as "Printer is off or out of paper" and is dropped. It isn't retried later, which avoids a surprise pile of receipts.
- **Status:** a real-time status query (`DLE EOT`) every 30 s and before each job tells us online, cover open and paper out. It's broadcast over the existing Server-Sent Events.
- The address is set in Setup → Receipt printer, or with `PRINTER_HOST` / `PRINTER_PORT` in `docker-compose.yml`. Paper (80 mm · 48 letters, 80 mm · 42 letters for Epson TM-T88, or 58 mm · 32 letters) is a Setup choice that sets the dots and characters per line. With no address, printing is off (preview only).
- Give the printer a fixed DHCP address. The container already reaches the LAN through Docker's default NAT.

**One "slip" format for preview and paper.** The browser builds a slip as JSON. The same JSON draws the on-screen paper preview and becomes ESC/POS on the server.
```json
{ "title": "Receipt #42", "parts": [
  { "t": "text", "s": "COFFEE SHOP", "size": 2, "bold": true, "align": "center" },
  { "t": "rule" },
  { "t": "row", "left": "Caffe Latte x1", "right": "$3.00" },
  { "t": "qr", "data": "KH-R-3f9a2b1c4d", "size": 6 },
  { "t": "barcode", "data": "KH-I-8c1d0e2f3a" },
  { "t": "image", "w": 384, "h": 200, "bits": "<base64 1-bit rows>" },
  { "t": "feed", "n": 2 }, { "t": "cut" } ] }
```
- **Pictures** (drawn art from `art.js`, people photos, the sandwich or drink picture) are drawn to a canvas *in the browser*, dithered to black and white (Floyd–Steinberg), and sent as 1-bit rows. The server has no image library and doesn't need one.
- **Emoji** can't be printed as text. In text parts they're dropped, or swapped for a word where it matters, and big decorative emoji are sent as images.
- `POST /api/print {slip}` returns `{ok}` or an error. `GET /api/printer` returns status and today's usage.

**Grown-up controls (Setup → Printer)**
- Printer on/off, **Test print**, and paper size (80 or 58 mm, for later).
- **Paper budget:** prints a day (default 40) and the longest slip (default 40 cm). When the limit is reached the kid sees "The printer is resting until tomorrow" and the preview still works.
- Which apps may print, and **auto-print** switches: print the receipt on every sale, print kitchen tickets automatically, and so on.

**Fun extras that come with the printer**
- Big order numbers at the top of receipts and kitchen tickets.
- A short **joke or fun fact** at the bottom of receipts (a list in `public/lib/fun.js`, which a grown-up can turn off).
- **Take a number:** a deli-style ticket dispenser (Store lobby), with a *Now Serving* screen (`#/serving`) linked from the lobby and the Orders view. One queue for the whole Store app. (Built.)
- **End-of-day report:** the shopkeeper prints today's sales, the number of orders, the best seller and the cash in the drawer.

---

## 4. Apps

Each app lists what it's for, its screens, what scanning does, what it prints, and the data it adds.

### 4.1 🏪 Store (existing, extended)
**Scanning**
- **Scan to ring up.** Items get a `barcodes` list. Scanning one adds it to the cart (same as tapping it). Real packaging works: scan a cereal box from the pantry.
- **Unknown product barcode** → "New item!" opens the existing *Add my item* form with the barcode attached. A photo of the box makes a good item picture.
- **Member card** → picks the customer. **Debit card** → jumps to card payment with that card picked, then asks for its PIN.
- **Receipt** → **Returns desk**: shows the sale, and the kid picks lines to refund. Refunds go back the way the sale was paid: the card, or cash change worked out by the tray.
- **Kitchen ticket** → moves that order to its next step (New → Making → Ready → Delivered).
- **Coupon** → applied to the cart. It's used once, and scanning it again says "Already used".
- **Price check** mode (a toggle on the cashier screen): scanning shows the item and price big, without adding it.
- (Built in phase 4: everything above except coupons. An open window that wants scans gets them first: the who-is-it-for window takes member cards, the pay window takes debit cards, the item editor takes package barcodes.)

**Printing**
- **Customer receipt:** store name, order #, customer, lines, subtotal, tax, total, paid by cash (handed over, change) or card (last 4 digits, balance left), date, return QR and the fun line.
- **Kitchen ticket:** giant order #, customer, each line, and for built items the recipe list plus the picture. It has a QR code to scan to the next step.
- **Price tags:** a strip per item with name, price (sale price crossed out) and a Code 128 barcode. Cut them apart and tape them to toys. Sticky-back 80 mm thermal paper also exists for real stickers.
- **Coupons:** make one in Setup or as the shopkeeper (amount off, % off, or a free item), print it with its QR code.

**Also**
- **Stock counts** (from the old Ideas list): items can track how many are left, and 0 shows "Sold out!". **Restock** mode: scan items to count them back in.

**Data:** `item.barcodes[]`, `item.stock?`, `orders[].refunds[]`, `coupons[] {id, storeId?, kind, value, itemId?, usedAt?}`, `takeANumber {next, serving}` per store.

### 4.2 🏦 Bank (existing, extended)
- **Print a debit card:** the card design colors become a printed outline, with the bank name, the owner's name and photo, the last 4 digits and a QR code. Scanning the card at any till picks it.
- **ATM slip:** prints after a deposit or withdrawal, with the amount and the new balance.
- **Mini statement:** the last 10 transactions.
- **Checkbook:** write a check (to someone, an amount, a "signature" typed or drawn) and print it with a QR code. Scanning it at the Bank **cashes** it: money moves from the writer to the person it's made out to, and it's declined if there isn't enough. Each check can only be cashed once.

**Data:** `checks[] {id, fromAccountId, toCustomerId, amount, memo, cashedAt?}`.

### 4.3 📚 Library
**Screens:** *Front desk* (check out and return), *Shelves* (all books, with cover photos), *Cards* (who has what), and Setup → Library.
- **Add a book:** scan its ISBN barcode, then take a cover photo and type the title (or a grown-up does). Homemade or barcode-less books get a printed `KH-B` spine label.
- **Check out:** scan a member card, then scan books. A due-date slip prints ("Please return by Thursday ☺") with the titles.
- **Return:** just scan the book. A "Thank you!" slip prints, and if it's late, it shows the fine.
- **Fines** (optional, grown-up setting): an amount per late day, paid at the desk with cash or a card. The money goes to the Library's chosen account, like the store's *Card payments go into*.
- The *Cards* screen shows each person's books and highlights late ones in red.
- **Loan length** is a setting (default 7 days). Days are real days, so the due date means something.

**Data:** `books[] {id, isbn?, code, title, author?, photo?, emoji}`, `loans[] {id, bookId, customerId, outAt, dueAt, inAt?, fine?}`, `library {loanDays, finePerDay, fineAccountId?}`.

### 4.4 📦 Post Office
**Places:** Setup → Post Office has a list of places: the rooms of the house and pretend places (Grandma's, the North Pole). Each place gets a printed **door sign** with a QR code.

**Counter:** pick *From* (scan a member card or tap a person) and *To* (a person or place). Pick a size (letter, small, big, giant), weigh it on a pretend scale (drag a dial, or tap "weigh"), and add extras (Fragile, Express, Signature). Postage is worked out from the size, weight and extras, and paid like a store sale.

**Printing:** a **shipping label** with from and to in big letters, the destination's zone letter in a big black box, extras as banners (FRAGILE ⚠), and the tracking QR code. **Stamps** can be printed as a strip of little drawn stamps.

**Tracking:** the parcel moves Accepted → Sorting → Out for delivery → Delivered. Scanning the label at the counter moves it a step.
**Mail carrier mode:** scan a parcel, walk it to the room, and scan the **door sign**. If it's the right place, it's Delivered with a cheer. If not, "Wrong house! This goes to the Kitchen."
**Track a parcel:** scan the label anywhere to see its trip as a timeline.

**Data:** `places[] {id, name, emoji, zone}`, `parcels[] {id, fromId, toId, toKind, size, weight, extras[], postage, status, events[] {at, status, placeId?}}`, `post {rates}`.

### 4.5 🎟️ Box Office
**Make a show (no PIN):** name, emoji or picture, date and time, number of seats (rows × seats, up to 8 × 10), and a price, which can be free.
**Sell tickets:** pick the customer, tap seats on a seat map, and pay through the Bank. Each ticket prints with the show, the seat, the person's name and a QR code.
**Door mode:** scan tickets at the door. ✅ "Welcome! Row B, seat 3" or ❌ "Already used", "Wrong show" or "That show was yesterday". It shows a live count of how many people are in.
**Snack bar:** link a Store as the show's snack bar so the door screen has a button to it.

**Data:** `shows[] {id, name, emoji, at, rows, seatsPerRow, price, storeId?}`, `tickets[] {id, showId, customerId, seat, paidBy, usedAt?}`.

### 4.6 🔍 Scanner
A "what is this?" machine.
- **Our codes:** a picture and description ("Ethan's library card", "Kitchen ticket for order #12"), with a button into the right app.
- **Real barcodes:** the digits in big type, the barcode type, and the **country it was registered in** (offline table of GS1 prefixes: 000–139 USA & Canada, 690–699 China, 978–979 books, and so on). It also has **check-digit detective**: step by step, it multiplies, adds and finds the last digit, then says "✅ The barcode checks out!" It's sneaky math practice.
- **QR text:** shows the text. If it's a link, it's shown but not opened.
- **Scan log:** everything scanned today, with counts ("You scanned 37 things!").
- **Prints:** a "scan report" slip for one code.

**Data:** `scanLog[]` (the last 200 scans, saved without making every tablet reload). On the Scanner and QR Studio screens, scans are shown in place and aren't picked up by other apps (no jumping to Spy HQ when a clue card is scanned there).

### 4.7 🔳 QR Studio
- **Make:** a message, an emoji picture name, a secret message (encoded with a Spy HQ cipher first), a "link" for the hub (for example *open Spy HQ*), or a Wi-Fi card for guests (grown-up only).
- **Show it** full screen to scan with the scanner, or **print** it with a big caption.
- **Read:** scan any QR code to see its text, and decode secret ones with the key.
- **Saved codes:** a gallery of what he made, each with its own `KH-Q` ID.
- Showing QR codes on screen needs an encoder in the browser: `public/lib/qr.js` (built; byte mode, versions 1–10, error correction level M, about 200 lines). Printing uses the printer's own QR. Print previews use it too, and `public/lib/code128.js` for barcodes.
- Saved codes hold the text itself (so phone cameras can read message codes), not a `KH-Q` id. Shortcut codes are `KH-G-<app>`.

**Data:** `qrCodes[] {id, kind, text, cipher?, caption, emoji, createdBy}`.

### 4.8 🧮 Adding Machine
- Big keys, + − × ÷, and a **paper tape** that scrolls up like a real adding machine: each number with its sign, then a total line with `*`.
- **Scan a price tag** or a real product that's in a store, and its price is added to the tape.
- **Money mode** shows the answer as the fewest bills and coins (the same drawings and logic as the cash tray).
- **Print the tape** on the receipt printer.
- **Data:** none saved, except the tape kept in the browser until it's cleared.

### 4.9 🕵️ Spy HQ
**Agent badge.** First visit: make an agent with a codename generator ("Agent Silver Fox") and a photo. The printed **badge** has the photo, codename, agent number and QR code. Scanning the badge at the HQ door plays a "Access granted" moment. Without a badge you can still play, and it just skips that moment.

**Code Breaker** (guess the hidden code)
- A secret code of 3–5 symbols (colors, emoji or digits), from 4–8 choices, with repeats on or off and 8–12 guesses (all settings, easy/medium/hard presets).
- After each guess: 🟢 for each symbol in the right spot, 🟡 for right symbol, wrong spot. The board shows every guess and its clues.
- **Two-player:** another person (a grown-up or a friend) types a code while the kid looks away, or prints it as a **sealed code slip** ("DO NOT OPEN UNTIL YOU WIN") to check at the end.
- **Win:** a certificate prints with the agent name, guesses, time and a rank (Rookie → Ace → Master Spy).
- **Records:** fewest guesses per difficulty, per agent.

**Cipher Lab**
- **Cipher wheel** (Caesar shift): an outer and an inner alphabet ring. Drag to turn it, and the message encodes or decodes live.
- Also: **backwards alphabet** (A↔Z), **number code** (A=1), and **emoji code** (each letter gets an emoji, from a key you can print).
- **Print a secret message** with its cipher name, but not the key, plus a QR code holding the encoded text. Scanning it in Cipher Lab loads it ready to decode.
- **Print a decoder key card** for each cipher.

**Vault**
- A big keypad safe with clicks, a dial and a door that swings open. A grown-up or the kid sets the combination and what's inside: a message, or a **Bank reward** (grown-up PIN; the opener picks a bank account and it's paid once). Pictures as prizes aren't built.
- Wrong guesses can give hints: how many numbers are in the right spot (optional). Codes are checked on the server, which waits a moment after each wrong try.

**Missions** (scavenger hunt)
- A grown-up builds a mission in Setup → Spy HQ: a name, then up to 12 clues. Each clue has a riddle or hint, an optional cipher (the clue shows up encoded, and the kid decodes it in Cipher Lab), and an optional hiding-spot note for the grown-up.
- **Print clue cards.** Each says START HERE or SECRET CLUE, with a QR code and, in small print for the grown-up, its card number and hiding spot. The clue text itself is never printed: the kid has to scan the card to read it. The grown-up hides them.
- The kid scans clue 1 → it shows the clue → he finds card 2 → and so on. Scanning out of order says "That's not your next clue, agent."
- The last card reveals the **vault code**, and the Vault holds the reward.
- **Quick mission:** pick 3–8 places from a built-in list of 16 house places (each with a rhyming riddle) plus any custom places, and Spy HQ writes the clues; every other one can be in cipher-wheel code. The Post Office can share the places list later.
- **Mission log** prints at the end: agent, time taken, clues found.

**Data:** `agents[] {id, customerId?, codename, photo?}`, `cbRecords[]`, `vaults[] {id, name, comboHash, prize {kind, text?, amount?, accountMode}, openedAt?, openedBy?}`, `missions[] {id, name, clues[] {id, text, cipher?, shift?, spot?}, vaultId?, runs[] {agentId, startedAt, found[], doneAt?}}`.

---

## 5. Grown-up controls
Setup grows one section per app. Everything here needs the PIN.
- **Hub:** which tiles show, and their order.
- **Printer:** on/off, test print, daily budget, max length, auto-print switches, fun lines on/off.
- **Store:** existing settings, plus coupons, stock and barcode linking ("scan to link" on each item).
- **Library:** loan days, fines, fine account.
- **Post Office:** places, rates, print door signs.
- **Box Office:** delete old shows.
- **Spy HQ:** missions, vault rewards.
- **Reset play data** gains checkboxes per app (loans, parcels, tickets, scan log, missions progress, Code Breaker records).

---

## 6. Code layout
Still zero dependencies. The browser loads native ES modules, so no build step.

```
server.js              storage, SSE, PIN, and (for now) every route; split out by area once new apps add routes
server/printer.js      ESC/POS writer, queue, status (built)
public/slip.js         slip format: cleaning, wrap, layout, size check; shared by browser and server (built)
server/codes.js        /api/codes lookup across all apps (built)
server/spy.js          Spy HQ routes (built)
server/apps/*.js       library, post, tickets  (each exports its routes)
public/index.html      loads app.js as type="module"
public/app.js          router and hub (built)
public/apps/registry.js  hub tiles: id, name, emoji, color, link (built)
public/lib/core.js     state, helpers, server calls, sounds, live sync, modals (built)
public/lib/cash.js     bills, coins, cash tray, PIN pad (built)
public/lib/photo.js    take or pick a photo (built)
public/lib/scan.js     scanner listener, dispatch, What is this? card (built)
public/lib/print.js    paper preview, dithering, print modal, POST /api/print (built)
public/lib/qr.js       QR encoder for on-screen codes (built)
public/lib/code128.js  Code 128 for on-screen barcodes (built)
public/lib/sound.js    beeps and cheers (Web Audio)
public/lib/fun.js      jokes and facts for receipts (built)
public/lib/gs1.js      barcode country prefixes, check digits (built)
public/apps/store/     index (lobby), cashier, orders, pay, items, common (built)
public/apps/spy/       index (HQ, agents), codebreaker, cipher, ciphers, vault, missions, admin (Setup), slips (built)
public/apps/tools/     scanner, qrstudio, calc (built)
public/apps/*.js       bank, people, setup (built); library, post, tickets
public/art.js          (existing) plus new drawings: books, parcels, stamps, safe, tickets
```
- `db.json` goes to `version: 2`. New lists start empty, existing data is untouched, and IDs keep their format.
- Each app module exports `{ views, actions, badge?, afterRender? }`. `app.js` maps each route name to its view and each `data-act` to its action, and warns in the console if two apps use the same action name.

---

## 7. Build phases
Each phase ends usable on the tablet.

| # | Phase | Done when |
|---|---|---|
| 1 ✅ | **Hub and split.** App grid, ES-module split, store lobby, old routes still work. | Everything works as today from the new home screen. |
| 2 ✅ | **Printer.** `printer.js`, slip format, paper preview, Setup → Printer with budget and test print, store receipts. | Test print and a store receipt come out of the printer, and the preview matches. (Checked against a pretend printer; QR and barcodes are placeholders in the preview until phase 6 adds the on-screen encoder.) |
| 3 ✅ | **Scanner and codes.** Scan listener, `/api/codes`, "What is this?", beeps. | Scanning anything on the hub shows a card, and scans never leak into text fields. (Tested with simulated scanner timing, including mid-code pauses; not yet with the real scanner.) |
| 4 ✅ | **Store with scan and print.** Scan to ring up, new-item-from-barcode, member and debit cards printed and scannable, receipts, kitchen tickets, returns desk, price tags, take a number, end-of-day report. | A whole pretend shop day runs with the scanner and printer. |
| 5 ✅ | **Spy HQ.** Badge, Code Breaker, Cipher Lab, Vault, Missions. | A grown-up can build a 5-clue mission that ends in the vault. (Tested end to end in the browser with simulated scans.) |
| 6 ✅ | **Standalone tools.** Scanner, QR Studio (with the on-screen QR encoder), Adding Machine. | Each works on its own with scan and print. (The QR encoder matches the `qrcode` npm package bit for bit for versions 1–10 and decodes with jsQR; Code 128 matches JsBarcode. Both libraries were used only for testing, outside the project.) |
| 7 | **Library.** | Books check out and back in with slips and optional fines. |
| 8 | **Post Office.** | A parcel goes from counter to door sign with a label and tracking. |
| 9 | **Box Office, checks, coupons, stock.** | Tickets sell and scan at the door; checks cash; coupons and stock work. |

Phases 5–9 don't depend on each other after phase 4, so they can be reordered by what he's most into.

---

## 8. Open questions
- **Printer model:** the exact ESC/POS dialect (Epson, Star in ESC/POS mode, or a generic one) affects QR size commands and the status query. A test-print page in phase 2 will show what works.
- **Sticky paper:** worth getting a roll of 80 mm sticky-back thermal paper for price tags and parcel labels?
- **Durable cards:** member, debit and badge cards on receipt paper fade over months. Laminating them works, or add a "print on a normal printer" option (letter-size sheet from the browser) later.
- **More than one kid?** Agents, records and loans already belong to people, so a sibling or friend can join without changes.
