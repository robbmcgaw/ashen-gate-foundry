# Playtest data (0.5.0)

Synthetic data for testing every shipped feature from one import. Everything is `[TEST]`-named placeholder content with no rules effects. Not canon.

Four generated files (`node scripts/build-test-pack.mjs`; never hand-edit them). Raw links: `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/test-fixtures/playtest/<file>` (Save As).

| File | Imported by |
|---|---|
| `AG_Playtest_Pack_0.5.0.json` | General Manager → Import (also Locations → GM Setup → Import JSON, Locations only) |
| `AG_Playtest_Quests_0.5.0.json` | Quest Log → GM Setup → Advanced → **Import JSON** |
| `AG_Playtest_SkillTrees_0.5.0.json` | Skill Trees → GM Setup → **Import Tree Layout JSON** |
| `AG_Playtest_HQ_Facilities_0.5.0.json` | Headquarters → GM Setup → Facility Catalog → **Import Facility Definitions JSON** |

## Import order

1. **Manager pack first.** Turn "Include drafts" off for a player-facing test (on to also get the draft recipe/item). Apply. Items, Journals, Actors and the Roll Table are created; the 8 `LOC-PT-*` locations go to Locations in the same run (Locations must be active). Re-import keeps existing locations (tick "Update existing locations" to replace them).
2. **Quests**, **Skill Trees**, **HQ facilities**: any order, after step 1.

## What is in the Manager pack

- **3 professions, 8 materials, 8 recipes + crafted items, 3 give-away recipe items** as in 0.4.0 (Glassbloom Elixir needs the *[TEST] Alchemy Laboratory* workstation; Draft Draught is a draft; GM-only Resin is GM-only; Mistveil Tonic uses the profession default tool).
- **4 profession perks** (`PERK-PT-ALCH-*`, one GM-only) for the Alchemy skill tree.
- **4 ordinary stash items** (`ITEM-PT-STASH-*`) in `Ashen Gate/Playtest/Items/Stash`.
- **3 test characters** in `Ashen Gate/Playtest/Characters`:
  - `[TEST] Belwar`: Alchemist's Supplies, Alchemy (10 XP = level 2), Ember Salve recipe item (not learned), Emberroot/Palemoss/Glassbloom, Poisoned + a custom status, 2 stash items.
  - `[TEST] Kessa`: Smith's Tools, Blacksmithing (5 XP), already knows Iron Hinge Set, holds a Test Dagger recipe item ×2, ore/coal/leather, Prone + a custom status, 2 stash items.
  - `[TEST] Orin`: Herbalism Kit, Herbalism, few materials (shows missing-ingredient states), 3 stash items.
- **3 Journals**: `[TEST] Greenhollow — Field Notes` (use as a location note), `[TEST] Marsh Crossing — Handout`, and a GM-only chapel note.
- **1 Roll Table** `[TEST] Marsh Finds` (6 text results).
- **1 hireling + perk** (`HIRE-PT-SMITH`, `HPERK-PT-WORKING`) as world Items for Headquarters.
- **8 locations**: Greenhollow, Cinder Quarry, Ash Hollow (unrevealed) as before, plus the Hollowmere point-crawl: a Region with conditions (one GM-only) > Drowned Chapel (overrides two Region conditions; gathering nodes: renewable, finite, exhausted, GM-only; loot: available/discovered/taken/plain/GM-only) > Chapel Crypt (grandchild room, loot, custom detail block). Also a **Hidden** Sunken Cache (inside the chapel) and an **Unidentified** Lantern Mound (inside the Region, label + teaser).

## What Manager does with it

- Creates **new** Items, Journals, Actors and the Roll Table. **Manager never updates an existing Actor** (or table/macro); to retest characters, delete them and import again.
- Actors arrive with ownership **None**. Tool, profession, materials, recipe and stash items are embedded with their source ids, so the Ledger and Utilities see them.
- The Ledger flags on the characters (`professionProgress`, `knownRecipes`) are seeded on these brand-new Actors only; the Ledger owns them from then on.
- Custom statuses come from Active Effects on the characters (`pt-stonefast`, `pt-hexed`); no setup needed.

## What you still do by hand

1. **Player accounts:** Actors directory → each `[TEST]` character → Ownership → give your test player Owner. Import cannot assign users.
2. **Item links:** loot entries and the Chapel note name pack Items/Journal in their text but are not native links (an import cannot know a world UUID). Drag the Item (or the Journal) from the sidebar onto the entry once to link it. Drag pack Items/Journals onto `[TEST] Marsh Finds` to add document results.
3. **Quest states:** quests import as Hidden. In Quest Log → GM Setup set statuses/reveal, and mark `[TEST] Smoke at Cinder Quarry` **Completed** (status is campaign state, not importable). Objective reveal and progress are also clicked there.
4. **Party Notes** are campaign state: open a visible location as a player → Party Notes → Edit.
5. **Party Stash:** Utilities → Party Inventory → Create Party Stash → Turn On for Players → drag stash items in.
6. **Group Check:** Utilities → Group Checks (use the three characters).
7. **Headquarters:** Open HQ → activate with any id like `HQ-PT-GUILD` and `LOC-PT-GREENHOLLOW` (the pack has no `HQ-*` record; if activation insists on one, tell me). Then Facility Catalog → Unlock → Acquire; Hirelings → add `[TEST] Hireling Smith` from imported definitions.
8. **Skill Trees:** import the file; to publish, edit the tree and Publish. Profession-tree perk picks are the Ledger's job (Skill Trees shows them read-only).
9. **Factions: not in the pack.** Factions has no import path (its definition export is export-only). Use its console fixture (see `modules/ashen-gate-factions/fixtures/README.md`): one line creates revealed/hidden/undiscovered factions with renown.
10. **Document results on the Roll Table / Utilities unsafe-result case:** Utilities' own console fixture (`modules/ashen-gate-utilities/fixtures/SETUP_AND_RESET.md`) creates the `Unsafe Document Result` table.

## Regenerating

Edit `scripts/build-test-pack.mjs`, bump `PACK_VERSION`, run `node scripts/build-test-pack.mjs`, commit the new files and delete the old ones. `node scripts/check.mjs` fails if a file is out of date, an id is duplicated, or a reference does not resolve.
