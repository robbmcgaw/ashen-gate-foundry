# Ashen Gate | Quest Manager v0.4.0 Alpha (unpublished candidate)

**Work:** AG-WORK-0008 / AG-WORK-0015 · **Status:** local source-level v0.4.0 candidate; not yet committed and **not** live Foundry V14 accepted.

A standalone D&D 2024 / Foundry V14 module for Quest, Work Order and Contract Objectives, Party and Individual Quest Logs, GM-driven discovery/reveal/progress/rewards, and Quest-owned delegated `ASSIGN-*` execution records. Install the ZIP by extracting its single `ashen-gate-quest-manager/` folder into the Foundry Data `modules/` directory, then enable the module in a **test world**. Manager is optional.

## Start here for the v0.4.0 user experience

Use **Actors → Quest Log → GM Setup** to create quests through normal fields, publish/reveal to players, and enable the player Quest Log interface. Players open **Party** or **Individual**, tick **Track**, then **Show Objectives Overlay**. The overlay shows only permitted public objectives; it does not affect quest progress.

## Main UI

- Actors sidebar **Quest Log** launcher (GM always; players only after GM enables Quest Manager Player Access in Foundry Module Settings or Manager's optional controller).
- `Party` and `Individual` (Actor-owner scoped) logs; `GM Setup` for source, five status controls, objective reveal/progress, note and reward tracking, and delegated Assignments.
- `Hidden`, `Available`, `Active`, `Completed`, `Failed` are **campaign Objective statuses**, never the source definition's `status` (`proposed/draft/approved/superseded/retired`).
- GM-only source + campaign-state `JournalEntry` flags, separate GM-only Assignment Journals, permission-filtered player Journal projections, and Actor-owner character-note Journals. GM-only Journals must never be granted player ownership.
- Three Objective types share one model: `QUEST-*` (quest), `ORDER-*` (crafting/production work_order), `CONTRACT-*` (contract). No mandatory three-object chain. `ASSIGN-*` is only delegated execution, not Headquarters staffing.

## Public API and permissions

```js
const api = game.modules.get('ashen-gate-quest-manager')?.api;
const result = api?.resolveObjective('QUEST-EXAMPLE', {entityType:'Objective'});
if (result?.status === 'ok') console.log(result.binding);
const view = api?.getVisibleObjective('QUEST-EXAMPLE'); // sanitized Quest-owned player view only
```

`api.resolveObjective` is a **provisional**, exact source-ID/type consumer contract. Player reads require both Player Access and a published, Foundry-readable Quest projection; hidden sources, secret objectives, and raw Manager imports never bypass reveal. GM reads use an independently bundled implementation of Archie’s pinned `ag-definition-resolver/0.1-prototype` for native world and explicitly configured compendium definitions, whether Manager is enabled or disabled. DEC-0078 selects a unique active world document over pack copies and fails closed on ambiguous duplicates or archived records. External Manager-created definitions are not automatically added to the Quest Log or given campaign state; use Quest's GM source import to manage them.

`api.assignments` includes `contract`, `list({objectiveId})`, `get(id)`, `save(record)`, and `remove(id)`; **GM-only for all operations**. The Assignment has its own typed required reference to an existing Quest-owned Objective, distinct `execution_status`, `participants`, and `results`. No automatic Faction, Profession, Location, Hireling, or HQ writes; the GM supplies campaign execution status and outcomes. The precise execution-status vocabulary is not finalized here.

**Pack setup:** In Foundry Settings, configure Quest Manager’s **Compendium pack IDs (GM Setup → Advanced)** with exact IDs, for example `world.quests`. Restart/reload the world for a changed pack list, or call `await api.consumer.refreshCompendiums()` as GM after a pack's contents change. Refresh is asynchronous; pack-only lookups remain unavailable until loaded. No automatic scan, Manager dependency, source import or Quest-state creation occurs. `api.consumer.getDefinitionReaderStatus()` returns GM-only diagnostics. Incomplete pack metadata fails closed, and players never receive raw pack definitions from `resolveObjective`.

Other existing APIs: `open`, `openObjective`, `listVisible`, `getVisibleObjective`, `getGMSource`, `getGMState`, `setGMState`, and optional `ag-player-access/1` `playerAccess.getState/setEnabled`. Read the consumer handoff for permission/lookup details. **Do not access other modules' private settings.**

## Source and acceptance

The source-tree archive contains the **same runtime files** as the installable ZIP, plus Node test suites, synthetic fixtures, release QA, integration contract and handoff. `node --test test/*.test.mjs` tests without Foundry; no live multiplayer/runtime certification is claimed. Node 22 was used for local tests. See `CHANGELOG.md` and `docs/VENDORED_RESOLVER_PIN.md`.


**Privacy condition:** All source/Assignment Journals remain GM-only; safe projections contain only explicitly revealed data. Never import GM secrets into accessible native Manager documents and assume JavaScript filtering will hide their flags.
