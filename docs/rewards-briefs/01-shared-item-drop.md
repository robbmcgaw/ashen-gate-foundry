# Rewards brief S1: shared item-drop helper `ag-item-drop.mjs` (Quest Log patch + check.mjs)

This is a self-contained brief for a build chat.

**Read first:**
- `CLAUDE.md`
- design `docs/rewards-and-loot-design.md` §2 (whole) and §6.3–6.5, on branch `design/rewards-loot` until it is merged
- `docs/ui-standard.md` §8–9, on branch `design/ui-standard`, for how shared files work

**This PR touches shared files. It goes first, alone.** Every other rewards PR waits for it.

## Branch and version
- **Branch:** `rewards-s1-item-drop` from `main`. Open a normal PR and merge it when it is green.
- **Version:** Quest Log **patch** bump, recomputed from `main` when you open the PR (0.10.1 today → 0.10.2).
- Update:
  - `module.json`: `version` **and** the `download` URL;
  - every hard-coded copy of the old version (today `scripts/main.mjs` and three tests in `test/`; grep for it);
  - a CHANGELOG entry: "Shared item-drop helper (`ag-item-drop/1`); no visible change."

## Goal
One small, pure, tested file that every module copies byte-identically to read item drops and build grant data. **No visible change** in Forge and no saved data.

## Files
- **New** `modules/ashen-gate-quest-manager/scripts/ag-item-drop.mjs`. Quest Log carries the first copy because it is the first user. Don't import it anywhere yet; Q1 does that.
- **New** `modules/ashen-gate-quest-manager/test/ag-item-drop.test.mjs`.
- `scripts/check.mjs`: add `'ag-item-drop.mjs'` to the shared-file list (today `['ag-launchers.mjs', 'ag-ui.css', 'ag-dialogs.mjs', 'ag-html.mjs']`), and add it to the comment at the top.
- **New** `docs/item-drop-standard.md`: the contract below, for module authors (short; link the design §2).

## Contract `ag-item-drop/1`
Exports, all documented with a JSDoc line each:

| Export | Behaviour |
|---|---|
| `ITEM_DROP_CONTRACT` | `'ag-item-drop/1'` |
| `readDrop(event)` | `foundry.applications.ux.TextEditor.implementation.getDragEventData(event)`, falling back to `JSON.parse(dataTransfer.getData('text/plain'))`. **Never throws**; returns `{}` when the drop can't be read. |
| `resolveItemDrop(raw, {folders = false, maxFolder = 100})` | Item drops: resolve via `Item.implementation.fromDropData(raw)`, then `fromUuid(raw.uuid)`; require `documentName === 'Item'`. Folder drops: refused with "Drop items one at a time." unless `folders`. When allowed, the folder's Item contents (world folder or compendium folder, nested), up to `maxFolder`, skipping non-Items. Anything else: "Drop an item." Missing or unreadable: "That item no longer exists or you can't see it." Returns `{ok, items, reason}`; `reason` is plain text, safe for players. |
| `itemIdOf(item)` | `flags['ashen-gate-manager'].source.sourceId`, then `flags['ashen-gate-profession-ledger'].sourceId`, then `flags['ashen-gate'].sourceId`. It must match `/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/`, else `null`. |
| `worldItemById(itemId)` | The single world Item (`game.items`) with that Manager `sourceId` whose source status is not `retired`/`superseded` and that isn't archived (`flags['ashen-gate-manager'].lifecycle.archived`). Returns `null` if there are none or several. This is the same rule as `lookupWorldDefinition` in Skill Trees' `scripts/definition-lookup.mjs`; copy the rule, not the file. |
| `itemRef(item, {quantity})` | `{schema:'ag-item-ref/1', uuid, itemId, name, img, type, quantity, sourceKind, packId, parentUuid, contents}`. `sourceKind` is `compendium` (has a `pack`), `embedded` (has a `parent` Actor), else `world`. `quantity` defaults to `system.quantity` or 1, and is clamped to a whole number ≥ 1. `contents` comes from `bundleOf` (minus one). |
| `resolveRef(ref)` | `worldItemById(ref.itemId)` first, then `fromUuid(ref.uuid)` (must be an Item). Returns `{status:'ok', item}`, `{status:'conflict'}` (two world Items share the id: say so, don't fall back silently), or `{status:'missing'}`. |
| `bundleOf(item)` | `[item, ...contents]`, nested. Contents are items whose `system.container` points at a bundle member, read from the **same collection** as the item: `item.parent.items`, `game.items`, or the item's own compendium pack (`pack.getDocuments()`, or the index plus `getDocument`). **Check in Forge (dnd5e 6.0.6)** whether `item.system.contents` / `allContainedItems` already do this for all three. Use them if so; otherwise walk `system.container` like Utilities' `containedItems` (`utilities/scripts/core.mjs:294`). |
| `grantBundle(item, {quantity, scope, tag})` | `{data, contents}`. `data` is the `toObject()` of each bundle member, with `_id`, `folder`, `sort`, `ownership` and `_stats` removed. Each gets a fresh `_id` (`foundry.utils.randomID()`), with `system.container` remapped to the new parent id and cleared on the root. The root's `system.quantity` is set to `quantity`. `flags[scope] = {...existing, ...tag}` on every member. The caller creates with `{keepId: true}`, all members in **one** `createEmbeddedDocuments` call. |
| `dragPayload(ref, extra = {})` | `{type:'Item', uuid: ref.uuid, agItemRef: ref, ...extra}`. A plain Foundry Item drag that sheets accept. |

Rules:
- **No imports** from any module.
- Read `game` and `foundry` from `globalThis` at call time; never at module load.
- No settings, no state, no writes, no UI, no `console` noise.
- The file stays readable: functions of normal length, one JSDoc line each.

## Tests (`test/ag-item-drop.test.mjs`, mocked Foundry as in the other Quest Log tests)
- `readDrop`:
  - `getDragEventData` path;
  - text/plain fallback;
  - garbage → `{}`.
- `resolveItemDrop`:
  - world, compendium and embedded Items → ok;
  - Actor or Journal → "Drop an item.";
  - folder refused by default;
  - a folder with `{folders: true}` expands, skips non-Items and respects `maxFolder`;
  - missing uuid → the missing text.
- `itemIdOf`: lookup order; a bad id → `null`.
- `worldItemById`:
  - one match;
  - none;
  - two matches → `null`;
  - retired, superseded and archived sources ignored.
- `resolveRef`: id wins over uuid; uuid fallback; conflict; missing.
- `bundleOf` + `grantBundle`:
  - a nested container on an Actor;
  - in the world;
  - **in a compendium** (contents come from the pack, not `game.items`);
  - fresh ids;
  - container remap;
  - root container cleared;
  - quantity set on the root only;
  - tag on every member;
  - the source object never mutated.
- `dragPayload`: shape.

## Done when
- `node scripts/check.mjs ashen-gate-quest-manager` and the full `node scripts/check.mjs` are green (the new shared-file entry has one copy, so it passes).
- `node scripts/ui-lint.mjs`: no change (no CSS or markup).
- In the PR, say what you found about the dnd5e 6.0.6 container helpers.

## Forge steps for Robb
- Nothing new to see. Update Quest Log and open it once: it should open and work as before.
- If Robb can, open the browser console and run:

  ```js
  (await import('/modules/ashen-gate-quest-manager/scripts/ag-item-drop.mjs')).ITEM_DROP_CONTRACT
  ```

  It should print `ag-item-drop/1`.
