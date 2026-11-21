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
| ⚙️ **Setup** | Grown-ups (PIN) | Create stores from templates (Coffee, Sandwich, Tech, Blank), edit categories, items, emoji, prices, tax, play-money toggle, customer names |
| 🧾 **Cashier** | Ethan | Pick who it's for, tap items (qty +/−), see subtotal / tax / total, **Send Order** → pay with play bills and coins, see exactly what change to give back. **Pay later** is also an option |
| 👨‍🍳 **Orders** | Ethan (kitchen) | **Things to make** list totals every item across open orders. Order cards move New → Making → Ready → Delivered, and tapping an item ticks it off |

Typical flow: take everyone's orders on the tablet → run to his room → open **Orders** → make what's on the "Things to make" list → tap **Ready!** → deliver.

## Install (Unraid, Docker Compose)
1. Copy this folder to the server, e.g. `/mnt/user/appdata/playstore-src/`.
2. Edit `docker-compose.yml`:
   - `SETUP_PIN`
   - the Traefik `Host(...)` rule and network name. Add your LAN-only middleware if you have one.
3. Run `docker compose up -d --build`.
4. Open the URL on the tablet, go to **Setup**, enter the PIN and pick a store template.

> [!tip] No Traefik?
> Uncomment `ports: ["8089:8080"]` and open `http://<unraid-ip>:8089`. Note that "Add to Home screen" runs as a plain shortcut over HTTP. That's fine for this.

## Operations
- **Backup:** `/mnt/user/appdata/playstore/db.json`. Your normal appdata backup covers it.
- **Update:** replace the files, then run `docker compose up -d --build`. Your data is untouched.
- **Reset:** stop the container and delete `db.json`.
- **Risk:** an isolated container with no network or HA changes. Rolling back means `docker compose down`.

## API (for HA / scripts later)
- `GET /api/state`: stores and customers
- `GET /api/orders?storeId=`
- `POST /api/orders {storeId, customer, lines:[{itemId, qty}], paid?}`
- `PATCH /api/orders/:id {status | toggleLine}`

Setup writes need the `x-setup-pin` header.

## Ideas
- [ ] Item photos instead of emoji
- [ ] Stock counts per item ("sold out!")
- [ ] Bluetooth barcode scanner → item lookup
- [ ] HA notification or a light flash when an order is marked **Ready**
