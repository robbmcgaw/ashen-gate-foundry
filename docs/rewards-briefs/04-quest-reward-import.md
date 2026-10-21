# Rewards brief Q3: import quest item rewards (`outcomes.item_rewards[]`)

This is a self-contained brief for a build chat.

**Scope:** **`modules/ashen-gate-quest-manager`**, plus a small, note-only addition to `scripts/validate-content.mjs` and its test. That file is shared tooling: merge `main` in last, and don't touch other content types.

**Read first:**
- `CLAUDE.md`
- design `docs/rewards-and-loot-design.md` §3.1, §8 (whole)
- `docs/rewards-and-loot-for-gpt.md` (what ChatGPT writes)

**Waits for:** Q1 on `main` (which reads `item_rewards` and skips malformed entries quietly). It may merge before or after Q2. If Q2 is open at the same time, recompute the version when you open the PR.

## Branch and version
- **Branch:** `rewards-q3-import` from `main`. Open a normal PR and merge it when it is green.
- **Version:** **minor**, recomputed from `main` (e.g. 0.12.0 → 0.13.0 after Q2).
- Update `module.json` (+ `download` URL), every hard-coded old version, the CHANGELOG and the README (import format).

## Shared files
- `ag-item-drop.mjs` is used unchanged. No UI work beyond the preview text below.

## Format (design §8.1; final)
`outcomes.item_rewards`: an array (at most 50) of entries.

| Field | Rule |
|---|---|
| `item_id` | Required. Matches `/^ITEM-[A-Z0-9]+(?:-[A-Z0-9]+)*$/`. Unique within the quest. |
| `quantity` | Optional integer ≥ 1. Default 1. |
| `visibility` | Optional: `on_complete` (default), `shown` or `gm`. |
| `recipient` | Optional: `chosen` (default), `each` or `split`. |
| `note` | Optional string, at most 300 characters, shown to the GM only. |

**Errors:**
- unknown keys;
- a `uuid` key ("Use item_id, not a Foundry uuid.");
- a duplicate `item_id`;
- a bad value;
- more than 50 entries.

Each error names the quest id and the entry index.

## Changes
- **`validSource`** (`core.mjs:12-32`): the checks above, when `outcomes.item_rewards` is present. Absent = valid, as today.
- **`planQuestImport`** (`core.mjs:73`): also returns `notes`, one per distinct `item_id`: "<QUEST id>: item reward <ITEM id> must be imported as an Item (in this file or already in the world)." Pure, no world access.
- **`previewQuestImport`** (`store.mjs:112`, GM): adds `warnings` for ids with **no world binding** (`worldItemById` → null): "<QUEST id>: item reward <ITEM id> has no matching item in this world yet. Import the item first; the quest still imports." Manager already shows `report.warnings` (`manager/scripts/specialist-handoff.js:121`), so Manager needs no change.
- **`importQuests`** in update mode: replaces the definition and keeps the state, as today. `rewards.overrides` and `grants` keyed `def:<item_id>` therefore survive. A removed or renamed `item_id` leaves its grant history in place; the GM list shows the row as "No longer in the quest" when it has grants (`rewardRows` reads grants for keys missing from the definition).
- **`exportPackage`**: round-trips `item_rewards` unchanged.
- **`scripts/validate-content.mjs`** (quest branch, today `planQuestImport(data).errors` at :220):
  - print the new `notes` as `note:` lines;
  - **drop** a note when the `item_id` is defined in the same file or in the same folder bundle (the ZIP check already gathers ids; reuse that set).
  - Errors stay errors.
- **Fixtures** in Quest Log's fixture folder: one valid file (the synthetic example from design §8.3), and `*.invalid.json` files with `_expect_error`:
  - uuid present;
  - quantity 0;
  - unknown visibility;
  - duplicate id;
  - unknown key.

## Tests
- `validSource` accept/refuse matrix.
- `planQuestImport` notes.
- `previewQuestImport` warnings with and without a world binding (mocked `game.items`).
- Update mode keeps `rewards` state.
- Export round-trip.
- `scripts/validate-content.test.mjs`:
  - the valid example passes with a note;
  - the note disappears when the item is in the same file;
  - the invalid fixtures fail with their expected error.

## Done when
- `node scripts/check.mjs` (full) is green, including `validate-content` tests.
- `node scripts/validate-content.mjs <fixture folder>` behaves as expected.
- The version, CHANGELOG and README are done.

## Forge steps for Robb
1. In General Manager, import a test file with a `[TEST]` item (`ITEM-TEST-…`) and a `[TEST]` quest whose `outcomes.item_rewards` names it with quantity 2. The import result shows no warning.
2. Import a second quest that names an item that isn't in the world. The result shows the warning "…has no matching item in this world yet…", and the quest still imports.
3. Open the first quest in Quest Log: the reward row shows the item ×2 with its id.
4. Change the quantity in the editor and re-import the same file: your quantity change and any grants are kept.
5. Complete the quest: the reward is offered as in Q2.
