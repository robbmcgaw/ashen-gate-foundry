# Shops, services and merchant lists: brief for ChatGPT (FINAL)

**Status: FINAL, import built in Utilities 0.21.0.** Robb approved the design on 2026-10-21. The GM imports with Utilities **Shops → Import JSON** (GM only); General Manager checks these packages but doesn't route them from its own Import yet. Mark records `status: draft` until Robb approves their content. `shop.buys` (selling to a shop) is decided and may be used.

Design: `robbmcgaw/ashen-gate-foundry` → `docs/shopping-design.md` (branch `design/shopping`).

## 1. What a shop is

- A **shop** belongs to the Utilities module (`ashen-gate-utilities`). It has a merchant (name, picture), flavour text, an optional location and a list of items for sale.
- Each item line names an existing item by its permanent id, plus a price, optional stock and optional flavour text.
- The GM presents a shop to players at the table. Players pay from the party purse or their own coins.
- A **service** is a place that does something other than sell items. The only service type now is `bank` (changes coins at the standard rates). Don't invent other types; Robb will add them.
- A **merchant list** groups shops and services, usually one city. The GM can let players browse it (read only).

- A shop may have a **purse**: the merchant's cash. Buyers' coins go in, change comes out. No purse means unlimited cash. Players see the merchant's coins unless the GM hides them.

ChatGPT writes the definitions, including a shop's starting cash. It never writes live state: who the shop is shown to, stock sold, sales, or characters' coins.

## 2. Rules that always apply

- **Stable ids.** `SHOP-` for shops, `SVC-` for services, `MLIST-` for merchant lists, upper-case letters, digits and single hyphens, e.g. `SHOP-TEST-TANNER`. Never rename or reuse an id.
- **Items by id, not by UUID.** A line names `item_id` (an `ITEM-*` or other canonical id of an Item in the same package or already imported). Use `item_uuid` only for a compendium item that has no canonical id.
- **Prices** are a whole number in one coin: `{"value": 10, "denomination": "gp"}`. Coins: `cp`, `sp`, `gp`, `pp`. **No electrum (`ep`)**: Robb doesn't use it, and imports refuse it unless the GM has turned on *Use electrum*. Prices are stored as copper, so `{"value": 15, "denomination": "sp"}` and `{"value": 150, "denomination": "cp"}` are the same price. Use the item's normal 2024 price unless Robb sets another.
- **GM-only fields** (`gm_notes`, `cost`, `hidden: true`) are never shown to players. Still: no setting spoilers in a public test file.
- **Draft vs canon.** `status: draft` unless Robb approved the shop.

## 3. Record format

Records go in an `ag-foundry-import/0.2` package, next to the Items they sell. The package starts with a `manifest` block (`schema_version: "ag-foundry-import/0.2"`, `package_id`, `version`, optional `description`), then `records`. Not `format`.

Every record (Items, shops, services, lists) has the standard envelope: `id`, `entity_type`, `status`, `version`, `provenance: {"sources": ["…"]}`, `visibility` (`"gm"` for shops, services and lists), `refs` (`[]` when none). Shops, services and lists also need `name`.

### Shop

| Key | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `SHOP-…` |
| `entity_type` | `"Shop"` | yes | |
| `status`, `version`, `name` | string | yes | `name` is the shop's name players see |
| `visibility` | string | recommended | `"gm"` |
| `refs` | array | optional | `{"relation": "located_at", "target_id": "LOC-…", "mode": "optional"}` |
| `shop.merchant_name` | string | yes | up to 120 characters |
| `shop.merchant_img` | string | optional | Forge Assets Library path |
| `shop.flavour` | string | optional | players see it; up to 1000 characters |
| `shop.location_id` | string | optional | a `LOC-*` id; players see the place name only once it is revealed |
| `shop.gm_notes` | string | optional | GM only |
| `shop.purse` | object | optional | the merchant's starting cash, e.g. `{"cp": 50, "sp": 30, "gp": 20, "pp": 0}`; whole numbers ≥ 0, no `ep`. Leave it out for unlimited cash. Used only when the shop is first created |
| `shop.show_purse` | boolean | optional | default `true`: players see the merchant's coins in the shop window. `false` hides the amount from players |
| `shop.buys` | object | optional | the shop buys items from players: `{"enabled": true, "percent": 50, "types": ["weapon", "equipment"]}`. `percent` 1–100 of the item's own price (default 50). `types`: dnd5e item types (`weapon`, `equipment`, `consumable`, `tool`, `loot`); leave it out for all of them. Containers are never bought. Default: the shop doesn't buy |
| `shop.lines` | array | yes | at least one line |

### Line (`shop.lines[]`)

| Key | Type | Required | Notes |
|---|---|---|---|
| `item_id` | string | one of these two | canonical id of an Item |
| `item_uuid` | string | one of these two | e.g. `Compendium.dnd5e.equipment24.Item.<id>` |
| `price` | object | no | `{value, denomination}`; default: the item's own price |
| `stock` | number | no | whole number ≥ 0; leave out for unlimited |
| `flavour` | string | no | players see it; up to 300 characters |
| `cost` | object | no | GM only, what the merchant paid |
| `hidden` | boolean | no | `true` = GM only, never offered to players |

How many come per purchase is the Item's own `system.quantity` (an "Arrows (20)" item sells 20 at a time).

### Service

| Key | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `SVC-…` |
| `entity_type` | `"Service"` | yes | |
| `status`, `version`, `name` | string | yes | `name` is what players see |
| `visibility` | string | recommended | `"gm"` |
| `service.type` | string | yes | `"bank"` (the only type) |
| `service.merchant_name`, `service.merchant_img`, `service.flavour`, `service.location_id`, `service.gm_notes` | | | as for a shop |
| `service.settings` | object | optional | bank: `{"fee_percent": 0}` (whole number 0–50; default 0 = no fee) |

### Merchant list

| Key | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `MLIST-…` |
| `entity_type` | `"MerchantList"` | yes | |
| `status`, `version`, `name` | string | yes | |
| `merchant_list.location_id` | string | optional | the city's `LOC-*` id |
| `merchant_list.shop_ids` | array | yes | `SHOP-*` and `SVC-*` ids, in display order |

Merchant lists always import hidden. The GM switches them on.

### On import and update

- Utilities 0.21.0 (GM only): **Shops → Import JSON** previews each record (Create, Update, Kept, Skipped with the reason) and imports; **Shops → Export** writes the same format. General Manager checks these packages; routing them from Manager's Import is a later Manager update. Full field rules: `docs/shop-schema.md`; test files: `test-fixtures/shops/`.
- A record whose `id` exists is **kept as it is** by default. With **Update shops that already exist**, a shop's name, merchant, flavour and lines come from the file (a service: name, merchant, flavour, settings; a list: name and entries).
- **An update never touches play state:** nothing is presented by an import, lists come in hidden (a shown list stays shown), and an update keeps stock left, hand-added lines, lines bought from players, the merchant's coins now, the sales log, and the shop's linked location and GM notes. `purse`, `show_purse` and `buys` apply only when a shop is created.


## 4. Synthetic example

The same file as `test-fixtures/shops/AG_Test_Shops.json` in the public repo; it passes `node scripts/validate-content.mjs`. Copy its shape.

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

## 5. Don'ts

- Don't write `presented`, sold counts, sales, or any character's coins. A shop's starting `purse` is fine. Import writes definitions only.
- Don't use `"format"`; use the `manifest` block. Don't leave out `provenance`, `visibility` or `refs`.
- Don't price in two coins at once (`"1 gp 5 sp"`); use one coin (`15 sp`). Don't use `ep`.
- Don't link items by world UUID (`Item.abc…`); world UUIDs differ per world.
- Don't invent fields, prefixes, service types or haggling rules.
- Don't mark anything `approved` yourself.

## 6. Where things live

| What | Where |
|---|---|
| Entry point for GPT (section 2b) | `robbmcgaw/ashen-gate-supplement` → `campaign/GPT_HANDOFF.md` |
| This brief, once placed | `robbmcgaw/ashen-gate-supplement` → `systems/architecture/SHOPPING_FOR_GPT.md` |
| Shopping design | `robbmcgaw/ashen-gate-foundry` → `docs/shopping-design.md`: **final** (branch `design/shopping`; build briefs in `docs/shopping-briefs/`) |
| Item records and effects | `docs/item-effects-schema.md`: **built** |
| Locations (for `location_id`) | Locations README, import section: **built** |
| Full field rules and test files | `docs/shop-schema.md`, `test-fixtures/shops/` (valid file and common mistakes in `invalid/`): **built** |
| Check a file | `node scripts/validate-content.mjs <file>` in the public repo |

## 7. When in doubt

Ask Robb. If a shop needs something this format doesn't cover (a discount, a special deal), put it in `gm_notes` as plain text, mark the record `draft` and list the question.
