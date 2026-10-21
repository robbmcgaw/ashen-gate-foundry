# Rewards brief Q2: grant quest rewards on completion (all or nothing, idempotent, Journey, drag-out)

This is a self-contained brief for a build chat. It touches a single module, **`modules/ashen-gate-quest-manager` only**.

**Read first:**
- `CLAUDE.md`
- `docs/ui-standard.md` (final)
- design `docs/rewards-and-loot-design.md` §3.2 (drag-out, Grant again), §3.4–3.6, §5.2, §6
- the Q1 code on `main`

**Waits for:** Q1 on `main`. It works with or without H1: the Journey call is feature-detected.

## Branch and version
- **Branch:** `rewards-q2-grant` from `main`. Open a normal PR and merge it when it is green.
- **Version:** **minor**, recomputed from `main` (after Q1: 0.11.0 → 0.12.0).
- Update `module.json` (+ `download` URL), every hard-coded old version, the CHANGELOG and the README ("Giving rewards").

## Shared files
- Use `ag-item-drop.mjs` and `ag-dialogs.mjs` unchanged.
- The grant panel is module markup (the shared `formDialog` is flat; design §3.5). If you need a kit part that doesn't exist, stop and report.

## Decisions to follow (Robb)
- **D4** party default: one chosen character.
- **D5** Grant again: GM only, behind a confirm, minimal.
- **D7** no stacking: always a new item.
- **D8** drag-out onto a sheet = a recorded grant, never given twice.
- **D9** chat card whispered to the recipients' owners and the GM.
- **D10** no coins.

## Grant engine (pure where possible, in `scripts/rewards.mjs`)
- **`grantPlan(rows, state, choices)`**: from the panel's choices, build `[{actorId, lines: [{rewardKey, round, quantity}]}]`.
  - It refuses a `split` whose counts don't add up to the quantity.
  - It refuses a row already granted to that Actor in its current round.
- **`isGranted(state, actor, rewardKey, round)`**: true when `rewards.grants` has a `granted` line for `(rewardKey, round, actorId)`, **or** the Actor holds an Item with `flags.ashen-gate-quest-manager.reward` matching `{questId, rewardKey, round}`. A tag without a record = repair the record; never create again.
- **`executeGrant(questId, plan)`** (GM, under an in-memory per-quest lock):
  1. Re-read the state. Drop lines that are already granted (repair the record for those).
  2. For each line, `resolveRef` (imported rows: `worldItemById(item_id)`). A `missing` or `conflict` line fails **that Actor's** whole grant, with the reason.
  3. For each Actor, **all or nothing**:
     - `grantBundle(item, {quantity, scope: 'ashen-gate-quest-manager', tag: {reward: {questId, rewardKey, round, grantId}}})` for every line;
     - **one** `actor.createEmbeddedDocuments('Item', data, {keepId: true})`;
     - verify every id arrived;
     - on any failure, delete the ids that arrived.
     - Never touch a source.
  4. Append one `grants[]` entry `{grantId: 'g-<randomID>', at, by, lines: [...]}` with `granted`/`failed` + reason per line. Keep the newest 200. Save through `updateState` (publish).
  5. **Journey (feature-detected):** for each Actor that got items, call `game.modules.get('ashen-gate-character-hub')?.api?.journey?.recordReward?.(actor, {questId, questName, grantId, items: [{name, img, quantity, itemId}]})`. Errors are logged with `console.warn` and never fail the grant.
  6. **Chat card (D9):**
     - `ChatMessage.create` with `whisper` = every GM user + the non-GM owners of each recipient Actor;
     - the content: "Quest reward: <quest name>", then a list per character of "2 × Name" (no ids);
     - one message per grant.
  7. Return `{grantId, results: [{actorId, ok, items, reason}]}`.

## API additions (`api.rewards`; every call `assertGM`)
- `grantable(questId)` → rows with what is still owed.
- `grant(questId, choices)` → result.
- `grantAgain(questId, rewardKey)` → raises `overrides[key].round` by 1 (D5). The API needs `{confirm: true}`; the UI asks first.

## UI (kit 2.1.0)
**Give rewards panel** (`.agq-grant`, inside the Item rewards section):
- **When it opens:**
  - Automatically after **Save progress & reveal** sets status to Completed while something is grantable.
  - Or from a **Give rewards** button (`.ag-btn`, `fa-gift`) in the section head, shown when something is grantable.
- **Layout:** an `.ag-table` with:
  - a tick box (default on; off and disabled for Missing, with the reason);
  - item (image, name, × quantity);
  - "Goes to":
    - `chosen`: a character `<select>`, empty first, required;
    - `each`: a checklist of party characters;
    - `split`: one number input per party character (`.is-num`), with "x of y shared" status text;
    - individual quest: the quest's character, as text.
- **Party characters:** the Actors the quest is projected to (the `projectionOwnership` set); a GM may untick any.
- **"Will receive":** an `.ag-list` under the table, per character.
- **Its own `.ag-footer`:**
  - **Not now** (ghost, left): closes the panel; nothing is granted; the status stays saved.
  - `role="status"` text.
  - **Grant rewards** (primary, right), disabled with visible hint text while a `chosen` row has no character or a split doesn't add up.
- **Grant rewards** → `confirmDialog('Give these rewards?', {yes: 'Grant rewards'})`. The body names the characters and items, never ids.
- **Then** `infoDialog('Rewards given', …)` per character (granted, or failed + reason).

**Rows after granting:**
- Status `.ag-badge--ok` "Given to Aria" (several names wrap; never truncated).
- **Grant again** (`--sm`) → `confirmDialog('Give this reward again?', {yes: 'Grant again'})`.

**Drag-out (D8):**
- Granted and not-yet rows are `draggable="true"`, GM only, with `dragPayload(ref, {agQuestReward: {questId, rewardKey}})`. Missing rows are not draggable.
- Register `Hooks.on('dropActorSheetData', (actor, sheet, data) => …)`. When `data.agQuestReward` is present:
  - not GM → `return false` with "Only the GM can give quest rewards.";
  - already granted to that Actor in the current round → `return false` + warn "Already given to <name>.";
  - otherwise run `executeGrant` for that one line and Actor and `return false`, so Foundry doesn't copy it as well.
- Without `agQuestReward`, do nothing (other modules' drops pass through).

**Player view:**
- `rewardRecorded` in `publicView` = `state.rewardRecorded || every visible row granted (current round)`.
- Players never see recipients or grant records.

## Tests
- `grantPlan`: `chosen`, `each`, `split` (bad sums refused), individual quests.
- `executeGrant`:
  - one create call per Actor;
  - a failure mid-way deletes what was made and records `failed`;
  - a missing source fails only that Actor;
  - **completing twice creates nothing the second time**;
  - **crash recovery**: a tag present but no record → the record is repaired, no create;
  - Grant again → a new round grants once more;
  - the source is never updated or deleted;
  - quantity is set on the root;
  - container contents arrive.
- Journey: called with items when the Hub API exists; not called and no error when it is absent; an error inside it doesn't fail the grant.
- Chat card: whisper list = GMs + owners only.
- `dropActorSheetData`:
  - a GM drop grants and returns false;
  - a second drop warns and creates nothing;
  - a player is refused;
  - a payload without `agQuestReward` is ignored.
- API refuses non-GMs.
- Render: the panel uses kit classes; the disabled Grant button has visible hint text.

## Done when
- `node scripts/check.mjs ashen-gate-quest-manager` is green.
- `node scripts/ui-lint.mjs` has strict rules at 0, and the ratchet is not raised.
- The version, CHANGELOG and README are done.
- In the PR, say that tests prove the logic, not the live UI.

## Forge steps for Robb
1. A party quest with rewards from Q1: a potion ×2 set to "Each character", a sword set to "One character", a backpack with contents.
2. Set the status to Completed and click **Save progress & reveal**. The **Give rewards** panel opens.
3. Pick a character for the sword, then **Grant rewards** → confirm.
4. Check:
   - each character got 2 potions;
   - the chosen character got the sword and the backpack with its contents inside;
   - the NPC still has its sword;
   - a whisper card went only to you and the recipients' players.
5. Save Completed again: no panel opens, and nothing new arrives.
6. Add a new reward, drag its row onto a character sheet: it arrives once. Drag it again: "Already given to …".
7. **Grant again** on the potion row: asks first, then lets you give it once more.
8. If Character Hub is updated (H1): the character's **Journey** shows "Reward for "…": 2 × …".
9. Log in as a player: the quest shows the rewards after completion, without names of other recipients.
10. Check the Compact and Comfortable sizes and one light skin.
