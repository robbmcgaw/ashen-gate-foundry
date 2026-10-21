# Rewards brief H1: Character Hub (Journey records item rewards; companion drops use the standard)

This is a self-contained brief for a build chat. It touches a single module, **`modules/ashen-gate-character-hub` only**.

**Read first:**
- `CLAUDE.md`
- `docs/ui-standard.md` (final)
- design `docs/rewards-and-loot-design.md` §5.2 (Journey) and §1.1 (Hub rows)
- `docs/item-drop-standard.md`
- `scripts/journey.mjs` (top comment and `recordReward`, :160)

**Waits for:** S1 on `main`. Can run in parallel with Q1–Q3, R1, U1, L1 and T1. Quest Log Q2 calls the new fields feature-detected, so the merge order between H1 and Q2 doesn't matter.

**Decision D12:** there is **no separate "Rewards received" panel**. The Journey tab is where rewards show.

## Branch and version
- **Branch:** `rewards-h1-hub` from `main`. Open a normal PR and merge it when it is green.
- **Version:** **minor**, recomputed from `main` (0.23.0 today → 0.24.0).
- Update `module.json` (+ `download` URL), `scripts/constants.mjs` and any test with the old version (grep), the CHANGELOG and the README (Journey).

## Shared files
- **Add** `scripts/ag-item-drop.mjs`, byte-identical from Quest Log on `main`. Never edit it.
- Never edit the other shared files.

## 1. Journey: `recordReward` takes items
In `scripts/journey.mjs`, `recordReward(actor, {questId, questName = '', coins = null, text = '', items = null, grantId = null})`:
- **Still GM only, and still needs `questId`.**
- **`items`:** an optional array, cleaned to at most 50 entries of `{name (string, trimmed, ≤ 120), img (string or null), quantity (integer ≥ 1, default 1), itemId (matches the canonical id pattern, or null)}`. Anything else is dropped.
- **`grantId`:** an optional string, `[A-Za-z0-9_-]{1,40}`.
- **Entry id:** `reward-<questId>` when there is no `grantId` (**unchanged** for existing callers and entries); `reward-<questId>-<grantId>` with one. `appendAuto` already refuses duplicates by id, so re-firing the same grant adds nothing.
- **Text** when the caller gives none:
  - `Reward for "<questName>": 2 × Healing Draught, Rusted Blade` (quantity shown only when > 1);
  - coins appended as today ("…, 10 gp");
  - names come from `items`, not ids.
- **`data`:** `{questId, grantId, coins, items}`.
- **`cleanEntry`** keeps `data` as now.
- **Journey row** (`journey-views.mjs`, `row()`): when `e.data?.items?.length`, show small item images after the text. Use a module class `agch-journey__items`, sized with tokens (`--ag-icon-chip`), with `alt` = the item name and a `data-tooltip` of the name and quantity. No ids in the player view.
- **Permissions unchanged:** the player reads only their own character's visible entries; hidden entries work as today.
- **Update the top comment** of `journey.mjs`: item rewards now come through `recordReward`.

## 2. Companion drops use the standard
- `droppedItem` (`scripts/sheet.mjs:211-218`) uses `readDrop` + `resolveItemDrop(raw)` for Items, keeping the Actor path for mount and pet slots as today.
- Refusals show the shared text as a warning ("Drop an item.", the missing text, and "Drop items one at a time." for folders) instead of silently doing nothing.
- `embedDropped` (`companions.mjs:157-164`) keeps copying onto the character (no behaviour change). Build the data with `grantBundle(item, {quantity: item.system?.quantity ?? 1, scope: 'ashen-gate-character-hub', tag: {}})`, so a container brings its contents. Create in one call with `{keepId: true}` and return the root's id.
- Quick-bar drops (`_onHotbarDrop`, `sheet.mjs:419`): parsing only (`readDrop`). Rules unchanged.

## Tests
- `recordReward`:
  - old call (no items, no `grantId`) gives the same entry id and text as before;
  - with items, the text lists names and quantities;
  - two different `grantId`s give two entries;
  - the same `grantId` twice gives one;
  - bad items are cleaned;
  - players are refused.
- Journey render: item images with `alt` and `data-tooltip`; no ids in the player HTML.
- Companion drop:
  - an Item works as before;
  - an Actor on a mount slot works as before;
  - a folder and a missing item each show a warning;
  - a container brings its contents.

## Done when
- `node scripts/check.mjs ashen-gate-character-hub` is green; `ag-item-drop.mjs` identical.
- `node scripts/ui-lint.mjs` has strict rules at 0, and the ratchet is not raised.
- The version, CHANGELOG and README are done.

## Forge steps for Robb
1. With Quest Log Q2 installed, grant a quest reward to a character. Open their Hub → **Journey**: a "Reward for "…": 2 × …" entry with small item pictures.
2. Grant a second reward on the same quest (or **Grant again**): a second entry appears. Saving the quest again adds nothing.
3. As that character's player, the entry shows with no ids.
4. Hub → companions: drop a saddle item on a mount slot (works as before). Drop a whole folder: you get the "Drop items one at a time." message.
5. Check the Compact and Comfortable sizes and one light skin.
