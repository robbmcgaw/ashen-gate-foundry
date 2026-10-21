# Shopping brief 3: Present and buy (Utilities 0.16.0)

Self-contained brief for a build chat. Read `CLAUDE.md`, then on branch `design/shopping` `docs/shopping-design.md` (final) §5–7 and §9 (D1, D1a, D1c, D2, D9, D10), and `docs/ui-standard.md` (final, branch `design/ui-standard`). Mockup: https://claude.ai/artifact/8danqfZAjEWaTi1o55rprj (Present…, then Player view → Open shops → Buy…).

**Waits for:** 0.15.0 on main (and so kit 2). Branch `utilities-0.16.0-present-buy`.

## Goal
The GM presents a shop to all or chosen players; those players buy from it with the party purse or their own coins. Every purchase is checked and carried out by the GM client, all or nothing.

## Present
- **Present…** on a shop row and in the editor: `formDialog` with All players / Chosen players (checklist of non-GM users with their characters). Saves `presented: {mode, userIds, since, by}`. **Stop showing** clears it. "All players" includes players who log in later (D10).
- **Player View journal** (`flags.ashen-gate-utilities.store = 'shops-player'`): one page per presented shop holding `projectShop(...)` (0.14.0) and `rev`. Page ownership: Observer for the presented users only (all players for mode all), None for everyone else. The GM client rebuilds it on every change to the shop, its purse, presentation, stock, electrum, or the linked location's reveal state.
- Players get a socket ping and the shop opens as its own small window (and in the Shops tab → **Open shops**). Players never read the GM Data journal.

## Player shop window (kit 2)
- Shop head: art or initials, shop name, merchant, place (only when revealed), flavour; `.ag-badge--ok` "Open for you".
- Coin strips (kit `.ag-kv` or a small cluster): Party purse, the chosen character's coins, and the merchant's coins when shown ("Change comes from here").
- Wares as `.ag-rows`: image, name, "N per purchase", flavour, type, stock ("In stock", "3 left", `.ag-badge` Sold out), price, **Buy…** (`--sm`, disabled when sold out).
- **Buy dialog** (`ag-dialogs` form): quantity stepper (max = stock), Goes to (characters this user owns, D9), Pay with (`.ag-segmented`: Party purse / <character>'s coins, with "party must accept" badge when the vote applies), summary (`quote`): total, You pay, Change back, Left after, or the refusal in `.ag-notice--danger`. Cancel left, **Confirm purchase** right.
- Result: success notice ("2 Rope added to [TEST] Kestrel. Paid 2 gp, change 5 sp.") or the refusal, always ending "Nothing was charged." when nothing happened.

## Purchase on the GM client
Follow §7 "Steps" and "Failures" exactly:
- `api.shops.buy(...)` → `requestGM('shop-buy', …)` with timeout 15 s, 75 s when a party vote runs.
- Gates: Player Access, *Shops on for players*, presented to this user, line exists and not hidden, `rev` matches, quantity 1..stock, owns the receiver, owns the paying character or the stash exists. Party purse + vote setting on → `runConsent` (existing 60 s poll; GM never asked), then re-check.
- One purchase at a time per shop (a promise queue keyed by shop id). Same `requestId` never carried out twice (keep a short-lived set).
- A. create item copies on the receiver (`moveBundle`-style fresh ids; container contents linked), verify all arrived → B. one currency update on the payer → C. one update of the shop's GM page (stock, shop purse, sale) → D. stash History `shop-purchase` (purse purchases; own-coin purchases go to the sales log and the buyer's receipt), rebuild the projection, receipt, optional chat card. Each failure rolls back the earlier steps as in the table; if a rollback fails, whisper the GM what to fix by hand.
- A late GM answer after the player's timeout still sends the buyer a whisper with the real result.

## Settings (GM Setup → Shopping, settings only)
*Shops on for players* (world, default off) and *Party must accept when a player spends the party purse* (world String `''`/`on`/`off`, blank follows the coin vote). They save with the GM Setup footer like the other settings. The Shops tab appears for players while Player Access and *Shops on for players* are both on, showing **Open shops**.

## API additions
`present(id, {mode, userIds})`, `stopShowing(id)`, `presented()` (GM); `open(id?)`, `forMe()`, `quote(...)`, `buy(...)` (player or GM). Players are refused with the design's texts.

## Tests
Projection never leaks (hidden lines, cost, notes, purse when hidden); page ownership per mode; every refusal; vote path (approved, denied, timed out, re-check after vote); rollback at A, B and C; two buyers for the last one; duplicate `requestId`; ep never shown or used while off.

## Done when
- Check green; version 0.16.0 everywhere; CHANGELOG; README "Shops: presenting and buying".
- Tell Robb what to click: with a player logged in, Present a shop to that player only, check a second player doesn't see it; buy with own coins, then with the party purse (vote on and off); buy the last one; try a shop with a small coin purse to see "can't make change" and use Top up; Stop showing.
