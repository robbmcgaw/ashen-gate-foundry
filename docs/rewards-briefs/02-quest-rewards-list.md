# Rewards brief Q1: Quest Log item reward list (drop, holding copies, player view)

This is a self-contained brief for a build chat. It touches a single module, **`modules/ashen-gate-quest-manager` only**.

**Read first:**
- `CLAUDE.md`
- `docs/ui-standard.md` (final, branch `design/ui-standard`)
- design `docs/rewards-and-loot-design.md` §2.1–2.4, §3.1–3.3, §3.6 (only the `added`/`overrides` parts), §6 and §7
- `docs/item-drop-standard.md`, which S1 adds

**Waits for:** S1 (`ag-item-drop.mjs` is on `main`). Can run in parallel with R1, U1, H1, L1 and T1. Q2 and Q3 come after this.

## Branch and version
- **Branch:** `rewards-q1-quest-list` from `main`. Open a normal PR and merge it when it is green.
- **Version:** **minor** bump, recomputed from `main` (after S1: 0.10.2 → 0.11.0).
- Update `module.json` (`version` + `download` URL), every hard-coded old version (grep: `scripts/main.mjs`, tests), the CHANGELOG and the README (a short "Item rewards" section).

## Shared files
- Use `scripts/ag-item-drop.mjs` **as it is on `main`; never edit it**. A bug in it means stop and report.
- Never edit `ag-ui.css`, `ag-dialogs.mjs`, `ag-html.mjs` or `ag-launchers.mjs`.
- `scripts/ui-lint-baseline.json`: see the README of this folder.

## Goal
The GM can drop items on a quest and manage them as rewards. Players see the rewards the visibility allows. **Nothing is granted yet**; that is Q2.

## Data (additive; design §3.6, §7)
- **Quest state** gains an optional `rewards = {v:1, added:[], overrides:{}, grants:[]}`.
  - `added[]`: `{key:'rw-<randomID(8)>', ref: ag-item-ref/1, visibility, recipient}`.
  - `overrides[rewardKey]`: `{quantity?, visibility?, recipient?, removed?, round?}`. In Q1 it only applies to `rw-` rows; `def:` rows arrive in Q3.
- **`validState`** (`core.mjs:38`) checks the block when present:
  - `visibility` ∈ `on_complete|shown|gm`;
  - `recipient` ∈ `chosen|each|split`;
  - `quantity` an integer ≥ 1;
  - keys unique;
  - at most 100 `added`.
  A missing block is valid. **No migration**: a quest without the block behaves as today.
- **A pure function `rewardRows(source, state)`** in `core.mjs` merges the rows. Imported rows (`source.outcomes.item_rewards`) are read here already, so Q3 only adds validation. Until Q3 ships, malformed entries are skipped quietly. It returns `{key, ref|itemId, quantity, visibility, recipient, removed, round, origin:'import'|'gm'}`.
- **`publicView`** (`core.mjs:47`) adds `rewards: [{name, img, quantity}]`:
  - rows that are not removed;
  - with visibility `shown`, or `on_complete` once `status === 'Completed'`;
  - **never** uuid, itemId, key or recipient.
  - Name and img come from the ref snapshot. For imported rows, they come from `worldItemById(item_id)`; if there is none, the row is left out of the player view.
- **Holding copies** (design §2.4, decision D2), for an `embedded` drop only:
  - Create a world Item copy (with contents, via `grantBundle` with no quantity change) in the folder found by `flags.ashen-gate-quest-manager.store === 'reward-holding'`. Create that folder on first use, named `Ashen Gate Rewards (Quest Log)`, type Item, with no player access.
  - The copy is flagged `flags.ashen-gate-quest-manager.holding = {from: parentUuid, at}`, with ownership `{default: 0}`.
  - The ref uses the copy's uuid, `sourceKind:'holding'`, and the original's `itemId`.
  - **The source NPC or character is never changed** (D1).

## API (`api.rewards`, contract `ag-quest-rewards/1`; every call `assertGM`)
| Call | Does |
|---|---|
| `list(questId)` | The merged rows, with resolve status (`ok`/`missing`/`conflict`) |
| `addFromDrop(questId, dropData)` | `resolveItemDrop` (folders refused, D6), holding copy if embedded, then adds the row. Returns `{ok, row}` or `{ok:false, reason}` |
| `update(questId, key, {quantity, visibility, recipient})` | Validates, saves |
| `remove(questId, key)` | For `rw-` rows: deletes the row, and its holding copy only if no grant line references it (in Q1 there are none). For `def:` rows: sets `removed:true` |

Every write goes through the existing `updateState` (`store.mjs`: `assertGM`, `validState`, publish). Players get "GM only.".

## UI (kit 2.1.0 only; ui-standard §3)
A new GM-only section in the quest editor, placed **after** "Campaign status and reveal" (`agq-state`) and before the assignments `<details>`:
- **Section head:** `.ag-section` with the title "Item rewards". The reward list saves each change **at once** (no footer, ui-standard §3 Footer), and shows a `role="status"` line ("Saved").
- **Table:** `.ag-table-wrap` > `.ag-table` with these columns:
  - Item: image (`.agq-reward__img`, sized with tokens), name, then `itemId` in `--ag-font-mono`, or `.ag-badge` "No permanent id" with a `data-tooltip` explaining it.
  - Qty: number input, `.is-num`.
  - Shown to players: select "After it's completed" / "While the quest is visible" / "Never (GM only)".
  - Goes to: select "One character (chosen when granting)" / "Each character" / "Split between characters". Disabled with hint text on individual quests.
  - Status: `.ag-badge`, Missing `--danger` with the reason in `data-tooltip`, else nothing yet.
  - Actions: `.is-actions` with Remove, an `--icon` button, `fa-trash`, `aria-label` + `data-tooltip`, behind `confirmDialog('Remove this reward?', {danger: true, yes: 'Remove reward'})`.
- **Drop zone** under the table: `.agq-reward-drop` (dashed, tokens only), with `fa-gift` and the text "Drop items here: from a character or NPC sheet, a compendium or the Items sidebar." Use `readDrop` → `api.rewards.addFromDrop`. Show refusals as `ui.notifications.warn(reason)`.
- **Empty:** `.ag-empty` with the title "No item rewards yet" and the text "Drop an item here to add it."
- **The `rewardRecorded` checkbox stays where it is**, with new wording: "Rewards handled outside Quest Log".
- **Player reading view** (`readableDetail`, and the same markup in `embed.mount`): a "Rewards" `.ag-section` with `.ag-rows` (image, name, × quantity) only when `view.rewards.length`.

Classes use the `agq-` prefix. CSS uses tokens only (no hex, no raw font sizes, no viewport `@media`), and `data-tooltip` instead of `title`.

## Tests
- `validState`: accepts and refuses the new block.
- `rewardRows`: merges import and GM rows; overrides and removed respected.
- `publicView` visibility matrix:
  - `gm` never;
  - `shown` while visible;
  - `on_complete` only when Completed;
  - no uuid, id or key in the output (JSON string check).
- `addFromDrop`:
  - world → no holding copy;
  - compendium → no holding copy;
  - embedded → holding copy in the flagged folder, source untouched (assert no update or delete on the source actor);
  - folder → refused;
  - Actor → refused.
- `remove`: `def:` sets `removed`; `rw-` deletes the holding copy.
- API refuses non-GMs.
- Render test: section markup uses kit classes; Remove has `aria-label`; no `title=`.

## Done when
- `node scripts/check.mjs ashen-gate-quest-manager` is green.
- `node scripts/ui-lint.mjs` has strict rules at 0, and the ratchet is not raised.
- The version, CHANGELOG and README are done.

## Forge steps for Robb
1. Quest Log → open a quest in the editor. You see **Item rewards** with an empty drop area.
2. Drag a sword from an NPC sheet onto it. A row appears, and the NPC still has its sword.
3. In the Items sidebar, there is a new folder "Ashen Gate Rewards (Quest Log)" holding a copy.
4. Drag a potion from a compendium, and a backpack with items in it from the Items sidebar. Rows appear.
5. Set the potion's quantity to 2. Set the sword to "Never (GM only)".
6. Try dragging a whole folder: you get the message "Drop items one at a time."
7. Set the quest to Active and revealed. As a player, the quest shows **no** rewards. Set the potion to "While the quest is visible": the player sees the potion only.
8. Remove the sword row: you're asked first, and the held copy goes away.
9. Check the Compact and Comfortable sizes and one light skin.
