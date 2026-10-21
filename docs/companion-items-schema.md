# Companion items: mount gear, mount perks, pet clothing, pet perks

Character Hub 0.12.0 and later. In the Hub's **Companions** tab a character has one mount and up to the GM's pet limit of pets. Mount gear, mount perks, pet clothing and pet perks are **ordinary dnd5e Items**: equipment, loot or feat Items, with no new document types. The Hub skins them as gear and perks, the same way other Ashen Gate items and perks are ordinary Items with a permanent id.

## Where things live

| What | Where | Written by | Re-import |
|---|---|---|---|
| The item itself (name, art, description, dnd5e data) | An Item record in a Manager package (`ag-foundry-import/0.2`), imported as a world Item | Package import | Updated like any record, matched by permanent id |
| What the item is for (gear, perk, clothing) | The permanent id prefix (below) | The record's `id` | Never rename the id |
| Which companion wears it | `flags.ashen-gate-character-hub.companions` on the **character** Actor (the Hub's own state) | The player or GM in the Hub | **Never touched** by import |
| The player's name and description for a mount or pet | The same companion entry | The player or GM in the Hub | **Never touched** |
| Pet limit | World settings `ashen-gate-character-hub.petCap` and `petCapOverrides` (0.9.0) | GM only | n/a |

A mount or pet can be either of these:
- a **world Actor**, dropped from the Actors sidebar. It is linked by UUID, and the Hub never copies or changes it.
- an **Item** on the character, as before 0.12.0.

Gear, clothing and perks are copied onto the character as embedded Items when dropped. They then also show in the character's Inventory or Features.

## Permanent ids

Same pattern as every Ashen Gate id: `^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$`, permanent, no spoilers.

| Prefix | Hub role | dnd5e Item type to use | Goes on |
|---|---|---|---|
| `ITEM-MOUNT-` | `mount-gear` | `equipment` (saddles, barding, horseshoes) or `loot` | a mount's gear list |
| `PERK-MOUNT-` | `mount-perk` | `feat` | a mount's perk list |
| `ITEM-PET-` | `pet-clothing` | `equipment` or `loot` | one of a pet's three clothing slots |
| `PERK-PET-` | `pet-perk` | `feat` | a pet's perk list |

The Hub reads the prefix from `flags.ashen-gate-manager.source.sourceId`, which Manager writes on import. An Item made by hand in Foundry can carry the role instead as `flags.ashen-gate-character-hub.companion.role` (one of the four role names). An unmarked Item still works:
- a `feat` counts as a perk;
- anything else counts as mount gear or pet clothing.

An Item marked for the other kind of companion is refused, e.g. pet clothing on a mount.

## How a stat bonus is expressed

Only with dnd5e's own data. The Hub's stats box reads, and never applies or works out:
- **Armour value:** an `equipment` Item's `system.armor.value` (e.g. barding). Shown as "Armor AC".
- **Active Effects on the Item:** each change is shown with its key in plain words and its mode, e.g.
  - `system.attributes.ac.bonus`, ADD `1` → "AC +1"
  - `system.attributes.movement.walk` (or `movement.speeds.walk`), ADD `10` → "Walk speed +10"
  - `system.abilities.dex.bonuses.save` → "Dexterity saves"
  Plain additions to the same thing are summed. Unknown keys show as they are. Disabled effects are skipped.

Rules for effects on companion items:
- Set the effect's **"Apply effect to actor"** (`transfer`) **off**. The Item sits on the character, so a transferred effect would also change the character. The Hub warns when an effect is transferred and changes nothing itself.
- Nothing is applied to the mount Actor either. The numbers are a reference for the table and the GM.

> **Manager import limit (Manager 0.36.0):** Item records may only carry `name`, `type`, `img` and `system`, so **Active Effects and flags cannot be imported yet**. Until Manager allows `effects` on Items, write the bonus in the description (`rules_summary`). The GM adds the Active Effect on the world Item in Foundry once; re-import keeps it, since import updates the record's own fields. `system.armor.value` imports today.

## Item record fields

The usual Manager Item record. Nothing new is required.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `ITEM-MOUNT-…`, `PERK-MOUNT-…`, `ITEM-PET-…` or `PERK-PET-…`. Never rename. |
| `entity_type` | `"Item"` | |
| `status`, `version`, `visibility`, `scope`, `provenance`, `refs` | as for other records | Use `visibility: "player"` for items players may hold. |
| `name` | string | Shown on the card row. |
| `rules_summary` | string | What it does, in words (also put in the description). |
| `foundry.document_type` | `"Item"` | |
| `foundry.data` | `{name, type, img, system}` | `type`: `equipment`, `loot` or `feat`. `system.description.value` (HTML) is the text the Hub summarises. `system.armor.value` for barding. `system.rarity` for the rarity colour. |

## Synthetic example

Test data only. Names are `[TEST]`-style and the numbers are placeholders, not rules.

```json
{
  "id": "ITEM-MOUNT-TEST-SADDLE",
  "entity_type": "Item",
  "status": "draft",
  "version": "0.1.0",
  "visibility": "player",
  "scope": "generic_rules",
  "name": "[TEST] Riding Saddle",
  "rules_summary": "[TEST] Placeholder: the GM adds an Active Effect (walk speed) on the world Item.",
  "foundry": {
    "document_type": "Item",
    "data": {
      "name": "[TEST] Riding Saddle",
      "type": "equipment",
      "img": "icons/equipment/back/saddle-brown.webp",
      "system": {
        "description": {"value": "<p>[TEST] A placeholder saddle.</p>"},
        "rarity": "common"
      }
    }
  }
}
```

The matching perk would be `PERK-MOUNT-TEST-SUREFOOTED`, a `feat` Item. Pet clothing would be `ITEM-PET-TEST-TINY-HAT`, an `equipment` Item that the player drops into a clothing slot.

## Permissions

- Players can change companions only on characters they own, and only while the GM shows **Companions** to players (GM Setup → Player visibility). This is checked in the Hub's action layer, not only by hiding buttons.
- Linking a world Actor as a mount or pet needs at least Observer permission on that Actor; the GM can link any. Compendium Actors must be imported into the world first.
- The base stats line (the mount Actor's own AC, HP and speed) only shows to users who can see that Actor.
- Only the GM changes pet limits.

## Saved data

The companion entry on the character Actor (`flags.ashen-gate-character-hub.companions[]`):

```json
{"id": "k3j2h1g0f9e8", "kind": "mount", "itemId": null, "actorUuid": "Actor.abc123", "name": "Thunder", "description": "",
 "perkItemIds": ["perkItemId"], "gearItemIds": ["saddleItemId"], "clothing": []}
```

`clothing` holds 3 entries (an item id or `null`) for a pet, and is empty for a mount. Entries saved before 0.12.0 are `{id, kind, itemId, perkItemIds}`. They read unchanged, with the new fields defaulted, and are written in the new shape on the next change. No migration step is needed, and reading never changes saved data.
