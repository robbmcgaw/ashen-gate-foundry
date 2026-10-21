# Rewards brief L1: Locations drops use the item-drop standard (no more silent failures)

This is a self-contained brief for a build chat. It touches a single module, **`modules/ashen-gate-locations` only**.

**Read first:**
- `CLAUDE.md`
- design `docs/rewards-and-loot-design.md` §1.1 (Locations), §2.2, §4 (loot stays a link)
- `docs/item-drop-standard.md`

**Waits for:** S1 on `main`. Can run in parallel with Q1–Q3, R1, U1, H1 and T1.

## Branch and version
- **Branch:** `rewards-l1-locations` from `main`. Open a normal PR and merge it when it is green.
- **Version:** **patch**, recomputed from `main` (1.17.1 today → 1.17.2).
- Update `module.json` (+ `download` URL), `scripts/main.mjs` and any test with the old version (grep), and the CHANGELOG.

## Shared files
- **Add** `scripts/ag-item-drop.mjs`, byte-identical from Quest Log on `main`. Never edit it.
- Never edit the other shared files.

## Changes
- **`dragData`** (`scripts/app.mjs:86-89`) wraps `readDrop`. Location rows, folders, reorder and canvas drops are untouched (they carry Locations' own payloads).
- **`onDrop`** (`app.mjs:935-966`):
  - **`resources` and `loot`:** `resolveItemDrop(raw)` (folders refused). On refusal, `ui.notifications.warn(reason)` instead of returning silently.
  - **`loot`:** store `itemId: itemIdOf(item)` beside the existing `{label, img, uuid, docType, status}`. This is an additive, optional field, and normalisation (`model.mjs:144`) keeps it. **Loot stays a link: nothing is created, copied or given** (the comment at :947 stays).
  - **`resources`:** keep `materialIdOf` (`model.mjs:630`); same lookup order as `itemIdOf`.
  - **Link sections** (`detail:*`, `factions`, `notes`): keep accepting any document. Only switch to `readDrop`, and warn when the document is missing instead of returning silently.
- **No other behaviour change.** No saved-data migration (the new field is optional).

## Tests
- Loot drop:
  - stores `itemId` when the item has one;
  - `null` without;
  - a folder → warning, nothing stored;
  - a missing uuid → warning, nothing stored.
- Resource drop unchanged.
- Link drops still accept journals.
- Model normalisation keeps `itemId`.

## Done when
- `node scripts/check.mjs ashen-gate-locations` is green; `ag-item-drop.mjs` identical.
- `node scripts/ui-lint.mjs` is unchanged.
- The version and CHANGELOG are done.

## Forge steps for Robb
1. Locations → a location → **Loot & Rewards**: drag an item from the Items sidebar. It is added as before.
2. Drag a whole folder: "Drop items one at a time." Before, nothing happened.
3. Drag a journal or an Actor onto Loot & Rewards: you get "Drop an item." Before, nothing happened.
4. Resources and notes drops work as before.
