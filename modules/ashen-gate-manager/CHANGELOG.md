## 0.12.2 — 2026-10-18

- Header is one line: title and version on the left, Help and the "GM only" chip on the right. The empty emblem box (non-existent `fa-gate` icon) is replaced by a `fa-dungeon` icon.
- Module launchers moved to one compact row under the header with short labels and icons (Professions, Skill Trees, Quests, Factions, Headquarters, Locations, Utilities), in the same order as the Actors-sidebar launchers. Full name and state stay in the tooltip; inactive modules stay disabled. Wraps only at narrow widths. (#3)

## 0.12.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## v0.12.0 Beta — AG-WORK-0018 (2026-10-17)

- Fix Library local-edit scanning to compare serialized Foundry document data, avoiding render failures when live accessors expose non-cloneable document values.
- Reject invalid RollTable result types and malformed ranges/weights during whole-package preflight, before any documents are written. Update the prior synthetic fixture to V14's string result types.
- Route JSON/template/source exports through Foundry's file-save utility so actions save a file instead of navigating the browser to raw JSON; keep the browser fallback for unsupported runtimes.
- Add current-version header, compact direct Ashen Gate module buttons, and remove the redundant workflow subtitle.
- Normalize macro line endings when checking bundled macro re-imports; preserve edit conflict detection.
- Added reproducible valid/blocked RollTable fixtures and setup/reset notes. Node/mock only; live Foundry V14 acceptance remains separate.

## v0.11.2 Beta - 2026-10-16

- Reject `campaign_state` and unsupported scopes in the native definition reader; preserve unscoped Manager projections as valid.
- Add a regression covering a campaign-state Recipe incorrectly resolving as a reusable definition.
- 156 Node tests pass. No migration or campaign/Actor progression writes; live Foundry V14 remains untested.

## v0.11.1 Beta - 2026-10-16

- Pass the injected reveal policy into native definition visibility checks. Revealed records remain subject to current-user Foundry document permission; unrevealed, unreadable, and reveal-policy errors fail closed.
- Add a focused regression test; no data migration.
- 155 Node tests pass. Live Foundry V14 remains untested.

## v0.11.0 Beta — AG-WORK-0014; DEC-0077–0081 (2026-10-16)

- Built from the complete v0.10.0 Beta baseline; retained Items, Journals, Actors, RollTables, Macros, JSON/ZIP import, nested folders, icon fallbacks, Library, archive/restore, macro safety, Player Access, module launchers, and GM/player Appearance.
- Aligned Manager's read-only `ag-definition-resolver/0.1-prototype` consumer to Archie handoff b196dd7 (world unique active precedence over matching pack source, no world fallthrough, typed lookup, duplicate conflict, archived exclusion, permission-safe source read, GM reference validation, provider and explicit pack adapters).
- Preserved full reusable non-Foundry source definition in Manager projection source flags, including MAT/REC/PERK structured properties, provenance, version, and required/optional typed refs. Metadata-only reimport remains non-destructive to native Actor progress and campaign state.
- Explicit canonical NPC logical `entity_type: NPC` vs Foundry `document_type: Actor`; reject `entity_type: Actor` instead of silently rewriting IDs.
- Fixed CI-only test harness dependency: the v0.7.0 ZIP tests now import Manager’s bundled JSZip rather than a machine-specific global installation.
- Added synthetic end-to-end lifecycle/reader tests. Live Foundry V14 GM/player tests still outstanding.

## 0.10.0 Beta — 2026-10-16
- AG-WORK-0013/0014: preserve missing optional canonical source refs and expose authorized read-only native-definition reader using Archie resolver v0.1 baseline semantics.
- Add resolved/unresolved source-ref diagnostics; test five document kinds, archive, player access, explicit packs and event refresh.
- 142 Node local tests passed; Foundry V14 runtime test pending; no campaign migrations or gameplay changes.

## v0.8.0 — Player Access Controller Beta
- DEC-0072 / `ag-player-access/1` GM-only dashboard, per-owner API read/write, honest unsupported and missing statuses, Hide All with partial failure reports.
- Added status refresh and module-tile access labels; Manager advertises its own GM-only read-only capability.
- Preserved v0.7.0 import pipeline and existing specialist campaign/Actor state.
- See README-v0.8.0.md for GM/player runtime tests still outstanding.

## v0.7.0 — Actor & Document Import Beta
- Actor, RollTable, Macro create-only import support; ZIP package selection and opt-in bundled art upload.
- Expanded typed folders, UUID bindings, fallbacks, importer type counts and simplified Import UI.
- Stu 8-Actor JSON validated locally; live Foundry/dnd5e runtime remains unverified. See README-v0.7.0.md.

# Changelog

## 0.6.0 — Import Fidelity Beta (2026-10-15)
- New optional nested `foundry.folder_path` for Items/Journals; create/reuse typed folders on first import.
- Bundled category fallback icons with preservation of authored art, plus detected-404 fallback.
- Final world UUID binding pass for typed refs and provisional `[[AGREF:ID|Label]]` rich-text placeholders; missing and ambiguous targets reported.
- GM-only General Manager Items directory launcher; header and help improvements; compatibility with `ag-foundry-import/0.2` retained.
- Synthetic three-record clean-import fixture; local automated tests and release notes.

Earlier 0.5.1 changes are documented in `README-v0.5.1.md`.

## v0.9.1 — GM/player Appearance & Resolver Handoff Beta
- From exact v0.8.0 baseline: GM Appearance world default, separate player-safe per-user My Appearance screen, three scoped semantic token palettes.
- Optional `ag-appearance/0.1-beta` GM/player-safe setting API and specialist fallback/cleanup example. No gameplay or Player Access state copied or mutated.
- GM-only read-only helper to audit typed AG source IDs via Archie `ag-definition-resolver/0.1-prototype`, without mandating an SDK or choosing world-vs-compendium precedence.
- Existing JSON/ZIP document importing and Library untouched. Source-reviewed, local tests only. See README-v0.9.1.md.
