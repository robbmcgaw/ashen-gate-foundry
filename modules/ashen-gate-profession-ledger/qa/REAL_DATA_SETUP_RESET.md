# AG-WORK-0020 — Real-record Foundry V14 acceptance setup/reset

**Only the GM performs these steps in an expendable test world / world backup.** The Ledger module does **not** generate fictional in-memory actors or recipes for UI testing. Tests use the normal imported definitions and real Foundry Actors.

## Source records

1. Use `qa/fixtures/AG_Professions_PinnedChain_v033_ManagerImport.json` in this package; it contains nine exact source records extracted from the v0.3.3 authoritative source ZIP and has all required references closed. Compare it with `qa/fixtures/AG_Professions_PinnedChain_v033_Source.json` and the original pinned `tests/fixtures/AG_WORK_0002_Material_Recipe_Item.json`. The committed GitHub handoff projection is also available at `systems/professions/imports/AG_Professions_PinnedChain_v0.1.1_ManagerImport.json`. **Do not import the three-record fixture directly**: it lacks both PROF definitions.
2. Use Manager v0.11.1 or the integrated pinned Manager build (as applicable); in a disposable V14 world import the JSON using **development/draft acceptance** because the preserved source records are draft. Record any import errors.
3. In Foundry Actors, create a disposable PC named `AG TEST — Ledger Actor`, and grant the imported `PROF-ALCHEMY` Item to that Actor using normal Foundry controls. Set its ownership for a test player as needed. In Ledger GM Setup, select only this Actor as the party roster; do not change real campaign Actor flags or inventory.
4. For Recipe Learning tests, prepare a disposable tagged recipe Item corresponding to `REC-ALCHEMY-FIELD-MEDIC-S-SALVE`, given to this Actor in normal inventory; do **not** pre-mark the recipe as learned. This makes the learning test an actual state-write and inventory-consumption exercise, not a preview test. Backup the test Actor before proceeding.

## Reset

1. Close Ledger on both GM and player clients. Remove the disposable Actor from Ledger's party roster via GM Setup and Save.
2. Delete the disposable `AG TEST — Ledger Actor` (and its Actor-owned known-recipe state and inventory). Do not delete a real campaign Actor.
3. Use Manager's Library to archive/delete only the nine `AG-PROFESSIONS-PINNED-CHAIN` test definitions, respecting any linked dependency safeguards. Restore from your world backup instead if managed source identification is ambiguous.
4. Delete test-only world folder branches only when verified empty; don't remove other Ashen Gate records. Reload GM and player clients and confirm no disposable Actor appears in Ledger.

## Boundaries

No live V14 test is claimed here. Test Actor XP/recipe learning only by explicit GM/player action in the disposable world; neither import nor reset should mutate unrelated Actors. The manager-only import/placement and resolver pack-only behaviors are separate acceptance gates.
