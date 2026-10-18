# Playtest data pack

Synthetic data for testing Manager, the Profession Ledger and Locations in a live world. Everything is `[TEST]`-named placeholder content with no rules effects; it is not canon.

Contents: 3 professions (Alchemy, Herbalism, Blacksmithing), 8 materials, 8 recipes with crafted items, 3 recipe items meant to be handed to players, and 3 locations (Normal, Hot and Deadly threat), each with 1–2 finite gathering nodes (skill, tier, DC, common and optional rare material). Deliberate examples: `MAT-PT-GM-ONLY-RESIN` (visibility `gm`) and `REC-PT-DRAFT-DRAUGHT` / `ITEM-PT-DRAFT-DRAUGHT` (status `draft`). Players must never see these. Locations: `LOC-PT-ASH-HOLLOW` is unrevealed; Cinder Quarry hides its description and its Coal node; Greenhollow hides a note and shows the DC of one node (the others keep it hidden). Recipes: Ember Salve needs Alchemist’s Supplies and the Iron Hinge Set and Test Dagger need Smith’s Tools (recipe `tool`); Glassbloom Elixir needs the *[TEST] Alchemy Laboratory* workstation; the rest use their profession’s tool from the Profession Ledger’s GM Setup.

## Download

Raw file: `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/test-fixtures/playtest/AG_Playtest_Pack_0.4.0.json` (use Save As, or open the file on GitHub and click Download raw file).

## Import with Manager

1. Open Ashen Gate | Manager (GM only) and choose the import/package option, then pick `AG_Playtest_Pack_0.4.0.json`.
2. Leave "Include drafts" off for a normal player-facing test. Turn it on to also import the draft recipe and item.
3. Apply. Items land under `Ashen Gate/Playtest/` (Professions, Materials, Recipes, Items), and the locations are imported with them.

## Locations

With Locations 1.2.0+ active, the same Manager import also creates the three `LOC-PT-*` locations (after the items, in the same Apply). They appear under *[TEST] Playtest Vale* in Location Builder. Without Locations they show as skipped ("enable Locations"). Importing again keeps existing locations; tick **Update existing locations** to replace their definitions. Location Builder → GM Setup → Import JSON still reads this file for Locations-only use.

## Give a recipe item to a character

1. In the Items sidebar open `Ashen Gate/Playtest/Recipes`.
2. Drag `Recipe: [TEST] Ember Salve`, `Recipe: [TEST] Iron Hinge Set` or `Recipe: [TEST] Test Dagger` onto a character sheet. These three are consumables, the other recipes are loot.
3. Give the character some materials from `Ashen Gate/Playtest/Materials` (for Ember Salve: 2 Emberroot and 1 Palemoss).
4. In the Profession Ledger, as that player, open the **Individual** tab: the recipe item has a **Learn** button; after learning, the recipe shows its ingredient availability and a **Craft** button.

## Regenerating

Edit `scripts/build-test-pack.mjs`, bump `PACK_VERSION`, run `node scripts/build-test-pack.mjs`, and commit the new file. A test fails if the committed pack is out of date.
