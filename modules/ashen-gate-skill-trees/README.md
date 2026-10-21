# Ashen Gate | Skill Trees

Module ID `ashen-gate-skill-trees` · Foundry V14 · dnd5e. Progression trees (generic points and Cinder-style trees) where every node is a world perk. Open it from **Actors sidebar → Skill Trees** (players when **GM Setup → Player Access** is on).

## How it works

- **Every node is a perk.** A node names a world perk by its permanent `PERK-*` id (Cinder trees: `POWER-*`); the world Item's UUID is only the local binding. Name, text, picture and point cost come from the perk (`point_cost` on its source definition; 1 when absent). Add a perk to a tree by dragging it in from the Items sidebar or the Perks list, or with its **Add** button. Position, prerequisites, OR groups and exclusions are stored on the node.
- **Unlocking adds the perk to the sheet.** It spends the character's points and creates a tagged copy of the perk on the Actor. A player's unlock is checked and written by the active GM's client (a GM must be logged in). Refund and Reset (GM) return the points and remove the tagged Item.
- **Profession trees** get 1 point per profession level from the Profession Ledger (16 max; 24 perks per tree). Players pick; the GM can remove, grant (override) or keep perks. The Ledger owns XP and level.
- **Graph.** Arrows run from a prerequisite to the perk it opens; dashed arrows marked OR mean any one of the group; red dotted lines mean you cannot take both. The canvas scrolls and zooms (Ctrl + mouse wheel, drag to pan); on narrow windows the sidebar becomes a drawer opened with **Menu**. **Tree as a list** gives the same information as text.
- **Tabs:** the tree view, **Tree Library** (GM: New Tree, Export Selected / All Trees, Saved data check, Give Missing Perks, Publish Player View, Backup Actor Tree Progress) and **GM Setup** (GM: Player Access, Initialize GM Storage on a fresh world, Strain bands and config, Developer Tools with the `[AG QA]` test fixtures).
- Points are awarded by the GM per tree. Players see a published, sanitized copy of the trees; GM-only nodes never reach them.

## Relation to other modules

Independent. General Manager owns import: tree files (`ag-skill-trees/0.3`, 0.2 still read) go through the GM-only `api.previewTreeImport` / `api.importTrees`. Skill Trees binds perks that already exist as world Items (for example imported by General Manager) by their stable ids and never changes Profession Ledger state (it reads the level through the Ledger's `api.progression`).

## Public API

`game.modules.get('ashen-gate-skill-trees').api`: `open`, `playerAccess` (`ag-player-access/1`), `listTrees`, `actorProgress`, `pointsSummary`, `unlock`, `embed.mount`, `strain` (0.15.0), and GM-only `grantPoints`, `refund`, `resetTree`, `giveMissingPerks`, `publish`, `previewTreeImport`, `importTrees`.

### `pointsSummary(actor)` (0.13.0)

Read-only points per tree for one character, for partner modules such as Character Hub.

```js
game.modules.get('ashen-gate-skill-trees').api.pointsSummary(actor)
// → [{treeId, name, kind, level, earned, spent, available}, ...]  one row per tree the caller can see
```

- `kind`: the tree's provider (`profession`, `generic_points`, `cinder_milestone`).
- **Profession trees:** `earned` is 1 point per Profession Ledger level (`level` is that level, 0 when the character doesn't have the profession). When the Ledger is missing or off, `level`, `earned` and `available` are `null` (no points can be spent then).
- **Other trees:** `earned` is the GM-awarded points; `level` is `null`.
- `spent` is the cost of perks unlocked on the tree; `available` is `earned − spent`, never below 0.
- A character with no points or perks gets rows of zeros; with no trees published, `[]`. GMs see every tree; players see published trees only, with the same numbers the player tree window shows.
- **Permission:** the GM, or a user who owns the Actor. Anyone else gets `Error('Actor access denied')`. Players are also refused while Skill Trees Player Access is off.


### `embed.mount(element, options)` (0.14.0)

Shows a compact list of one character's trees inside another module's window, for example Character Hub's Ashen Gate → Perks. Per tree: points to spend and spent (profession trees: level from the Profession Ledger), **Available now** perks with a real **Unlock** button, **Unlocked** perks, **Locked** perks with the reason, and **Open tree** (the full graph at that tree and character). The full graph and every GM control (refund, override, keep, awards, editing) stay in the Skill Trees window.

```js
const api = game.modules.get('ashen-gate-skill-trees')?.api;
if (api?.embed?.mount) {
  const view = api.embed.mount(element, {actorId: actor.id, mode: 'character'});
  // later: view.refresh();  view.unmount();
}
```

- `element`: a DOM element the caller owns. Skill Trees replaces its contents and adds the class `agst-embed`.
- `options.actorId`: the character. `options.mode`: `'character'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. It refreshes itself when the character, the published trees, Player Access or the Ledger level change, and unmounts itself if the element has left the page.
- **Permission:** the GM, or the Actor's **Owner** (same as `pointsSummary`). Anyone else sees "Only <name>'s owner and the GM can see this."; players see "The GM has hidden Skill Trees." while Player Access is off. Players see the published projection only (unrevealed nodes are left out). **Unlock** uses the window's own confirm and checks: the GM unlocks directly; a player's unlock is checked again and carried out by the GM client, exactly as in the window.

### `api.strain` — shared Strain (0.15.0)

One Strain value per character. Every system that adds or removes Strain (Cinder pushes, crafting, hazards, items, spells, consumables, blessings, rests) goes through this API; there are no other Strain pools. Strain is a separate part of Skill Trees: it is saved under its own flag name, `flags.ashen-gate-strain.state` (`{value, history}`), not under the Skill Trees flag.

```js
const strain = game.modules.get('ashen-gate-skill-trees')?.api?.strain;
if (strain?.contract === 'ag-strain/1') {
  strain.get(actor);   // → {value, band:{label,from,to}, chance, guaranteed, normalUseBackfires, guaranteeAt, hardMax}
  await strain.add(actor, 2, {source: {module: 'my-module', kind: 'hazard', ref: 'LOC-…'}, reason: 'Fell into the pit', opId: 'my-unique-id'});
}
```

- `add(actor, n, options)` / `remove(actor, n, options)`: n is a whole number from 1 to 1000. `set(actor, n, options)`: 0 or more. Remove stops at 0. There is no cap at 10; when the config has a `hard_max`, anything above it is recorded as `overflow`. Return `{from, to, delta, overflow, duplicate, changed}`.
- `options.source` `{module, kind, ref?}` and `options.reason` are required. `kind` is a short lower-case word (`push`, `crafting`, `hazard`, `consumable`, `spell`, `blessing`, `rest_long`, `gm`, …). `options.opId` (optional): a change whose `opId` is already in the history does nothing, so a retry never charges twice.
- `history(actor)`: the last 30 changes `{at, by, op, delta, to, source, reason, overflow?, opId?}`. These are on the Actor, so don't put secrets in reasons.
- `config()`: the Strain config (anyone can read it, for display). GM only: `previewConfigImport(file)`, `importConfig(file)` (Manager-style result rows, id `STRAIN-CONFIG`), `resetConfig()`. `validateConfig(file)` → `{errors, warnings, config}`.
- Hook `ashenGateStrain.changed` `{actorId, from, to, source, opId}` fires on every client after a change.
- **Permission:** reads (`get`, `history`): the GM or the Actor's owner; anyone else gets `Error('Actor access denied')`. Strain is a character resource, so reads are not hidden by Skill Trees Player Access. Writes (`add`, `remove`, `set`) run on a GM client only (`Error('GM only: …')` elsewhere). A module whose players trigger Strain relays the request to its own GM client, as it does for its other GM writes.
- **Rest recovery:** when dnd5e posts a long or short rest chat message for a character, the active GM's client removes `rest_recovery.long` (default 1) or `.short` (default 0), once per message. A rest with its chat message turned off recovers nothing.

#### Strain config file (`ag-strain-config/0.1`)

GM Setup → Strain → **Import Strain Config**, or later through General Manager. Every field except `schema` is optional; missing fields use the defaults below.

```json
{"schema": "ag-strain-config/0.1",
 "backfire_schedule": [0,5,10,20,25,35,50,60,75,90,100],
 "guarantee_at": 10,
 "normal_use_backfire_at": 10,
 "allow_prevention_at_guarantee": false,
 "bands": [{"from":0,"to":0,"label":"[TEST] Calm"}, {"from":1,"to":9,"label":"[TEST] Uneasy"}, {"from":10,"to":null,"label":"[TEST] Overwhelmed"}],
 "hard_max": null,
 "rest_recovery": {"long": 1, "short": 0}}
```

- `backfire_schedule[i]`: Backfire % at Strain i (whole numbers 0–100, never going down); Strain above the last entry uses the last one. From `guarantee_at` it is 100% (modifiers cannot lower it unless `allow_prevention_at_guarantee`).
- `normal_use_backfire_at`: from this Strain a normal (non-Push) use also backfires (used by Cinder powers in a later version).
- `bands`: start at 0, no gaps or overlaps; the last band is open-ended (`"to": null`) unless it reaches `hard_max`. Labels up to 60 characters.
- `hard_max`: `null` (no maximum) or a whole number.
- `rest_recovery`: Strain removed by a long / short rest.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-skill-trees/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-skill-trees-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
