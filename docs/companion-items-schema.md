# Companion items: mount gear, mount perks, pet clothing, pet perks

Character Hub 0.12.0 and later. In the Hub's **Companions** tab a character has one mount and up to the GM's pet limit of pets. Mount gear, mount perks, pet clothing and pet perks are **ordinary dnd5e Items**: equipment, loot or feat Items, with no new document types. The Hub skins them as gear and perks, the same way other Ashen Gate items and perks are ordinary Items with a permanent id.

## Where things live

| What | Where | Written by | Re-import |
|---|---|---|---|
| The item itself (name, art, description, dnd5e data) | An Item record in a Manager package (`ag-foundry-import/0.2`), imported as a world Item | Package import | Updated like any record, matched by permanent id |
| What the item is for (gear, perk, clothing) | The permanent id prefix (below) | The record's `id` | Never rename the id |
| Which companion wears it | `flags.ashen-gate-character-hub.companions` on the **character** Actor (the Hub's own state) | The player or GM in the Hub | **Never touched** by import |
| The player's name and description for a mount or pet | The same companion entry | The player or GM in the Hub | **Never touched** |
| Pet limit | World settings `ashen-gate-character-hub.petCap` (default 0: no pets until the GM raises it) and `petCapOverrides` (per character: a whole number, `none` or `unlimited`) (0.9.0) | GM only | n/a |

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

The Hub reads the prefix from `flags.ashen-gate-manager.source.sourceId`, which Manager writes on import. An Item made by hand in Foundry can carry the role instead as `flags.ashen-gate-character-hub.companion.role` (one of the four role names, exact lower case). When that flag holds a valid role it wins over the id prefix, on any Item. An unmarked Item still works:
- a `feat` counts as a perk;
- anything else counts as mount gear or pet clothing.

An Item marked for the other kind of companion is refused, e.g. pet clothing on a mount. So is an Item dropped on the wrong spot, e.g. a perk into a clothing slot.

## How a stat bonus is expressed

Only with dnd5e's own data. The Hub's stats box reads, and never applies or works out:
- **Armour value:** an `equipment` Item's `system.armor.value` (e.g. barding). Shown as "Armor AC".
- **Active Effects on the Item:** each change is shown with its key in plain words and its mode, e.g.
  - `system.attributes.ac.bonus`, ADD `1` → "AC +1"
  - `system.attributes.movement.speeds.walk`, ADD `10` → "Walk speed +10" (dnd5e 6.0 keys speeds under `movement.speeds`; the old `system.attributes.movement.walk` is only a compatibility redirect, so new files use `speeds.walk`)
  - `system.abilities.dex.bonuses.save` → "Dexterity saves"
  Plain additions to the same thing are summed. Unknown keys show as they are. Disabled effects are skipped.

Rules for effects on companion items:
- Set the effect's **"Apply effect to actor"** (`transfer`) **off**. The Item sits on the character, so a transferred effect would also change the character. The Hub warns when an effect is transferred and changes nothing itself.
- Nothing is applied to the mount Actor either. The numbers are a reference for the table and the GM.

**From a file (Manager 0.37.0+):** an Item record can carry its Active Effects in `foundry.data.effects`, and the Hub role in `foundry.data.flags`. The format is in [item-effects-schema.md](item-effects-schema.md). Give each effect a permanent `eff_id` and `transfer: false`. Re-import updates the effects Manager made, keeps the GM's edits, and never deletes an effect or touches one made by hand. With Manager 0.36.0 or older, effects cannot be imported: the GM adds them on the world Item instead.

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
| `foundry.data` | `{name, type, img, system, effects?, flags?}` | `type`: `equipment`, `loot` or `feat`. `system.description.value` (HTML) is the text the Hub summarises. `system.armor.value` for barding. `system.rarity` for the rarity colour. |
| `foundry.data.effects` | array (Manager 0.37.0+) | The bonuses, as Active Effects with `transfer: false` ([format](item-effects-schema.md)). |
| `foundry.data.flags` | object (Manager 0.37.0+) | Only `ashen-gate-character-hub.companion.role` is imported. Optional, because the id prefix already gives the role. |

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
  "rules_summary": "[TEST] Placeholder: Walk speed +10 for the mount.",
  "foundry": {
    "document_type": "Item",
    "data": {
      "name": "[TEST] Riding Saddle",
      "type": "equipment",
      "img": "icons/equipment/back/saddle-brown.webp",
      "system": {
        "description": {"value": "<p>[TEST] A placeholder saddle.</p>"},
        "rarity": "common"
      },
      "flags": {"ashen-gate-character-hub": {"companion": {"role": "mount-gear"}}},
      "effects": [
        {
          "eff_id": "walk",
          "name": "[TEST] Saddle: Walk speed",
          "transfer": false,
          "changes": [{"key": "system.attributes.movement.speeds.walk", "mode": "add", "value": 10}]
        }
      ]
    }
  }
}
```

The Hub shows this as "Walk speed +10" on the mount's card. Because `transfer` is `false`, the character carrying the saddle is not changed. Manager 0.36.0 and older reject the `effects` and `flags` keys, so update Manager before importing this.

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

`clothing` holds 3 entries (an item id or `null`) for a pet, and is empty for a mount; `gearItemIds` is always empty for a pet. `name` is cut to 80 characters and `description` to 2000. Id lists drop duplicates and non-text entries. Entries saved before 0.12.0 are `{id, kind, itemId, perkItemIds}`. They read unchanged, with the new fields defaulted, and are written in the new shape on the next change. No migration step is needed, and reading never changes saved data. When read, an entry with an unknown `kind` or with neither `itemId` nor `actorUuid` is ignored, and so is an Item companion whose Item is no longer on the character (an Actor companion whose Actor is gone stays, shown as missing); the next change to the list writes it without them.
