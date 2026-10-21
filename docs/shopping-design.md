# Shopping in Utilities: design (DRAFT)

**Status: DRAFT, not built.** Nothing here is approved until Robb says so. Module: Ashen Gate | Utilities (`ashen-gate-utilities`, now 0.13.1). Target: Foundry V14 on The Forge, dnd5e 6.0.6, 2024 rules.

Mockup (private artifact): https://claude.ai/artifact/8danqfZAjEWaTi1o55rprj

## 1. What it does

- The GM builds **shops**: a merchant name and art, flavour text, an optional linked Location, and a list of items. Each item has a price, optional flavour text and optional stock.
- The GM saves, searches and sorts shops in a new **Shops** tab.
- **Present** opens a shop for one, some or all players. Only those players can buy from it, until the GM clicks **Stop showing**.
- A player buys an item: picks a quantity and who pays (the **party purse** or **their own character's coins**), sees the total and the change, confirms. The item goes to their character.
- **Merchant lists:** a named list of shops (usually one city). The GM switches a list on to let players **browse** it, read only. Buying still needs the GM to present that shop.

Robb's answers this design keeps: the buyer chooses the payer every time; stock is optional per item; items go to the buyer's inventory; shops are shown only to players the GM presents them to, plus the read-only merchant list.

Out of the first build (open decisions, §9): haggling, selling items back, restocking rules, undoing a purchase.

## 2. Where it lives

- A new **Shops** tab in the Utilities window, between Party Inventory and Roll Tables.
  - GM: sub-tabs **Shops** (saved list), **Shop editor**, **Merchant lists**.
  - Players: **Open shops** (shops presented to them) and **Merchant list** (only lists the GM switched on). The tab shows for players only while Player Access is on and *Shops on for players* is on.
- **GM Setup → Shopping** holds settings only: *Shops on for players*, *Party must accept when a player spends the party purse*. No authoring there.
- A presented shop also pops up as its own small window on the player's client (same view as Open shops), so the player does not have to find the tab.
- Character Hub: no change in the first build. A later PR can add `embed.mount(el, {mode: 'shop'})`.

## 3. Data model

### Storage (no GM data in world settings)

World settings reach every client, so GM-only data must not go there. Utilities uses the same pattern as Locations:

| Store | Holds | Who can read |
|---|---|---|
| Journal **Utilities Shops (GM Data)**, one page per shop, record in `flags.ashen-gate-utilities.shop` | Full shop records, merchant lists (`flags.ashen-gate-utilities.merchantList` on one page), sales log | GM only (no player permission) |
| Journal **Utilities Shops (Player View)**, one page per presented shop or shown list | The player projection (§5), rebuilt by the GM client | Page ownership: Observer only for the players it is presented to (or everyone for a shown list) |
| Item copies inside each shop record | Item data snapshot (`toObject()` with container contents) | GM only |
| World setting `shopsEnabled` (Boolean) and `shopPurseVote` (String, `''` = follow the coin vote) | Settings only, no records | Everyone (harmless) |

Creating the journals is lazy (first save) and re-runnable: found by flag `flags.ashen-gate-utilities.store = 'shops-gm' | 'shops-player'`, never by name.

### Shop record

```json
{
  "schema": "ag-utilities-shop/1",
  "id": "SHOP-TEST-KETTLE",
  "name": "[TEST] The Copper Kettle",
  "merchant": {"name": "[TEST] Brin Tallow", "img": "assets/test/merchant-test.webp"},
  "flavour": "A cluttered general store.",
  "locationId": "LOC-TEST-MARKET",
  "gmNotes": "GM only text.",
  "lines": [ /* shop lines, below */ ],
  "presented": null,
  "createdAt": 0, "updatedAt": 0, "updatedBy": "userId"
}
```

- `id`: permanent, `SHOP-` + upper-case letters, digits, single hyphens. Made from the name on create (`SHOP-COPPER-KETTLE`, with `-2` if taken). Never reused after delete (kept in a `retiredIds` list on the GM Data journal).
- `locationId`: optional `LOC-*` id. Resolved through Locations' public API when it is active; ignored when it is not.
- `presented`: `null`, or `{mode: 'all' | 'users', userIds: [...], since, by}`. Live state, never imported.

### Shop line

```json
{
  "lineId": "ln_7f3a9c",
  "itemId": "ITEM-TEST-ROPE",
  "itemUuid": "Item.abc123",
  "item": { /* snapshot: Item toObject() */ },
  "contents": [ /* snapshots of items inside, when the item is a container */ ],
  "price": {"value": 1, "denomination": "gp"},
  "flavour": "Coiled and tarred against the damp.",
  "stock": 3,
  "stockStart": 3,
  "hidden": false,
  "cost": {"value": 5, "denomination": "sp"},
  "sort": 30
}
```

- `lineId`: local random id, stable inside the shop.
- `itemId`: the permanent id when the item has one (`flags.ashen-gate-manager.source.sourceId`), else `null`. Used to match lines on reimport.
- `itemUuid`: where it came from (world, compendium or actor). Only a hint for **Refresh from source**; the snapshot is what is sold, so a deleted world item does not break the shop.
- `price`: whole number ≥ 0 in one dnd5e denomination. Defaults to the item's `system.price`. Must come to a whole number of copper (`0.1 gp` is fine, `0.05 gp` is refused when saving).
- `stock`: `null` = unlimited, else a whole number ≥ 0 that counts down. `stockStart` is what **Restock** resets to.
- Per-purchase amount is the snapshot's own `system.quantity` (Arrows (20) sells 20 per purchase).
- `hidden` and `cost` are GM only.

### Merchant list

```json
{"id": "MLIST-TEST-TESTFORD", "name": "[TEST] Testford merchants", "locationId": "LOC-TEST-TESTFORD",
 "shopIds": ["SHOP-TEST-KETTLE", "SHOP-TEST-ANVIL"], "visible": false}
```

### Sale record (sales log and stash History)

```json
{"id": "s_…", "kind": "shop-purchase", "shopId": "SHOP-TEST-KETTLE", "lineId": "ln_…", "itemName": "Rope, Hempen (50 ft)",
 "quantity": 1, "price": {"value": 1, "denomination": "gp"}, "payFrom": "purse" | "actor",
 "payerId": "<stash or character actor id>", "actorId": "<receiver>", "userId": "…", "approval": "accepted" | "not-required" | "gm",
 "coinsBefore": {"cp":0,"sp":4,"ep":0,"gp":7,"pp":0}, "coinsAfter": {…}, "createdItemIds": ["…"], "realTime": 0}
```

Purchases paid from the purse are also added to stash History (new kind `shop-purchase`, additive; old entries unchanged). Players see their own purchases and purse purchases, without other characters' coin totals.

### Saved-data safety

All additive: two new journals, two new settings, one new History kind. No existing setting, flag or document changes. No migration needed.

## 4. Adding items (drops)

- The editor's item list is a drop zone: an Item from a character sheet, the Items sidebar, a compendium, or a **folder** of Items (adds each, skips non-Items).
- This follows the shared item-drop standard being written on branch `design/rewards-loot`. When it lands, Shopping uses its helper and wording; anything here that differs gives way to it.
- A container is added with its contents (same `containedItems` / `moveBundle` rules as the stash, Utilities 0.13.1). Dropping never moves or deletes the source item: the shop keeps a copy.
- The same item dropped twice adds a second line (the GM may want two prices). The editor warns "Already in this shop".

## 5. What players get (projection)

Built on the GM client, written to the Player View journal, never containing GM data:

```json
{"id": "SHOP-TEST-KETTLE", "name": "…", "merchant": {"name": "…", "img": "…"}, "flavour": "…",
 "location": {"name": "[TEST] Market Ward"},
 "lines": [{"lineId": "ln_…", "name": "Rope, Hempen (50 ft)", "img": "…", "type": "Gear", "per": 1,
            "price": {"value": 1, "denomination": "gp"}, "flavour": "…", "stock": 3, "soldOut": false,
            "description": "<item description, enriched for players>"}],
 "rev": 12}
```

- Left out: `hidden` lines, `cost`, `gmNotes`, `itemUuid`, `itemId`, snapshots, sales, who else it is presented to.
- `location` only when Locations says the place is revealed to everyone; otherwise left out.
- Unidentified items show their unidentified name and description (dnd5e `system.identified === false`).
- `description` is the item's own player-facing description; secret blocks (`<section class="secret">`) are stripped.

## 6. API

`game.modules.get('ashen-gate-utilities').api.shops`, contract `ag-utilities-shops/1`. Every call is checked inside the API, not only by hiding buttons.

| Call | Who | Notes |
|---|---|---|
| `list({search, sort})` | GM | `sort`: `location` (default, grouped by city), `name`, `merchant`, `updated` |
| `get(id)` | GM | full record |
| `create(data)`, `save(record)`, `duplicate(id)`, `delete(id)` | GM | delete needs `{confirm: true}`; refused while presented |
| `addItems(id, uuids | dropData)` | GM | returns `{added, skipped: [{name, reason}]}` |
| `present(id, {mode, userIds})`, `stopShowing(id)`, `presented()` | GM | `presented()` lists shops shown right now |
| `restock(id, lineIds?)` | GM | stock back to `stockStart` |
| `importShops(records, {mode: 'create' | 'update'})`, `exportShops(ids?)` | GM | §8 |
| `sales(id)` | GM | the shop's sales log |
| `merchants.list()`, `merchants.save(list)`, `merchants.setVisible(id, bool)`, `merchants.delete(id)` | GM | |
| `open(id?)` | anyone allowed | opens the Shops tab, or the shop window |
| `forMe()` | player or GM | projections of shops presented to this user |
| `browse()` | player or GM | projections of shops in visible merchant lists (read only) |
| `quote({shopId, lineId, quantity, payFrom, actorId})` | player or GM | the payment plan, nothing changes |
| `buy({shopId, lineId, quantity, payFrom, actorId, rev})` | player or GM | §7; `payFrom`: `'purse'` or `'actor'` |

Refusals use the existing wording style: `GM only.`, `Utilities is hidden for players.`, `The GM has turned shops off.`, `This shop is not open for you.`

## 7. The purchase

### Payment rules

- Coin values (dnd5e and 2024 rules): 1 pp = 10 gp, 1 gp = 2 ep = 10 sp = 100 cp. All maths in whole copper, so there is no rounding.
- Total = price × quantity. Refused if the payer's coins are worth less.
- Which coins go: the price's own coin first, then smaller coins, then the smallest larger coins needed. Change comes back as gp, then sp, then cp (never ep or pp). The player sees the net result before confirming, e.g. "You pay 2 gp, change back 5 sp".
- No coin ever goes below 0. One `update` per payer: only `system.currency.*` changes.
- This is the first place Utilities makes change; the purse's own Deposit/Take still never converts (open decision D1).

### Who may buy

The GM client re-checks all of this when it carries out the purchase:

1. Player Access on, shops on for players (GM always passes).
2. The shop is presented to this user right now. A merchant list never allows buying.
3. The line exists, is not hidden, and `rev` matches (else "The shop changed. Look again.").
4. Quantity is a whole number from 1, at most the stock left.
5. The receiving character is owned by the user.
6. Paying from own coins: the user owns that character. Paying from the purse: the stash exists, and if *Party must accept when a player spends the party purse* is on, the party vote runs first (same 60 s poll as stash take-outs; the GM is never asked).

### Steps (GM client, one purchase at a time per shop)

```
player: api.shops.buy(...)  → socket 'shop-buy' {requestId, …}
GM:     checks 1–6 (after any vote, checks 3–5 again)
GM:     plan payment from fresh coin totals
GM:     A. create the item copies on the buyer (fresh ids, container contents linked), check they all arrived
GM:     B. update the payer's currency (one update)
GM:     C. lower stock and write the sale (GM Data page), then rebuild the player projection
GM:     D. log to stash History (purse purchases), receipt to the buyer, optional chat card
```

### Failures: all or nothing

| Fails at | What happens | Player sees |
|---|---|---|
| Checks, vote denied or timed out | Nothing changes. Denied/timed-out purse votes are logged like a take-out | The reason. "Nothing was charged." |
| A (items) | Copies made so far are deleted | "Could not add the item. Nothing was charged." |
| B (coins) | The copies from A are deleted | "Payment failed. Nothing was charged and nothing was given." |
| C (stock or log) | Coins are put back, copies deleted | Same as B. If putting back also fails, the GM gets a whisper naming exactly what to fix by hand |
| No GM connected | Not sent | "A GM must be connected." |
| GM answer slow | The player's request stops waiting after 15 s (75 s with a vote) | "The GM did not answer." The GM still finishes or refuses it, and the player then gets a whisper with the real result. The same `requestId` is never carried out twice |

Two players buying the last one: the GM client handles them in order; the second gets "Sold out. Nothing was charged."

## 8. Import (GPT-authored shops)

Shop records go in an `ag-foundry-import/0.2` package with `entity_type: "Shop"` (and `"MerchantList"`). General Manager, when it sees Utilities with `api.shops.importShops`, creates the package's Items first, then hands the Shop records to Utilities in the same run. Utilities **GM Setup → Import JSON** (Shops tab → Import JSON) reads the same records for a shops-only file.

- A shop whose `id` exists is **kept as it is** (default). `mode: 'update'` replaces name, merchant, flavour and lines from the file, but keeps stock left, presentation, sales and lines the GM added by hand.
- Each line names `item_id` (an `ITEM-*` or other canonical id, found by `flags.ashen-gate-manager.source.sourceId`) or `item_uuid` (e.g. a compendium Item). Not found: that line is skipped and reported; the rest of the shop imports.
- Import never creates live state: `presented` is always `null` and merchant lists import hidden.

Synthetic example:

```json
{
  "format": "ag-foundry-import/0.2",
  "records": [
    {
      "id": "SHOP-TEST-TANNER",
      "entity_type": "Shop",
      "status": "draft",
      "version": "1.0.0",
      "name": "[TEST] Tanner's Stall",
      "visibility": "gm",
      "refs": [{"relation": "located_at", "target_id": "LOC-TEST-MARKET", "mode": "optional"}],
      "shop": {
        "merchant_name": "[TEST] Hollis Reed",
        "merchant_img": "assets/test/merchant-test.webp",
        "flavour": "Smells of oak bark and fresh leather.",
        "location_id": "LOC-TEST-MARKET",
        "gm_notes": "Synthetic test shop.",
        "lines": [
          {"item_id": "ITEM-TEST-LEATHER-ARMOR", "price": {"value": 10, "denomination": "gp"}, "stock": 2, "flavour": "Supple and well stitched.", "cost": {"value": 6, "denomination": "gp"}},
          {"item_id": "ITEM-TEST-WATERSKIN", "price": {"value": 2, "denomination": "sp"}},
          {"item_uuid": "Compendium.dnd5e.equipment24.Item.EXAMPLEID000001", "price": {"value": 5, "denomination": "sp"}, "stock": 6},
          {"item_id": "ITEM-TEST-HIDE-BUNDLE", "price": {"value": 3, "denomination": "gp"}, "hidden": true}
        ]
      }
    },
    {
      "id": "MLIST-TEST-TESTFORD",
      "entity_type": "MerchantList",
      "status": "draft",
      "version": "1.0.0",
      "name": "[TEST] Testford merchants",
      "merchant_list": {"location_id": "LOC-TEST-TESTFORD", "shop_ids": ["SHOP-TEST-TANNER"]}
    }
  ]
}
```

Field rules are in `docs/shopping-for-gpt.md`. A `validate-content.mjs` check comes with the import PR.

## 9. Open decisions (recommended default first)

| # | Question | Recommended default | Other options |
|---|---|---|---|
| D1 | Making change | Shops make change (§7); the purse's Deposit/Take stays exact-coin | Exact coin only (buyer must hold the price's coin) |
| D2 | Spending the party purse in a shop | Needs the party vote when *Party must accept when a player spends the party purse* is on; until saved it follows the coin vote | Never vote; always vote |
| D3 | Haggling | Not in v1. Later: the GM sets a per-presentation discount or markup % for a player when presenting | Player asks, GM approves a price in a prompt |
| D4 | Selling items back | Not in v1. Later: GM-presented "buys" list, default half price (2024 rules), GM approves each sale | Never |
| D5 | Restocking | Manual **Restock** button (to `stockStart`); no automatic restock | Restock on a long rest or a game-time interval |
| D6 | Linked location | Optional `LOC-*`; used for grouping and shown to players only once revealed in Locations | Required for merchant lists |
| D7 | Merchant portrait | Image path per shop (Foundry file picker), initials when empty | Use an NPC Actor's portrait (link to an Actor) |
| D8 | Undo a purchase | GM **Undo** in History in a later PR: takes the items back if still held, refunds coins | No undo; GM fixes by hand |
| D9 | Who may receive | Only a character the buyer owns | Any party member (goes to their inventory, not the buyer's) |
| D10 | A shop presented to "all players" | Includes players who log in later, until Stop showing | Only players connected at that moment |

## 10. Build plan (small PRs, each a Utilities minor version)

1. **0.14.0 Shop rules (no UI).** Pure functions in `core.mjs`: price to copper, `planShopPayment`, line validation, projection, id making, purchase plan. Tests for change-making, no negatives, sold out, hidden lines never projected.
2. **0.15.0 Shops tab for the GM.** GM Data journal, Shops list with search/sort/grouping, editor, drop zone (with the shared drop helper), duplicate/delete with confirmation, GM API (`list/get/create/save/duplicate/delete/addItems`). Players see nothing yet.
3. **0.16.0 Present and buy.** Player View journal, `present/stopShowing/forMe/quote/buy`, the socket purchase with rollback, purse vote, History kind `shop-purchase`, player shop window. GM Setup → Shopping settings.
4. **0.17.0 Merchant lists.** Lists, read-only browse, Locations link (feature-detected).
5. **0.18.0 Import/export** in Utilities, plus `docs/shop-schema.md` and a `validate-content.mjs` check. Then a **Manager** PR to route `Shop`/`MerchantList` records to Utilities.
6. Later (each only once Robb decides): Undo (D8), restock rules (D5), haggling (D3), selling back (D4), Character Hub embed.

Each PR: version bump in `module.json` (version and download URL) and `core.mjs`, CHANGELOG entry, `node scripts/check.mjs ashen-gate-utilities`, README section, and what to click in Forge to test it.
