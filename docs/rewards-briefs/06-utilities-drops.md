# Rewards brief U1: Utilities stash uses the item-drop standard (compendium containers fixed)

This is a self-contained brief for a build chat. It touches a single module, **`modules/ashen-gate-utilities` only**.

**Read first:**
- `CLAUDE.md`
- design `docs/rewards-and-loot-design.md` §1.1 (Utilities), §1.3, §2.2, §2.5, §6.4
- `docs/item-drop-standard.md`

**Waits for:** S1 on `main`. Can run in parallel with Q1–Q3, R1, H1, L1 and T1.

**Shopping overlap.** The shop editor (shopping brief 02, branch `design/shopping`) uses the same helper with `{folders: true}`. If it is in flight at the same time, whichever PR merges second takes `ag-item-drop.mjs` from `main` unchanged and merges `main` in last.

## Branch and version
- **Branch:** `rewards-u1-utilities` from `main`. Open a normal PR and merge it when it is green.
- **Version:** **patch**, recomputed from `main` (0.16.1 today → 0.16.2, unless shops have moved it on).
- Update `module.json` (+ `download` URL), every hard-coded old version (today `scripts/core.mjs` and `tests/core-v030.test.mjs`; grep) and the CHANGELOG.

## Shared files
- **Add** `scripts/ag-item-drop.mjs`, byte-identical from Quest Log on `main`. Never edit it.
- Never edit the other shared files.

## Changes (behaviour stays the same except the fix)
- **Parsing:** `dragData` (`scripts/main.mjs:895-898`) becomes a thin wrapper around `readDrop`. The window, embed and sheet drops (`main.mjs:990-996`, `1061-1063`, `onSheetDrop` :901-907) keep their own rules: Item only, ignore drops from the stash itself.
  - Refusal texts come from `resolveItemDrop` where they apply ("Drop an item.", the missing text).
  - Folders: refused on the stash, as today, with "Drop items one at a time."
- **Compendium containers (the fix):**
  - `executeDeposit` (`main.mjs:793-813`) builds the copy of a world or compendium item with `bundleOf` + `grantBundle` (quantity = the item's own; `grantBundle` already drops `folder`, as `moveBundle` did). A compendium backpack now arrives **with its contents**.
  - Actor-owned items keep `moveItem` (`main.mjs:777-792`) and the existing all-or-nothing move.
  - `containedItems` / `moveBundle` (`core.mjs:294-318`) stay exported and unchanged. Shop rules and tests use them, so don't remove them.
- No change to votes, history, purse, gold or shops. **No saved data change.**

## Tests
- A compendium container deposit (mocked pack with a container and two nested items): all three arrive in the stash, with `system.container` remapped.
- A world container deposit: unchanged behaviour.
- Actor-owned move: unchanged (all or nothing, source removed only after the copies are verified).
- Non-Item and folder drops refused with the shared text.
- Existing stash tests stay green.

## Done when
- `node scripts/check.mjs ashen-gate-utilities` is green; `ag-item-drop.mjs` identical to the other copies.
- `node scripts/ui-lint.mjs` is unchanged.
- The version and CHANGELOG are done ("Fix: a container dropped from a compendium into the party stash now brings its contents").

## Forge steps for Robb
1. Utilities → Party Inventory. As the GM, drag a backpack that has items inside **from a compendium** onto the list: the backpack and everything in it appear.
2. Drag a backpack from a character sheet: it moves with its contents, as before.
3. Drag a whole folder from the Items sidebar: "Drop items one at a time."
4. Take an item out to a character: it works as before, including the vote if it is on.
