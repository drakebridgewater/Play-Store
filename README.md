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
| ⚙️ **Setup** | Grown-ups (PIN) | Create stores from templates (Coffee, Sandwich, Tech, My Own Shop, Blank), edit categories, items, emoji, photos, prices, tax, play-money toggle, customer names |
| 🧾 **Cashier** | Ethan | Pick who it's for, tap items (qty +/−), see subtotal / tax / total, **Send Order** → pay with play bills and coins, see exactly what change to give back. **Pay later** is also an option. **➕ Add my item** lets him sell his own stuff (photo or emoji, name, price) with no PIN |
| 👨‍🍳 **Orders** | Ethan (kitchen) | **Things to make** list totals every item across open orders. Order cards move New → Making → Ready → Delivered, and tapping an item ticks it off |

### Selling his own stuff
The **➕ Add my item** tile on the Cashier screen opens a big kid-friendly form: take a photo with the tablet camera (or pick an emoji), type a name, and set the price with +/− buttons. New items land in a **⭐ My Stuff** category unless he picks another one. Items he adds get a ✏️ button so he can change or remove them later. Store items made in Setup stay PIN-protected.

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
- **Backup:** `/mnt/user/appdata/playstore/` (`db.json` plus `photos/`). Your normal appdata backup covers it.
- **Update:** replace the files, then run `docker compose up -d --build`. Your data is untouched.
- **Reset:** stop the container and delete `db.json`. Setup also has "Clear delivered orders" and "Clear ALL orders and restart at #1".
- **Dev:** `npm run dev` serves on :8089 with data in `./data`. `npm run icons` redraws the PNG icons.
- **Risk:** an isolated container with no network or HA changes. Rolling back means `docker compose down`.

## API (for HA / scripts later)
Prices and money are in cents.
- `GET /api/state`: stores and customers
- `GET /api/events`: Server-Sent Events, `change` fires on every write (this is how devices stay in sync)
- `GET /api/orders?storeId=`: open orders plus the last 12 hours of delivered ones
- `POST /api/orders {storeId, customer, customerEmoji?, lines:[{itemId, qty}], paid?, tendered?}`
- `PATCH /api/orders/:id {status | toggleLine | pay:{tendered}}`, `DELETE /api/orders/:id`
- `POST /api/stores/:id/items {name, emoji, price, categoryId?, photo?}` (photo is a data: URL). Items added without the PIN stay editable without it (`PUT`/`DELETE /api/stores/:id/items/:itemId`)
- `POST /api/customers {name, emoji}`

Setup writes (`POST/PUT/DELETE /api/stores`, `PUT /api/customers`, `DELETE /api/orders?status=delivered|all`) need the `x-setup-pin` header.

## Ideas
- [x] Item photos instead of emoji
- [ ] Stock counts per item ("sold out!")
- [ ] Bluetooth barcode scanner → item lookup
- [ ] HA notification or a light flash when an order is marked **Ready**
