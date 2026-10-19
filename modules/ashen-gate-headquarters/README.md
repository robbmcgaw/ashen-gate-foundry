# Ashen Gate | Headquarters

Module ID `ashen-gate-headquarters` · Foundry V14 · dnd5e. A shared Guildhall: build its layout from facilities, keep a hirelings roster, personal quarters and benefits. Facility effects are informational; this module does not apply mechanics. Open it from **Actors sidebar → Headquarters** (players when **GM Setup → Player Access** is on).

## Tabs

- **Guildhall Builder** (shown as **Activation** until the GM activates the Guildhall, a one-time setup step): place acquired facilities on the Guildhall canvas.
- **Personal Quarters**, **Hirelings** and **Benefits**: per-character rooms, the hosted hirelings roster (including permanent departures) and the guild's benefits.
- **Facilities** (GM): every imported or seeded facility definition with Locked / Unlocked / Acquired status, copies owned and installed, search, filters, sort and grouping. Unlock, Acquire +1, Import Facility Definitions JSON, Decorations and the test-record seeder live here. It also works before the Guildhall is activated, so facilities can be imported first.
- **GM Setup** (GM): settings only: Player Access, Guild / Canvas settings, Five-Rank configuration, Create Missing Player Rooms.

State is kept in a GM-only Journal; players see filtered views.

## Relation to other modules

Independent. General Manager hands facility files to `api.previewFacilityImport` / `api.importFacilities` (GM only): new facilities are added and existing ids are kept. Importing never unlocks or acquires anything.

## Public API

`game.modules.get('ashen-gate-headquarters').api`: `open`, `playerAccess` (`ag-player-access/1`), `inspectFacilityRef`, and GM-only `getState`, `exportState`, `getPersonnel`, `reconcileDepartures`, `previewFacilityImport`, `importFacilities`.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-headquarters/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-headquarters-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
