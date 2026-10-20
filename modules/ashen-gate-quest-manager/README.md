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

Also: `open`, `openObjective`, `embed` (`mount`, see below), `tracking`, `listVisible`, `consumer` (`resolveObjective`, `refreshCompendiums`, `getDefinitionReaderStatus`), `assignments` (`list`, `get`, `save`, `remove`; GM only), `listQuests`, `getGMSource`, `getGMState`, `setGMState`, `previewQuestImport`, `importQuests` (all GM only) and `playerAccess` (`ag-player-access/1`). Player reads need Player Access and a published, readable projection. Compendium-based definitions are configured by exact pack id in GM Setup → Advanced.

### `embed.mount(element, options)` (0.8.0)

Shows one character's quests inside another module's window, for example Character Hub's Ashen Gate → Quests: the Party quests and that character's Individual quests on the left (search, **Track**), the selected quest's objectives, locations, shared party notes and **Character notes** (Save) on the right, and an **Open Quest Log** button.

```js
const api = game.modules.get('ashen-gate-quest-manager')?.api;
if (api?.embed?.mount) {
  const view = api.embed.mount(element, {actorId: actor.id, mode: 'character'});
  // later: view.refresh();  view.unmount();
}
```

- `element`: a DOM element the caller owns. Quest Log replaces its contents and adds the class `ag-quest-embed`.
- `options.actorId`: the character whose Individual quests and notes are shown. `options.mode`: `'character'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. It refreshes itself whenever the Quest Log window would (quest, actor, user or setting changes) and unmounts itself if the element has left the page.
- **Permission:** the same as the Quest Log window's Party and Individual tabs. Players see "The GM has hidden the Quest Log." while Player Access is off, and only quests whose published view they can read. Track and Save Character Notes go through the window's own checks (a quest must still be visible; notes need Owner on the character). GM authoring, reveal and progress are not in the embed.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-quest-manager/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-quest-manager-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
