# Changelog — Ashen Gate | Utilities

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
