## 0.15.1 — 2026-10-21

- Confirmations name the action (no more Yes/No), Help opens with a Close button, dialogs follow the Ashen Gate look; test wording removed from player views.
- Header shows just the version (no "Alpha · GM/Player"); the "live acceptance pending" footer text is gone; the no-characters hint now reads "Add at least two characters to start a check." Confirm titles are questions; clearing history and undoing an award, conversion, purse change or condition removal use a red action button.

## 0.15.0 — 2026-10-21

- Shop rules for the coming Shopping feature (no visible change yet): prices in whole copper, change-making with an optional shop purse (exact payment, else "The merchant can't make change"), purchase checks, selling to a shop (sell value, checks, the vendor's payout, stock), the Bank's exchange quote, the player view of a shop or service (no GM data) and History entries. Electrum stays out of all of it while *Use electrum* is off.
- No saved-data changes, no new settings, nothing to click in Forge.

## 0.14.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.
- Dialogs now come from the shared `ag-dialogs.mjs` (same behaviour, now skinned). Local result/check-bar classes renamed from `.ag-` to `.agu-` (no visual change).

## 0.13.2 — 2026-10-21

- **New GM Setup setting: Use electrum** (world setting, default **off**). Off: electrum (ep) is left out of the party purse (cp/sp/gp/pp), Award Gold, coin Deposit/Take, Adjust Purse and the embedded stash (Character Hub); an item priced in ep shows the same value in gp/sp/cp. ep moves and awards are also refused in the API and on the GM client, so nothing new is ever made in electrum. On: everything as before.
- **Money is never hidden.** If the purse still holds electrum while the setting is off, its ep line stays (dimmed) with a note, and the GM gets **Convert electrum to silver/gold**: all of it to silver (1 ep = 5 sp) or to gold (2 ep = 1 gp, an odd one → 5 sp). An exact before → after preview and confirmation come first; it's one purse update, recorded in stash History with **Undo**. Nothing converts automatically. Past History rows keep the coins they recorded.
- **API:** `api.currency` (`ag-utilities-currency/1`): `electrumEnabled()`, `coins()` (the coins to offer), `setElectrumEnabled(bool)` (GM only), hook `ashen-gate-utilities.electrumChanged`. `api.purse` gains `convertElectrum({to, reason})`, `undoConvert(entryId)`, `openConvert()` (GM only). `purse.coins` and `purse.totals()` still list all five coins.
- Character sheets (dnd5e) are not touched.
- Saved data: one new world setting `electrumEnabled`, and History entries of a new kind `purse-convert`. The purse still stores ep; no migration.

## 0.13.1 — 2026-10-21

- **Fix: a container (backpack, pouch…) moved to or from the party stash now takes everything inside it.** dnd5e keeps a container's contents as separate items pointing at the container; until now only the container itself moved, so it arrived empty and its contents stayed behind on the old sheet, loose (no longer in any container). Now the container and all its contents (nested containers too) move together, both directions, on every path: Utilities window, drag and drop, the Character Hub (`api.stash.deposit` / `withdraw` and the embedded stash) and the take-out vote. Quantities and all item data are kept; equipped/attuned are kept as before (no reset).
- **All or nothing.** Every copy is created and checked on the receiving side before anything is removed from the giving side. If any part fails, the copies are removed again, nothing is deleted from the source, and the player is told.
- Stash History, the vote prompt and the move message say what moved with it, e.g. "put Backpack (with 3 items inside) in the stash". Older entries read as before.
- An item taken out of a container (e.g. a pouch inside a backpack) arrives loose, not inside a container.
- Saved data: history entries for containers gain an optional `contents` count. No migration; existing items are not changed.

## 0.13.0 — 2026-10-20

- **`api.rolls.open({skills, dc?, mode, actorIds?, title?})`** (GM only), for partner modules such as Locations' Travel tracker: opens Utilities on **Rolls** with the *Start Rolls* form filled in (mode *Group result* or *Individual rolls*, ticked skills, DC, characters, title). Nothing is sent to players until the GM clicks **Start Rolls**, and every field can still be changed. If a roll is already running, the Rolls tab shows it as usual and nothing is replaced. Players calling it get `GM only.`
- No saved-data changes.

## 0.12.0 — 2026-10-20

- **New API `embed.mount(element, {actorId, mode: 'stash'})`** so a partner module (Character Hub) can show the real party stash inside its own window: the purse strip and the Items list with search, open item, Take, drag in and out, coin Deposit / Take and the GM's Adjust Purse. Returns `{unmount, refresh}`; it refreshes itself on stash changes. See the README.
- Same permissions as the Utilities window, enforced in the same functions: GM always; players need Player Access and the stash on; take-outs keep the party vote.
- The Utilities window is unchanged. No saved data changes.

## 0.11.0 — 2026-10-20

- **New read-only API `stash.listItems()`** for partner modules (Character Hub): `[{id, uuid, img, name, quantity, weight, value, type, typeLabel}]`, sorted by type then name; `[]` when there is no stash or it is empty.
- Same gate as the stash tab: the GM always; players are refused while Player Access is off or the stash is off for players. Listing moves nothing; the take-out vote is unchanged. Additive only: no saved data changes.

## 0.10.1 — 2026-10-19

- **New: separate coin vote setting.** GM Setup has **Party must accept when a player takes coins out**, independent of the item take-out vote. Off: a player's Take from the purse applies at once (same bounds, ownership and one-update-per-document rules) and the History entry reads "No vote needed". On: the existing vote prompt, unchanged.
- Default keeps today's behaviour: until the GM saves GM Setup, the coin vote follows the item vote; once saved it is independent. GM-only to change (world setting, and the API refuses players).
- The GM sees "Coin vote: on/off" under the purse strip; players' purse note reflects it. Help and README updated.
- Saved data: one new world setting `purseVoteRequired` (blank = follow the item vote). No migration needed.
- API: `api.purse.isVoteRequired()`, `api.purse.setVoteRequired(bool)` (GM-only).

## 0.10.0 — 2026-10-19

- **Fix: Party Inventory → Items column headers line up with their rows.** The last column was sized `auto` per row (empty in the header, a Take button in rows), so every grid worked out different widths and headers drifted. Header and rows now render the same cells from one column list and share one CSS template (`--agu-stash-cols`, fixed widths, no `auto`); the narrow layout uses the same rule for both. The last column is now headed **Action** (over Take); **Type** sits over the type text. Text sizes unchanged.
- **New: Party purse** strip at the top of Party Inventory → Items: five labelled counters (Copper, Silver, Electrum, Gold, Platinum) read from the stash Actor's dnd5e `system.currency` (the stash is a dnd5e NPC, which has currency; no new storage).
  - Players: pick their character, a coin and an amount, then **Deposit** (no vote) or **Take** (same party vote as items when *Party must accept* is on). The GM client re-checks ownership and amounts; never more than the giver holds, nothing goes negative, one update per document, only `system.currency.<coin>` changes. If the second update fails the first is put back.
  - GM: **Adjust Purse** (Add / Remove / Set to, optional reason, labelled confirmation). GM-only in the API (`api.purse.adjust`), not just the button. The GM sees and manages the purse even when the stash is off for players.
  - Stash **History** logs every deposit, take (including denied / timed-out) and adjustment with who, coin, amount, purse before → after and reason. GM **Undo** on adjustments and completed takes, once; refused (and the reason shown) if it would take the purse or the character below 0. Players see purse rows without the character's own coin totals.
- **Award Gold** now has a **Coin** choice (cp/sp/ep/gp/pp, default gp) with the same each/split and Undo logic. Older gold awards (no coin recorded) still read as gp.
- Saved data: additive only. New history kinds `purse-deposit`, `purse-take`, `purse-adjust`; gold awards gain `coin`. Old entries render unchanged. No migration needed.
- API: new `api.purse` (`totals`, `deposit`, `take`, `adjust`, `undo`, `openAdjust`); `awardGold` accepts `coin`.
- Not included: currency conversion / making change (possible follow-up).

## 0.9.0 — 2026-10-19

- **Group Checks** and **Roll Requests** are now one **Rolls** tab with one start form. Pick characters (the dnd5e Primary Party is ticked by default, else characters owned by connected players), skills, an optional DC, and a **Result** choice (default **Group result**):
  - *Group result* is the old Group Check: characters choose from the ticked skills, rolls per character 1–5, the average is compared with the DC, tally whispered to the GM.
  - *Individual rolls* is the old Roll Request: tick exactly one skill, one roll per character, each result shown on its own (Success/Failure per roll when a DC is set).
- Unchanged: one active roll at a time across both modes, GM-only Start/Skip/End/Cancel, the GM-client roll check and "Roll not counted" whispers, the player prompt and Roll Now, finished-result card, History.
- Saved data: none changed. History still labels entries Group Check or Roll Request, so old entries show as before. The old `checks`/`rolls` window tab ids both open Rolls.
- No public API changes (there was no start-roll API to keep).

## 0.8.0 — 2026-10-19

- New GM-only **Award Gold** (Party Inventory: next to the stash on/off toggle and in stash **History**). Enter gp, choose *each character gets this* (default) or *split evenly*, an optional reason, and tick characters. Default ticks: members of the dnd5e Primary Party, or characters owned by connected players when no Primary Party is set. A confirmation lists each character's gp before → after; a split pays whole gp only and any remainder is **not handed out** (it stays with you) and is shown before you confirm.
- Each character gets one update to `system.currency.gp`; no other coins or fields change. A chat card goes to the GM (or to everyone if ticked). The award is written to stash History with amount, characters, before/after gp, reason, time and GM.
- **Undo** on a gold History row takes the gold back from each character who still has at least that much, refuses (and names) anyone who has spent it, and never undoes a character twice. Players see only public awards in History, without gp totals.
- API: `api.awardGold({amount, mode, actorIds, reason, public})`, `api.undoGoldAward(entryId)` (also under `api.gold`); GM-only inside the API.
- Saved data: adds a `gold-award` entry type to the existing stash History list (additive; old entries render unchanged). Needs dnd5e currency; refuses clearly if `system.currency.gp` is missing.

## 0.7.3 — 2026-10-19

- A Group Check / Roll Request roll the GM client cannot count (the check already ended, the character's slots are used up, the roll proof doesn't match) is no longer dropped silently: the player and the GM get a whispered "Roll not counted: <reason>" chat line. Before, the player only saw "awaiting GM acceptance" forever.
- No saved-data or permission changes.

## 0.7.2 — 2026-10-19

- Skip / End / Cancel on a check, Clear stash history and Remove a non-native condition now use Foundry dialogs instead of the browser's `confirm` (which the desktop app lacks). Each has a labelled action button, with Cancel on the left. The test-fixture reset prompts do the same.
- New **Help** button in the header (draft text).
- No saved-data or permission changes.

## 0.7.1 — 2026-10-19

- If a finished Group Check's tally can't be posted to GM chat, the GM now gets a warning notification instead of a console-only message. The result itself was already saved and still shows in Group Checks and History.
- No saved-data or permission changes.

# Changelog — Ashen Gate | Utilities

## 0.7.0 — 2026-10-19

The party stash now lives inside the Utilities window; there is no separate stash window any more.

- **Party Inventory** tab hosts the stash: item list with details, search, Take, and an **Items / History** sub-tab. The "Open Party Stash" button is gone.
- Drop an item from any character sheet (Tidy5e included) anywhere on the Party Inventory tab to stash it; the tab outlines and the drop strip lights up while you drag. Drag a row onto a character sheet to take it out.
- Rules unchanged: whole stacks, party vote (GM toggle, GM never voted on, 60 s timeout), History log (GM clears), GM-side writes, stash on/off for players. No saved-data changes; the `stash` API keeps its shape (`stash.open()` now opens Utilities on Party Inventory).
- Utilities can be resized narrower (min 360 px); the item list collapses to a compact layout when the window is narrow.

## 0.6.1 — 2026-10-19

- Actors sidebar launcher is the full-width row under the other launchers. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.6.0 — 2026-10-19

Party stash: optional take-out vote and a history log.

- New GM Setup checkbox **Party must accept when a player takes an item out**. On (the default, same as 0.5.x): any other player can deny, and no answer in 60 seconds cancels. Off: a player withdraws freely with no vote. The GM is never voted on. The primary GM client checks the setting when it runs the move, so a player client can't skip or force a vote.
- New **History** tab in the Party Stash window: every deposit and take-out with who (player and character), the item (icon, name, quantity), how it was approved (party accepted, party denied, no answer in time, no vote needed, GM), and real and world time. Denied and timed-out take-outs are listed too. Players can read it while the stash is on; only the GM can clear it (with a confirmation).
- The log is written only by the GM client, stored in the new hidden world setting `stashHistory`, and keeps the latest 500 entries (oldest trimmed). It shows 50 at a time with **Show more**.
- API (additive): `stash.isVoteRequired()`, `stash.setVoteRequired(bool)`, `stash.history()`, `stash.clearHistory()`. Existing calls are unchanged.
- New world settings `stashVoteRequired` (default on) and `stashHistory` (default empty). No migration needed.

## 0.5.0 — 2026-10-18

Party stash overhaul.

- The party stash has its own **Party Stash** window instead of opening the Actor's features tab. Each item shows its icon, name, quantity, weight, value and type, grouped by type, with a search box. Click a name to open the item's sheet.
- GM world toggle (GM Setup, or Party Inventory → **Turn On for Players**). Off by default; while off, players can't see the stash or move items. While on, players get Observer permission on the stash Actor so item sheets open read-only.
- **Drag in:** drag an item from your own character sheet onto the Party Stash window. The GM client moves it (no copy left behind).
- **Take out:** drag a row onto your character sheet, or use **Take**. Every other connected player gets an Accept/Deny popup. Any deny, or no answer within 60 seconds, cancels and the item stays. On approval the GM client moves it. Dragging a stash item onto a sheet never makes a native copy.
- The GM moves items freely: drag from any sheet into the stash, drag a row onto any sheet, or use Take with any character. No vote.
- Player actions are checked again by the primary GM client (stash on, Player Access on, you own the character); the player's own client never edits the stash.
- New world setting `stashEnabled` (hidden, default off). No migration needed: the existing stash Actor is reused.

## 0.4.0 — 2026-10-18

Conditions overhaul.

- Players now see the same Conditions view as the GM, for every party character they can see (Limited permission or better). The GM still sees every character.
- Per-character removal lock, set by the GM in the Conditions tab (**Unlock for Owner** / **Lock Removal**). Every character starts locked. When a character is unlocked, its owner can remove its conditions.
- The lock is enforced, not just hidden: a player's removal is sent to the primary GM client over the module socket, which checks ownership and the lock again before removing. A locked, unowned or forged request changes nothing, and the player is told why.
- New **Pop Out Overlay**: a mostly transparent window with each character's name in bold, then a bulleted list of their conditions, with a small × where you may remove one. It is a per-user toggle, remembers where you put it, and updates live.
- Custom statuses work as in 0.3.x: marked Custom, traced to their source effect, and the GM can always remove them. Players can't remove Custom statuses, even when unlocked.
- New settings: `conditionUnlocks` (world, hidden, starts empty, so everything is locked), `overlayOpen` and `overlayPosition` (per user). No migration needed. The module now uses a socket (`"socket": true`).

## 0.3.1 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.
- New **Appearance** button in the header, for players and the GM. It opens General Manager's My Appearance window, and it is hidden when Manager isn't active.

## 0.3.0 — 2026-10-18

Beta-feedback quick wins.

- Group Check: the finished result now stays on screen for everyone until the GM clicks **Clear Result** (or starts the next check). It is also still saved to History.
- Group Check: when a check finishes, the GM gets a whispered chat message tallying every character's roll, the average, the DC and the verdict.
- Group Check: bigger type, and a segmented check bar that lights up as each roll comes in.
- Group Check: the roll form shows each character's skill bonus, and pre-selects Advantage or Disadvantage from the character's sheet and active effects (dnd5e roll modes, plus Midi-QOL style effect flags). The player can change it before rolling. The GM sees each pending character's bonuses for the allowed skills.
- RollTables: tables with document or compendium results can now be rolled. Utilities uses Foundry's own `RollTable#draw`, lists the drawn documents with an Open button and sends them as `@UUID` links.
- Conditions: statuses Foundry does not list (for example "magical" or "thinking" on imported characters) are marked Custom, traced to the effect that grants them, and linked to its source when known. The GM can always remove them: effects on the Actor are deleted, effects inherited from an Item are disabled instead of editing the Item.
- New setting `lastResult` (world, hidden) holds the finished check; no migration needed, it starts empty.

## 0.2.4 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.2.3 — 2026-10-18

- Fix: opening the Utilities window failed in Foundry V14 with "Cannot add property minWidth, object is not extensible". ApplicationV2 window position doesn't accept `minWidth`/`minHeight`; the minimum size is now set in CSS.

## 0.2.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## 0.2.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.2.0 Alpha — 2026-10-17 — Uncommitted review candidate

- Group Check resolve/archive/clear path, early end with audited skips; one active interaction without stale cross-tab mirroring.
- Dedicated Group Check and Public Roll Request surfaces; automatic pending-roll player prompt and larger Roll Now button.
- Detailed GM session History with individual DC comparison and group results.
- Party-native Condition overview, remote ActiveEffect refresh, native icon presentation.
- RollTable text-only preflight before rolling, including fail-closed document results.
- GM-only Observer-independent stash preview, minimum window size, compact controls and Actors launcher rank 60 group.
- GM-only real Foundry fixtures, 32 manual tests with outcome/notes on same row, and 57 passing source tests.

## 0.1.0 Alpha — 2026-10-16 — GitHub published prior release

- Initial Group Checks, public skill Roll Requests, text RollTable Messenger, native conditions, and GM-only Party Inventory preview.
