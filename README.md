---
tags: [homelab, ethan, self-hosted]
---
# 🧒 Kids Hub (Play Store POS)

A home screen of pretend-play apps for kids. The first apps are the **Store** (multiple mini stores, a cashier screen, play-money checkout and a kitchen order queue), the **Bank** and **People**, and they all sync across devices. More apps are planned in [docs/kids-hub-design.md](docs/kids-hub-design.md).

- **Stack:** one Node 22 container with **zero npm dependencies**. Data is a single `db.json` file in `/data`. The browser code is plain ES modules with no build step.
- **Offline / local:** no cloud, no accounts, no subscriptions. (The one exception is optional: looking up what a scanned book or product is, which needs internet and just doesn't fill anything in without it.)
- **Devices:** works in any browser and is tablet-first. On Android, use Chrome ⋮ → *Add to Home screen* for a full-screen app.

## Home screen
The home screen is a grid of app tiles (Store, Bank, People, Library, Post Office, Box Office, Spy HQ, Scanner, QR Studio, Adding Machine) with a greeting and the time. The Store tile shows a red badge with the number of open kitchen orders. The small ⚙️ in the corner opens **Setup**.

In **Setup → Home screen** a grown-up can hide any app tile. A hidden app still works if you go to it another way, for example from a bookmark.

Tapping **Store** opens the store lobby: one big button per store (opens its register), **Kitchen orders**, and the counter tools: **🎟️ Take a number**, **📣 Now serving** and **📊 Today's report**. The old `#/cashier` and `#/orders` links still work.

### Scanning and printing at the store
- **Ring things up by scanning:** printed price tags (Setup → edit a store → **🏷️ Price tags**) and real packages linked to an item. Scanning a package nobody sells yet opens **📦 New item!** with its barcode attached and looks it up online: the name and a picture of the box fill themselves in when it's found (otherwise take a photo and name it), then price it, and from then on it scans. A **🔎 What is it?** button under the barcodes looks it up again. Grown-ups can link more barcodes in Setup → item → 📦 Barcodes (scan while the item is open, or type one).
- **🔍 Price check** (button on the register): scanning shows the price big without adding it.
- **Member cards** (People → a person → **🪪 Member card**): scanning one at the register picks who the order is for.
- **Paper debit cards** (Bank → account → card → **🖨️ Print**): ring things up, then scan the card to pay. Its PIN is still asked for.
- **Receipts → ↩️ Returns desk:** scan a receipt's QR code anywhere in the Store app, pick what's coming back, and the money goes back the way it was paid (onto the card, or the app shows which bills and coins to hand back). There's a printable return slip.
- **Kitchen tickets:** printed automatically for each kitchen order if Setup → Receipt printer → **Print a kitchen ticket automatically** is on, or with 🎫 on any order card. They show the order number big, who it's for, each thing to make and a picture of custom drinks and sandwiches. Scanning a ticket moves its order along (New → Making → Ready → Delivered).
- **🎟️ Take a number / 📣 Now serving:** a deli-style ticket with a big number, and a counter screen every tablet shows the same way. **Next, please!** rings a bell.
- **📦 Stock:** in Setup → edit a store → an item → **Count them**, set how many are on the shelf. The register shows "3 left", sales count down, and at 0 the tile says **Sold out!** and can't be added. Cancelled sales and returns put things back. **📦 Restock** (a register button) lets the shopkeeper tap or scan items to count one more onto the shelf.
- **🎟️ Coupons:** the register's **🎟️ Coupons** button makes money-off, percent-off or free-item coupons (for this store or any store) and prints them with a QR code. Scan one at the register and the discount shows in the cart and on the receipt (tax is worked out after the discount). Each coupon works once ("That coupon was already used"); cancelling the sale makes it usable again. Setup lists them for tidying up.
- **📊 Today's report:** orders, things sold, cash and card, tax, returns, the total, cash in the drawer and the best sellers, for one store or all of them. It prints as an end-of-day slip.

## 📱 Phones (My stuff)
Grown-ups and guests can keep their own things on their phone, so the kid can scan their phone like a real card or ticket. This is handy on a trip without the receipt printer.
- **Joining:** **Setup → 📱 Phones** (or **🙂 People → 📱 On your phone**) shows a QR code. Scan it with the phone's camera, then tap your name (or **I'm new here**). The phone remembers you and opens straight to your page from then on. If a login proxy (Authelia) sends `Remote-User` / `Remote-Name`, the matching person is suggested first.
- **What's on it:** your bank money and **💳 debit cards**, your **🪪 member card**, **🧾 receipts** (orders for you, or paid with your card, with 👨‍🍳 Making / ✅ Ready as the kitchen works), **🎟️ tickets**, **📚 library books** and fines, **🧾 checks** written to you, and **📬 Sent to me** (slips sent to your phone instead of printed). Tap anything to show its code big. The phone dings when a new receipt or slip arrives, or when your order is ready.
- **Two ways to hand something to the kid:** hold the code up to the scanner (Bluetooth or 📷), or tap **📲** to send it to the **kid's screen**, where it acts exactly like a scan. For a card at the register, the PIN is still typed on the tablet. Turn on **Setup → 📱 Phones → This tablet is the kid's screen** on the kid's tablet (it's saved on that tablet).
- **Printer off:** in **Setup → Receipt printer**, untick **Use the receipt printer** when there's no printer. Every 🖨️ Print window then offers **📲 Send to a phone** instead (it picks the right person when it knows, like the customer for a receipt), and the register says "📲 The receipt is on Grandma's phone". **🃏 One per phone** hands out a set of slips, like a mission's clue cards, one person at a time. With the printer on, **📲 Phone** sits next to Print.
- **🎁 Allowance:** **Setup → 📱 Phones** puts the same amount into each account you pick (grown-up PIN).
- **Away from home:** the app has no accounts, so only expose it behind a login. With Traefik and Authelia, swap the LAN-only middleware for your Authelia forwardAuth middleware (see the comment in `docker-compose.yml`).

## Modes
| Mode | Who | What |
|---|---|---|
| ⚙️ **Setup** | Grown-ups (PIN) | Create stores from templates (Coffee, Sandwich, Tech, My Own Shop, Blank), edit categories, items, pictures, photos, prices, sale prices, tax, play-money toggle, kitchen orders on/off, store look (plain or electronics), fresh menu from a template, **Reset play data** |
| 🧾 **Cashier** (Store) | Ethan | Pick who it's for, tap items (qty +/−), see subtotal / tax / total, **Send Order** → pay with play bills and coins (see exactly what change to give back) or a **💳 debit card**. **Pay later** is also an option. **➕ Add my item** lets him sell his own stuff (photo or emoji, name, price) with no PIN |
| 🏦 **Bank** | Anyone | Banks, accounts and debit cards. Put cash in, take cash out, make cards (with an optional 4-number PIN), freeze or cut them up, and see each account's history. No PIN |
| 🙂 **People** | Anyone | Add, rename or remove customers, with an emoji or a photo from the tablet camera. No PIN |
| 👨‍🍳 **Orders** (Store) | Ethan (kitchen) | **Things to make** list totals every item across open orders. Order cards move New → Making → Ready → Delivered, and tapping an item ticks it off |

### Selling his own stuff
The **➕ Add my item** tile on the Cashier screen opens a big kid-friendly form: take a photo with the tablet camera (or pick an emoji), type a name, and set the price with +/− buttons. New items land in a **⭐ My Stuff** category unless he picks another one. Items he adds get a ✏️ button so he can change or remove them later. Store items made in Setup stay PIN-protected.

### Custom sandwiches and drinks
The Sandwich and Coffee templates have a **Build a sandwich** / **Make a drink** tile, plus presets (Grilled Cheese, Caffè Latte, …) that are just saved recipes.
- **Sandwich:** white or brown bread, toast it, then stack up to 8 fillings (yellow or white cheese, ham, turkey, bacon, egg, lettuce, tomato, onions, pickles, mayo, mustard, peanut butter, jelly). The picture labels each layer.
- **Drink:** a cut-away cup like a barista chart. Pick a size and hot or iced, then fill up to 6 parts (espresso, steamed milk, milk foam, hot water, chocolate, caramel, tea), each drawn as a labelled band. Add toppings (whipped cream, marshmallows, sprinkles). It recognises classics ("It's a Cappuccino!") and names the drink.
- The server names and prices every custom order from the recipe (rules in `public/art.js`), and the kitchen card shows the picture plus the build list.

### Kitchen stores and checkout-only stores
Each store has a **Send orders to the kitchen** setting (Setup → edit the store). It's on for the food stores and off for the **Tech Store**, where you hand things over at the register.
- **Kitchen on:** *Send Order* puts the order on the **Orders** screen, and it can be paid now or later.
- **Kitchen off:** the button says **Checkout**, and there's no Orders button. Pay with cash or card, and the sale is done ("Sold! Hand over the stuff"). *Cancel* throws the unpaid sale away and keeps the cart. These stores never show up on the Orders screen.

Tech stores made before this setting existed are switched to checkout-only automatically (recognized by the electronics look).

### Reset play data
**🧹** on the Orders screen, or **Reset play data…** in Setup, needs the grown-up PIN. Tick what to clear: all orders (numbers restart at #1), bank balances and history, all bank accounts and cards, items added at the register, and people (back to Mom and Dad). Stores, menus, prices, banks and photos are always kept.

### Receipt printer
A network receipt printer (ESC/POS on port 9100; 80 mm with 48 or 42 letters a line, or 58 mm) prints receipts and slips. The server sends the print jobs, so any tablet or phone in the house can print.
- **Set it up:** Setup → **Receipt printer**. Type the printer's IP address (give it a fixed address in your router), pick the paper (Epson TM-T88 printers, like the TM-T88V, print **42 letters** a line on 80 mm paper; most others print 48), and tap **Test print**. The test slip shows every text size, a drawing, a QR code and a barcode, plus a line of numbers that should exactly fill one line. `PRINTER_HOST` / `PRINTER_PORT` in `docker-compose.yml` work too.
- **Receipts:** after a sale, the **🧾 Receipt** button shows the receipt on screen as a strip of paper, with a **🖨️ Print** button. It has the store's emoji as a picture, the order number, the items (and what went into custom sandwiches and drinks), tax, cash and change or the card and the balance left, a QR code for returns later, and a joke or fun fact. Turn on **Print a receipt automatically after every sale** to skip the button.
- **Cutting:** each slip ends with a partial cut (Epson's "feed to the cutter, then cut" command, which works on the TM-T88V even when its default cut mode is none). Turn off **Cut the paper after each slip** if the cutter is disabled, and the slip feeds out far enough to tear off instead.
- **Paper budget:** **Prints a day** (default 40) and **Longest slip**. When the limit is reached, kids see "The printer is resting until tomorrow" and the preview still works. Test prints don't count.
- **Status:** Setup shows whether the printer is ready, low on paper, out of paper, has its lid open, or can't be reached. The server checks every 30 seconds and before each print. A print that fails is not retried later.
- **Preview:** every print has an on-screen preview laid out exactly like the paper. QR codes and barcodes show as placeholders there for now; the printer draws the real ones.

### 🧾 Checks (Bank)
In a bank account, **✍️ Write a check**: who it's for, how much (it's written out in words too: "Two dollars and 00/100"), what it's for, and a **signature drawn with a finger**. It prints like a real check, with the signature and a QR code. At the **Bank**, scan the check (or tap **💰 Cash it** in the list) and put it in the payee's own account or give them play cash. The money comes out of the writer's account, and if there isn't enough it **bounces** 🏀. Each check cashes once, and can be torn up instead.

### 🎟️ Box Office
- **Make a show:** a name and picture, when it is, how many rows and seats, a ticket price (or free), a store to use as the **🍿 snack bar**, and whose account card money goes into.
- **🎟️ Sell:** pick who the tickets are for (or scan their member card), tap seats on the **seat map** in front of the stage, and pay (cash or card; free shows skip paying). Each ticket prints with the show, **ROW B · SEAT 3**, the name and a QR code.
- **🚪 Door:** scan tickets. "✅ Welcome, Mom! Row B, seat 3." Or ❌ "Already used!", "Wrong show!", "That show was on another day." The door counts who's inside and colors their seats on the map. A show ticket scanned on any screen goes to its door. No scanner? Tap a name to let them in.

### 📚 Library
Real books from the shelf (they already have an ISBN barcode) and homemade ones (comics, drawings) with a printed barcode label.
- **🛎️ Desk:** scan a **member card** (People → 🪪 Member card works as a library card), then scan the books, then **Check out**. A due-date slip prints ("Please return by Tuesday, December 1"). To bring a book back, just **scan it**: a thank-you slip prints, and if it's late the desk says how many days and what the fine is, with a **💰 Pay it** button (play cash with change, or a debit card with its PIN). No scanner? Tap who's borrowing and pick books off the shelf, and use **📥 Bring a book back**.
- **📚 Shelves:** every book with its cover photo (or a picture) and whether it's on the shelf, out, or ⏰ late. Scanning a book's barcode here (or anywhere in the Library) that isn't in yet opens **📚 New book!** with the ISBN filled in, and looks the book up online: title, author, cover photo and a matching picture fill themselves in when it's found. **🔎 Look it up** next to the ISBN does it again (and replaces what's there). Add homemade books with **➕ Add a book** and print their 🏷️ label.
- **🪪 Who has what:** each person's books and due dates, late ones in red, with **🔄 Renew** (up to twice, not when late) and **📥 Return**, and their fines.
- Due dates are **real days** (Setup → Library sets how many; 7 by default). **Late fines** are optional: so much per day late (25¢ by default, 0 turns them off, at most 30 days). Fines paid by card can go into someone's bank account, like a store's card sales. Grown-ups can **forgive** a fine, and can move a due date ("Make it 3 days late" is handy for trying fines out).
- The Library tile shows a red badge with the number of late books. Scanning a library book anywhere else in the Kids Hub says whether it's on the shelf or who has it.

### 📦 Post Office
Mail around the house: rooms and pretend places (Grandma's House, the North Pole), each with a zone letter and a printed **door sign**.
- **🏤 Counter:** pick (or scan the member card of) who it's **from**, who it's **to** if you like, and the **place** it goes (or scan that place's door sign). Pick a **size** (letter, small, big or giant box), put it on the **⚖️ scale** (it wobbles and settles on a weight that fits the box), and add **extras** (⚠️ fragile, ⚡ express, ✍️ signature). The postage adds up as you go; far-away places cost extra. **Pay & send** with play cash (change worked out) or a debit card (tap or scan it, then the PIN). The **shipping label** prints: big zone letter, from and to, banners for the extras, and a tracking QR code. There's also a strip of **🖼️ stamps** to print and cut apart.
- **🚚 Mail bag:** scan parcels to put them in the bag (they go out for delivery), walk to the room and **scan its door sign**. The right door delivers everything in the bag for that place 🎉; the wrong one says "Wrong house!" and where to go instead. With a full bag, scanning a door sign on any screen delivers. No scanner? Tap **Put in bag** and the place you're at.
- **🔎 Tracking:** every parcel's trip: 📥 Accepted → 🗂️ Sorting → 🚚 Out for delivery → ✅ Delivered, with times. Scanning a label at the counter moves it along a step.
- **Setup → Post Office:** add, rename and remove places (up to 26, zones A–Z), mark pretend ones as far away, print door signs, set every postage price, pick whose bank account card postage goes into, and turn auto-printed labels on or off.

### 🕵️ Spy HQ
A secret-agent app, all in a dark "night ops" look.
- **🧑‍🏫 Grown-ups guide:** every Spy HQ screen has a **🧑‍🏫 Grown-ups** button: what the game is, the levels, how to coach without giving the answer away, and game ideas (also in Setup → Spy HQ → **How it works**).
- **Agents:** make an agent with a 🎲 codename ("Agent Midnight Tiger"), a photo or spy face, and who they really are (top secret). Each gets a printed **badge** with a QR code. Scanning a badge anywhere in the Kids Hub logs that agent in with a big green **ACCESS GRANTED**.
- **🔢 Code Breaker:** guess the hidden code (colors, animals or numbers; easy 3, medium 4, hard 5 symbols). After each guess, 🟢 = right symbol in the right spot, 🟡 = right symbol, wrong spot. **👥 Someone sets the code** lets a grown-up or friend pick it (and print it as a sealed slip to check at the end). Wins print a **certificate** with a rank (Rookie, Ace Agent, Master Spy), and each agent's best score is kept.
- **🌀 Cipher Lab:** the **cipher wheel** (drag the inner ring to turn it), **backwards alphabet**, **number code** (A = 1) and **emoji code** (A is for 🍎). Write a secret or crack one. **Print secret** prints the coded message with a QR code: scanning it loads it straight back into the lab to crack. **Print key card** prints a decoder key.
- **🔐 Vaults:** keypad safes. Kids make vaults with a secret message inside; the vault can give hints ("2 numbers are in the right spot"). Grown-ups can put **play money** inside (Setup → Spy HQ): whoever opens it puts it in a bank account, once.
- **🗺️ Missions (scavenger hunts):** in Setup → Spy HQ, build a mission of up to 12 clue cards, or tap **⚡ Quick mission**, pick 3–8 hiding places in order, and HQ writes rhyming clues for them (every other one in cipher-wheel code, if you like). Print the clue cards, hide them, and hand over the **START HERE** card. Scanning a card shows its clue, only in order ("That's not your next clue, agent!"). Coded clues open in the Cipher Lab. The last card reveals the **vault code**. A mission log prints at the end.
- Clue text, vault codes and prizes stay on the server: the only way to see a clue is to scan its card in order, and a prize, to open its vault. **Reset play data → Spy HQ progress** locks the vaults again and restarts missions.

### 🔍 Scanner, 🔳 QR Studio, 🧮 Adding Machine
- **🔍 Scanner:** a "what is this?" machine. On this screen every scan is explained right there: Kids Hub codes say what they are (with a button to go there). Real barcodes show their digits big, their type (EAN-13, UPC-A, EAN-8, ISBN), the country whose barcode office the company signed up with (from the first three digits, an offline table), and the **check-digit detective**, which works through the multiply-by-1-or-3 math step by step. Unknown book and product barcodes are also looked up online, so the Scanner says what they are ("Goodnight Moon by Margaret Wise Brown") with a picture. QR codes show their text. It also counts everything scanned today and lists the latest, and prints a scan report.
- **🔳 QR Studio:** make a code from a **message**, **emoji**, a **secret** (in Spy HQ code; scanning it opens the Cipher Lab), a **shortcut** that opens an app when scanned (stick one on the toy box!), or a **Wi-Fi card** for guests (grown-up PIN). It shows a live QR code on screen that phone cameras can read, can **show it big**, **print** it with a caption, and **save** it to a gallery. Scanning anything while QR Studio is open reads it out.
- **🧮 Adding Machine:** big keys and a paper tape like an old shop adding machine (+, −, ×, ÷, totals marked `*`). **Money** mode shows the answer as bills and coins. Scanning a price tag (or a linked package) adds its price with its name on the tape. **Print the tape** on the receipt printer.
- Print previews now show the **real QR codes and barcodes**, drawn by the app's own encoders (`public/lib/qr.js`, `public/lib/code128.js`), so the preview can be scanned too.

### Barcode and QR scanner
A Bluetooth scanner paired with the tablet works anywhere in the app. It acts like a keyboard, typing the code and pressing Enter; the app spots that burst (far faster than anyone types) and treats it as a scan.
- **Scan anything** and a **What is this?** card pops up: a receipt shows its order, who it's for, the total and whether it's paid, with a button to the kitchen orders; a person's code, a debit card, or a store item shows what it is. Real product barcodes (EAN-13, UPC-A, EAN-8, book ISBNs) show their type and whether the check digit is right. Anything else shows the text.
- **Nothing gets lost:** a scan never ends up in a text box (it's taken back out), its Enter never submits a form, and the card sits on top of whatever is open, so a half-finished payment or form is still there after **OK**. Fast typing is not mistaken for a scan.
- The home screen has a **🔫** chip that flashes and shows the last code heard, plus the printer's status.
- **📷 Camera scanner:** when the Bluetooth scanner won't connect, the round 📷 button in the bottom-left corner (on every screen, even over open windows) scans with the tablet's camera instead. A small camera window opens; hold a QR code, printed label, or real barcode in the box and it scans just like the Bluetooth scanner, so every app reacts the same way. Holding a code still scans it once; take it away and bring it back to scan it again (two of the same item). Drag the picture to move the window out of the way (it remembers where), 🔄 switches front/back camera, 🔦 turns on the flashlight where the tablet has one, **✕ Done** turns the camera off. It works on Android tablets and iPads: Chrome on Android has a barcode reader built in, and everywhere else (iPad Safari, and Chrome on iPad, which is Safari inside) the Kids Hub loads its own copy (`public/vendor/`, about 1 MB, downloaded the first time the camera opens and then kept for a week). Browsers only allow the camera on the **https://** address. Setup → 📷 Camera scanner can hide the button on a tablet that doesn't need it.
- **Tablet tip:** Android hides the on-screen keyboard while a Bluetooth keyboard (the scanner) is connected. To get it back: Settings → System → Keyboard → Physical keyboard → **Use on-screen keyboard**.
- No scanner handy? Type `kidsHubScan('KH-TEST-QR')` in the browser console.

### Play money
The cash tray has **$1, $2, $5, $10, $20, $50 and $100** bills (each its own color) plus 25¢, 10¢, 5¢ and 1¢ coins. Change is worked out with the fewest bills and coins, so it can include $2 bills.

### Bank and debit cards
- **🏦 Bank** on the home screen. It starts with one bank (*Play Bank*). Make more with ➕ and give each its own name, logo and color; its cards use that color.
- **Open an account** for anyone on the People list, with an optional welcome gift. Each person can have one account per bank.
- In an account: **💵 Put money in** and **🏧 Take money out** use the same tap-the-bills tray as the register. **💳 New card** picks a card design and an optional 4-number PIN (up to 5 cards per account). Each card can be ❄️ frozen, get a new 🔑 PIN, or be ✂️ cut up. **📜 History** lists every deposit, withdrawal, purchase and refund.
- **Paying by card:** on the pay screen, switch to **💳 Card**, tap the card (the customer's own cards come first), and type the PIN if it has one. The bank says **Approved** (and shows what's left) or **Declined**: not enough money, wrong PIN, or frozen card. Declined offers *Try again*, *Pay with cash* or *Pay later*.
- **Where card money goes:** in Setup → edit a store → *Card payments go into*, pick someone's account (e.g. Ethan's) and the store's card sales are deposited there. Leave it empty and the money just leaves the customer's account.
- **Refunds:** cancelling an open order that was paid by card puts the money back on the card and takes it back out of the store's account. Removing a *delivered* order is just tidying up, so there's no refund.
- Card PINs stay on the server and are never sent to the browser.

### Pictures
Items use hand-drawn SVGs from `public/art.js` (food, drinks, electronics), or a photo, or an emoji. The **Add my item** picker lists the drawings first.

Typical flow: take everyone's orders on the tablet → run to his room → open **Orders** → make what's on the "Things to make" list → tap **Ready!** → deliver.

## Install (Unraid, Docker Compose)
1. Copy this folder to the server, e.g. `/mnt/user/appdata/playstore-src/`.
2. Edit `docker-compose.yml`:
   - `SETUP_PIN` (or put `SETUP_PIN=...` in a `.env` next to it)
   - the Traefik `Host(...)` rule and network name. The bundled `playstore-lan` middleware only lets private IPs in.
3. Run `docker compose up -d --build`.
4. Open the URL on the tablet, go to **Setup**, enter the PIN and pick a store template.

> [!tip] No Traefik?
> Uncomment `ports: ["8089:8080"]` and open `http://<unraid-ip>:8089`. Note that "Add to Home screen" runs as a plain shortcut over HTTP. That's fine for this.

## Operations
- **Backup:** `/mnt/user/appdata/playstore/` (`db.json` plus `photos/`; the bank lives in `db.json` too). Your normal appdata backup covers it.
- **Update:** replace the files, then run `docker compose up -d --build`. Your data is untouched.
- **Reset:** use **Reset play data** (🧹 on the Orders screen or in Setup) to clear orders, bank money, accounts, kid-added items or people. For a full wipe, stop the container and delete `db.json`. Setup also has "Clear delivered orders".
- **Dev:** `npm run dev` serves on :8089 with data in `./data`. `npm run icons` redraws the PNG icons.
- **Code layout:** `server.js` is the API. In the browser, `public/app.js` draws the home screen and routes to the apps. Shared helpers (state, server calls, sounds, modals, printing, scanning) are in `public/lib/`, and each app is in `public/apps/` (`store/`, `library/`, `post/`, `tickets/` for the Box Office, `checks.js`, `spy/`, `tools/` for Scanner, QR Studio and Adding Machine, `bank.js`, `people.js`, `setup.js`). The list of home-screen tiles is `public/apps/registry.js`. `public/art.js` (drawings) and `public/slip.js` (receipt layout) are shared with the server; `server/printer.js` turns slips into ESC/POS and `server/codes.js` looks up scanned codes; `server/lookup.js` looks up real books and products online, `server/library.js`, `server/post.js`, `server/boxoffice.js`, `server/checks.js` and `server/spy.js` have the Library, Post Office, Box Office, checks and Spy HQ routes. `public/lib/camscan.js` is the camera scanner (it feeds codes into the same path as the Bluetooth scanner in `public/lib/scan.js`; on browsers without a built-in `BarcodeDetector` it loads `public/vendor/barcode-detector.js` and `zxing_reader.wasm`, the only third-party code, see `public/vendor/LICENSES.txt`). `public/lib/paybox.js` is the shared pay window (cash or card) the Library and Post Office use.
- **Risk:** an isolated container with no network or HA changes. Rolling back means `docker compose down`.

## API (for HA / scripts later)
Prices and money are in cents.
- `GET /api/state`: stores, customers, banks, accounts and `hub` (`{hidden: [appId]}`)
- `PUT /api/hub {hidden}` (PIN): which home-screen tiles are hidden
- `GET /api/orders/:id`: one order (any age). `POST /api/orders/:id/refund {lines: [{i, qty}]}`: give back some lines of a paid order; returns `{order, refund}` (`refund.method` card or cash)
- `GET /api/report?storeId=`: today's numbers for one store or all
- `POST /api/queue {action: take|next|reset}`: the take-a-number queue (`GET /api/state` includes `queue: {next, serving}`)
- Items accept `barcodes: [...]` (up to 10)
- `GET /api/codes?c=<code>[&log=1]`: what a scanned code is (`kind`: person, card, receipt, ticket, item, agent, clue, secret, go, product, test, text, gone; plus `label`, `detail`, `href`). `log=1` adds it to the Scanner's list. `KH-G-<app>` codes are shortcuts (store, bank, people, spy, cipher, codebreaker, missions, vault, serving, scanner, qr, calc, home)
- `GET /api/scanlog`: today's scan count and the latest scans
- Stock and coupons: items accept `stock` (null = not counted). `POST /api/stores/:id/items/:itemId/stock {add}` (restock, no PIN). `POST /api/orders` accepts `couponId`; orders carry `discount {couponId, label, amount}`; a sold-out item answers 400 `code: stock`. `POST /api/coupons {storeId?, kind: amount|percent|item, value, itemId?, count}`, `DELETE /api/coupons/:id`. Codes: `KH-U-<id>`
- Checks (`server/checks.js`): `POST /api/checks {fromAccountId, toCustomerId, amount, memo?, signature}` (signature is a PNG data URL), `POST /api/checks/:id/cash {accountId?}` (no account = cash out; 400 `code: bounced`), `POST /api/checks/:id/void`. Codes: `KH-H-<id>`
- Box Office (`server/boxoffice.js`): `POST /api/shows`, `PUT`/`DELETE /api/shows/:id`, `POST /api/shows/:id/tickets {customerId, seats, pay?}`, `POST /api/showtickets/:id/admit {showId}` (400 `code: used | wrong | old`). `GET /api/state` includes `boxOffice`, `coupons`, `checks`. Codes: `KH-T-<id>`
- Post Office (`server/post.js`): `GET /api/state` includes `post` (places, parcels on the way and the last 30 delivered, settings). `POST /api/post/parcels {fromId, toPersonId?, toPlaceId, size, weight, extras, pay: {method: cash, tendered} | {method: card, cardId, pin}}` (the server works out the postage), `POST /api/post/parcels/:id/advance` (up to out for delivery), `POST /api/post/parcels/:id/deliver {placeId}` (400 `code: wrong` at the wrong door). `PUT /api/post/places {places}` and `PUT /api/post/settings {rates, payoutAccountId, autoLabel}` (PIN). Codes: `KH-M-<id>` parcels, `KH-L-<id>` door signs
- Library (`server/library.js`, no PIN unless noted): `GET /api/state` includes `library` (books, open loans, recent returns and unpaid fines, settings). `POST /api/library/books {title, author?, isbn?, emoji?, photo?}`, `PUT`/`DELETE /api/library/books/:id`. `POST /api/library/checkout {customerId, bookIds}`, `POST /api/library/return {bookId}` (returns the loan with `daysLate` and `fine`), `POST /api/library/loans/:id/renew`, `PUT /api/library/loans/:id {dueAt}` (PIN). `POST /api/library/fines/pay {loanIds, method: cash|card, tendered?, cardId?, pin?}`, `POST /api/library/fines/forgive {loanIds}` (PIN), `PUT /api/library/settings {loanDays, finePerDay, fineAccountId, autoSlips}` (PIN). `KH-B-<id>` codes and known ISBNs look up as `kind: book`
- Lookup (`server/lookup.js`, no PIN): `GET /api/lookup?code=<ISBN, UPC or EAN>` → `{found: false}` or `{found: true, kind: book|product, title, author?, brand?, size?, emoji?, photo? (data URL), source}`. Books come from Open Library (then Google Books), products from Open Food Facts and Open Products Facts (then UPCitemdb's free trial, 100 a day). Results are cached in memory; not-found codes are tried again after 10 minutes.
- `POST /api/qr {kind, text, caption, emoji}` (a `wifi` code needs the PIN), `DELETE /api/qr/:id`. `GET /api/state` includes `qrCodes`
- Spy HQ (`server/spy.js`): `GET /api/state` includes `spy` (agents, records, vaults and missions without secrets). `POST /api/spy/agents`, `PUT`/`DELETE /api/spy/agents/:id`, `POST /api/spy/records`. Vaults: `POST /api/spy/vaults` (money prizes need the PIN), `POST /api/spy/vaults/:id/try {combo}`, `/claim {accountId}`, `/lock`. Missions (PIN to build): `POST`/`PUT`/`DELETE /api/spy/missions`, `GET /api/spy/missions/:id/run?agent=`, `POST /api/spy/missions/:id/scan?agent= {clueId}`, `/reset`. `GET /api/spy/admin` (PIN) has everything, secrets included
- `POST /api/print {slip, test?}`: print a slip (format in `public/slip.js`). No PIN, except `test: true`, which skips the daily limit. Errors: 409 off or not set up, 429 `code: limit`, 400 too long or broken, 503 `code: printer` (can't reach it, out of paper, lid open)
- `PUT /api/printer {enabled, host, port, paper, dailyLimit, maxCm, autoReceipt, autoTicket, funLines, cut}` (PIN), `POST /api/printer/check`. `GET /api/state` includes `printer` (settings, `status`, `today`)
- `GET /api/events`: Server-Sent Events, `change` fires on every write (this is how devices stay in sync)
- `GET /api/orders?storeId=`: open orders plus the last 12 hours of delivered ones
- `POST /api/orders {storeId, customer, customerEmoji?, customerPhoto?, lines:[{itemId, qty, recipe?}], paid?, tendered?}`. `recipe` is for builder items, and the server sets the line's name and price
- `PATCH /api/orders/:id {status | toggleLine | pay:{tendered} | pay:{cardId, pin?}}`. A card payment returns the order plus `receipt:{owner, balanceLeft}`, or a 400 with `code` set to `funds` (and `balance`), `pin` or `frozen`
- `DELETE /api/orders/:id` refunds a card payment if the order wasn't delivered yet (`{refunded:true}`)
- Bank (no PIN): `POST /api/banks {name, emoji, color}`, `PUT`/`DELETE /api/banks/:id` (delete only when it has no accounts). `POST /api/accounts {bankId, customerId, opening?}`, `DELETE /api/accounts/:id` (returns `cashOut`), `GET /api/accounts/:id/transactions`, `POST /api/accounts/:id/deposit|withdraw {amount}`, `POST /api/accounts/:id/cards {design?, pin?}`, `PUT /api/cards/:id {frozen?, pin?, design?}`, `DELETE /api/cards/:id`. `GET /api/state` also returns `banks` and `accounts` (with cards, minus PINs)
- `POST /api/stores/:id/items {name, emoji, price, categoryId?, photo?}` (photo is a data: URL). Items added without the PIN stay editable without it (`PUT`/`DELETE /api/stores/:id/items/:itemId`)
- `POST /api/customers {name, emoji, photo?}`, `PUT`/`DELETE /api/customers/:id` (no PIN)

`POST /api/reset {orders?, bankMoney?, accounts?, kidItems?, people?, spy?, scans?, library?, post?, boxOffice?, checks?}` (clearing orders also makes used coupons usable again) (PIN) clears the chosen data.

Setup writes (`POST/PUT/DELETE /api/stores`, `POST /api/stores/:id/reset {template}`, `PUT /api/customers`, `DELETE /api/orders?status=delivered|all`) need the `x-setup-pin` header.

## Ideas
The bigger plan (a Kids Hub with Library, Post Office, Box Office, Spy HQ, QR Studio, Scanner, Adding Machine, plus the Bluetooth scanner and receipt printer) is in [docs/kids-hub-design.md](docs/kids-hub-design.md).

- [x] Item photos instead of emoji
- [x] Drawn item pictures, custom sandwich/drink builder, people photos
- [x] Bank accounts and debit cards; $1–$100 bills
- [x] Stock counts per item ("sold out!")
- [x] Bluetooth barcode scanner: scan to ring up, price tags, member and debit cards, returns, kitchen tickets
- [ ] HA notification or a light flash when an order is marked **Ready**
