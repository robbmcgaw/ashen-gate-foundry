# Ashen Gate | Utilities

Module ID `ashen-gate-utilities` · Foundry V14 · dnd5e. Table utilities for the party: group checks and roll requests (one Rolls tab), RollTable sharing, a shared conditions view and a shared party stash. It works on its own; General Manager and the other Ashen Gate modules are not needed.

Open it from **Actors sidebar → Utilities**. The GM always sees it; players see it once **GM Setup → Player Access** is on.

## Tabs

- **Rolls:** the GM picks characters (the dnd5e Primary Party is ticked by default), skills and an optional DC, and chooses how the result works:
  - **Group result** (a Group Check): characters choose from the ticked skills, optionally several rolls each; the average of accepted totals is compared with the DC for one Success or Failure. The tally is whispered to the GM.
  - **Individual rolls** (a Roll Request): each character makes one roll of the one ticked skill; each result is shown on its own (Success/Failure per roll when a DC is set).

  Eligible connected players are prompted and roll from the compact player view (**Roll Now**, with advantage/disadvantage). Only one roll can run at a time. **End & Record** closes an incomplete one and records the remaining slots as Skipped; **Cancel Session** files it as cancelled.
- **Party Inventory:** one shared stash (a Utilities-flagged NPC Actor). Drop an item from any character sheet onto the tab to stash it; drag a row onto a character sheet to take it out. Taking an item out needs every other connected player to accept (GM can turn the vote off; the GM is never asked; 60 second timeout). A container (backpack, pouch…) moves with everything inside it, nested containers included; the move is all or nothing. An Items / History sub-tab lists contents and movements. The GM turns the stash on or off for players.
- **Party purse:** the five dnd5e coin totals (`system.currency` cp/sp/ep/gp/pp) held by the stash Actor, at the top of Party Inventory → Items. Players Deposit from / Take to their own characters (Take uses the separate GM Setup setting *Party must accept when a player takes coins out*; until the GM saves it, it follows the item vote; the GM sees "Coin vote: on/off" by the purse); the GM can Add / Remove / Set any coin with a reason. Every change is logged in stash History; the GM can Undo adjustments and takes. No automatic currency conversion.
- **Use electrum (GM Setup, default off):** off leaves electrum (ep) out of the purse, Award Gold, coin Deposit/Take/Adjust and the embedded stash; ep moves and awards are refused. If the purse still holds ep it stays visible (dimmed) with a note, and the GM can **Convert electrum to silver/gold** (1 ep = 5 sp; 2 ep = 1 gp, an odd one → 5 sp) after an exact preview; the conversion is logged in History with Undo. The purse still stores ep, and character sheets are not changed.
- **Award Gold (GM):** pay coins (gp by default, or cp/sp/pp, and ep while electrum is on) to ticked characters (each, or split evenly in whole coins; a remainder is not handed out). Writes only `system.currency.<coin>`, posts a chat card and logs to stash History, where the GM can Undo it for anyone who still has the gold.
- **Roll Tables:** draws a native RollTable and shows the result with an editable preview, whisper to chosen players, and Auto-Send. Document results are sent as `@UUID` links.
- **Conditions:** one party view of native conditions. Removal is locked per character; the GM unlocks a character so its owner can remove that character's native conditions. **Pop Out Overlay** opens a transparent per-user conditions window.
- **History** (GM): finished and cancelled rolls, labelled Group Check or Roll Request, with per-character results, average and outcome.
- **GM Setup** (GM): Player Access and other settings.
- **Shops**: GM: see *Shops (GM)* below. Players: **Open shops**, the shops the GM presents to them (see *Shops: presenting and buying*). The tab shows for players while Player Access and *Shops on for players* are both on.

Player actions that change shared state (stash moves, condition removal) are carried out by the active GM client, which re-checks ownership and the lock, so a GM must be logged in for those.

## Shops (GM)

**Utilities → Shops**. The GM has two parts:

- **Shops:** every saved shop, grouped by city (the top of the shop's linked location in Locations; "No location" last), or sorted by name, merchant or recently changed. Search matches the shop name, merchant, place, item names and id. **Edit** opens a shop in the editor; **Duplicate** makes a copy (same items and coins, not shown to anyone).
- **Shop editor:** name, merchant name and art (initials when empty), linked location (Locations active only), flavour text (players will see it), GM notes.
  - **Items for sale:** drop items from a character sheet, the Items sidebar, a compendium or a folder. A container comes with what is inside it. The shop keeps its own copy; the source item is never changed. Price starts at the item's own price (whole copper; an ep price shows in sp while *Use electrum* is off). Stock blank = unlimited. Hidden items and cost are GM only. **Restock** puts stock back to where it started.
  - **Merchant's coins** (off by default; off = unlimited cash): **Add / Remove / Set…** (never below 0, with a reason, logged), **Restock cash** (back to the starting cash), *Show merchant's coins to players* (on by default).
  - **Buys from players** (off by default, 50 %, item types): saved now, used when selling to a shop arrives.
  - **Save Changes** saves; **Cancel** discards. **Delete shop** (Danger zone) asks first and is refused while the shop is shown to players.

Shops are stored in a Journal **Utilities Shops (GM Data)** with no player permission (one page per shop), found by its flag, so renaming it is safe. Don't edit its pages by hand.

API, GM only (`GM only.` for anyone else; the presenting and buying calls are below): `api.shops` (`ag-utilities-shops/1`): `list({search, sort})`, `get(id)`, `create(data)`, `save(record)`, `duplicate(id)`, `delete(id, {confirm: true})`, `addItems(id, uuids | dropData)` → `{added, skipped}`, `restock(id, lineIds?)`, `adjustPurse(id, {op, coin, amount, reason, asStart})`, `setPurse(id, coins | null)`, `restockCash(id)`, `log(id)`.

## Shops: presenting and buying

- **Present…** (a shop row or the editor): *All players* (players who log in later too) or *Chosen players* (ticked, with their characters). **Stop showing** ends it; **Open** shows the shop as players see it. A shop shown to players can't be deleted.
- Players it is shown to get the shop in its own window (and in Shops → **Open shops**): merchant, place (only once revealed in Locations), flavour, the party purse, their character's coins, the merchant's coins (unless hidden: "Change comes from here"), and the wares with stock and price. Hidden items, cost, GM notes and other players' presentations never reach them.
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

## Public API

`game.modules.get('ashen-gate-utilities').api`: `open`, `playerAccess` (`ag-player-access/1`), `conditions` (`isUnlocked`, `setUnlocked`, `canRemove`, `remove`, `openOverlay`) and `stash` (`isEnabled`, `setEnabled`, `isVoteRequired`, `setVoteRequired`, `history`, `clearHistory`, `open`, `deposit`, `withdraw`, `listItems`), `embed` (`mount`), `rolls` (`open`, GM only), `currency` (`electrumEnabled`, `coins`, `setElectrumEnabled`), `purse` (`totals`, `deposit`, `take`, `adjust`, `undo`, `convertElectrum`, `undoConvert`, …), plus GM-only `awardGold({amount, mode, actorIds, reason, public})` and `undoGoldAward(entryId)` (also as `gold`).

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

Shows the party stash (purse strip and Items list, the same as Party Inventory → Items) inside another module's window, for example Character Hub's Inventory → Party stash. Utilities draws it and handles its buttons; the caller only provides an element.

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
