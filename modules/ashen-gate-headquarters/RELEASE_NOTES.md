# Headquarters v0.6.0 Alpha — coordinated feedback pass (unpublished)

**Status:** Local candidate built from GitHub main `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8`, pinned HQ v0.5.3 package with SHA-256 `5583649a77d00fed5a263ea793c2801fdaebd561877b394d6674d4e07a4c42fe`. **NOT committed or released to GitHub.**

**Scope:** AG-WORK-0005, FB-2026-10-16-002/003, FB-2026-10-17-014/015/016 and Actors launcher FB-2026-10-16-001.

## Changed behavior

- Close/reopen: clear the old app singleton immediately when closing; avoid waiting on asynchronous edit-lease writes inside the Foundry window close path; create a fresh ApplicationV2 on subsequent Open. All launchers continue using the same versioned `api.open()`.
- Canvas image: clean optional background fit (`contain`, `cover`, `stretch`), X/Y position and 0–100% opacity with a standalone image layer. Defaults show the entire original image at full opacity; art quality still depends on source resolution. Layout images do not change installed facility geometry.
- GM Setup: compact rank, canvas-dimension and Player Access controls; clearer import → search → unlock → acquire → install flow; preserve catalog filter and tab scroll across rerenders; seed test facility action creates real HQ records and provides feedback.
- Player request bridge: when the Foundry `game.users.activeGM` shortcut is unavailable, safely identify the same active GM through the collection; **authorization still uses the server-supplied Actor update-hook userId**, never a client-claimed socket sender. Response errors are logged for diagnosis. This is source/mock-tested, **not confirmed to fix the reported two-client timeout**.
- Real-data fixtures: `fixtures/HQ_Test_Facility_Catalog_v0.6.0.json` is an importable FAC catalog, `fixtures/HQ_Test_Hireling_Definitions_v0.6.0.json` is the canonical synthetic HIRE/HPERK source; `fixtures/test-records.mjs` creates/deletes two real tagged Foundry world Items. `assets/hq-framing-test.png` visually checks crop/position, no copyrighted artwork.

## Preservation and privacy

No change to `aghq-state/0.1` identity, migration procedure, Guild Rank or room/staff keys. Image controls are optional additive config with safe legacy fallback. DEC-0076 persists: HQ hosts Hirelings UI and GM personnel Journal; Working OFF preserves slot; confirmed permanent departure clears staffing/history atomically. No Des event bridge, no Quest ASSIGN duplication. Player projection stays redacted; `getState`, `getPersonnel`, `exportState` remain GM-only. No mandatory Manager, resolver or theme-controller dependency.

## Validation

- `node --test tests/*.test.mjs`: **61/61 passed** (53 existing + 8 new fixture, metadata, bridge tests).
- `python tests/browser_test.py`: **passed** against a mocked Foundry browser including close/reopen, existing Guildhall/Hireling workflow, image controls, catalog filter retention, player-state redaction, GM/player Actor-update simulation and failed-vault fallback.
- JavaScript syntax/JSON validation, package ZIP CRC and file provenance checked before handoff.
- **Actual Foundry V14 Stable 9 + dnd5e 6.0.6 GM/player live acceptance NOT RUN.** Screenshots are fake-Foundry only.

## Known limits and gates

- Real player Actor update hook delivery/GM acknowledgment and lock release across separate Forge clients remains user-reported failing in v0.5.3. The fallback is a targeted potential fix, not a promise. Run HQ-38/HQ-46; capture both client logs and result before classifying as fixed.
- Private Journal ownership, GM-first legacy migration, simultaneous GM sessions and reconnect behavior require live testing. Do not place secrets in the public facility catalog, art paths, or client-readable settings.
- Close/reopen fix is browser-simulated, not yet confirmed on a real V14 close lifecycle.
- Background fit cannot increase low-resolution image detail. Crop and opacity values need GM visual review at different viewport widths.
- Synthetic HQ fixture records survive regular UI reload and must be reset by restoring a test-world backup; the Item-only cleanup helper never deletes campaign state.
- Full benefit automation, Location/Objective optional reads, compendium provider integration, theme runtime overrides and player-readable Hireling publication remain outside this focused pass.
