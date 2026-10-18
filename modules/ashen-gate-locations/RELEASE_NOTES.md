# Ashen Gate | Locations — v0.8.0 Alpha (local candidate; NOT PUBLISHED)

**Coordinated pass:** `AG-COORDINATED-BUILD-2026-10-17`; **Assigned work:** `AG-WORK-0007` (with shared UI `AG-WORK-0016`); **Source baseline:** GitHub `main` SHA `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8`; module v0.7.0 published source/ZIP. **New module version:** v0.8.0 Alpha, an additive UI/fixture iteration (no data migration). **No commit or PR.**

## Recorded feedback and implementation

- **FB-2026-10-16-001:** Existing Locations launcher created its own `.ag-sidebar-launchers` group, unlike Manager. It now feature-detects the common `data-ag-launch-group="items"` shelf, contributes a **direct-child** Location Builder button (`data-ag-module`, `data-ag-order=20`, `data-ag-launch-order=20`), recognizes the Manager (order 10), consolidates pre-existing duplicate wrapper shelves on renderer rerun and positions the shelf before directory search/header. Equal-width 36px buttons with 5px gaps, scoped CSS and clear accessible label. The GM-only handler/API guards remain in place. No Manager dependency. Owner modules must cooperate on their own group creation for perfect first-render order.
- **FB-2026-10-16-003 / AG-FOUNDRY-DEV/1.7:** Resource abundance/reveal and POI reveal controls, Map Manager Scene/Tile selectors and overlay Show/Hide buttons use content-fit sizing with the existing spacing and responsive layout. No new design framework, only scoped CSS.
- **Real-data fixture:** `fixtures/AG_Locations_Real_World_Fixture_v0.8.0.json` imports **six real world Location source Journals** through Locations Library → More → Import Locations JSON, with source-only GM ownership. Contains parent and nested Region, mundane visible Location, resource `RES-*`/`MAT-*` link, reveal-gated site, undiscovered site, POI and optional/required typed Objective links. **Synthetic TEST data, not canon.** Material/Objective target definitions remain owned by other modules and are *not fabricated* by this fixture. See `fixtures/SETUP_RESET.md` and GM-confirmed targeted `fixtures/AG_Locations_Reset_Test_Fixture.js`.
- **Test cases:** `docs/FOUNDRY_TEST_CASES.csv` and `.md` contain 32 rows, exactly `Test ID, Test Name, Module, Role, Test Steps, Expected Outcome, Pass/Fail, Test Notes`. Any console test includes a full copyable command and console location. Pass/Fail and Test Notes intentionally left blank for user observations.

## Preserved boundaries and migration

- Stable module ID `ashen-gate-locations`, source format `ag-locations-source/0.1`, `LOC-*` and `RES-*` identities, typed `required`/`optional` links, Region ancestry and revisions; no new persistent fields. Existing saves and Journals are not touched at install.
- Locations own operational resource/discovery/campaign state; Maps are spatial only; Quest Manager owns Objectives; Archie resolver remains optional. No new data writes occur from clicking test docs. Player clients may only see deliberately published native Journal pages when given Foundry permissions, never raw source/Map registry/GM UI. `ag-player-access/1` stays **gm-only**, not configurable.
- Upgrade: back up Foundry world and previous module. Replace `Data/modules/ashen-gate-locations` with v0.8.0 folder, enable and reload. Rollback: restore v0.7.0 folder and world backup if testing introduced state. No automatic migration.

## Exact evidence / limitations

- `node --test tests/*.test.mjs`: **55/55 local Node/mocked tests passed**, including 49 retained plus 2 new launcher behavior cases and 4 new real-fixture/schema/privacy/reset checks. Script syntax and ZIP CRC verified. See `tests/test-results-v0.8.0.txt` and `VALIDATION_SUMMARY.json`.
- **Live Foundry V14 Stable 9 (Build 367), The Forge, dnd5e 6.0.6:** user-reported target; **not tested here**. No screenshot of actual Foundry UI is available; screenshots required during GM/player pass.
- A competing Manager/other-module shelf may still need its own bootstrap adjustment for fully stable very-first-render ordering: this module consolidates duplicates when Locations rerenders. Verify combined Items launchers, GM-only API bypass and compact layout in the exact 8-module candidate.
- The importer is not atomic across unexpected Foundry write failures; take a disposable world backup. Fixture cleanup removes only matching provenance-tagged AGTEST source/published Journals and does not clear unrelated map/Objective test records.
- No automatic Scene/Tile creation or map pin editor; no independent Profession/Quest definitions imported. External `MAT-*` and Objective fixture links must be resolved using *real owning-system records* if end-to-end lookup is to be accepted.
- Theme fallback tokens remain local and Manager optional; no theme API version is invented.

## Handoff

**Files:** installable `AG_ashen-gate-locations_v0.8.0_Alpha.zip`, matching `AG_Locations_v0.8.0_Source_TestKit.zip`, fixture `AG_Locations_v0.8.0_Fixtures.zip`, exact-format test CSV/Markdown, manifest/SHA256. Build SHA/ZIP hashes in `SOURCE_REVISION.json` and the outer SHA256 manifest.

**Next:** Sally/Stu can consume source/fixtures for exact-package static tests; the user runs live Foundry GM/player acceptance after coordinated assembly. This release **must not be pushed/committed until separately authorized.**
