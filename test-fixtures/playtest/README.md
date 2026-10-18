# Playtest data pack

Synthetic data for testing Manager, the Profession Ledger and Locations in a live world. Everything is `[TEST]`-named placeholder content with no rules effects; it is not canon.

Contents: 3 professions (Alchemy, Herbalism, Blacksmithing), 8 materials, 8 recipes with crafted items, 3 recipe items meant to be handed to players, and 3 locations (Normal, Hot and Deadly threat) that list the materials as gathering resources. Deliberate examples: `MAT-PT-GM-ONLY-RESIN` (visibility `gm`) and `REC-PT-DRAFT-DRAUGHT` / `ITEM-PT-DRAFT-DRAUGHT` (status `draft`). Players must never see these. Locations: `LOC-PT-ASH-HOLLOW` is unrevealed, and Greenhollow and Cinder Quarry each hide a note, a description or a resource entry.

## Download

Raw file: `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/test-fixtures/playtest/AG_Playtest_Pack_0.2.0.json` (use Save As, or open the file on GitHub and click Download raw file).

## Import with Manager

1. Open Ashen Gate | Manager (GM only) and choose the import/package option, then pick `AG_Playtest_Pack_0.2.0.json`.
2. Leave "Include drafts" off for a normal player-facing test. Turn it on to also import the draft recipe and item.
3. Apply. Items land under `Ashen Gate/Playtest/` (Professions, Materials, Recipes, Items).

## Import the locations

Manager lists the three `LOC-PT-*` records as blocked ("must be imported through the standalone Locations module"); that is expected.

1. Items sidebar → **Location Builder** → **GM Setup** → **Import JSON**, pick the same `AG_Playtest_Pack_0.2.0.json`.
2. Three locations appear under *[TEST] Playtest Vale*. Other record types in the file are ignored.

## Give a recipe item to a character

1. In the Items sidebar open `Ashen Gate/Playtest/Recipes`.
2. Drag `Recipe: [TEST] Ember Salve`, `Recipe: [TEST] Iron Hinge Set` or `Recipe: [TEST] Test Dagger` onto a character sheet. These three are consumables, the other recipes are loot.
3. Give the character some materials from `Ashen Gate/Playtest/Materials` (for Ember Salve: 2 Emberroot and 1 Palemoss).
4. In the Profession Ledger, as that player, check the Recipes tab shows the recipe and its ingredient availability.

## Regenerating

Edit `scripts/build-test-pack.mjs`, bump `PACK_VERSION`, run `node scripts/build-test-pack.mjs`, and commit the new file. A test fails if the committed pack is out of date.
