# Shopping brief 1: shop rules (Utilities 0.14.0)

Self-contained brief for a build chat. Read `CLAUDE.md` first, then `docs/shopping-design.md` (final) on branch `design/shopping`, sections 3, 5, 7, 7b and 7c. Mockup for behaviour: https://claude.ai/artifact/8danqfZAjEWaTi1o55rprj (its `planPayment` and `bankQuote` are sketches, not the spec).

**Can start now.** No UI, so it doesn't wait for kit 2. Branch `utilities-0.14.0-shop-rules` from `main` (Utilities 0.13.2 is there with *Use electrum*). Open a PR; merge when green and Robb agrees.

## Goal
All shop maths and checks as pure functions in `modules/ashen-gate-utilities/scripts/core.mjs`, fully tested, so the UI PRs only wire them up. No Foundry globals, no saved data, no visible change in Forge.

## Reuse what is there
`COINS`, `COIN_LABELS`, `CP_VALUE` (export it; it is module-private today), `coinValueCp`, `coinChoices(electrum)`, `readCoins`, `ELECTRUM_OFF`, `containedItems`, `moveBundle`, `escapeHTML`. Don't copy them.

## Functions to add (names are suggestions; keep them in one `/* ---- 0.14.0: shops ---- */` block)

1. **Ids:** `shopIdFromName(name, taken, prefix = 'SHOP')` → `SHOP-COPPER-KETTLE` (`-2`, `-3` when taken; also checks a `retired` list). Same for `SVC-` and `MLIST-`. `validId(id, prefix)`.
2. **Prices:** `priceToCp({value, denomination})` (whole copper, else throws "That price isn't a whole number of copper."; ep converts at 50 cp), `priceText(cp, coin, {electrum})` ("15 sp", or mixed "1 gp 5 sp" when it doesn't divide; never ep while off).
3. **Lines:** `normalizeLine(raw)` → `{lineId, itemId, itemUuid, priceCp, priceCoin, flavour, stock, stockStart, hidden, costCp, sort}`; refuses negative or non-integer stock, flavour over 300 characters.
4. **Shop record:** `normalizeShop(raw)` with `purse` (`null` by default; coins whole ≥ 0; ep only when electrum is on), `purseStart`, `showPurse` (default **true**), `buys` (`{enabled: false, percent: 50, types: []}`, percent 1–100).
5. **Payment:** `planShopPayment({hold, totalCp, priceCoin, shopPurse, electrum})` → `{ok, exact, pay, back, after, shopAfter}` or `{ok: false, reason, noChange?}`:
   - price coin first, then smaller, then the smallest larger coins; change from the till (shop purse + coins just handed over) in pp/gp/sp/cp largest first; no purse = unlimited change;
   - if the till can't make change, try an exact payment from the payer's coins (largest first); else `noChange: true` with "The merchant can't make change for this…";
   - while electrum is off ep is never spent, counted, shown or given; while on it may be spent but never given as change;
   - report the net change per coin (no coin that goes out and straight back);
   - nothing ever below 0 on either side.
6. **Purchase check:** `checkPurchase({shop, lineId, quantity, rev, presentedTo, userId})` → refusals with the exact player texts from the design (§7 "Who may buy" 2–4): not open for you, shop changed, sold out, bad quantity, hidden line.
7. **Sell plan (§7c, decided S1–S9):** `sellValueCp(item data, percent, quantity)` (rounded down), `checkSell({shop, item, actorOwned, quantity})` (Buys on, type allowed, price > 0, not a container, not equipped/attuned, not `noSale`; refusal texts from §7c S4/S7), `planShopPayout({amountCp, shopPurse})` (largest coins first, exact or refused "can't afford" / "can't pay the exact amount"), `sellStockChange(shop, item)` (raise stock on a matching line or add a hidden line). Keep the S1–S9 values in one exported constant `SELL_DEFAULTS`.
8. **Bank (§7b):** `bankQuote({hold, from, to, receive, feePercent, electrum})` → `{ok, give, fee, total, receive, fromBefore, fromAfter, toBefore, toAfter}`; exact at 10:1 (ep 50 cp when on); "Ask for a multiple of 10 sp" when not whole; fee in the from coin rounded up; refused when short.
9. **Projection (§5):** `projectShop(shop, {electrum, locationName})` → the player shape: no hidden lines, no `costCp`, `gmNotes`, `itemUuid`, `itemId`, snapshots, `purseStart`; `purse` only when `showPurse` and a purse exists. `projectService(service)` for services; `null` for an unknown service type.
10. **History entries:** `shopPurchaseEntry`, `shopSaleEntry`, `bankExchangeEntry`, plus one-line text for each (`shopLine(h)`), the same style as `purseEntry` / `purseLine`.

## Tests (`tests/shop-rules-v0140.test.mjs`)
Cover at least: change-making with and without a shop purse; exact-payment fallback; "can't make change"; no negatives anywhere; ep never appears with electrum off (inputs holding ep included); ep spent but never given with it on; price text mixed and single; sold out and stock counting; hidden lines and the shop purse (when hidden) never in a projection; sell value rounding down, refusals for containers / equipped / no price / type not bought / can't afford; bank exact conversions, the multiple rule, fee round-up, refusals; ids and the retired list. Keep tests synthetic (`[TEST]` names).

## Done when
- `node scripts/check.mjs ashen-gate-utilities` is green.
- Version 0.14.0 in `module.json` (version + download URL) and `core.mjs` `VERSION`; search tests for `0.13.2` and update.
- CHANGELOG: "Shop rules for the coming Shopping feature (no visible change yet)." No README change beyond one line, no saved data.
- Tell Robb there is nothing to click in Forge for this one; it is tested logic only.
