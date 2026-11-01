# Ashen Gate | Skill Trees

Module ID `ashen-gate-skill-trees` · Foundry V14 · dnd5e. Progression trees (generic points and Cinder-style trees) where every node is a world perk. Open it from **Actors sidebar → Skill Trees** (players when **GM Setup → Player Access** is on).

**Sidebar folders.** The GM-only definitions journal files under **Ashen Gate / Skill Trees**; see docs/folder-convention.md.

## How it works

- **Every node is a perk.** A node names a world perk by its permanent `PERK-*` id (Cinder trees: `POWER-*`); the world Item's UUID is only the local binding. Name, text, picture and point cost come from the perk (`point_cost` on its source definition; 1 when absent). Add a perk to a tree by dragging it in from the Items sidebar or the Perks list, or with its **Add** button. Position, prerequisites, OR groups and exclusions are stored on the node.
- **Unlocking adds the perk to the sheet.** It spends the character's points and creates a tagged copy of the perk on the Actor. A player's unlock is checked and written by the active GM's client (a GM must be logged in). Refund and Reset (GM) return the points and remove the tagged Item.
- **Profession trees** get 1 point per profession level from the Profession Ledger (16 max; trees usually have 20 to 36 perks, 24 is typical). Players pick; the GM can remove, grant (override) or keep perks. The Ledger owns XP and level.
- **Nodes are icons (0.23.0).** A node is only the perk's picture, with no text or badge. The ring shows the state: greyed with a plain ring is locked, a gold ring is available, a bright green ring is learned. A dashed outer ring marks a **rival pair** (choose one of the two) and a double outer ring marks a **crossroads** (needs one perk from each of two specialties). Hover a node, or Tab to it, to read the whole perk in the card at the top right: name, tier and level, point cost, the perk's description (its table and Effect & Rules), what it needs ("Requires A and one of B or C") and, for rivals, "Choose one: X or Y".
- **Click, right-click, keyboard (0.27.0).** **Hover** a node, or Tab to it, to read it in the card at the top right; the card goes away when the pointer or focus leaves. **Click** (or press Enter) only **selects** the node: the **Selected perk** panel shows its facts, Effect & Rules and Notes, what it needs, and three buttons: **Unlock (N points)…** (a player asks; the GM client does it), **Refund…** (GM) and **Open sheet…** (the GM opens the world perk; a player opens their own copy once learned). A button that cannot be used is disabled and the reason is written under it. **Right-click**, the Menu key or **Shift+Enter** selects the node and moves focus to its Unlock or Refund button. Nothing is learned or refunded by a plain click.
- **Specialties.** A node may carry an optional `lane` (a specialty or branch name, up to 40 characters); the canvas prints each name above its column. Nodes without a lane print nothing.
- **Graph.** Arrows run from a prerequisite to the perk it opens; dashed arrows marked OR mean any one of the group; red dotted lines marked **Choose one** join a rival pair. A tree opens zoomed to fit its whole width (the fit button in the zoom controls refits it). The canvas scrolls and zooms (Ctrl + mouse wheel, drag to pan); on narrow windows the sidebar becomes a drawer opened with **Menu**. **Tree as a list** gives the same information as text.
- **Tabs:** **Professions** and **Cinders** (0.27.0; the same for every role: the canvas, with Player preview and Edit layout above it, and a menu with **Perk**, **Character** and GM **Edit** sub-tabs), **Tree Library** (GM; sub-tabs **Trees**: New tree, Export all trees, Open and Export per tree; **Checks & maintenance**: saved-data and profession perk checks, Give missing perks, Ledger perk import, legacy migrate/clear, progress backup, Republish player view; Initialize GM storage on a fresh world) and **GM Setup** (GM: Player access, Developer Tools with the `[AG QA]` test fixtures).
- **Keyboard:** in Edit layout, arrow keys move the focused node (Shift for bigger steps), or use **Move node…**; Esc cancels Connect prerequisite.
- **Import preview (0.23.0).** For each tree, `api.previewTreeImport` rows carry a `summary` such as "24 nodes, 3 rival pairs, up to 21 can be taken together" (counts: nodes, rival pairs, and the most perks one character can hold from the best choice in every pair). General Manager shows rows from this API.
- Points are awarded by the GM per tree. Players see a published, trimmed copy of the trees; GM-only nodes are left out of it. The window and the API show each player only the trees their character holds. The published copy itself is stored in a world setting, so a technically minded player could read the raw data from the browser console. That is fine for a table of friends; it is a courtesy filter, not a secure vault.
- **Players see only their own character's trees (0.23.3).** The windows and the API filter by character (the raw published setting is not filtered; see above). A profession tree needs the profession in the Profession Ledger; a Cinder tree needs that Cinder bound to the character; any other tree needs points awarded to the character. Trees with purchased nodes stay visible. Without the Ledger or Cinders, players do not see those trees (fail closed); the GM sees all trees, and **Player preview** shows what the chosen character sees. The same rule covers the API, embed and unlock; an unrelated tree answers "Unknown tree".

## Relation to other modules

Independent. General Manager owns import: tree files (`ag-skill-trees/0.3`, 0.2 still read) go through the GM-only `api.previewTreeImport` / `api.importTrees`. Skill Trees binds perks that already exist as world Items (for example imported by General Manager) by their stable ids and never changes Profession Ledger state (it reads the level through the Ledger's `api.progression`).

## Public API

`game.modules.get('ashen-gate-skill-trees').api`: `open` (`tab` since 0.27.0), `treeVisibility` (0.27.0, optional: feature-detect it), `playerAccess` (`ag-player-access/1`), `listTrees`, `listTreesForProfession`, `actorProgress`, `pointsSummary`, `professionWallet`, `unlock`, `embed.mount`, `embed.data`, `accounts` (0.17.0), and GM-only `grantPoints`, `refund`, `resetTree`, `giveMissingPerks`, `publish`, `previewTreeImport`, `importTrees`, `exportState` (0.25.0, optional: feature-detect it).

`api.exportState()` (GM only, read-only, writes nothing) returns the GM layouts and every character's stored progress as plain JSON, schema `ag-skill-trees-state-export/0.1`: `{schema_version, trees, progress}`. `trees` has one row per tree (id, name, kind, status, visibility, source ref, provider, access, look settings, and its nodes with x/y, requires, excludes, visibility; perk text is never included). `progress` has one row per character with stored progress (actor id and name, then per tree the unlocked node ids and points earned, spent and available). Rows are sorted and there are no timestamps. General Manager's world backup uses it; see `docs/world-backup.md`.

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

- **Perk cards (0.24.4).** Each available perk is a card: a title row (name, cost chip, **Unlock**), labelled chips from the perk description's own table (Specialty, Tier, Type, Automation, Uses, Tool; Requires only when it is not "Nothing"), the first sentence of Effect & Rules, and a **Details** button (`aria-expanded`) for the full effect, notes and other sections as safe formatted HTML. Cards sit under a heading per tier. If the perk is not released to players, the GM's Unlock is disabled with the reason and a player is told "The GM has not released this perk to players yet." The parsing lives in `scripts/perk-card.mjs`; each node in `embed.data` keeps `text` (now the first sentence) and adds `meta`, `tier`, `summary`, `detailsHtml`, `unlockable`, `blocked`.
- `element`: a DOM element the caller owns. Skill Trees replaces its contents and adds the class `agst-embed`.
- `options.actorId`: the character. `options.mode`: `'character'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. It refreshes itself when the character, the published trees, Player Access or the Ledger level change, and unmounts itself if the element has left the page.
- **Permission:** the GM, or the Actor's **Owner** (same as `pointsSummary`). Anyone else sees "Only <name>'s owner and the GM can see this."; players see "The GM has hidden Skill Trees." while Player Access is off. Players see the published projection only (unrevealed nodes are left out). **Unlock** uses the window's own confirm and checks: the GM unlocks directly; a player's unlock is checked again and carried out by the GM client, exactly as in the window.

### 0.27.0 additions

- `api.open({actorId?, treeId?, tab?, resolve?})` → the window. `tab` is `'professions'` or `'cinders'`. A known `treeId` decides its own tab (a Cinder tree always opens under Cinders); an unknown `tab` is ignored; with no tab and no tree the window keeps the tab it had (first time: Professions). Calls without `tab` behave as before, so a caller may retry without `tab` if it ever throws. Players are still refused a tree their character does not hold (`Unknown tree`).
- `api.treeVisibility(actorId)` (also `{actorId | actor, forUser?}`) → `{contract: 'ag-tree-visibility/1', actorId, viewer: {id, isGM}, trees: [{treeId, name, kind, sourceRef, visible, hiddenFromPlayers, reason, note, owned}], hiddenTreeIds, visibleTreeIds, hiddenCount, hiddenFromPlayersCount, hint}`. Synchronous and read-only. A player may ask only about their own characters (as themselves); a GM may pass `forUser` (a User or id who owns the character) to ask what that player would see. For a player `trees` lists the character's trees (those it holds) and `hiddenTreeIds` the ones the proficiency gate hides; `hint` is "N trees hidden until you have the right tool proficiency" (empty for none). For the GM nothing is hidden (`hiddenTreeIds` is `[]`) and `hiddenFromPlayers` marks the trees a player would not see. `reason` is `'proficiency'` when set; `note` is "Needs <Tool> proficiency". The rule (the same one the window and the embed use): a tree with `access` whose requirement the Ledger says the character lacks is hidden unless the character owns a perk in it (then it stays, with the note). No Ledger answer, or no `access`: visible. The requirement is per tree (each Artistry sub-tree has its own `access`); a perk's "Tool" row is only description text and is never used to hide anything.
- `embed.data(actorId)` is unchanged in shape; each node now also has `requiresAll` (perk names) and `requiresAny` (groups of perk names), and `reason` is "Needs <perk>" / "Needs <Tool> proficiency" instead of a bare "Prerequisite required". The embed and `embed.data` leave out trees the gate hides from a player (the GM sees all). Embed element ids are unique per mounted copy.

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

## Test players

General Manager (0.98.0+) can list "Test players" (GM Setup > General). A Test player sees the Skill Trees launcher and window as if Player Access were on. Real players keep following Skill Trees' Player Access setting.

- Reads only the world setting `ashen-gate-manager.testPlayers` (an array of User ids) through this module's own copy of `ag-test-players.mjs`; it never imports Manager code. No Manager, an unregistered setting or a malformed value means no Test players, and it never throws.
- It grants no GM power: GM-only actions stay GM-only, and document permissions (Actor ownership, Item and journal permissions) are checked as for any player.
- Contract (`ag-test-players/1`) and the full list of modules: [docs/test-players.md](../../docs/test-players.md).
