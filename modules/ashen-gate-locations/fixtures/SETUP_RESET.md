# Locations v0.8.0 — Actual Foundry record fixture and safe reset

**Synthetic TEST data only.** Not Ashen Gate canon, real playtest evidence, finalized Profession materials, or production campaign state. The fixture is in the separate **Fixtures ZIP** and matching **Source/TestKit ZIP**, under `fixtures/`. It is deliberately **not** installed in the runtime module ZIP. It is a genuine `ag-locations-source/0.1` JSON import; importing it through the normal GM interface creates **six real Location source Journals** in the Foundry world, with stable `LOC-AGTEST-*` identities. There is no fake Test Mode.

## Setup — backed-up/disposable Foundry V14 world

1. Back up the world and install Locations v0.8.0. Log in as a **GM**.
2. In **Items → Location Builder → Library → More → Import Locations JSON**, select `fixtures/AG_Locations_Real_World_Fixture_v0.8.0.json` extracted from this release. **Review Location Import** must say `6 Locations`, `New: 6` on an empty test world; click **Confirm**. Do not choose a similarly named old source file.
3. Reopen Location Library; search `AGTEST`. Confirm six real records in the grouped Library and the Region hierarchy `Frontier Region → Forest Verge Subregion`.
4. Open **[TEST] Survey Mine**; inspect its actual Resource, its `QUEST-AGTEST-SURVEY` Required Objective reference, Region, and POI. These external `MAT-*` / `QUEST-*` / `CONTRACT-*` IDs are **deliberate synthetic typed references, not imported owner records**. Do not call them resolved unless you have matching real records in the owning module.
5. To test native player permissions, open **[TEST] Roadside Shelter → Journal Preview**, click **Preview Saved → Publish**. In Foundry **Journals**, grant one test Player **Observer** on the created published Journal only. The GM source Journal should remain restricted. Repeat with unrevealed POI and afterward enable its Reveal checkbox; save, preview and republish. Never give a player ownership of the Source Records or Map Registry Journals.
6. For map tests use an existing disposable Foundry Scene with seven manually placed correctly named tinted Tiles, **or skip those map cases as Blocked**. This fixture intentionally creates no Scene, Tile, token, or map registry entry and cannot supply artwork. Check the seven filenames in module README.
7. For optional Objective lookup tests, disable Quest Manager to verify `owner_unavailable`. With Quest Manager v0.3.1 active, `QUEST-AGTEST-SURVEY` remains unresolved unless **a real Objective of that exact ID** has been separately installed using Quest Manager's supported source flow. Use an actual existing Quest ID in a disposable copy of the Location if you want a resolved lookup. Never equate the fixture's typed reference with a created Quest.

## Reset / cleanup

1. Back up again if you added hand-written notes to test records; reset deletes **test** Journal pages as well as source.
2. As GM, create a disposable **Script Macro**, paste the entire `fixtures/AG_Locations_Reset_Test_Fixture.js` content, then execute it. Alternatively paste the complete script into the GM browser developer console (F12 → Console). Review its confirmation dialog. It deletes only Journals tagged with one of the six fixture IDs and the exact provenance string, including their managed published Journals. It never alters Scenes, Tiles, Map registry, or other content.
3. Delete the disposable reset Macro manually. Reopen the Location Library; search `AGTEST` to confirm the test records are gone.
4. If you separately created an Objective, Scene/Tile or Map, remove **those manually through the owning module or Foundry**; the Locations reset deliberately does not touch them.
5. Restore your world backup if you need to undo additional unrelated testing. Existing published Location Journals without the exact test provenance are deliberately retained.

## Privacy limits

Even `visibility: player` on a reusable Location definition does **not** grant player access to its GM-owned raw source Journal or APIs. Publication is separate and starts with native Foundry ownership `NONE`; a GM must explicitly grant a player Journal Observer rights. Tests are never automatically player-visible. No data writes occur from merely opening a test sheet or viewing these files.
