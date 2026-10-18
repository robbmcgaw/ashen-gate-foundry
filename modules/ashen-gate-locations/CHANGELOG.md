# Changelog

## 0.8.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.8.0 — 2026-10-17 (Alpha, local / uncommitted)
- AG-WORK-0007 / coordinated build: shared Items launcher DOM group and 36px/5px design, Manager rank 10 / Locations rank 20 (FB-2026-10-16-001).
- Content-fit CSS for resources, POIs and map overlays (FB-2026-10-16-003); no gameplay behavior change.
- Six world-importable synthetic Locations fixture records, owner-safe reset procedure, 32 exact-format GM/player cases and focused regression tests.
- 55/55 local Node/mocked tests, NOT a Foundry runtime certification; no persistent data migration.

## 0.7.0 Alpha — 2026-10-16 (AG-WORK-0007, pinned interface handoff)

- Built **directly from user-current v0.5.0 source**. A separate v0.6.0 candidate exists, so reserved v0.6.0 identity is not reused. This release makes no claim to incorporate that candidate.
- Added GM-only read-only `ag-locations-provider/0.1-alpha` integration surface for Archie's `ag-definition-resolver/0.1-prototype` v0.1.4. No dependency on optional Manager or duplicate source data.
- Added safe refresh/lease lifecycle and Journal hooks for registered resolver consumers; optional resolver errors do not undo successful Location saves.
- Added optional Eli Quest Manager v0.3.1 Objective reference status validation (`ag-objective-consumer/0.2-alpha`), with owner-unavailable/unsupported results and no Quest state mutation.
- Explicitly deny raw Location source-provider reads on non-GM clients; preserved GM-only editor and player Journal reveal boundary.
- 49 local/mocked Node tests passed; no live Foundry V14 run or GitHub commit.

# Ashen Gate | Locations — Changelog

## 0.5.0 Alpha — 2026-10-16 (AG-WORK-0007)

- Preserve `required`/`optional` relation modes when GMs edit target lists; provide editable mode dropdowns in Connections. Save/reload and clone-boundary regression tests added.
- Add `offers_objective` alongside unchanged `associated_objective`; reference links remain Locations-owned context only and never duplicate Eli's Objective progression/execution authority.
- Add local-only Location link audit (missing LOC targets, bad parent kinds and Objective ID shapes), intentionally not treating unknown external providers as missing.
- Add GM-only `getLocationSource` and `getLocationObjectiveRefs` provisional owner-scoped read adapters. No competing shared resolver or automatic Quest lookup.
- Adopt theme-ready semantic CSS tokens with fallbacks per development standard v1.6; no independent global theme setting or Manager dependency.
- Retain v0.4.0 Player Access read-only GM status, map overlays, Journal publication, custom pages, typed folders, and source import/export. No automatic migration.
- 40 local automated/mock tests passing. Real Foundry V14 GM/player and shared-provider integration **not tested**.


## 0.4.0 Alpha — 2026-10-15/16

- Align Locations with `AG-FOUNDRY-DEV/1.4` and DEC-0072: expose the optional `ag-player-access/1` status API as permanently **GM only**, with no setter or player-interface toggle. Existing GM Items launcher and API entry points remain permission-gated.
- Add GM access verification on window rendering, Location Library/Editor action callbacks and shared action dispatch; no campaign or document state is altered by player-access checks.
- Organize **new** Locations-owned Source, Published and Map Registry world Journals under nested `Ashen Gate/Locations/*` typed Journal folders; reuse exact matches and fail on ambiguous folder paths. Existing Journals and user-chosen folders are not migrated.
- Add **Clear Filters** to the Location library toolbar. Preserve all v0.3 hierarchy, map registry, overlay controls, and source import/export behavior.
- Automated/model/mock tests updated to 34 passing tests; no Foundry V14 live verification yet.
- The original intended v0.4 interactive pins are deferred to a subsequent feature build; this minor release contains contract adoption and safe beta improvements.

## 0.3.0 Alpha — 2026-10-15/16

- Add optional `belongs_to_region` parent to Region Locations (same LOC-* record type) with saved-parent and cycle checks, hierarchical Region filtering and display.
- Add GM-only Map Manager and Maps library tab. Register visual MAP-* metadata backed by a private world Journal, associate Scenes/Regions, configure seven pre-existing Fosstryn Frontier overlay filenames and bind specific Tiles.
- Add individual and bulk Scene Tile visibility controls, ambiguity/missing-Tile handling, map-change revision checks, and persistent world bindings without touching map images or campaign discovery state.
- Preserve v0.2 source and Journal schema; module install requires no world-data migration. Do not auto-create canonical Region IDs.
- Adopt the v1.2 GM-only Items launcher requirement; retain independent module operation.
- Static and mocked Foundry regression tests extended (25 total). Live Foundry V14 click-through and player login remain unverified.

## 0.2.0 Alpha — 2026-10-15

- Align Location Library and Editor to **AG-FOUNDRY-DEV/1.1**: name/version/help header, library tab, search + region/level/tier toolbar, grouped collapsible region listings, consistent editor tabs, Save/Preview/Publish footer, and unsaved-draft warning before closing.
- Add **Location Builder** GM-only Items-sidebar launcher above the Items list; can join shared Ashen Gate sidebar launch bar after Manager. No runtime dependency on Manager.
- Add feature-detectable `module.api.open()` alias while preserving `openLibrary()` and `openEditor(id)`.
- Keep persistent Location data and prototype JSON transport format unchanged from v0.1.0. No migration or record overwrite is required.
- 13 local Node tests pass, including two new launcher behavior checks. **Not tested inside the real Foundry V14 client.**

## 0.1.0 Alpha — 2026-10-15

- Initial standalone Location library/editor, world Journal-backed definitions, import/export, revision checks and manual Journal publishing.
