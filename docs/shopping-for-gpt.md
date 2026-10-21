# Shops and merchant lists: brief for ChatGPT (DRAFT)

**Status: DRAFT.** Shopping is designed, not built. Don't write `Shop` or `MerchantList` records for a real import until Robb approves the design and the import is built (Utilities 0.18.0 in the plan). Drafts for Robb to review are fine; mark them `status: draft`.

Design: `robbmcgaw/ashen-gate-foundry` → `docs/shopping-design.md` (branch `design/shopping`).

## 1. What a shop is

- A **shop** belongs to the Utilities module (`ashen-gate-utilities`). It has a merchant (name, picture), flavour text, an optional location and a list of items for sale.
- Each item line names an existing item by its permanent id, plus a price, optional stock and optional flavour text.
- The GM presents a shop to players at the table. Players pay from the party purse or their own coins.
- A **merchant list** groups shops, usually one city. The GM can let players browse it (read only).

ChatGPT writes the definitions. It never writes live state: who the shop is shown to, stock sold, sales or coins.

## 2. Rules that always apply

- **Stable ids.** `SHOP-` for shops, `MLIST-` for merchant lists, upper-case letters, digits and single hyphens, e.g. `SHOP-TEST-TANNER`. Never rename or reuse an id.
- **Items by id, not by UUID.** A line names `item_id` (an `ITEM-*` or other canonical id of an Item in the same package or already imported). Use `item_uuid` only for a compendium item that has no canonical id.
- **Prices** are a whole number in one coin: `{"value": 10, "denomination": "gp"}`. Coins: `cp`, `sp`, `ep`, `gp`, `pp`. Use the item's normal 2024 price unless Robb sets another.
- **GM-only fields** (`gm_notes`, `cost`, `hidden: true`) are never shown to players. Still: no setting spoilers in a public test file.
- **Draft vs canon.** `status: draft` unless Robb approved the shop.

## 3. Record format

Records go in an `ag-foundry-import/0.2` package, next to the Items they sell.

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

### Merchant list

| Key | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `MLIST-…` |
| `entity_type` | `"MerchantList"` | yes | |
| `status`, `version`, `name` | string | yes | |
| `merchant_list.location_id` | string | optional | the city's `LOC-*` id |
| `merchant_list.shop_ids` | array | yes | `SHOP-*` ids |

Merchant lists always import hidden. The GM switches them on.

## 4. Synthetic example

```json
{
  "format": "ag-foundry-import/0.2",
  "records": [
    {
      "id": "SHOP-TEST-TANNER", "entity_type": "Shop", "status": "draft", "version": "1.0.0",
      "name": "[TEST] Tanner's Stall", "visibility": "gm",
      "refs": [{"relation": "located_at", "target_id": "LOC-TEST-MARKET", "mode": "optional"}],
      "shop": {
        "merchant_name": "[TEST] Hollis Reed",
        "flavour": "Smells of oak bark and fresh leather.",
        "location_id": "LOC-TEST-MARKET",
        "lines": [
          {"item_id": "ITEM-TEST-LEATHER-ARMOR", "price": {"value": 10, "denomination": "gp"}, "stock": 2, "flavour": "Supple and well stitched."},
          {"item_id": "ITEM-TEST-WATERSKIN", "price": {"value": 2, "denomination": "sp"}},
          {"item_id": "ITEM-TEST-HIDE-BUNDLE", "price": {"value": 3, "denomination": "gp"}, "hidden": true, "cost": {"value": 1, "denomination": "gp"}}
        ]
      }
    },
    {
      "id": "MLIST-TEST-TESTFORD", "entity_type": "MerchantList", "status": "draft", "version": "1.0.0",
      "name": "[TEST] Testford merchants",
      "merchant_list": {"location_id": "LOC-TEST-TESTFORD", "shop_ids": ["SHOP-TEST-TANNER"]}
    }
  ]
}
```

## 5. Don'ts

- Don't write `presented`, sold counts, sales, or anyone's coins. Import writes definitions only.
- Don't price in two coins at once (`"1 gp 5 sp"`); use one coin (`15 sp`).
- Don't link items by world UUID (`Item.abc…`); world UUIDs differ per world.
- Don't invent fields, prefixes or haggling/selling-back rules. Those are open decisions for Robb.
- Don't mark anything `approved` yourself.

## 6. Where things live

| What | Where |
|---|---|
| Entry point for GPT (section 2b) | `robbmcgaw/ashen-gate-supplement` → `campaign/GPT_HANDOFF.md` |
| This brief, once placed | `robbmcgaw/ashen-gate-supplement` → `systems/architecture/SHOPPING_FOR_GPT.md` |
| Shopping design | `robbmcgaw/ashen-gate-foundry` → `docs/shopping-design.md`: **draft** (branch `design/shopping`) |
| Item records and effects | `docs/item-effects-schema.md`: **built** |
| Locations (for `location_id`) | Locations README, import section: **built** |
| Check a file | `node scripts/validate-content.mjs <file>` (Shop checks come with the import PR) |

## 7. When in doubt

Ask Robb. If a shop needs something this format doesn't cover (a discount, a special deal), put it in `gm_notes` as plain text, mark the record `draft` and list the question.
