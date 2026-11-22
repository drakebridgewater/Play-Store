---
tags: [homelab, ethan, self-hosted]
---
# 🏪 Play Store POS

A pretend-play register for kids. It has multiple mini stores, a cashier screen, play-money checkout and a kitchen order queue that syncs across devices.

- **Stack:** one Node 22 container with **zero npm dependencies**. Data is a single `db.json` file in `/data`.
- **Offline / local:** no cloud, no accounts, no subscriptions.
- **Devices:** works in any browser and is tablet-first. On Android, use Chrome ⋮ → *Add to Home screen* for a full-screen app.

## Modes
| Mode | Who | What |
|---|---|---|
| ⚙️ **Setup** | Grown-ups (PIN) | Create stores from templates (Coffee, Sandwich, Tech, My Own Shop, Blank), edit categories, items, pictures, photos, prices, sale prices, tax, play-money toggle, store look (plain or electronics), fresh menu from a template |
| 🧾 **Cashier** | Ethan | Pick who it's for, tap items (qty +/−), see subtotal / tax / total, **Send Order** → pay with play bills and coins (see exactly what change to give back) or a **💳 debit card**. **Pay later** is also an option. **➕ Add my item** lets him sell his own stuff (photo or emoji, name, price) with no PIN |
| 🏦 **Bank** | Anyone | Banks, accounts and debit cards. Put cash in, take cash out, make cards (with an optional 4-number PIN), freeze or cut them up, and see each account's history. No PIN |
| 🙂 **People** | Anyone | Add, rename or remove customers, with an emoji or a photo from the tablet camera. No PIN |
| 👨‍🍳 **Orders** | Ethan (kitchen) | **Things to make** list totals every item across open orders. Order cards move New → Making → Ready → Delivered, and tapping an item ticks it off |

### Selling his own stuff
The **➕ Add my item** tile on the Cashier screen opens a big kid-friendly form: take a photo with the tablet camera (or pick an emoji), type a name, and set the price with +/− buttons. New items land in a **⭐ My Stuff** category unless he picks another one. Items he adds get a ✏️ button so he can change or remove them later. Store items made in Setup stay PIN-protected.

### Custom sandwiches and drinks
The Sandwich and Coffee templates have a **Build a sandwich** / **Make a drink** tile, plus presets (Grilled Cheese, Caffè Latte, …) that are just saved recipes.
- **Sandwich:** white or brown bread, toast it, then stack up to 8 fillings (yellow or white cheese, ham, turkey, bacon, egg, lettuce, tomato, onions, pickles, mayo, mustard, peanut butter, jelly). The picture labels each layer.
- **Drink:** a cut-away cup like a barista chart. Pick a size and hot or iced, then fill up to 6 parts (espresso, steamed milk, milk foam, hot water, chocolate, caramel, tea), each drawn as a labelled band. Add toppings (whipped cream, marshmallows, sprinkles). It recognises classics ("It's a Cappuccino!") and names the drink.
- The server names and prices every custom order from the recipe (rules in `public/art.js`), and the kitchen card shows the picture plus the build list.

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
- **Reset:** stop the container and delete `db.json`. Setup also has "Clear delivered orders" and "Clear ALL orders and restart at #1".
- **Dev:** `npm run dev` serves on :8089 with data in `./data`. `npm run icons` redraws the PNG icons.
- **Risk:** an isolated container with no network or HA changes. Rolling back means `docker compose down`.

## API (for HA / scripts later)
Prices and money are in cents.
- `GET /api/state`: stores and customers
- `GET /api/events`: Server-Sent Events, `change` fires on every write (this is how devices stay in sync)
- `GET /api/orders?storeId=`: open orders plus the last 12 hours of delivered ones
- `POST /api/orders {storeId, customer, customerEmoji?, customerPhoto?, lines:[{itemId, qty, recipe?}], paid?, tendered?}`. `recipe` is for builder items, and the server sets the line's name and price
- `PATCH /api/orders/:id {status | toggleLine | pay:{tendered} | pay:{cardId, pin?}}`. A card payment returns the order plus `receipt:{owner, balanceLeft}`, or a 400 with `code` set to `funds` (and `balance`), `pin` or `frozen`
- `DELETE /api/orders/:id` refunds a card payment if the order wasn't delivered yet (`{refunded:true}`)
- Bank (no PIN): `POST /api/banks {name, emoji, color}`, `PUT`/`DELETE /api/banks/:id` (delete only when it has no accounts). `POST /api/accounts {bankId, customerId, opening?}`, `DELETE /api/accounts/:id` (returns `cashOut`), `GET /api/accounts/:id/transactions`, `POST /api/accounts/:id/deposit|withdraw {amount}`, `POST /api/accounts/:id/cards {design?, pin?}`, `PUT /api/cards/:id {frozen?, pin?, design?}`, `DELETE /api/cards/:id`. `GET /api/state` also returns `banks` and `accounts` (with cards, minus PINs)
- `POST /api/stores/:id/items {name, emoji, price, categoryId?, photo?}` (photo is a data: URL). Items added without the PIN stay editable without it (`PUT`/`DELETE /api/stores/:id/items/:itemId`)
- `POST /api/customers {name, emoji, photo?}`, `PUT`/`DELETE /api/customers/:id` (no PIN)

Setup writes (`POST/PUT/DELETE /api/stores`, `POST /api/stores/:id/reset {template}`, `PUT /api/customers`, `DELETE /api/orders?status=delivered|all`) need the `x-setup-pin` header.

## Ideas
- [x] Item photos instead of emoji
- [x] Drawn item pictures, custom sandwich/drink builder, people photos
- [x] Bank accounts and debit cards; $1–$100 bills
- [ ] Stock counts per item ("sold out!")
- [ ] Bluetooth barcode scanner → item lookup
- [ ] HA notification or a light flash when an order is marked **Ready**
