# Organize rules (General Manager 0.30.0)

General Manager → **Organize** files world Items, Actors and Journals (or one unlocked world compendium) into folders using a list of rules. The GM can view the rules, edit them as JSON, and export or import them. The rules are stored in the world setting `ashen-gate-manager.organizeSchema`; an empty list means the shipped defaults are used. Organize only ever changes a document's `folder`.

## Rule shape

```json
{"id": "homebrew-weapon", "label": "Homebrew weapons", "types": ["Item"],
 "when": {"ag": false, "sourceTagged": false, "itemType": "weapon"}, "path": "Homebrew/Items/Weapons"}
```

| Field | Required | Rules |
|---|---|---|
| `id` | yes | Lowercase letters, digits and dashes, 1 to 60 characters, unique within the list. |
| `label` | no | Shown in the rules table and in skip reasons. |
| `types` | no | Any of `Item`, `Actor`, `JournalEntry`. Leaving it out means all three. |
| `when` | no | Match keys (below). Every key must match. A value can be a list, and then any listed value matches. Strings are compared without case. |
| `path` | yes, unless `leave` is set | Folder path with `/` between levels, at most 4 levels deep. It can use placeholders (below). |
| `leave` | no | `true` = leave the document where it is (for example player characters). |

Rules are checked from top to bottom, and the first match decides the folder. If a placeholder in the matching rule is empty, that rule is skipped and the next one is tried. A document that matches no rule stays where it is.

## Match keys

`documentType`, `ag` (has an Ashen Gate source id), `sourceIdPrefix`, `entityType`, `status`, `visibility`, `test` (`[TEST]` name or example_only), `tier`, `profession`, `quality`, `crafted`, `itemType`, `subtype`, `rarity`, `magic`, `spellLevel`, `spellSchool`, `actorType`, `playerOwned`, `creatureType`, `crBand`, `core` (copied from a dnd5e system compendium), and **`sourceTagged`** (0.30.0).

`sourceTagged` (Manager 0.31.0) is true when the document is a **core** source:

- it has `flags.plutonium` (it was imported by Plutonium), or
- its `system.source` says 2024: `rules: "2024"`, or a book of PHB'24, DMG'24, MM'24 or SRD 5.2 (`XPHB`, `XDMG`, `XMM`, `PHB 2024` are understood too), or
- its `system.source` says 2014 core: `rules: "2014"`, or a book of PHB, DMG, MM (`PHB'14`, `PHB 2014` too) or SRD 5.1 (`SRD 5.1`, `SRD`, `System Reference Document 5.1`).

It is false when the Item has no source at all, or a third-party or homebrew book. In 0.30.0 only 2024 counted; 2014 core and SRD 5.1 items now stay under Core too (*all considered core*).

Core Links does **not** use this test. It picks world candidates with a narrower 2024-only test (Plutonium import or marked 2024, never anything marked 2014), so 2014 / SRD 5.1 content is never linked or adopted.

## Placeholders

`{tier}`, `{rarity}`, `{spellLevel}`, `{creatureType}`, `{crBand}`, `{entityType}`, `{actorType}`, `{profession}`, `{quality}`, `{itemType}`.

## Default rules, in order

1. Player characters and player-owned Actors stay where they are.
2. Playtest records (`[TEST]`, example_only) → `Ashen Gate/Playtest`.
3. Ashen Gate records → `Ashen Gate/…` (professions, materials, recipes, crafted items and perks by tier; items, creatures by CR, NPCs, locations, journals).
4. Source-tagged non-Ashen-Gate Items → `Core 5.5e/…`: `Spells/{spellLevel}`, `Items/{rarity} Magic`, `Items/Weapons`, `Items/Armor`, `Items/Consumables`, `Items/Tools`, `Items/Wondrous`, `Items/Gear`, `Items/Loot`, `Features`, `Character Options`.
5. All other non-Ashen-Gate Items → `Homebrew/…`, using the same sub-folders as Core 5.5e.
6. Non-Ashen-Gate Actors → `Core 5.5e/Actors/{creatureType}`, `Core 5.5e/Actors/Other`, `Core 5.5e/Actors/Vehicles`. Actors don't use the source tag.

Saved custom rules are never changed by an update. To get the new defaults, use *Reset rules to defaults…* in the Organize tab.

## Synthetic example

| Item | Tag | Folder |
|---|---|---|
| `Sample Longsword` with `flags.plutonium` | source-tagged | `Core 5.5e/Items/Weapons` |
| `Lantern of Testing` with `system.source.book: "XPHB"` | source-tagged | `Core 5.5e/Items/Gear` |
| `Old Rope` with `system.source: {book: "PHB", rules: "2014"}` | source-tagged (2014 core) | `Core 5.5e/Items/Loot` |
| `Open Mace` with `system.source.book: "SRD 5.1"` | source-tagged (SRD 5.1) | `Core 5.5e/Items/Weapons` |
| `Tome Blade` with `system.source.book: "[TEST] Third Party Tome"` | not tagged | `Homebrew/Items/Weapons` |
| `Glimmer Blade` with no source | not tagged | `Homebrew/Items/Weapons` |
| `Spark Bolt`, a level 1 spell with no source | not tagged | `Homebrew/Spells/Level 1` |
