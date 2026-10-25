# Companion items: mount gear, mount perks, pet clothing, pet perks

Character Hub 0.12.0 and later. Since 0.47.0 the **Companions** tab has a Mount box and Pet boxes (up to three since 0.48.0). Each companion is a world Actor; a character may link many of each, with one mount and up to three pets active. Each has sockets: every pet has 2 (Head, Body) and the Mount has 5 (Saddle and four Tack). Mount gear, mount perks, pet clothing and pet perks are **ordinary dnd5e Items**: equipment, loot or feat Items, with no new document types. The Hub skins them as gear and perks, the same way other Ashen Gate items and perks are ordinary Items with a permanent id.

## Where things live

| What | Where | Written by | Re-import |
|---|---|---|---|
| The item itself (name, art, description, dnd5e data) | An Item record in a Manager package (`ag-foundry-import/0.2`), imported as a world Item | Package import | Updated like any record, matched by permanent id |
| What the item is for (gear, perk, clothing) | The permanent id prefix (below) | The record's `id` | Never rename the id |
| Which companion wears it, and in which socket | `flags.ashen-gate-character-hub.companionSlots` on the **character** Actor (the Hub's own state; see Saved data) | The player or GM in the Hub | **Never touched** by import |
| Pet slots (how many pets can be active, 0 to 3) | World settings `petSlots` (default 3) and `petSlotOverrides` (`{actorId: 0..3}`), set in the Hub's GM Setup | The GM | Never touched by import |
| The old pet limit | `petCap` and `petCapOverrides` (retired in 0.47.0) stay saved and untouched; nothing reads them | n/a | n/a |
| The player's own name and description for a companion | `companionSlots.labels` on the **character** Actor | The player or GM in the Hub | **Never touched** by import |

A mount or pet is a **world Actor**, dropped from the Actors sidebar (or found by name) and linked by UUID. The Hub never copies or changes it. Before 0.47.0 an Item on the character could also be a mount or pet; those older entries are kept, read only, in the Hub's "Older companions" fold.

Gear, clothing and perks are copied onto the character as embedded Items when dropped. They then also show in the character's Inventory or Features.

## Permanent ids

Same pattern as every Ashen Gate id: `^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$`, permanent, no spoilers.

| Prefix | Hub role | dnd5e Item type to use | Goes on |
|---|---|---|---|
| `ITEM-MOUNT-` | `mount-gear` | `equipment` (saddles, barding, horseshoes) or `loot` | the Saddle socket or one of the 4 Tack sockets (see Slot) |
| `PERK-MOUNT-` | `mount-perk` | `feat` | a mount's perk list |
| `ITEM-PET-` | `pet-clothing` | `equipment` or `loot` | a pet's Head or Body socket (see Slot) |
| `PERK-PET-` | `pet-perk` | `feat` | a pet's perk list |

The Hub reads the prefix from `flags.ashen-gate-manager.source.sourceId`, which Manager writes on import. An Item made by hand in Foundry can carry the role instead as `flags.ashen-gate-character-hub.companion.role` (one of the four role names, exact lower case). When that flag holds a valid role it wins over the id prefix, on any Item. An unmarked Item still works:
- a `feat` counts as a perk;
- anything else counts as mount gear or pet clothing.

An Item marked for the other kind of companion is refused, e.g. pet clothing on a mount. So is an Item dropped on the wrong spot, e.g. a perk into a socket.

## Slot (which socket an item fits)

An item can name the kind of socket it goes in with one optional flag, `flags.ashen-gate-character-hub.companion.slot` (Hub 0.48.0), a lower-case string:

| Role | Valid `slot` | Sockets |
|---|---|---|
| `mount-gear` | `saddle`, `tack` | a mount has 1 Saddle and 4 Tack |
| `pet-clothing` | `head`, `body` | each pet has 1 Head and 1 Body |
| `mount-perk`, `pet-perk` | none | perks have no sockets |

Rules:
- A slot is valid only with its matching role. The Hub takes the role from the flag or the id prefix; Manager's import is stricter and requires the role flag on the same record (see Slot flag (import)). A mismatched slot (e.g. `head` on `mount-gear`), an unknown value, or a slot on an item with no role is ignored and the item counts as unclassified.
- A **classified** item fits only a socket of its own type: a `saddle` item only the Saddle, a `tack` item only a Tack socket, `head` only Head, `body` only Body. A wrong drop is refused with a plain message.
- An **unclassified** item (no valid slot; all older data) keeps the earlier behaviour: it fits any socket of its kind (mount gear any mount socket, pet clothing any pet socket), so nothing breaks before content is classified.
- Dropped on a box (not a socket), an item goes to the first free socket of its type.
- The slot only controls which sockets an item can go into. It carries no other mechanics; bonuses still come from the item's own effects.

A socket holds one item and an item sits in one socket of one companion at a time. (Display only: if a tier is wanted beside the name, `flags.ashen-gate-character-hub.companion.tier`, a string, is shown when present. It changes nothing.)

From a Manager package, set it with the role in `foundry.data.flags`: `{"ashen-gate-character-hub": {"companion": {"role": "mount-gear", "slot": "saddle"}}}`.

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
| `foundry.data.flags` | object (Manager 0.37.0+) | `ashen-gate-character-hub.companion.role` and `.slot` are imported (Manager 0.60.15+ for `.slot`; see Slot flag (import)). Both optional; the id prefix already gives the role. |

## Slot flag (import)

Manager 0.60.15 and later. Optional item flag `flags.ashen-gate-character-hub.companion.slot` says which Hub sockets the item fits. It has no other effect.

| `companion.role` | Allowed `companion.slot` |
|---|---|
| `mount-gear` | `saddle` or `tack` |
| `pet-clothing` | `head` or `body` |
| `mount-perk`, `pet-perk` | none |

- The role flag must be on the same record, because the slot is checked against it. The id prefix alone is not enough.
- A slot that is not one of the four values, or does not match the role, is not imported. The preview names the record and the reason, and `node scripts/validate-content.mjs` reports the same as a note. The rest of the Item imports.
- Managed like the role: written on create, updated on re-import and Sync unless the GM edited it in Foundry, and included in the stored baseline.

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
      "flags": {"ashen-gate-character-hub": {"companion": {"role": "mount-gear", "slot": "saddle"}}},
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
- Only the GM changes pet slots (GM Setup). The limit is enforced in the Hub's data layer: a pet box above the character's slot count cannot be filled, but lowering the count never removes a pet.
- The player's own name and description are stored on the character, so players need no ownership of the companion Actor; owners and the GM can edit them.
- Socketing, swapping and removing are all checked in the Hub's data layer, not only by hiding buttons.

## Saved data

The state on the character Actor (`flags.ashen-gate-character-hub.companionSlots`, version 2 since Hub 0.48.0):

```json
{"version": 2, "activePets": ["Actor.cat1", "Actor.owl1", null], "activeMount": "Actor.horse1",
 "pets": ["Actor.cat1", "Actor.owl1", "Actor.fox1"], "mounts": ["Actor.horse1"],
 "gear": {"horse1": {"saddle": "itemId", "tack1": "itemId"}, "cat1": {"head": "itemId"}},
 "perks": {"horse1": ["perkItemId"]},
 "labels": {"cat1": {"name": "Biscuit", "description": "Plain text, up to 500 characters."}}}
```

`gear`, `perks` and `labels` are keyed by the Actor id (the UUID without `Actor.`, because Foundry reads dots in flag keys as paths). Socket keys: pet `head`, `body`; mount `saddle`, `tack1` to `tack4`. `activePets` has three entries (pet boxes 1 to 3); a pet appears in at most one. Labels are plain text (markup removed): name up to 60 characters, description up to 500; an empty name means the Actor's own name is shown. Gear stays under its own companion when the active one changes.

Migration (safe to repeat, nothing deleted): version 1 (0.47.0: `activePet`, mount sockets `other1` to `other4`) is read as version 2 (`activePet` becomes `activePets[0]`, `other1`-`other4` become `tack1`-`tack4`) and written as version 2 by the GM client's startup migration or the next change. The names and descriptions players typed before 0.47.0 in the old list are carried into `labels` where none is set. The old list `flags.ashen-gate-character-hub.companions[]` (`{id, kind, itemId, actorUuid, name, description, perkItemIds, gearItemIds, clothing}`) is never deleted or rewritten: its Actor entries are carried over (first mount and first pet active, gear and clothing into sockets in order, extras beyond the sockets left loose, perks follow the companion), and its Item-only entries are listed read-only. Missing items are dropped from the sockets on the next change; a linked Actor that is gone stays listed (marked missing) so it can be removed.

Pet slots are world settings: `petSlots` (number 0 to 3, default 3) and `petSlotOverrides` (`{characterActorId: 0..3}`). The slot count is the override or the default, plus extras registered through the Hub API `registerPetSlotSource`, never more than 3.
