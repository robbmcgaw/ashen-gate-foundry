# Rewards brief R1: Renown rewards use the item-drop standard

This is a self-contained brief for a build chat. It touches a single module, **`modules/ashen-gate-factions` only**.

**Read first:**
- `CLAUDE.md`
- `docs/ui-standard.md` (final)
- design `docs/rewards-and-loot-design.md` §1.1 (Renown), §1.3, §2, §5.1, §6, §7 (Renown rows and backfill)
- `docs/item-drop-standard.md`

**Waits for:** S1 on `main`. Can run in parallel with Q1–Q3, U1, H1, L1 and T1.

## Branch and version
- **Branch:** `rewards-r1-renown` from `main`. Open a normal PR and merge it when it is green.
- **Version:** **minor**, recomputed from `main` (0.13.1 today → 0.14.0).
- Update `module.json` (+ `download` URL), every hard-coded old version (grep: today a test in `tests/`), the CHANGELOG and the README.

## Shared files
- **Add** `scripts/ag-item-drop.mjs`, **copied byte-identical** from Quest Log on `main`. Never edit it.
- Don't edit `ag-ui.css`, `ag-dialogs.mjs`, `ag-html.mjs` or `ag-launchers.mjs`.

## Decisions to follow (Robb)
- **D13:** reward zones take **Items only**; journals and other documents go to info entries.
- **D1:** copy; NPCs stay as they are.
- **D2:** holding copy for embedded drops.
- **Decision 11:** `item_id` next to `uuid`.

## Changes
- **Drop on `[data-reward-drop]`** (`scripts/module.mjs:389-391`; partial `agfRewardLevel`, `templates/dashboard.hbs:39`):
  - Use `readDrop` → `resolveItemDrop(raw)` (folders refused).
  - A non-Item gets "Rewards take items. Drop journals and other documents on the info list." and nothing is stored.
  - Store `{…existing fields, kind:'uuid', uuid, item_id: itemIdOf(item), img: item.img}`.
  - **Embedded** drop → a holding copy in the folder flagged `flags.ashen-gate-factions.store === 'reward-holding'`, created on first use as `Ashen Gate Rewards (Renown)` with no player access. The reward's `uuid` = the copy.
  - The `[data-entry-drop]` info zone keeps accepting any document, as today; only switch its parsing to `readDrop`.
- **Allow-list:** `source-allowlist.mjs:14` (`REWARD`) gains `item_id` (`/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/`, optional) and `img` (string, optional). The `reward()` validator (:37) checks them. Export includes them; import of 0.3/0.4 files without them still works.
- **`grantItem`** (`module.mjs:271`):
  - Find the source with the design §2.3 order: `worldItemById(item_id)` first, then `fromUuid(uuid)`.
  - Build with `grantBundle(source, {quantity: source.system?.quantity ?? 1, scope: 'ashen-gate-factions', tag: {claimId, rewardId, factionId}})`, so container contents come along.
  - One create call, verify, roll back on failure.
  - The existing `claimId` check stays: already there → skip.
- **Missing source** (today the claim silently stays `approved`):
  - `resolveRequest` (`module.mjs:496-512`) shows the GM "The reward item is missing (<name>). Fix the reward, then approve again.";
  - the request stays pending, and nothing is half-done.
- **Reward editor:** item rewards show the image, the name, and the `item_id` in `--ag-font-mono` or an `.ag-badge` "No permanent id" (with `data-tooltip`). A Missing badge (`--danger`) appears when the reward doesn't resolve.
- **Backfill (design §7):** a labelled card in **GM Setup** (a real migration, not Developer Tools), titled **Fill in permanent item ids**.
  - Button **Check rewards** (dry run) lists "Will fill" / "No permanent id" / "Missing".
  - **Fill in ids** (primary) → `confirmDialog('Fill in permanent item ids?', {yes: 'Fill in ids'})`.
  - Re-runnable. Never overwrites an `item_id`, never changes a `uuid`, never touches claims. GM only in the API (`api.rewards.backfillItemIds({dryRun})`).
  - Saving any reward also fills its own `item_id` when it is empty.
- **Removing a reward** (already refused when claims exist): a holding copy is deleted only after the existing confirm, and only when no claim references the reward.

## API additions
`api.rewards = {contract: 'ag-renown-rewards/1', backfillItemIds({dryRun = true})}`, GM only.

## Tests
- Drop:
  - Item stored with `item_id` and `img`;
  - an embedded item → holding copy, source untouched;
  - a Journal on the reward zone → refused, nothing stored;
  - a folder → refused.
- Allow-list: accepts the new keys and refuses a bad `item_id`.
- `grantItem`:
  - id wins over uuid;
  - container contents arrive;
  - an existing `claimId` → nothing created;
  - a mid-way failure rolls back.
- Missing source: the request stays pending, with the message.
- Backfill: dry run writes nothing; a real run fills only empty ids; re-running changes nothing; claims are untouched.
- Export/import round-trip with and without the new keys.

## Done when
- `node scripts/check.mjs ashen-gate-factions` is green; `ag-item-drop.mjs` is identical to the other copies (`check.mjs`).
- `node scripts/ui-lint.mjs` has strict rules at 0, and the ratchet is not raised.
- The version, CHANGELOG and README are done.

## Forge steps for Robb
1. Renown → a faction → a reward level: drag a sword from an NPC sheet. The reward shows the image, the name, and the item's id (or "No permanent id"), and the NPC keeps its sword.
2. Drag a journal onto the reward zone: you get a message, and nothing is added. Drag it onto the info list instead: it is added there as before.
3. Drag a backpack with contents from the Items sidebar as a reward. As a player, claim it; approve it as the GM: it arrives with its contents.
4. Delete the world item behind another reward, then approve a claim for it: you get the "missing" message, and the request stays pending.
5. GM Setup → **Fill in permanent item ids** → **Check rewards**, then **Fill in ids**. Run it again: nothing changes.
6. Check the Compact and Comfortable sizes and one light skin.
