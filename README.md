---
tags: [homelab, ethan, self-hosted]
---
# 🧒 Kids Hub (Play Store POS)

A home screen of pretend-play apps for kids. The first apps are the **Store** (multiple mini stores, a cashier screen, play-money checkout and a kitchen order queue), the **Bank** and **People**, and they all sync across devices. More apps are planned in [docs/kids-hub-design.md](docs/kids-hub-design.md).

- **Stack:** one Node 22 container with **zero npm dependencies**. Data is a single `db.json` file in `/data`. The browser code is plain ES modules with no build step.
- **Offline / local:** no cloud, no accounts, no subscriptions.
- **Devices:** works in any browser and is tablet-first. On Android, use Chrome ⋮ → *Add to Home screen* for a full-screen app.

## Home screen
The home screen is a grid of app tiles (Store, Bank, People) with a greeting and the time. The Store tile shows a red badge with the number of open kitchen orders. The small ⚙️ in the corner opens **Setup**.

In **Setup → Home screen** a grown-up can hide any app tile. A hidden app still works if you go to it another way, for example from a bookmark.

Tapping **Store** opens the store lobby: one big button per store (opens its register), **Kitchen orders**, and the counter tools: **🎟️ Take a number**, **📣 Now serving** and **📊 Today's report**. The old `#/cashier` and `#/orders` links still work.

### Scanning and printing at the store
- **Ring things up by scanning:** printed price tags (Setup → edit a store → **🏷️ Price tags**) and real packages linked to an item. Scanning a package nobody sells yet opens **📦 New item!** with its barcode attached: take a photo of the box, name it, price it, and from then on it scans. Grown-ups can link more barcodes in Setup → item → 📦 Barcodes (scan while the item is open, or type one).
- **🔍 Price check** (button on the register): scanning shows the price big without adding it.
- **Member cards** (People → a person → **🪪 Member card**): scanning one at the register picks who the order is for.
- **Paper debit cards** (Bank → account → card → **🖨️ Print**): ring things up, then scan the card to pay. Its PIN is still asked for.
- **Receipts → ↩️ Returns desk:** scan a receipt's QR code anywhere in the Store app, pick what's coming back, and the money goes back the way it was paid (onto the card, or the app shows which bills and coins to hand back). There's a printable return slip.
- **Kitchen tickets:** printed automatically for each kitchen order if Setup → Receipt printer → **Print a kitchen ticket automatically** is on, or with 🎫 on any order card. They show the order number big, who it's for, each thing to make and a picture of custom drinks and sandwiches. Scanning a ticket moves its order along (New → Making → Ready → Delivered).
- **🎟️ Take a number / 📣 Now serving:** a deli-style ticket with a big number, and a counter screen every tablet shows the same way. **Next, please!** rings a bell.
- **📊 Today's report:** orders, things sold, cash and card, tax, returns, the total, cash in the drawer and the best sellers, for one store or all of them. It prints as an end-of-day slip.

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

### Barcode and QR scanner
A Bluetooth scanner paired with the tablet works anywhere in the app. It acts like a keyboard, typing the code and pressing Enter; the app spots that burst (far faster than anyone types) and treats it as a scan.
- **Scan anything** and a **What is this?** card pops up: a receipt shows its order, who it's for, the total and whether it's paid, with a button to the kitchen orders; a person's code, a debit card, or a store item shows what it is. Real product barcodes (EAN-13, UPC-A, EAN-8, book ISBNs) show their type and whether the check digit is right. Anything else shows the text.
- **Nothing gets lost:** a scan never ends up in a text box (it's taken back out), its Enter never submits a form, and the card sits on top of whatever is open, so a half-finished payment or form is still there after **OK**. Fast typing is not mistaken for a scan.
- The home screen has a **🔫** chip that flashes and shows the last code heard, plus the printer's status.
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
- **Code layout:** `server.js` is the API. In the browser, `public/app.js` draws the home screen and routes to the apps. Shared helpers (state, server calls, sounds, modals, printing, scanning) are in `public/lib/`, and each app is in `public/apps/` (`store/`, `bank.js`, `people.js`, `setup.js`). The list of home-screen tiles is `public/apps/registry.js`. `public/art.js` (drawings) and `public/slip.js` (receipt layout) are shared with the server; `server/printer.js` turns slips into ESC/POS and `server/codes.js` looks up scanned codes.
- **Risk:** an isolated container with no network or HA changes. Rolling back means `docker compose down`.

## API (for HA / scripts later)
Prices and money are in cents.
- `GET /api/state`: stores, customers, banks, accounts and `hub` (`{hidden: [appId]}`)
- `PUT /api/hub {hidden}` (PIN): which home-screen tiles are hidden
- `GET /api/orders/:id`: one order (any age). `POST /api/orders/:id/refund {lines: [{i, qty}]}`: give back some lines of a paid order; returns `{order, refund}` (`refund.method` card or cash)
- `GET /api/report?storeId=`: today's numbers for one store or all
- `POST /api/queue {action: take|next|reset}`: the take-a-number queue (`GET /api/state` includes `queue: {next, serving}`)
- Items accept `barcodes: [...]` (up to 10)
- `GET /api/codes?c=<code>`: what a scanned code is (`kind`: person, card, receipt, ticket, item, product, test, text, gone; plus `label`, `detail`, `href`)
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

`POST /api/reset {orders?, bankMoney?, accounts?, kidItems?, people?}` (PIN) clears the chosen data.

Setup writes (`POST/PUT/DELETE /api/stores`, `POST /api/stores/:id/reset {template}`, `PUT /api/customers`, `DELETE /api/orders?status=delivered|all`) need the `x-setup-pin` header.

## Ideas
The bigger plan (a Kids Hub with Library, Post Office, Box Office, Spy HQ, QR Studio, Scanner, Adding Machine, plus the Bluetooth scanner and receipt printer) is in [docs/kids-hub-design.md](docs/kids-hub-design.md).

- [x] Item photos instead of emoji
- [x] Drawn item pictures, custom sandwich/drink builder, people photos
- [x] Bank accounts and debit cards; $1–$100 bills
- [ ] Stock counts per item ("sold out!")
- [x] Bluetooth barcode scanner: scan to ring up, price tags, member and debit cards, returns, kitchen tickets
- [ ] HA notification or a light flash when an order is marked **Ready**
