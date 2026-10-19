# Ashen Gate | Utilities

Module ID `ashen-gate-utilities` · Foundry V14 · dnd5e. Table utilities for the party: group checks and roll requests (one Rolls tab), RollTable sharing, a shared conditions view and a shared party stash. It works on its own; General Manager and the other Ashen Gate modules are not needed.

Open it from **Actors sidebar → Utilities**. The GM always sees it; players see it once **GM Setup → Player Access** is on.

## Tabs

- **Rolls:** the GM picks characters (the dnd5e Primary Party is ticked by default), skills and an optional DC, and chooses how the result works:
  - **Group result** (a Group Check): characters choose from the ticked skills, optionally several rolls each; the average of accepted totals is compared with the DC for one Success or Failure. The tally is whispered to the GM.
  - **Individual rolls** (a Roll Request): each character makes one roll of the one ticked skill; each result is shown on its own (Success/Failure per roll when a DC is set).

  Eligible connected players are prompted and roll from the compact player view (**Roll Now**, with advantage/disadvantage). Only one roll can run at a time. **End & Record** closes an incomplete one and records the remaining slots as Skipped; **Cancel Session** files it as cancelled.
- **Party Inventory:** one shared stash (a Utilities-flagged NPC Actor). Drop an item from any character sheet onto the tab to stash it; drag a row onto a character sheet to take it out. Taking an item out needs every other connected player to accept (GM can turn the vote off; the GM is never asked; 60 second timeout). An Items / History sub-tab lists contents and movements. The GM turns the stash on or off for players.
- **Party purse:** the five dnd5e coin totals (`system.currency` cp/sp/ep/gp/pp) held by the stash Actor, at the top of Party Inventory → Items. Players Deposit from / Take to their own characters (Take uses the separate GM Setup setting *Party must accept when a player takes coins out*; until the GM saves it, it follows the item vote; the GM sees "Coin vote: on/off" by the purse); the GM can Add / Remove / Set any coin with a reason. Every change is logged in stash History; the GM can Undo adjustments and takes. No currency conversion.
- **Award Gold (GM):** pay coins (gp by default, or cp/sp/ep/pp) to ticked characters (each, or split evenly in whole coins; a remainder is not handed out). Writes only `system.currency.<coin>`, posts a chat card and logs to stash History, where the GM can Undo it for anyone who still has the gold.
- **Roll Tables:** draws a native RollTable and shows the result with an editable preview, whisper to chosen players, and Auto-Send. Document results are sent as `@UUID` links.
- **Conditions:** one party view of native conditions. Removal is locked per character; the GM unlocks a character so its owner can remove that character's native conditions. **Pop Out Overlay** opens a transparent per-user conditions window.
- **History** (GM): finished and cancelled rolls, labelled Group Check or Roll Request, with per-character results, average and outcome.
- **GM Setup** (GM): Player Access and other settings.

Player actions that change shared state (stash moves, condition removal) are carried out by the active GM client, which re-checks ownership and the lock, so a GM must be logged in for those.

## Public API

`game.modules.get('ashen-gate-utilities').api`: `open`, `playerAccess` (`ag-player-access/1`), `conditions` (`isUnlocked`, `setUnlocked`, `canRemove`, `remove`, `openOverlay`) and `stash` (`isEnabled`, `setEnabled`, `isVoteRequired`, `setVoteRequired`, `history`, `clearHistory`, `open`, `deposit`, `withdraw`), plus GM-only `awardGold({amount, mode, actorIds, reason, public})` and `undoGoldAward(entryId)` (also as `gold`).

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-utilities/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-utilities-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
