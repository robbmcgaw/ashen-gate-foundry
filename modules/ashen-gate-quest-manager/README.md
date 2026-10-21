# Ashen Gate | Quest Manager

Module ID `ashen-gate-quest-manager` · Foundry V14 · dnd5e. Quest, Work Order and Contract objectives with a Party log and per-character Individual logs, GM-driven reveal, progress and rewards, and GM-only Assignment records. Open it from **Actors sidebar → Quests** (players when **GM Setup → Player Access** is on).

## Tabs

- **Party** and **Individual:** what players can see. Tick **Track** on an objective, then **Show objectives overlay** for a small on-screen tracker (display only; it does not change progress). Individual is scoped to the character's owner.
- **Quests** (GM): every quest, order and contract (Draft, Hidden, Available, Active, Completed, Failed) with search, filters (type, status, location, visible to players), sort and grouping. Pick one to edit it in the same tab, or **New quest**. Status chips, Import and Export are in its toolbar; New quest is on the right. Drafts are never shown to players.
- **GM Setup** (GM): Player Access, compendium pack IDs and the objectives overlay. Player Access and pack IDs save together with **Save Changes**.

Three objective types share one model: `QUEST-*`, `ORDER-*` (crafting/production work order) and `CONTRACT-*`. Hidden / Available / Active / Completed / Failed are campaign statuses, separate from a source definition's own `status` (draft, approved, …). `ASSIGN-*` Assignments are GM-only execution records attached to an objective; they make no automatic Faction, Profession, Location or Headquarters changes.

## Item rewards (0.11.0)

In the quest editor (Quests tab), **Item rewards** sits under *Campaign status and reveal*. Drop items on it from a character or NPC sheet, a compendium or the Items sidebar; each change saves at once.
- Per row: quantity, **Shown to players** (after it's completed, the default; while the quest is visible; never), and **Goes to** (one chosen character, the default; each character; split). Goes to is fixed on individual quests.
- An item dropped from a sheet is copied into a GM-only Items folder, **Ashen Gate Rewards (Quest Log)**; the character or NPC keeps its item. Removing the row (asks first) deletes that held copy.
- Folders are refused ("Drop items one at a time."), and so is anything that isn't an item.
- Players see the rewards their row allows (name, picture and quantity only) under **Rewards** in the quest.
- *Rewards handled outside Quest Log* is the old checkbox, unchanged.
- API (GM only, contract `ag-quest-rewards/1`): `api.rewards.list(questId)`, `addFromDrop(questId, dropData)`, `update(questId, key, {quantity, visibility, recipient})`, `remove(questId, key)`.

## Giving rewards (0.12.0)

Every grant is started and confirmed by the GM; nothing is ever taken from anyone.
- Set a quest to **Completed** and save: if anything is still owed, the **Give rewards** panel opens under the reward list (or press **Give rewards** in its head). Tick what to give, pick the character for "One character", untick characters for "Each character", or share out "Split" in whole numbers. **Will receive** shows the result; **Grant rewards** asks first, then lists what each character got. **Not now** leaves the rewards pending.
- Party characters are the characters players own; individual quests always give to their character.
- Each character's items are created in one go, or not at all. Containers arrive with their contents. Each grant is a new item (no stacking).
- A reward is never given twice in the same round: saving Completed again offers only what is still owed, and a crash between creating items and saving the record is repaired from the items' tags.
- **Grant again** on a given row (asks first) lets you give it once more.
- Drag a row onto a character sheet to give it to that character (GM only, recorded; a second drop says "Already given to …").
- A whispered chat card goes to the GMs and the players who own the recipients. With Character Hub 0.25.0 or later, the character's Journey records the reward.
- Players see who got what nowhere; their quest counts as rewarded once every reward they can see is given (or the checkbox is ticked).
- API (GM only): `api.rewards.grantable(questId)`, `grant(questId, choices)`, `grantAgain(questId, rewardKey, {confirm: true})`.

## Relation to other modules

Independent. General Manager can hand Quest files to `api.previewQuestImport` / `api.importQuests` (GM only); Quest's own Import keeps working. Locations links appear on quests when Locations is active. Factions can reference Objective ids and only reads Quest data through feature-detected, GM-only diagnostics.

## Privacy

Source and campaign state live in GM-only Journals; players see only permission-filtered projections of revealed data. GM-only Journals must never be given player ownership.

## Public API

`game.modules.get('ashen-gate-quest-manager').api`:

```js
const api = game.modules.get('ashen-gate-quest-manager')?.api;
const result = api?.resolveObjective('QUEST-EXAMPLE', {entityType: 'Objective'});
const view = api?.getVisibleObjective('QUEST-EXAMPLE'); // sanitized player view
```

Also: `open`, `openObjective`, `embed` (`mount`, see below), `tracking`, `listVisible`, `consumer` (`resolveObjective`, `refreshCompendiums`, `getDefinitionReaderStatus`), `assignments` (`list`, `get`, `save`, `remove`; GM only), `listQuests`, `getGMSource`, `getGMState`, `setGMState`, `previewQuestImport`, `importQuests` (all GM only) and `playerAccess` (`ag-player-access/1`). Player reads need Player Access and a published, readable projection. Compendium-based definitions are configured by exact pack id in GM Setup → Compendium packs.

### `embed.mount(element, options)` (0.8.0)

Shows one character's quests inside another module's window, for example Character Hub's Ashen Gate → Quests: the Party quests and that character's Individual quests on the left (search, **Track**), the selected quest's objectives, locations, shared party notes and **Character notes** (Save) on the right, and an **Open Quest Log** button.

```js
const api = game.modules.get('ashen-gate-quest-manager')?.api;
if (api?.embed?.mount) {
  const view = api.embed.mount(element, {actorId: actor.id, mode: 'character'});
  // later: view.refresh();  view.unmount();
}
```

- `element`: a DOM element the caller owns. Quest Log replaces its contents and adds the class `agq-embed` (and, until 0.11, the old name `ag-quest-embed`; nothing is styled by it).
- `options.actorId`: the character whose Individual quests and notes are shown. `options.mode`: `'character'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. It refreshes itself whenever the Quest Log window would (quest, actor, user or setting changes) and unmounts itself if the element has left the page.
- **Permission:** the same as the Quest Log window's Party and Individual tabs. Players see "Quest Log is hidden" while Player Access is off, and only quests whose published view they can read. Track and Save Character Notes go through the window's own checks (a quest must still be visible; notes need Owner on the character). GM authoring, reveal and progress are not in the embed.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-quest-manager/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-quest-manager-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
