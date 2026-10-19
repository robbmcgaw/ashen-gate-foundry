# Profession perks: Ledger → Skill Trees handoff (design, not built)

Goal (Robb): Profession Ledger owns profession XP and level. Skill Trees owns which perk nodes are allocated and gives/removes the perk Items. Sanity checks catch drift. When the GM lowers a level below a node's threshold, the GM resolves it. Nothing is removed silently.

Rules source: DEC-0026 (profession XP, levels, tiers and perks are authoritative; Skill Trees implements them) and DEC-0033 (one perk per profession level, chosen from eligible options).

## 1. How it works today

**Ledger 0.13.0** (`modules/ashen-gate-profession-ledger`)
- XP lives on the Actor in flag `ashen-gate-profession-ledger.professionProgress` = `{schema:'ag-profession-actor-progress/0.1', professions:{[PROF-*]:{xp, selectedPerkIds:[PERK-*], history:[…≤50]}}}` (`scripts/progression.mjs`).
- Level comes from XP: `levelForXP` (levels 1–16; XP costs 5,8,…,47). Tier gates: `ACCESS_LEVELS` Apprentice 1 / Journeyman 4 / Expert 7 / Artisan 10 / Master 13.
- XP is written in `main.js` by `awardXP` (gathering/crafting cards, GM award) and `adjustXP` (GM adjust / set / undo from the chat card, `undoAwardFromCard`). Both are GM-only, use a per-actor/profession lock and add a history entry `{kind, at, by, byName, reason, messageId, from, to, delta}`.
- Perk choice: `selectedPerkIds` is validated and reported (`progressOf` → `unspentPerkChoices = level − selected`, `perksBeyondLevel`), **but no UI or API writes it**. There is no `selectProfessionPerk`. In practice no profession perk can be chosen today.
- Lowering XP: `adjustProgress` → `lostLevelDependents` reports held perks beyond the level and recipes now locked. Nothing is removed. The GM is told in the confirm dialog and a whisper.
- Public API (`main.js` `module.api`): `getProfessionProgress`, `awardProfessionXP`, `adjustProfessionXP`, `getProfessionXPHistory` (GM), `inspectProfessionPerkChoices`. Read calls go through `checkPlayerLedger()`, so they throw for players when Ledger Player Access is off.

**Skill Trees 0.10.1** (`modules/ashen-gate-skill-trees`)
- Tree layouts: GM-private JournalEntry flag `payload`. Player-safe projection: world setting `publicTreesV2` (`publicTree`).
- Actor progress: flag `ashen-gate-skill-trees.progressV2` = `{[walletKey]:{awarded, unlocks:[nodeId], grants:[{key,amount}], revision}}`. `walletKey` = `tree:<treeId>` (or `cinder:<MUT-*>`). See `cleanAccount` in `engine.mjs`.
- Providers: `generic_points`, `cinder_milestone`, `profession`. **Profession trees are view-only**: `availability`, `publicAvailability`, `grantPoints` and the UI all refuse them ("belongs to the Ledger").
- Unlocks: `unlockNode` (GM client only; players send `unlock-request` over the socket and the active GM runs the checks) → `purchase` → `givePerk` copies the world perk Item to the Actor with tag `flags.ashen-gate-skill-trees.grant = {perkId, treeId, nodeId, wallet, perkUuid}` → `persistAccount`. If the save fails, the new Item is deleted again. One operation per actor at a time (`withActorLock`).
- Removal: `refundNode` / `resetTreeFor` (GM) → `removeGrants` deletes the tagged Items. `giveMissingPerks` / `missingGrants` re-adds Items for unlocks that have none (can be run again safely).
- `node.minLevel` (1–99) is validated, but nothing enforces it. `tiers` are only drawn as bands.

## 2. Handoff: Skill Trees reads the level from Ledger (recommended)

Two options:
- **A. Ledger pushes awards** (`grantPerkPoints` on level-up). Two stores hold the same number, so they can drift. Needs dedupe keys, and every XP change (undo, set, lower) needs a matching reverse event. If Skill Trees is off when the event fires, the award is lost.
- **B. Skill Trees works it out** (recommended): `earned = pointsForLevel(Ledger level)`, `available = earned − spent on allocated nodes`. The level is stored only in Ledger and nothing is copied, so undo, set and lower just work. If Skill Trees is off during a level-up, the points are still there the next time it opens.

Contract (B):
- Ledger adds `api.progression = {contract:'ag-ledger-progression/1', level(actor, profId) → {profId, xp, level, tier} | null}`. This is the same data `progressOf` gives, without history or perks. It checks permission: GM or Actor OBSERVER. It does **not** depend on Ledger Player Access, because that setting hides the Ledger window, not profession mechanics.
- Ledger calls `Hooks.callAll('ashenGateLedger.progressionChanged', {actorId, profId, previousLevel, level})` after every XP write. This only tells Skill Trees to redraw or re-check. It never carries the numbers.
- Skill Trees feature-detects `game.modules.get('ashen-gate-profession-ledger')?.api?.progression?.contract`. If Ledger is missing or uses another contract version, profession trees still open, but show "Profession Ledger not active: points unavailable" and allocation is blocked. Nothing is removed.
- Skill Trees owns allocations (`progressV2['tree:<id>'].unlocks`), prerequisites, thresholds, and the perk Items. Ledger never writes Skill Trees flags. Skill Trees never writes Ledger flags.

## 3. Sanity checks (Skill Trees, `engine.mjs`, pure functions)

- `pointsForLevel(level)`: rule from Q1 (default: `level`).
- `nodeThreshold(node, perkDef)` = the higher of `node.minLevel` and `ACCESS_LEVELS[perk tier]` (Q3).
- `professionAvailability(tree, account, nodeId, {level})` = today's checks (exists, released, not excluded, prerequisites met) plus: `level ≥ threshold`, `available ≥ cost`, actor not over-allocated, and Ledger available.
- Points can never go negative. Allocation is refused when `cost > available`. If a lower level drives `available` below 0, that is reported as over-allocation and never stored.
- Duplicates: one Item per `(treeId,nodeId)` (`givePerk` already reuses an existing copy). The new check also flags a perk id that is granted twice across different trees.
- **Reconcile report** `reconcile(tree, account, level, itemTags, perkLookup)`, one row per actor and tree: `{actorId, treeId, profId, level, earned, spent, available, issues:[{code,nodeId,detail}]}`. Codes:
  `OVER_SPENT`, `ABOVE_THRESHOLD`, `PREREQ_BROKEN` (a prerequisite was removed), `MISSING_ITEM`, `ORPHAN_ITEM` (tagged Item with no allocation), `DUPLICATE_ITEM`, `PERK_NOT_IN_WORLD`, `LEDGER_UNAVAILABLE`, `LEGACY_LEDGER_SELECTION`.
  The report only reads. Each fix is a separate GM action with a confirmation.

## 4. When the GM lowers a level

- Ledger `adjustXP` works as it does now (GM-only, history, whisper). Its dialog text "held perks beyond level" now comes from Skill Trees when it is present (`api.professionReport(actor, profId)`), and from Ledger's own `selectedPerkIds` otherwise.
- Skill Trees works out **over-allocated** = any allocated node above the new level threshold that is not kept, or `spent > earned` beyond what kept nodes cover. This is never stored as a boolean, so it cannot go stale.
- The flagged actor shows a GM badge in the tree view and in the reconcile report. Players see "Waiting on GM review" and **cannot allocate** while it is flagged. The GM client enforces this in `unlockNode`, not only the UI.
- **Resolve dialog** (GM, one row per flagged node, preselected *Keep*):
  - **Keep**: adds `kept[nodeId] = {level, at, by, reason}`. The node stays and still costs its points (Q6). The flag returns only if the level drops below the recorded `level` again.
  - **Remove**: drops the unlock and deletes the tagged Item. Its points come back automatically, because points are worked out from the level. Removal is blocked if a kept node depends on it (`dependentsBlockingRefund`); the dialog says which.
  - "Refund points" means the same as Remove under option B, so it is not a separate button.
- Account additions (all additive, all optional): `kept:{[nodeId]:{level,at,by,reason}}`, `history:[…≤50]`, with entries
  `{kind:'allocate'|'remove'|'keep'|'undo'|'migrate', nodeId, perkId, level, at, by, byName, reason, itemSnapshot?}`.
  `itemSnapshot` is the removed Item's `toObject()` (keeps per-actor edits such as uses). It is stored only on `remove`, and only for the last 10 removals.
- **Undo** (GM, from history): puts back the unlock and recreates the Item from the snapshot, with its grant tag. It first checks that the node still exists and the tree has not changed underneath. Undo is not available after a layout change made with `changedPurchasedNodes`.

## 5. Migration (re-runnable, nothing deleted)

- No stored data needs rewriting. New fields are additive. `cleanAccount` keeps them, and they default to empty.
- Ledger `selectedPerkIds`: no UI ever wrote them, so most worlds have none. A GM button **Import Ledger perk choices** (Skill Trees, Developer Tools) maps each `PERK-*` to the node on that profession's tree with the same `perkId`. If the Actor already has a matching Item, it is adopted by adding the grant tag. Otherwise the allocation is added and the Item is given. A `migrate` history entry is written. Ids it cannot map are listed and left alone. Ledger's `selectedPerkIds` is **never cleared**. It becomes a legacy field that Ledger reports but no longer counts. Running it again does nothing, because the allocation already exists.
- Generic or Cinder trees that already hold `PERK-*` nodes are left as they are. The report shows them (`DUPLICATE_ITEM` if the same perk is also allocated on a profession tree).
- What the GM sees: the reconcile report in the Skill Trees Library tab (next to today's "missing perks" count), with a dry-run table before any write.

## 6. Questions for Robb: see the Studio message (answers go here once given)

## 7. Plan

1. **Ledger 0.14.0**: `api.progression` (contract v1) and the `progressionChanged` hook. The lower-level dialog asks Skill Trees for its report when available. Tests: contract shape, permission (player reading another player's Actor is rejected; GM allowed; works with Player Access off), hook fires on award, adjust, set and undo.
2. **Skill Trees 0.11.0**: profession provider becomes allocatable. Adds `pointsForLevel`, `nodeThreshold`, `professionAvailability`, `reconcile`, a GM read-only reconcile report, a missing-Ledger fallback, and player requests through the existing socket. Tests: points at levels 1, 4 and 16; threshold refusal; prerequisites; never negative; player request rejected when over-allocated or when Ledger is missing; `givePerk` gives only one copy; generic and Cinder trees unchanged.
3. **Skill Trees 0.12.0**: resolve dialog (keep/remove), history, undo with Item snapshot, and the Import Ledger perk choices migration (dry run, then apply, safe to run again). Tests: lower 7→3 flags nodes; keep clears the flag; dropping further re-flags; remove gives the points back and deletes the Item; undo restores the exact Item; second migration run makes no changes.

Tests run with mocked Foundry globals and prove logic only. Each stage ends with click-by-click steps for Robb to check in Forge.

**Risks**: placeholder perks with no `tier` (threshold falls back to `minLevel` or 1, reported); `point_cost` on perks conflicting with one-per-level (Q2); no GM connected means players cannot allocate (true today); tree layout edits under existing allocations (already guarded by `changedPurchasedNodes`); two GMs editing at once (only the active GM writes).
