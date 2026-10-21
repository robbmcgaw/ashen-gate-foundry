# Shopping brief 4: Selling to a shop (Utilities 0.17.0)

Self-contained brief for a build chat. Read `CLAUDE.md`, then `docs/shopping-design.md` (final) §7c on branch `design/shopping`, and `docs/ui-standard.md` (final). It builds on 0.16.0's purchase path; reuse its queue, request ids, receipts and rollback helpers.

**Waits for:** 0.16.0 on main. S1–S9 are decided (§7c); keep them in `SELL_DEFAULTS` (0.14.0). Branch `utilities-0.17.0-sell`.

## Goal
A player sells an item from their own character to a presented shop that buys, after confirming the item, the price and who pays. All or nothing, carried out by the GM client.

## Rules (decided, S1–S9)
- Only presented shops with **Buys from players** on; never through a merchant list.
- Physical item types with a price above 0, filtered by the shop's `buys.types`; not equipped or attuned ("Unequip it first."); **never a container** ("Containers can't be sold. Empty it and sell the items separately."); not `noSale`; only from a character the seller owns; not from the party stash.
- Price = percent × the item's own price × quantity, rounded down to whole copper (`sellValueCp`).
- The shop purse pays (largest coins first, exact); no purse = unlimited money. If it can't afford or can't pay exactly, the player is told plainly ("Sorry, the vendor can't afford that.") and nothing happens; the GM gets a whisper with Top up. The amount is named to players only when the merchant's coins are shown.
- The seller chooses where the coins go: their character or the party purse. No vote.
- The item goes into the shop: matching line → stock up (unlimited stays unlimited); otherwise a new **hidden** line at the item's own price.

## UI (kit 2)
- In the player shop window, when the shop buys: a **Sell** sub-view (`.ag-segmented` Buy / Sell) listing the seller's sellable items (`.ag-rows`: image, name, quantity, "Shop pays 2 gp 5 sp each") and greyed rows for refused items with the reason as meta text (no clipped text).
- Also accept a drop of an item from the player's own sheet onto the shop window: it opens the same dialog.
- **Sell dialog:** item (image, name), quantity (stacks), "The merchant pays" amount, "Paid from: the merchant's coins" or "the merchant (unlimited)", "Coins go to" (`.ag-segmented`: <character> / Party purse), the result before → after. Cancel left, **Sell item** right.
- Result notice with names, never ids. The GM editor shows sold-in hidden lines with a `.ag-badge--warn` "Bought from players".

## GM client
`api.shops.quoteSell(...)` / `sell(...)` → `requestGM('shop-sell', …)`. Steps from §7c exactly: A. shop page update (purse, stock or hidden line, sale) → B. pay the receiver (one currency update; fails → undo A) → C. remove the item from the seller (fails → take coins back, undo A) → D. History `shop-sale`, receipt, rebuild the projection. The item is removed last.

## Tests
Price rounding; percent; stacks; every refusal (S1, S2, S7 container / equipped / attuned, S8); can't afford / can't pay exactly; unlimited money; stock merge vs new hidden line; rollback at B and C; ep never paid while off; projection still hides sold-in lines until the GM shows them.

## Done when
- Check green; version 0.17.0; CHANGELOG; README "Selling to a shop".
- Tell Robb what to click: turn on Buys from players (50 %) on a presented shop with a small purse; as the player sell a stack in part, then try a backpack (refused: containers) and an equipped item (refused); sell to the party purse; sell more than the merchant can afford (player sees "Sorry, the vendor can't afford that"; GM uses Top up); check the GM editor shows the new hidden line.
