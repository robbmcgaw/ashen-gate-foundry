# Shopping and services in Utilities: design (FINAL)

**Status: FINAL** (Robb's decisions, 2026-10-21, §9). Selling details S1–S9 (§7c) decided too. Not built yet: build briefs in `docs/shopping-briefs/`. Module: Ashen Gate | Utilities (`ashen-gate-utilities`, 0.13.2 on main). Target: Foundry V14 on The Forge, dnd5e 6.0.6, 2024 rules.

Look and feel: the shared UI standard (`docs/ui-standard.md` on branch `design/ui-standard`), direction D Rounded Compact with the Comfortable size, kit-2 components only. The mockup below shows behaviour and content, not the final styling.

Mockup (private artifact): https://claude.ai/artifact/8danqfZAjEWaTi1o55rprj

## 1. What it does

- The GM builds **shops**: a merchant name and art, flavour text, an optional linked Location, and a list of items. Each item has a price, optional flavour text and optional stock.
- The GM saves, searches and sorts shops in a new **Shops** tab.
- **Present** opens a shop for one, some or all players. Only those players can buy from it, until the GM clicks **Stop showing**.
- A player buys an item: picks a quantity and who pays (the **party purse** or **their own character's coins**), sees the total and the change, confirms. The item goes to their character.
- **Shop purse (optional):** the merchant's cash on hand. Off by default; the GM turns one on per shop. Purchases add coins to it, change comes out of it, and it pays when the shop buys from players. No purse = unlimited cash. Players see the merchant's coins in the shop window by default; the GM can hide them per shop.
- **Selling to a shop:** a shop can buy items from players at a percent of the item's price set by the GM (default 50 %). The player confirms in a dialog showing the item, the price and who pays (§7c).
- **No electrum.** Shops use cp, sp, gp and pp. Electrum appears only if the GM turns on Utilities' *Use electrum* setting (§7).
- **Services:** a second kind of entry beside shops, for things that are not items for sale. They use the same Present and merchant-list rules. The first service is a **Bank** that changes coins between denominations (§7b). Robb will add other service types later; the record is built so a new type is a small addition.
- **Merchant lists:** a named list of shops and services (usually one city). The GM switches a list on to let players **browse** it, read only. Buying still needs the GM to present that shop.

Robb's answers this design keeps: the buyer chooses the payer every time; stock is optional per item; items go to the buyer's inventory; shops are shown only to players the GM presents them to, plus the read-only merchant list.

Not in this build: haggling (D3), automatic restocking (D5), Undo (D8, a later PR).

## 2. Where it lives

- A new **Shops** tab in the Utilities window, between Party Inventory and Roll Tables.
  - GM: sub-tabs **Shops** (saved list), **Shop editor**, **Merchant lists**.
  - Players: **Open shops** (shops presented to them) and **Merchant list** (only lists the GM switched on). The tab shows for players only while Player Access is on and *Shops on for players* is on.
- **GM Setup → Shopping** holds settings only: *Shops on for players*, *Party must accept when a player spends the party purse*. No authoring there.
- A presented shop also pops up as its own small window on the player's client (same view as Open shops), so the player does not have to find the tab.
- Character Hub: no change in the first build. A later PR can add `embed.mount(el, {mode: 'shop'})`.
- **UI:** every window and dialog is built from kit-2 parts (`docs/ui-standard.md` §3–4): `.ag-header`, `.ag-tabs--scroll`, `.ag-toolbar` with `.ag-search`, `.ag-rows` for the saved-shops list (grouped under `.ag-eyebrow` by city), `.ag-table` for item lines, `.ag-card` for merchant lists, `.ag-form-grid` / `.ag-field` for the editor, `.ag-footer` (Cancel left, Save Changes right), `.ag-badge` for Shown / Hidden / Sold out / GM only, `.ag-notice` for refusals, `.ag-empty` for empty states, `.ag-segmented` for Party purse / Own coins, and `ag-dialogs.mjs` `confirmDialog` / `formDialog` for Present, Buy, Sell, Top up and Delete. Sizes come from tokens, so Compact and Comfortable both work.

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
  "purse": {"cp": 40, "sp": 25, "gp": 30, "pp": 0},
  "purseStart": {"cp": 40, "sp": 25, "gp": 30, "pp": 0},
  "showPurse": true,
  "buys": {"enabled": false, "percent": 50, "types": []},
  "lines": [ /* shop lines, below */ ],
  "presented": null,
  "createdAt": 0, "updatedAt": 0, "updatedBy": "userId"
}
```

- `id`: permanent, `SHOP-` + upper-case letters, digits, single hyphens. Made from the name on create (`SHOP-COPPER-KETTLE`, with `-2` if taken). Never reused after delete (kept in a `retiredIds` list on the GM Data journal).
- `locationId`: optional `LOC-*` id. Resolved through Locations' public API when it is active; ignored when it is not.
- `purse`: the shop's coins now, or `null` = no purse (unlimited cash: change is always available and takings are not counted). Whole numbers ≥ 0 per coin. `ep` appears only while *Use electrum* is on.
- `purseStart`: what **Restock cash** resets the purse to (GM button, never automatic).
- `showPurse`: `true` (default) shows players the merchant's coins in the shop window. `false` keeps the amount GM only (per shop, **Show merchant's coins to players**).
- `buys`: selling to the shop (§7c). `enabled` off by default; `percent` whole number 1–100, default 50; `types` dnd5e item types it buys (`[]` = all physical types).
- `presented`: `null`, or `{mode: 'all' | 'users', userIds: [...], since, by}`. Live state, never imported.

### Shop line

```json
{
  "lineId": "ln_7f3a9c",
  "itemId": "ITEM-TEST-ROPE",
  "itemUuid": "Item.abc123",
  "item": { /* snapshot: Item toObject() */ },
  "contents": [ /* snapshots of items inside, when the item is a container */ ],
  "priceCp": 100,
  "priceCoin": "gp",
  "flavour": "Coiled and tarred against the damp.",
  "stock": 3,
  "stockStart": 3,
  "hidden": false,
  "costCp": 50,
  "sort": 30
}
```

- `lineId`: local random id, stable inside the shop.
- `itemId`: the permanent id when the item has one (`flags.ashen-gate-manager.source.sourceId`), else `null`. Used to match lines on reimport.
- `itemUuid`: where it came from (world, compendium or actor). Only a hint for **Refresh from source**; the snapshot is what is sold, so a deleted world item does not break the shop.
- `priceCp`: the price as whole copper (≥ 0). `priceCoin` is only how it is shown (`cp`, `sp`, `gp`, `pp`): 150 cp with `priceCoin: 'sp'` shows "15 sp"; a price that does not divide shows mixed ("1 gp 5 sp"). The editor takes a number and a coin and stores copper. Defaults to the item's `system.price`. A price that is not whole copper (`0.05 gp`) is refused when saving. An item priced in ep (dnd5e allows it) is converted on add (1 ep = 50 cp) and shown in sp while electrum is off.
- `stock`: `null` = unlimited, else a whole number ≥ 0 that counts down. `stockStart` is what **Restock** resets to.
- Per-purchase amount is the snapshot's own `system.quantity` (Arrows (20) sells 20 per purchase).
- `hidden` and `cost` are GM only.

### Service record

A service is stored like a shop (same GM Data journal, same `presented`, `merchant`, `flavour`, `locationId`, `gmNotes`), with no item lines and no shop purse:

```json
{
  "schema": "ag-utilities-service/1",
  "id": "SVC-TEST-COUNTING-HOUSE",
  "kind": "service",
  "name": "[TEST] Counting House",
  "merchant": {"name": "[TEST] Clerk Ames", "img": ""},
  "flavour": "Brass scales and a bored clerk.",
  "locationId": "LOC-TEST-MARKET",
  "service": {"type": "bank", "settings": {"feePercent": 0}},
  "presented": null
}
```

- `id`: permanent, `SVC-` + upper-case letters, digits, single hyphens.
- `service.type`: a registered service type id (`bank` for now). `service.settings`: that type's own settings, checked by the type.
- A record whose type this Utilities version doesn't know is kept untouched, listed for the GM as "Unknown service type", and never offered to players.

### Merchant list

```json
{"id": "MLIST-TEST-TESTFORD", "name": "[TEST] Testford merchants", "locationId": "LOC-TEST-TESTFORD",
 "shopIds": ["SHOP-TEST-KETTLE", "SHOP-TEST-ANVIL", "SVC-TEST-COUNTING-HOUSE"], "visible": false}
```

`shopIds` holds shops and services, in the order players see them.

### Sale record (sales log and stash History)

```json
{"id": "s_…", "kind": "shop-purchase", "shopId": "SHOP-TEST-KETTLE", "lineId": "ln_…", "itemName": "Rope, Hempen (50 ft)",
 "quantity": 1, "totalCp": 100, "payFrom": "purse" | "actor",
 "payerId": "<stash or character actor id>", "actorId": "<receiver>", "userId": "…", "approval": "accepted" | "not-required" | "gm",
 "coinsBefore": {"cp":0,"sp":4,"gp":7,"pp":0}, "coinsAfter": {…},
 "shopPurseBefore": {…} | null, "shopPurseAfter": {…} | null, "createdItemIds": ["…"], "realTime": 0}
```

Purchases paid from the purse are also added to stash History (new kind `shop-purchase`, additive; old entries unchanged). Players see their own purchases and purse purchases, without other characters' coin totals.

### Saved-data safety

Shop purse adjustments by the GM are logged in the sales log too (`kind: 'shop-purse-adjust'`, with reason).

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
            "priceCp": 100, "priceText": "1 gp", "flavour": "…", "stock": 3, "soldOut": false,
            "description": "<item description, enriched for players>"}],
 "purse": {"cp": 40, "sp": 25, "gp": 30, "pp": 0},
 "rev": 12}
```

- `purse`: the shop's current coins when the shop has a purse and `showPurse` is on (the default); `null` when there is no purse or the GM hid it. Rebuilt after every sale and every GM purse change.
- Left out: `hidden` lines, `costCp`, the shop purse when hidden, `purseStart`, `gmNotes`, `itemUuid`, `itemId`, snapshots, sales, who else it is presented to.
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
| `quoteSell({shopId, itemId, actorId, quantity, payTo})`, `sell({...same, rev})` | player or GM | §7c; `payTo`: `'actor'` or `'purse'` |
| `restock(id, lineIds?)` | GM | stock back to `stockStart` |
| `adjustPurse(id, {op: 'add' \| 'remove' \| 'set', coin, amount, reason})`, `setPurse(id, coins \| null)`, `restockCash(id)` | GM | the shop purse; `null` removes it (unlimited cash); never below 0; logged |
| `importShops(records, {mode: 'create' | 'update'})`, `exportShops(ids?)` | GM | §8 |
| `sales(id)` | GM | the shop's sales log |
| `services.list()`, `services.get(id)`, `services.create(data)` and the other CRUD calls | GM | same as shops; `services.types()` lists known types |
| `services.quote({serviceId, ...request})`, `services.use({serviceId, ...request})` | player or GM | Bank request: `{payFrom: 'purse' \| 'actor', actorId, from, to, receive}` |
| `merchants.list()`, `merchants.save(list)`, `merchants.setVisible(id, bool)`, `merchants.delete(id)` | GM | |
| `open(id?)` | anyone allowed | opens the Shops tab, or the shop window |
| `forMe()` | player or GM | projections of shops presented to this user |
| `browse()` | player or GM | projections of shops in visible merchant lists (read only) |
| `quote({shopId, lineId, quantity, payFrom, actorId})` | player or GM | the payment plan (or the "can't make change" refusal), nothing changes; reveals the shop purse only when it is shown |
| `buy({shopId, lineId, quantity, payFrom, actorId, rev})` | player or GM | §7; `payFrom`: `'purse'` or `'actor'` |

Refusals use the existing wording style: `GM only.`, `Utilities is hidden for players.`, `The GM has turned shops off.`, `This shop is not open for you.`

## 7. The purchase

### Payment rules

- Coin values (dnd5e and 2024 rules): 1 pp = 10 gp = 100 sp = 1000 cp. All maths in whole copper, so there is no rounding.
- Total = price × quantity. Refused if the payer's coins are worth less.
- Which coins go: the price's own coin first, then smaller coins, then the smallest larger coins needed. Change is given as gp, then sp, then cp, largest first. The player sees the net result before confirming, e.g. "You pay 2 gp, change back 5 sp".
- No coin ever goes below 0, on the payer or in the shop purse. One `update` per payer: only `system.currency.*` changes.
- This is the first place Utilities makes change; the party purse's own Deposit/Take still never converts (D1).

### Electrum

- Utilities 0.13.2 (on main) has the GM setting *Use electrum* (default off), `api.currency.electrumEnabled()` / `coins()` and the hook `ashen-gate-utilities.electrumChanged`. Shops live in Utilities, so they read the same setting directly and re-render on the hook.
- **Off (default):** shops never show, take or give ep. Prices, totals, coin strips and change use cp, sp, gp, pp. Electrum a character already holds is left alone: not shown in the shop, not spent.
- **On:** ep is shown and may be spent (1 ep = 50 cp), and a price may be shown in ep. Change is still never given in ep.
- Prices are stored as copper, so switching the setting never changes a price, only how it is shown.

### Shop purse and change

- **No purse** (`purse: null`): the merchant always has change. Coins paid are not counted anywhere.
- **With a purse:** the coins the buyer hands over go into it, and the change comes out of it. If it cannot make change from what it holds, the plan tries again:
  1. the normal plan (above), with change taken from the shop purse (largest coins first);
  2. else **exact payment** from the payer's coins (no change needed), if their coins allow it;
  3. else the purchase is refused: "The merchant can't make change for this. Pay with the other purse, or ask the GM." Nothing is charged.
- The GM gets the same refusal as a whisper, with a **Top up shop purse** button (Add / Remove / Set, reason, labelled confirmation, like Adjust Purse). There is no automatic top-up.
- Players see how much the shop holds while `showPurse` is on (default). When the GM hides it, refusals still say "can't make change" but never give amounts.
- When the shop buys from a player (§7c) it pays from the shop purse; refused when it holds too little, unlimited when there is no purse.

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
GM:     plan payment from fresh coin totals and the fresh shop purse
GM:     A. create the item copies on the buyer (fresh ids, container contents linked), check they all arrived
GM:     B. update the payer's currency (one update)
GM:     C. one update of the shop's GM Data page: lower stock, update the shop purse, add the sale;
            then rebuild the player projection
GM:     D. log to stash History (purse purchases), receipt to the buyer, optional chat card
```

### Failures: all or nothing

| Fails at | What happens | Player sees |
|---|---|---|
| Checks, vote denied or timed out | Nothing changes. Denied/timed-out purse votes are logged like a take-out | The reason. "Nothing was charged." |
| A (items) | Copies made so far are deleted | "Could not add the item. Nothing was charged." |
| B (coins) | The copies from A are deleted | "Payment failed. Nothing was charged and nothing was given." |
| Shop purse can't make change | Nothing changes (checked before A) | "The merchant can't make change…" (§7) |
| C (stock, shop purse, sale) | Coins are put back, copies deleted | Same as B. If putting back also fails, the GM gets a whisper naming exactly what to fix by hand |
| No GM connected | Not sent | "A GM must be connected." |
| GM answer slow | The player's request stops waiting after 15 s (75 s with a vote) | "The GM did not answer." The GM still finishes or refuses it, and the player then gets a whisper with the real result. The same `requestId` is never carried out twice |

Two players buying the last one: the GM client handles them in order; the second gets "Sold out. Nothing was charged."

## 7b. Services

### How a service type plugs in

Each type is one entry in a registry inside Utilities (not a public extension point for now):

```js
SERVICE_TYPES.bank = {
  id: 'bank', label: 'Bank',
  defaults: () => ({feePercent: 0}),
  checkSettings(settings),             // throws on bad settings; used by the editor and import
  renderEditor(settings),              // GM settings block in the editor
  renderPlayer(projection, ctx),       // the player window
  quote(request, ctx),                 // pure plan: what changes, or a refusal; nothing written
  execute(request, ctx)                // GM client only: carries out the plan, all or nothing
};
```

- Players call `api.services.quote(...)` / `api.services.use({serviceId, ...request})`. `use` goes over the same socket as purchases (`service-use`). The GM client runs the shared checks (Player Access, shops on, presented to this user, owns the character, party vote if one applies), then the type's `quote` on fresh data, then its `execute`.
- `execute` gets the same helpers as a purchase: one currency update per actor with put-back on failure, item create with delete on failure, a History write, and the receipt. A new type mostly writes `quote` and the two renderers.
- A service shows in merchant lists like a shop. Browsing is read only, so the player window shows the service but its action button is disabled unless the service is presented.

### The Bank (first service)

A UI element, no special mechanics.

- The player picks **whose coins** (their character or the party purse), **from** coin, **to** coin and **how many to receive**. Coins: cp, sp, gp, pp (ep only while *Use electrum* is on).
- Standard rates, exact: 1 sp = 10 cp, 1 gp = 10 sp, 1 pp = 10 gp. Whole copper only, so nothing is rounded.
- The player says how many coins they want to **get**; the bank works out what they give. "Get 2 gp" from copper uses exactly 200 cp. "Get 20 sp" from gold uses 2 gp; asking for 25 sp from gold is refused with "Ask for a multiple of 10 sp", because 2.5 gp is not a whole coin.
- Preview, then **Confirm**: "You give 200 cp, you get 2 gp. Copper 245 → 45, gold 7 → 9." Refused if the coins aren't there.
- One currency update on the chosen actor (both coins in the same update), so it is all or nothing by itself.
- Recorded in stash History as kind `bank-exchange` (who, whose coins, from, to, amounts, fee). Players see their own exchanges and party purse exchanges.
- The bank has unlimited coins. It has no purse.
- **Party purse:** changing the purse's coins needs **no party vote**. Nothing leaves the party, and the History line shows it (D13).
- **Fee (optional, cheap, so included):** per-bank setting `feePercent`, 0 to 50, default 0 (none). The fee is taken in the *from* coin, rounded **up** to a whole coin, added on top: getting 2 gp from silver at 10 % costs 20 sp + 2 sp. It costs one multiplication and one round-up in `quote`, and one line in the preview. Nothing else.


## 7c. Selling to a shop (in v1)

Decided (Robb, 2026-10-21): a shop can buy items from players at a percent of the item's price, set by the GM per shop (default 50 %, the 2024 rule of thumb for selling equipment). The player must confirm in a dialog that shows the item, the price and who pays before anything happens.

**Decided (Robb, 2026-10-21), S1–S9:**

| # | Question | Decision |
|---|---|---|
| S1 | Which shops buy | Per-shop switch **Buys from players**, default **off**. Only a shop that is presented to the player and has it on buys. A merchant list never buys |
| S2 | What it buys | Any physical item (dnd5e types weapon, equipment, consumable, tool, loot; not containers, see S7) with a price above 0, optionally narrowed by a per-shop list of item types (default: all). Never: features, spells, perks, items worth less than 1 cp at the sell price, items the GM marked *Not for sale* (`flags.ashen-gate-utilities.noSale`) |
| S3 | Sell price | `percent` × the item's own dnd5e price × quantity sold, rounded **down** to whole copper. The shop's listed price is not used. A stack can be sold in part (pick a quantity) |
| S4 | Who pays | The shop purse when the shop has one; no purse = unlimited money. Paid in the largest coins the purse holds. If it can't afford the item or can't pay the exact amount, the sale is refused and the **player is told plainly**: "Sorry, the vendor can't afford that." (amount named only when the merchant's coins are shown). The GM gets a whisper with a **Top up shop purse** button |
| S5 | Where the coins go | The seller chooses, like buying: their character's coins or the party purse. No party vote (coins come in, nothing leaves) |
| S6 | Where the item goes | Into the shop. A line with the same `itemId` (or same name and type when there is no id) gets its stock raised (unlimited stays unlimited); otherwise a new line is added **hidden**, priced at the item's own price, for the GM to show or remove |
| S7 | Equipped, attuned, containers | **Containers are never sold**: "Containers can't be sold. Empty it and sell the items separately." Equipped or attuned items are refused: "Unequip it first." |
| S8 | Whose items | Only items on a character the seller owns. Not from the party stash in v1 |
| S9 | Undo | No GM approval step. GM **Undo** in History comes with D8 (later PR): gives the item back and takes the coins back if both are still there |

**Steps (GM client, same queue as purchases for that shop):**

```
player: api.shops.sell({shopId, itemId, actorId, quantity, payTo, rev}) → socket 'shop-sell'
GM:     checks (presented, Buys from players on, S2, S7, S8), price from fresh item data (S3)
GM:     plan the payout from the fresh shop purse (S4)
GM:     A. one update of the shop's GM Data page: purse minus payout, stock or new hidden line (S6), sale entry
GM:     B. pay the receiver (one currency update);            fails → undo A
GM:     C. remove the item from the seller;                 fails → take the coins back, undo A
GM:     D. History kind 'shop-sale', receipt, rebuild the player view
```

The item is removed last, so a failure at any step leaves the player holding their item and no coins moved. The dialog, the refusals and the History line use item and character names, never ids.

## 8. Import (GPT-authored shops and services)

Shop records go in an `ag-foundry-import/0.2` package (a `manifest` block with `schema_version`, `package_id`, `version`, then `records`) with `entity_type: "Shop"`, `"Service"` and `"MerchantList"`, next to the Items they sell. Every record has the standard envelope: `id`, `entity_type`, `status`, `version`, `provenance`, `visibility`, `refs`.

- **Built in Utilities 0.21.0** (GM only): **Shops → Import JSON** previews each record (Create, Update, Kept, Skipped with the reason) and imports; **Shops → Export** writes the same format. General Manager checks these packages; routing them from Manager's Import is a later Manager update. Full field rules: `docs/shop-schema.md`; test files: `test-fixtures/shops/`.
- A record whose `id` exists is **kept as it is** by default. With **Update shops that already exist**, a shop's name, merchant, flavour and lines come from the file (a service: name, merchant, flavour, settings; a list: name and entries).
- **An update never touches play state:** nothing is presented by an import, lists come in hidden (a shown list stays shown), and an update keeps stock left, hand-added lines, lines bought from players, the merchant's coins now, the sales log, and the shop's linked location and GM notes. `purse`, `show_purse` and `buys` apply only when a shop is created.
- Each line names `item_id` (an `ITEM-*` or other canonical id, found by `flags.ashen-gate-manager.source.sourceId`) or `item_uuid` (e.g. a compendium Item). Not found: that line is skipped and reported; the rest of the shop imports.
- `shop.purse` (optional) is the starting cash. It sets `purse` and `purseStart` only when the shop is **created**; an update never changes the cash the shop has now. Leave it out for no purse (unlimited cash). `shop.show_purse` (optional, default `true`) sets `showPurse`.
- Prices in the file are `{value, denomination}` with `cp`, `sp`, `gp` or `pp`; they are stored as copper. `ep` is refused while *Use electrum* is off.

Synthetic example:

```json
{
  "manifest": {
    "schema_version": "ag-foundry-import/0.2",
    "package_id": "AG-TEST-SHOPS",
    "version": "1.0.0",
    "description": "Synthetic shop, bank and merchant list for testing (not canon)."
  },
  "records": [
    {
      "id": "ITEM-TEST-LEATHER-ARMOR",
      "entity_type": "Item",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {"sources": ["Synthetic test data (not canon)"]},
      "visibility": "player",
      "refs": [],
      "foundry": {
        "document_type": "Item",
        "folder_path": "Ashen Gate/Test/Shops",
        "data": {
          "name": "[TEST] Leather Armor",
          "type": "equipment",
          "system": {"quantity": 1, "price": {"value": 10, "denomination": "gp"}}
        }
      }
    },
    {
      "id": "ITEM-TEST-WATERSKIN",
      "entity_type": "Item",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {"sources": ["Synthetic test data (not canon)"]},
      "visibility": "player",
      "refs": [],
      "foundry": {
        "document_type": "Item",
        "folder_path": "Ashen Gate/Test/Shops",
        "data": {
          "name": "[TEST] Waterskin",
          "type": "loot",
          "system": {"quantity": 1, "price": {"value": 2, "denomination": "sp"}}
        }
      }
    },
    {
      "id": "ITEM-TEST-HIDE-BUNDLE",
      "entity_type": "Item",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {"sources": ["Synthetic test data (not canon)"]},
      "visibility": "player",
      "refs": [],
      "foundry": {
        "document_type": "Item",
        "folder_path": "Ashen Gate/Test/Shops",
        "data": {
          "name": "[TEST] Hide Bundle",
          "type": "loot",
          "system": {"quantity": 1, "price": {"value": 3, "denomination": "gp"}}
        }
      }
    },
    {
      "id": "SHOP-TEST-TANNER",
      "entity_type": "Shop",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {"sources": ["Synthetic test data (not canon)"]},
      "visibility": "gm",
      "refs": [{"relation": "located_at", "target_id": "LOC-TEST-MARKET", "mode": "optional"}],
      "name": "[TEST] Tanner's Stall",
      "shop": {
        "merchant_name": "[TEST] Hollis Reed",
        "flavour": "Smells of oak bark and fresh leather.",
        "location_id": "LOC-TEST-MARKET",
        "gm_notes": "Synthetic test shop.",
        "purse": {"cp": 50, "sp": 30, "gp": 20, "pp": 0},
        "show_purse": true,
        "buys": {"enabled": true, "percent": 50, "types": ["equipment", "loot"]},
        "lines": [
          {
            "item_id": "ITEM-TEST-LEATHER-ARMOR",
            "price": {"value": 10, "denomination": "gp"},
            "stock": 2,
            "flavour": "Supple and well stitched.",
            "cost": {"value": 6, "denomination": "gp"}
          },
          {"item_id": "ITEM-TEST-WATERSKIN", "price": {"value": 2, "denomination": "sp"}},
          {
            "item_id": "ITEM-TEST-HIDE-BUNDLE",
            "price": {"value": 3, "denomination": "gp"},
            "hidden": true,
            "cost": {"value": 1, "denomination": "gp"}
          }
        ]
      }
    },
    {
      "id": "SVC-TEST-COUNTING-HOUSE",
      "entity_type": "Service",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {"sources": ["Synthetic test data (not canon)"]},
      "visibility": "gm",
      "refs": [],
      "name": "[TEST] Counting House",
      "service": {
        "type": "bank",
        "merchant_name": "[TEST] Clerk Ames",
        "flavour": "Brass scales and a bored clerk.",
        "location_id": "LOC-TEST-MARKET",
        "settings": {"fee_percent": 0}
      }
    },
    {
      "id": "MLIST-TEST-TESTFORD",
      "entity_type": "MerchantList",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {"sources": ["Synthetic test data (not canon)"]},
      "visibility": "gm",
      "refs": [],
      "name": "[TEST] Testford merchants",
      "merchant_list": {"location_id": "LOC-TEST-TESTFORD", "shop_ids": ["SHOP-TEST-TANNER", "SVC-TEST-COUNTING-HOUSE"]}
    }
  ]
}
```

This is `test-fixtures/shops/AG_Test_Shops.json` (main); it passes `node scripts/validate-content.mjs`. Field rules: `docs/shop-schema.md` and `docs/shopping-for-gpt.md`.

## 9. Decisions (Robb, 2026-10-21)

| # | Decision |
|---|---|
| D1 | Shops make change (§7). The party purse's own Deposit/Take stays exact-coin |
| D1a | The shop purse can't make change: try exact payment; else refuse with a clear message and give the GM a **Top up shop purse** button. Never auto top-up |
| D1b | Shop purse **off** by default; the GM turns one on per shop |
| D1c | The merchant's coins are **shown** to players by default; the GM can hide them per shop |
| D2 | Spending the party purse in a shop follows the party vote when *Party must accept when a player spends the party purse* is on (until saved, it follows the coin vote) |
| D3 | Haggling: later |
| D4 | **Selling to a shop is in v1** (§7c): per-shop percent, default 50 %, player confirms item, price and who pays. Details S1–S9 decided (§7c) |
| D5 | Restocking: manual **Restock** button (to `stockStart`), no automatic restock |
| D6 | Linked location optional; its name is shown to players only once revealed in Locations |
| D7 | Merchant art: an image path (file picker), initials when empty |
| D8 | GM Undo in History, in a later PR |
| D9 | Bought items go only to a character the buyer owns |
| D10 | "All players" includes players who log in later, until Stop showing |
| D13 | Bank: changing the party purse's coins needs no vote and is logged in History |
| D14 | Bank fee: per-bank `feePercent`, default 0 |

## 10. Build plan (one PR each; briefs in `docs/shopping-briefs/`)

Version numbers assume nothing else takes those Utilities versions first; if something does, keep the order and use the next free minor.

| PR | Brief | What | Can start |
|---|---|---|---|
| 0.14.0 | `01-rules.md` | Pure rules and tests in `core.mjs`, no UI | **Now** (no kit dependency) |
| 0.15.0 | `02-gm-shops.md` | Shops tab for the GM: storage, list, editor, drops, shop purse, Buys settings | After **kit 2** (UI brief 1, `ui/kit-2`) is on main |
| 0.16.0 | `03-present-buy.md` | Present, player shop window, buying | After 0.15.0 |
| 0.17.0 | `04-sell.md` | Selling to a shop (§7c) | After 0.16.0 |
| 0.18.0 | `05-lists-services-bank.md` | Merchant lists, services, the Bank | After 0.16.0 (can run beside 0.17.0) |
| 0.19.0 | `06-import.md` | Import/export, schema doc, validator; then a Manager PR | **Built as Utilities 0.21.0** (PR #205); Manager routing still to do |

Later, each once Robb asks: Undo (D8), haggling (D3), restock rules (D5), new service types, a Character Hub embed.

Each PR: version bump in `module.json` (version and download URL) and `core.mjs` `VERSION`, CHANGELOG entry, README section, `node scripts/check.mjs ashen-gate-utilities`, and what to click in Forge to test it.
