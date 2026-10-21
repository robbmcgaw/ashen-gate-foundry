# Ashen Gate | Skill Trees

Module ID `ashen-gate-skill-trees` · Foundry V14 · dnd5e. Progression trees (generic points and Cinder-style trees) where every node is a world perk. Open it from **Actors sidebar → Skill Trees** (players when **GM Setup → Player Access** is on).

## How it works

- **Every node is a perk.** A node names a world perk by its permanent `PERK-*` id (Cinder trees: `POWER-*`); the world Item's UUID is only the local binding. Name, text, picture and point cost come from the perk (`point_cost` on its source definition; 1 when absent). Add a perk to a tree by dragging it in from the Items sidebar or the Perks list, or with its **Add** button. Position, prerequisites, OR groups and exclusions are stored on the node.
- **Unlocking adds the perk to the sheet.** It spends the character's points and creates a tagged copy of the perk on the Actor. A player's unlock is checked and written by the active GM's client (a GM must be logged in). Refund and Reset (GM) return the points and remove the tagged Item.
- **Profession trees** get 1 point per profession level from the Profession Ledger (16 max; 24 perks per tree). Players pick; the GM can remove, grant (override) or keep perks. The Ledger owns XP and level.
- **Graph.** Arrows run from a prerequisite to the perk it opens; dashed arrows marked OR mean any one of the group; red dotted lines mean you cannot take both. The canvas scrolls and zooms (Ctrl + mouse wheel, drag to pan); on narrow windows the sidebar becomes a drawer opened with **Menu**. **Tree as a list** gives the same information as text.
- **Tabs:** the tree view, **Tree Library** (GM: New Tree, Export Selected / All Trees, Saved data check, Give Missing Perks, Publish Player View, Backup Actor Tree Progress) and **GM Setup** (GM: Player Access, Initialize GM Storage on a fresh world, Developer Tools with the `[AG QA]` test fixtures).
- Points are awarded by the GM per tree. Players see a published, sanitized copy of the trees; GM-only nodes never reach them.

## Relation to other modules

Independent. General Manager owns import: tree files (`ag-skill-trees/0.3`, 0.2 still read) go through the GM-only `api.previewTreeImport` / `api.importTrees`. Skill Trees binds perks that already exist as world Items (for example imported by General Manager) by their stable ids and never changes Profession Ledger state (it reads the level through the Ledger's `api.progression`).

## Public API

`game.modules.get('ashen-gate-skill-trees').api`: `open`, `playerAccess` (`ag-player-access/1`), `listTrees`, `actorProgress`, `pointsSummary`, `unlock`, `embed.mount`, `accounts` (0.17.0), and GM-only `grantPoints`, `refund`, `resetTree`, `giveMissingPerks`, `publish`, `previewTreeImport`, `importTrees`.

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

### `api.accounts` — for partner modules (0.17.0)

A generic, GM-only way for another module to keep a character's progress on a tree in step with its own records. **Ashen Gate | Cinders** uses it, because a Cinder owns its progress and moves between bearers. Skill Trees does not know any partner by name and works the same without one.

```js
const accounts = game.modules.get('ashen-gate-skill-trees')?.api?.accounts;
if (accounts?.contract === 'ag-tree-accounts/1') { /* ... */ }
```

- `treeBySource(sourceRef, {kind})`: the private tree with that source id (e.g. a `cinder_milestone` tree's `MUT-*` id), resolved from world perks, or `null`. GM only.
- `account(actor, treeId)`: one character's account (`{awarded, unlocks, grants, …}`). GM only.
- `setAccount(actor, treeId, account)`: replaces the account and makes the perk Items match. It gives missing ones, reusing a tagged copy, never duplicating. It removes Items for nodes no longer unlocked. Returns `{given, removed}`. GM only. The calling module does its own rule checks.
- `grants(actor)`: `[{itemId, perkId, treeId, nodeId, wallet}]`, the perk Items trees gave this character. GM or the Actor's owner.
- `legacyData()`: read-only copy of what Skill Trees 0.15.0/0.16.0 saved for Strain and Cinders (`{registry, settings, pointers}`), so Ashen Gate | Cinders can adopt it once. GM only.
- Hook `ashenGateSkillTrees.progressChanged` `{actorId, treeId, sourceRef, kind, wallet, account}` fires after every account write.
- Hook `ashenGateSkillTrees.checkProgress` `{actorId, actorName, treeId, sourceRef, kind, action, blocked}` fires before points are awarded or a node is unlocked. A partner refuses by setting `check.blocked` to a reason, which is shown to the user.

**Strain, Cinder instances, Push and Backfire** were part of Skill Trees in 0.15.0–0.16.0. Since 0.17.0 they are in the separate module **Ashen Gate | Cinders** (`ashen-gate-cinders`). Skill Trees keeps the Cinder trees themselves: `cinder_milestone` trees, POWER-* nodes, the 16-point wallet (13 before 0.17.1) and unlocks.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-skill-trees/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-skill-trees-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
