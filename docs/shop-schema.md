# Shop, Service and MerchantList record schema (Ashen Gate Utilities 0.21.0+, General Manager 0.44.0+)

Shops, services and merchant lists travel in an `ag-foundry-import/0.2` package, next to the Items they sell. They
belong to Utilities (`ashen-gate-utilities`). Import them with General Manager → Import (0.44.0+), which creates the
package's Items first and then hands these records to Utilities in the same run, or with Utilities **Shops → Import
JSON** for a shops-only file (its Items must already be in the world). Check a file with
`node scripts/validate-content.mjs <file>`. This file is generic: no setting content.

## Envelope (all three types)

| Key | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `SHOP-`, `SVC-` or `MLIST-`, then upper-case letters, digits and single hyphens. Permanent: never renamed or reused. A deleted id is refused. |
| `entity_type` | `"Shop"`, `"Service"` or `"MerchantList"` | yes | |
| `status`, `version`, `name` | string | yes | `name` is what players see. `superseded` / `retired` records are not imported. |
| `visibility` | string | yes (Manager) | `"gm"` |
| `refs` | array | yes (Manager, may be empty) | a shop or service may have `{"relation": "located_at", "target_id": "LOC-…", "mode": "optional"}` |
| `provenance` | object | yes (Manager) | `{"sources": ["…"]}` |

## Shop (`shop`)

| Key | Type | Required | Notes |
|---|---|---|---|
| `merchant_name` | string | yes | up to 120 characters |
| `merchant_img` | string | optional | image path (Forge Assets Library) |
| `flavour` | string | optional | players see it; up to 1000 characters |
| `location_id` | string | optional | a `LOC-*` id (else the `located_at` ref); players see the place only once it is revealed in Locations |
| `gm_notes` | string | optional | GM only |
| `purse` | object | optional | starting cash, e.g. `{"cp": 50, "sp": 30, "gp": 20, "pp": 0}`; whole numbers ≥ 0; no `ep` while *Use electrum* is off. Left out: unlimited cash. Used only when the shop is created |
| `show_purse` | boolean | optional | default `true` (players see the merchant's coins). Used only when the shop is created |
| `buys` | object | optional | `{"enabled": true, "percent": 50, "types": ["weapon", "equipment"]}`; `percent` 1–100 (default 50); `types` from `weapon`, `equipment`, `consumable`, `tool`, `loot` (left out: all). Default: the shop doesn't buy. Used only when the shop is created |
| `lines` | array | yes | at least one line |

### Line (`shop.lines[]`)

| Key | Type | Required | Notes |
|---|---|---|---|
| `item_id` | string | one of these two | permanent id of an Item (General Manager's `flags.ashen-gate-manager.source.sourceId`) |
| `item_uuid` | string | one of these two | e.g. `Compendium.dnd5e.equipment24.Item.<id>`; tried when `item_id` is missing or not found. A world UUID (`Item.…`) only works in its own world |
| `price` | object | no | `{"value": 10, "denomination": "gp"}`, one coin (`cp`, `sp`, `gp`, `pp`; `ep` refused while electrum is off), stored as whole copper. Default: the item's own price |
| `stock` | number | no | whole number ≥ 0; left out: unlimited |
| `flavour` | string | no | players see it; up to 300 characters |
| `cost` | object | no | GM only, what the merchant paid; same form as `price` |
| `hidden` | boolean | no | `true` = GM only, never offered to players |

How many come per purchase is the Item's own `system.quantity`.

## Service (`service`)

| Key | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"bank"` (the only type). An unknown type is refused |
| `merchant_name`, `merchant_img`, `flavour`, `location_id`, `gm_notes` | | optional | as for a shop |
| `settings` | object | optional | bank: `{"fee_percent": 0}` (whole number 0–50; default 0 = no fee) |

## Merchant list (`merchant_list`)

| Key | Type | Required | Notes |
|---|---|---|---|
| `location_id` | string | optional | the city's `LOC-*` id |
| `shop_ids` | array | yes | `SHOP-*` and `SVC-*` ids, in display order. An id not in the world or the file is noted and shows as missing |

Merchant lists always import hidden. The GM switches them on.

## Import behaviour

- **Preview first** (Utilities): each record shows Create, Update, Kept or Skipped with the reason, and each item line that wasn't found.
- **Existing id:** kept as it is by default. With **Update shops that already exist** (`importShops(records, {mode: 'update'})`): a shop's name, merchant, flavour and lines come from the file; a service's name, merchant, flavour and settings; a list's name and entries. Fields the file leaves out keep the world's value.
- **Play state is never written:** nothing is shown to players by an import (`presented` stays as it is, `null` for a new record), lists come in hidden and a shown list stays shown, and an update keeps stock left, lines the GM added by hand, lines bought from players, the merchant's coins now, the linked location, GM notes and the sales log. `purse`, `show_purse` and `buys` apply only when a shop is created.
- **Lines:** an item not found is skipped and reported; the rest of the shop imports (on an update the existing line stays as it was).
- **Validation, per record** (the rest of the import carries on; the message names the record and the line): bad id, missing name or `merchant_name`, a bad price, stock, cost or purse, `ep` while electrum is off, an unknown service type or bad bank fee, a `shop_ids` entry that is not a `SHOP-*` / `SVC-*` id, a duplicate id in the same file, a deleted id.
- **Export** (Shops → Export, `exportShops(ids?)`) writes the same format: starting stock and starting cash, never stock left, sales or who it is shown to.

## Example

The synthetic package `test-fixtures/shops/AG_Test_Shops.json` (Items, a shop, a Bank and a merchant list); common mistakes are in `test-fixtures/shops/invalid/`.

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
      "provenance": {
        "sources": [
          "Synthetic test data (not canon)"
        ]
      },
      "visibility": "player",
      "refs": [],
      "foundry": {
        "document_type": "Item",
        "folder_path": "Ashen Gate/Test/Shops",
        "data": {
          "name": "[TEST] Leather Armor",
          "type": "equipment",
          "system": {
            "quantity": 1,
            "price": {
              "value": 10,
              "denomination": "gp"
            }
          }
        }
      }
    },
    {
      "id": "ITEM-TEST-WATERSKIN",
      "entity_type": "Item",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {
        "sources": [
          "Synthetic test data (not canon)"
        ]
      },
      "visibility": "player",
      "refs": [],
      "foundry": {
        "document_type": "Item",
        "folder_path": "Ashen Gate/Test/Shops",
        "data": {
          "name": "[TEST] Waterskin",
          "type": "loot",
          "system": {
            "quantity": 1,
            "price": {
              "value": 2,
              "denomination": "sp"
            }
          }
        }
      }
    },
    {
      "id": "ITEM-TEST-HIDE-BUNDLE",
      "entity_type": "Item",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {
        "sources": [
          "Synthetic test data (not canon)"
        ]
      },
      "visibility": "player",
      "refs": [],
      "foundry": {
        "document_type": "Item",
        "folder_path": "Ashen Gate/Test/Shops",
        "data": {
          "name": "[TEST] Hide Bundle",
          "type": "loot",
          "system": {
            "quantity": 1,
            "price": {
              "value": 3,
              "denomination": "gp"
            }
          }
        }
      }
    },
    {
      "id": "SHOP-TEST-TANNER",
      "entity_type": "Shop",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {
        "sources": [
          "Synthetic test data (not canon)"
        ]
      },
      "visibility": "gm",
      "refs": [
        {
          "relation": "located_at",
          "target_id": "LOC-TEST-MARKET",
          "mode": "optional"
        }
      ],
      "name": "[TEST] Tanner's Stall",
      "shop": {
        "merchant_name": "[TEST] Hollis Reed",
        "flavour": "Smells of oak bark and fresh leather.",
        "location_id": "LOC-TEST-MARKET",
        "gm_notes": "Synthetic test shop.",
        "purse": {
          "cp": 50,
          "sp": 30,
          "gp": 20,
          "pp": 0
        },
        "show_purse": true,
        "buys": {
          "enabled": true,
          "percent": 50,
          "types": [
            "equipment",
            "loot"
          ]
        },
        "lines": [
          {
            "item_id": "ITEM-TEST-LEATHER-ARMOR",
            "price": {
              "value": 10,
              "denomination": "gp"
            },
            "stock": 2,
            "flavour": "Supple and well stitched.",
            "cost": {
              "value": 6,
              "denomination": "gp"
            }
          },
          {
            "item_id": "ITEM-TEST-WATERSKIN",
            "price": {
              "value": 2,
              "denomination": "sp"
            }
          },
          {
            "item_id": "ITEM-TEST-HIDE-BUNDLE",
            "price": {
              "value": 3,
              "denomination": "gp"
            },
            "hidden": true,
            "cost": {
              "value": 1,
              "denomination": "gp"
            }
          }
        ]
      }
    },
    {
      "id": "SVC-TEST-COUNTING-HOUSE",
      "entity_type": "Service",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {
        "sources": [
          "Synthetic test data (not canon)"
        ]
      },
      "visibility": "gm",
      "refs": [],
      "name": "[TEST] Counting House",
      "service": {
        "type": "bank",
        "merchant_name": "[TEST] Clerk Ames",
        "flavour": "Brass scales and a bored clerk.",
        "location_id": "LOC-TEST-MARKET",
        "settings": {
          "fee_percent": 0
        }
      }
    },
    {
      "id": "MLIST-TEST-TESTFORD",
      "entity_type": "MerchantList",
      "status": "draft",
      "version": "1.0.0",
      "provenance": {
        "sources": [
          "Synthetic test data (not canon)"
        ]
      },
      "visibility": "gm",
      "refs": [],
      "name": "[TEST] Testford merchants",
      "merchant_list": {
        "location_id": "LOC-TEST-TESTFORD",
        "shop_ids": [
          "SHOP-TEST-TANNER",
          "SVC-TEST-COUNTING-HOUSE"
        ]
      }
    }
  ]
}
```
