# Ashen Gate | Quest Manager

Module ID `ashen-gate-quest-manager` · Foundry V14 · dnd5e. Quest, Work Order and Contract objectives with a Party log and per-character Individual logs, GM-driven reveal, progress and rewards, and GM-only Assignment records. Open it from **Actors sidebar → Quests** (players when **GM Setup → Player Access** is on).

## Tabs

- **Party** and **Individual:** what players can see. Tick **Track** on an objective, then **Show Objectives Overlay** for a small on-screen tracker (display only; it does not change progress). Individual is scoped to the character's owner.
- **Quests** (GM): every quest, order and contract (Draft, Hidden, Available, Active, Completed, Failed) with search, filters (type, status, location, visible to players), sort and grouping. Pick one to edit it in the same tab, or **New quest**. Import JSON and Export Sources are in its toolbar. Drafts are never shown to players.
- **GM Setup** (GM): Player Access, objectives overlay and compendium pack IDs (Advanced).

Three objective types share one model: `QUEST-*`, `ORDER-*` (crafting/production work order) and `CONTRACT-*`. Hidden / Available / Active / Completed / Failed are campaign statuses, separate from a source definition's own `status` (draft, approved, …). `ASSIGN-*` Assignments are GM-only execution records attached to an objective; they make no automatic Faction, Profession, Location or Headquarters changes.

## Relation to other modules

Independent. General Manager can hand Quest files to `api.previewQuestImport` / `api.importQuests` (GM only); Quest's own Import JSON keeps working. Locations links appear on quests when Locations is active. Factions can reference Objective ids and only reads Quest data through feature-detected, GM-only diagnostics.

## Privacy

Source and campaign state live in GM-only Journals; players see only permission-filtered projections of revealed data. GM-only Journals must never be given player ownership.

## Public API

`game.modules.get('ashen-gate-quest-manager').api`:

```js
const api = game.modules.get('ashen-gate-quest-manager')?.api;
const result = api?.resolveObjective('QUEST-EXAMPLE', {entityType: 'Objective'});
const view = api?.getVisibleObjective('QUEST-EXAMPLE'); // sanitized player view
```

Also: `open`, `openObjective`, `tracking`, `listVisible`, `consumer` (`resolveObjective`, `refreshCompendiums`, `getDefinitionReaderStatus`), `assignments` (`list`, `get`, `save`, `remove`; GM only), `listQuests`, `getGMSource`, `getGMState`, `setGMState`, `previewQuestImport`, `importQuests` (all GM only) and `playerAccess` (`ag-player-access/1`). Player reads need Player Access and a published, readable projection. Compendium-based definitions are configured by exact pack id in GM Setup → Advanced.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-quest-manager/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-quest-manager-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
