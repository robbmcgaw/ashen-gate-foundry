# Ashen Gate | Utilities

Module ID `ashen-gate-utilities` · Foundry V14 · dnd5e. Table utilities for the party: group checks and roll requests (one Rolls tab), RollTable sharing, a shared conditions view and a shared party stash. It works on its own; General Manager and the other Ashen Gate modules are not needed.

Open it from **Actors sidebar → Utilities**. The GM always sees it; players see it once **GM Setup → Player Access** is on.

## Tabs

- **Rolls:** the GM picks characters (the dnd5e Primary Party is ticked by default), skills and an optional DC, and chooses how the result works:
  - **Group result** (a Group Check): characters choose from the ticked skills, optionally several rolls each; the average of accepted totals is compared with the DC for one Success or Failure. The tally is whispered to the GM.
  - **Individual rolls** (a Roll Request): each character makes one roll of the one ticked skill; each result is shown on its own (Success/Failure per roll when a DC is set).

  Eligible connected players are prompted and roll from the compact player view (**Roll Now**, with advantage/disadvantage). Only one roll can run at a time. **End & Record** closes an incomplete one and records the remaining slots as Skipped; **Cancel Session** files it as cancelled.

  The GM's Rolls tab has two sub-tabs (0.26.0): **Current** (the running check or the last result, then **Start Rolls**, a fold that is open while nothing is running or shown; skills are toggle chips) and **History** (finished and cancelled checks, labelled Group Check or Roll Request, with per-character results, average and outcome).
- **Party Inventory:** one shared stash (a Utilities-flagged NPC Actor). Drop an item from any character sheet onto the tab to stash it; drag a row onto a character sheet to take it out. Taking an item out needs every other connected player to accept (GM can turn the vote off; the GM is never asked; 60 second timeout). A container (backpack, pouch…) moves with everything inside it, nested containers included; the move is all or nothing. Items / Party Fund / History sub-tabs list contents, the purse and movements. The GM turns the stash on or off for players in **GM Setup**; the GM's line above the sub-tabs shows the stash, its item count, an On/Off badge with **Change in GM Setup**, and **Award Gold**.
- **Party Fund** (Party Inventory → Party Fund, 0.25.0): one **Character** picker, the party purse, then **Deposit**, **Take** or **Change coins** (one form at a time, 0.26.0), and a **Log** (a fold). Items shows the purse in one line with a button to Party Fund.
  - **Change coins:** whose coins (the picked character, or the party purse: no vote, nothing leaves the party), change from, into, how many to get, a preview (You give, You get, before → after), **Confirm exchange**. Standard rates, exact (1 pp = 10 gp = 100 sp = 1000 cp; "Ask for a multiple of 10 sp"), electrum only while *Use electrum* is on. No fee unless the GM sets **GM Setup → Party Fund → Coin exchange fee (%)** (0–50, default 0; taken in the coin given, rounded up, on top). The GM client checks again on fresh coins and makes one coin update with both coins; the exchange is in stash History (`coin-exchange`) and a card is whispered to the player and the GM. Same gate as the stash: Player Access and the stash on for players.
  - **Log:** the latest 20 coin movements, newest first (who, when, how much): deposits, takes, GM adjustments, electrum conversions, exchanges (Party Fund and banks) and shop purchases and sales paid with the party purse. **Full History** opens the History sub-tab. Players see their own and the party purse's exchanges, not other players' own coins.
  - Deposit and Take also post a card whispered to the player and the GM (0.25.0).
- **Party purse:** the five dnd5e coin totals (`system.currency` cp/sp/ep/gp/pp) held by the stash Actor, in Party Inventory → Party Fund (the embedded stash keeps it at the top). Players Deposit from / Take to their own characters (Take uses the separate GM Setup setting *Party must accept when a player takes coins out*; until the GM saves it, it follows the item vote; the GM sees "Coin vote: on/off" by the purse); the GM can Add / Remove / Set any coin with a reason. Every change is logged in stash History; the GM can Undo adjustments and takes. No automatic currency conversion.
- **Use electrum (GM Setup, default off):** off leaves electrum (ep) out of the purse, Award Gold, coin Deposit/Take/Adjust and the embedded stash; ep moves and awards are refused. If the purse still holds ep it stays visible (dimmed) with a note, and the GM can **Convert electrum to silver/gold** (1 ep = 5 sp; 2 ep = 1 gp, an odd one → 5 sp) after an exact preview; the conversion is logged in History with Undo. The purse still stores ep, and character sheets are not changed.
- **Award Gold (GM):** pay coins (gp by default, or cp/sp/pp, and ep while electrum is on) to ticked characters (each, or split evenly in whole coins; a remainder is not handed out). Writes only `system.currency.<coin>`, posts a chat card and logs to stash History, where the GM can Undo it for anyone who still has the gold.
- **Roll Tables** (GM; players have no Roll Tables tab since 0.26.0): draws a native RollTable and shows the result with an editable preview, whisper to chosen players, and Auto-Send. Document results are sent as `@UUID` links.
- **Conditions:** one party view of native conditions. Conditions are locked per character; the GM unlocks a character so its owner can apply and remove that character's native conditions, or turns on **Players apply and remove conditions on their own characters** in GM Setup for every character. The GM can also tick **Condition controllers** in GM Setup: those players apply and remove native conditions on every character (conditions only), are listed in the Conditions tab and can be revoked there at any time. Custom statuses stay GM only. **Pop Out Overlay** opens a per-user conditions window with a background slider (0–100 %, remembered per user; text and header stay solid). The Cinders Strain chip (`ag-strain-*` statuses) is listed read only: it follows the character's Strain, so it is never offered for Remove or Apply here (the API refuses it too).
- **GM Setup** (GM): Player Access and other settings.
- **Shops**: GM: see *Shops (GM)* below. Players: **Open shops**, the shops and services the GM presents to them (see *Shops: presenting and buying*), and **Merchant lists**, the lists the GM shares (read only, see *Merchant lists*). The tab shows for players while Player Access and *Shops on for players* are both on.

Player actions that change shared state (stash moves, applying or removing conditions) are carried out by the active GM client, which re-checks ownership and the lock, so a GM must be logged in for those.

## Shops (GM)

**Utilities → Shops**. The GM has two sub-tabs, **Shops & services** and **Merchant lists**. An editor opens in place of its list (no sub-tabs while it is open; **All shops** / **All merchant lists** goes back, asking first when there are unsaved changes).

- **Shops & services:** every saved shop, grouped by settlement (the nearest settlement at or above the shop's place in Locations, else the top of its tree, else the settlement typed on the shop; "No location" last), or sorted by name, merchant or recently changed. Search matches the shop name, merchant, place, item names and id. Each row has **Edit** and **Present…** (or **Open** and **Stop showing**); the cash is in the row's second line. Import JSON… and Export sit together; **New Bank (deprecated)** is a small button before **New shop**.
- **Shop editor** (tabs **Details**, **Items**, **Coins & buying**, one footer): **Duplicate** (a copy with the same items and coins, not shown to anyone) and Present… / Stop showing are in the editor's head under an **Applies now** badge, as are Restock (Items) and the merchant's coin buttons: they change the saved shop at once. Details holds name, **Settlement**, merchant name and art (initials when empty), flavour text (players will see it), GM notes.
  - **Settlement:** with Locations active, a list of its settlements only. A location counts as a settlement when Locations' API says so (`isSettlement(record)`, when it has one), else when its record has `settlement: true` or `kind` / `locationType` `"settlement"`, else when its **Type** names one as a whole word: Settlement, City, Town, Village or Hamlet (any case). A shop already linked to a place that isn't one keeps it, marked "(not a settlement)". Without Locations it is a text field (saved on the shop as `settlement`; players see it).
  - **Merchant from an Actor:** drop an Actor (an NPC from the Actors sidebar or a compendium) on the merchant drop zone (or the items drop zone) to fill the merchant name and portrait (its token art when the portrait is Foundry's default). Both stay editable by hand. The Actor's uuid, id and name are kept only as a note (`merchant.actor`), so deleting the Actor changes nothing; **Clear** forgets it and empties the name and art. Players never get the note.
  - Items are listed by category (item type). Hover an item's picture or name for its dnd5e tooltip; click to open it (read only: the shop's own copy).
  - **Items for sale:** drop items from a character sheet, the Items sidebar, a compendium or a folder. A container comes with what is inside it. The shop keeps its own copy; the source item is never changed. Price starts at the item's own price (whole copper; an ep price shows in sp while *Use electrum* is off). Stock blank = unlimited. Hidden items and cost are GM only. Flavour and cost sit on a second line under each item. **Restock** puts stock back to where it started.
  - **Merchant's coins** (off by default; off = unlimited cash): **Add / Remove / Set…** (never below 0, with a reason, logged), **Restock cash** (back to the starting cash), *Show merchant's coins to players* (on by default).
  - **Buys from players** (off by default, 50 %, item types): saved now, used when selling to a shop arrives.
  - **Save Changes** saves; **Cancel** discards. **Delete shop** (Danger zone) asks first and is refused while the shop is shown to players.

Shops are stored in a Journal **Utilities Shops (GM Data)** with no player permission (one page per shop), found by its flag, so renaming it is safe. Don't edit its pages by hand.

API, GM only (`GM only.` for anyone else; the presenting and buying calls are below): `api.shops` (`ag-utilities-shops/1`): `list({search, sort})`, `get(id)`, `create(data)`, `save(record)`, `duplicate(id)`, `delete(id, {confirm: true})`, `addItems(id, uuids | dropData)` → `{added, skipped}`, `restock(id, lineIds?)`, `adjustPurse(id, {op, coin, amount, reason, asStart})`, `setPurse(id, coins | null)`, `restockCash(id)`, `log(id)`.

## Shops: presenting and buying

- **Present…** (a shop row or the editor): *All players* (players who log in later too) or *Chosen players* (ticked, with their characters). **Stop showing** ends it; **Open** shows the shop as players see it. A shop shown to players can't be deleted.
- Players it is shown to get the shop in its own window (and in Shops → **Open shops**): merchant, place (only once revealed in Locations), flavour, the party purse, their character's coins, the merchant's coins (unless hidden: "Change comes from here"), and the wares with stock and price. Wares are cards grouped by category; hover a ware's picture or name for the item's dnd5e tooltip, click to open it read only. Both come from a trimmed copy in the player view (the name and description players may see, the shop's price; no flags, effects, cost or GM notes). The Sell list, the Buy and Sell previews and the party stash show the same tooltips (a character's or the stash's own Item).
- Coins: every coin box and amount (purses, the Bank, prices, previews, chat cards) has its coin's icon and a glow in its metal's colour; electrum shows only while *Use electrum* is on (or dimmed while a purse still holds some). Hidden items, cost, GM notes and other players' presentations never reach them.
- **Buy…**: how many, which of your characters gets it, and who pays (the party purse or one of your characters' coins). Review shows the total, what you pay, the change and what is left; **Confirm purchase** buys. A refusal says why and ends "Nothing was charged."
- The GM client checks every purchase again and carries it out all or nothing: the items arrive first, then one coin update, then the shop's stock and coins. If a step fails the earlier ones are put back; if putting back fails, the GM gets a whisper saying exactly what to fix. Two players buying the last one: the second gets "Sold out. Nothing was charged."
- Paying from the party purse asks the party first when *Party must accept when a player spends the party purse* is on (same 60-second vote as the stash; the GM is never asked). Purse purchases are listed in Party Inventory → History; every sale is in the shop's own log.
- If the merchant can't make change, the buyer pays the exact amount when their coins allow it; otherwise it is refused and the GM gets a whisper with **Top up shop purse**.
- **GM Setup → Shopping**: *Shops on for players* (off by default) and *Party must accept when a player spends the party purse* (follows the coin vote until you save GM Setup). They save with Save Changes.
- Storage: a Journal **Utilities Shops (Player View)**, one page per presented shop, rebuilt by the GM client; each page is readable only by the players the shop is shown to. Don't edit it by hand.
- API (`api.shops`, added): GM only `present(id, {mode: 'all' | 'users', userIds})`, `stopShowing(id)`, `presented()`; player or GM `open(id?)`, `forMe()`, `quote({shopId, lineId, quantity, actorId, payFrom: 'purse' | 'actor', payerId?, rev})`, `buy({...same})` → the receipt text. Players are refused with `Utilities is hidden for players.`, `The GM has turned shops off.` or `This shop is not open for you.`

## Selling to a shop

- A shop sells to players only. To let it buy too, turn on **Buys from players** in the shop editor (percent of the item's price, default 50 %, and optionally which item types). Only a shop shown to the player buys; a merchant list never does.
- In the shop window a **Buy / Sell** switch appears. **Sell** lists the chosen character's items: what the shop buys, with "Shop pays 2 gp 5 sp each", then greyed items with the reason (containers: "Containers can't be sold. Empty it and sell the items separately."; equipped or attuned: "Unequip it first."; wrong type, *Not for sale*, no value). **Coins go to**: the character or the party purse (no vote: coins only come in).
- **Sell…** (or drag an item from your own character sheet onto the shop window): how many (stacks), then the sale: item, the merchant pays, paid from the merchant's coins or the merchant (unlimited), where the coins go and the coins before → after. **Sell item** sells; Cancel does nothing.
- Price: percent × the item's own price × how many, rounded down to whole copper. The merchant pays in the largest coins it holds (never ep); with no coin purse it has unlimited money. If it can't pay, the player sees "Sorry, the vendor can't afford that." (with the amount only while the merchant's coins are shown) and the GM gets a whisper with **Top up shop purse**.
- The item goes into the shop: the same item already on sale (one per purchase) gets its stock raised (unlimited stays unlimited); otherwise a new **hidden** line at the item's own price, marked **Bought from players** in the editor for you to show or remove.
- All or nothing on the GM client, in the same queue as purchases: the shop's coins, stock and log first, then the coins to the seller, then the item is taken last. A failure puts the earlier steps back (the GM gets a whisper if that fails too). Sales into the party purse are listed in Party Inventory → History; every sale is in the shop's own log.
- An open shop editor follows sales and purchases on that shop (new lines, stock you haven't edited, the merchant's coins), so Save Changes never drops an item a player just sold.
- API (`api.shops`, added): `quoteSell({shopId, itemId, actorId, quantity, payTo: 'actor' | 'purse', rev})` and `sell({...same})` → the receipt text (player or GM).

## Merchant lists

- **Shops → Merchant lists** (GM): one card per list, for a settlement, a faction, a guild or any group of merchants. **New merchant list** / **Edit** open a small editor: name, settlement (optional, Locations active only; Locations' settlements, as in the shop editor), and the shops and services on it (**Add to list**, move up or down, take off). Save Changes / Cancel. A saved list's editor also has **Share…** and a Danger zone with **Delete list…**. **Delete** asks first; the shops and services stay. Since 0.26.0 the card is a summary (shared with, "n of m open", Share…, Open all, Close all…, Edit, Delete…) with its entries in a **Stores** fold.
- **Shared with** (0.25.0): *Hidden* (new lists), *Whole party* (also players who log in later) or chosen players. **Share…** on the card picks one.
- **Open / Closed** switch on each entry (0.25.0): Open presents that shop or service to the list's players (the same Present as the shop's own button, adding them to whoever already sees it), so they can buy, sell or use it. Closed stops showing it to every player. **Open all** / **Close all…** do every entry at once (an entry that can't be opened, such as a missing record or an unknown service type, is skipped and named). Opening needs the list shared first. The card shows "2 of 5 open". **Close all…** asks first ("Close n stores for every player?") and names stores that are also shown to players outside the list (presented on their own or on another shared list); switching one such store to Closed asks the same.
- Players: Shops → **Merchant list** shows each list shared with them (settlement name only once revealed in Locations) with name, merchant, place and "3 items" or "Bank". An **Open** entry has **Open shop**; a **Closed** one has **Look inside**, read only: Buy, Sell and the Bank form are off with "Ask the GM to open this". With nothing shared: "Your GM hasn't shared a merchant list."
- Browsing a list never lets anyone buy, sell or use a service, also in the API and on the GM client: only an Open (presented) entry does.
- Stored on the GM Data journal's lists page (`audience: {mode: 'hidden' | 'party' | 'users', userIds}`; `visible` is kept for older readers). A shared list is one page in the Player View journal readable by its players only, holding only the player view of its entries (no hidden items, cost, GM notes or unknown service types).
- Saved data (0.25.0): on load the GM client writes `audience` on lists saved before it (*Show to players* on → whole party, off → hidden). It runs again safely and writes nothing once done.
- API (`api.shops.merchants`, GM only): `list()`, `get(id)`, `save(list)` (no id: a new `MLIST-*` list; `audience` optional, else it keeps who it is shared with), `setAudience(id, {mode, userIds})`, `setVisible(id, bool)` (true = whole party, false = hidden), `entries(id)` → `[{id, name, kind, open, presented, canOpen, reason}]`, `setOpen(id, entryId, bool)`, `setAllOpen(id, bool)` → `{changed, skipped}`, `delete(id, {confirm: true})`; player or GM `api.shops.browse()` → the lists shared with you.

## Services: Bank (deprecated)

- 0.25.0: the Bank is deprecated. Players change coins in Party Inventory → **Party Fund** without a service. Existing and imported Banks keep working (exchange only) and their logs are kept; the editor and the import preview say it is deprecated.
- **New service** (Shops toolbar) opens the editor with the shop fields, a **Service type** select and that type's settings instead of items and coins. The only type is **Bank**, with **Fee (%)**: 0 to 50, default 0 (none). Services are listed with the shops (with their type), and **Present…**, **Stop showing**, **Duplicate** and **Delete service** work as for shops.
- Players it is shown to get the Bank in its own window: **Whose coins** (their character or the party purse; no vote needed), **Change from**, **Into**, **How many to get**, then a preview (You give, You get, before → after) and **Confirm exchange**. Refusals are shown in red and end "No coins changed."
- Standard rates, exact: 1 pp = 10 gp = 100 sp = 1000 cp. You say how many coins you want to get: 25 sp from gold is refused with "Ask for a multiple of 10 sp". The fee is taken in the coin you give, rounded up, on top (2 gp from silver at 10 % costs 20 sp + 2 sp). Electrum only while *Use electrum* is on. The bank has unlimited coins.
- The GM client checks it again on fresh coins and makes one coin update with both coins (all or nothing by itself). Every exchange is in Party Inventory → History (players see their own and the party purse's).
- **Log** (GM only, in the bank's editor): every exchange at that bank, newest first: who, whose coins, from → to, the fee, and when. The last 200 are kept, on the bank's page in the GM Data journal; players can't read it and `services.log(id)` refuses them.
- A service whose type this Utilities version doesn't know (from a later version) is kept as it is, listed for the GM as "Unknown service type", and never shown to players.
- API (`api.shops.services`): GM only `list()`, `get(id)`, `create(data)`, `save(record)`, `duplicate(id)`, `delete(id, {confirm: true})`, `types()`, `log(id)` (the bank's log, oldest first); player or GM `quote({serviceId, payFrom: 'actor' | 'purse', actorId, from, to, receive, rev})` and `use({...same})` → the receipt text. `present` / `stopShowing` take a service id too.

## Chat cards for purchases, sales, exchanges and the purse

- Each purchase, sale, bank or Party Fund exchange, and each purse deposit or take posts a card in chat, whispered to the player who made it and to the GM (never public): who, which character, the item ×quantity (or the coins given and got, with any fee), the total as the shop shows it, and the shop or bank name.
- The card is posted after the change is done. If chat fails, the purchase, sale or exchange still stands; Utilities only writes a warning to the console.

## Shops: import and export

- **Shops → Import JSON** (GM): pick an `ag-foundry-import/0.2` file. It reads the `Shop`, `Service` and `MerchantList` records (field rules: `docs/shop-schema.md` in the repo) and shows a preview first: each record with **Create**, **Update**, **Kept** or **Skipped** and the reason, and any item lines it couldn't find. **Update shops that already exist** (off by default) switches between keeping and updating existing ids. **Import N** imports; **Cancel** writes nothing.
- Items: each line names an Item by its permanent id (`item_id`, the id General Manager gives it), or by `item_uuid` (a compendium Item). Import the file's Items first with General Manager. A line whose item isn't found is skipped and reported; the rest of the shop imports.
- Existing id, Update off: kept as it is. Update on: name, merchant, flavour and items come from the file (a service: its settings; a list: its name and entries). Stock left, items you added by hand, items bought from players, the merchant's coins now, the linked location, GM notes, who it is shown to, the sales log and whether a list is shown all stay.
- New records: `purse` is the starting cash (left out: unlimited cash); merchant lists start hidden; nothing is shown to players. A deleted id is never reused (refused). Prices in ep are refused while *Use electrum* is off.
- **Export** writes every shop, service and merchant list as one file that Import JSON reads back (definitions only: starting stock and starting cash, never stock left, sales or who it is shown to).
- API (`api.shops`, added, GM only): `importShops(records | package, {mode: 'create' | 'update'})` → `[{id, type, name, result: 'created' | 'updated' | 'kept' | 'skipped', reason?, lines?: {imported, skipped: [{ref, reason}]}, notes}]`, `previewImport(...same)` (nothing written), `exportShops(ids?)` → the package.

## Public API

`game.modules.get('ashen-gate-utilities').api`: `open`, `playerAccess` (`ag-player-access/1`), `conditions` (`isUnlocked`, `setUnlocked`, `canRemove`, `remove`, `canApply`, `apply`, `ownersManage`, `setOwnersManage`, `isController`, `controllers`, `setController`, `openOverlay`) and `stash` (`isEnabled`, `setEnabled`, `isVoteRequired`, `setVoteRequired`, `history`, `clearHistory`, `open`, `deposit`, `withdraw`, `listItems`), `embed` (`mount`), `rolls` (`open`, GM only), `currency` (`electrumEnabled`, `coins`, `setElectrumEnabled`), `purse` (`totals`, `deposit`, `take`, `adjust`, `undo`, `convertElectrum`, `undoConvert`, `exchange`, `quoteExchange`, `exchangeFee`, …), plus GM-only `awardGold({amount, mode, actorIds, reason, public})` and `undoGoldAward(entryId)` (also as `gold`).

### `currency` (0.13.2)

Whether this world uses electrum, so partner modules (Character Hub, the future Shopping feature) can show the same coins as Utilities. Feature-detect it; an older Utilities has no `currency`.

```js
const cur = game.modules.get('ashen-gate-utilities')?.api?.currency;
const useEp = cur?.electrumEnabled?.() ?? true;   // older Utilities: assume dnd5e's five coins
const coins = cur?.coins?.() ?? ['cp', 'sp', 'ep', 'gp', 'pp'];  // ['cp','sp','gp','pp'] while electrum is off
Hooks.on('ashen-gate-utilities.electrumChanged', on => { /* re-render */ });
```

- `electrumEnabled()`: the GM Setup *Use electrum* setting (world, default `false`). Anyone can read it.
- `coins()`: the coins to offer in a choice. While it is off, still show an existing ep balance rather than hiding money.
- `setElectrumEnabled(bool)`: GM only (`GM only.`).
- `contract`: `'ag-utilities-currency/1'`; `hook`: the hook name above, called with the new value.
- Related, GM only: `purse.convertElectrum({to: 'sp' | 'gp', reason})` converts all the purse's ep (value kept exactly) and returns the History entry; `purse.undoConvert(entryId)`; `purse.openConvert()` opens the dialog with the preview.

### `purse.exchange(request)` (0.25.0, Party Fund)

```js
const purse = game.modules.get('ashen-gate-utilities')?.api?.purse;
purse.quoteExchange({payFrom: 'actor', actorId, from: 'cp', to: 'gp', receive: 2}); // {ok, give, fee, total, fromAfter, toAfter, …} or {ok: false, reason}
await purse.exchange({payFrom: 'purse', from: 'gp', to: 'sp', receive: 10});      // the receipt text; a player's request runs on the GM client
purse.exchangeFee();                                                               // GM Setup fee, 0–50 (0 = none)
```

- Player or GM; same gate as the stash (Player Access and the stash on for players). `payFrom: 'actor'` needs a character you own; `'purse'` needs no vote. Refusals end "No coins changed."

### `rolls.open(request)` (0.13.0, GM only)

Opens Utilities on the **Rolls** tab with the *Start Rolls* form filled in. It starts nothing: the GM reviews or changes the form and clicks **Start Rolls**.

```js
const rolls = game.modules.get('ashen-gate-utilities')?.api?.rolls;
if (game.user.isGM && rolls?.open) {
  await rolls.open({skills: ['sur'], mode: 'group', dc: 15, actorIds: ['<actorId>'], title: 'Foraging'});
  // → {app, prefill: {mode, skills, dc, actorIds, title}, busy}
}
```

- `skills`: dnd5e skill ids (`rolls.skills` lists them: `acr` … `sur`). Unknown ids are dropped; at least one must remain. *Individual rolls* keeps the first only.
- `mode`: `'group'` (*Group result*) or `'individual'` (*Individual rolls*); anything else throws.
- `dc` (optional): whole number 0–100; omitted → the form's usual 15; `null` → no DC.
- `actorIds` (optional): character Actor ids to tick; ids that are not characters are dropped. Omitted → the usual party default.
- `title` (optional, up to 120 characters).
- `busy` is true when a roll is already running; the tab then shows that roll and the form waits until it ends.
- **Permission:** GM only, rejected in the API (`GM only.`), not just hidden.

### `stash.listItems()` (0.11.0)

Read-only list of the party stash's items, for partner modules such as Character Hub. `purse.totals()` gives the coins.

```js
game.modules.get('ashen-gate-utilities').api.stash.listItems()
// → [{id, uuid, img, name, quantity, weight: '2 lb' | '—', value: '5 gp' | '—', type: 'loot', typeLabel: 'Loot'}, ...]
```

- One row per Item on the stash Actor, sorted by type label, then name. Weight and value are per item, as shown in the stash tab.
- No stash Actor yet, or an empty stash → `[]`.
- **Permission:** the GM always. Players see the same items as the stash tab: they get an error while Utilities Player Access is off (`Utilities access is hidden by the GM.`) or the GM has turned the stash off for players (`The GM has turned the party stash off.`). Listing never moves anything; taking an item out still follows the take-out vote (`stash.isVoteRequired()`).

### `embed.mount(element, options)` (0.12.0)

Shows the party stash (purse strip and Items list; in the Utilities window the purse is in Party Inventory → Party Fund) inside another module's window, for example Character Hub's Inventory → Party stash. Utilities draws it and handles its buttons; the caller only provides an element.

```js
const api = game.modules.get('ashen-gate-utilities')?.api;
if (api?.embed?.mount) {
  const view = api.embed.mount(element, {actorId: actor.id, mode: 'stash'});
  // later: view.refresh();  view.unmount();
}
```

- `element`: a DOM element the caller owns. Utilities replaces its contents and adds the classes `ag-utilities agu-embed` (so its styles apply).
- `options.actorId` (optional): the character preselected for Take and for coin Deposit/Take, when this user may use it (GM: any character; player: a character they own). Otherwise the first allowed character.
- `options.mode`: `'stash'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. `unmount` removes the listeners and empties the element. It refreshes itself when stash items, the purse or the stash settings change, and unmounts itself if the element has left the page.
- Works in the embed: search, open an item sheet, **Take** into a character, drag a row onto a sheet, drop an item onto the embed to stash it, purse **Deposit** / **Take**, and the GM's **Adjust Purse**. Not in the embed: stash History, Award Gold, turning the stash on or off (use the Utilities window).
- **Permission:** the same as the Utilities window, checked when drawing and again by every action: the GM always; players see "Utilities is hidden by the GM." while Player Access is off and "The GM has turned the party stash off." while the stash is off. Take-outs keep the party vote. Players never get GM-only controls.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-utilities/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-utilities-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
