# Ashen Gate | Skill Trees

Module ID `ashen-gate-skill-trees` · Foundry V14 · dnd5e. Progression trees (generic points and Cinder-style trees) where every node is a world perk. Open it from **Actors sidebar → Skill Trees** (players when **GM Setup → Player Access** is on).

**Sidebar folders.** The GM-only definitions journal files under **Ashen Gate / Skill Trees**; see docs/folder-convention.md.

## How it works

- **Every node is a perk.** A node names a world perk by its permanent `PERK-*` id (Cinder trees: `POWER-*`); the world Item's UUID is only the local binding. Name, text, picture and point cost come from the perk (`point_cost` on its source definition; 1 when absent). Add a perk to a tree by dragging it in from the Items sidebar or the Perks list, or with its **Add** button. Position, prerequisites, OR groups and exclusions are stored on the node.
- **Unlocking adds the perk to the sheet.** It spends the character's points and creates a tagged copy of the perk on the Actor. A player's unlock is checked and written by the active GM's client (a GM must be logged in). Refund and Reset (GM) return the points and remove the tagged Item.
- **Profession trees** get 1 point per profession level from the Profession Ledger (16 max; trees usually have 20 to 36 perks, 24 is typical). Players pick; the GM can remove, grant (override) or keep perks. The Ledger owns XP and level.
- **Nodes are icons (0.23.0).** A node is only the perk's picture, with no text or badge. The ring shows the state: greyed with a plain ring is locked, a gold ring is available, a bright green ring is learned. A dashed outer ring marks a **rival pair** (choose one of the two) and a double outer ring marks a **crossroads** (needs one perk from each of two specialties). Hover a node, or Tab to it, to read the whole perk in the card at the top right: name, tier and level, point cost, the perk's description (its table and Effect & Rules), what it needs ("Requires A and one of B or C") and, for rivals, "Choose one: X or Y".
- **Click, right-click, keyboard.** **Click** a node to open the perk's Item sheet (a player opens the copy on their own sheet once they have learned it). **Right-click**, the Menu key or **Shift+Enter** pins the node: its card then has **Open perk sheet**, **Unlock** (a player asks; the GM client does it) and, for the GM, **Remove / Refund**. Nothing is learned or refunded by a plain click. The Perk tab in the menu keeps the same buttons. In **Edit layout** a click selects the node (to connect or edit it); use **Open perk sheet** on its card to read it.
- **Specialties.** A node may carry an optional `lane` (a specialty or branch name, up to 40 characters); the canvas prints each name above its column. Nodes without a lane print nothing.
- **Graph.** Arrows run from a prerequisite to the perk it opens; dashed arrows marked OR mean any one of the group; red dotted lines marked **Choose one** join a rival pair. A tree opens zoomed to fit its whole width (the fit button in the zoom controls refits it). The canvas scrolls and zooms (Ctrl + mouse wheel, drag to pan); on narrow windows the sidebar becomes a drawer opened with **Menu**. **Tree as a list** gives the same information as text.
- **Tabs:** **Skill Trees** (the canvas, with Player preview and Edit layout above it, and a menu with **Perk**, **Character** and GM **Edit** sub-tabs), **Tree Library** (GM; sub-tabs **Trees**: New tree, Export all trees, Open and Export per tree; **Checks & maintenance**: saved-data and profession perk checks, Give missing perks, Ledger perk import, legacy migrate/clear, progress backup, Republish player view; Initialize GM storage on a fresh world) and **GM Setup** (GM: Player access, Developer Tools with the `[AG QA]` test fixtures).
- **Keyboard:** in Edit layout, arrow keys move the focused node (Shift for bigger steps), or use **Move node…**; Esc cancels Connect prerequisite.
- **Import preview (0.23.0).** For each tree, `api.previewTreeImport` rows carry a `summary` such as "24 nodes, 3 rival pairs, up to 21 can be taken together" (counts: nodes, rival pairs, and the most perks one character can hold from the best choice in every pair). General Manager shows rows from this API.
- Points are awarded by the GM per tree. Players see a published, sanitized copy of the trees; GM-only nodes never reach them.
- **Players see only their own character's trees (0.23.3).** A profession tree needs the profession in the Profession Ledger; a Cinder tree needs that Cinder bound to the character; any other tree needs points awarded to the character. Trees with purchased nodes stay visible. Without the Ledger or Cinders, players do not see those trees (fail closed); the GM sees all trees, and **Player preview** shows what the chosen character sees. The same rule covers the API, embed and unlock; an unrelated tree answers "Unknown tree".

## Relation to other modules

Independent. General Manager owns import: tree files (`ag-skill-trees/0.3`, 0.2 still read) go through the GM-only `api.previewTreeImport` / `api.importTrees`. Skill Trees binds perks that already exist as world Items (for example imported by General Manager) by their stable ids and never changes Profession Ledger state (it reads the level through the Ledger's `api.progression`).

## Public API

`game.modules.get('ashen-gate-skill-trees').api`: `open`, `playerAccess` (`ag-player-access/1`), `listTrees`, `listTreesForProfession`, `actorProgress`, `pointsSummary`, `professionWallet`, `unlock`, `embed.mount`, `embed.data`, `accounts` (0.17.0), and GM-only `grantPoints`, `refund`, `resetTree`, `giveMissingPerks`, `publish`, `previewTreeImport`, `importTrees`.

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

### Professions with several trees (0.21.0)

Profession trees (`provider.kind: 'profession'`) with the same `sourceRef` (a `PROF-*` id) share **one wallet**: 1 point per Profession Ledger level, 16 at most, across all of them. Each tree normally has 20 to 36 nodes (24 typical; validation warns per tree outside that range, or when rival pairs leave fewer than 16 perks that can be held together), keeps a permanent id and keeps its own unlocks on the Actor (no data change); the shared total is computed. One `perkId` may appear on only one tree of a profession (validation error: "put shared perks in one tree"). The "Duplicate Cinder wallet source" rule still applies to `cinder_milestone` trees only.

Optional per-tree proficiency gate (any provider; meant for profession trees):

```json
"access": {"toolProficienciesAnyOf": ["calligrapher"], "skillProficienciesAnyOf": ["prf"], "note": "Scribes and performers"}
```

- Lists of 1–80-character strings (up to 40 each); at least one entry in either list; `note` up to 200 characters. Unknown fields inside `access` are a validation error (a typo must not drop the gate); other tree fields are read as before.
- Strings are shown through dnd5e's labels when they are dnd5e keys (`prf` → Performance, `calligrapher` → Calligrapher's Supplies), otherwise as written. The match is done by the Profession Ledger: `api.meetsProficiency(actorId, access) → {ok, matched}` (sync or a Promise).
- A **player** can unlock on the tree only when the Ledger answers `ok: true`; the reason shown is "Needs … proficiency". No Ledger, no `meetsProficiency`, or an answer that is not `{ok: boolean}`: nothing is blocked. The GM is never blocked. The published player view carries `access`, so players see the requirement while browsing.

API (additive):

- `listTreesForProfession(sourceRef)` → the trees of that profession, sorted by name; same rules as `listTrees` (GM: private trees; players: published ones), and only those a player's characters hold, 0.23.3).
- `professionWallet(actorId, sourceRef)` → `{sourceRef, level, earned, spent, available, overSpent, overAllocated, trees: [{id, name, spent}]}` or `null` when the caller sees no tree of it. `earned`/`available` are `null` without the Ledger; `available` never goes below 0. GM or the Actor's owner.
- `embed.data(actorId)` → `[{key, shared, name, sourceRef, kind, profession, level, earned, spent, available, trees: [model]}]`: the embed's data grouped by wallet. `shared: true` for a profession with several trees (the wallet once, `trees[].label` is the tab name, `trees[].treeSpent` that tree's share); every other tree is a group of one with the 0.14.0 model.
- `pointsSummary(actor)`: rows of a shared profession report the shared `spent`/`available` and add `sourceRef`, `wallet` (`profession:<sourceRef>`), `treeSpent` and `walletTrees`; count a wallet once. Single-tree rows are unchanged.
- `professionReport(actor, profId)`: covers all the profession's trees; adds `trees` when there are several.
- Hook `ashenGateSkillTrees.progressChanged` adds `sharedWallet`.

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
